"""
Tavily Web Search MCP Tool
Real web search using Tavily API with MCP protocol
"""
import os
import json
from typing import Dict, Any, List, Optional
import aiohttp
import structlog
from datetime import datetime

logger = structlog.get_logger()

class TavilySearchTool:
    """MCP-compatible Tavily search tool"""
    
    def __init__(self):
        self.api_key = os.getenv("TAVILY_API_KEY")
        if not self.api_key:
            logger.warning("TAVILY_API_KEY not found in environment")
        self.base_url = "https://api.tavily.com"
        
    @property
    def name(self) -> str:
        return "tavily_web_search"
    
    @property
    def description(self) -> str:
        return "Search the web using Tavily API for current information, news, and research"
    
    @property
    def parameters(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query"
                },
                "search_depth": {
                    "type": "string",
                    "enum": ["basic", "advanced"],
                    "description": "Search depth - basic for quick results, advanced for comprehensive",
                    "default": "basic"
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return",
                    "default": 5,
                    "minimum": 1,
                    "maximum": 10
                },
                "include_domains": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of domains to include in search",
                    "default": []
                },
                "exclude_domains": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of domains to exclude from search",
                    "default": []
                }
            },
            "required": ["query"]
        }
    
    async def execute(self, **kwargs) -> Dict[str, Any]:
        """Execute Tavily search"""
        try:
            if not self.api_key:
                return {
                    "success": False,
                    "error": "TAVILY_API_KEY not configured",
                    "message": "Please set TAVILY_API_KEY environment variable"
                }
            
            query = kwargs.get("query")
            if not query:
                return {
                    "success": False,
                    "error": "Query parameter is required"
                }
            
            # Build request payload
            payload = {
                "api_key": self.api_key,
                "query": query,
                "search_depth": kwargs.get("search_depth", "basic"),
                "max_results": kwargs.get("max_results", 5),
                "include_answer": True,
                "include_raw_content": False,
                "include_images": False
            }
            
            # Add domain filters if provided
            include_domains = kwargs.get("include_domains", [])
            if include_domains:
                payload["include_domains"] = include_domains
                
            exclude_domains = kwargs.get("exclude_domains", [])
            if exclude_domains:
                payload["exclude_domains"] = exclude_domains
            
            logger.info(f"🔍 Executing Tavily search: {query}")
            
            # Make API request
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/search",
                    json=payload,
                    headers={"Content-Type": "application/json"}
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"Tavily API error: {response.status} - {error_text}")
                        return {
                            "success": False,
                            "error": f"API error: {response.status}",
                            "message": error_text
                        }
                    
                    data = await response.json()
                    
                    # Format results
                    results = []
                    for result in data.get("results", []):
                        results.append({
                            "title": result.get("title"),
                            "url": result.get("url"),
                            "content": result.get("content"),
                            "score": result.get("score")
                        })
                    
                    formatted_response = {
                        "success": True,
                        "query": query,
                        "answer": data.get("answer", ""),
                        "results": results,
                        "result_count": len(results),
                        "search_time": datetime.utcnow().isoformat()
                    }
                    
                    logger.info(f"✅ Tavily search completed: {len(results)} results")
                    return formatted_response
                    
        except Exception as e:
            logger.error(f"Tavily search error: {e}")
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to execute web search"
            }
    
    def to_mcp_tool(self) -> Dict[str, Any]:
        """Convert to MCP tool format"""
        return {
            "name": self.name,
            "description": self.description,
            "inputSchema": self.parameters
        }


class TavilyMCPServer:
    """MCP Server for Tavily tools"""
    
    def __init__(self):
        self.search_tool = TavilySearchTool()
        self.tools = {
            "tavily_web_search": self.search_tool
        }
        
    async def list_tools(self) -> List[Dict[str, Any]]:
        """List available MCP tools"""
        return [tool.to_mcp_tool() for tool in self.tools.values()]
    
    async def call_tool(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Call an MCP tool"""
        if name not in self.tools:
            return {
                "error": f"Tool '{name}' not found",
                "available_tools": list(self.tools.keys())
            }
        
        tool = self.tools[name]
        result = await tool.execute(**arguments)
        
        # Format for MCP response
        return {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(result, indent=2)
                }
            ]
        }
    
    async def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Handle MCP protocol request"""
        method = request.get("method")
        
        if method == "tools/list":
            tools = await self.list_tools()
            return {
                "tools": tools
            }
        
        elif method == "tools/call":
            params = request.get("params", {})
            name = params.get("name")
            arguments = params.get("arguments", {})
            return await self.call_tool(name, arguments)
        
        else:
            return {
                "error": f"Unknown method: {method}"
            }


# Global instance
tavily_mcp_server = TavilyMCPServer()