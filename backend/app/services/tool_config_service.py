"""
Tool Configuration Service
Manages tool settings, availability, and MCP servers
"""

import json
import os
from typing import List, Dict, Any, Optional
from datetime import datetime
import asyncio
import structlog
from pathlib import Path

from app.schemas.tool_config import (
    ToolConfig, MCPServerConfig, ToolCategory, ToolStatus,
    ToolSettingsUpdate, MCPServerUpdate, ToolsConfigResponse,
    ToolTestRequest, ToolTestResponse
)
from app.tools.strands_tool_registry import strands_tool_registry
from app.services.mcp_integration import create_mcp_integration

logger = structlog.get_logger()


class ToolConfigService:
    """Service for managing tool configurations"""
    
    def __init__(self):
        self.config_file = Path("tool_config.json")
        self.tools: Dict[str, ToolConfig] = {}
        self.mcp_servers: Dict[str, MCPServerConfig] = {}
        self._load_config()
        self._initialize_default_tools()
    
    def _load_config(self):
        """Load configuration from file"""
        if self.config_file.exists():
            try:
                with open(self.config_file, 'r') as f:
                    data = json.load(f)
                    
                # Load tools
                for tool_data in data.get('tools', []):
                    tool = ToolConfig(**tool_data)
                    self.tools[tool.id] = tool
                
                # Load MCP servers
                for server_data in data.get('mcp_servers', []):
                    server = MCPServerConfig(**server_data)
                    self.mcp_servers[server.id] = server
                    
                logger.info(f"Loaded {len(self.tools)} tools and {len(self.mcp_servers)} MCP servers")
            except Exception as e:
                logger.error(f"Failed to load config: {e}")
    
    def _save_config(self):
        """Save configuration to file"""
        try:
            data = {
                'tools': [tool.model_dump() for tool in self.tools.values()],
                'mcp_servers': [server.model_dump() for server in self.mcp_servers.values()],
                'last_updated': datetime.utcnow().isoformat()
            }
            
            with open(self.config_file, 'w') as f:
                json.dump(data, f, indent=2, default=str)
                
            logger.info("Configuration saved successfully")
        except Exception as e:
            logger.error(f"Failed to save config: {e}")
    
    def _initialize_default_tools(self):
        """Initialize default tool configurations"""
        default_tools = [
            # Web Search Tools
            ToolConfig(
                id="tavily_search",
                name="Tavily Web Search",
                description="Search the web using Tavily API for current information",
                category=ToolCategory.WEB_SEARCH,
                enabled=True,
                requires_approval=True,
                icon="🔍",
                required_env_vars=["TAVILY_API_KEY"],
                config={
                    "search_depth": "basic",
                    "max_results": 5,
                    "include_raw_content": False,
                    "include_images": False
                }
            ),
            
            # File Operations
            ToolConfig(
                id="file_write",
                name="File Write",
                description="Create or write files to the filesystem",
                category=ToolCategory.FILE_OPERATIONS,
                enabled=True,
                requires_approval=True,
                icon="📝",
                config={
                    "max_file_size": 10485760,  # 10MB
                    "allowed_extensions": [".txt", ".py", ".js", ".json", ".md", ".html", ".css"]
                }
            ),
            
            ToolConfig(
                id="file_read",
                name="File Read",
                description="Read files from the filesystem",
                category=ToolCategory.FILE_OPERATIONS,
                enabled=True,
                requires_approval=False,
                icon="📖",
                config={
                    "max_file_size": 10485760  # 10MB
                }
            ),
            
            # Code Execution
            ToolConfig(
                id="python_repl",
                name="Python REPL",
                description="Execute Python code in a sandboxed environment",
                category=ToolCategory.CODE_EXECUTION,
                enabled=False,  # Disabled by default for security
                requires_approval=True,
                icon="🐍",
                config={
                    "timeout": 30,
                    "max_output_size": 50000
                }
            ),
            
            # Data Analysis
            ToolConfig(
                id="data_query",
                name="Data Query",
                description="Query and analyze structured data",
                category=ToolCategory.DATA_ANALYSIS,
                enabled=True,
                requires_approval=False,
                icon="📊"
            ),
            
            # Utilities
            ToolConfig(
                id="calculator",
                name="Calculator",
                description="Perform mathematical calculations",
                category=ToolCategory.UTILITIES,
                enabled=True,
                requires_approval=False,
                icon="🧮"
            ),
            
            ToolConfig(
                id="task_create",
                name="Task Creator",
                description="Create and manage tasks",
                category=ToolCategory.UTILITIES,
                enabled=True,
                requires_approval=False,
                icon="📋"
            )
        ]
        
        # Add default tools if they don't exist
        for tool in default_tools:
            if tool.id not in self.tools:
                self.tools[tool.id] = tool
                logger.info(f"Added default tool: {tool.name}")
        
        # Initialize default MCP servers
        default_servers = [
            MCPServerConfig(
                id="weather-mcp",
                name="Weather MCP Server",
                command="npx",
                args=["@modelcontextprotocol/server-weather"],
                enabled=False,
                auto_start=False,
                env={"OPENWEATHER_API_KEY": ""}
            ),
            
            MCPServerConfig(
                id="github-mcp",
                name="GitHub MCP Server",
                command="npx",
                args=["@modelcontextprotocol/server-github"],
                enabled=False,
                auto_start=False,
                env={"GITHUB_TOKEN": ""}
            )
        ]
        
        for server in default_servers:
            if server.id not in self.mcp_servers:
                self.mcp_servers[server.id] = server
                logger.info(f"Added default MCP server: {server.name}")
        
        # Save initial config
        if not self.config_file.exists():
            self._save_config()
    
    async def get_all_tools(self) -> List[ToolConfig]:
        """Get all tool configurations"""
        return list(self.tools.values())
    
    async def get_enabled_tools(self) -> List[ToolConfig]:
        """Get only enabled tools"""
        return [tool for tool in self.tools.values() if tool.enabled]
    
    async def get_tool(self, tool_id: str) -> Optional[ToolConfig]:
        """Get specific tool configuration"""
        return self.tools.get(tool_id)
    
    async def update_tool(self, update: ToolSettingsUpdate) -> ToolConfig:
        """Update tool settings"""
        tool = self.tools.get(update.tool_id)
        if not tool:
            raise ValueError(f"Tool {update.tool_id} not found")
        
        # Update fields
        if update.enabled is not None:
            tool.enabled = update.enabled
            tool.status = ToolStatus.ENABLED if update.enabled else ToolStatus.DISABLED
        
        if update.requires_approval is not None:
            tool.requires_approval = update.requires_approval
        
        if update.config is not None:
            tool.config.update(update.config)
        
        if update.rate_limit is not None:
            tool.rate_limit = update.rate_limit
        
        if update.timeout is not None:
            tool.timeout = update.timeout
        
        if update.allowed_agents is not None:
            tool.allowed_agents = update.allowed_agents
        
        if update.blocked_agents is not None:
            tool.blocked_agents = update.blocked_agents
        
        self._save_config()
        logger.info(f"Updated tool {tool.name}: enabled={tool.enabled}")
        
        # Update the tool registry
        await self._sync_with_registry()
        
        return tool
    
    async def get_all_mcp_servers(self) -> List[MCPServerConfig]:
        """Get all MCP server configurations"""
        return list(self.mcp_servers.values())
    
    async def get_mcp_server(self, server_id: str) -> Optional[MCPServerConfig]:
        """Get specific MCP server configuration"""
        return self.mcp_servers.get(server_id)
    
    async def update_mcp_server(self, update: MCPServerUpdate) -> MCPServerConfig:
        """Update MCP server settings"""
        server = self.mcp_servers.get(update.server_id)
        if not server:
            raise ValueError(f"MCP Server {update.server_id} not found")
        
        # Update fields
        if update.enabled is not None:
            server.enabled = update.enabled
        
        if update.auto_start is not None:
            server.auto_start = update.auto_start
        
        if update.env is not None:
            server.env.update(update.env)
        
        if update.args is not None:
            server.args = update.args
        
        self._save_config()
        logger.info(f"Updated MCP server {server.name}: enabled={server.enabled}")
        
        # Restart server if needed
        if server.enabled and server.auto_start:
            await self._start_mcp_server(server)
        elif not server.enabled:
            await self._stop_mcp_server(server)
        
        return server
    
    async def add_custom_tool(self, tool: ToolConfig) -> ToolConfig:
        """Add a custom tool"""
        if tool.id in self.tools:
            raise ValueError(f"Tool {tool.id} already exists")
        
        self.tools[tool.id] = tool
        self._save_config()
        logger.info(f"Added custom tool: {tool.name}")
        
        await self._sync_with_registry()
        return tool
    
    async def remove_tool(self, tool_id: str) -> bool:
        """Remove a tool (only custom tools)"""
        tool = self.tools.get(tool_id)
        if not tool:
            return False
        
        if tool.category != ToolCategory.CUSTOM:
            raise ValueError("Cannot remove non-custom tools")
        
        del self.tools[tool_id]
        self._save_config()
        logger.info(f"Removed tool: {tool_id}")
        
        await self._sync_with_registry()
        return True
    
    async def test_tool(self, request: ToolTestRequest) -> ToolTestResponse:
        """Test a tool with sample parameters"""
        tool = self.tools.get(request.tool_id)
        if not tool:
            return ToolTestResponse(
                tool_id=request.tool_id,
                success=False,
                error="Tool not found",
                execution_time=0,
                timestamp=datetime.utcnow()
            )
        
        if not tool.enabled:
            return ToolTestResponse(
                tool_id=request.tool_id,
                success=False,
                error="Tool is disabled",
                execution_time=0,
                timestamp=datetime.utcnow()
            )
        
        # Test the tool
        start_time = asyncio.get_event_loop().time()
        try:
            result = await strands_tool_registry.execute_tool(
                request.tool_id,
                request.test_params
            )
            
            execution_time = asyncio.get_event_loop().time() - start_time
            
            return ToolTestResponse(
                tool_id=request.tool_id,
                success=result.get('success', False),
                result=result,
                error=result.get('error'),
                execution_time=execution_time,
                timestamp=datetime.utcnow()
            )
        except Exception as e:
            execution_time = asyncio.get_event_loop().time() - start_time
            return ToolTestResponse(
                tool_id=request.tool_id,
                success=False,
                error=str(e),
                execution_time=execution_time,
                timestamp=datetime.utcnow()
            )
    
    async def get_configuration(self) -> ToolsConfigResponse:
        """Get complete tools configuration"""
        # Calculate statistics
        enabled_tools = len([t for t in self.tools.values() if t.enabled])
        total_usage = sum(t.usage_count for t in self.tools.values())
        
        categories = []
        for cat in ToolCategory:
            cat_tools = [t for t in self.tools.values() if t.category == cat]
            categories.append({
                "id": cat.value,
                "name": cat.value.replace('_', ' ').title(),
                "count": len(cat_tools),
                "enabled": len([t for t in cat_tools if t.enabled])
            })
        
        return ToolsConfigResponse(
            tools=list(self.tools.values()),
            mcp_servers=list(self.mcp_servers.values()),
            categories=categories,
            statistics={
                "total_tools": len(self.tools),
                "enabled_tools": enabled_tools,
                "total_usage": total_usage,
                "mcp_servers": len(self.mcp_servers),
                "active_servers": len([s for s in self.mcp_servers.values() if s.status == "running"])
            }
        )
    
    async def _sync_with_registry(self):
        """Sync enabled/disabled state with tool registry"""
        try:
            # Update registry with enabled tools only
            enabled_tools = await self.get_enabled_tools()
            
            # This would update the actual tool registry
            # For now, we'll log the sync
            logger.info(f"Synced {len(enabled_tools)} enabled tools with registry")
        except Exception as e:
            logger.error(f"Failed to sync with registry: {e}")
    
    async def _start_mcp_server(self, server: MCPServerConfig):
        """Start an MCP server"""
        try:
            # This would actually start the MCP server process
            # For now, update status
            server.status = "running"
            server.last_connected = datetime.utcnow()
            self._save_config()
            logger.info(f"Started MCP server: {server.name}")
        except Exception as e:
            server.status = "error"
            server.error_message = str(e)
            self._save_config()
            logger.error(f"Failed to start MCP server {server.name}: {e}")
    
    async def _stop_mcp_server(self, server: MCPServerConfig):
        """Stop an MCP server"""
        try:
            # This would actually stop the MCP server process
            server.status = "stopped"
            self._save_config()
            logger.info(f"Stopped MCP server: {server.name}")
        except Exception as e:
            logger.error(f"Failed to stop MCP server {server.name}: {e}")
    
    def is_tool_allowed_for_agent(self, tool_id: str, agent_name: str) -> bool:
        """Check if a tool is allowed for a specific agent"""
        tool = self.tools.get(tool_id)
        if not tool or not tool.enabled:
            return False
        
        # Check blocked agents
        if agent_name in tool.blocked_agents:
            return False
        
        # Check allowed agents (empty means all allowed)
        if tool.allowed_agents and agent_name not in tool.allowed_agents:
            return False
        
        return True
    
    def get_tools_for_agent(self, agent_name: str) -> List[str]:
        """Get list of tool IDs available for a specific agent"""
        available_tools = []
        for tool in self.tools.values():
            if tool.enabled and self.is_tool_allowed_for_agent(tool.id, agent_name):
                available_tools.append(tool.id)
        return available_tools


# Global instance
tool_config_service = ToolConfigService()