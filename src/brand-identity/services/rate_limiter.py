"""
Redis fixed-window burst rate limiter.

Two windows per user: per-minute and per-hour.
Keys are scoped to this service so they don't share counters with
the proposal-builder or any other microservice.

Fails OPEN — if Redis is unavailable the request is allowed through.
A limiter outage should never block legitimate generation; cost spikes
from a Redis outage are recoverable, blocked paying users are not.
"""
import logging
from core.redis import get_redis
from core.config import settings

logger = logging.getLogger(__name__)

_SERVICE_PREFIX = "brand_identity"


async def check_rate_limit(user_id: str) -> tuple[bool, int]:
    """
    Returns (allowed: bool, retry_after_seconds: int).

    retry_after_seconds is 0 when allowed is True.
    """
    try:
        redis = await get_redis()

        minute_key = f"rl:{_SERVICE_PREFIX}:{user_id}:min"
        hour_key   = f"rl:{_SERVICE_PREFIX}:{user_id}:hr"

        pipe = redis.pipeline()
        pipe.incr(minute_key)
        pipe.expire(minute_key, 60, nx=True)
        pipe.incr(hour_key)
        pipe.expire(hour_key, 3600, nx=True)
        results = await pipe.execute()

        minute_count = results[0]
        hour_count   = results[2]

        if minute_count > settings.RATE_LIMIT_PER_MINUTE:
            logger.warning(
                "Rate limit hit (per-minute) for user %s: count=%d limit=%d",
                user_id, minute_count, settings.RATE_LIMIT_PER_MINUTE,
            )
            return False, 60

        if hour_count > settings.RATE_LIMIT_PER_HOUR:
            logger.warning(
                "Rate limit hit (per-hour) for user %s: count=%d limit=%d",
                user_id, hour_count, settings.RATE_LIMIT_PER_HOUR,
            )
            return False, 3600

        return True, 0

    except Exception as exc:
        # Fail open — log but allow the request through.
        logger.error("Rate limiter Redis error (failing open): %s", exc)
        return True, 0
