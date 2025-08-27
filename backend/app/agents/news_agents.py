"""
News Research and Summarization Agents
Properly configured with and without tools
"""
from typing import Dict, Any, List

def get_news_fetcher_config(search_tools: List[str] = None) -> Dict[str, Any]:
    """Create a news fetcher agent with search tools"""
    if search_tools is None:
        search_tools = ["tavily_search"]  # Default fallback
        
    return {
        "name": "news_fetcher",
        "system_prompt": """You are a news research specialist tasked with finding the latest news.

YOUR SINGLE RESPONSIBILITY: Use search tools to find news and information.

INSTRUCTIONS:
1. Use the search tool to find comprehensive, current information
2. Search for detailed, relevant results
3. Pass the complete search results to the next agent
4. Include all URLs, sources, and raw data

CRITICAL:
- You are the FETCHER - only search and collect
- DO NOT summarize or analyze
- Pass raw results to the next agent
- The next agent will create the summary""",
        "tools": search_tools,
        "model": "gpt-4o-mini",
        "temperature": 0.3,
        "max_tokens": 16000,
        "description": "News fetcher with search tools"
    }

def get_news_summarizer_config() -> Dict[str, Any]:
    """Create a news summarizer agent WITHOUT any tools"""
    return {
        "name": "news_summarizer",
        "system_prompt": """You are a news summarization expert.

YOUR SINGLE RESPONSIBILITY: Summarize the search results from the previous agent.

INSTRUCTIONS:
1. Read the search results provided by the fetcher agent
2. Create a comprehensive summary
3. Extract key insights and trends
4. Organize by importance

OUTPUT FORMAT:
## Executive Summary
[2-3 sentence overview of the news]

## Key Highlights
• [Most important finding]
• [Second important finding]
• [Third important finding]

## Detailed Analysis
[Organized summary of all findings]

## Sources
[List all sources with URLs]

CRITICAL RULES:
- You are the SUMMARIZER - DO NOT search for new information
- You have NO tools - only summarize what was provided
- If you try to search, YOU WILL FAIL
- Only process the data from the previous agent""",
        "tools": [],  # EXPLICITLY NO TOOLS
        "model": "gpt-4o-mini",
        "temperature": 0.5,
        "max_tokens": 16000,
        "description": "News summarizer (NO TOOLS)"
    }