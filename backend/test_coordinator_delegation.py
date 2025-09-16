#!/usr/bin/env python3
"""
Test script to verify the coordinator properly delegates to agents
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


async def test_delegation():
    """Test that coordinator delegates properly"""
    
    print("\n" + "="*60)
    print("TESTING COORDINATOR DELEGATION")
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
    
    # Test 1: Simple greeting
    print("\n" + "-"*40)
    print("TEST 1: Simple Greeting")
    print("-"*40)
    
    service = EnhancedSwarmService()
    request = SwarmExecutionRequest(
        task="Hello, how are you?",
        agents=[]  # No agents configured - coordinator should create them
    )
    
    # Execute through the swarm service
    result = await service.execute_swarm_async(
        request=request,
        user_id="test_user",
        callback_handler=callback_handler
    )
    
    # Check if handoff_to_agent was called
    handoff_calls = [e for e in events if e['type'] == 'tool_call' and e['data'].get('tool') == 'handoff_to_agent']
    
    if handoff_calls:
        print(f"\n✅ SUCCESS: Coordinator delegated {len(handoff_calls)} time(s)")
        for call in handoff_calls:
            params = call['data'].get('parameters', {})
            print(f"   - Delegated to: {params.get('to_agent')}")
    else:
        print(f"\n❌ FAILURE: Coordinator did NOT delegate!")
        print(f"   Events captured: {[e['type'] for e in events]}")
    
    # Test 2: Follow-up message (testing continuous delegation)
    print("\n" + "-"*40)
    print("TEST 2: Follow-up Message")
    print("-"*40)
    
    events.clear()  # Clear events for second test
    
    request2 = SwarmExecutionRequest(
        task="What is 2 + 2?",
        agents=[]
    )
    
    # Use the same session to test conversation continuity
    result2 = await service.execute_swarm_async(
        request=request2,
        user_id="test_user",
        callback_handler=callback_handler
    )
    
    # Check if handoff_to_agent was called again
    handoff_calls2 = [e for e in events if e['type'] == 'tool_call' and e['data'].get('tool') == 'handoff_to_agent']
    
    if handoff_calls2:
        print(f"\n✅ SUCCESS: Coordinator delegated {len(handoff_calls2)} time(s) in follow-up")
        for call in handoff_calls2:
            params = call['data'].get('parameters', {})
            print(f"   - Delegated to: {params.get('to_agent')}")
    else:
        print(f"\n❌ FAILURE: Coordinator did NOT delegate in follow-up!")
        print(f"   Events captured: {[e['type'] for e in events]}")
    
    print("\n" + "="*60)
    print("TEST COMPLETE")
    print("="*60 + "\n")


if __name__ == "__main__":
    asyncio.run(test_delegation())