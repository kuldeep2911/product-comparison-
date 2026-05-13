"""
Chat service — session CRUD, message storage, context tracking.
"""
import logging
from sqlalchemy.orm import Session
from database.models import ChatSession, ChatMessage, ChatContext

logger = logging.getLogger(__name__)


def start_session(db: Session, mode: str = "compare_specific", user_id: str | None = None) -> ChatSession:
    """Create a new chat session with an empty context."""
    session = ChatSession(mode=mode, user_id=user_id)
    db.add(session)
    db.flush()

    context = ChatContext(session_id=session.id)
    db.add(context)
    db.commit()
    db.refresh(session)
    logger.info(f"Created session {session.id} with mode '{mode}'")
    return session


def add_message(db: Session, session_id, role: str, content: str, metadata: dict | None = None) -> ChatMessage:
    """Store a chat message."""
    msg = ChatMessage(
        session_id=session_id,
        role=role,
        content=content,
        metadata_=metadata or {},
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def get_session(db: Session, session_id) -> ChatSession | None:
    """Get a session by ID."""
    return db.query(ChatSession).filter(ChatSession.id == session_id).first()


def get_session_history(db: Session, session_id) -> list[ChatMessage]:
    """Get all messages for a session, ordered chronologically."""
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )


def get_context(db: Session, session_id) -> ChatContext | None:
    """Get the structured context for a session."""
    return db.query(ChatContext).filter(ChatContext.session_id == session_id).first()


def update_context(db: Session, session_id, **kwargs) -> ChatContext:
    """Update session context fields."""
    ctx = get_context(db, session_id)
    if not ctx:
        ctx = ChatContext(session_id=session_id)
        db.add(ctx)

    for key, value in kwargs.items():
        if hasattr(ctx, key) and value is not None:
            setattr(ctx, key, value)

    db.commit()
    db.refresh(ctx)
    return ctx


def update_session_mode(db: Session, session_id, mode: str):
    """Update the session mode."""
    session = get_session(db, session_id)
    if session:
        session.mode = mode  # type: ignore[assignment]
        db.commit()


def get_recent_messages(db: Session, session_id, limit: int = 10) -> list[ChatMessage]:
    """Get the last N messages for context window."""
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
        .all()
    )[::-1]  # Reverse to chronological order

def get_recent_sessions(db: Session, limit: int = 50) -> list[ChatSession]:
    """Get recent chat sessions for history sidebar."""
    return db.query(ChatSession).order_by(ChatSession.created_at.desc()).limit(limit).all()

def delete_session(db: Session, session_id: str) -> bool:
    """Delete a session entirely."""
    session = get_session(db, session_id)
    if session:
        db.delete(session)
        db.commit()
        return True
    return False
