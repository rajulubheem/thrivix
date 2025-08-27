"""
Dynamic Agent Builder
Creates agents with tools loaded from unified tool service
"""
from typing import Dict, Any, List, Optional
import structlog
from app.services.unified_tool_service import UnifiedToolService
from app.agents.advanced_agent_prompts import (
    get_agent_prompt,
    create_dynamic_prompt,
    RESEARCHER_AGENT_PROMPT
)

logger = structlog.get_logger()

class DynamicAgentBuilder:
    """Build agents dynamically with tools from settings"""
    
    def __init__(self):
        self.tool_service = UnifiedToolService()
        
    async def initialize(self):
        """Initialize the tool service"""
        await self.tool_service.initialize()
    
    def get_search_tools(self) -> List[str]:
        """Get available search tools from the unified tool service"""
        try:
            all_tools = self.tool_service.get_all_tools(enabled_only=True)
            search_tools = []
            
            for tool in all_tools:
                # Find web search tools
                if tool['category'] == 'web_search' and tool['enabled']:
                    search_tools.append(tool['name'])
                    
            logger.info(f"Available search tools: {search_tools}")
            return search_tools
        except:
            # Fallback if tool service not initialized
            return ["tavily_search"]
    
    def create_news_researcher_config(self) -> Dict[str, Any]:
        """Create a news researcher agent with dynamically loaded tools"""
        search_tools = self.get_search_tools()
        
        # Use advanced researcher prompt with specific task context
        task_context = """YOUR SPECIFIC TASK:
Search for and collect comprehensive news/information using available search tools.
Focus on current, relevant results with details and sources.
Pass ALL information to the next agent for summarization."""
        
        system_prompt = get_agent_prompt("researcher", task_context)
        
        return {
            "name": "tsla news fetcher",
            "system_prompt": system_prompt,
            "tools": search_tools,  # Dynamically loaded tools
            "model": "gpt-4o-mini",
            "temperature": 0.3,
            "max_tokens": 16000,
            "description": "News collector using available search tools"
        }
    
    def create_news_summarizer_config(self) -> Dict[str, Any]:
        """Create a news summarizer agent WITHOUT any tools"""
        return {
            "name": "tsla news summarizer", 
            "system_prompt": """You are a news summarization expert.

YOUR ROLE: Summarize the news/information collected by the previous agent.

INSTRUCTIONS:
1. Read the search results provided by the news collector agent
2. Create a comprehensive yet concise summary
3. Organize information by importance and relevance
4. Extract key insights and actionable information

SUMMARY FORMAT:
## Executive Summary
[2-3 sentence overview]

## Key Highlights
• [Important point 1]
• [Important point 2]
• [Important point 3]

## Detailed Findings
[Organized summary of main findings]

## Sources
[List of sources with URLs]

IMPORTANT:
- You are the SUMMARIZER - DO NOT search for new information
- DO NOT use any tools - only summarize what was provided
- Focus on creating a clear, actionable summary
- If you see [TOOL: in the input, that's the search result from the previous agent - summarize it""",
            "tools": [],  # NO TOOLS for summarizer - MUST BE EMPTY
            "model": "gpt-4o-mini",
            "temperature": 0.5,
            "max_tokens": 16000,
            "description": "News summarizer (no tools)"
        }
    
    def create_general_researcher_config(self) -> Dict[str, Any]:
        """Create a general researcher that both searches and summarizes"""
        search_tools = self.get_search_tools()
        
        # Create dynamic prompt with tools
        system_prompt = create_dynamic_prompt(
            task="Search for information and provide comprehensive analysis with sources",
            available_tools=search_tools,
            previous_work=[]
        )
        
        return {
            "name": "web_researcher",
            "system_prompt": system_prompt,
            "tools": search_tools,  # Dynamically loaded tools
            "model": "gpt-4o-mini",
            "temperature": 0.3,
            "max_tokens": 16000,
            "description": "General web researcher"
        }

# Global instance
dynamic_agent_builder = DynamicAgentBuilder()