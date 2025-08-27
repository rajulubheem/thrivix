"""
Tavily Search Tool Implementation for Strands Agents
Following the strands_tools pattern
"""
import os
import json
from typing import Dict, Any, Optional, Union
from tavily import TavilyClient
import structlog

logger = structlog.get_logger()

TOOL_SPEC = {
    "name": "tavily_search",
    "description": (
        "Real-time web search optimized for AI agents with comprehensive results. "
        "Uses Tavily API to search the web for current information, news, and research. "
        "Returns search results with sources, URLs, and AI-generated answer summaries."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search query"
            },
            "search_depth": {
                "type": "string",
                "enum": ["basic", "advanced"],
                "description": "Search depth - 'basic' for quick results (default), 'advanced' for comprehensive search",
                "default": "basic"
            },
            "max_results": {
                "type": "integer",
                "description": "Maximum number of results to return (1-10)",
                "default": 5,
                "minimum": 1,
                "maximum": 10
            },
            "include_answer": {
                "type": "boolean",
                "description": "Include AI-generated answer summary",
                "default": True
            },
            "include_raw_content": {
                "type": "boolean",
                "description": "Include raw page content",
                "default": False
            },
            "include_images": {
                "type": "boolean",
                "description": "Include images in results",
                "default": False
            },
            "include_domains": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of domains to include in search"
            },
            "exclude_domains": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of domains to exclude from search"
            }
        },
        "required": ["query"]
    }
}


def tavily_search(tool: Union[Dict[str, Any], Any] = None, **kwargs) -> Dict[str, Any]:
    """
    Execute web search using Tavily API
    
    Following strands_tools pattern for tool implementation.
    
    Args:
        tool: Tool input following strands pattern (dict with 'input' key or direct params)
        **kwargs: Direct parameters if not using tool dict
    
    Returns:
        Search results with answer, sources, and formatted display
    
    Examples:
        # Direct usage
        tavily_search(query="latest AI news", search_depth="basic")
        
        # With tool dict
        tavily_search({"input": {"query": "quantum computing", "max_results": 3}})
    """
    # Extract input following strands_tools pattern
    tool_input = {}
    
    if isinstance(tool, dict):
        if "input" in tool:
            tool_input = tool["input"]
        else:
            tool_input = tool
    elif kwargs:
        tool_input = kwargs
    else:
        tool_input = {"query": str(tool)} if tool else {}
    
    # Get parameters
    query = tool_input.get("query")
    if not query:
        return {
            "success": False,
            "error": "Missing required parameter: query",
            "message": "Please provide a search query"
        }
    
    # Get API key from environment
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        return {
            "success": False,
            "error": "TAVILY_API_KEY not configured",
            "message": "Please set TAVILY_API_KEY environment variable. Get a free key at https://tavily.com/"
        }
    
    try:
        # Initialize Tavily client
        client = TavilyClient(api_key=api_key)
        
        # Prepare search parameters
        search_params = {
            "query": query,
            "search_depth": tool_input.get("search_depth", "basic"),
            "max_results": min(max(tool_input.get("max_results", 5), 1), 10),
            "include_answer": tool_input.get("include_answer", True),
            "include_raw_content": tool_input.get("include_raw_content", False),
            "include_images": tool_input.get("include_images", False)
        }
        
        # Add domain filters if provided
        if tool_input.get("include_domains"):
            search_params["include_domains"] = tool_input["include_domains"]
        if tool_input.get("exclude_domains"):
            search_params["exclude_domains"] = tool_input["exclude_domains"]
        
        logger.info(f"🔍 Executing Tavily search: {query}")
        
        # Execute search
        response = client.search(**search_params)
        
        # Format results
        results = []
        for result in response.get("results", []):
            results.append({
                "title": result.get("title", ""),
                "url": result.get("url", ""),
                "content": result.get("content", ""),
                "score": result.get("score", 0)
            })
        
        # Build formatted display
        display_text = f"## Search Results for: {query}\n\n"
        
        if response.get("answer"):
            display_text += f"### Summary\n{response['answer']}\n\n"
        
        display_text += f"### Sources ({len(results)} results)\n\n"
        
        for i, result in enumerate(results, 1):
            display_text += f"**{i}. {result['title']}**\n"
            display_text += f"   URL: {result['url']}\n"
            if result['content']:
                content_preview = result['content'][:200] + "..." if len(result['content']) > 200 else result['content']
                display_text += f"   {content_preview}\n\n"
        
        logger.info(f"✅ Tavily search completed: {len(results)} results")
        
        return {
            "success": True,
            "query": query,
            "answer": response.get("answer", ""),
            "results": results,
            "result_count": len(results),
            "display": display_text,
            "raw_response": response
        }
        
    except Exception as e:
        logger.error(f"Tavily search error: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": f"Failed to execute web search: {str(e)}"
        }


# Async wrapper for compatibility
async def tavily_search_async(tool: Union[Dict[str, Any], Any] = None, **kwargs) -> Dict[str, Any]:
    """Async wrapper for tavily_search"""
    import asyncio
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, tavily_search, tool, **kwargs)


# Export
__all__ = ["tavily_search", "tavily_search_async", "TOOL_SPEC"]