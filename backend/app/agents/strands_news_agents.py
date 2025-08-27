"""
News Research Agents for Strands
Properly configured for collector/summarizer pattern
"""
from typing import Dict, Any, List, Optional

def create_news_collector_agent(available_tools: List[str] = None) -> Dict[str, Any]:
    """
    Create a news collector agent that searches for information.
    This agent NEEDS search tools to function.
    """
    if available_tools is None:
        available_tools = ["tavily_search"]  # Default
    
    # Filter to only search tools
    search_tools = [t for t in available_tools if "search" in t.lower()]
    
    return {
        "name": "news_collector",
        "description": "Collects news and information using search tools",
        "system_prompt": """You are a news collection specialist.

YOUR ROLE: Search for and collect the requested information.

CAPABILITIES:
- You have access to web search tools
- You can find current news and information
- You collect comprehensive data

PROCESS:
1. Use your search tools to find the requested information
2. Collect all relevant data, URLs, and sources
3. Pass the complete results to the next agent for processing

HANDOFF INSTRUCTION:
After collecting data, hand off to the summarizer agent with:
"I've collected the search results. Please summarize this information."

IMPORTANT:
- You ONLY collect data, do not summarize
- Include all search results for the next agent
- Your job is complete once you've gathered the information""",
        "tools": search_tools,
        "model": "gpt-4o-mini",
        "temperature": 0.3,
        "max_tokens": 16000
    }


def create_news_summarizer_agent() -> Dict[str, Any]:
    """
    Create a news summarizer agent that processes collected information.
    This agent does NOT need tools - it only processes existing data.
    """
    return {
        "name": "news_summarizer",
        "description": "Summarizes news from collected search results",
        "system_prompt": """You are a news summarization specialist.

YOUR ROLE: Create clear, concise summaries from collected data.

CAPABILITIES:
- You analyze and synthesize information
- You extract key insights and trends
- You organize information by importance

PROCESS:
1. Read the search results from the previous agent
2. Identify key information and patterns
3. Create a structured summary

OUTPUT FORMAT:
## Executive Summary
[2-3 sentence overview]

## Key Findings
• [Most important point]
• [Second important point]
• [Third important point]

## Detailed Analysis
[Comprehensive summary organized by topic]

## Sources
[List all sources with URLs from the search results]

IMPORTANT RULES:
- You do NOT have search tools - work with provided data only
- You do NOT search for new information
- You ONLY summarize what the collector agent provided
- Focus on creating value through analysis and organization""",
        "tools": [],  # NO TOOLS - This is critical
        "model": "gpt-4o-mini",
        "temperature": 0.5,
        "max_tokens": 16000
    }


def create_news_swarm_agents(task: str, available_tools: List[str] = None) -> List[Dict[str, Any]]:
    """
    Create a swarm of agents for news-related tasks.
    Follows Strands' pattern of specialized agents with handoffs.
    """
    task_lower = task.lower()
    
    # For news/search tasks, use collector + summarizer pattern
    if any(word in task_lower for word in ["news", "latest", "current", "search", "find"]):
        return [
            create_news_collector_agent(available_tools),
            create_news_summarizer_agent()
        ]
    
    # For direct questions, single agent might be enough
    else:
        collector = create_news_collector_agent(available_tools)
        collector["system_prompt"] += "\n\nAfter collecting, provide a brief summary of findings."
        return [collector]