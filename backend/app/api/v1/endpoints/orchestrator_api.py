"""
API endpoints for enhanced orchestrator functionality
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field
import structlog

from app.core.enhanced_orchestrator import (
    EnhancedOrchestrator,
    TaskComplexity,
    AgentRole
)
from app.services.ai_orchestrator import AIOrchestrator
from app.schemas.swarm import AgentConfig
from app.core.security import get_current_user

logger = structlog.get_logger()
router = APIRouter()


class TaskRequest(BaseModel):
    """Request model for task planning"""
    task: str = Field(..., description="The task to be completed")
    context: Optional[Dict[str, Any]] = Field(default=None, description="Additional context for the task")
    complexity_override: Optional[str] = Field(default=None, description="Override automatic complexity detection")
    max_agents: Optional[int] = Field(default=20, description="Maximum number of agents to create")
    parallel_execution: Optional[bool] = Field(default=True, description="Allow parallel agent execution")


class PlanResponse(BaseModel):
    """Response model for execution plan"""
    task_analysis: Dict[str, Any]
    complexity: str
    num_groups: int
    total_agents: int
    estimated_duration: int
    workflow_stages: list
    tool_allocation: Dict[str, list]
    success_metrics: list


@router.post("/plan", response_model=PlanResponse)
async def create_execution_plan(request: TaskRequest, current_user: dict = Depends(get_current_user)):
    """
    Create a comprehensive execution plan for a task with real agents
    """
    try:
        # Use both orchestrators - enhanced for planning, AI for agent creation
        enhanced_orchestrator = EnhancedOrchestrator()
        ai_orchestrator = AIOrchestrator()
        
        # Create the comprehensive execution plan
        plan = await enhanced_orchestrator.create_execution_plan(
            task=request.task,
            context=request.context
        )
        
        # Override complexity if requested
        if request.complexity_override:
            try:
                plan.complexity = TaskComplexity[request.complexity_override.upper()]
            except KeyError:
                pass
        
        # Calculate statistics
        total_agents = sum(len(group.agents) for group in plan.agent_groups)
        
        # Limit agents if necessary
        if request.max_agents and total_agents > request.max_agents:
            logger.warning(f"Limiting agents from {total_agents} to {request.max_agents}")
            # Trim agents from less critical groups
            # This is a simplified approach - in production, you'd want smarter trimming
            
        return PlanResponse(
            task_analysis=plan.task_analysis,
            complexity=plan.complexity.value,
            num_groups=len(plan.agent_groups),
            total_agents=total_agents,
            estimated_duration=plan.estimated_duration,
            workflow_stages=plan.workflow_stages,
            tool_allocation=plan.tool_allocation,
            success_metrics=plan.success_metrics
        )
        
    except Exception as e:
        logger.error(f"Error creating execution plan: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/plan/{task_id}")
async def get_plan_status(task_id: str):
    """
    Get the status of an execution plan
    """
    # This would retrieve the plan from a database or cache
    # For now, return a mock response
    return {
        "task_id": task_id,
        "status": "planning",
        "progress": 50,
        "message": "Analyzing task requirements..."
    }


@router.post("/execute/{plan_id}")
async def execute_plan(plan_id: str, background_tasks: BackgroundTasks):
    """
    Execute a previously created plan
    """
    # This would retrieve the plan and execute it
    # For now, return a mock response
    
    # Add to background tasks for async execution
    # background_tasks.add_task(execute_plan_async, plan_id)
    
    return {
        "plan_id": plan_id,
        "status": "executing",
        "message": "Plan execution started"
    }


@router.post("/orchestrate")
async def orchestrate_with_real_agents(request: TaskRequest, current_user: dict = Depends(get_current_user)):
    """
    Create and execute a comprehensive plan with real agent configuration
    This bridges the enhanced planner with the actual agent executor
    """
    try:
        # Step 1: Use enhanced orchestrator for comprehensive planning
        enhanced_orchestrator = EnhancedOrchestrator()
        plan = await enhanced_orchestrator.create_execution_plan(
            task=request.task,
            context=request.context
        )
        
        # Step 2: Use AI orchestrator to create real executable agents
        ai_orchestrator = AIOrchestrator()
        
        # First analyze with AI orchestrator
        analysis = await ai_orchestrator.analyze_task(request.task)
        
        # Generate real agents based on the enhanced plan
        real_agents = await ai_orchestrator.generate_agents(request.task, analysis)
        
        # Convert real agents to list format for response
        agents_list = []
        for agent in real_agents:
            agent_dict = {
                "name": agent.name,
                "description": agent.description,
                "system_prompt": agent.system_prompt,
                "tools": agent.tools,
                "model": agent.model,
                "role": "specialist",  # Default role
                "priority": 1
            }
            agents_list.append(agent_dict)
        
        # Step 3: Combine enhanced plan with real agents
        result = {
            "task": request.task,
            "analysis": {
                "task_type": analysis.task_type,
                "complexity": analysis.complexity,
                "domains": analysis.domains,
                "required_capabilities": analysis.required_capabilities,
                "suggested_workflow": analysis.suggested_workflow,
                "estimated_agents": analysis.estimated_agents,
                # Add enhanced analysis
                "identified_domains": plan.task_analysis["identified_domains"],
                "technical_requirements": plan.task_analysis["technical_requirements"],
                "deliverables": plan.task_analysis["deliverables"],
                "priority_aspects": plan.task_analysis["priority_aspects"]
            },
            "agents": agents_list,
            "workflow": analysis.suggested_workflow,
            "estimated_complexity": analysis.complexity,
            # Add enhanced plan details
            "plan": {
                "num_groups": len(plan.agent_groups),
                "total_agents": sum(len(group.agents) for group in plan.agent_groups),
                "workflow_stages": plan.workflow_stages,
                "tool_allocation": plan.tool_allocation,
                "success_metrics": plan.success_metrics,
                "estimated_duration": plan.estimated_duration
            }
        }
        
        return result
        
    except Exception as e:
        logger.error(f"Orchestration error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/agents")
async def list_available_agents():
    """
    List all available agent types and their capabilities
    """
    agents = []
    
    for role in AgentRole:
        agent_info = {
            "role": role.value,
            "name": role.name,
            "capabilities": get_agent_capabilities(role),
            "typical_tools": get_agent_tools(role)
        }
        agents.append(agent_info)
    
    return {"agents": agents}


@router.get("/tools")
async def list_available_tools():
    """
    List all available tools and their capabilities
    """
    orchestrator = EnhancedOrchestrator()
    
    tools = []
    for tool_name, capabilities in orchestrator.AVAILABLE_TOOLS.items():
        tools.append({
            "name": tool_name,
            "capabilities": capabilities,
            "categories": [cat for cat, tools_list in orchestrator.TOOL_CATEGORIES.items() if tool_name in tools_list]
        })
    
    return {"tools": tools}


@router.post("/analyze")
async def analyze_task(request: TaskRequest, current_user: dict = Depends(get_current_user)):
    """
    Analyze a task without creating a full execution plan
    """
    try:
        orchestrator = EnhancedOrchestrator()
        
        # Perform task analysis
        analysis = await orchestrator._analyze_task(request.task, request.context)
        
        # Determine complexity
        complexity = orchestrator._determine_complexity(analysis)
        
        return {
            "analysis": analysis,
            "complexity": complexity.value,
            "recommendation": get_task_recommendation(complexity, analysis)
        }
        
    except Exception as e:
        logger.error(f"Error analyzing task: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


def get_agent_capabilities(role: AgentRole) -> list:
    """
    Get capabilities for a specific agent role
    """
    capabilities_map = {
        AgentRole.PLANNER: ["strategic planning", "task breakdown", "resource allocation", "timeline creation"],
        AgentRole.RESEARCHER: ["information gathering", "best practices research", "documentation review", "trend analysis"],
        AgentRole.ARCHITECT: ["system design", "component architecture", "interface definition", "scalability planning"],
        AgentRole.DEVELOPER: ["code implementation", "API development", "database design", "integration"],
        AgentRole.DATA_ANALYST: ["data processing", "statistical analysis", "visualization", "insight generation"],
        AgentRole.TESTER: ["test creation", "quality assurance", "bug detection", "performance testing"],
        AgentRole.REVIEWER: ["code review", "documentation review", "quality assessment", "recommendation generation"],
        AgentRole.COORDINATOR: ["task coordination", "resource management", "progress tracking", "communication"],
        AgentRole.SPECIALIST: ["domain expertise", "specialized tasks", "advanced techniques", "optimization"],
        AgentRole.EXECUTOR: ["task execution", "command running", "process management", "output generation"],
        AgentRole.VALIDATOR: ["validation", "verification", "compliance checking", "standard enforcement"],
        AgentRole.OPTIMIZER: ["performance optimization", "resource optimization", "code optimization", "efficiency improvement"]
    }
    
    return capabilities_map.get(role, ["general tasks"])


def get_agent_tools(role: AgentRole) -> list:
    """
    Get typical tools for a specific agent role
    """
    tools_map = {
        AgentRole.PLANNER: ["tavily_search", "python_repl"],
        AgentRole.RESEARCHER: ["tavily_search", "api_client"],
        AgentRole.ARCHITECT: ["code_generator", "python_repl"],
        AgentRole.DEVELOPER: ["code_generator", "python_repl", "database", "file_manager"],
        AgentRole.DATA_ANALYST: ["python_repl", "database", "file_manager"],
        AgentRole.TESTER: ["validator", "python_repl", "api_client"],
        AgentRole.REVIEWER: ["python_repl", "file_manager"],
        AgentRole.COORDINATOR: ["python_repl", "api_client"],
        AgentRole.SPECIALIST: ["mcp_tools", "python_repl"],
        AgentRole.EXECUTOR: ["python_repl", "file_manager", "api_client"],
        AgentRole.VALIDATOR: ["validator", "python_repl"],
        AgentRole.OPTIMIZER: ["python_repl", "database", "validator"]
    }
    
    return tools_map.get(role, ["python_repl"])


def get_task_recommendation(complexity: TaskComplexity, analysis: Dict[str, Any]) -> str:
    """
    Get recommendation based on task complexity and analysis
    """
    if complexity == TaskComplexity.SIMPLE:
        return "This task is straightforward and can be completed with 1-2 specialized agents."
    elif complexity == TaskComplexity.MODERATE:
        return "This task requires moderate coordination between 3-4 agents with different specializations."
    elif complexity == TaskComplexity.COMPLEX:
        return "This is a complex task requiring 5-7 agents working in coordinated groups with careful planning."
    elif complexity == TaskComplexity.ADVANCED:
        return "This is an advanced task requiring a sophisticated swarm of 8+ agents with parallel execution and multiple stages."
    
    return "Task complexity assessment complete."