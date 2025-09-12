"""
Research Planner Tool (Agents-as-Tools pattern)
Produces a bounded JSON search plan for a given query.
"""
from strands import tool
from typing import Any
from .use_llm_wrapper import use_llm_with_model

@tool
def research_planner(query: str, max_queries: int = 8) -> str:
    """Create a bounded web search plan for the query.

    Returns JSON with shape:
    {
      "queries": [string, ...],
      "goals": [string, ...],
      "stop_condition": string
    }
    """
    plan_prompt = (
        "Create a web search plan for the user query. Return STRICT JSON only.\n"
        "JSON fields: queries (array of up to {maxq} strings), goals (array), stop_condition (string).\n"
        "Focus on diverse angles and recency.\n\nUSER_QUERY: {query}\n\nJSON_ONLY:"
    ).format(query=query, maxq=max_queries)
    text = use_llm_with_model(plan_prompt, system_prompt="You are a planning agent. Output JSON only.")
    return text or "{\n  \"queries\": [], \n  \"goals\": [], \n  \"stop_condition\": \"budget\"\n}"

