import logging
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.credits_db import get_credits_db
from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.models.proposal import Proposal
from app.schemas.proposal import (
    GenerateRequest,
    ProposalResponse,
    ProposalListResponse,
    ProposalListItem,
    ProposalContent,
    ProposalUpdateRequest,
)
from app.services import credits_service, groq_service, pdf_service, docx_service
from app.services.rate_limiter import RateLimitExceeded, enforce_rate_limit

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/proposals", tags=["proposals"])


def _parse_uuid(proposal_id: str) -> UUID:
    try:
        return UUID(proposal_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid proposal ID format")


def _safe_filename(title: str) -> str:
    return re.sub(r"[^\w\s-]", "", title).strip().replace(" ", "-").lower()


def _extract_total_value(pricing_html: str, fallback: str = "") -> str:
    """Pull the last cell from the pricing table's tfoot total-row."""
    match = re.search(
        r"class=['\"]total-row['\"][^>]*>.*?<td[^>]*>([^<]+)</td>",
        pricing_html,
        re.DOTALL | re.IGNORECASE,
    )
    return match.group(1).strip() if match else fallback


def _to_response(p: Proposal) -> ProposalResponse:
    return ProposalResponse(
        id=p.id,
        title=p.title,
        proposal_type=p.proposal_type,
        user_name=p.user_name,
        client_name=p.client_name,
        estimated_budget=p.estimated_budget,
        total_value=p.total_value,
        content=ProposalContent(**p.content),
        created_at=p.created_at,
    )

@router.post("/generate", response_model=ProposalResponse, status_code=201)
async def generate_proposal(
    body: GenerateRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    credits_db: AsyncSession = Depends(get_credits_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"]
    plan = current_user.get("subscription_plan", "free")

    # 1. Entitlement — does this plan include Proposal AI at all?
    if not credits_service.is_entitled(plan):
        raise credits_service.entitlement_error()

    # 2. Burst protection — independent of credit balance, protects
    #    Groq + rendering cost from tight-loop abuse. Fails open if
    #    Redis is down.
    try:
        await enforce_rate_limit(user_id)
    except RateLimitExceeded as e:
        response.headers["Retry-After"] = str(e.retry_after)
        raise HTTPException(
            status_code=429,
            detail=f"Too many requests ({e.scope}). Try again in {e.retry_after}s.",
        )

    # 3. Reserve credits from the shared GMBTE pool BEFORE calling
    #    Groq. Fails closed — a credits-DB error blocks the request.
    cost = settings.PROPOSAL_CREDIT_COST
    try:
        txn_id = await credits_service.reserve_credits(credits_db, user_id, cost)
    except credits_service.InsufficientCredits:
        raise credits_service.insufficient_credits_error()

    try:
        data = await groq_service.generate_proposal(
            body.prompt,
            client_name=body.client_name,
            budget=body.estimated_budget,
        )
    except ValueError as e:
        logger.error("Groq response parsing failed for user %s: %s", user_id, e)
        await credits_service.refund_credits(credits_db, user_id, cost, txn_id)
        raise HTTPException(status_code=500, detail="Proposal generation failed. No credits were charged. Please try again.")
    except ConnectionError as e:
        logger.error("Groq API unreachable for user %s: %s", user_id, e)
        await credits_service.refund_credits(credits_db, user_id, cost, txn_id)
        raise HTTPException(status_code=503, detail="Proposal generation is temporarily unavailable. No credits were charged.")
    except RuntimeError as e:
        logger.error("Groq API error for user %s: %s", user_id, e)
        await credits_service.refund_credits(credits_db, user_id, cost, txn_id)
        raise HTTPException(status_code=502, detail="Proposal generation failed upstream. No credits were charged.")

    content = {k: data[k] for k in ProposalContent.model_fields.keys()}
    total_value = _extract_total_value(data.get("pricing", ""), fallback=body.estimated_budget)

    proposal = Proposal(
        user_id=user_id,
        user_name=current_user.get("user_name") or "",
        title=data["title"],
        proposal_type=data["proposal_type"],
        client_name=body.client_name or None,
        estimated_budget=body.estimated_budget or None,
        total_value=total_value or None,
        raw_input=body.prompt,
        content=content,
    )
    db.add(proposal)
    try:
        await db.commit()
    except Exception:
        await credits_service.refund_credits(credits_db, user_id, cost, txn_id)
        raise
    await db.refresh(proposal)

    await credits_service.commit_credits(credits_db, txn_id)
    return _to_response(proposal)

@router.get("/", response_model=ProposalListResponse)
async def list_proposals(
    page: int = 1,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user_id"]
    offset = (page - 1) * limit

    total_result = await db.execute(
        select(func.count()).select_from(Proposal).where(Proposal.user_id == user_id)
    )
    total = total_result.scalar()

    result = await db.execute(
        select(Proposal)
        .where(Proposal.user_id == user_id)
        .order_by(Proposal.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    proposals = result.scalars().all()

    return ProposalListResponse(
        total=total,
        page=page,
        limit=limit,
        proposals=[
            ProposalListItem(
                id=p.id,
                title=p.title,
                proposal_type=p.proposal_type,
                client_name=p.client_name,
                total_value=p.total_value,
                created_at=p.created_at,
            )
            for p in proposals
        ],
    )

@router.get("/{proposal_id}", response_model=ProposalResponse)
async def get_proposal(
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    uid = _parse_uuid(proposal_id)
    result = await db.execute(
        select(Proposal).where(Proposal.id == uid, Proposal.user_id == current_user["user_id"])
    )
    proposal = result.scalar_one_or_none()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")
    return _to_response(proposal)

@router.patch("/{proposal_id}", response_model=ProposalResponse)
async def update_proposal(
    proposal_id: str,
    body: ProposalUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    uid = _parse_uuid(proposal_id)
    result = await db.execute(
        select(Proposal).where(Proposal.id == uid, Proposal.user_id == current_user["user_id"])
    )
    proposal = result.scalar_one_or_none()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    if body.title is not None:
        proposal.title = body.title
    if body.content is not None:
        proposal.content = body.content.model_dump()
        proposal.total_value = _extract_total_value(
            body.content.pricing, fallback=proposal.total_value or ""
        ) or proposal.total_value

    await db.commit()
    await db.refresh(proposal)
    return _to_response(proposal)

@router.get("/{proposal_id}/download/pdf")
async def download_pdf(
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    uid = _parse_uuid(proposal_id)
    result = await db.execute(
        select(Proposal).where(Proposal.id == uid, Proposal.user_id == current_user["user_id"])
    )
    proposal = result.scalar_one_or_none()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    try:
        pdf_bytes = pdf_service.generate_pdf(proposal)
    except Exception as e:
        logger.error("PDF generation failed: %s", e)
        raise HTTPException(status_code=500, detail="PDF generation failed")

    filename = f"proposal-{_safe_filename(proposal.title)}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{proposal_id}/download/docx")
async def download_docx(
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    uid = _parse_uuid(proposal_id)
    result = await db.execute(
        select(Proposal).where(Proposal.id == uid, Proposal.user_id == current_user["user_id"])
    )
    proposal = result.scalar_one_or_none()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    try:
        docx_bytes = docx_service.generate_docx(proposal)
    except Exception as e:
        logger.error("DOCX generation failed: %s", e)
        raise HTTPException(status_code=500, detail="DOCX generation failed")

    filename = f"proposal-{_safe_filename(proposal.title)}.docx"
    return StreamingResponse(
        iter([docx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@router.get("/{proposal_id}/pdf")
async def download_pdf_legacy(
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return await download_pdf(proposal_id, db, current_user)

@router.delete("/{proposal_id}")
async def delete_proposal(
    proposal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    uid = _parse_uuid(proposal_id)
    result = await db.execute(
        select(Proposal).where(Proposal.id == uid, Proposal.user_id == current_user["user_id"])
    )
    proposal = result.scalar_one_or_none()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    await db.delete(proposal)
    await db.commit()
    return {"message": "Proposal deleted successfully"}
