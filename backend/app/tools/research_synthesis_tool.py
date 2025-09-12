"""
Research Synthesis Tool (Agents-as-Tools pattern)
Combines collected findings into a structured report with inline citations.
"""
from strands import tool
from typing import Any, List, Dict
from .use_llm_wrapper import use_llm_with_model

@tool
def research_synthesis(sources_summary: str, instructions: str = None) -> str:
    """Synthesize findings into a structured research response.

    Args:
        sources_summary: A textual summary of ordered sources (title, url, snippet).
        instructions: Optional extra instructions.

    Returns:
        Markdown text with sections and inline numeric citations [1], [2], etc.
    """
    synth_prompt = (
        "Synthesize findings into a structured, comprehensive research response with inline numeric citations [1], [2], etc., "
        "matching the order of the sources list provided. Required sections: Executive Summary (4-5 bullets), Current State (300+ words), "
        "Key Patterns & Insights (400+ words), Data & Evidence (300+ words with specific metrics), Multiple Perspectives (300+ words), "
        "Future Outlook (300+ words), Actionable Recommendations (5-7 detailed items). Aim for 1200-1800 words. "
        "Use citations throughout.\n\nSOURCES (ordered):\n" + sources_summary + ("\n\nINSTRUCTIONS:\n" + instructions if instructions else "")
    )
    text = use_llm_with_model(synth_prompt, system_prompt="You are a synthesis expert.")
    return text or "No synthesis produced."
