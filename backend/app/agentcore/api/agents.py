"""
Agent API Endpoints

RESTful API for managing agents and invoking them.
"""
from fastapi import APIRouter, HTTPException, status
from typing import List, Optional
import structlog

from app.agentcore.schemas import (
    AgentCreate,
    AgentResponse,
    AgentUpdate,
    AgentInvokeRequest,
    AgentInvokeResponse
)
from app.agentcore.services import get_agent_manager

logger = structlog.get_logger()
router = APIRouter(prefix="/agents", tags=["Agents"])


@router.post("", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(agent: AgentCreate):
    """
    Create a new agent with Bedrock model and AgentCore integration.

    Automatically creates:
    - Memory resource (if enabled)
    - Bedrock model configuration
    - Session management

    Example:
    ```json
    {
        "name": "Customer Support Agent",
        "agent_type": "customer_support",
        "system_prompt": "You are a helpful customer support agent...",
        "model_config": {
            "model_id": "us.anthropic.claude-sonnet-4-20250514-v1:0",
            "temperature": 0.7
        }
    }
    ```
    """
    try:
        agent_manager = get_agent_manager()
        return agent_manager.create_agent(agent)
    except Exception as e:
        logger.error("Failed to create agent", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create agent: {str(e)}"
        )


@router.get("", response_model=List[AgentResponse])
async def list_agents(
    agent_type: Optional[str] = None,
    status_filter: Optional[str] = None
):
    """
    List all agents with optional filtering.

    Query parameters:
    - agent_type: Filter by agent type (automation, persona, etc.)
    - status_filter: Filter by status (active, inactive, error)
    """
    try:
        agent_manager = get_agent_manager()
        return agent_manager.list_agents(agent_type=agent_type, status=status_filter)
    except Exception as e:
        logger.error("Failed to list agents", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list agents: {str(e)}"
        )


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: str):
    """Get agent details by ID."""
    try:
        agent_manager = get_agent_manager()
        agent = agent_manager.get_agent(agent_id)

        if not agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Agent not found: {agent_id}"
            )

        return agent
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get agent", agent_id=agent_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get agent: {str(e)}"
        )


@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(agent_id: str, agent_update: AgentUpdate):
    """
    Update agent configuration.

    Can update:
    - System prompt
    - Model configuration
    - Tools and gateway settings
    - Knowledge base
    - Status
    """
    try:
        agent_manager = get_agent_manager()
        return agent_manager.update_agent(agent_id, agent_update)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        logger.error("Failed to update agent", agent_id=agent_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update agent: {str(e)}"
        )


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(agent_id: str):
    """Delete an agent."""
    try:
        agent_manager = get_agent_manager()
        agent_manager.delete_agent(agent_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        logger.error("Failed to delete agent", agent_id=agent_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete agent: {str(e)}"
        )


@router.post("/{agent_id}/invoke", response_model=AgentInvokeResponse)
async def invoke_agent(agent_id: str, invoke_request: AgentInvokeRequest):
    """
    Invoke an agent with a prompt.

    Features:
    - Session management (creates or reuses session)
    - Memory integration (stores conversation)
    - Tool usage
    - Streaming support (if enabled)

    Example:
    ```json
    {
        "prompt": "Help me with my order #12345",
        "actor_id": "user-123",
        "include_memory": true
    }
    ```
    """
    try:
        agent_manager = get_agent_manager()
        return agent_manager.invoke_agent(agent_id, invoke_request)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        logger.error(
            "Failed to invoke agent",
            agent_id=agent_id,
            error=str(e)
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to invoke agent: {str(e)}"
        )
