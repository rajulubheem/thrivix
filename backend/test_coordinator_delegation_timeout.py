#!/usr/bin/env python3
"""
Test script to verify the coordinator properly delegates to agents with timeout
"""
import asyncio
import json
import sys
from pathlib import Path

# Add the app directory to the path
sys.path.insert(0, str(Path(__file__).parent))

from app.services.coordinator_service import get_coordinator_service
from app.services.enhanced_swarm_service import EnhancedSwarmService
from app.schemas.swarm import SwarmExecutionRequest, AgentConfig


async def test_delegation_with_timeout():
    """Test that coordinator delegates properly with timeout"""
    
    print("\n" + "="*60)
    print("TESTING COORDINATOR DELEGATION (WITH TIMEOUT)")
    print("="*60 + "\n")
    
    # Create a callback handler to see what's happening
    events = []
    
    async def callback_handler(**kwargs):
        """Callback handler that accepts any keyword arguments"""
        event = {
            "type": kwargs.get('type'),
            "agent": kwargs.get('agent'),
            "data": kwargs.get('data')
        }
        events.append(event)
        
        # Print key events
        event_type = kwargs.get('type')
        agent = kwargs.get('agent')
        data = kwargs.get('data', {})
        
        if event_type == "tool_call":
            print(f"🔧 Tool Call: {data.get('tool')} by {agent}")
            if data.get('tool') == 'handoff_to_agent':
                params = data.get('parameters', {})
                print(f"   → Delegating to: {params.get('to_agent')}")
                print(f"   → Reason: {params.get('reason')}")
        elif event_type == "agent_started":
            print(f"🚀 Agent Started: {agent}")
        elif event_type == "text_generation":
            chunk = data.get('chunk', '')
            if chunk and len(chunk) < 200:  # Only print short chunks
                print(f"📝 {agent}: {chunk[:100]}...")
    
    # Test 1: Simple greeting with timeout
    print("\n" + "-"*40)
    print("TEST 1: Simple Greeting (10 second timeout)")
    print("-"*40)
    
    service = EnhancedSwarmService()
    request = SwarmExecutionRequest(
        task="Hello, how are you?",
        agents=[]  # No agents configured - coordinator should create them
    )
    
    try:
        # Execute through the swarm service with timeout
        result = await asyncio.wait_for(
            service.execute_swarm_async(
                request=request,
                user_id="test_user",
                callback_handler=callback_handler
            ),
            timeout=10.0  # 10 second timeout
        )
        
        print(f"\n✅ Execution completed: {result.status}")
        print(f"   Result: {result.result[:200] if result.result else 'No result'}...")
        
    except asyncio.TimeoutError:
        print(f"\n⏰ TIMEOUT: Execution took more than 10 seconds")
    
    # Check if handoff_to_agent was called
    handoff_calls = [e for e in events if e['type'] == 'tool_call' and e.get('data', {}).get('tool') == 'handoff_to_agent']
    
    if handoff_calls:
        print(f"\n✅ SUCCESS: Coordinator delegated {len(handoff_calls)} time(s)")
        for call in handoff_calls:
            params = call.get('data', {}).get('parameters', {})
            print(f"   - Delegated to: {params.get('to_agent')}")
    else:
        print(f"\n❌ FAILURE: Coordinator did NOT delegate!")
        
        # Check what events we did capture
        tool_calls = [e for e in events if e['type'] == 'tool_call']
        if tool_calls:
            print(f"   Tool calls found: {[e.get('data', {}).get('tool') for e in tool_calls]}")
        else:
            print(f"   No tool calls found at all")
        
        print(f"   Total events captured: {len(events)}")
        print(f"   Event types: {set([e['type'] for e in events if e['type']])}")
    
    print("\n" + "="*60)
    print("TEST COMPLETE")
    print("="*60 + "\n")


if __name__ == "__main__":
    asyncio.run(test_delegation_with_timeout())