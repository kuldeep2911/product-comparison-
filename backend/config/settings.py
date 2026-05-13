"""
Application settings loaded from environment variables.
"""
import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    # Database
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
    CORS_ORIGINS: str = "http://localhost:8080,http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
