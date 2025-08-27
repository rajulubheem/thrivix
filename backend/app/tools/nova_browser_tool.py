"""
Nova ACT Browser Tool for Deep Web Research
This tool enables AI agents to browse web pages and extract detailed information.
Based on Nova ACT samples and best practices.
"""

import json
from typing import Dict, Any, List, Optional
from nova_act import NovaAct, ActResult
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

class WebPageContent(BaseModel):
    """Schema for extracting web page content"""
    title: str
    main_content: str
    key_facts: List[str]
    citations: List[str]
    author: Optional[str] = None
    publication_date: Optional[str] = None
    
class WebPageAnalysis(BaseModel):
    """Schema for analyzing web page quality"""
    credibility_score: int  # 1-10
    has_citations: bool
    content_depth: str  # shallow, medium, deep
    relevance: str  # low, medium, high

def browse_and_analyze_webpage(
    url: str,
    analysis_goals: List[str] = None,
    scroll_depth: str = "medium",
    extract_sections: List[str] = None
) -> Dict[str, Any]:
    """
    Browse and analyze a webpage using Nova ACT.
    
    Args:
        url: The webpage URL to browse
        analysis_goals: List of things to analyze
        scroll_depth: How thoroughly to scroll (quick, medium, full)
        extract_sections: Specific sections to extract
    
    Returns:
        Dictionary with extracted content and analysis
    """
    if analysis_goals is None:
        analysis_goals = ["main content", "key facts", "credibility"]
    
    if extract_sections is None:
        extract_sections = []
    
    result = {
        "url": url,
        "success": False,
        "content": {},
        "analysis": {},
        "quality_score": 0,
        "extracted_sections": {}
    }
    
    try:
        import os
        api_key = os.getenv("NOVA_ACT_API_KEY", "4663307a-605d-457e-af75-28fda4a1d929")
        
        with NovaAct(
            starting_page=url, 
            nova_act_api_key=api_key,
            headless=True,
            screen_width=1600,
            screen_height=900
        ) as nova:
            # Extract structured content
            content_result = nova.act(
                "Extract the title, main content text, key facts as a list, "
                "citations/references as a list, author name if present, "
                "and publication date if present",
                schema=WebPageContent.model_json_schema()
            )
            
            if content_result.matches_schema:
                page_content = WebPageContent.model_validate(content_result.parsed_response)
                result["content"] = {
                    "title": page_content.title,
                    "main_text": page_content.main_content,
                    "key_facts": page_content.key_facts,
                    "citations": page_content.citations,
                    "author": page_content.author,
                    "publication_date": page_content.publication_date
                }
            
            # Scroll based on depth
            if scroll_depth == "quick":
                nova.act("scroll down once to see more content")
            elif scroll_depth == "medium":
                nova.act("scroll to the middle of the page")
                nova.act("scroll to the bottom of the page")
            elif scroll_depth == "full":
                nova.act("scroll through the entire page slowly to see all content")
            
            # Analyze page quality
            analysis_result = nova.act(
                "Analyze this page and provide: credibility score (1-10), "
                "whether it has citations (true/false), content depth "
                "(shallow/medium/deep), and relevance (low/medium/high)",
                schema=WebPageAnalysis.model_json_schema()
            )
            
            if analysis_result.matches_schema:
                page_analysis = WebPageAnalysis.model_validate(analysis_result.parsed_response)
                result["analysis"] = {
                    "credibility_score": page_analysis.credibility_score,
                    "has_citations": page_analysis.has_citations,
                    "content_depth": page_analysis.content_depth,
                    "relevance": page_analysis.relevance
                }
                result["quality_score"] = page_analysis.credibility_score
            
            # Extract specific sections if requested
            for section in extract_sections:
                section_result = nova.act(f"Find and extract the {section} section")
                if section_result.success:
                    result["extracted_sections"][section] = section_result.response
            
            # Analyze based on goals
            for goal in analysis_goals:
                goal_result = nova.act(f"Analyze this page for: {goal}")
                if goal_result.success:
                    result["analysis"][goal] = goal_result.response
            
            result["success"] = True
            
    except Exception as e:
        logger.error(f"Error browsing {url}: {str(e)}")
        result["error"] = str(e)
    
    return result

def compare_webpages(
    urls: List[str],
    topic: str,
    criteria: List[str] = None
) -> Dict[str, Any]:
    """
    Compare multiple webpages to determine which has the best information.
    
    Args:
        urls: List of URLs to compare (max 5)
        topic: The topic to evaluate against
        criteria: Comparison criteria
    
    Returns:
        Dictionary with rankings and analysis
    """
    if criteria is None:
        criteria = ["relevance", "depth", "credibility", "recency"]
    
    if len(urls) > 5:
        urls = urls[:5]  # Limit to 5 URLs
    
    results = []
    
    # Analyze each webpage
    for url in urls:
        analysis = browse_and_analyze_webpage(
            url=url,
            analysis_goals=[f"information about {topic}"] + criteria,
            scroll_depth="medium"
        )
        
        # Score based on analysis
        score = 0
        if analysis.get("success"):
            score += analysis.get("quality_score", 0) * 10
            
            # Bonus for citations
            if analysis.get("analysis", {}).get("has_citations"):
                score += 15
            
            # Check relevance
            content = str(analysis.get("content", {})).lower()
            if topic.lower() in content:
                score += 20
            
            # Depth bonus
            depth = analysis.get("analysis", {}).get("content_depth", "shallow")
            if depth == "deep":
                score += 15
            elif depth == "medium":
                score += 10
        
        results.append({
            "url": url,
            "score": score,
            "analysis": analysis.get("analysis", {}),
            "quality_score": analysis.get("quality_score", 0),
            "has_citations": analysis.get("analysis", {}).get("has_citations", False)
        })
    
    # Sort by score
    results.sort(key=lambda x: x["score"], reverse=True)
    
    return {
        "best_source": results[0]["url"] if results else None,
        "ranking": results,
        "summary": f"Based on analysis of {len(urls)} sources about '{topic}', "
                  f"the best source is {results[0]['url'] if results else 'none'} "
                  f"with a score of {results[0]['score'] if results else 0}."
    }

def extract_search_results_urls(search_results: List[Dict[str, Any]], limit: int = 5) -> List[str]:
    """
    Extract URLs from Tavily search results.
    
    Args:
        search_results: List of search result dictionaries
        limit: Maximum number of URLs to extract
    
    Returns:
        List of URLs
    """
    urls = []
    for result in search_results[:limit]:
        if 'url' in result:
            urls.append(result['url'])
    return urls

# Create tool wrapper functions for Strands agents
def nova_browse_tool(url: str, **kwargs) -> str:
    """
    Tool wrapper for browse_and_analyze_webpage.
    Returns JSON string for agent consumption.
    """
    result = browse_and_analyze_webpage(url, **kwargs)
    return json.dumps(result, indent=2)

def nova_compare_tool(urls: List[str], topic: str, **kwargs) -> str:
    """
    Tool wrapper for compare_webpages.
    Returns JSON string for agent consumption.
    """
    result = compare_webpages(urls, topic, **kwargs)
    return json.dumps(result, indent=2)