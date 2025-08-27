#!/usr/bin/env python3
"""
Test the fixed streaming swarm implementation
"""

import asyncio
import json
from app.services.fixed_streaming_swarm_service import FixedStreamingSwarmService

async def test_swarm():
    """Test the fixed streaming swarm"""
    
    # Initialize service
    service = FixedStreamingSwarmService()
    await service._ensure_initialized()
    
    # Test task
    task = "What is the current Tesla stock price?"
    
    print(f"\n🚀 Testing Fixed Swarm with task: {task}")
    print("=" * 60)
    
    # Execute swarm with streaming
    execution_id = "test_fixed_" + str(asyncio.get_event_loop().time())
    
    event_count = 0
    
    async for event in service.execute_streaming_swarm(
        execution_id=execution_id,
        task=task,
        agent_configs=service.get_default_agent_configs("research"),
        max_handoffs=5,
        max_iterations=10
    ):
        event_count += 1
        event_type = event.get("type")
        
        if event_type == "swarm_init":
            print(f"\n✅ Swarm initialized with agents: {event.get('agents')}")
            
        elif event_type == "agent_thinking":
            agent = event.get("agent", "unknown")
            message = event.get("message", "")
            print(f"\n🤔 {agent}: {message}")
            
        elif event_type == "complete":
            output = event.get("output", "No output")
            print(f"\n🎉 Swarm completed!")
            print(f"\n📊 Final Output:\n{output}")
            
        elif event_type == "error":
            error = event.get("error", "Unknown error")
            print(f"\n❌ Error: {error}")
            
        elif event_type == "heartbeat":
            print(".", end="", flush=True)
    
    print("\n" + "=" * 60)
    print(f"Total events: {event_count}")

if __name__ == "__main__":
    asyncio.run(test_swarm())