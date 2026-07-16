import json
import logging
from sqlalchemy.orm import Session

import redis as redis_lib

from app.config import settings
from app.models.pitch_deck import PitchDeck, DeckStatus
from app.services.groq_service import generate_slides
from app.services.pptx_service import build_pptx
from app.services.image_service import fetch_slide_images

logger = logging.getLogger(__name__)
redis_client = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)
JOB_TTL = 60 * 60


def set_job_status(job_id, status, deck_id=None, message=None):
    payload = {"status": status}
    if deck_id:
        payload["deck_id"] = deck_id
    if message:
        payload["message"] = message
    redis_client.setex(f"job:{job_id}", JOB_TTL, json.dumps(payload))


def get_job_status(job_id) -> dict | None:
    raw = redis_client.get(f"job:{job_id}")
    return json.loads(raw) if raw else None


def process_deck_job(job_id: str, deck_id: str, user_id: str,
                     input_type: str, data: dict, db: Session, theme: str = "gmbte"):
    logger.info(f"[Worker] Starting job {job_id} for deck {deck_id}")

    deck: PitchDeck = db.query(PitchDeck).filter(PitchDeck.id == deck_id).first()
    if not deck:
        set_job_status(job_id, "failed", message="Deck record not found")
        return

    deck.status = DeckStatus.processing
    db.commit()
    set_job_status(job_id, "processing", deck_id=str(deck_id))

    try:
        # Step 1 — Generate slides via Groq
        logger.info(f"[Worker] Calling Groq for job {job_id}")
        slides_json = generate_slides(input_type=input_type, data=data)

        # Step 2 — Fetch images from Unsplash
        logger.info(f"[Worker] Fetching images for job {job_id}")
        keywords = f"{data.get('title', '')} {data.get('idea', '')}"
        slide_images = fetch_slide_images(slides_json.get("slides", []), keywords)

        # Step 3 — Build PPTX
        logger.info(f"[Worker] Building PPTX for job {job_id}")
        file_path = build_pptx(
            slides_data=slides_json,
            deck_id=str(deck_id),
            theme_name=theme,
            slide_images=slide_images,
        )

        # Step 4 — Persist
        deck.slides_json = slides_json
        deck.file_path = file_path
        deck.status = DeckStatus.done
        db.commit()

        set_job_status(job_id, "done", deck_id=str(deck_id))
        logger.info(f"[Worker] Job {job_id} completed successfully")

    except Exception as e:
        logger.error(f"[Worker] Job {job_id} failed: {e}")
        deck.status = DeckStatus.failed
        deck.error_message = str(e)
        db.commit()

        set_job_status(job_id, "failed", deck_id=str(deck_id), message=str(e))
    finally:
        db.close()
