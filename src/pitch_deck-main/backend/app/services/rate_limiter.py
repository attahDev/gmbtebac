
import logging
import time

from fastapi import HTTPException, status

from app.core.redis_client import redis_client
from app.config import settings

logger = logging.getLogger(__name__)


class RateLimitExceeded(HTTPException):
    def __init__(self, retry_after: int):
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many pitch deck requests. Please slow down.",
            headers={"Retry-After": str(retry_after)},
        )


def check_rate_limit(user_id: str) -> None:
    now = int(time.time())
    minute_bucket = now // 60
    hour_bucket = now // 3600

    minute_key = f"ratelimit:pitch_deck:min:{user_id}:{minute_bucket}"
    hour_key = f"ratelimit:pitch_deck:hour:{user_id}:{hour_bucket}"

    try:
        pipe = redis_client.pipeline()
        pipe.incr(minute_key)
        pipe.expire(minute_key, 60)
        pipe.incr(hour_key)
        pipe.expire(hour_key, 3600)
        minute_count, _, hour_count, _ = pipe.execute()
    except Exception as exc:
        logger.error("Rate limiter Redis error, failing open: %s", exc)
        return

    if minute_count > settings.RATE_LIMIT_PER_MINUTE:
        raise RateLimitExceeded(retry_after=60 - (now % 60))

    if hour_count > settings.RATE_LIMIT_PER_HOUR:
        raise RateLimitExceeded(retry_after=3600 - (now % 3600))
