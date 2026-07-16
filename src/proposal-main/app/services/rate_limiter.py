import logging
import time

from app.core.config import settings
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

SERVICE_KEY = "proposal-builder"


class RateLimitExceeded(Exception):
    def __init__(self, retry_after: int, scope: str):
        self.retry_after = retry_after
        self.scope = scope
        super().__init__(f"Rate limit exceeded ({scope}), retry after {retry_after}s")


async def _check_window(user_id: str, window_label: str, window_seconds: int, limit: int) -> tuple[bool, int]:
    r = get_redis()
    bucket = int(time.time() // window_seconds)
    key = f"ratelimit:{SERVICE_KEY}:{user_id}:{window_label}:{bucket}"

    count = await r.incr(key)
    if count == 1:
        await r.expire(key, window_seconds)

    if count > limit:
        ttl = await r.ttl(key)
        return False, max(ttl, 1)
    return True, 0


async def enforce_rate_limit(user_id: str) -> None:
    try:
        allowed, retry_after = await _check_window(
            user_id, "min", 60, settings.RATE_LIMIT_PER_MINUTE
        )
        if not allowed:
            raise RateLimitExceeded(retry_after, "per-minute")

        allowed, retry_after = await _check_window(
            user_id, "hour", 3600, settings.RATE_LIMIT_PER_HOUR
        )
        if not allowed:
            raise RateLimitExceeded(retry_after, "per-hour")

    except RateLimitExceeded:
        raise
    except Exception as e:
        logger.error("Rate limiter unavailable, failing open: %s", e)
        return
