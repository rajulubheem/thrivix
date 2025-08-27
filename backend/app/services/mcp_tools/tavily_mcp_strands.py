"""
Tavily Web Search MCP Tool using Strands Agents MCP Protocol
Real web search using Tavily API with proper MCP integration
"""
import os
import json
from typing import Dict, Any, List, Optional
import aiohttp
import structlog
from datetime import datetime
from mcp.server import FastMCP
import asyncio

logger = structlog.get_logger()

# Create MCP server instance following Strands pattern
mcp = FastMCP("Tavily Search Server")

# Get API key from environment
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")


@mcp.tool(
    description="Search the web using Tavily API for current information, news, and research"
)
async def tavily_web_search(
    query: str,
    search_depth: str = "basic",
    max_results: int = 5,
    include_domains: Optional[List[str]] = None,
    exclude_domains: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Search the web using Tavily API
    
    Args:
        query: The search query
        search_depth: "basic" for quick results, "advanced" for comprehensive
        max_results: Number of results to return (1-10)
        include_domains: List of domains to include in search
        exclude_domains: List of domains to exclude from search
    
    Returns:
        Search results with answer and sources
    """
    try:
        if not TAVILY_API_KEY:
            return {
                "success": False,
                "error": "TAVILY_API_KEY not configured",
                "message": "Please set TAVILY_API_KEY environment variable"
            }
        
        # Build request payload
        payload = {
            "api_key": TAVILY_API_KEY,
            "query": query,
            "search_depth": search_depth,
            "max_results": max_results,
            "include_answer": True,
            "include_raw_content": False,
            "include_images": False
        }
        
        # Add domain filters if provided
        if include_domains:
            payload["include_domains"] = include_domains
        if exclude_domains:
            payload["exclude_domains"] = exclude_domains
        
        logger.info(f"🔍 Executing Tavily search: {query}")
        
        # Make API request
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.tavily.com/search",
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


@mcp.tool(
    description="Alternative Tavily search endpoint for compatibility"
)
async def tavily_search(query: str, **kwargs) -> Dict[str, Any]:
    """Alternative endpoint for backward compatibility"""
    return await tavily_web_search(query, **kwargs)


# For Strands Agents integration - create callable wrapper
class TavilyMCPWrapper:
    """Wrapper to make MCP tools callable by Strands agents"""
    
    def __init__(self):
        self.name = "tavily_web_search"
        self.description = "Search the web using Tavily API"
        
    async def __call__(self, **kwargs) -> Dict[str, Any]:
        """Execute the search"""
        return await tavily_web_search(**kwargs)
    
    def __repr__(self):
        return f"<TavilyMCPWrapper: {self.name}>"


# Create callable instance for agent registration
tavily_tool = TavilyMCPWrapper()


# Function to get MCP server for running
def get_mcp_server():
    """Get the MCP server instance"""
    return mcp


# For running as standalone MCP server
async def run_server():
    """Run the MCP server"""
    logger.info("Starting Tavily MCP Server...")
    # The FastMCP server handles the protocol
    await mcp.run()


if __name__ == "__main__":
    # Run as standalone MCP server
    asyncio.run(run_server())