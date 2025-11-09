"""
Session API Endpoints

RESTful API for managing agent sessions.
"""
from fastapi import APIRouter, HTTPException, status
from typing import List, Optional
import structlog

from app.agentcore.schemas import SessionCreate, SessionResponse
from app.agentcore.services import get_session_manager

logger = structlog.get_logger()
router = APIRouter(prefix="/sessions", tags=["Sessions"])


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(session: SessionCreate):
    """Create a new agent session."""
    try:
        session_manager = get_session_manager()
        return session_manager.create_session(session)
    except Exception as e:
        logger.error("Failed to create session", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create session: {str(e)}"
        )


@router.get("", response_model=List[SessionResponse])
async def list_sessions(
    agent_id: Optional[str] = None,
    actor_id: Optional[str] = None
):
    """List active sessions with optional filtering."""
    try:
        session_manager = get_session_manager()
        return session_manager.list_active_sessions(agent_id=agent_id, actor_id=actor_id)
    except Exception as e:
        logger.error("Failed to list sessions", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list sessions: {str(e)}"
        )


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str):
    """Get session details by ID."""
    try:
        session_manager = get_session_manager()
        session = session_manager.get_session(session_id)

        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Session not found or expired: {session_id}"
            )

        return session
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get session", session_id=session_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get session: {str(e)}"
        )


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: str):
    """Delete/end a session."""
    try:
        session_manager = get_session_manager()
        session_manager.delete_session(session_id)
    except Exception as e:
        logger.error("Failed to delete session", session_id=session_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete session: {str(e)}"
        )


@router.get("/_stats", response_model=dict)
async def get_session_stats():
    """Get session manager statistics."""
    try:
        session_manager = get_session_manager()
        return session_manager.get_cache_stats()
    except Exception as e:
        logger.error("Failed to get session stats", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get session stats: {str(e)}"
        )
