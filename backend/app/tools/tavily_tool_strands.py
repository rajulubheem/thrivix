"""
Tavily Search Tool for Strands Agents - Properly Decorated Version
"""
import os
import json
import asyncio
from typing import Optional, Callable
import structlog
from strands import tool

logger = structlog.get_logger()


def create_tavily_tool(agent_name: str = "research", callback_handler: Optional[Callable] = None):
    """Create Tavily search tool that works with Strands agents"""
    
    @tool
    async def tavily_search(query: str) -> dict:
        """Search the web for current information.
        
        Args:
            query: The search query to find information about
            
        Returns:
            Search results with status and content
        """
        if not query:
            return {"status": "error", "content": [{"text": "Query parameter is required"}]}
        
        try:
            from tavily import TavilyClient
            
            api_key = os.getenv("TAVILY_API_KEY")
            if not api_key:
                logger.error("TAVILY_API_KEY not configured")
                return {"status": "error", "content": [{"text": "TAVILY_API_KEY not configured"}]}
            
            logger.info(f"🔍 Executing Tavily search: {query}")
            
            # Execute search
            client = TavilyClient(api_key=api_key)
            response = await asyncio.to_thread(
                client.search,
                query=query,
                search_depth="basic",
                max_results=5
            )
            
            logger.info(f"✅ Tavily search completed: {len(response.get('results', []))} results")
            
            # Return in the format expected by Strands
            return {
                "status": "success",
                "content": [{
                    "json": response
                }]
            }
            
        except Exception as e:
            logger.error(f"Tavily search error: {e}")
            return {"status": "error", "content": [{"text": str(e)}]}
    
    return tavily_search


# Create a default instance
tavily_search = create_tavily_tool()