"""
Test Strands with OpenAI models and streaming - FIXED
"""
import asyncio
import logging
from strands import Agent
from strands.multiagent import Swarm
from strands.models.openai import OpenAIModel
import os

# Enable debug logs and print them to stderr
logging.getLogger("strands.multiagent").setLevel(logging.DEBUG)
logging.basicConfig(
    format="%(levelname)s | %(name)s | %(message)s",
    handlers=[logging.StreamHandler()]
)

async def test_strands_with_streaming():
    """Test Strands with OpenAI models and streaming"""

    # Create OpenAI model configuration
    openai_model = OpenAIModel(
        client_args={
            "api_key": os.getenv("OPENAI_API_KEY"),  # Make sure to set this
        },
        model_id="gpt-4o-mini",  # or "gpt-4" for better quality
        params={
            "max_tokens": 2000,
            "temperature": 0.7,
        }
    )

    # Create specialized agents with BETTER prompts that actually DO work
    researcher = Agent(
        name="researcher",
        system_prompt="""You are a research specialist.
        Your job is to:
        1. Analyze the requirements for the task
        2. Research best practices and patterns
        3. Create a detailed requirements document
        4. Pass your findings to the architect

        IMPORTANT: Do actual research and analysis work before handing off.
        Only hand off to architect after completing your research.""",
        model=openai_model
    )

    architect = Agent(
        name="architect",
        system_prompt="""You are a system architecture specialist.
        Your job is to:
        1. Review the requirements from the researcher
        2. Design the system architecture
        3. Define API endpoints, data models, and system components
        4. Create architectural documentation
        5. Pass the design to the coder for implementation

        IMPORTANT: Create actual architectural designs before handing off.
        Only hand off to coder after completing the architecture.""",
        model=openai_model
    )

    coder = Agent(
        name="coder",
        system_prompt="""You are a coding specialist.
        Your job is to:
        1. Review the architecture from the architect
        2. Implement the actual code for the system
        3. Write clean, well-documented code
        4. Include all necessary files (API endpoints, models, etc.)
        5. Pass the code to the reviewer for review

        IMPORTANT: Write actual code before handing off.
        Only hand off to reviewer after implementing the solution.""",
        model=openai_model
    )

    reviewer = Agent(
        name="reviewer",
        system_prompt="""You are a code review specialist.
        Your job is to:
        1. Review the code from the coder
        2. Check for quality, security, and best practices
        3. Provide feedback and suggestions
        4. Approve the final implementation

        IMPORTANT: Do a thorough review and provide the final approved solution.
        Do NOT hand off after reviewing - provide the final result.""",
        model=openai_model
    )

    # Create a swarm with these agents
    swarm = Swarm(
        [researcher, architect, coder, reviewer],
        max_handoffs=20,
        max_iterations=20,
        execution_timeout=900.0,  # 15 minutes
        node_timeout=300.0,  # 5 minutes per agent
        repetitive_handoff_detection_window=8,
        # There must be >= 3 unique agents in the last 8 handoffs
        repetitive_handoff_min_unique_agents=3
    )

    # Test 1: Basic execution (non-streaming)
    print("\n" + "="*50)
    print("TEST 1: Basic Execution (Non-Streaming)")
    print("="*50)

    result = swarm("Design and implement a simple REST API for a todo app with the following endpoints: GET /todos, POST /todos, PUT /todos/:id, DELETE /todos/:id")

    # Access the final result correctly
    print(f"\nStatus: {result.status}")
    print(f"Node history: {[node.node_id for node in result.node_history]}")

    # Access results from specific nodes if available
    if hasattr(result, 'results') and result.results:
        print("\nResults from each agent:")
        for agent_name, agent_result in result.results.items():
            if hasattr(agent_result, 'result'):
                print(f"\n{agent_name}: {str(agent_result.result)[:200]}...")

    # Get the last node's output as the final result
    if result.node_history:
        last_node = result.node_history[-1]
        print(f"\nFinal output from {last_node.node_id}:")
        if hasattr(last_node, 'result'):
            print(f"{str(last_node.result)[:500]}...")

    # Test 2: Streaming execution with individual agents
    print("\n" + "="*50)
    print("TEST 2: Individual Agent Streaming")
    print("="*50)

    # Test streaming with a single agent
    streaming_agent = Agent(
        name="api_designer",
        system_prompt="""You are an API design expert.
        Design REST APIs with clear endpoints and documentation.
        Provide actual implementation code.""",
        model=openai_model,
        callback_handler=None  # Disable callback to use stream_async
    )

    print("\nStreaming from single agent:")
    print("-" * 30)

    chunk_count = 0
    response_text = ""

    # Use stream_async for real-time streaming
    agent_stream = streaming_agent.stream_async(
        "Design a REST API for a todo app with CRUD operations. Include code examples."
    )

    async for event in agent_stream:
        # Process different event types
        if "data" in event:
            # Text generation event
            chunk = event["data"]
            response_text += chunk
            chunk_count += 1
            print(chunk, end="", flush=True)  # Print in real-time

        elif "current_tool_use" in event:
            # Tool usage event
            tool_info = event["current_tool_use"]
            print(f"\n[TOOL: {tool_info.get('name')}]")

        elif "message" in event:
            # Message completion event
            message = event["message"]
            print(f"\n[MESSAGE: {message.get('role')}]")

        elif "result" in event:
            # Final result event
            print(f"\n[COMPLETED: {chunk_count} chunks streamed]")

    print(f"\n\nTotal response length: {len(response_text)} characters")

    # Test 3: Swarm streaming (if supported)
    print("\n" + "="*50)
    print("TEST 3: Swarm Async Execution")
    print("="*50)

    # Use invoke_async for async execution
    print("Using invoke_async for swarm execution...")

    async_result = await swarm.invoke_async(
        "Create a complete todo app with database schema, API endpoints, and implementation code"
    )

    print(f"\nAsync Status: {async_result.status}")
    print(f"Node history: {[node.node_id for node in async_result.node_history]}")

    # Check if swarm supports streaming
    if hasattr(swarm, 'stream_async'):
        print("\n" + "="*50)
        print("TEST 4: Swarm Streaming (if available)")
        print("="*50)

        print("Testing swarm.stream_async...")

        swarm_chunk_count = 0
        swarm_response = ""
        current_agent = "swarm"

        try:
            # Create a new swarm for streaming test
            streaming_swarm = Swarm(
                [researcher, architect, coder, reviewer],
                max_handoffs=10,
                max_iterations=10
            )

            # Stream from swarm
            swarm_stream = streaming_swarm.stream_async(
                "Design a simple user authentication system"
            )

            async for event in swarm_stream:
                if "data" in event:
                    chunk = event["data"]
                    swarm_response += chunk
                    swarm_chunk_count += 1
                    print(chunk, end="", flush=True)

                elif "handoff" in event:
                    # Agent handoff event
                    handoff_info = event.get("handoff", {})
                    new_agent = handoff_info.get("to_agent", current_agent)
                    print(f"\n[HANDOFF: {current_agent} → {new_agent}]\n")
                    current_agent = new_agent

                elif "current_tool_use" in event:
                    tool_info = event["current_tool_use"]
                    print(f"\n[TOOL: {tool_info.get('name')} by {current_agent}]\n")

                elif "result" in event:
                    print(f"\n[SWARM COMPLETED: {swarm_chunk_count} chunks]")

            print(f"\n\nSwarm response length: {len(swarm_response)} characters")

        except Exception as e:
            print(f"Swarm streaming error: {e}")

    else:
        print("\nSwarm doesn't support stream_async method")

def main():
    """Main function to run tests"""

    # Check for OpenAI API key
    if not os.getenv("OPENAI_API_KEY"):
        print("ERROR: Please set OPENAI_API_KEY environment variable")
        print("Example: export OPENAI_API_KEY='your-api-key-here'")
        return

    print("Starting Strands tests with OpenAI models and streaming...")

    try:
        # Run async tests
        asyncio.run(test_strands_with_streaming())
    except Exception as e:
        print(f"\nError during execution: {e}")
        import traceback
        traceback.print_exc()

    print("\n" + "="*50)
    print("All tests completed!")
    print("="*50)

if __name__ == "__main__":
    main()