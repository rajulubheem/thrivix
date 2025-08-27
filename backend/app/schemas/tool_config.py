"""
Tool Configuration Schemas
Manages tool settings, MCP servers, and tool availability
"""

from typing import Optional, Dict, Any, List
from datetime import datetime
from pydantic import BaseModel, Field
from enum import Enum


class ToolCategory(str, Enum):
    """Tool categories for organization"""
    WEB_SEARCH = "web_search"
    FILE_OPERATIONS = "file_operations"
    CODE_EXECUTION = "code_execution"
    DATA_ANALYSIS = "data_analysis"
    COMMUNICATION = "communication"
    MCP_EXTERNAL = "mcp_external"
    UTILITIES = "utilities"
    AI_MODELS = "ai_models"
    CUSTOM = "custom"


class ToolStatus(str, Enum):
    """Tool availability status"""
    ENABLED = "enabled"
    DISABLED = "disabled"
    ERROR = "error"
    NOT_CONFIGURED = "not_configured"


class MCPServerConfig(BaseModel):
    """MCP Server Configuration"""
    id: str = Field(..., description="Unique server ID")
    name: str = Field(..., description="Server display name")
    command: str = Field(..., description="Command to start server")
    args: List[str] = Field(default_factory=list, description="Command arguments")
    env: Dict[str, str] = Field(default_factory=dict, description="Environment variables")
    enabled: bool = Field(default=True, description="Whether server is enabled")
    auto_start: bool = Field(default=True, description="Auto-start on app launch")
    status: str = Field(default="stopped", description="Current server status")
    last_connected: Optional[datetime] = None
    error_message: Optional[str] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": "weather-server",
                "name": "Weather MCP Server",
                "command": "node",
                "args": ["weather-server.js"],
                "env": {"API_KEY": "xxx"},
                "enabled": True,
                "auto_start": True,
                "status": "running"
            }
        }


class ToolConfig(BaseModel):
    """Individual Tool Configuration"""
    id: str = Field(..., description="Unique tool ID")
    name: str = Field(..., description="Tool display name")
    description: str = Field(..., description="Tool description")
    category: ToolCategory = Field(..., description="Tool category")
    enabled: bool = Field(default=True, description="Whether tool is enabled")
    status: ToolStatus = Field(default=ToolStatus.ENABLED)
    
    # Tool metadata
    version: Optional[str] = None
    author: Optional[str] = None
    icon: Optional[str] = None  # Icon name or URL
    
    # Configuration
    config: Dict[str, Any] = Field(default_factory=dict, description="Tool-specific config")
    required_env_vars: List[str] = Field(default_factory=list, description="Required environment variables")
    
    # Permissions and limits
    requires_approval: bool = Field(default=False, description="Requires user approval")
    rate_limit: Optional[int] = Field(None, description="Max calls per minute")
    max_retries: int = Field(default=3, description="Max retry attempts")
    timeout: int = Field(default=30, description="Timeout in seconds")
    
    # MCP association
    mcp_server_id: Optional[str] = Field(None, description="Associated MCP server ID")
    
    # Usage tracking
    usage_count: int = Field(default=0, description="Total usage count")
    last_used: Optional[datetime] = None
    error_count: int = Field(default=0, description="Total error count")
    last_error: Optional[str] = None
    
    # Agent restrictions
    allowed_agents: List[str] = Field(default_factory=list, description="Specific agents allowed (empty = all)")
    blocked_agents: List[str] = Field(default_factory=list, description="Specific agents blocked")
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": "tavily_search",
                "name": "Tavily Web Search",
                "description": "Search the web using Tavily API",
                "category": "web_search",
                "enabled": True,
                "status": "enabled",
                "requires_approval": True,
                "config": {
                    "api_key": "tvly-xxx",
                    "search_depth": "basic",
                    "max_results": 5
                }
            }
        }


class ToolSettingsUpdate(BaseModel):
    """Request to update tool settings"""
    tool_id: str
    enabled: Optional[bool] = None
    requires_approval: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None
    rate_limit: Optional[int] = None
    timeout: Optional[int] = None
    allowed_agents: Optional[List[str]] = None
    blocked_agents: Optional[List[str]] = None


class MCPServerUpdate(BaseModel):
    """Request to update MCP server"""
    server_id: str
    enabled: Optional[bool] = None
    auto_start: Optional[bool] = None
    env: Optional[Dict[str, str]] = None
    args: Optional[List[str]] = None


class ToolsConfigResponse(BaseModel):
    """Complete tools configuration response"""
    tools: List[ToolConfig]
    mcp_servers: List[MCPServerConfig]
    categories: List[Dict[str, Any]]  # Category metadata
    statistics: Dict[str, Any]  # Usage statistics


class ToolTestRequest(BaseModel):
    """Request to test a tool"""
    tool_id: str
    test_params: Dict[str, Any] = Field(default_factory=dict)


class ToolTestResponse(BaseModel):
    """Tool test result"""
    tool_id: str
    success: bool
    result: Optional[Any] = None
    error: Optional[str] = None
    execution_time: float
    timestamp: datetime