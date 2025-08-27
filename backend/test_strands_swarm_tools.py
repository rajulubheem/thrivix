#!/usr/bin/env python3
"""
Test Strands Swarm with proper tools
"""

import os
from strands import Agent, tool
from strands.multiagent import Swarm
from strands.models.openai import OpenAIModel

# Create tools using the @tool decorator
@tool
def search_web(query: str) -> str:
    """Search the web for information about a topic.
    
    Args:
        query: The search query string
    """
    # Mock implementation for testing
    return f"Search results for '{query}': Found information about {query}. [Mock data]"

@tool
def analyze_data(data: str) -> str:
    """Analyze the provided data.
    
    Args:
        data: The data to analyze
    """
    return f"Analysis complete: {data[:100]}... [Analyzed]"

# Create agents
def create_test_agents():
    model = OpenAIModel(
        client_args={'api_key': os.getenv('OPENAI_API_KEY')},
        model_id='gpt-4o-mini'
    )
    
    researcher = Agent(
        name="researcher",
        model=model,
        system_prompt="You are a researcher. Use search_web to find information, then hand off to analyst.",
        tools=[search_web]
    )
    
    analyst = Agent(
        name="analyst",
        model=model, 
        system_prompt="You are an analyst. Analyze the data you receive and provide insights.",
        tools=[analyze_data]
    )
    
    return [researcher, analyst]

# Test the swarm
def test_swarm():
    agents = create_test_agents()
    
    swarm = Swarm(
        agents,
        max_handoffs=5,
        max_iterations=10
    )
    
    # Test with a simple task
    task = "Research Tesla stock price"
    print(f"Testing swarm with task: {task}")
    print("=" * 60)
    
    result = swarm(task)
    
    print(f"Result: {result}")
    
    # Check if result has any attributes
    if hasattr(result, '__dict__'):
        print(f"\nResult attributes: {result.__dict__.keys()}")

if __name__ == "__main__":
    test_swarm()