"""
Settings API endpoints for configuring models, agents, and swarm parameters
"""
from fastapi import APIRouter, HTTPException
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field
import json
import os
from app.core.config import settings

router = APIRouter()

class ModelConfig(BaseModel):
    """Model configuration for agents"""
    name: str
    provider: str = "openai"  # openai, anthropic, etc.
    max_tokens: int = Field(default=16000, ge=1, le=100000)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    top_p: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    frequency_penalty: Optional[float] = Field(default=None, ge=-2.0, le=2.0)
    presence_penalty: Optional[float] = Field(default=None, ge=-2.0, le=2.0)
    enabled: bool = True

class AgentConfig(BaseModel):
    """Configuration for individual agents"""
    name: str
    model: str = "gpt-4o-mini"
    max_tokens: int = Field(default=16000, ge=1, le=100000)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    system_prompt: Optional[str] = None
    tools: List[str] = Field(default_factory=list)
    enabled: bool = True

class ToolConfig(BaseModel):
    """Tool configuration"""
    name: str
    enabled: bool = True
    requires_approval: bool = True
    description: str = ""
    category: str = "general"  # web_search, file_ops, code_gen, etc.

class SwarmConfig(BaseModel):
    """Swarm execution configuration"""
    max_handoffs: int = Field(default=20, ge=1, le=100)
    max_iterations: int = Field(default=20, ge=1, le=100)
    execution_timeout: float = Field(default=900.0, ge=60.0, le=3600.0)  # 1-60 minutes
    node_timeout: float = Field(default=300.0, ge=30.0, le=1800.0)  # 30s-30min
    repetitive_handoff_detection_window: int = Field(default=8, ge=0, le=50)
    repetitive_handoff_min_unique_agents: int = Field(default=3, ge=1, le=20)

class SystemSettings(BaseModel):
    """Complete system settings"""
    models: Dict[str, ModelConfig] = Field(default_factory=dict)
    agents: Dict[str, AgentConfig] = Field(default_factory=dict)
    tools: Dict[str, ToolConfig] = Field(default_factory=dict)
    swarm: SwarmConfig = Field(default_factory=SwarmConfig)
    general: Dict[str, Any] = Field(default_factory=dict)

# File path resolution for settings
def _resolve_settings_file() -> str:
    """Resolve a robust path to app_settings.json.
    Checks CWD, then project root relative to this file.
    """
    candidates = []
    # 1) Current working directory
    candidates.append(os.path.abspath(os.path.join(os.getcwd(), "app_settings.json")))
    # 2) Project root (five levels up from this file -> backend/)
    here = os.path.abspath(os.path.dirname(__file__))
    project_root = os.path.abspath(os.path.join(here, "../../../.."))
    candidates.append(os.path.join(project_root, "app_settings.json"))
    # 3) Fallback: alongside backend/app
    backend_dir = os.path.abspath(os.path.join(here, "../../.."))
    candidates.append(os.path.join(backend_dir, "app_settings.json"))

    for path in candidates:
        if os.path.exists(path):
            return path
    # Default to CWD even if not present; will trigger defaults
    return candidates[0]

SETTINGS_FILE = _resolve_settings_file()

def load_settings() -> SystemSettings:
    """Load settings from file or return defaults"""
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, 'r') as f:
                data = json.load(f)
                return SystemSettings(**data)
        except Exception as e:
            print(f"Error loading settings: {e}")
    
    # Return default settings
    return SystemSettings(
        models={
            "gpt-4o": ModelConfig(
                name="GPT-4o",
                provider="openai",
                max_tokens=16000,
                temperature=0.7,
                enabled=True
            ),
            "gpt-4o-mini": ModelConfig(
                name="GPT-4o Mini",
                provider="openai",
                max_tokens=16000,
                temperature=0.7,
                enabled=True
            ),
            "gpt-3.5-turbo": ModelConfig(
                name="GPT-3.5 Turbo",
                provider="openai",
                max_tokens=4000,
                temperature=0.7,
                enabled=True
            )
        },
        agents={
            "researcher": AgentConfig(
                name="Research Specialist",
                model="gpt-4o-mini",
                max_tokens=16000,
                temperature=0.7,
                tools=["web_search", "document_analysis"],
                enabled=True
            ),
            "developer": AgentConfig(
                name="Developer",
                model="gpt-4o",
                max_tokens=16000,
                temperature=0.7,
                tools=["code_execution", "file_operations"],
                enabled=True
            ),
            "architect": AgentConfig(
                name="System Architect",
                model="gpt-4o",
                max_tokens=16000,
                temperature=0.7,
                tools=["documentation", "design"],
                enabled=True
            ),
            "reviewer": AgentConfig(
                name="Code Reviewer",
                model="gpt-4o-mini",
                max_tokens=16000,
                temperature=0.5,
                tools=["code_analysis", "testing"],
                enabled=True
            )
        },
        tools={
            "tavily_search": ToolConfig(
                name="tavily_search",
                enabled=True,
                requires_approval=True,
                description="Web search using Tavily for real-time information",
                category="web_search"
            ),
            "tavily_web_search": ToolConfig(
                name="tavily_web_search", 
                enabled=True,
                requires_approval=True,
                description="Advanced web search with Tavily",
                category="web_search"
            ),
            "file_write": ToolConfig(
                name="file_write",
                enabled=True,
                requires_approval=False,  # Auto-approve file writes
                description="Write content to files",
                category="file_operations"
            ),
            "file_read": ToolConfig(
                name="file_read",
                enabled=True,
                requires_approval=False,
                description="Read content from files",
                category="file_operations"
            ),
            "python_repl": ToolConfig(
                name="python_repl",
                enabled=True,
                requires_approval=False,  # Auto-approve Python execution  
                description="Execute Python code",
                category="code_execution"
            ),
            "shell": ToolConfig(
                name="shell",
                enabled=False,
                requires_approval=True,
                description="Execute shell commands",
                category="system"
            )
        },
        swarm=SwarmConfig(),
        general={
            "auto_save": True,
            "debug_mode": False,
            "streaming_enabled": True
        }
    )

def save_settings(settings_data: SystemSettings) -> bool:
    """Save settings to file"""
    try:
        with open(SETTINGS_FILE, 'w') as f:
            json.dump(settings_data.model_dump(), f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving settings: {e}")
        return False

@router.get("/", response_model=SystemSettings)
async def get_settings():
    """Get current system settings"""
    return load_settings()

@router.put("/", response_model=SystemSettings)
async def update_settings(new_settings: SystemSettings):
    """Update system settings"""
    if save_settings(new_settings):
        return new_settings
    raise HTTPException(status_code=500, detail="Failed to save settings")

@router.get("/models", response_model=Dict[str, ModelConfig])
async def get_model_configs():
    """Get all model configurations"""
    settings_data = load_settings()
    return settings_data.models

@router.put("/models/{model_id}", response_model=ModelConfig)
async def update_model_config(model_id: str, model_config: ModelConfig):
    """Update a specific model configuration"""
    settings_data = load_settings()
    settings_data.models[model_id] = model_config
    
    if save_settings(settings_data):
        return model_config
    raise HTTPException(status_code=500, detail="Failed to save model configuration")

@router.get("/agents", response_model=Dict[str, AgentConfig])
async def get_agent_configs():
    """Get all agent configurations"""
    settings_data = load_settings()
    return settings_data.agents

@router.put("/agents/{agent_id}", response_model=AgentConfig)
async def update_agent_config(agent_id: str, agent_config: AgentConfig):
    """Update a specific agent configuration"""
    settings_data = load_settings()
    settings_data.agents[agent_id] = agent_config
    
    if save_settings(settings_data):
        return agent_config
    raise HTTPException(status_code=500, detail="Failed to save agent configuration")

@router.get("/swarm", response_model=SwarmConfig)
async def get_swarm_config():
    """Get swarm execution configuration"""
    settings_data = load_settings()
    return settings_data.swarm

@router.put("/swarm", response_model=SwarmConfig)
async def update_swarm_config(swarm_config: SwarmConfig):
    """Update swarm execution configuration"""
    settings_data = load_settings()
    settings_data.swarm = swarm_config
    
    if save_settings(settings_data):
        return swarm_config
    raise HTTPException(status_code=500, detail="Failed to save swarm configuration")

@router.post("/reset")
async def reset_settings():
    """Reset all settings to defaults"""
    # Remove existing settings file to force loading defaults
    import os
    if os.path.exists(SETTINGS_FILE):
        os.remove(SETTINGS_FILE)
    
    # Load defaults (this will call the function that creates default settings)
    default_settings = load_settings()
    
    if save_settings(default_settings):
        return {"message": "Settings reset to defaults"}
    raise HTTPException(status_code=500, detail="Failed to reset settings")

@router.get("/available-models")
async def get_available_models():
    """Get list of available models"""
    return {
        "openai": [
            {"id": "gpt-4o", "name": "GPT-4o", "max_tokens": 128000},
            {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "max_tokens": 128000},
            {"id": "gpt-4", "name": "GPT-4", "max_tokens": 8192},
            {"id": "gpt-4-turbo", "name": "GPT-4 Turbo", "max_tokens": 128000},
            {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo", "max_tokens": 16385}
        ],
        "anthropic": [
            {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet", "max_tokens": 8192},
            {"id": "claude-3-opus-20240229", "name": "Claude 3 Opus", "max_tokens": 4096},
            {"id": "claude-3-haiku-20240307", "name": "Claude 3 Haiku", "max_tokens": 4096}
        ]
    }

@router.get("/available-tools")
async def get_available_tools():
    """Get list of all available tools from unified tool service"""
    try:
        from app.services.unified_tool_service import get_unified_tools
        
        tool_service = await get_unified_tools()
        available_tools = tool_service.get_all_tools(enabled_only=False)
        
        return {
            "success": True,
            "data": {
                "tools": available_tools,
                "count": len(available_tools)
            }
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to get available tools: {str(e)}",
            "data": {
                "tools": {
                    "tavily_search": {"name": "Web Search", "description": "Search the web for information"},
                    "file_operations": {"name": "File Operations", "description": "Read and write files"},
                    "code_execution": {"name": "Code Execution", "description": "Execute code in various languages"}
                },
                "count": 3
            }
        }

@router.get("/tools", response_model=Dict[str, ToolConfig])
async def get_tool_configs():
    """Get all tool configurations"""
    settings_data = load_settings()
    return settings_data.tools

@router.put("/tools/{tool_id}", response_model=ToolConfig)
async def update_tool_config(tool_id: str, tool_config: ToolConfig):
    """Update a specific tool configuration"""
    settings_data = load_settings()
    settings_data.tools[tool_id] = tool_config
    
    if save_settings(settings_data):
        return tool_config
    raise HTTPException(status_code=500, detail="Failed to save tool configuration")

@router.get("/tools/enabled")
async def get_enabled_tools():
    """Get list of enabled tools from settings"""
    try:
        settings = load_settings()
        enabled_tools = {
            name: tool for name, tool in settings.tools.items() 
            if tool.enabled
        }
        
        return {
            "success": True,
            "data": {
                "tools": enabled_tools,
                "count": len(enabled_tools)
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
