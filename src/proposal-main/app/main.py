from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import logging

from app.core.config import settings
from app.routers import proposals

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Proposal Builder",
    description="NL prompt → structured business proposal → PDF/DOCX",
    version="2.0.0",
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT == "development" else None,
    openapi_url="/openapi.json" if settings.ENVIRONMENT == "development" else None,
)
_origins = settings.allowed_origins_list
if not _origins and settings.ENVIRONMENT == "development":
    _origins = ["http://localhost:3000", "http://localhost:5173"]


print("CORS:", settings.allowed_origins_list)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://gmbtefro-pfst.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(proposals.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

ui_dir = Path(__file__).parent.parent / "ui"
app.mount("/", StaticFiles(directory=str(ui_dir), html=True), name="ui")
app.include_router(proposals.router)
