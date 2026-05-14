"""
Chat and session API routes.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from config.database import get_db
from schemas.chat import (
    SessionStartRequest, SessionStartResponse,
    ChatMessageRequest, ChatMessageResponse,
    ChatHistoryResponse, ChatHistoryMessage,
)
from services import chat_service
from services.conversation_manager import handle_message

from database.models import User
from utils.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/session/start", response_model=SessionStartResponse)
def start_session(request: SessionStartRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Create a new chat session."""
    try:
        session = chat_service.start_session(db, mode=request.mode, user_id=str(current_user.id))
        return SessionStartResponse(
            session_id=str(session.id),
            mode=str(session.mode),
        )
    except Exception as e:
        logger.error(f"Error starting session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create session")


@router.post("/chat/message", response_model=ChatMessageResponse)
def send_message(request: ChatMessageRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Send a message and get AI response."""
    # Validate session exists
    session = chat_service.get_session(db, request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        result = handle_message(db, request.session_id, request.message)

        response = ChatMessageResponse(
            session_id=request.session_id,
            content=result["content"],
            mode=result.get("mode"),
        )

        # Attach comparison table if present
        if result.get("comparison_table"):
            response.comparison_table = result["comparison_table"]

        # Attach recommendations if present
        if result.get("recommendations"):
            response.recommendations = result["recommendations"]

        # Attach product IDs
        if result.get("product_ids"):
            response.product_ids = result["product_ids"]

        return response
    except Exception as e:
        logger.error(f"Error handling message: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error processing message")



@router.get("/session/history/{session_id}", response_model=ChatHistoryResponse)
def get_history(session_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get the full chat history for a session (owner only)."""
    session = chat_service.get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if str(session.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")

    messages = chat_service.get_session_history(db, session_id)

    return ChatHistoryResponse(
        session_id=session_id,
        mode=str(session.mode),  # type: ignore
        messages=[
            ChatHistoryMessage(
                id=int(msg.id),  # type: ignore
                role=str(msg.role),  # type: ignore
                content=str(msg.content),  # type: ignore
                metadata=msg.metadata_,  # type: ignore
                created_at=msg.created_at,  # type: ignore
            )
            for msg in messages
        ],
    )

@router.get("/session/list")
def list_sessions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get sessions for the authenticated user only."""
    from database.models import ChatMessage, ChatSession
    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == str(current_user.id))
        .order_by(ChatSession.created_at.desc())
        .limit(50)
        .all()
    )
    result = []
    for s in sessions:
        first_msg = db.query(ChatMessage).filter(
            ChatMessage.session_id == s.id,
            ChatMessage.role == "user"
        ).order_by(ChatMessage.created_at.asc()).first()

        if first_msg and first_msg.content:
            text = str(first_msg.content)
            title = text[:35] + ("..." if len(text) > 35 else "")
            result.append({
                "session_id": str(s.id),
                "mode": str(s.mode),
                "title": title,
                "created_at": s.created_at,
            })

    return result


@router.delete("/session/{session_id}")
def delete_chat_session(session_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Delete a chat session (owner only)."""
    session = chat_service.get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if str(session.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Access denied")
    chat_service.delete_session(db, session_id)
    return {"status": "deleted"}
