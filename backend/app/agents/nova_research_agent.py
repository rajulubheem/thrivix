"""
Nova Research Agent - Enhanced with Web Browsing Capabilities
This agent performs comprehensive research by:
1. Searching for information using Tavily
2. Opening and reviewing actual web pages using Nova ACT
3. Comparing multiple sources for quality
4. Making informed decisions about the best information
"""

import json
import asyncio
from typing import List, Dict, Any, Optional
from strands_agents import Agent
from strands_agents.models import OpenAIModel
from strands_tools import tavily_search
from app.tools.web_browser_tool import web_browser_tool, webpage_comparator_tool
import logging
import os

logger = logging.getLogger(__name__)

class NovaResearchAgent:
    """
    An advanced research agent that combines search with actual web browsing
    to provide deeper, more accurate research results using Nova ACT.
    """
    
    def __init__(self, openai_api_key: Optional[str] = None):
        """Initialize the Nova research agent with tools and model."""
        
        # Get API key
        if not openai_api_key:
            openai_api_key = os.getenv("OPENAI_API_KEY")
        
        # Initialize the model
        self.model = OpenAIModel(
            api_key=openai_api_key,
            model="gpt-4o-mini"
        )
        
        # Combine search and browsing tools
        self.tools = [
            tavily_search,
            web_browser_tool,
            webpage_comparator_tool
        ]
        
        # System prompt for deep research with browsing
        self.system_prompt = """You are an advanced research agent with the ability to not only search 
        for information but also browse actual web pages to extract and analyze content in depth.

        Your research process should be:
        1. Start with a broad search using tavily_search to find relevant sources
        2. Identify the most promising URLs from the search results  
        3. Use browse_and_analyze_webpage to open and deeply analyze each promising source
        4. Use compare_webpages to determine which sources have the best information
        5. Synthesize findings from multiple sources into a comprehensive answer

        Key behaviors:
        - Don't just rely on search snippets - actually browse the pages for full context
        - Compare multiple sources to verify information
        - Look for citations and credible sources
        - Extract specific data, statistics, and facts
        - Evaluate the quality and recency of information
        - Provide detailed, well-sourced answers

        When browsing pages:
        - Start with medium scroll depth, use full for academic/technical content
        - Look for specific sections like methodology, results, conclusions
        - Check for author credentials and publication dates
        - Note any biases or limitations in the sources

        Always cite your sources and indicate which information came from which webpage."""
        
        # Initialize the agent
        self.agent = Agent(
            model=self.model,
            tools=self.tools,
            system_prompt=self.system_prompt
        )
    
    async def research_with_browsing(self, query: str, depth: str = "comprehensive") -> Dict[str, Any]:
        """
        Perform deep research on a query with web browsing.
        
        Args:
            query: The research question or topic
            depth: Research depth - "quick", "standard", or "comprehensive"
        
        Returns:
            Dictionary with research results, sources, and confidence score
        """
        
        # Adjust the prompt based on depth
        depth_instructions = {
            "quick": "Do a quick search and browse 1-2 top results. Focus on getting key facts quickly.",
            "standard": "Search thoroughly and browse 3-4 relevant sources. Extract main points and verify facts.",
            "comprehensive": "Conduct exhaustive research, browse 5+ sources, scroll through them fully, compare them, and provide detailed analysis with all relevant data."
        }
        
        instruction = depth_instructions.get(depth, depth_instructions["standard"])
        
        full_prompt = f"""Research Query: {query}

        Instructions: {instruction}

        Step-by-step process:
        1. First, use tavily_search to find relevant sources about "{query}"
        2. Review the search results and identify the top URLs to investigate
        3. Use browse_and_analyze_webpage for each promising URL:
           - Set appropriate scroll_depth based on content type
           - Extract key sections and data
           - Evaluate credibility
        4. If you have multiple good sources, use compare_webpages to rank them
        5. Synthesize all findings into a comprehensive answer

        Please provide:
        1. A comprehensive answer to the query with specific facts and data
        2. Key findings from each source you browsed (not just search snippets)
        3. A comparison of source quality and reliability
        4. Any conflicting information between sources
        5. Your confidence level in the findings (1-10 scale)
        6. Citations for all major claims

        Begin your deep research now."""
        
        try:
            # Run the agent
            result = await self.agent.run(full_prompt)
            
            return {
                "query": query,
                "depth": depth,
                "response": result,
                "agent_id": str(self.agent.id) if hasattr(self.agent, 'id') else None,
                "success": True
            }
        except Exception as e:
            logger.error(f"Error in research_with_browsing: {str(e)}")
            return {
                "query": query,
                "depth": depth,
                "error": str(e),
                "success": False
            }
    
    async def compare_sources(self, query: str, urls: List[str]) -> Dict[str, Any]:
        """
        Compare specific URLs for information about a query by browsing each.
        
        Args:
            query: The topic to research
            urls: List of URLs to compare
        
        Returns:
            Comparison results and recommendations
        """
        
        prompt = f"""Compare these sources for information about: {query}

        URLs to analyze:
        {json.dumps(urls, indent=2)}

        Process:
        1. Use browse_and_analyze_webpage for EACH URL to get full content
        2. Set scroll_depth to "full" to ensure you see everything
        3. Extract all relevant information about "{query}"
        4. Use compare_webpages tool to systematically compare them
        5. Identify unique information in each source
        6. Determine which source(s) are most authoritative and comprehensive

        Provide:
        - Summary of what each page contains
        - Quality score for each source
        - Which source is best and why
        - Any conflicting information between sources
        - Your recommendation on which to trust most"""
        
        try:
            result = await self.agent.run(prompt)
            
            return {
                "query": query,
                "urls_compared": urls,
                "comparison_result": result,
                "success": True
            }
        except Exception as e:
            logger.error(f"Error in compare_sources: {str(e)}")
            return {
                "query": query,
                "urls_compared": urls,
                "error": str(e),
                "success": False
            }
    
    async def fact_check_with_browsing(self, claim: str, sources: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Fact-check a claim by browsing and analyzing multiple sources.
        
        Args:
            claim: The claim to verify
            sources: Optional list of specific sources to check
        
        Returns:
            Fact-checking results with evidence
        """
        
        prompt = f"""Fact-check this claim by browsing actual sources: {claim}

        Process:
        1. Search for information about this claim using tavily_search
        2. Browse at least 3-5 authoritative sources using browse_and_analyze_webpage
        3. Use "full" scroll_depth to ensure you don't miss any relevant information
        4. Look for:
           - Direct evidence supporting or refuting the claim
           - Expert opinions
           - Statistical data
           - Original sources and citations
        5. Check publication dates to ensure information is current
        6. Compare what different sources say using compare_webpages

        {'Also specifically check these sources: ' + json.dumps(sources) if sources else ''}

        Provide:
        - Verdict: TRUE, FALSE, PARTIALLY TRUE, MISLEADING, or UNVERIFIABLE
        - Evidence from each source you browsed
        - Confidence level (1-10)
        - Any nuances or context needed
        - Which sources were most authoritative

        Be thorough and objective. Actually browse the pages, don't just use search snippets."""
        
        try:
            result = await self.agent.run(prompt)
            
            return {
                "claim": claim,
                "fact_check_result": result,
                "sources_checked": sources,
                "success": True
            }
        except Exception as e:
            logger.error(f"Error in fact_check_with_browsing: {str(e)}")
            return {
                "claim": claim,
                "error": str(e),
                "success": False
            }
    
    async def extract_data_from_page(self, url: str, data_type: str) -> Dict[str, Any]:
        """
        Extract specific types of data from a webpage.
        
        Args:
            url: The webpage URL
            data_type: Type of data to extract (e.g., "tables", "statistics", "quotes")
        
        Returns:
            Extracted data
        """
        
        prompt = f"""Extract {data_type} from this webpage: {url}

        Instructions:
        1. Use browse_and_analyze_webpage to open the page
        2. Set scroll_depth to "full" to see all content
        3. Focus on extracting: {data_type}
        4. Preserve the structure and context of the data
        5. Note the location on the page where you found each piece of data

        Return the extracted data in a structured format."""
        
        try:
            result = await self.agent.run(prompt)
            
            return {
                "url": url,
                "data_type": data_type,
                "extracted_data": result,
                "success": True
            }
        except Exception as e:
            logger.error(f"Error in extract_data_from_page: {str(e)}")
            return {
                "url": url,
                "data_type": data_type,
                "error": str(e),
                "success": False
            }


def create_nova_research_agent(openai_api_key: Optional[str] = None) -> NovaResearchAgent:
    """Factory function to create a Nova research agent."""
    return NovaResearchAgent(openai_api_key)