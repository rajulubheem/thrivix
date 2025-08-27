#!/usr/bin/env python3
"""Test script to verify Swarm conversation continuation"""

import asyncio
import aiohttp
import json
import time

BASE_URL = "http://localhost:8000/api/v1"

async def test_swarm_continuation():
    """Test that Swarm maintains conversation context"""
    
    async with aiohttp.ClientSession() as session:
        # Step 1: Create a new chat session
        print("Creating new chat session...")
        async with session.post(
            f"{BASE_URL}/chat/sessions",
            json={
                "title": "Test Swarm Continuation",
                "description": "Testing conversation context preservation",
                "agents_config": {
                    "research_agent": {
                        "name": "research_agent",
                        "system_prompt": "You are a research assistant. Help users find and analyze information.",
                        "tools": ["tavily_search"]
                    }
                },
                "max_handoffs": 3,
                "max_iterations": 5
            }
        ) as resp:
            session_data = await resp.json()
            print(f"Session response: {session_data}")
            # Use session_id instead of id
            session_id = session_data.get("session_id") or str(session_data.get("id"))
            print(f"Created session: {session_id}")
        
        # Step 2: Send first message
        print("\nSending first message...")
        async with session.post(
            f"{BASE_URL}/chat/sessions/{session_id}/execute",
            json={
                "message": "What is the current stock price of Tesla?",
                "execution_mode": "sequential"
            }
        ) as resp:
            first_response = await resp.json()
            execution_id_1 = first_response.get("execution_id")
            print(f"First execution ID: {execution_id_1}")
        
        # Wait for first execution to complete
        print("Waiting for first execution to complete...")
        await asyncio.sleep(5)
        
        # Step 3: Get messages to verify first response
        print("\nGetting messages from session...")
        async with session.get(
            f"{BASE_URL}/chat/sessions/{session_id}/messages"
        ) as resp:
            messages_data = await resp.json()
            messages = messages_data.get("messages", [])
            print(f"Total messages in session: {len(messages)}")
            
            if messages:
                print("\nMessages in conversation:")
                for msg in messages:
                    role = msg.get("role", "unknown")
                    content = msg.get("content", "")[:200]  # Truncate for display
                    print(f"  {role}: {content}...")
        
        # Step 4: Send follow-up message (this should maintain context)
        print("\nSending follow-up message...")
        async with session.post(
            f"{BASE_URL}/chat/sessions/{session_id}/execute",
            json={
                "message": "What was the percentage change from yesterday?",
                "execution_mode": "sequential"
            }
        ) as resp:
            second_response = await resp.json()
            execution_id_2 = second_response.get("execution_id")
            print(f"Second execution ID: {execution_id_2}")
        
        # Wait for second execution to complete
        print("Waiting for second execution to complete...")
        await asyncio.sleep(5)
        
        # Step 5: Get all messages to verify context was maintained
        print("\nGetting final messages from session...")
        async with session.get(
            f"{BASE_URL}/chat/sessions/{session_id}/messages"
        ) as resp:
            final_messages_data = await resp.json()
            final_messages = final_messages_data.get("messages", [])
            print(f"Total messages after follow-up: {len(final_messages)}")
            
            # Check if conversation context was maintained
            if len(final_messages) >= 4:  # Should have at least 2 user + 2 assistant messages
                print("\n✅ SUCCESS: Conversation context appears to be maintained!")
                print("\nFull conversation:")
                for i, msg in enumerate(final_messages):
                    role = msg.get("role", "unknown")
                    content = msg.get("content", "")[:300]  # Truncate for display
                    print(f"\n{i+1}. {role.upper()}:")
                    print(f"   {content}...")
                    
                # Check if the second response references the first
                last_assistant_msg = final_messages[-1].get("content", "")
                if "tesla" in last_assistant_msg.lower() or "tsla" in last_assistant_msg.lower():
                    print("\n✅ Context preserved: Follow-up response references Tesla!")
                else:
                    print("\n⚠️ Warning: Follow-up response may not have maintained context")
            else:
                print("\n❌ FAILED: Not enough messages in conversation")
        
        # Cleanup: Delete the test session
        print("\nCleaning up test session...")
        async with session.delete(
            f"{BASE_URL}/chat/sessions/{session_id}"
        ) as resp:
            if resp.status == 200:
                print("Test session deleted")

if __name__ == "__main__":
    print("Testing Swarm Conversation Continuation")
    print("=" * 50)
    asyncio.run(test_swarm_continuation())
    print("\nTest completed!")