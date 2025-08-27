#!/usr/bin/env python3
"""
Test to understand how Strands handles tool schemas
"""

from strands import Agent, tool
from strands.models.openai import OpenAIModel
import os
import json

# Test 1: Simple tool with explicit parameters
@tool
def search_web(query: str) -> str:
    """Search the web for information.
    
    Args:
        query: The search query string
    """
    return f"Searched for: {query}"

# Test 2: Tool with multiple parameters
@tool
def calculate(x: int, y: int, operation: str = "add") -> str:
    """Perform calculation.
    
    Args:
        x: First number
        y: Second number
        operation: Operation to perform (add, subtract, multiply, divide)
    """
    return f"Result: {x} {operation} {y}"

# Create agent with tools
model = OpenAIModel(
    client_args={'api_key': os.getenv('OPENAI_API_KEY')},
    model_id='gpt-4o-mini'
)

agent = Agent(
    name='test_agent',
    model=model,
    system_prompt='You are a test agent',
    tools=[search_web, calculate]
)

# Check tool configuration
print("=" * 60)
print("TOOL NAMES:")
print(agent.tool_names)
print("\n" + "=" * 60)
print("AGENT ATTRIBUTES:")
for attr in dir(agent):
    if not attr.startswith('_'):
        print(f"  - {attr}")
print("\n" + "=" * 60)

# Test if tools work
print("Testing tool invocation:")
try:
    # Test direct tool call
    result = agent.tool.search_web(query="test query")
    print(f"Direct call result: {result}")
except Exception as e:
    print(f"Direct call error: {e}")

print("\n" + "=" * 60)
print("Testing agent with natural language:")
response = agent("Search the web for 'Tesla stock price'")
print(f"Agent response: {response}")