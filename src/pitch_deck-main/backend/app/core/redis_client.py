
import redis as redis_lib
from app.config import settings

redis_client = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)
