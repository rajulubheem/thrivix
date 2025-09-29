"""
Tavily Search Tool for Strands Agents
Following the official Strands documentation pattern
"""
import os
import requests
from typing import Dict, Any
from strands import tool
import structlog

logger = structlog.get_logger()


@tool
def tavily_search(
    query: str,
    search_depth: str = "basic",
    topic: str = "general",
    max_results: int = 5,
    include_raw_content: bool = False
) -> str:
    """Search the web for current information, news, and research.

    Use this tool when you need to find recent information, current events,
    latest news, research data, or any real-time information from the web.
    This tool searches the internet and returns relevant, up-to-date results.

    Args:
        query: The search query to find information about
        search_depth: "basic" or "advanced" - depth of search
        topic: "general" or "news" - type of search
        max_results: Number of results to return (1-10)
        include_raw_content: Whether to include raw page content

    Returns:
        Search results as formatted text with sources
    """
    api_key = os.getenv("TAVILY_API_KEY")

    if not api_key:
        return "Error: TAVILY_API_KEY environment variable is not set"

    try:
        logger.info(f"🔍 Tavily search for: {query} (depth: {search_depth}, topic: {topic})")

        # Build API request with parameters
        api_payload = {
            "api_key": api_key,
            "query": query,
            "search_depth": search_depth,
            "max_results": min(max_results, 10),  # Cap at 10
            "include_answer": True,
            "include_raw_content": include_raw_content,
            "include_images": False
        }

        # Add topic if it's news
        if topic == "news":
            api_payload["topic"] = "news"

        # Make API request to Tavily
        response = requests.post(
            "https://api.tavily.com/search",
            json=api_payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        if response.status_code != 200:
            logger.error(f"Tavily API error: {response.status_code}")
            return f"Search failed with status {response.status_code}"
        
        data = response.json()
        results = data.get("results", [])
        answer = data.get("answer", "")
        
        # Format results as text (Strands will handle the formatting)
        output = []
        
        if answer:
            output.append(f"Summary: {answer}\n")
        
        output.append(f"\nFound {len(results)} results:\n")
        
        for i, result in enumerate(results, 1):
            output.append(f"\n[{i}] {result.get('title', 'Untitled')}")
            output.append(f"    URL: {result.get('url', '')}")
            content = result.get('content', '')
            if content:
                # Truncate content to 200 chars for readability
                content = content[:200] + "..." if len(content) > 200 else content
                output.append(f"    {content}")
        
        logger.info(f"✅ Tavily search completed with {len(results)} results")
        
        # Store results in global variables for source extraction
        # This is a workaround to pass structured data
        import json
        global _last_search_results, _all_search_results
        _last_search_results = results
        _all_search_results.extend(results)  # Accumulate all results
        
        return "\n".join(output)
        
    except requests.exceptions.Timeout:
        return "Search request timed out. Please try again."
    except Exception as e:
        logger.error(f"Tavily search error: {e}")
        return f"Search error: {str(e)}"


# Global variable to store structured results
_last_search_results = []
_all_search_results = []  # Accumulate all search results


def get_last_search_results():
    """Get the last search results for source extraction"""
    global _last_search_results
    return _last_search_results


def get_all_search_results():
    """Get all accumulated search results"""
    global _all_search_results
    return _all_search_results


def clear_search_results():
    """Clear accumulated search results"""
    global _all_search_results
    _all_search_results = []