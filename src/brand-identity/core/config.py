from pydantic_settings import BaseSettings
from typing import Literal


class Settings(BaseSettings):
    GROQ_API_KEY: str = ""

    RECRAFT_API_KEY: str = ""

    TEMPLATED_API_KEY: str = ""

    # This service's own Postgres DB (proposals/assets table only)
    DATABASE_URL: str

    # The main GMBTE platform DB — used only for credit reserve/commit/refund.
    # Isolated in core/credits_db.py + services/credits_service.py so it's a
    # small change once the real schema is confirmed, not a rewrite.
    CREDITS_DATABASE_URL: str = ""

    REDIS_URL: str = "redis://redis:6379/0"

    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"

    STORAGE_PROVIDER: str = "s3"
    STORAGE_BUCKET: str = "brand-identity-assets"
    STORAGE_ENDPOINT_URL: str = ""
    STORAGE_ACCESS_KEY: str = ""
    STORAGE_SECRET_KEY: str = ""
    STORAGE_PUBLIC_URL: str = ""
    STORAGE_REGION: str = "us-east-1"

    ENVIRONMENT: Literal["development", "production"] = "development"

    # Comma-separated list of allowed CORS origins, e.g.:
    #   ALLOWED_ORIGINS=https://app.gmbte.com,https://brand.gmbte.com
    # Leave empty in development to allow all origins via wildcard.
    ALLOWED_ORIGINS: list[str] = []

    MAX_UPLOAD_SIZE_MB: int = 5
    SIGNED_URL_EXPIRY_SECONDS: int = 3600

    # Rate limiting (per user_id, fixed window)
    RATE_LIMIT_PER_MINUTE: int = 5
    RATE_LIMIT_PER_HOUR: int = 20

    # Credit cost per brand-identity generation.
    # Per the commercial framework, Brand Identity is a Founder Workspace+
    # feature. Cost TBC against real schema — placeholder matches Proposal Builder.
    BRAND_IDENTITY_CREDIT_COST: int = 100

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
