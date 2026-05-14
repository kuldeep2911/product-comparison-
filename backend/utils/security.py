"""
Security utilities — JWT auth, password hashing, rate limiting, input sanitization.
"""
import logging
import time
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware

from config.database import get_db
from config.settings import settings

logger = logging.getLogger(__name__)

# ── Password hashing ──────────────────────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


# ── JWT tokens ────────────────────────────────────────────────────────────────
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
# Optional version for routes that don't REQUIRE auth (e.g. public endpoints)
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

ACCESS_TOKEN_EXPIRE_MINUTES = settings.JWT_EXPIRE_DAYS * 24 * 60  # 30 days in minutes


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _decode_token(token: str) -> dict:
    """Decode and validate a JWT. Raises HTTPException on failure."""
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        username_val = payload.get("sub")
        if not isinstance(username_val, str):
            raise credentials_exception
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Token has expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise credentials_exception


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Dependency: returns the authenticated User or raises 401."""
    from database.models import User
    payload = _decode_token(token)
    username: str = payload["sub"]
    user = db.query(User).filter(User.username == username).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def get_optional_user(token: Optional[str] = Depends(oauth2_scheme_optional), db: Session = Depends(get_db)):
    """Dependency: returns User if token is provided, else None (for optional-auth endpoints)."""
    if not token:
        return None
    try:
        return get_current_user.__wrapped__(token, db)  # type: ignore
    except HTTPException:
        return None


# ── Rate limiting ─────────────────────────────────────────────────────────────
class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory rate limiter per IP."""

    def __init__(self, app, max_requests: int = 120, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window = window_seconds
        self.requests: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        self.requests[client_ip] = [t for t in self.requests[client_ip] if t > now - self.window]
        if len(self.requests[client_ip]) >= self.max_requests:
            raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")
        self.requests[client_ip].append(now)
        return await call_next(request)


# ── Input sanitization ────────────────────────────────────────────────────────
def sanitize_input(text: str, max_length: int = 2000) -> str:
    """Strip control characters and truncate."""
    if not text:
        return ""
    text = text[:max_length]
    text = "".join(c for c in text if c.isprintable() or c in ("\n", "\t"))
    return text.strip()
