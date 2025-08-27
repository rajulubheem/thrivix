#!/usr/bin/env python3
"""Test script to verify session continuation works properly."""

import asyncio
import aiohttp
import json
import time

async def test_session_continuation():
    """Test that sessions can be continued properly."""
    
    base_url = "http://localhost:8000/api/v1"
    
    async with aiohttp.ClientSession() as session:
        # Step 1: Start a new streaming session
        print("🆕 Starting new session...")
        start_response = await session.post(
            f"{base_url}/streaming/start",
            json={
                "task": "Create a simple hello world file",
                "agents": [
                    {
                        "name": "coder",
                        "system_prompt": "You are a helpful coding assistant.",
                        "tools": ["file_write"],
                        "model": "gpt-4o-mini"
                    }
                ],
                "max_handoffs": 5
            }
        )
        
        start_data = await start_response.json()
        session_id = start_data["session_id"]
        print(f"✅ Created session: {session_id}")
        
        # Step 2: Poll for completion
        print("⏳ Waiting for first task to complete...")
        for _ in range(30):  # Wait up to 30 seconds
            poll_response = await session.get(f"{base_url}/streaming/poll/{session_id}?offset=0&limit=1000")
            poll_data = await poll_response.json()
            
            if poll_data.get("done"):
                print("✅ First task completed")
                break
            
            await asyncio.sleep(1)
        
        # Step 3: Continue the same session with a new task
        print(f"\n🔄 Continuing session {session_id} with new task...")
        continue_response = await session.post(
            f"{base_url}/streaming/continue",
            json={
                "session_id": session_id,
                "task": "Now modify the hello world file to say goodbye instead",
                "previous_messages": [
                    {"role": "user", "content": "Create a simple hello world file"},
                    {"role": "assistant", "content": "I've created a hello world file."}
                ],
                "agents": [
                    {
                        "name": "coder",
                        "system_prompt": "You are a helpful coding assistant.",
                        "tools": ["file_write", "file_read"],
                        "model": "gpt-4o-mini"
                    }
                ],
                "max_handoffs": 5
            }
        )
        
        continue_data = await continue_response.json()
        returned_session_id = continue_data["session_id"]
        
        # Verify same session ID
        if returned_session_id == session_id:
            print(f"✅ Session continued successfully with same ID: {session_id}")
        else:
            print(f"❌ ERROR: Got different session ID: {returned_session_id} != {session_id}")
            return False
        
        # Step 4: Poll for second task completion
        print("⏳ Waiting for second task to complete...")
        for _ in range(30):
            poll_response = await session.get(f"{base_url}/streaming/poll/{session_id}?offset=0&limit=1000")
            poll_data = await poll_response.json()
            
            # Check if agents can see the previous file
            chunks = poll_data.get("chunks", [])
            for chunk in chunks:
                if chunk.get("type") == "delta" and chunk.get("content"):
                    content = chunk["content"].lower()
                    if "hello" in content or "previous" in content or "existing" in content:
                        print("✅ Agent acknowledged previous work!")
                        break
            
            if poll_data.get("done"):
                print("✅ Second task completed")
                break
            
            await asyncio.sleep(1)
        
        print("\n✅ Test completed successfully!")
        return True

if __name__ == "__main__":
    success = asyncio.run(test_session_continuation())
    exit(0 if success else 1)