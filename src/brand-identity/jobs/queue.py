

import json
import logging
from core.redis import get_redis

logger = logging.getLogger(__name__)

QUEUE_KEY = "brand_identity:jobs"


async def enqueue_job(
    job_id: str,
    asset_id: str,
    asset_type: str,
    inputs: dict,
    user_id: str,
) -> None:
    redis = await get_redis()
    payload = json.dumps({
        "job_id": job_id,
        "asset_id": asset_id,
        "asset_type": asset_type,
        "inputs": inputs,
        "user_id": user_id,
    })
    await redis.rpush(QUEUE_KEY, payload)
    logger.info(f"Enqueued job {job_id} for asset_type={asset_type}")