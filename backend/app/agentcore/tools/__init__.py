"""
AgentCore Built-in Tools

Collection of common tools for agents.
Based on patterns from strands-samples.
"""

from app.agentcore.tools.common_tools import (
    web_search,
    calculator,
    get_current_time,
    get_weather,
    send_notification
)

# Tool registry mapping tool names to functions
TOOL_REGISTRY = {
    "web_search": web_search,
    "calculator": calculator,
    "get_current_time": get_current_time,
    "get_weather": get_weather,
    "send_notification": send_notification,
}


def get_tools_by_names(tool_names: list[str]) -> list:
    """
    Get tool functions by their names.

    Args:
        tool_names: List of tool names to load

    Returns:
        List of tool functions

    Example:
        >>> tools = get_tools_by_names(["web_search", "calculator"])
        >>> agent = Agent(model=model, tools=tools)
    """
    tools = []
    for name in tool_names:
        if name in TOOL_REGISTRY:
            tools.append(TOOL_REGISTRY[name])
    return tools


__all__ = [
    "TOOL_REGISTRY",
    "get_tools_by_names",
    "web_search",
    "calculator",
    "get_current_time",
    "get_weather",
    "send_notification",
]
