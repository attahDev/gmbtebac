"""
Separate SQLAlchemy async engine for the main GMBTE platform DB.

This module exists solely so the credit reserve/commit/refund logic
is isolated from this service's own DB. When the real platform schema
is confirmed, only this file and services/credits_service.py need
updating — nothing else changes.
"""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from core.config import settings

_credits_engine = None
_CreditsSession = None


def _get_credits_engine():
    global _credits_engine, _CreditsSession
    if _credits_engine is None:
        if not settings.CREDITS_DATABASE_URL:
            raise RuntimeError(
                "CREDITS_DATABASE_URL is not set. "
                "This must point at the main GMBTE platform database."
            )
        _credits_engine = create_async_engine(
            settings.CREDITS_DATABASE_URL,
            echo=False,
            poolclass=NullPool,
        )
        _CreditsSession = async_sessionmaker(
            bind=_credits_engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _credits_engine, _CreditsSession


async def get_credits_db() -> AsyncSession:
    _, session_factory = _get_credits_engine()
    async with session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def dispose_credits_engine() -> None:
    global _credits_engine, _CreditsSession
    if _credits_engine:
        await _credits_engine.dispose()
        _credits_engine = None
        _CreditsSession = None
