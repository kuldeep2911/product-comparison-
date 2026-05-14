"""
Electronics Comparison Assistant — FastAPI Backend
"""
import os
import sys
import logging

# Ensure the backend package root is on sys.path
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Add ETL module to path for reuse (append, not insert, so backend's config/ takes priority)
ETL_PATH = os.path.abspath(os.path.join(BACKEND_DIR, "..", "data cleaning and storing in database"))
if ETL_PATH not in sys.path:
    sys.path.append(ETL_PATH)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
import uvicorn

from config.settings import settings
from config.database import engine
from api.auth_routes import router as auth_router
from api.chat_routes import router as chat_router
from api.compare_routes import router as compare_router
from api.recommend_routes import router as recommend_router
from utils.security import RateLimitMiddleware

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Electronics Comparison Assistant API",
    description="ChatGPT-style conversational electronics comparison and recommendation",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting
app.add_middleware(RateLimitMiddleware, max_requests=120, window_seconds=60)

# Include routers
app.include_router(auth_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(compare_router, prefix="/api")
app.include_router(recommend_router, prefix="/api")


@app.on_event("startup")
def startup_event():
    import services.ranking_engine as re
    print(f"!!! LOADED RANKING ENGINE FROM: {re.__file__} !!!")
    """Create chat tables on startup if they don't exist."""
    schema_path = os.path.join(os.path.dirname(__file__), "database", "chat_schema.sql")
    try:
        with open(schema_path, "r") as f:
            schema_sql = f.read()
        with engine.connect() as conn:
            conn.execute(text(schema_sql))
            conn.commit()
        logger.info("Chat tables created/verified successfully")
    except Exception as e:
        logger.error(f"Error creating chat tables: {e}")


@app.get("/")
def health_check():
    """Health check endpoint."""
    return {"status": "ok", "message": "Electronics Comparison Assistant API is running"}


@app.get("/api/health")
def api_health():
    """API health check with DB connectivity test."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "degraded", "database": str(e)}


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
