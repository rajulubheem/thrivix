"""
Tool Management and Testing Endpoints
"""
from fastapi import APIRouter, HTTPException, Body
from typing import Dict, List, Any, Optional
import structlog
from pydantic import BaseModel

from app.api.v1.endpoints.settings import load_settings
from app.services.unified_tool_service import UnifiedToolService

router = APIRouter()
logger = structlog.get_logger()

class ToolTestRequest(BaseModel):
    tool_name: str
    parameters: Dict[str, Any]

class ToolTestResponse(BaseModel):
    success: bool
    result: Optional[Any]
    error: Optional[str]
    execution_time: float

@router.get("/tools/available")
async def get_available_tools():
    """
    Get list of all available tools with their status
    """
    try:
        # Load settings to get enabled tools
        settings = load_settings()
        
        # Get all tools from settings
        all_tools = []
        for tool_name, tool_config in settings.tools.items():
            tool_info = {
                "name": tool_name,
                "enabled": tool_config.enabled,
                "description": tool_config.description,
                "category": tool_config.category,
                "requires_approval": tool_config.requires_approval,
                "status": "enabled" if tool_config.enabled else "disabled"
            }
            all_tools.append(tool_info)
        
        # Group by category
        tools_by_category = {}
        for tool in all_tools:
            category = tool.get("category", "other")
            if category not in tools_by_category:
                tools_by_category[category] = []
            tools_by_category[category].append(tool)
        
        # Get summary
        enabled_count = sum(1 for tool in all_tools if tool["enabled"])
        
        return {
            "summary": {
                "total_tools": len(all_tools),
                "enabled_tools": enabled_count,
                "disabled_tools": len(all_tools) - enabled_count,
                "categories": list(tools_by_category.keys())
            },
            "tools": all_tools,
            "by_category": tools_by_category,
            "enabled_tool_names": [tool["name"] for tool in all_tools if tool["enabled"]]
        }
        
    except Exception as e:
        logger.error(f"Failed to get available tools: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/tools/test")
async def test_tool(request: ToolTestRequest):
    """
    Test a specific tool with given parameters
    """
    import time
    start_time = time.time()
    
    try:
        # Initialize tool service
        tool_service = UnifiedToolService()
        await tool_service.initialize()
        
        # Check if tool exists and is enabled
        settings = load_settings()
        if request.tool_name not in settings.tools:
            return ToolTestResponse(
                success=False,
                result=None,
                error=f"Tool '{request.tool_name}' not found",
                execution_time=time.time() - start_time
            )
        
        tool_config = settings.tools[request.tool_name]
        if not tool_config.enabled:
            return ToolTestResponse(
                success=False,
                result=None,
                error=f"Tool '{request.tool_name}' is disabled",
                execution_time=time.time() - start_time
            )
        
        # Execute the tool
        logger.info(f"Testing tool: {request.tool_name} with params: {request.parameters}")
        result = await tool_service.execute_tool(
            request.tool_name,
            request.parameters,
            agent_name="tool_tester"
        )
        
        execution_time = time.time() - start_time
        
        # Check result
        if result.get("success"):
            return ToolTestResponse(
                success=True,
                result=result.get("result"),
                error=None,
                execution_time=execution_time
            )
        else:
            return ToolTestResponse(
                success=False,
                result=None,
                error=result.get("error", "Unknown error"),
                execution_time=execution_time
            )
            
    except Exception as e:
        logger.error(f"Tool test failed: {e}")
        return ToolTestResponse(
            success=False,
            result=None,
            error=str(e),
            execution_time=time.time() - start_time
        )

@router.get("/tools/agents/{agent_name}")
async def get_agent_tools(agent_name: str):
    """
    Get tools available to a specific agent
    """
    try:
        from app.services.agent_factory import AgentFactory
        from app.services.agent_factory import AgentRole
        
        factory = AgentFactory()
        
        # Map agent name to role
        role_map = {
            "researcher": AgentRole.RESEARCHER,
            "architect": AgentRole.ARCHITECT,
            "developer": AgentRole.DEVELOPER,
            "reviewer": AgentRole.REVIEWER,
            "tester": AgentRole.TESTER,
            "devops": AgentRole.DEVOPS,
            "security": AgentRole.SECURITY,
            "data_scientist": AgentRole.DATA_SCIENTIST,
            "ml_engineer": AgentRole.ML_ENGINEER,
            "frontend_developer": AgentRole.FRONTEND_DEV,
            "backend_developer": AgentRole.BACKEND_DEV,
            "api_specialist": AgentRole.API_SPECIALIST,
            "database_expert": AgentRole.DATABASE_EXPERT,
            "cloud_architect": AgentRole.CLOUD_ARCHITECT,
            "ui_ux": AgentRole.UI_UX,
            "documentation": AgentRole.DOCUMENTATION,
            "project_manager": AgentRole.PROJECT_MANAGER,
            "business_analyst": AgentRole.BUSINESS_ANALYST,
            "qa_engineer": AgentRole.QA_ENGINEER
        }
        
        # Get the role
        role = role_map.get(agent_name.lower())
        if not role:
            return {
                "agent": agent_name,
                "error": f"Unknown agent: {agent_name}",
                "available_agents": list(role_map.keys())
            }
        
        # Get agent template
        template = factory.get_agent_template(role)
        if not template:
            return {
                "agent": agent_name,
                "error": f"No template found for agent: {agent_name}"
            }
        
        # Get enabled tools from settings
        settings = load_settings()
        enabled_tools = [name for name, tool in settings.tools.items() if tool.enabled]
        
        # Filter agent tools to only enabled ones
        agent_tools = template.tools
        available_tools = [tool for tool in agent_tools if tool in enabled_tools]
        unavailable_tools = [tool for tool in agent_tools if tool not in enabled_tools]
        
        return {
            "agent": agent_name,
            "role": role.value,
            "description": template.description,
            "configured_tools": agent_tools,
            "available_tools": available_tools,
            "unavailable_tools": unavailable_tools,
            "model": template.model,
            "temperature": template.temperature,
            "capabilities": template.capabilities
        }
        
    except Exception as e:
        logger.error(f"Failed to get agent tools: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tools/test-examples")
async def get_test_examples():
    """
    Get example test cases for each tool
    """
    return {
        "examples": [
            {
                "tool": "tavily_search",
                "description": "Web search tool",
                "test_params": {
                    "query": "latest Tesla news",
                    "max_results": 3
                }
            },
            {
                "tool": "file_write",
                "description": "Write content to a file",
                "test_params": {
                    "path": "/tmp/test.txt",
                    "content": "This is a test file"
                }
            },
            {
                "tool": "file_read",
                "description": "Read content from a file",
                "test_params": {
                    "path": "/tmp/test.txt"
                }
            },
            {
                "tool": "python_repl",
                "description": "Execute Python code",
                "test_params": {
                    "code": "print('Hello from Python!'); result = 2 + 2; print(f'2 + 2 = {result}')"
                }
            },
            {
                "tool": "shell",
                "description": "Execute safe shell commands",
                "test_params": {
                    "command": "echo 'Hello from shell'"
                }
            },
            {
                "tool": "use_aws",
                "description": "Interact with AWS services",
                "test_params": {
                    "service": "s3",
                    "action": "list_buckets"
                }
            },
            {
                "tool": "retrieve",
                "description": "Advanced retrieval from multiple sources",
                "test_params": {
                    "source": "vector_db",
                    "query": "serverless best practices",
                    "limit": 3
                }
            }
        ]
    }

@router.get("/tools/debug-info")
async def get_tools_debug_info():
    """
    Get detailed debugging information about tools
    """
    try:
        # Load settings
        settings = load_settings()
        
        # Initialize tool service
        tool_service = UnifiedToolService()
        await tool_service.initialize()
        
        # Get all tool info
        all_tools = tool_service.get_all_tools(enabled_only=False)
        enabled_tools = tool_service.get_all_tools(enabled_only=True)
        
        # Check which tools are actually callable
        callable_tools = []
        for tool in enabled_tools:
            try:
                # Check if tool executor exists
                if hasattr(tool_service, f"execute_{tool['name']}"):
                    callable_tools.append(tool['name'])
            except:
                pass
        
        return {
            "settings_file": "app_settings.json",
            "total_tools_configured": len(all_tools),
            "enabled_tools": len(enabled_tools),
            "enabled_tool_names": [t['name'] for t in enabled_tools],
            "disabled_tool_names": [t['name'] for t in all_tools if not t['enabled']],
            "callable_tools": callable_tools,
            "tool_categories": list(set(t.get('category', 'other') for t in all_tools)),
            "tools_by_approval": {
                "requires_approval": [t['name'] for t in all_tools if t.get('requires_approval', False)],
                "no_approval": [t['name'] for t in all_tools if not t.get('requires_approval', False)]
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to get debug info: {e}")
        return {
            "error": str(e),
            "message": "Failed to get tool debug information"
        }
