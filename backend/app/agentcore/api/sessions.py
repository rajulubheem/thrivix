"""
Session API Endpoints

RESTful API for managing agent sessions with FileSessionManager integration.
"""
from fastapi import APIRouter, HTTPException, status
from typing import List, Optional
import structlog

from app.agentcore.services import get_agent_session_manager

logger = structlog.get_logger()
router = APIRouter(prefix="/sessions", tags=["Sessions"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_session(agent_id: str, actor_id: str, session_expiry_seconds: int = 3600):
    """
    Create a new agent session.

    Returns session_id to use in subsequent invocations.
    Session stores conversation history via FileSessionManager.
    """
    try:
        session_mgr = get_agent_session_manager()
        session_id = session_mgr.create_session(
            agent_id=agent_id,
            actor_id=actor_id,
            session_expiry_seconds=session_expiry_seconds
        )
        return {"session_id": session_id, "agent_id": agent_id, "actor_id": actor_id}
    except Exception as e:
        logger.error("Failed to create session", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create session: {str(e)}"
        )


@router.get("")
async def list_sessions(
    agent_id: Optional[str] = None,
    actor_id: Optional[str] = None
):
    """List active sessions with optional filtering."""
    try:
        session_mgr = get_agent_session_manager()
        return session_mgr.list_sessions(agent_id=agent_id, actor_id=actor_id)
    except Exception as e:
        logger.error("Failed to list sessions", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list sessions: {str(e)}"
        )


@router.get("/{session_id}")
async def get_session(session_id: str):
    """Get session details by ID."""
    try:
        session_mgr = get_agent_session_manager()
        session_info = session_mgr.get_session_info(session_id)

        if not session_info:
            # Check if session exists on disk
            if not session_mgr.validate_session(session_id):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Session not found or expired: {session_id}"
                )
            return {"session_id": session_id, "status": "active", "source": "disk"}

        return session_info
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
    """
    Delete/end a session (metadata only).

    Note: Conversation history files remain on disk for reference.
    """
    try:
        session_mgr = get_agent_session_manager()
        session_mgr.delete_session(session_id)
    except Exception as e:
        logger.error("Failed to delete session", session_id=session_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete session: {str(e)}"
        )
