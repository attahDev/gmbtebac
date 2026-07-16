import uuid
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from core.config import settings
from core.database import get_db
from core.security import get_current_user
from models.asset import GeneratedAsset, AssetType, JobStatus
from schemas.assets import (
    GenerateResponse, AssetStatusResponse, AssetListItem, EditPreFillResponse,
    LogoInput, BusinessCardInput, LetterheadInput, EmailSignatureInput,
    InvoiceInput, QuotationInput, CompanyProfileInput,
    CapabilityStatementInput, BrandGuidelinesInput,
)
from jobs.queue import enqueue_job
from services.upload_service import upload_service
from services.rate_limiter import check_rate_limit

router = APIRouter(prefix="/assets", tags=["assets"])
logger = logging.getLogger(__name__)

ASSET_CONFIG = {
    "logo":                 (AssetType.LOGO,                 LogoInput),
    "business_card":        (AssetType.BUSINESS_CARD,        BusinessCardInput),
    "letterhead":           (AssetType.LETTERHEAD,           LetterheadInput),
    "email_signature":      (AssetType.EMAIL_SIGNATURE,      EmailSignatureInput),
    "invoice":              (AssetType.INVOICE,              InvoiceInput),
    "quotation":            (AssetType.QUOTATION,            QuotationInput),
    "company_profile":      (AssetType.COMPANY_PROFILE,      CompanyProfileInput),
    "capability_statement": (AssetType.CAPABILITY_STATEMENT, CapabilityStatementInput),
    "brand_guidelines":     (AssetType.BRAND_GUIDELINES,     BrandGuidelinesInput),
}


# ---------------------------------------------------------------------------
# Upload helpers
# ---------------------------------------------------------------------------

@router.post("/upload/logo", response_model=dict, status_code=200)
async def upload_logo_file(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
):
    url = await upload_service.upload_logo(file, user_id)
    return {"logo_url": url}


@router.post("/upload/image", response_model=dict, status_code=200)
async def upload_image_file(
    file: UploadFile = File(...),
    context: str = "photo",
    user_id: str = Depends(get_current_user),
):
    """
    Upload a general-purpose image for use in asset generation.
    context values: photo, cover, operations, facility, portfolio,
                    certification, photography
    """
    url = await upload_service.upload_image(file, user_id, context)
    return {"image_url": url}


# ---------------------------------------------------------------------------
# Generation — main entrypoint
# ---------------------------------------------------------------------------

@router.post("/generate/{asset_type}", response_model=GenerateResponse, status_code=202)
async def generate_asset(
    asset_type: str,
    inputs: dict,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    if asset_type not in ASSET_CONFIG:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown asset_type '{asset_type}'. Valid: {list(ASSET_CONFIG.keys())}",
        )

    asset_enum, schema_class = ASSET_CONFIG[asset_type]

    try:
        validated = schema_class(**inputs)
    except Exception:
        # Don't leak Pydantic field names / internal schema in the response.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid request body. Please check your inputs and try again.",
        )

    # ── Burst rate limit (Redis, fails open) ──────────────────────────────
    allowed, retry_after = await check_rate_limit(user_id)
    if not allowed:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
            content={"detail": "Too many requests. Please wait before generating again."},
        )

    # ── Persist the asset record and enqueue the job ──────────────────────
    asset_id = uuid.uuid4()
    job_id = f"job_{uuid.uuid4().hex}"

    asset = GeneratedAsset(
        id=asset_id,
        user_id=user_id,
        asset_type=asset_enum,
        inputs_snapshot=validated.model_dump(),
        job_id=job_id,
        status=JobStatus.PENDING,
    )
    db.add(asset)
    await db.commit()

    try:
        await enqueue_job(
            job_id=job_id,
            asset_id=str(asset_id),
            asset_type=asset_enum.value,
            inputs=validated.model_dump(),
            user_id=user_id,
        )
    except Exception:
        logger.exception("Failed to enqueue job %s for asset %s", job_id, asset_id)
        asset.status = JobStatus.FAILED
        asset.error_message = "Failed to queue generation job."
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to queue generation job. Please try again.",
        )

    return GenerateResponse(job_id=job_id, asset_id=str(asset_id))


# ---------------------------------------------------------------------------
# Regenerate
# ---------------------------------------------------------------------------

@router.post("/{asset_id}/regenerate", response_model=GenerateResponse, status_code=202)
async def regenerate_asset(
    asset_id: str,
    inputs: dict,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    allowed, retry_after = await check_rate_limit(user_id)
    if not allowed:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
            content={"detail": "Too many requests. Please wait before generating again."},
        )

    original = await _get_asset_or_404(db, asset_id, user_id)
    asset_type_str = original.asset_type.value
    _, schema_class = ASSET_CONFIG[asset_type_str]

    try:
        validated = schema_class(**inputs)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid request body. Please check your inputs and try again.",
        )

    new_asset_id = uuid.uuid4()
    new_job_id = f"job_{uuid.uuid4().hex}"

    new_asset = GeneratedAsset(
        id=new_asset_id,
        user_id=user_id,
        asset_type=original.asset_type,
        inputs_snapshot=validated.model_dump(),
        job_id=new_job_id,
        status=JobStatus.PENDING,
        parent_id=original.id,
        version=original.version + 1,
    )
    db.add(new_asset)
    await db.commit()

    try:
        await enqueue_job(
            job_id=new_job_id,
            asset_id=str(new_asset_id),
            asset_type=asset_type_str,
            inputs=validated.model_dump(),
            user_id=user_id,
        )
    except Exception:
        logger.exception("Failed to enqueue regeneration job %s", new_job_id)
        new_asset.status = JobStatus.FAILED
        new_asset.error_message = "Failed to queue regeneration job."
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to queue regeneration job. Please try again.",
        )

    return GenerateResponse(
        job_id=new_job_id,
        asset_id=str(new_asset_id),
        message=f"Regeneration started (v{new_asset.version}). Poll /assets/{new_asset_id}/status.",
    )


# ---------------------------------------------------------------------------
# Read-only endpoints (unchanged logic, sanitized error messages)
# ---------------------------------------------------------------------------

@router.get("/templated/templates", response_model=dict)
async def get_templated_templates():
    from services.templated_service import TEMPLATED_TEMPLATE_IDS
    return {
        "templates": {
            asset_type: {
                "template_id": tid,
                "configured": bool(tid),
            }
            for asset_type, tid in TEMPLATED_TEMPLATE_IDS.items()
        }
    }


@router.get("", response_model=list[AssetListItem])
async def list_assets(
    asset_type: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    query = (
        select(GeneratedAsset)
        .where(GeneratedAsset.user_id == user_id)
        .order_by(desc(GeneratedAsset.created_at))
        .limit(limit)
        .offset(offset)
    )

    if asset_type:
        if asset_type not in ASSET_CONFIG:
            raise HTTPException(400, f"Unknown asset_type: {asset_type}")
        query = query.where(GeneratedAsset.asset_type == ASSET_CONFIG[asset_type][0])

    result = await db.execute(query)
    assets = result.scalars().all()

    return [
        AssetListItem(
            asset_id=str(a.id),
            asset_type=a.asset_type.value,
            status=a.status.value,
            version=a.version,
            created_at=a.created_at.isoformat(),
        )
        for a in assets
    ]


@router.get("/{asset_id}", response_model=AssetStatusResponse)
async def get_asset(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    asset = await _get_asset_or_404(db, asset_id, user_id)
    return _asset_to_status_response(asset)


@router.get("/{asset_id}/status", response_model=AssetStatusResponse)
async def get_asset_status(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    asset = await _get_asset_or_404(db, asset_id, user_id, fresh=True)
    return _asset_to_status_response(asset)


@router.get("/{asset_id}/edit", response_model=EditPreFillResponse)
async def get_edit_prefill(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    asset = await _get_asset_or_404(db, asset_id, user_id)
    return EditPreFillResponse(
        asset_id=str(asset.id),
        asset_type=asset.asset_type.value,
        inputs_snapshot=asset.inputs_snapshot or {},
        version=asset.version,
    )


@router.get("/{asset_id}/export", response_model=dict)
async def export_asset(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    asset = await _get_asset_or_404(db, asset_id, user_id)

    if asset.status != JobStatus.DONE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Asset is not ready for export. Current status: {asset.status.value}",
        )

    export_urls = {}
    if asset.pdf_url:        export_urls["pdf"]  = asset.pdf_url
    if asset.docx_url:       export_urls["docx"] = asset.docx_url
    if asset.png_url:        export_urls["png"]  = asset.png_url
    if asset.svg_light_url:  export_urls["logo"] = asset.svg_light_url

    if not export_urls:
        raise HTTPException(404, "No export files available for this asset.")

    return {
        "asset_id": asset_id,
        "asset_type": asset.asset_type.value,
        "exports": export_urls,
    }


@router.delete("/{asset_id}", status_code=204)
async def delete_asset(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    asset = await _get_asset_or_404(db, asset_id, user_id)
    await db.delete(asset)
    await db.commit()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_asset_or_404(
    db: AsyncSession,
    asset_id: str,
    user_id: str,
    fresh: bool = False,
) -> GeneratedAsset:
    q = (
        select(GeneratedAsset)
        .where(GeneratedAsset.id == asset_id)
        .where(GeneratedAsset.user_id == user_id)
    )
    if fresh:
        q = q.execution_options(populate_existing=True)

    result = await db.execute(q)
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, f"Asset {asset_id} not found.")
    return asset


def _asset_to_status_response(asset: GeneratedAsset) -> AssetStatusResponse:
    # Sanitize error_message — never surface raw exception text to the client.
    # The real error is logged in the worker; only a generic message reaches here.
    safe_error = asset.error_message if asset.error_message else None

    return AssetStatusResponse(
        asset_id=str(asset.id),
        status=asset.status.value,
        asset_type=asset.asset_type.value,
        pdf_url=asset.pdf_url,
        docx_url=asset.docx_url,
        png_url=asset.png_url,
        logo_url=asset.svg_light_url,
        ai_content=asset.ai_content,
        error_message=safe_error,
        created_at=asset.created_at.isoformat() if asset.created_at else None,
    )
