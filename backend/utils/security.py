"""
Security utilities — input validation, rate limiting, CORS.
"""
import logging
import time
from collections import defaultdict
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory rate limiter."""

    def __init__(self, app, max_requests: int = 60, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window = window_seconds
        self.requests: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()

        # Clean old entries
        self.requests[client_ip] = [
            t for t in self.requests[client_ip] if t > now - self.window
        ]

        if len(self.requests[client_ip]) >= self.max_requests:
            raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")

        self.requests[client_ip].append(now)
        response = await call_next(request)
        return response


def sanitize_input(text: str, max_length: int = 2000) -> str:
    """Sanitize user input."""
    if not text:
        return ""
    # Truncate
    text = text[:max_length]
    # Strip control characters (keep newlines and tabs)
    text = "".join(c for c in text if c.isprintable() or c in ("\n", "\t"))
    return text.strip()
