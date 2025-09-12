"""
Tavily Search Tool for Strands Agents
Following the official Strands documentation pattern
"""
import os
import requests
import time
from app.services.search_gateway import search_gateway
from typing import Dict, Any
from strands import tool
import structlog

logger = structlog.get_logger()


@tool
def tavily_search(query: str) -> str:
    """Search the web for current information, news, and research.
    
    Use this tool when you need to find recent information, current events,
    latest news, research data, or any real-time information from the web.
    This tool searches the internet and returns relevant, up-to-date results.
    
    Args:
        query: The search query to find information about
        
    Returns:
        Search results as formatted text with sources
    """
    api_key = os.getenv("TAVILY_API_KEY")
    
    if not api_key:
        return "Error: TAVILY_API_KEY environment variable is not set"
    
    try:
        # Short-circuit if we recently saw rate limiting
        global _last_rate_limit_ts
        now = time.time()
        if _last_rate_limit_ts and (now - _last_rate_limit_ts) < _rate_limit_backoff_window():
            wait_left = int(_rate_limit_backoff_window() - (now - _last_rate_limit_ts))
            logger.warn("Tavily rate limited recently; short-circuiting search", wait_seconds=wait_left)
            return f"Search temporarily rate-limited. Please wait ~{wait_left}s and try again."

        logger.info(f"🔍 Tavily search for: {query}")

        # Initialize budget window on first call this run
        global _search_calls_count, _search_window_started
        if not _search_window_started:
            _search_window_started = True
            _search_calls_count = 0

        # Enforce per-run call budget
        if _search_calls_count >= _max_search_calls_per_run():
            logger.warn("Tavily search budget exceeded for this run", max_calls=_max_search_calls_per_run())
            return (
                "Search budget exceeded for this run. "
                "Summarize current findings and proceed to synthesis instead of more searches."
            )
        
        # Make API request to Tavily
        # Use the gateway to benefit from cache and backoff
        gw = search_gateway.search(query)
        if gw.get("error"):
            err = gw["error"]
            logger.error("SearchGateway error", error=err)
            if err.startswith("rate_limited"):
                _last_rate_limit_ts = time.time()
                return "Search rate-limited. Please wait and retry."
            elif err.startswith("missing_api_key"):
                return "Error: TAVILY_API_KEY environment variable is not set"
            else:
                return f"Search error: {err}"

        data = {"results": gw.get("results", []), "answer": gw.get("answer")}
        _search_calls_count += 1
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
_last_rate_limit_ts = 0.0  # Track last 429 to dampen retries
_search_calls_count = 0     # Simple per-run budget to avoid runaway loops
_search_window_started = False


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
    global _all_search_results, _search_calls_count, _search_window_started
    _all_search_results = []
    _search_calls_count = 0
    _search_window_started = False

def _rate_limit_backoff_window() -> float:
    """Seconds to back off after a 429 to prevent flood."""
    return float(os.getenv("TAVILY_BACKOFF_SECONDS", 20))

def _max_search_calls_per_run() -> int:
    """Maximum Tavily calls allowed per research run before returning guidance."""
    return int(os.getenv("TAVILY_MAX_CALLS_PER_RUN", 12))
