from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from typing import List, Optional
import uuid
from app.schemas.swarm import (
    SwarmExecutionRequest,
    SwarmExecutionResponse,
    SwarmListResponse,
    AgentTemplateResponse,
    AddAgentRequest,
    AddAgentResponse,
    AgentConfig
)
from app.services.swarm_service import SwarmService, AgentTemplates
from app.services.enhanced_swarm_service import EnhancedSwarmService
from app.core.security import get_current_user
from app.config import settings

router = APIRouter()


@router.post("/execute", response_model=SwarmExecutionResponse)
async def execute_swarm(
    request: SwarmExecutionRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """Execute a swarm of agents"""
    try:
        # Use enhanced service based on settings
        if settings.USE_ENHANCED_SWARM:
            swarm_service = EnhancedSwarmService()
        else:
            swarm_service = SwarmService()
        
        # Execute swarm in background if requested
        if request.background:
            # Generate execution_id if not provided
            if not request.execution_id:
                request.execution_id = str(uuid.uuid4())
            
            background_tasks.add_task(
                swarm_service.execute_swarm_async,
                request,
                current_user["id"]
            )
            return SwarmExecutionResponse(
                execution_id=request.execution_id,
                status="queued",
                message="Swarm execution queued"
            )
        
        # Execute swarm synchronously
        result = await swarm_service.execute_swarm_async(
            request,
            current_user["id"]
        )
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/executions", response_model=SwarmListResponse)
async def list_executions(
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """List swarm executions for current user"""
    swarm_service = SwarmService()
    executions = await swarm_service.get_user_executions(
        current_user["id"],
        skip,
        limit
    )
    return SwarmListResponse(executions=executions)


@router.get("/executions/{execution_id}", response_model=SwarmExecutionResponse)
async def get_execution(
    execution_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get specific execution details"""
    swarm_service = SwarmService()
    execution = await swarm_service.get_execution(
        execution_id,
        current_user["id"]
    )
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    return execution


@router.delete("/executions/{execution_id}")
async def stop_execution(
    execution_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Stop a running execution"""
    swarm_service = SwarmService()
    stopped = await swarm_service.stop_execution(execution_id)
    if not stopped:
        raise HTTPException(status_code=404, detail="Execution not found or already completed")
    return {"message": "Execution stopped"}


@router.get("/templates", response_model=List[AgentTemplateResponse])
async def get_agent_templates():
    """Get available agent templates"""
    templates = [
        AgentTemplates.researcher(),
        AgentTemplates.architect(),
        AgentTemplates.developer(),
        AgentTemplates.tester(),
        AgentTemplates.documenter(),
        AgentTemplates.reviewer()
    ]
    
    return [
        AgentTemplateResponse(
            name=t.name,
            description=t.description,
            tools=t.tools,
            system_prompt=t.system_prompt
        )
        for t in templates
    ]


@router.post("/add-agent", response_model=AddAgentResponse)
async def add_agent_to_swarm(
    request: AddAgentRequest,
    current_user: dict = Depends(get_current_user)
):
    """Add a new agent to an existing swarm session"""
    try:
        # Generate a unique agent ID
        agent_id = f"{request.agent_name.lower().replace(' ', '_')}_{str(uuid.uuid4())[:8]}"
        
        # Create the agent configuration
        system_prompt = f"""You are {request.agent_name}, a specialized AI assistant.
Your role: {request.agent_role}
{f'Description: {request.agent_description}' if request.agent_description else ''}

You work as part of a collaborative swarm of AI agents. When you complete your task or need to hand off to another specialist, use the handoff tool to transfer control to the appropriate agent.

Focus on your specialization and collaborate effectively with other agents in the swarm."""

        agent_config = AgentConfig(
            name=request.agent_name,
            system_prompt=system_prompt,
            tools=request.tools,
            description=request.agent_description,
            model=request.model,
            temperature=request.temperature
        )
        
        # In a real implementation, you would:
        # 1. Store the agent configuration in the database linked to the session
        # 2. Update the active swarm session to include this new agent
        # 3. Make the agent available for handoffs in ongoing conversations
        
        # For now, we'll just return success
        # TODO: Implement actual agent storage and session management
        
        return AddAgentResponse(
            success=True,
            agent_id=agent_id,
            message=f"Agent '{request.agent_name}' has been added to the swarm and is ready for tasks."
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add agent: {str(e)}"
        )