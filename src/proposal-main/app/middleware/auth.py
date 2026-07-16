import logging
from fastapi import Request, HTTPException

logger = logging.getLogger(__name__)

DEV_USER = {
    "user_id": "dev-user",
    "user_name": "Dev User",
    "user_email": "dev@example.com",
    "subscription_plan": "pro",
}


def get_current_user(request: Request) -> dict:
    from app.core.config import settings
    if settings.ENVIRONMENT == "development" and not settings.JWT_SECRET:
        return DEV_USER

    if not settings.JWT_SECRET:
        logger.error("JWT_SECRET is not set outside of development — refusing all requests.")
        raise HTTPException(status_code=500, detail="Authentication is not configured")

    token: str | None = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]

    if not token:
        token = request.query_params.get("token")

    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        import jwt
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return {
            "user_id": str(payload.get("user_id") or payload.get("sub") or "unknown"),
            "user_name": payload.get("user_name") or payload.get("name") or "",
            "user_email": payload.get("user_email") or payload.get("email") or "",
            "subscription_plan": payload.get("subscription_plan") or payload.get("plan") or "free",
        }
    except Exception as e:
        logger.warning("JWT decode failed: %s", e)
        raise HTTPException(status_code=401, detail="Invalid or expired token")
