"""
Agent Management API Endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any
import structlog
from app.services.agent_factory import AgentFactory, AgentRole
from app.schemas.swarm import AgentConfig
from app.core.security import get_current_user

logger = structlog.get_logger()
router = APIRouter()

# Global agent factory instance
agent_factory = AgentFactory()


@router.get("/roles", response_model=List[str])
async def get_available_roles():
    """Get list of available agent roles"""
    return agent_factory.get_available_roles()


@router.get("/templates", response_model=Dict[str, Any])
async def get_agent_templates():
    """Get all agent templates"""
    templates = {}
    for role in AgentRole:
        template = agent_factory.get_agent_template(role)
        if template:
            templates[role.value] = {
                "name": template.name,
                "description": template.description,
                "capabilities": template.capabilities,
                "tools": template.tools,
                "model": template.model
            }
    return templates


@router.post("/create", response_model=AgentConfig)
async def create_agent(
    role: str,
    config: Dict[str, Any] = {},
    current_user: dict = Depends(get_current_user)
):
    """Create an agent from a role template with optional customization"""
    try:
        agent_role = AgentRole(role)
        agent = agent_factory.create_agent(agent_role, **config)
        return agent
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/create_custom", response_model=AgentConfig)
async def create_custom_agent(
    config: Dict[str, Any],
    current_user: dict = Depends(get_current_user)
):
    """Create a completely custom agent"""
    if not config.get("name"):
        raise HTTPException(status_code=400, detail="Agent name is required")
    
    if not config.get("system_prompt"):
        raise HTTPException(status_code=400, detail="System prompt is required")
    
    agent = agent_factory.create_custom_agent(config)
    return agent


@router.post("/suggest", response_model=List[AgentConfig])
async def suggest_agents_for_task(
    task: str,
    current_user: dict = Depends(get_current_user)
):
    """Suggest appropriate agents for a given task"""
    if not task:
        raise HTTPException(status_code=400, detail="Task description is required")
    
    agents = agent_factory.get_agents_for_task(task)
    return agents


@router.get("/presets", response_model=Dict[str, List[Dict[str, Any]]])
async def get_agent_presets():
    """Get predefined agent team presets for common tasks"""
    presets = {
        "api_development": [
            {"role": "api_specialist", "name": "API Designer"},
            {"role": "backend_developer", "name": "Backend Implementation"},
            {"role": "database_expert", "name": "Database Design"},
            {"role": "tester", "name": "API Testing"}
        ],
        "data_analysis": [
            {"role": "data_scientist", "name": "Data Analyst"},
            {"role": "ml_engineer", "name": "ML Implementation"},
            {"role": "documentation", "name": "Report Generator"}
        ],
        "full_stack_app": [
            {"role": "architect", "name": "System Architect"},
            {"role": "frontend_developer", "name": "Frontend Dev"},
            {"role": "backend_developer", "name": "Backend Dev"},
            {"role": "database_expert", "name": "Database Dev"},
            {"role": "devops", "name": "DevOps Engineer"}
        ],
        "security_audit": [
            {"role": "security", "name": "Security Auditor"},
            {"role": "tester", "name": "Penetration Tester"},
            {"role": "documentation", "name": "Compliance Reporter"}
        ],
        "cloud_migration": [
            {"role": "cloud_architect", "name": "Cloud Designer"},
            {"role": "devops", "name": "Migration Engineer"},
            {"role": "security", "name": "Security Validator"}
        ],
        "mobile_app": [
            {"role": "ui_ux", "name": "Mobile UX Designer"},
            {"role": "mobile_developer", "name": "Mobile Developer"},
            {"role": "api_specialist", "name": "API Developer"},
            {"role": "tester", "name": "Mobile Tester"}
        ]
    }
    return presets


@router.post("/validate", response_model=Dict[str, Any])
async def validate_agent_config(
    config: Dict[str, Any],
    current_user: dict = Depends(get_current_user)
):
    """Validate an agent configuration"""
    errors = []
    warnings = []
    
    # Required fields
    if not config.get("name"):
        errors.append("Agent name is required")
    
    if not config.get("system_prompt"):
        errors.append("System prompt is required")
    
    # Validate tools
    tools = config.get("tools", [])
    valid_tools = [
        "web_search", "code_interpreter", "document_analysis",
        "diagram_generator", "data_analyzer", "ml_toolkit",
        "visualization_generator", "api_generator", "test_generator"
    ]
    
    for tool in tools:
        if tool not in valid_tools:
            warnings.append(f"Unknown tool: {tool}")
    
    # Validate model
    model = config.get("model", "gpt-4-turbo-preview")
    valid_models = ["gpt-4-turbo-preview", "gpt-4", "gpt-3.5-turbo"]
    if model not in valid_models:
        warnings.append(f"Unknown model: {model}")
    
    # Temperature validation
    temp = config.get("temperature", 0.3)
    if not 0 <= temp <= 2:
        errors.append("Temperature must be between 0 and 2")
    
    # Max tokens validation
    max_tokens = config.get("max_tokens", 16000)
    if not 1 <= max_tokens <= 32000:
        errors.append("Max tokens must be between 1 and 32000")
    
    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "config": config
    }