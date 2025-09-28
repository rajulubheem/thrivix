"""
Unified Tools API
Bridges frontend tool blocks with backend Strands agents
Ensures consistency between UI workflow creation and agent execution
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
import logging
import json

from app.core.security import get_current_user
from app.services.dynamic_tool_wrapper import StrandsToolRegistry, DynamicToolWrapper
from app.services.strands_tool_definitions import STRANDS_TOOL_SCHEMAS
from app.services.ai_state_machine_coordinator import AIStateMachineCoordinator, StateNode

logger = logging.getLogger(__name__)

router = APIRouter()


class UnifiedToolInfo(BaseModel):
    """Unified tool information for frontend and backend"""
    name: str
    display_name: str
    description: str
    category: str
    parameters: Dict[str, Any]
    examples: List[Dict[str, Any]]
    icon: Optional[str] = None
    color: Optional[str] = None
    available_in_agents: bool = True
    available_in_ui: bool = True


class WorkflowBlock(BaseModel):
    """Represents a workflow block from the frontend"""
    id: str
    type: str  # 'tool', 'analysis', 'decision', etc.
    tool_name: Optional[str] = None
    parameters: Dict[str, Any] = {}
    position: Optional[Dict[str, float]] = None
    connections: List[str] = []


class WorkflowExecutionRequest(BaseModel):
    """Request to execute a workflow created in the UI"""
    workflow_id: str
    blocks: List[WorkflowBlock]
    edges: List[Dict[str, Any]]
    context: Dict[str, Any] = {}
    use_agents: bool = True  # Whether to use Strands agents or direct tool execution


@router.get("/available", response_model=List[UnifiedToolInfo])
async def get_unified_tools(
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get all available tools with unified metadata for both UI and agents
    """
    try:
        # Get tools from Strands registry
        registry = StrandsToolRegistry()
        strands_tools = registry.get_available_tools()

        unified_tools = []

        # Merge with tool schemas for detailed parameter info
        for tool_name, tool_info in strands_tools.items():
            schema = STRANDS_TOOL_SCHEMAS.get(tool_name, {})

            # Skip if category filter doesn't match
            if category and tool_info.get("category") != category:
                continue

            # Build unified tool info
            unified = UnifiedToolInfo(
                name=tool_name,
                display_name=tool_name.replace("_", " ").title(),
                description=tool_info.get("description", schema.get("description", "")),
                category=tool_info.get("category", "general"),
                parameters=schema.get("parameters", {}),
                examples=schema.get("examples", []),
                icon=get_tool_icon(tool_name),
                color=get_category_color(tool_info.get("category", "general")),
                available_in_agents=True,
                available_in_ui=tool_name in STRANDS_TOOL_SCHEMAS
            )

            unified_tools.append(unified)

        return unified_tools

    except Exception as e:
        logger.error(f"Failed to get unified tools: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/categories")
async def get_tool_categories(
    current_user: dict = Depends(get_current_user)
):
    """
    Get all available tool categories
    """
    categories = {
        "file_operations": {
            "name": "File Operations",
            "icon": "FileText",
            "color": "#3B82F6",
            "description": "Read, write, and edit files"
        },
        "web": {
            "name": "Web & Network",
            "icon": "Globe",
            "color": "#F59E0B",
            "description": "Web search, HTTP requests, and APIs"
        },
        "code_execution": {
            "name": "Code Execution",
            "icon": "Code",
            "color": "#8B5CF6",
            "description": "Run Python, shell commands, calculations"
        },
        "utilities": {
            "name": "Utilities",
            "icon": "Wrench",
            "color": "#84CC16",
            "description": "Time, environment, system info"
        },
        "reasoning": {
            "name": "AI & Reasoning",
            "icon": "Brain",
            "color": "#F97316",
            "description": "Advanced reasoning and AI capabilities"
        },
        "memory": {
            "name": "Memory & Storage",
            "icon": "Database",
            "color": "#EC4899",
            "description": "Store and retrieve information"
        },
        "media": {
            "name": "Media",
            "icon": "Image",
            "color": "#6366F1",
            "description": "Images, speech, diagrams"
        },
        "planning": {
            "name": "Planning",
            "icon": "Target",
            "color": "#10B981",
            "description": "Task planning and execution"
        }
    }

    return categories


@router.post("/execute-workflow")
async def execute_workflow(
    request: WorkflowExecutionRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Execute a workflow created in the UI
    Can use either direct tool execution or Strands agents
    """
    try:
        workflow_id = request.workflow_id

        if request.use_agents:
            # Convert UI workflow to state machine for agent execution
            state_machine = convert_workflow_to_state_machine(
                request.blocks,
                request.edges
            )

            # Use AI State Machine Coordinator
            coordinator = AIStateMachineCoordinator()

            # Execute the state machine
            result = await coordinator.execute_graph(
                workflow_id,
                state_machine,
                request.context
            )

            return {
                "success": True,
                "workflow_id": workflow_id,
                "execution_type": "agent",
                "result": result
            }
        else:
            # Direct tool execution without agents
            results = {}

            for block in request.blocks:
                if block.tool_name:
                    # Execute tool directly
                    from app.api.v1.endpoints.tool_execution import execute_tool_logic

                    result = await execute_tool_logic(
                        block.tool_name,
                        block.parameters
                    )

                    results[block.id] = result

            return {
                "success": True,
                "workflow_id": workflow_id,
                "execution_type": "direct",
                "results": results
            }

    except Exception as e:
        logger.error(f"Failed to execute workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/validate-workflow")
async def validate_workflow(
    blocks: List[WorkflowBlock],
    edges: List[Dict[str, Any]],
    current_user: dict = Depends(get_current_user)
):
    """
    Validate a workflow before execution
    Checks tool availability, parameter requirements, etc.
    """
    try:
        issues = []
        warnings = []

        # Get available tools
        registry = StrandsToolRegistry()
        available_tools = registry.get_available_tools()

        for block in blocks:
            if block.tool_name:
                # Check if tool exists
                if block.tool_name not in available_tools:
                    issues.append(f"Tool '{block.tool_name}' not found in registry")
                    continue

                # Check required parameters
                schema = STRANDS_TOOL_SCHEMAS.get(block.tool_name)
                if schema:
                    required = schema.get("parameters", {}).get("required", [])
                    for param in required:
                        if param not in block.parameters:
                            issues.append(
                                f"Block '{block.id}': Missing required parameter '{param}' for tool '{block.tool_name}'"
                            )

                # Check if tool is available in agents
                if block.tool_name not in STRANDS_TOOL_SCHEMAS:
                    warnings.append(
                        f"Tool '{block.tool_name}' may not be fully supported in agent mode"
                    )

        # Validate connections
        block_ids = {b.id for b in blocks}
        for edge in edges:
            if edge.get("source") not in block_ids:
                issues.append(f"Edge source '{edge.get('source')}' not found")
            if edge.get("target") not in block_ids:
                issues.append(f"Edge target '{edge.get('target')}' not found")

        return {
            "valid": len(issues) == 0,
            "issues": issues,
            "warnings": warnings
        }

    except Exception as e:
        logger.error(f"Failed to validate workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def convert_workflow_to_state_machine(
    blocks: List[WorkflowBlock],
    edges: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Convert UI workflow blocks to a state machine for agent execution
    """
    states = {}

    # Find initial state (no incoming edges)
    incoming_edges = {edge["target"] for edge in edges}
    initial_blocks = [b for b in blocks if b.id not in incoming_edges]
    initial_state = initial_blocks[0].id if initial_blocks else blocks[0].id

    # Convert blocks to states
    for block in blocks:
        state = {
            "name": block.id,
            "type": block.type if block.type != "tool" else "tool_call",
            "task": f"Execute {block.tool_name or block.type}",
            "tools": [block.tool_name] if block.tool_name else [],
            "parameters": block.parameters,
            "transitions": {}
        }

        # Add transitions based on edges
        for edge in edges:
            if edge["source"] == block.id:
                # Default transition
                state["transitions"]["success"] = edge["target"]

        states[block.id] = state

    return {
        "name": "UI Workflow",
        "initial_state": initial_state,
        "states": states
    }


def get_tool_icon(tool_name: str) -> str:
    """Get icon for a tool"""
    icon_map = {
        "file_read": "FileText",
        "file_write": "FileText",
        "editor": "Edit3",
        "http_request": "Globe",
        "tavily_search": "Search",
        "python_repl": "Code",
        "shell": "Terminal",
        "calculator": "Calculator",
        "current_time": "Clock",
        "environment": "Settings",
        "memory": "Database",
        "think": "Brain",
        "generate_image": "Image",
        "diagram": "GitBranch",
        "task_planner": "Target",
        "use_aws": "Cloud"
    }
    return icon_map.get(tool_name, "Wrench")


def get_category_color(category: str) -> str:
    """Get color for a category"""
    color_map = {
        "file_operations": "#3B82F6",
        "web": "#F59E0B",
        "code_execution": "#8B5CF6",
        "utilities": "#84CC16",
        "reasoning": "#F97316",
        "memory": "#EC4899",
        "media": "#6366F1",
        "planning": "#10B981",
        "advanced": "#EF4444"
    }
    return color_map.get(category, "#6B7280")