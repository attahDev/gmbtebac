
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.config import settings

credits_engine = create_engine(
    settings.CREDITS_DATABASE_URL,
    connect_args={"sslmode": "require"},
    poolclass=NullPool,
)
CreditsSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=credits_engine)


def get_credits_db():
    db = CreditsSessionLocal()
    try:
        yield db
    finally:
        db.close()
