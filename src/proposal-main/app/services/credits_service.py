
import logging
import uuid

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

logger = logging.getLogger(__name__)

SERVICE_NAME = "proposal_builder"
ENTITLED_PLANS: set[str] = {"founder_workspace", "founder_pro", "pro", "team", "enterprise"}


def is_entitled(plan: str) -> bool:
    return plan in ENTITLED_PLANS


class InsufficientCredits(Exception):
    pass


async def reserve_credits(db: AsyncSession, user_id: str, cost: int) -> str:
    result = await db.execute(
        text(
            """
            UPDATE user_credits
            SET credits_balance = credits_balance - :cost
            WHERE user_id = :user_id AND credits_balance >= :cost
            RETURNING credits_balance
            """
        ),
        {"user_id": user_id, "cost": cost},
    )
    row = result.first()
    if row is None:
        raise InsufficientCredits(f"Insufficient credits for user {user_id}")

    txn_id = str(uuid.uuid4())
    await db.execute(
        text(
            """
            INSERT INTO credit_transactions (id, user_id, service, amount, status, reference_id, created_at)
            VALUES (:id, :user_id, :service, :amount, 'reserved', :reference_id, now())
            """
        ),
        {
            "id": txn_id,
            "user_id": user_id,
            "service": SERVICE_NAME,
            "amount": -cost,
            "reference_id": txn_id,
        },
    )
    await db.commit()
    return txn_id


async def commit_credits(db: AsyncSession, txn_id: str) -> None:
    await db.execute(
        text("UPDATE credit_transactions SET status = 'committed' WHERE id = :id"),
        {"id": txn_id},
    )
    await db.commit()


async def refund_credits(db: AsyncSession, user_id: str, cost: int, txn_id: str) -> None:
    try:
        await db.execute(
            text(
                "UPDATE user_credits SET credits_balance = credits_balance + :cost WHERE user_id = :user_id"
            ),
            {"user_id": user_id, "cost": cost},
        )
        await db.execute(
            text(
                """
                INSERT INTO credit_transactions (id, user_id, service, amount, status, reference_id, created_at)
                VALUES (:id, :user_id, :service, :amount, 'refunded', :reference_id, now())
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "service": SERVICE_NAME,
                "amount": cost,
                "reference_id": txn_id,
            },
        )
        await db.commit()
    except Exception as e:
        logger.critical(
            "REFUND FAILED for user %s, txn %s, cost %s — needs manual credit correction: %s",
            user_id, txn_id, cost, e,
        )


def entitlement_error() -> HTTPException:
    return HTTPException(
        status_code=403,
        detail="Your plan doesn't include Proposal AI. Upgrade to Founder Workspace or higher to generate proposals.",
    )


def insufficient_credits_error() -> HTTPException:
    return HTTPException(
        status_code=402,
        detail=f"Not enough AI credits left this billing cycle. Proposal generation costs {settings.PROPOSAL_CREDIT_COST} credits.",
    )
