"""
Nova ACT Browser Tools for Strands Agents
Following the official Strands documentation pattern with @tool decorator
"""

import json
from typing import Dict, Any, List
from strands import tool
from app.tools.nova_browser_tool import (
    browse_and_analyze_webpage,
    compare_webpages
)
import structlog

logger = structlog.get_logger()

@tool
def browse_webpage(
    url: str,
    scroll_depth: str = "medium"
) -> str:
    """Browse and analyze a webpage to extract detailed information.
    
    This tool opens an actual web page in a browser, scrolls through it, and extracts:
    - Main content and key facts
    - Citations and references  
    - Author and publication date
    - Quality and credibility assessment
    
    Use this after finding URLs with tavily_search to get full page content, not just snippets.
    
    Args:
        url: The webpage URL to browse and analyze
        scroll_depth: How thoroughly to scroll - "quick", "medium", or "full" (default: "medium")
        
    Returns:
        JSON string with extracted content, key facts, citations, and quality score
    """
    try:
        logger.info(f"🌐 Browsing webpage: {url} (depth: {scroll_depth})")
        
        result = browse_and_analyze_webpage(
            url=url,
            analysis_goals=["main content", "key facts", "credibility", "citations"],
            scroll_depth=scroll_depth,
            extract_sections=[]
        )
        
        # Add helpful summary
        if result.get("success"):
            summary = (
                f"Successfully browsed {url}. "
                f"Quality score: {result.get('quality_score', 0)}/10. "
                f"Has citations: {result.get('analysis', {}).get('has_citations', False)}. "
                f"Content depth: {result.get('analysis', {}).get('content_depth', 'unknown')}."
            )
            result["summary"] = summary
            
            # Format the response nicely
            formatted_response = f"""
📄 **Page Analysis for {url}**

**Title:** {result.get('content', {}).get('title', 'N/A')}
**Quality Score:** {result.get('quality_score', 0)}/10
**Has Citations:** {result.get('analysis', {}).get('has_citations', False)}
**Content Depth:** {result.get('analysis', {}).get('content_depth', 'unknown')}

**Main Content:**
{result.get('content', {}).get('main_text', 'No content extracted')[:1000]}...

**Key Facts:**
{json.dumps(result.get('content', {}).get('key_facts', []), indent=2)}

**Full Analysis:**
{json.dumps(result.get('analysis', {}), indent=2)}
"""
            return formatted_response
        else:
            return f"Failed to browse {url}: {result.get('error', 'Unknown error')}"
            
    except Exception as e:
        logger.error(f"Error browsing webpage {url}: {str(e)}")
        return f"Error browsing webpage: {str(e)}"

@tool  
def compare_web_sources(
    urls: str,
    topic: str
) -> str:
    """Compare multiple webpages to determine which has the best information.
    
    This tool:
    - Opens each webpage and analyzes its content
    - Evaluates quality, credibility, and relevance
    - Ranks sources from best to worst
    - Provides detailed comparison
    
    Use this after browsing 3-5 pages to identify the best sources.
    
    Args:
        urls: Comma-separated list of URLs to compare (max 5)
        topic: The topic to evaluate the pages against
        
    Returns:
        JSON string with rankings, quality scores, and best source recommendation
    """
    try:
        # Parse comma-separated URLs
        urls_list = [u.strip() for u in urls.split(",") if u.strip()]
        
        if len(urls_list) > 5:
            urls_list = urls_list[:5]
            
        logger.info(f"🔍 Comparing {len(urls_list)} sources for topic: {topic}")
        
        result = compare_webpages(
            urls=urls_list,
            topic=topic,
            criteria=["relevance", "depth", "credibility", "recency"]
        )
        
        # Format the response nicely
        if result.get("ranking"):
            formatted_response = f"""
📊 **Source Comparison for: {topic}**

**Best Source:** {result.get('best_source', 'None found')}

**Rankings:**
"""
            for i, source in enumerate(result.get('ranking', []), 1):
                formatted_response += f"""
{i}. **{source['url']}**
   - Score: {source['score']}/100
   - Quality: {source['quality_score']}/10
   - Has Citations: {source['has_citations']}
   - Analysis: {json.dumps(source.get('analysis', {}), indent=2)}
"""
            
            formatted_response += f"\n**Summary:** {result.get('summary', '')}"
            return formatted_response
        else:
            return f"No sources could be compared for topic: {topic}"
            
    except Exception as e:
        logger.error(f"Error comparing sources: {str(e)}")
        return f"Error comparing sources: {str(e)}"