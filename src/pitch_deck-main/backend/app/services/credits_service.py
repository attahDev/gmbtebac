
import logging
import uuid

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings

logger = logging.getLogger(__name__)

SERVICE_NAME = "pitch_deck"


def check_entitlement(plan: str) -> None:
    if plan not in settings.ENTITLED_PLANS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Pitch AI is available on Founder Workspace and above. "
                "Upgrade your plan to generate pitch decks."
            ),
        )


def reserve_credits(credits_db: Session, user_id: str) -> str:
    reference_id = str(uuid.uuid4())
    cost = settings.PITCH_DECK_CREDIT_COST

    try:
        result = credits_db.execute(
            text(
                """
                UPDATE user_credits
                SET credits_balance = credits_balance - :cost
                WHERE user_id = :user_id AND credits_balance >= :cost
                RETURNING credits_balance
                """
            ),
            {"cost": cost, "user_id": user_id},
        ).fetchone()

        if result is None:
            credits_db.rollback()
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Not enough AI credits for this generation. Buy a credit pack or upgrade your plan.",
            )

        credits_db.execute(
            text(
                """
                INSERT INTO credit_transactions
                    (id, user_id, service, amount, status, reference_id, created_at)
                VALUES (:id, :user_id, :service, :amount, 'reserved', :reference_id, now())
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "service": SERVICE_NAME,
                "amount": -cost,
                "reference_id": reference_id,
            },
        )
        credits_db.commit()
        return reference_id

    except HTTPException:
        raise
    except Exception as exc:
        credits_db.rollback()
        logger.error("Credit reservation failed for user %s: %s", user_id, exc)

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not process credits right now. Please try again.",
        )


def commit_credits(credits_db: Session, user_id: str, reference_id: str) -> None:
    try:
        credits_db.execute(
            text(
                """
                UPDATE credit_transactions
                SET status = 'committed'
                WHERE reference_id = :reference_id AND user_id = :user_id
                """
            ),
            {"reference_id": reference_id, "user_id": user_id},
        )
        credits_db.commit()
    except Exception as exc:
        credits_db.rollback()
        logger.error(
            "Failed to commit credit reservation %s for user %s: %s",
            reference_id, user_id, exc,
        )


def refund_credits(credits_db: Session, user_id: str, reference_id: str) -> None:
    cost = settings.PITCH_DECK_CREDIT_COST
    try:
        credits_db.execute(
            text(
                """
                UPDATE user_credits
                SET credits_balance = credits_balance + :cost
                WHERE user_id = :user_id
                """
            ),
            {"cost": cost, "user_id": user_id},
        )
        credits_db.execute(
            text(
                """
                UPDATE credit_transactions
                SET status = 'refunded'
                WHERE reference_id = :reference_id AND user_id = :user_id
                """
            ),
            {"reference_id": reference_id, "user_id": user_id},
        )
        credits_db.commit()
    except Exception as exc:
        credits_db.rollback()
        logger.error(
            "FAILED TO REFUND credits for reservation %s, user %s: %s",
            reference_id, user_id, exc,
        )
