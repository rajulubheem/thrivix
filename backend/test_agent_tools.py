"""
Test script to verify agent tool usage
"""
import asyncio
import os
from app.services.enhanced_swarm_service import StrandsSwarmAgent, create_tavily_tool, create_file_tools

async def test_agent_with_tools():
    """Test if an agent can use tools properly"""
    
    # Create a simple callback to see what's happening
    async def callback(type, agent=None, data=None):
        if type == "text_generation":
            print(f"[{agent}] {data.get('chunk', '')}", end="")
        elif type == "tool_call":
            print(f"\n🔧 Tool called: {data.get('tool')} with {data.get('parameters')}")
        elif type == "agent_completed":
            print(f"\n✅ Agent completed")
    
    # Create tools
    tavily_tool = create_tavily_tool("test_agent", callback)
    file_write, file_read = create_file_tools("test_agent", callback)
    
    # Create agent with tools
    agent = StrandsSwarmAgent(
        name="test_agent",
        system_prompt="You are a helpful assistant that can search the web and work with files.",
        tools=[tavily_tool, file_write, file_read],
        callback_handler=callback
    )
    
    # Test 1: Simple search
    print("\n=== Test 1: Web Search ===")
    result = await agent.execute("Search for the latest news about Python programming language")
    print(f"\nResult: {result.get('response', '')[:200]}...")
    
    # Test 2: File writing
    print("\n\n=== Test 2: File Writing ===")
    result = await agent.execute("Create a file called 'test_output.txt' with the content 'Hello from test agent'")
    print(f"\nResult: {result.get('response', '')[:200]}...")
    
    # Test 3: File reading
    print("\n\n=== Test 3: File Reading ===")
    result = await agent.execute("Read the file 'test_output.txt' and tell me what it contains")
    print(f"\nResult: {result.get('response', '')[:200]}...")

if __name__ == "__main__":
    # Set API keys if not already set (for testing)
    if not os.getenv("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY not set")
        exit(1)
    
    if not os.getenv("TAVILY_API_KEY"):
        print("Warning: TAVILY_API_KEY not set - web search won't work")
    
    asyncio.run(test_agent_with_tools())