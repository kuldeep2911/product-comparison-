"""
Database connection and session management.
Supports both individual DB_* vars and a single DATABASE_URL env var.
Supabase requires ?sslmode=require on the connection string.
"""
import logging
import os
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker

from config.settings import settings

logger = logging.getLogger(__name__)

# Prefer a full DATABASE_URL if provided (Supabase / Render inject this)
_raw_url = os.getenv("DATABASE_URL", "").strip().replace("\n", "").replace("\r", "").replace('"', "")

if _raw_url:
    # Supabase / Render provide postgres:// — SQLAlchemy needs postgresql://
    if _raw_url.startswith("postgres://"):
        _raw_url = _raw_url.replace("postgres://", "postgresql://", 1)
    # Ensure SSL is required for Supabase
    if "sslmode" not in _raw_url:
        sep = "&" if "?" in _raw_url else "?"
        _raw_url = f"{_raw_url}{sep}sslmode=require"
    DATABASE_URL = _raw_url
else:
    # Fall back to individual settings (local dev)
    DATABASE_URL = URL.create(
        drivername="postgresql",
        username=settings.DB_USER,
        password=settings.DB_PASSWORD,
        host=settings.DB_HOST,
        port=settings.DB_PORT,
        database=settings.DB_NAME,
    )

engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    # Supabase / PgBouncer in transaction mode needs this
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=300,
)
SessionLocal = sessionmaker(bind=engine)


def get_db():
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
