"""
Web Browser Tool using Nova ACT
This tool enables AI agents to browse web pages, scroll through content,
and extract detailed information for deep research.
"""

import asyncio
import json
from typing import Dict, Any, List, Optional
from nova_act import NovaAct
from strands.tools import Tool
import logging

logger = logging.getLogger(__name__)

class WebBrowserTool(Tool):
    """
    A tool that uses Nova ACT to browse web pages and extract detailed content.
    Enables AI agents to:
    - Open web pages
    - Scroll through content
    - Extract specific information
    - Analyze page structure
    - Make decisions based on actual content
    """
    
    def __init__(self):
        super().__init__(
            name="browse_and_analyze_webpage",
            description=(
                "Opens a web page in a browser, scrolls through it, and extracts detailed content. "
                "Useful for deep research when you need to understand the full context of a webpage "
                "beyond just snippets. Can analyze page structure, extract specific sections, and "
                "evaluate content quality."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL of the webpage to browse and analyze"
                    },
                    "analysis_goals": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of specific things to look for or analyze on the page",
                        "default": ["main content", "key facts", "supporting evidence", "data quality"]
                    },
                    "scroll_depth": {
                        "type": "string",
                        "enum": ["quick", "medium", "full"],
                        "description": "How thoroughly to scroll through the page",
                        "default": "medium"
                    },
                    "extract_sections": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Specific sections to extract (e.g., 'introduction', 'methodology', 'conclusion')",
                        "default": []
                    }
                },
                "required": ["url"]
            }
        )
    
    async def _run_nova_act(self, url: str, analysis_goals: List[str], 
                           scroll_depth: str, extract_sections: List[str]) -> Dict[str, Any]:
        """Run Nova ACT to browse and analyze the webpage."""
        
        result = {
            "url": url,
            "success": False,
            "content": {},
            "analysis": {},
            "quality_score": 0,
            "extracted_sections": {}
        }
        
        try:
            # Initialize Nova ACT with the target URL
            with NovaAct(starting_page=url, headless=True) as nova:
                
                # Wait for page to load
                await asyncio.sleep(2)
                
                # Extract page title and metadata
                nova.act("extract the page title")
                result["content"]["title"] = nova.get_last_action_result()
                
                # Analyze based on goals
                for goal in analysis_goals:
                    prompt = f"Find and summarize information about: {goal}"
                    nova.act(prompt)
                    result["analysis"][goal] = nova.get_last_action_result()
                
                # Scroll through the page based on depth
                scroll_actions = {
                    "quick": ["scroll down once"],
                    "medium": ["scroll to the middle", "scroll to the bottom"],
                    "full": ["scroll down slowly through the entire page", "scroll to all sections"]
                }
                
                for action in scroll_actions.get(scroll_depth, ["scroll down once"]):
                    nova.act(action)
                    await asyncio.sleep(1)
                
                # Extract main content
                nova.act("extract the main article or content text")
                result["content"]["main_text"] = nova.get_last_action_result()
                
                # Extract specific sections if requested
                for section in extract_sections:
                    nova.act(f"find and extract the {section} section")
                    result["extracted_sections"][section] = nova.get_last_action_result()
                
                # Evaluate content quality
                nova.act("evaluate the credibility and quality of this content on a scale of 1-10")
                quality_result = nova.get_last_action_result()
                try:
                    # Try to extract numeric score
                    import re
                    score_match = re.search(r'\b([1-9]|10)\b', str(quality_result))
                    if score_match:
                        result["quality_score"] = int(score_match.group(1))
                except:
                    result["quality_score"] = 5  # Default middle score
                
                # Check for citations and references
                nova.act("check if this page has citations, references, or sources")
                result["content"]["has_citations"] = nova.get_last_action_result()
                
                # Extract any data, statistics, or key facts
                nova.act("extract any important data, statistics, or key facts from this page")
                result["content"]["key_facts"] = nova.get_last_action_result()
                
                result["success"] = True
                
        except Exception as e:
            logger.error(f"Error browsing {url}: {str(e)}")
            result["error"] = str(e)
        
        return result
    
    def run(self, **kwargs) -> str:
        """
        Browse and analyze a webpage using Nova ACT.
        
        Args:
            url: The webpage URL to browse
            analysis_goals: List of things to analyze
            scroll_depth: How thoroughly to scroll
            extract_sections: Specific sections to extract
        
        Returns:
            JSON string with extracted content and analysis
        """
        url = kwargs.get("url")
        analysis_goals = kwargs.get("analysis_goals", ["main content", "key facts"])
        scroll_depth = kwargs.get("scroll_depth", "medium")
        extract_sections = kwargs.get("extract_sections", [])
        
        if not url:
            return json.dumps({"error": "URL is required"})
        
        # Run the async Nova ACT function
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(
                self._run_nova_act(url, analysis_goals, scroll_depth, extract_sections)
            )
        finally:
            loop.close()
        
        return json.dumps(result, indent=2)


class WebpageComparatorTool(Tool):
    """
    A tool that compares multiple webpages to determine which has the best information.
    """
    
    def __init__(self):
        super().__init__(
            name="compare_webpages",
            description=(
                "Opens multiple webpages and compares them to determine which has the most relevant, "
                "comprehensive, and reliable information for a given topic. Returns a ranking with justification."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "urls": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of URLs to compare (max 5)"
                    },
                    "topic": {
                        "type": "string",
                        "description": "The topic or question to evaluate the pages against"
                    },
                    "criteria": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Specific criteria to use for comparison",
                        "default": ["relevance", "depth", "credibility", "recency"]
                    }
                },
                "required": ["urls", "topic"]
            }
        )
        self.browser_tool = WebBrowserTool()
    
    def run(self, **kwargs) -> str:
        """
        Compare multiple webpages and rank them.
        
        Args:
            urls: List of webpage URLs to compare
            topic: The topic to evaluate against
            criteria: Comparison criteria
        
        Returns:
            JSON string with rankings and analysis
        """
        urls = kwargs.get("urls", [])
        topic = kwargs.get("topic")
        criteria = kwargs.get("criteria", ["relevance", "depth", "credibility", "recency"])
        
        if not urls or not topic:
            return json.dumps({"error": "URLs and topic are required"})
        
        if len(urls) > 5:
            urls = urls[:5]  # Limit to 5 URLs for performance
        
        results = []
        
        # Analyze each webpage
        for url in urls:
            analysis = json.loads(self.browser_tool.run(
                url=url,
                analysis_goals=[f"information about {topic}"] + criteria,
                scroll_depth="medium"
            ))
            
            # Score based on criteria
            score = 0
            if analysis.get("success"):
                score += analysis.get("quality_score", 0) * 10
                
                # Bonus for having citations
                if "citation" in str(analysis.get("content", {}).get("has_citations", "")).lower():
                    score += 15
                
                # Check relevance to topic
                content = str(analysis.get("content", {})).lower()
                if topic.lower() in content:
                    score += 20
                
                # Length/depth bonus
                if len(content) > 2000:
                    score += 10
            
            results.append({
                "url": url,
                "score": score,
                "analysis": analysis.get("analysis", {}),
                "quality_score": analysis.get("quality_score", 0),
                "has_citations": analysis.get("content", {}).get("has_citations", False)
            })
        
        # Sort by score
        results.sort(key=lambda x: x["score"], reverse=True)
        
        # Create recommendation
        recommendation = {
            "best_source": results[0]["url"] if results else None,
            "ranking": results,
            "summary": f"Based on analysis of {len(urls)} sources about '{topic}', "
                      f"the best source is {results[0]['url'] if results else 'none'} "
                      f"with a score of {results[0]['score'] if results else 0}."
        }
        
        return json.dumps(recommendation, indent=2)


# Export the tools
web_browser_tool = WebBrowserTool()
webpage_comparator_tool = WebpageComparatorTool()