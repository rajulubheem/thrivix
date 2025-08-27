#!/usr/bin/env python3
"""
Test script for True Swarm implementation
This will help us understand:
1. How Strands Swarm executes
2. What information we can capture for streaming
3. How agents communicate and handoff
"""

import asyncio
import logging
import sys
from datetime import datetime
import json

# Add parent directory to path
sys.path.append('/Users/bheemarajulu/project_wksp/strands_ai_agent/backend')

# Configure detailed logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s | %(levelname)s | %(name)s | %(message)s',
    handlers=[logging.StreamHandler()]
)

# Enable all Strands logging
logging.getLogger("strands").setLevel(logging.DEBUG)
logging.getLogger("strands.multiagent").setLevel(logging.DEBUG)
logging.getLogger("strands.agent").setLevel(logging.DEBUG)

from app.services.true_swarm_service import TrueSwarmService


async def streaming_callback(event: dict):
    """Callback to simulate streaming events"""
    timestamp = datetime.now().isoformat()
    event_type = event.get("type", "unknown")
    
    print(f"\n{'='*60}")
    print(f"[{timestamp}] EVENT: {event_type}")
    print(f"Data: {json.dumps(event, indent=2, default=str)}")
    print(f"{'='*60}\n")


async def test_simple_swarm():
    """Test a simple swarm task"""
    print("\n" + "="*80)
    print("TEST 1: Simple Research Task")
    print("="*80)
    
    service = TrueSwarmService()
    await service._ensure_initialized()
    
    # Simple research task
    task = "Research the latest trends in AI and machine learning for 2024"
    
    # Use only researcher and analyst for simple task
    agent_configs = {
        "researcher": {
            "system_prompt": """You are a research specialist. 
            Research the given topic thoroughly using web search.
            Provide comprehensive findings.
            Hand off to analyst when done.""",
            "tools": ["tavily_search"],
            "model": "gpt-4o-mini"
        },
        "analyst": {
            "system_prompt": """You are an analyst.
            Analyze the research findings.
            Provide insights and summary.
            Complete the task with final analysis.""",
            "tools": [],
            "model": "gpt-4o-mini"
        }
    }
    
    print(f"Task: {task}")
    print(f"Agents: {list(agent_configs.keys())}")
    
    result = await service.execute_swarm(
        task=task,
        agent_configs=agent_configs,
        max_handoffs=5,
        max_iterations=10,
        callback=streaming_callback
    )
    
    print("\n" + "="*80)
    print("RESULT:")
    print(json.dumps(result, indent=2, default=str))
    print("="*80)
    
    return result


async def test_complex_swarm():
    """Test a complex swarm task with multiple agents"""
    print("\n" + "="*80)
    print("TEST 2: Complex Development Task")
    print("="*80)
    
    service = TrueSwarmService()
    await service._ensure_initialized()
    
    # Complex development task
    task = "Design and implement a Python function to calculate fibonacci numbers with memoization"
    
    # Use all agents for complex task
    agent_configs = {
        "researcher": {
            "system_prompt": """You are a research specialist in the swarm.
            Research fibonacci algorithms and memoization techniques.
            Find best practices and optimal implementations.
            Hand off to architect when research is complete.""",
            "tools": ["tavily_search"],
            "model": "gpt-4o-mini"
        },
        "architect": {
            "system_prompt": """You are the system architect in the swarm.
            Based on the research, design the optimal solution.
            Create a clear specification for the implementation.
            Hand off to coder when design is ready.""",
            "tools": [],
            "model": "gpt-4o-mini"
        },
        "coder": {
            "system_prompt": """You are the coder in the swarm.
            Implement the solution based on the architecture.
            Write clean, efficient Python code.
            Test your implementation.
            Hand off to reviewer when done.""",
            "tools": ["python_repl"],
            "model": "gpt-4o-mini"
        },
        "reviewer": {
            "system_prompt": """You are the code reviewer in the swarm.
            Review the implementation for correctness and quality.
            Test edge cases.
            Provide final assessment and improvements if needed.""",
            "tools": ["python_repl"],
            "model": "gpt-4o-mini"
        }
    }
    
    print(f"Task: {task}")
    print(f"Agents: {list(agent_configs.keys())}")
    
    result = await service.execute_swarm(
        task=task,
        agent_configs=agent_configs,
        max_handoffs=10,
        max_iterations=15,
        callback=streaming_callback
    )
    
    print("\n" + "="*80)
    print("RESULT:")
    print(json.dumps(result, indent=2, default=str))
    print("="*80)
    
    return result


async def test_streaming_capabilities():
    """Test what we can capture for streaming"""
    print("\n" + "="*80)
    print("TEST 3: Streaming Capabilities Analysis")
    print("="*80)
    
    # Create a custom logger to capture all Strands events
    class StreamCapture(logging.Handler):
        def __init__(self):
            super().__init__()
            self.events = []
        
        def emit(self, record):
            self.events.append({
                "timestamp": datetime.now().isoformat(),
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage(),
                "module": record.module
            })
    
    # Add our custom handler
    stream_capture = StreamCapture()
    logging.getLogger("strands").addHandler(stream_capture)
    
    # Run a simple task
    service = TrueSwarmService()
    await service._ensure_initialized()
    
    task = "What is 2+2? Think step by step."
    
    agent_configs = {
        "calculator": {
            "system_prompt": "You are a calculator. Solve the math problem step by step.",
            "tools": [],
            "model": "gpt-4o-mini"
        }
    }
    
    result = await service.execute_swarm(
        task=task,
        agent_configs=agent_configs,
        max_handoffs=2,
        max_iterations=5
    )
    
    # Analyze captured events
    print(f"\nCaptured {len(stream_capture.events)} events")
    print("\nEvent types:")
    event_types = {}
    for event in stream_capture.events:
        logger_name = event["logger"]
        if logger_name not in event_types:
            event_types[logger_name] = 0
        event_types[logger_name] += 1
    
    for logger_name, count in event_types.items():
        print(f"  {logger_name}: {count} events")
    
    print("\nSample events (first 5):")
    for event in stream_capture.events[:5]:
        print(f"  [{event['timestamp']}] {event['logger']}: {event['message'][:100]}...")
    
    return stream_capture.events


async def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("STRANDS SWARM TESTING")
    print("="*80)
    
    # Test 1: Simple swarm
    try:
        await test_simple_swarm()
    except Exception as e:
        print(f"Test 1 failed: {e}")
        import traceback
        traceback.print_exc()
    
    # Test 2: Complex swarm
    try:
        await test_complex_swarm()
    except Exception as e:
        print(f"Test 2 failed: {e}")
        import traceback
        traceback.print_exc()
    
    # Test 3: Streaming analysis
    try:
        events = await test_streaming_capabilities()
        
        # Save events for analysis
        with open("swarm_events.json", "w") as f:
            json.dump(events, f, indent=2, default=str)
        print(f"\nEvents saved to swarm_events.json")
    except Exception as e:
        print(f"Test 3 failed: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n" + "="*80)
    print("TESTING COMPLETE")
    print("="*80)


if __name__ == "__main__":
    # Set up environment
    import os
    os.environ["OPENAI_API_KEY"] = os.getenv("OPENAI_API_KEY", "")
    os.environ["TAVILY_API_KEY"] = os.getenv("TAVILY_API_KEY", "")
    
    # Run tests
    asyncio.run(main())