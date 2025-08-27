"""
True Swarm API endpoints with conversation support
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import json
import asyncio
import uuid
import structlog

from app.core.database import get_db
from app.services.chat_service import ChatService
from app.services.enhanced_fixed_streaming_swarm import get_enhanced_streaming_swarm_service
from app.services.improved_dynamic_swarm import get_improved_dynamic_swarm_service
from app.schemas.chat import (
    ChatSessionCreate, ChatSessionResponse,
    ChatMessageCreate, ChatMessageResponse,
    ChatSessionWithMessages
)
from pydantic import BaseModel

logger = structlog.get_logger()

router = APIRouter()


class TrueSwarmExecuteRequest(BaseModel):
    """Request model for True Swarm execution"""
    message: str
    task_type: str = "general"  # general, research, coding
    swarm_mode: str = "dynamic"  # dynamic or fixed
    max_handoffs: int = 30
    max_iterations: int = 50
    agent_configs: Optional[dict] = None


def get_chat_service(db: AsyncSession = Depends(get_db)) -> ChatService:
    return ChatService(db)


def get_current_user_id() -> str:
    return "default_user"


@router.post("/sessions")
async def create_swarm_session(
    session_data: ChatSessionCreate,
    chat_service: ChatService = Depends(get_chat_service),
    user_id: str = Depends(get_current_user_id)
) -> ChatSessionResponse:
    """Create a new True Swarm chat session"""
    try:
        # Add default swarm configuration if not provided
        if not session_data.agents_config:
            session_data.agents_config = {
                "type": "true_swarm",
                "task_type": "general"
            }
        
        return await chat_service.create_session(user_id, session_data)
    except Exception as e:
        logger.error("Failed to create swarm session", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to create session")


@router.get("/sessions")
async def list_swarm_sessions(
    limit: int = Query(50, le=100, ge=1),
    offset: int = Query(0, ge=0),
    chat_service: ChatService = Depends(get_chat_service),
    user_id: str = Depends(get_current_user_id)
) -> List[dict]:
    """List user's True Swarm sessions"""
    try:
        sessions = await chat_service.list_user_sessions(user_id, limit, offset, include_archived=False)
        # Filter for true swarm sessions
        swarm_sessions = [
            s for s in sessions 
            if s.agents_config and s.agents_config.get("type") == "true_swarm"
        ]
        return swarm_sessions
    except Exception as e:
        logger.error("Failed to list swarm sessions", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to list sessions")


@router.get("/sessions/{session_id}")
async def get_swarm_session(
    session_id: str,
    chat_service: ChatService = Depends(get_chat_service),
    user_id: str = Depends(get_current_user_id)
) -> ChatSessionResponse:
    """Get a specific True Swarm session"""
    session = await chat_service.get_session(session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.get("/sessions/{session_id}/messages")
async def get_swarm_messages(
    session_id: str,
    limit: int = Query(100, le=500, ge=1),
    offset: int = Query(0, ge=0),
    chat_service: ChatService = Depends(get_chat_service),
    user_id: str = Depends(get_current_user_id)
) -> ChatSessionWithMessages:
    """Get True Swarm session with messages"""
    session = await chat_service.get_session_with_messages(session_id, user_id, limit, offset)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/sessions/{session_id}/execute")
async def execute_true_swarm(
    session_id: str,
    request: TrueSwarmExecuteRequest,
    chat_service: ChatService = Depends(get_chat_service),
    enhanced_swarm = Depends(get_enhanced_streaming_swarm_service),
    dynamic_swarm = Depends(get_improved_dynamic_swarm_service),
    user_id: str = Depends(get_current_user_id)
):
    """Execute True Swarm with streaming"""
    try:
        # Verify session exists
        session = await chat_service.get_session(session_id, user_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Add user message to session
        user_message = ChatMessageCreate(
            content=request.message,
            role="user",
            message_type="text"
        )
        await chat_service.add_message(session_id, user_id, user_message)
        
        # Get conversation history
        session_with_messages = await chat_service.get_session_with_messages(
            session_id, user_id, limit=20, offset=0
        )
        
        conversation_history = []
        if session_with_messages and session_with_messages.messages:
            for msg in session_with_messages.messages[:-1]:  # Exclude the message we just added
                conversation_history.append({
                    "role": msg.role,
                    "content": msg.content
                })
        
        # Generate execution ID
        execution_id = str(uuid.uuid4())
        
        # Choose swarm service based on mode
        if request.swarm_mode == "dynamic":
            swarm_service = dynamic_swarm
            # Dynamic swarm doesn't use predefined configs
            agent_configs = None
        else:
            swarm_service = enhanced_swarm
            # Get agent configs for fixed mode
            agent_configs = request.agent_configs
            if not agent_configs:
                agent_configs = swarm_service.get_default_agent_configs(request.task_type)
        
        # Stream the swarm execution
        async def event_stream():
            """Generate SSE events from swarm execution"""
            try:
                # Send initial event
                yield f"data: {json.dumps({'type': 'start', 'execution_id': execution_id, 'mode': request.swarm_mode})}\n\n"
                
                # Collect all output for final message
                final_output = []
                
                # Stream swarm events based on mode
                if request.swarm_mode == "dynamic":
                    # Improved dynamic swarm execution
                    async for event in swarm_service.execute_improved_swarm(
                        execution_id=execution_id,
                        task=request.message,
                        conversation_history=conversation_history
                    ):
                        yield f"data: {json.dumps(event)}\n\n"
                        if event.get("type") == "complete":
                            final_output.append(event.get("output", ""))
                        await asyncio.sleep(0.01)
                else:
                    # Fixed swarm execution
                    async for event in swarm_service.execute_streaming_swarm(
                        execution_id=execution_id,
                        task=request.message,
                        agent_configs=agent_configs,
                        max_handoffs=request.max_handoffs,
                        max_iterations=request.max_iterations,
                        conversation_history=conversation_history
                    ):
                        # Send event to client
                        yield f"data: {json.dumps(event)}\n\n"
                        
                        # Collect output
                        if event.get("type") == "complete":
                            final_output.append(event.get("output", ""))
                        elif event.get("type") == "tool_result" and event.get("success"):
                            # Include successful tool results
                            result = event.get("result", "")
                            if result and len(result) > 50:  # Only include substantial results
                                final_output.append(f"[{event.get('agent')}]: {result[:200]}")
                        
                        # Flush periodically
                        await asyncio.sleep(0.01)
                
                # Save assistant response
                assistant_content = "\n\n".join(final_output) if final_output else "Task completed"
                
                # Get agent list based on mode
                if request.swarm_mode == "dynamic":
                    agent_list = []  # Dynamic agents are created at runtime
                else:
                    agent_list = list(agent_configs.keys()) if agent_configs else []
                
                assistant_message = ChatMessageCreate(
                    content=assistant_content,
                    role="assistant",
                    message_type="text",
                    execution_id=execution_id,
                    message_metadata={
                        "execution_id": execution_id,
                        "swarm_type": "true_swarm",
                        "swarm_mode": request.swarm_mode,
                        "task_type": request.task_type,
                        "agents": agent_list
                    }
                )
                await chat_service.add_message(session_id, user_id, assistant_message)
                
                # Send completion event
                yield f"data: {json.dumps({'type': 'done', 'execution_id': execution_id})}\n\n"
                
            except Exception as e:
                logger.error(f"Streaming error: {e}", exc_info=True)
                yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
        
        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to execute true swarm", error=str(e), session_id=session_id)
        raise HTTPException(status_code=500, detail=f"Failed to execute: {str(e)}")


@router.delete("/sessions/{session_id}")
async def delete_swarm_session(
    session_id: str,
    chat_service: ChatService = Depends(get_chat_service),
    user_id: str = Depends(get_current_user_id)
):
    """Delete a True Swarm session"""
    success = await chat_service.delete_session(session_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session deleted successfully"}