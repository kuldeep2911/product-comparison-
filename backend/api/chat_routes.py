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

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/session/start", response_model=SessionStartResponse)
def start_session(request: SessionStartRequest, db: Session = Depends(get_db)):
    """Create a new chat session."""
    try:
        session = chat_service.start_session(db, mode=request.mode, user_id=request.user_id)
        return SessionStartResponse(
            session_id=str(session.id),
            mode=str(session.mode),
        )
    except Exception as e:
        logger.error(f"Error starting session: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create session")


@router.post("/chat/message", response_model=ChatMessageResponse)
def send_message(request: ChatMessageRequest, db: Session = Depends(get_db)):
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

@router.get("/debug_path")
def debug_path():
    import sys
    import services.ranking_engine as re
    return {"sys_path": sys.path, "ranking_engine": re.__file__}


@router.get("/session/history/{session_id}", response_model=ChatHistoryResponse)
def get_history(session_id: str, db: Session = Depends(get_db)):
    """Get the full chat history for a session."""
    session = chat_service.get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

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
def list_sessions(db: Session = Depends(get_db)):
    """Get a list of recent sessions with titles for the sidebar."""
    from database.models import ChatMessage
    sessions = chat_service.get_recent_sessions(db)
    result = []
    for s in sessions:
        first_msg = db.query(ChatMessage).filter(
            ChatMessage.session_id == s.id, 
            ChatMessage.role == "user"
        ).order_by(ChatMessage.created_at.asc()).first()
        
        # Determine title - skip empty sessions
        if first_msg and first_msg.content:
            text = str(first_msg.content)
            title = text[:35] + ("..." if len(text) > 35 else "")
            
            result.append({
                "session_id": str(s.id),
                "mode": str(s.mode),  # type: ignore
                "title": title,
                "created_at": s.created_at  # type: ignore
            })
            
    return result

@router.delete("/session/{session_id}")
def delete_chat_session(session_id: str, db: Session = Depends(get_db)):
    """Delete a chat session."""
    success = chat_service.delete_session(db, session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "deleted"}
