"""
Memory API Endpoints

RESTful API for managing AgentCore Memory resources.
"""
from fastapi import APIRouter, HTTPException, status
import structlog

from app.agentcore.schemas import MemoryCreate, MemoryResponse, EventCreate
from app.agentcore.services import MemoryService

logger = structlog.get_logger()
router = APIRouter(prefix="/memory", tags=["Memory"])


@router.post("", response_model=MemoryResponse, status_code=status.HTTP_201_CREATED)
async def create_memory(memory: MemoryCreate):
    """
    Create a new memory resource with strategies.

    Strategies:
    - semantic: For factual information
    - summary: For conversation summaries
    - user_preference: For user preferences
    - custom: For custom extraction logic
    """
    try:
        memory_service = MemoryService()
        return memory_service.create_memory_resource(memory)
    except Exception as e:
        logger.error("Failed to create memory", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create memory: {str(e)}"
        )


@router.get("/{memory_id}")
async def get_memory(memory_id: str):
    """Get memory resource details."""
    try:
        memory_service = MemoryService()
        return memory_service.get_memory(memory_id)
    except Exception as e:
        logger.error("Failed to get memory", memory_id=memory_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get memory: {str(e)}"
        )


@router.post("/events")
async def create_event(event: EventCreate):
    """Store a conversation event in memory."""
    try:
        memory_service = MemoryService()
        return memory_service.create_event(event)
    except Exception as e:
        logger.error("Failed to create event", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create event: {str(e)}"
        )


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_memory(memory_id: str):
    """Delete a memory resource."""
    try:
        memory_service = MemoryService()
        memory_service.delete_memory(memory_id)
    except Exception as e:
        logger.error("Failed to delete memory", memory_id=memory_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete memory: {str(e)}"
        )
