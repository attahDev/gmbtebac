from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
  
    DATABASE_URL: str
    CREDITS_DATABASE_URL: str = ""
    REDIS_URL: str = ""
    GROQ_API_KEY: str
    JWT_SECRET: str = ""
    SERVICE_NAME: str = "Proposal Builder AI"
    ENVIRONMENT: str = ""
    ALLOWED_ORIGINS: str = ""
    RATE_LIMIT_PER_MINUTE: int = 5
    RATE_LIMIT_PER_HOUR: int = 30
    PROPOSAL_CREDIT_COST: int = 

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def credits_database_url(self) -> str:
        return self.CREDITS_DATABASE_URL or self.DATABASE_URL

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]


settings = Settings()
