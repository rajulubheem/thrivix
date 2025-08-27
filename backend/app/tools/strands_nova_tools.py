"""
Strands-compatible Nova ACT Browser Tools
These tools enable agents to browse web pages and extract detailed information.
"""

import json
from typing import Dict, Any, List
from app.tools.nova_browser_tool import (
    browse_and_analyze_webpage,
    compare_webpages,
    extract_search_results_urls
)
import logging

logger = logging.getLogger(__name__)

def browse_webpage(
    url: str,
    analysis_goals: str = "main content, key facts, credibility",
    scroll_depth: str = "medium",
    extract_sections: str = ""
) -> str:
    """
    Browse and analyze a webpage to extract detailed information.
    
    This tool opens an actual web page, scrolls through it, and extracts:
    - Main content and key facts
    - Citations and references
    - Author and publication date
    - Quality and credibility assessment
    
    Args:
        url: The webpage URL to browse
        analysis_goals: Comma-separated list of things to analyze (default: "main content, key facts, credibility")
        scroll_depth: How thoroughly to scroll - "quick", "medium", or "full" (default: "medium")
        extract_sections: Comma-separated list of specific sections to extract (optional)
    
    Returns:
        JSON string with extracted content and analysis
    
    Example:
        browse_webpage(
            url="https://example.com/article",
            scroll_depth="full",
            extract_sections="introduction, methodology, conclusion"
        )
    """
    # Parse comma-separated strings into lists
    goals_list = [g.strip() for g in analysis_goals.split(",") if g.strip()]
    sections_list = [s.strip() for s in extract_sections.split(",") if s.strip()] if extract_sections else []
    
    try:
        result = browse_and_analyze_webpage(
            url=url,
            analysis_goals=goals_list,
            scroll_depth=scroll_depth,
            extract_sections=sections_list
        )
        
        # Add helpful summary to the result
        if result.get("success"):
            result["summary"] = (
                f"Successfully browsed {url}. "
                f"Quality score: {result.get('quality_score', 0)}/10. "
                f"Has citations: {result.get('analysis', {}).get('has_citations', False)}. "
                f"Content depth: {result.get('analysis', {}).get('content_depth', 'unknown')}."
            )
        
        return json.dumps(result, indent=2)
        
    except Exception as e:
        logger.error(f"Error in browse_webpage: {str(e)}")
        return json.dumps({
            "error": str(e),
            "success": False,
            "url": url
        })

def compare_web_sources(
    urls: str,
    topic: str,
    criteria: str = "relevance, depth, credibility, recency"
) -> str:
    """
    Compare multiple webpages to determine which has the best information about a topic.
    
    This tool:
    - Opens each webpage and analyzes its content
    - Evaluates quality, credibility, and relevance
    - Ranks sources from best to worst
    - Provides detailed comparison
    
    Args:
        urls: Comma-separated list of URLs to compare (max 5)
        topic: The topic to evaluate the pages against
        criteria: Comma-separated comparison criteria (default: "relevance, depth, credibility, recency")
    
    Returns:
        JSON string with rankings and analysis
    
    Example:
        compare_web_sources(
            urls="https://site1.com, https://site2.com, https://site3.com",
            topic="quantum computing advances",
            criteria="technical depth, recent updates, expert authorship"
        )
    """
    # Parse comma-separated strings
    urls_list = [u.strip() for u in urls.split(",") if u.strip()]
    criteria_list = [c.strip() for c in criteria.split(",") if c.strip()]
    
    try:
        result = compare_webpages(
            urls=urls_list,
            topic=topic,
            criteria=criteria_list
        )
        
        return json.dumps(result, indent=2)
        
    except Exception as e:
        logger.error(f"Error in compare_web_sources: {str(e)}")
        return json.dumps({
            "error": str(e),
            "success": False,
            "urls": urls_list,
            "topic": topic
        })

def extract_urls_from_search(search_results: str, limit: int = 5) -> str:
    """
    Extract URLs from Tavily search results for browsing.
    
    Args:
        search_results: JSON string of search results
        limit: Maximum number of URLs to extract
    
    Returns:
        Comma-separated list of URLs
    """
    try:
        # Parse search results if string
        if isinstance(search_results, str):
            results = json.loads(search_results)
        else:
            results = search_results
        
        # Extract URLs
        urls = []
        if isinstance(results, dict) and 'results' in results:
            for result in results['results'][:limit]:
                if 'url' in result:
                    urls.append(result['url'])
        elif isinstance(results, list):
            for result in results[:limit]:
                if isinstance(result, dict) and 'url' in result:
                    urls.append(result['url'])
        
        return ",".join(urls)
        
    except Exception as e:
        logger.error(f"Error extracting URLs: {str(e)}")
        return ""

# Create metadata for the tools
browse_webpage_metadata = {
    "name": "browse_webpage",
    "description": (
        "Opens and reads an actual web page, scrolling through content and extracting detailed information. "
        "Use this after finding URLs with search to get full page content, not just snippets. "
        "Returns title, main content, key facts, citations, quality score, and more."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "The webpage URL to browse and analyze"
            },
            "analysis_goals": {
                "type": "string",
                "description": "Comma-separated list of analysis goals",
                "default": "main content, key facts, credibility"
            },
            "scroll_depth": {
                "type": "string",
                "enum": ["quick", "medium", "full"],
                "description": "How thoroughly to scroll through the page",
                "default": "medium"
            },
            "extract_sections": {
                "type": "string",
                "description": "Comma-separated list of specific sections to extract",
                "default": ""
            }
        },
        "required": ["url"]
    }
}

compare_web_sources_metadata = {
    "name": "compare_web_sources",
    "description": (
        "Compares multiple webpages by browsing each one and evaluating their content quality, "
        "credibility, and relevance to a topic. Returns rankings and recommendations for the best sources."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "urls": {
                "type": "string",
                "description": "Comma-separated list of URLs to compare (max 5)"
            },
            "topic": {
                "type": "string",
                "description": "The topic to evaluate the pages against"
            },
            "criteria": {
                "type": "string",
                "description": "Comma-separated comparison criteria",
                "default": "relevance, depth, credibility, recency"
            }
        },
        "required": ["urls", "topic"]
    }
}