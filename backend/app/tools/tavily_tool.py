"""
Tavily Search Tool for Strands Agents
Implements web search using Tavily API following Strands tool patterns
"""
import os
import json
import asyncio
from typing import Dict, Any, Optional, List
from datetime import datetime
import structlog

logger = structlog.get_logger()

def tavily_search(query: str) -> str:
    """
    Search the web for current information using Tavily API.
    
    Args:
        query: The search query to find information about
    
    Returns:
        JSON string array of search results with title, url, content and score
    """
    import requests
    
    api_key = os.getenv("TAVILY_API_KEY")
    
    if not api_key:
        logger.error("TAVILY_API_KEY not configured")
        return json.dumps([])
    
    try:
        logger.info(f"🔍 Executing Tavily search: {query}")
        
        # Make synchronous API request
        response = requests.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "search_depth": "basic",
                "max_results": 5,
                "include_answer": True,
                "include_raw_content": False,
                "include_images": False
            },
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code != 200:
            logger.error(f"Tavily API error: {response.status_code}")
            return json.dumps([])
        
        data = response.json()
        
        # Format results for Strands
        results = []
        for result in data.get("results", []):
            results.append({
                "title": result.get("title", ""),
                "url": result.get("url", ""),
                "content": result.get("content", ""),
                "snippet": result.get("content", "")[:200] if result.get("content") else "",
                "score": result.get("score", 0)
            })
        
        logger.info(f"✅ Tavily search completed: {len(results)} results")
        
        # Return as JSON string for Strands to parse
        return json.dumps(results)
        
    except Exception as e:
        logger.error(f"Tavily search error: {e}")
        return json.dumps([])


# Optional: Keep async version for backward compatibility  
async def tavily_search_async(
    query: str,
    search_depth: str = "basic",
    max_results: int = 5,
    include_domains: Optional[List[str]] = None,
    exclude_domains: Optional[List[str]] = None
) -> str:
    """Async version of tavily_search for backward compatibility"""
    # Run the sync version in executor
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor() as executor:
        future = executor.submit(tavily_search, query)
        return await asyncio.wrap_future(future)