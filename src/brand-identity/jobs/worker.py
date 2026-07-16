import json
import asyncio
import logging
from datetime import datetime
from sqlalchemy import update
from redis.exceptions import TimeoutError as RedisTimeoutError

from core.database import AsyncSessionLocal
from core.redis import get_redis
from models.asset import GeneratedAsset, JobStatus, AssetType
from services.ai_service import ai_service
from services.document_service import document_service
from services.logo_service import logo_service
from services.templated_service import templated_service
from services.upload_service import upload_service
from schemas.assets import (
    LogoInput, BusinessCardInput, LetterheadInput, EmailSignatureInput,
    InvoiceInput, QuotationInput, CompanyProfileInput,
    CapabilityStatementInput, BrandGuidelinesInput,
)
from jobs.queue import QUEUE_KEY

logger = logging.getLogger(__name__)

BLPOP_TIMEOUT = 30

# Generic message written to DB on failure.
# The real exception is logged server-side and never reaches the client.
_GENERIC_FAILURE_MSG = "Generation failed. Please try again."


async def process_job(payload: dict):
    asset_id    = payload["asset_id"]
    asset_type  = payload["asset_type"]
    inputs      = payload["inputs"]
    user_id     = payload["user_id"]

    async with AsyncSessionLocal() as session:
        try:
            await session.execute(
                update(GeneratedAsset)
                .where(GeneratedAsset.id == asset_id)
                .values(status=JobStatus.PROCESSING, updated_at=datetime.utcnow())
            )
            await session.commit()

            result = await _run_pipeline(asset_type, inputs, user_id, asset_id)

            await session.execute(
                update(GeneratedAsset)
                .where(GeneratedAsset.id == asset_id)
                .values(
                    status=JobStatus.DONE,
                    ai_content=result.get("ai_content"),
                    pdf_url=result.get("pdf_url"),
                    docx_url=result.get("docx_url"),
                    png_url=result.get("png_url"),
                    svg_light_url=result.get("svg_light_url"),
                    # Never write raw exception text here — only write on failure path.
                    error_message=None,
                    updated_at=datetime.utcnow(),
                )
            )
            await session.commit()
            logger.info("Job %s completed successfully", payload["job_id"])

        except Exception as exc:
            # Log the full exception server-side (includes traceback).
            logger.error("Job %s failed: %s", payload["job_id"], exc, exc_info=True)

            # Write a generic message to DB — this is what the client sees
            # via GET /assets/{id}/status. Raw exc text is never stored.
            try:
                await session.execute(
                    update(GeneratedAsset)
                    .where(GeneratedAsset.id == asset_id)
                    .values(
                        status=JobStatus.FAILED,
                        error_message=_GENERIC_FAILURE_MSG,
                        updated_at=datetime.utcnow(),
                    )
                )
                await session.commit()
            except Exception as db_err:
                logger.error(
                    "Failed to write FAILED status for %s: %s", asset_id, db_err
                )


async def _run_pipeline(asset_type: str, inputs: dict, user_id: str, asset_id: str) -> dict:
    dispatch = {
        AssetType.LOGO.value:                 _pipeline_logo,
        AssetType.BUSINESS_CARD.value:        _pipeline_business_card,
        AssetType.LETTERHEAD.value:           _pipeline_letterhead,
        AssetType.EMAIL_SIGNATURE.value:      _pipeline_email_signature,
        AssetType.INVOICE.value:              _pipeline_invoice,
        AssetType.QUOTATION.value:            _pipeline_quotation,
        AssetType.COMPANY_PROFILE.value:      _pipeline_company_profile,
        AssetType.CAPABILITY_STATEMENT.value: _pipeline_capability,
        AssetType.BRAND_GUIDELINES.value:     _pipeline_brand_guidelines,
    }
    fn = dispatch.get(asset_type)
    if not fn:
        raise ValueError(f"Unknown asset_type: {asset_type}")
    return await fn(inputs, user_id, asset_id)


async def _pipeline_logo(inputs: dict, user_id: str, asset_id: str) -> dict:
    logo_input = LogoInput(**inputs)

    logo_result = await logo_service.generate_logo(
        logo_input,
        groq_fallback_fn=ai_service.generate_logo_svg,
    )

    if logo_result.get("svg"):
        logo_url = await upload_service.upload_generated_file(
            logo_result["svg"].encode(), "image/svg+xml", "logo", user_id, "primary"
        )
    else:
        png_bytes = logo_result.get("png", b"")
        logo_url = await upload_service.upload_generated_file(
            png_bytes, "image/png", "logo", user_id, "primary"
        )

    return {
        "svg_light_url": logo_url,
        "ai_content":    {"source": logo_result.get("source")},
    }


async def _templated_pipeline(
    asset_type: str,
    schema_class,
    inputs: dict,
    user_id: str,
    output_format: str = "png",
) -> dict:
    schema_class(**inputs)
    file_bytes = await templated_service.render(asset_type, inputs, output_format)

    if output_format == "pdf":
        url = await upload_service.upload_generated_file(
            file_bytes, "application/pdf", asset_type, user_id
        )
        return {"pdf_url": url, "ai_content": {"source": "templated"}}
    else:
        url = await upload_service.upload_generated_file(
            file_bytes, "image/png", asset_type, user_id
        )
        return {"png_url": url, "ai_content": {"source": "templated"}}


async def _pipeline_business_card(inputs: dict, user_id: str, asset_id: str) -> dict:
    return await _templated_pipeline(
        "business_card", BusinessCardInput, inputs, user_id, output_format="png"
    )


async def _pipeline_letterhead(inputs: dict, user_id: str, asset_id: str) -> dict:
    return await _templated_pipeline(
        "letterhead", LetterheadInput, inputs, user_id, output_format="png"
    )


async def _pipeline_email_signature(inputs: dict, user_id: str, asset_id: str) -> dict:
    return await _templated_pipeline(
        "email_signature", EmailSignatureInput, inputs, user_id, output_format="png"
    )


async def _pipeline_invoice(inputs: dict, user_id: str, asset_id: str) -> dict:
    if templated_service.is_configured("invoice"):
        return await _templated_pipeline(
            "invoice", InvoiceInput, inputs, user_id, output_format="png"
        )

    logger.info("Invoice: no Templated template configured — using PIL fallback")
    InvoiceInput(**inputs)
    pdf_bytes  = document_service.build_invoice_pdf(inputs, asset_id)
    docx_bytes = document_service.build_invoice_docx(inputs, asset_id)
    pdf_url  = await upload_service.upload_generated_file(
        pdf_bytes, "application/pdf", "invoice", user_id
    )
    docx_url = await upload_service.upload_generated_file(
        docx_bytes,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "invoice", user_id,
    )
    return {"pdf_url": pdf_url, "docx_url": docx_url, "ai_content": {"source": "pil_fallback"}}


async def _pipeline_quotation(inputs: dict, user_id: str, asset_id: str) -> dict:
    if templated_service.is_configured("quotation"):
        return await _templated_pipeline(
            "quotation", QuotationInput, inputs, user_id, output_format="png"
        )

    logger.info("Quotation: no Templated template configured — using PIL fallback")
    QuotationInput(**inputs)
    pdf_bytes  = document_service.build_quotation_pdf(inputs, asset_id)
    docx_bytes = document_service.build_quotation_docx(inputs, asset_id)
    pdf_url  = await upload_service.upload_generated_file(
        pdf_bytes, "application/pdf", "quotation", user_id
    )
    docx_url = await upload_service.upload_generated_file(
        docx_bytes,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "quotation", user_id,
    )
    return {"pdf_url": pdf_url, "docx_url": docx_url, "ai_content": {"source": "pil_fallback"}}


async def _pipeline_company_profile(inputs: dict, user_id: str, asset_id: str) -> dict:
    cp_input   = CompanyProfileInput(**inputs)
    ai_content = await ai_service.generate_company_profile(cp_input)
    pdf_bytes  = document_service.build_company_profile_pdf(inputs, ai_content, asset_id)
    docx_bytes = document_service.build_company_profile_docx(inputs, ai_content, asset_id)
    pdf_url  = await upload_service.upload_generated_file(
        pdf_bytes, "application/pdf", "company_profile", user_id
    )
    docx_url = await upload_service.upload_generated_file(
        docx_bytes,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "company_profile", user_id,
    )
    return {"pdf_url": pdf_url, "docx_url": docx_url, "ai_content": ai_content}


async def _pipeline_capability(inputs: dict, user_id: str, asset_id: str) -> dict:
    cs_input   = CapabilityStatementInput(**inputs)
    ai_content = await ai_service.generate_capability_statement(cs_input)
    pdf_bytes  = document_service.build_capability_pdf(inputs, ai_content, asset_id)
    docx_bytes = document_service.build_capability_docx(inputs, ai_content, asset_id)
    pdf_url  = await upload_service.upload_generated_file(
        pdf_bytes, "application/pdf", "capability_statement", user_id
    )
    docx_url = await upload_service.upload_generated_file(
        docx_bytes,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "capability_statement", user_id,
    )
    return {"pdf_url": pdf_url, "docx_url": docx_url, "ai_content": ai_content}


async def _pipeline_brand_guidelines(inputs: dict, user_id: str, asset_id: str) -> dict:
    bg_input   = BrandGuidelinesInput(**inputs)
    ai_content = await ai_service.generate_brand_guidelines(bg_input)
    pdf_bytes  = document_service.build_brand_guidelines_pdf(inputs, ai_content, asset_id)
    docx_bytes = document_service.build_brand_guidelines_docx(inputs, ai_content, asset_id)
    pdf_url  = await upload_service.upload_generated_file(
        pdf_bytes, "application/pdf", "brand_guidelines", user_id
    )
    docx_url = await upload_service.upload_generated_file(
        docx_bytes,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "brand_guidelines", user_id,
    )
    return {"pdf_url": pdf_url, "docx_url": docx_url, "ai_content": ai_content}


async def run_worker():
    logger.info("Brand Identity worker started — listening on queue: %s", QUEUE_KEY)
    redis = await get_redis()

    while True:
        try:
            result = await redis.blpop(QUEUE_KEY, timeout=BLPOP_TIMEOUT)
            if result is None:
                continue
            _, raw = result
            payload = json.loads(raw)
            logger.info("Processing job %s", payload["job_id"])
            await process_job(payload)

        except RedisTimeoutError:
            logger.debug("Redis blpop idle timeout, continuing...")
            continue

        except Exception as e:
            logger.error("Worker error: %s", e, exc_info=True)
            await asyncio.sleep(2)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker())
