import uuid
import logging
import time
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from jose import jwt, JWTError

from app.core.config import settings

logger = logging.getLogger(__name__)

_ACTIVE_STATUSES = {"active", "trialing"}


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id

        start_time = time.monotonic()
        response = await call_next(request)
        duration_ms = int((time.monotonic() - start_time) * 1000)

        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time-Ms"] = str(duration_ms)

        logger.info(
            f"method={request.method} path={request.url.path} "
            f"status={response.status_code} duration_ms={duration_ms} "
            f"request_id={request_id}"
        )
        return response


class AuthMiddleware(BaseHTTPMiddleware):
    PUBLIC_PATHS = {"/health", "/docs", "/openapi.json", "/redoc"}

    async def dispatch(self, request: Request, call_next) -> Response:

        if request.url.path in self.PUBLIC_PATHS:
            return await call_next(request)

        # Development bypass
        if settings.app_env == "development":
            request.state.user_id = request.headers.get(
                "X-User-ID",
                "a092213e-3d63-4895-b35e-8c76cd9e9119"
            )
            request.state.plan_tier = request.headers.get(
                "X-Plan-Tier",
                "founder_pro"
            )
            request.state.subscription_status = "active"

            return await call_next(request)

        # Production JWT authentication
        authorization = request.headers.get("Authorization")

        if not authorization or not authorization.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={
                    "success": False,
                    "error": {
                        "code": "UNAUTHENTICATED",
                        "message": "Missing bearer token",
                    },
                },
            )

        token = authorization.split(" ")[1]

        try:
            from jose import jwt, JWTError

            payload = jwt.decode(
                token,
                settings.jwt_secret,
                algorithms=["HS256"],
            )

            user_id = payload.get("sub")

            if not user_id:
                raise JWTError()

        except Exception as e:
            logger.error(f"JWT validation failed: {e}")

            return JSONResponse(
                status_code=401,
                content={
                    "success": False,
                    "error": {
                        "code": "INVALID_TOKEN",
                        "message": "Invalid authentication token",
                    },
                },
            )

        request.state.user_id = user_id
        request.state.plan_tier = "explorer"
        request.state.subscription_status = "active"

        return await call_next(request)
