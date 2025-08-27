"""
Tavily Search Tool for Strands Agents - Following Official Documentation Pattern
"""
import os
import json
import requests
import structlog
from strands import tool

logger = structlog.get_logger()


@tool
def tavily_search(query: str) -> dict:
    """Search the web for current information using Tavily API.
    
    Use this tool when you need to find current information, recent news, 
    research data, or any real-time information from the web. The search 
    uses Tavily's search API to provide high-quality, relevant results.
    
    Args:
        query: The search query string to find information about
        
    Returns:
        Dictionary with search results containing status and content
    """
    api_key = os.getenv("TAVILY_API_KEY", "")
    
    if not api_key:
        logger.error("TAVILY_API_KEY not configured")
        return {
            "status": "error",
            "content": [{"text": "Tavily API key not configured. Please set TAVILY_API_KEY environment variable."}]
        }
    
    try:
        logger.info(f"🔍 Executing Tavily search for: {query}")
        
        # Make the API request
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
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        if response.status_code != 200:
            logger.error(f"Tavily API error: {response.status_code}")
            return {
                "status": "error",
                "content": [{"text": f"Search failed with status {response.status_code}"}]
            }
        
        data = response.json()
        
        # Extract results
        results = data.get("results", [])
        answer = data.get("answer", "")
        
        logger.info(f"✅ Tavily search completed: {len(results)} results found")
        
        # Format the response following Strands pattern
        # Return the full JSON data so we can parse it for sources
        return {
            "status": "success",
            "content": [{
                "json": {
                    "query": query,
                    "answer": answer,
                    "results": results,
                    "result_count": len(results)
                }
            }]
        }
        
    except requests.exceptions.Timeout:
        logger.error("Tavily API timeout")
        return {
            "status": "error",
            "content": [{"text": "Search request timed out. Please try again."}]
        }
    except Exception as e:
        logger.error(f"Tavily search error: {e}")
        return {
            "status": "error",
            "content": [{"text": f"Search error: {str(e)}"}]
        }