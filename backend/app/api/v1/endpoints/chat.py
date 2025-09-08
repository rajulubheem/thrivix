from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import structlog

from app.core.database import get_db
from app.services.chat_service import ChatService
from app.schemas.chat import (
    ChatSessionCreate, ChatSessionUpdate, ChatSessionResponse,
    ChatMessageCreate, ChatMessageUpdate, ChatMessageResponse,
    ChatSessionWithMessages, ChatSessionSummary,
    MessageSearchRequest, SessionSearchRequest,
    MessageSearchResponse, SessionSearchResponse,
    ChatExecuteRequest
)
from app.services.enhanced_swarm_service import EnhancedSwarmService

logger = structlog.get_logger()

router = APIRouter()

def get_chat_service(db: AsyncSession = Depends(get_db)) -> ChatService:
    return ChatService(db)

def get_swarm_service(db: AsyncSession = Depends(get_db)) -> EnhancedSwarmService:
    return EnhancedSwarmService()

# For now, we'll use a simple user_id. In production, this would come from authentication
def get_current_user_id() -> str:
    return "default_user"

# Session Management Endpoints

@router.post("/sessions", response_model=ChatSessionResponse)
async def create_session(
    session_data: ChatSessionCreate,
    chat_service: ChatService = Depends(get_chat_service),
    user_id: str = Depends(get_current_user_id)
):
    """Create a new chat session"""
    try:
        return await chat_service.create_session(user_id, session_data)
    except Exception as e:
        logger.error("Failed to create session", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to create session")

@router.get("/sessions", response_model=List[ChatSessionSummary])
async def list_sessions(
    limit: int = Query(50, le=100, ge=1),
    offset: int = Query(0, ge=0),
    include_archived: bool = Query(False),
    chat_service: ChatService = Depends(get_chat_service),
    user_id: str = Depends(get_current_user_id)
):
    """List user's chat sessions"""
    try:
        return await chat_service.list_user_sessions(user_id, limit, offset, include_archived)
    except Exception as e:
        logger.error("Failed to list sessions", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to list sessions")

@router.get("/sessions/{session_id}", response_model=ChatSessionResponse)
async def get_session(
    session_id: str,
    chat_service: ChatService = Depends(get_chat_service),
    user_id: str = Depends(get_current_user_id)
):
    """Get a specific chat session"""
    session = await chat_service.get_session(session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@router.get("/sessions/{session_id}/messages", response_model=ChatSessionWithMessages)
async def get_session_with_messages(
    session_id: str,
    limit: int = Query(100, le=500, ge=1),
    offset: int = Query(0, ge=0),
    chat_service: ChatService = Depends(get_chat_service),
    user_id: str = Depends(get_current_user_id)
):
    """Get session with its messages"""
    session = await chat_service.get_session_with_messages(
        session_id, 
        user_id, 
        message_limit=limit,  # Fix parameter name
        message_offset=offset  # Fix parameter name
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@router.put("/sessions/{session_id}", response_model=ChatSessionResponse)
async def update_session(
    session_id: str,
    update_data: ChatSessionUpdate,
    chat_service: ChatService = Depends(get_chat_service),
    user_id: str = Depends(get_current_user_id)
):
    """Update a chat session"""
    session = await chat_service.update_session(session_id, user_id, update_data)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    chat_service: ChatService = Depends(get_chat_service),
    user_id: str = Depends(get_current_user_id)
):
    """Delete a chat session"""
    success = await chat_service.delete_session(session_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session deleted successfully"}

# Message Management Endpoints

@router.post("/sessions/{session_id}/messages", response_model=ChatMessageResponse)
async def add_message(
    session_id: str,
    message_data: ChatMessageCreate,
    chat_service: ChatService = Depends(get_chat_service),
    user_id: str = Depends(get_current_user_id)
):
    """Add a message to a session"""
    message = await chat_service.add_message(session_id, user_id, message_data)
    if not message:
        raise HTTPException(status_code=404, detail="Session not found")
    return message

@router.put("/messages/{message_id}", response_model=ChatMessageResponse)
async def update_message(
    message_id: str,
    update_data: ChatMessageUpdate,
    chat_service: ChatService = Depends(get_chat_service),
    user_id: str = Depends(get_current_user_id)
):
    """Update a message"""
    message = await chat_service.update_message(message_id, user_id, update_data)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    return message

@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: str,
    chat_service: ChatService = Depends(get_chat_service),
    user_id: str = Depends(get_current_user_id)
):
    """Delete a message"""
    success = await chat_service.delete_message(message_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Message not found")
    return {"message": "Message deleted successfully"}

# Search Endpoints

@router.post("/messages/search", response_model=MessageSearchResponse)
async def search_messages(
    search_request: MessageSearchRequest,
    chat_service: ChatService = Depends(get_chat_service),
    user_id: str = Depends(get_current_user_id)
):
    """Search messages across sessions"""
    try:
        messages, total = await chat_service.search_messages(user_id, search_request)
        return MessageSearchResponse(
            messages=messages,
            total=total,
            limit=search_request.limit,
            offset=search_request.offset
        )
    except Exception as e:
        logger.error("Failed to search messages", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to search messages")

@router.post("/sessions/search", response_model=SessionSearchResponse)
async def search_sessions(
    search_request: SessionSearchRequest,
    chat_service: ChatService = Depends(get_chat_service),
    user_id: str = Depends(get_current_user_id)
):
    """Search chat sessions"""
    try:
        sessions, total = await chat_service.search_sessions(user_id, search_request)
        return SessionSearchResponse(
            sessions=sessions,
            total=total,
            limit=search_request.limit,
            offset=search_request.offset
        )
    except Exception as e:
        logger.error("Failed to search sessions", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to search sessions")

# Execute Chat in Session

@router.post("/sessions/{session_id}/execute")
async def execute_chat(
    session_id: str,
    execute_request: ChatExecuteRequest,
    chat_service: ChatService = Depends(get_chat_service),
    swarm_service: EnhancedSwarmService = Depends(get_swarm_service),
    user_id: str = Depends(get_current_user_id)
):
    """Execute a chat message in a session with swarm agents"""
    try:
        # Verify session exists
        session = await chat_service.get_session(session_id, user_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Add user message to session
        user_message = ChatMessageCreate(
            content=execute_request.message,
            role="user",
            message_type="text"
        )
        await chat_service.add_message(session_id, user_id, user_message)
        
        # Get conversation history for context
        session_with_messages = await chat_service.get_session_with_messages(session_id, user_id, limit=50, offset=0)
        conversation_history = []
        if session_with_messages and session_with_messages.messages:
            # Exclude the message we just added (it will be the last one)
            for msg in session_with_messages.messages[:-1]:
                conversation_history.append({
                    "role": msg.role, 
                    "content": msg.content
                })

        # Prepare swarm execution
        from app.schemas.swarm import SwarmExecutionRequest
        
        swarm_request = SwarmExecutionRequest(
            task=execute_request.message,
            execution_mode=execute_request.execution_mode,
            max_handoffs=execute_request.max_handoffs or session.max_handoffs,
            max_iterations=execute_request.max_iterations or session.max_iterations,
            agents_config=execute_request.agents_config or session.agents_config or {}
        )

        # Execute with swarm
        execution_result = await swarm_service.execute_swarm_async(
            swarm_request, 
            user_id,
            conversation_history=conversation_history
        )

        # Add assistant response to session
        assistant_message = ChatMessageCreate(
            content=execution_result.result or "Task completed",
            role="assistant", 
            message_type="text",
            execution_id=execution_result.execution_id,
            message_metadata={
                "execution_id": execution_result.execution_id,
                "agents_used": execution_result.agent_sequence,
                "handoffs": execution_result.handoffs,
                "tokens_used": execution_result.tokens_used,
                "artifacts": execution_result.artifacts
            }
        )
        await chat_service.add_message(session_id, user_id, assistant_message)

        return {
            "execution_id": execution_result.execution_id,
            "session_id": session_id,
            "status": execution_result.status,
            "message": "Execution started successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to execute chat", error=str(e), session_id=session_id)
        raise HTTPException(status_code=500, detail="Failed to execute chat")

# Statistics and Analytics

@router.get("/stats")
async def get_chat_stats(
    chat_service: ChatService = Depends(get_chat_service),
    user_id: str = Depends(get_current_user_id)
):
    """Get user's chat statistics"""
    try:
        return await chat_service.get_session_stats(user_id)
    except Exception as e:
        logger.error("Failed to get chat stats", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to get statistics")

# Session Templates/Presets

@router.post("/sessions/{session_id}/duplicate", response_model=ChatSessionResponse)
async def duplicate_session(
    session_id: str,
    chat_service: ChatService = Depends(get_chat_service),
    user_id: str = Depends(get_current_user_id)
):
    """Duplicate a session with its configuration but without messages"""
    try:
        # Get original session
        original_session = await chat_service.get_session(session_id, user_id)
        if not original_session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Create new session with same configuration
        new_session_data = ChatSessionCreate(
            title=f"Copy of {original_session.title or 'Untitled Session'}",
            description=original_session.description,
            agents_config=original_session.agents_config,
            max_handoffs=original_session.max_handoffs,
            max_iterations=original_session.max_iterations
        )

        return await chat_service.create_session(user_id, new_session_data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to duplicate session", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to duplicate session")

@router.post("/sessions/{session_id}/archive")
async def archive_session(
    session_id: str,
    chat_service: ChatService = Depends(get_chat_service),
    user_id: str = Depends(get_current_user_id)
):
    """Archive a session"""
    update_data = ChatSessionUpdate(is_archived=True, is_active=False)
    session = await chat_service.update_session(session_id, user_id, update_data)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session archived successfully"}

@router.post("/sessions/{session_id}/restore")
async def restore_session(
    session_id: str,
    chat_service: ChatService = Depends(get_chat_service),
    user_id: str = Depends(get_current_user_id)
):
    """Restore an archived session"""
    update_data = ChatSessionUpdate(is_archived=False, is_active=True)
    session = await chat_service.update_session(session_id, user_id, update_data)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session restored successfully"}