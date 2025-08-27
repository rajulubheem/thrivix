"""
Unified Orchestrator API - Single endpoint for all orchestration needs
"""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
import structlog

from app.core.unified_orchestrator import (
    unified_orchestrator,
    AgentCapability,
    AgentProfile,
    WorkflowStage,
    UnifiedPlan
)
from app.services.ai_orchestrator import AIOrchestrator
from app.schemas.swarm import AgentConfig
from app.core.security import get_current_user

logger = structlog.get_logger()
router = APIRouter()


class UnifiedTaskRequest(BaseModel):
    """Request for unified orchestration"""
    task: str = Field(..., description="The task to be completed")
    context: Optional[Dict[str, Any]] = Field(default=None, description="Additional context")
    custom_agents: Optional[List[Dict[str, Any]]] = Field(default=None, description="Custom agent configurations")
    max_agents: Optional[int] = Field(default=10, description="Maximum number of agents")
    use_mcp_tools: Optional[bool] = Field(default=True, description="Enable MCP tool integration")
    auto_execute: Optional[bool] = Field(default=False, description="Automatically start execution")


class AgentConfigRequest(BaseModel):
    """Request to configure a custom agent"""
    name: str = Field(..., description="Agent name")
    role: str = Field(..., description="Agent role")
    description: str = Field(..., description="Agent description")
    capabilities: List[str] = Field(..., description="List of capabilities")
    primary_tools: List[str] = Field(default=[], description="Primary tools for the agent")
    secondary_tools: List[str] = Field(default=[], description="Secondary tools")
    mcp_tools: List[str] = Field(default=[], description="MCP tools")
    instructions: List[str] = Field(..., description="Custom instructions (min 8)")
    knowledge: Dict[str, Any] = Field(default={}, description="Agent knowledge base")
    model: str = Field(default="gpt-4", description="LLM model to use")
    temperature: float = Field(default=0.7, description="Temperature for generation")


class WorkflowStageRequest(BaseModel):
    """Request to define a workflow stage"""
    name: str = Field(..., description="Stage name")
    description: str = Field(..., description="Stage description")
    agents: List[str] = Field(..., description="Agents involved")
    dependencies: List[str] = Field(default=[], description="Dependent stages")
    parallel: bool = Field(default=True, description="Can run in parallel")
    success_criteria: List[str] = Field(..., description="Success criteria")


@router.post("/orchestrate")
async def unified_orchestrate(
    request: UnifiedTaskRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """
    Main orchestration endpoint - creates and optionally executes a unified plan
    """
    try:
        logger.info(f"Creating unified plan for task: {request.task}")
        
        # If no custom agents provided, use AI to generate them
        if not request.custom_agents:
            logger.info("No custom agents provided, using AI to generate optimal agents")
            
            # Initialize AI orchestrator
            ai_orchestrator = AIOrchestrator()
            
            # Analyze task with AI (will auto-initialize)
            ai_analysis = await ai_orchestrator.analyze_task(request.task)
            logger.info(f"AI task analysis: {ai_analysis.model_dump()}")
            
            # Always use user's max_agents if provided
            original_estimated = ai_analysis.estimated_agents
            if request.max_agents:
                ai_analysis.estimated_agents = request.max_agents
                logger.info(f"Overriding AI estimated {original_estimated} agents with user's max_agents: {request.max_agents}")
            
            # Generate agents with AI
            ai_agents = await ai_orchestrator.generate_agents(request.task, ai_analysis)
            logger.info(f"AI generated {len(ai_agents)} agents (requested: {ai_analysis.estimated_agents})")
            
            # ALWAYS enforce the limit strictly
            if request.max_agents and len(ai_agents) > request.max_agents:
                ai_agents = ai_agents[:request.max_agents]
                logger.info(f"Strictly enforced limit: trimmed from {len(ai_agents)} to {request.max_agents} agents")
            
            # Convert AI agents to our format
            custom_agents = []
            for ai_agent in ai_agents:
                # Extract role and description properly
                if hasattr(ai_agent, 'description') and ai_agent.description:
                    role = ai_agent.description
                    description = ai_agent.description
                else:
                    role = ai_agent.name.replace('_', ' ').title()
                    description = f"Specialized agent for {role.lower()} tasks"
                
                # Extract capabilities if available, otherwise infer from tools
                capabilities = getattr(ai_agent, 'capabilities', [])
                if not capabilities and hasattr(ai_agent, 'tools'):
                    # Infer capabilities from tools
                    if any('search' in tool for tool in ai_agent.tools):
                        capabilities.append('web_search')
                    if any('file' in tool for tool in ai_agent.tools):
                        capabilities.append('file_operations')
                    if any('code' in tool or 'python' in tool for tool in ai_agent.tools):
                        capabilities.append('code_execution')
                
                # Clean up the system prompt to extract meaningful instructions
                system_prompt = ai_agent.system_prompt
                
                # Parse out the main task description before tool descriptions
                instructions = []
                if "Your task" in system_prompt:
                    # Extract the main task description
                    task_start = system_prompt.find("Your task")
                    task_end = system_prompt.find("AVAILABLE TOOLS:") if "AVAILABLE TOOLS:" in system_prompt else len(system_prompt)
                    task_description = system_prompt[task_start:task_end].strip()
                    
                    # Split into sentences and clean up
                    sentences = task_description.replace("Your task is to", "").strip().split(". ")
                    for sentence in sentences:
                        clean_sentence = sentence.strip()
                        if clean_sentence and not clean_sentence.startswith("Use the") and not clean_sentence.startswith("AVAILABLE"):
                            if not clean_sentence.endswith('.'):
                                clean_sentence += '.'
                            instructions.append(clean_sentence)
                else:
                    # Fallback: use first paragraph or first 200 chars
                    instructions = [ai_agent.system_prompt[:200]]
                
                # Add some default instructions based on capabilities
                if 'web_search' in capabilities:
                    instructions.append("Research and gather relevant information from web sources.")
                if 'code_execution' in capabilities:
                    instructions.append("Write and test code implementations.")
                if 'file_operations' in capabilities:
                    instructions.append("Manage and organize project files.")
                if 'data_analysis' in capabilities:
                    instructions.append("Analyze data and provide insights.")
                
                # Ensure we have at least 8 varied instructions
                additional_instructions = [
                    f"Monitor progress and adjust approach as needed.",
                    f"Document findings and decisions for transparency.",
                    f"Validate outputs against requirements.",
                    f"Optimize for efficiency and quality.",
                    f"Communicate status updates regularly.",
                    f"Apply best practices for {role.lower()} tasks.",
                    f"Ensure deliverables meet quality standards.",
                    f"Collaborate with other agents when needed."
                ]
                
                inst_index = 0
                while len(instructions) < 8 and inst_index < len(additional_instructions):
                    instructions.append(additional_instructions[inst_index])
                    inst_index += 1
                
                custom_agents.append({
                    "name": ai_agent.name,
                    "role": role,
                    "description": description,
                    "capabilities": capabilities,
                    "tools": ai_agent.tools,
                    "instructions": instructions[:10],  # Limit to 10 meaningful instructions
                    "model": getattr(ai_agent, 'model', 'gpt-4o-mini'),
                    "temperature": getattr(ai_agent, 'temperature', 0.7),
                    "knowledge": {}
                })
            
            request.custom_agents = custom_agents
            logger.info(f"Converted {len(custom_agents)} AI agents to custom format")
        
        # Create the unified plan with AI-generated or custom agents
        plan = await unified_orchestrator.create_unified_plan(
            task=request.task,
            context=request.context,
            custom_agents=request.custom_agents,
            max_agents=request.max_agents,
            use_mcp_tools=request.use_mcp_tools
        )
        
        # Convert to API response format
        agents_list = []
        for agent in plan.agents:
            agent_dict = {
                "name": agent.name,
                "role": agent.role,
                "description": agent.description,
                "capabilities": [cap.value for cap in agent.capabilities],
                "tools": agent.get_all_tools(),
                "primary_tools": agent.primary_tools,
                "secondary_tools": agent.secondary_tools,
                "mcp_tools": agent.mcp_tools,
                "instructions": agent.custom_instructions,
                "knowledge": agent.knowledge_base,
                "model": agent.model,
                "temperature": agent.temperature
            }
            agents_list.append(agent_dict)
        
        # Convert workflow to response format
        workflow_list = []
        for stage in plan.workflow:
            stage_dict = {
                "name": stage.name,
                "description": stage.description,
                "agents": stage.agents,
                "dependencies": stage.dependencies,
                "parallel": stage.parallel,
                "success_criteria": stage.success_criteria,
                "estimated_duration": stage.estimated_duration
            }
            workflow_list.append(stage_dict)
        
        # If auto_execute, convert to executable format and trigger
        executable_agents = None
        if request.auto_execute:
            # Use AI orchestrator to create executable agents
            ai_orchestrator = AIOrchestrator()
            
            # Convert our agents to executable format
            executable_agents = []
            for agent in plan.agents:
                agent_config = AgentConfig(
                    name=agent.name,
                    description=agent.description,
                    system_prompt=f"""You are {agent.name}, a {agent.role}.
                    
Your specialized knowledge includes: {agent.knowledge_base}

Your instructions:
{chr(10).join(f'- {inst}' for inst in agent.custom_instructions)}

You have access to the following tools:
Primary tools (you specialize in): {', '.join(agent.primary_tools)}
Secondary tools (you can use): {', '.join(agent.secondary_tools)}
MCP tools (advanced): {', '.join(agent.mcp_tools)}

Use your tools effectively to complete your tasks. Collaborate with other agents when needed.""",
                    tools=agent.get_all_tools(),
                    model=agent.model
                )
                executable_agents.append(agent_config)
            
            # TODO: Add background task to execute the swarm
            # background_tasks.add_task(execute_swarm, request.task, executable_agents)
        
        response = {
            "task": request.task,
            "complexity": plan.complexity,
            "agents": agents_list,
            "workflow": workflow_list,
            "tool_allocation": plan.tool_allocation,
            "success_metrics": plan.success_metrics,
            "estimated_duration": plan.estimated_duration,
            "parallel_execution": plan.parallel_execution,
            "executable_agents": executable_agents if request.auto_execute else None,
            "status": "executing" if request.auto_execute else "planned"
        }
        
        logger.info(f"✅ Unified plan created with {len(plan.agents)} agents and {len(plan.workflow)} stages")
        return response
        
    except Exception as e:
        logger.error(f"Unified orchestration failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/agents/templates")
async def get_agent_templates():
    """Get all available agent templates"""
    templates = []
    
    for name, template in unified_orchestrator.AGENT_TEMPLATES.items():
        templates.append({
            "name": name,
            "display_name": name.replace("_", " ").title(),
            "capabilities": [cap.value for cap in template.get("capabilities", [])],
            "primary_tools": template.get("primary_tools", []),
            "knowledge": template.get("knowledge", {})
        })
    
    return {"templates": templates}


@router.get("/capabilities")
async def get_capabilities():
    """Get all available agent capabilities"""
    capabilities = []
    
    for cap in AgentCapability:
        capabilities.append({
            "name": cap.name,
            "value": cap.value,
            "description": cap.value.replace("_", " ").title()
        })
    
    return {"capabilities": capabilities}


@router.get("/tools/available")
async def get_available_tools(
    include_mcp: bool = True,
    current_user: dict = Depends(get_current_user)
):
    """Get all available tools including MCP tools"""
    await unified_orchestrator.initialize()
    
    tools = []
    for tool_name, tool_info in unified_orchestrator.tool_service.all_tools.items():
        if not include_mcp and tool_info["source"] == "mcp":
            continue
            
        tools.append({
            "name": tool_name,
            "description": tool_info.get("description", ""),
            "source": tool_info["source"],
            "category": tool_info.get("category", "utilities"),
            "enabled": tool_info.get("enabled", True),
            "requires_approval": tool_info.get("requires_approval", False)
        })
    
    return {"tools": tools, "total": len(tools)}


@router.post("/agents/custom")
async def create_custom_agent(
    config: AgentConfigRequest,
    current_user: dict = Depends(get_current_user)
):
    """Create a custom agent configuration"""
    try:
        # Validate instructions
        if len(config.instructions) < 8:
            raise ValueError("Agents must have at least 8 detailed instructions")
        
        # Parse capabilities
        capabilities = []
        for cap_str in config.capabilities:
            try:
                capabilities.append(AgentCapability[cap_str.upper()])
            except KeyError:
                raise ValueError(f"Unknown capability: {cap_str}")
        
        # Create agent profile
        agent = AgentProfile(
            name=config.name,
            role=config.role,
            description=config.description,
            capabilities=capabilities,
            primary_tools=config.primary_tools,
            secondary_tools=config.secondary_tools,
            mcp_tools=config.mcp_tools,
            custom_instructions=config.instructions,
            knowledge_base=config.knowledge,
            model=config.model,
            temperature=config.temperature
        )
        
        # Return the created agent
        return {
            "agent": {
                "name": agent.name,
                "role": agent.role,
                "description": agent.description,
                "capabilities": [cap.value for cap in agent.capabilities],
                "tools": agent.get_all_tools(),
                "instructions": agent.custom_instructions,
                "knowledge": agent.knowledge_base
            },
            "status": "created"
        }
        
    except Exception as e:
        logger.error(f"Failed to create custom agent: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/workflow/validate")
async def validate_workflow(
    stages: List[WorkflowStageRequest],
    current_user: dict = Depends(get_current_user)
):
    """Validate a workflow configuration"""
    try:
        # Check for circular dependencies
        stage_names = [s.name for s in stages]
        for stage in stages:
            for dep in stage.dependencies:
                if dep not in stage_names:
                    raise ValueError(f"Stage '{stage.name}' depends on unknown stage '{dep}'")
        
        # Check agent availability
        all_agents = set()
        for stage in stages:
            all_agents.update(stage.agents)
        
        return {
            "valid": True,
            "stages": len(stages),
            "total_agents": len(all_agents),
            "message": "Workflow is valid"
        }
        
    except Exception as e:
        return {
            "valid": False,
            "error": str(e),
            "message": "Workflow validation failed"
        }


@router.get("/metrics/estimate")
async def estimate_task_metrics(
    task: str,
    max_agents: int = 10,
    current_user: dict = Depends(get_current_user)
):
    """Estimate metrics for a task without creating a full plan"""
    try:
        # Quick analysis
        analysis = await unified_orchestrator._analyze_task_deeply(task, None)
        complexity = unified_orchestrator._assess_complexity(analysis)
        
        # Estimate agent count
        estimated_agents = min(len(analysis["domains"]) + 2, max_agents)
        
        # Estimate duration
        duration_map = {
            "simple": 5,
            "moderate": 15,
            "complex": 30,
            "advanced": 60
        }
        
        return {
            "task": task,
            "complexity": complexity,
            "estimated_agents": estimated_agents,
            "estimated_duration": duration_map.get(complexity, 30),
            "domains": analysis["domains"],
            "deliverables": analysis["deliverables"],
            "parallel_possible": analysis.get("parallel_possible", True)
        }
        
    except Exception as e:
        logger.error(f"Failed to estimate metrics: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))