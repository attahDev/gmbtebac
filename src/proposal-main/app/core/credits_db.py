from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.core.config import settings

credits_engine = create_async_engine(
    settings.credits_database_url,
    pool_size=5,
    max_overflow=2,
    echo=False,
)

CreditsSessionLocal = async_sessionmaker(
    bind=credits_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_credits_db():
    async with CreditsSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
