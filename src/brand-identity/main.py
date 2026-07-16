import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from core.config import settings
from core.database import engine, Base
from core.redis import close_redis
from routers import assets, themes
from jobs.worker import run_worker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s — %(name)s — %(levelname)s — %(message)s",
)
logger = logging.getLogger(__name__)


def _validate_production_config() -> None:
    """Fail fast on obviously unsafe production configuration."""
    if settings.ENVIRONMENT != "production":
        return
    unsafe_secrets = ("", "change_me_to_a_long_random_secret")
    if settings.JWT_SECRET in unsafe_secrets:
        raise RuntimeError(
            "JWT_SECRET must be set to a strong random value in production. "
            "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    if not settings.ALLOWED_ORIGINS:
        raise RuntimeError(
            "ALLOWED_ORIGINS must be set to an explicit list of origins in production. "
            "Example: https://app.gmbte.com,https://brand.gmbte.com"
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _validate_production_config()
    logger.info("Brand Identity Service starting up...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables ready.")

    worker_task = asyncio.create_task(run_worker())
    logger.info("In-process queue worker started.")

    def _on_worker_done(task: asyncio.Task) -> None:
        if task.cancelled():
            logger.warning("Brand identity worker was cancelled.")
        elif task.exception():
            logger.critical(
                "Brand identity worker CRASHED — no jobs will be processed until restart: %s",
                task.exception(),
                exc_info=task.exception(),
            )

    worker_task.add_done_callback(_on_worker_done)

    yield

    logger.info("Shutting down...")
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass
    await close_redis()
    await engine.dispose()


_is_dev = settings.ENVIRONMENT == "development"

app = FastAPI(
    title="Brand Identity Builder",
    description="GMBTE module — generates logos, business cards, documents, and brand assets.",
    version="1.0.0",
    lifespan=lifespan,
    # Disable interactive docs outside development — they expose the full API
    # surface and internal schema to anyone with a browser.
    docs_url="/docs" if _is_dev else None,
    redoc_url="/redoc" if _is_dev else None,
    openapi_url="/openapi.json" if _is_dev else None,
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        "Unhandled exception on %s %s", request.method, request.url.path, exc_info=exc
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal error occurred. Please try again."},
    )


_allowed_origins: list[str] = (
    settings.ALLOWED_ORIGINS
    if settings.ALLOWED_ORIGINS
    else (["*"] if _is_dev else [])
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assets.router)
app.include_router(themes.router)

from pathlib import Path

STATIC_DIR = Path("static")
STATIC_DIR.mkdir(parents=True, exist_ok=True)

app.mount(
    "/ui",
    StaticFiles(directory=STATIC_DIR, html=True),
    name="ui",
)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "brand-identity-builder"}
