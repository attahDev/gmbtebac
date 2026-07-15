from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str
    GROQ_API_KEY: str
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    MEDIA_DIR: str = "media/decks"
    UNSPLASH_ACCESS_KEY: str = ""
    ENVIRONMENT: str = ""
    ALLOWED_ORIGINS: List[str] = []
    CREDITS_DATABASE_URL: str = ""
    RATE_LIMIT_PER_MINUTE: int = 3
    RATE_LIMIT_PER_HOUR: int = 20
    PITCH_DECK_CREDIT_COST: int = 1
    ENTITLED_PLANS: List[str] = ["founder_workspace", "founder_pro", "team", "enterprise"]

    class Config:
        env_file = ".env"

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT.lower() == "development"


settings = Settings()
