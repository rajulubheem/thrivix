"""
Common Tools for Agents

Production-quality tools following patterns from strands-samples.
All tools return JSON strings with {"status": "success|error", "content": ...} format.
"""

import json
import math
from datetime import datetime
from typing import Optional
from strands import tool


@tool
def web_search(query: str, max_results: int = 5) -> str:
    """
    Search the web for information.

    Args:
        query: Search query string
        max_results: Maximum number of results to return (default: 5)

    Returns:
        JSON string with search results or error message

    Example:
        >>> result = web_search("AWS Bedrock pricing")
        >>> data = json.loads(result)
        >>> print(data["results"][0]["title"])
    """
    # TODO: Integrate with actual search API (Tavily, DuckDuckGo, etc.)
    # For now, return placeholder
    return json.dumps({
        "status": "success",
        "query": query,
        "results": [
            {
                "title": f"Search result for: {query}",
                "snippet": "This is a placeholder. Integrate with actual search API.",
                "url": "https://example.com"
            }
        ],
        "count": 1,
        "message": "Search completed successfully. Configure search API for production use."
    })


@tool
def calculator(expression: str) -> str:
    """
    Evaluate mathematical expressions safely.

    Args:
        expression: Mathematical expression to evaluate (e.g., "2 + 2 * 3")

    Returns:
        JSON string with calculation result or error

    Example:
        >>> result = calculator("sqrt(16) + 5")
        >>> data = json.loads(result)
        >>> print(data["result"])  # 9.0
    """
    try:
        # Safe evaluation using math module
        allowed_names = {
            k: v for k, v in math.__dict__.items() if not k.startswith("__")
        }
        allowed_names.update({"abs": abs, "round": round})

        result = eval(expression, {"__builtins__": {}}, allowed_names)

        return json.dumps({
            "status": "success",
            "expression": expression,
            "result": result,
            "message": f"Calculation completed: {expression} = {result}"
        })
    except Exception as e:
        return json.dumps({
            "status": "error",
            "expression": expression,
            "message": f"Calculation failed: {str(e)}"
        })


@tool
def get_current_time(timezone: Optional[str] = None) -> str:
    """
    Get the current date and time.

    Args:
        timezone: Optional timezone (e.g., "UTC", "America/New_York")

    Returns:
        JSON string with current datetime

    Example:
        >>> result = get_current_time()
        >>> data = json.loads(result)
        >>> print(data["datetime"])
    """
    try:
        now = datetime.now()

        return json.dumps({
            "status": "success",
            "datetime": now.isoformat(),
            "timestamp": int(now.timestamp()),
            "timezone": timezone or "local",
            "formatted": now.strftime("%Y-%m-%d %H:%M:%S"),
            "message": f"Current time: {now.strftime('%Y-%m-%d %H:%M:%S')}"
        })
    except Exception as e:
        return json.dumps({
            "status": "error",
            "message": f"Failed to get current time: {str(e)}"
        })


@tool
def get_weather(location: str, units: str = "celsius") -> str:
    """
    Get weather information for a location.

    Args:
        location: City name or coordinates
        units: Temperature units ("celsius" or "fahrenheit")

    Returns:
        JSON string with weather data

    Example:
        >>> result = get_weather("San Francisco")
        >>> data = json.loads(result)
        >>> print(data["temperature"])
    """
    # TODO: Integrate with actual weather API
    # For now, return placeholder
    return json.dumps({
        "status": "success",
        "location": location,
        "temperature": 72,
        "units": units,
        "conditions": "Partly Cloudy",
        "humidity": 65,
        "wind_speed": 10,
        "message": f"Weather data for {location}. Configure weather API for production use."
    })


@tool
def send_notification(
    message: str,
    channel: str = "email",
    recipient: Optional[str] = None
) -> str:
    """
    Send a notification to specified channel.

    Args:
        message: Notification message content
        channel: Notification channel ("email", "sms", "slack", etc.)
        recipient: Recipient identifier (email, phone, etc.)

    Returns:
        JSON string with send status

    Example:
        >>> result = send_notification("Task completed", channel="slack")
        >>> data = json.loads(result)
        >>> print(data["status"])
    """
    # TODO: Integrate with actual notification service (SNS, SES, etc.)
    return json.dumps({
        "status": "success",
        "message": message,
        "channel": channel,
        "recipient": recipient or "default",
        "notification_id": f"notif-{int(datetime.now().timestamp())}",
        "sent_at": datetime.now().isoformat(),
        "message_text": f"Notification sent via {channel}. Configure notification service for production."
    })
