
import re
import uuid
import asyncio
import logging
from fastapi import UploadFile, HTTPException, status
import boto3
from botocore.config import Config
from core.config import settings

logger = logging.getLogger(__name__)

ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/svg+xml"}
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
MAX_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024

# Valid image context keys — controls the S3 folder and prevents arbitrary paths
IMAGE_CONTEXTS = {
    "photo",          # email signature headshot / team member photo
    "cover",          # company profile cover/hero image
    "operations",     # capability statement operations photo
    "facility",       # company profile facility images
    "portfolio",      # company profile portfolio images
    "certification",  # capability statement certification badges
    "photography",    # brand guidelines photography examples
}

SVG_DANGEROUS_TAGS = re.compile(
    r"<(script|foreignObject|iframe|object|embed|use|animate)[^>]*>.*?</\1>|"
    r"<(script|foreignObject|iframe|object|embed)[^>]*/?>",
    re.IGNORECASE | re.DOTALL,
)
SVG_EVENT_HANDLERS = re.compile(r'\bon\w+\s*=', re.IGNORECASE)


class UploadService:

    def __init__(self):
        self._s3 = boto3.client(
            "s3",
            endpoint_url=settings.STORAGE_ENDPOINT_URL or None,
            aws_access_key_id=settings.STORAGE_ACCESS_KEY,
            aws_secret_access_key=settings.STORAGE_SECRET_KEY,
            config=Config(signature_version="s3v4"),
        )

    async def upload_logo(self, file: UploadFile, user_id: str) -> str:
        if file.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file type '{file.content_type}'. Allowed: PNG, JPG, SVG.",
            )

        contents = await file.read()
        if len(contents) > MAX_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File too large. Maximum size is {settings.MAX_UPLOAD_SIZE_MB}MB.",
            )

        if file.content_type == "image/svg+xml":
            contents = self._sanitise_svg(contents)

        ext = self._extension(file.content_type)
        key = f"logos/{user_id}/{uuid.uuid4().hex}{ext}"

        try:
            await asyncio.to_thread(
                self._s3.put_object,
                Bucket=settings.STORAGE_BUCKET,
                Key=key,
                Body=contents,
                ContentType=file.content_type,
            )
        except Exception as e:
            logger.error(f"Storage upload failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="File upload failed. Please try again.",
            )

        return f"{settings.STORAGE_PUBLIC_URL}/{key}"

    async def upload_image(self, file: UploadFile, user_id: str, context: str) -> str:
        """
        Upload a general-purpose image (photo, cover, facility, portfolio, etc.).
        context must be one of IMAGE_CONTEXTS — it determines the S3 folder.
        SVG is not accepted here since these are always raster photos/graphics.
        """
        if context not in IMAGE_CONTEXTS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid context '{context}'. Must be one of: {sorted(IMAGE_CONTEXTS)}.",
            )

        if file.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file type '{file.content_type}'. Allowed: PNG, JPG, WebP.",
            )

        contents = await file.read()
        if len(contents) > MAX_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File too large. Maximum size is {settings.MAX_UPLOAD_SIZE_MB}MB.",
            )

        ext = self._extension(file.content_type)
        key = f"images/{user_id}/{context}/{uuid.uuid4().hex}{ext}"

        try:
            await asyncio.to_thread(
                self._s3.put_object,
                Bucket=settings.STORAGE_BUCKET,
                Key=key,
                Body=contents,
                ContentType=file.content_type,
            )
        except Exception as e:
            logger.error(f"Storage upload failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="File upload failed. Please try again.",
            )

        return f"{settings.STORAGE_PUBLIC_URL}/{key}"

    async def upload_generated_file(
        self,
        content: bytes,
        content_type: str,
        asset_type: str,
        user_id: str,
        variant: str = "",
    ) -> str:
        ext = self._extension(content_type)
        suffix = f"_{variant}" if variant else ""
        key = f"generated/{user_id}/{asset_type}/{uuid.uuid4().hex}{suffix}{ext}"
        try:
            await asyncio.to_thread(
                self._s3.put_object,
                Bucket=settings.STORAGE_BUCKET,
                Key=key,
                Body=content,
                ContentType=content_type,
            )
        except Exception as e:
            logger.error(f"Generated file upload failed: {e}")
            raise RuntimeError(f"Failed to store generated file: {e}")

        return f"{settings.STORAGE_PUBLIC_URL}/{key}"

    def _sanitise_svg(self, contents: bytes) -> bytes:
        text = contents.decode("utf-8", errors="replace")
        text = SVG_DANGEROUS_TAGS.sub("", text)
        text = SVG_EVENT_HANDLERS.sub("data-removed=", text)
        return text.encode("utf-8")

    def _extension(self, content_type: str) -> str:
        mapping = {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/jpg": ".jpg",
            "image/svg+xml": ".svg",
            "image/webp": ".webp",
            "application/pdf": ".pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
        }
        return mapping.get(content_type, ".bin")


upload_service = UploadService()