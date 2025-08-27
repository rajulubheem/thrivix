#!/usr/bin/env python3
"""
Test script for True Swarm with proper tools
"""

import asyncio
import json
from app.services.streaming_swarm_service import StreamingSwarmService

async def test_swarm():
    """Test the streaming swarm with actual tools"""
    
    # Initialize service
    service = StreamingSwarmService()
    await service._ensure_initialized()
    
    # Test task
    task = "Research the current stock price and recent news about Tesla (TSLA)"
    
    print(f"\n🚀 Testing True Swarm with task: {task}")
    print("=" * 60)
    
    # Execute swarm with streaming
    execution_id = "test_" + str(asyncio.get_event_loop().time())
    
    event_count = 0
    tool_calls = []
    handoffs = []
    
    # Get agent configs for research task
    agent_configs = service.get_default_agent_configs("research")
    
    async for event in service.execute_streaming_swarm(
        execution_id=execution_id,
        task=task,
        agent_configs=agent_configs,
        max_handoffs=10,
        max_iterations=20
    ):
        event_count += 1
        event_type = event.get("type")
        
        if event_type == "swarm_init":
            print(f"\n✅ Swarm initialized with agents: {event.get('agents')}")
            
        elif event_type == "agent_thinking":
            agent = event.get("agent", "unknown")
            print(f"\n🤔 {agent} is thinking...")
            
        elif event_type == "tool_call":
            agent = event.get("agent", "unknown")
            tool = event.get("tool", "unknown")
            params = event.get("params", {})
            print(f"\n🔧 {agent} calling {tool}")
            if params:
                print(f"   Parameters: {json.dumps(params, indent=2)[:200]}")
            tool_calls.append({"agent": agent, "tool": tool})
            
        elif event_type == "tool_result":
            tool = event.get("tool", "unknown")
            success = event.get("success", False)
            result = event.get("result", "")
            if success:
                print(f"\n✅ {tool} succeeded")
                if result:
                    print(f"   Result preview: {result[:200]}...")
            else:
                print(f"\n❌ {tool} failed: {result}")
                
        elif event_type == "handoff":
            from_agent = event.get("from_agent", "unknown")
            to_agent = event.get("to_agent", "unknown")
            print(f"\n🤝 Handoff: {from_agent} → {to_agent}")
            handoffs.append({"from": from_agent, "to": to_agent})
            
        elif event_type == "complete":
            output = event.get("output", "No output")
            print(f"\n🎉 Swarm completed!")
            print(f"\n📊 Final Output:\n{output}")
            
        elif event_type == "error":
            error = event.get("error", "Unknown error")
            print(f"\n❌ Error: {error}")
            
        elif event_type == "heartbeat":
            # Skip heartbeats for cleaner output
            pass
    
    # Summary
    print("\n" + "=" * 60)
    print("📈 EXECUTION SUMMARY")
    print(f"Total events: {event_count}")
    print(f"Tool calls: {len(tool_calls)}")
    if tool_calls:
        print("\nTools used:")
        for tc in tool_calls:
            print(f"  - {tc['agent']} used {tc['tool']}")
    print(f"\nHandoffs: {len(handoffs)}")
    if handoffs:
        print("\nHandoff sequence:")
        for h in handoffs:
            print(f"  - {h['from']} → {h['to']}")

if __name__ == "__main__":
    asyncio.run(test_swarm())