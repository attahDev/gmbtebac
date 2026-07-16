import uuid
import os
import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, CurrentUser
from app.models.pitch_deck import PitchDeck, DeckStatus, InputType, ThemeType
from app.schemas.pitch_deck import (
    GenerateRequest, QuickInput, StructuredInput, RawInput,
    DeckResponse, JobStatusResponse, HistoryResponse,
    ExportRequest, ThemesResponse, ThemePreview,
)
from app.workers.deck_worker import process_deck_job, get_job_status
from app.services.pptx_service import build_pptx, THEME_PREVIEWS
from app.services.image_service import download_image_from_url
from app.services.rate_limiter import check_rate_limit
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

INPUT_VALIDATORS = {
    InputType.quick: QuickInput,
    InputType.structured: StructuredInput,
    InputType.raw: RawInput,
}

@router.get("/themes", response_model=ThemesResponse)
def get_themes():
    return ThemesResponse(themes=[ThemePreview(**t) for t in THEME_PREVIEWS])

@router.post("/generate", response_model=JobStatusResponse, status_code=status.HTTP_202_ACCEPTED)
def generate_deck(
    request: GenerateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    check_rate_limit(current_user.user_id)

    validator = INPUT_VALIDATORS.get(request.input_type)
    if not validator:
        raise HTTPException(status_code=400, detail="Invalid input_type")

    try:
        validated_data = validator(**request.data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid input data: {e}")

    deck = PitchDeck(
        user_id=current_user.user_id,
        title=validated_data.title,
        input_type=request.input_type,
        raw_input=str(request.data),
        theme=request.theme,
        status=DeckStatus.pending,
    )
    db.add(deck)
    db.commit()
    db.refresh(deck)

    job_id = str(uuid.uuid4())
    background_tasks.add_task(
        process_deck_job,
        job_id=job_id,
        deck_id=str(deck.id),
        user_id=current_user.user_id,
        input_type=request.input_type.value,
        data=validated_data.model_dump(),
        db=db,
        theme=request.theme.value,
    )

    logger.info(
        f"Deck generation queued: job_id={job_id}, deck_id={deck.id}, user={current_user.user_id}"
    )
    return JobStatusResponse(job_id=job_id, deck_id=str(deck.id),
                             status=DeckStatus.pending, message="Deck generation started")

@router.post("/export")
def export_deck(
    request: ExportRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    check_rate_limit(current_user.user_id)

    deck = db.query(PitchDeck).filter(PitchDeck.id == request.deck_id).first()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    if deck.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    base = deck.slides_json or {}
    slides_map = {s["slide_number"]: s for s in base.get("slides", [])}

    slide_images = {}
    for edit in request.slides:
        num = edit.slide_number
        if num in slides_map:
            if edit.title is not None:
                slides_map[num]["title"] = edit.title
            if edit.heading is not None:
                slides_map[num]["heading"] = edit.heading
            if edit.subheading is not None:
                slides_map[num]["subheading"] = edit.subheading
            if edit.bullets is not None:
                slides_map[num]["bullets"] = edit.bullets
        if edit.image:
            img_path = download_image_from_url(edit.image.url)
            if img_path:
                slide_images[num] = img_path

    ordered_slides = []
    for edit in request.slides:
        if edit.slide_number in slides_map:
            ordered_slides.append(slides_map[edit.slide_number])

    edited_data = {
        "company_name": request.company_name or base.get("company_name", "Company"),
        "tagline": request.tagline or base.get("tagline", ""),
        "slides": ordered_slides,
    }

    export_deck_id = f"{request.deck_id}_export"
    file_path = build_pptx(
        slides_data=edited_data,
        deck_id=export_deck_id,
        theme_name=request.theme.value,
        slide_images=slide_images,
    )

    deck.file_path = file_path
    deck.theme = request.theme
    deck.slides_json = edited_data
    db.commit()

    if not os.path.exists(file_path):
        raise HTTPException(status_code=500, detail="Export failed — file was not created")

    title = edited_data["company_name"].replace(" ", "_")
    return FileResponse(
        path=file_path,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=f"{title}_pitch_deck.pptx",
    )

@router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
):
    allowed = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, and WebP images allowed")

    os.makedirs("media/uploads", exist_ok=True)
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
    filename = f"{uuid.uuid4()}.{ext}"
    path = os.path.join("media/uploads", filename)

    content = await file.read()
    with open(path, "wb") as f:
        f.write(content)

    return {"path": path, "filename": filename}

@router.get("/status/{job_id}", response_model=JobStatusResponse)
def get_status(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    job = get_job_status(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    deck_id = job.get("deck_id")
    deck = db.query(PitchDeck).filter(PitchDeck.id == deck_id).first()

    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")

    if deck.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return JobStatusResponse(
        job_id=job_id,
        deck_id=str(deck.id),
        status=job.get("status", "pending"),
        message=job.get("message"),
    )



@router.get("/history", response_model=HistoryResponse)
def get_history(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
    skip: int = 0, limit: int = 20,
):
    query = (db.query(PitchDeck)
             .filter(PitchDeck.user_id == current_user.user_id)
             .order_by(PitchDeck.created_at.desc()))
    total = query.count()
    decks = query.offset(skip).limit(limit).all()
    return HistoryResponse(decks=decks, total=total)

@router.get("/{deck_id}", response_model=DeckResponse)
def get_deck(deck_id: str, db: Session = Depends(get_db),
             current_user: CurrentUser = Depends(get_current_user)):
    deck = db.query(PitchDeck).filter(PitchDeck.id == deck_id).first()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    if deck.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return deck

@router.get("/{deck_id}/download")
def download_deck(deck_id: str, db: Session = Depends(get_db),
                  current_user: CurrentUser = Depends(get_current_user)):
    deck = db.query(PitchDeck).filter(PitchDeck.id == deck_id).first()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    if deck.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    if deck.status != DeckStatus.done:
        raise HTTPException(status_code=400, detail=f"Deck not ready. Status: {deck.status}")
    if not deck.file_path or not os.path.exists(deck.file_path):
        if not deck.slides_json:
            raise HTTPException(
                status_code=410,
                detail="Deck data not found. Please regenerate.",
            )
        logger.info("PPTX missing for deck %s — rebuilding from slides_json", deck_id)
        deck.file_path = build_pptx(
            slides_data=deck.slides_json,
            deck_id=str(deck.id),
            theme_name=deck.theme.value,
        )
        db.commit()

    filename = f"{deck.title.replace(' ', '_')}.pptx"
    return FileResponse(
        path=deck.file_path,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=filename,
    )

@router.delete("/{deck_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_deck(deck_id: str, db: Session = Depends(get_db),
                current_user: CurrentUser = Depends(get_current_user)):
    deck = db.query(PitchDeck).filter(PitchDeck.id == deck_id).first()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    if deck.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    if deck.file_path and os.path.exists(deck.file_path):
        os.remove(deck.file_path)
    db.delete(deck)
    db.commit()
