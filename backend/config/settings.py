"""
Application settings loaded from environment variables.
"""
import secrets
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database — either a full URL (Supabase/Render) OR individual parts (local dev)
    DATABASE_URL: str = ""          # e.g. postgresql://user:pass@host:5432/db
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_USER: str = "postgres"
    DB_PASSWORD: str = ""
    DB_NAME: str = "electronics_db"

    # LLM (Groq)
    GROQ_API_KEY: str = ""
    LLM_MODEL: str = "llama3-8b-8192"

    # App
    APP_ENV: str = "development"
    SECRET_KEY: str = "dev-secret-key"
    # Comma-separated list of allowed origins.
    # In production set this to your Vercel URL, e.g.:
    #   CORS_ORIGINS=https://your-app.vercel.app
    CORS_ORIGINS: str = "http://localhost:8080,http://localhost:3000,http://localhost:5173"

    # JWT Auth
    JWT_SECRET_KEY: str = secrets.token_urlsafe(32)  # Overridden by .env in prod
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_DAYS: int = 30  # Long-lived like ChatGPT

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
