#!/usr/bin/env python3
"""
Test script to verify session persistence with virtual filesystem
"""
import asyncio
import json
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.strands_session_service import get_strands_session_service

async def test_session_persistence():
    """Test that sessions and virtual filesystem persist correctly"""
    
    print("=" * 60)
    print("Testing Strands SDK Session Persistence")
    print("=" * 60)
    
    # Get the service
    service = get_strands_session_service()
    
    # Test session ID
    test_session_id = "test-session-123"
    
    # Step 1: Create a session with virtual filesystem
    print("\n1. Creating session with virtual filesystem...")
    
    # Create an agent for the session
    agent = service.create_agent_with_session(
        session_id=test_session_id,
        agent_name="test-agent",
        system_prompt="You are a test agent",
        tools=[],
        model_config={"model_id": "gpt-4o-mini", "temperature": 0.7}
    )
    
    # Add some files to virtual filesystem
    virtual_fs = {
        "previous_work.txt": "This is the content from the previous session",
        "config.json": json.dumps({"setting": "value", "count": 42}),
        "script.py": "print('Hello from virtual filesystem')"
    }
    
    print(f"  Adding {len(virtual_fs)} files to virtual filesystem")
    service.save_virtual_filesystem(test_session_id, virtual_fs)
    
    # Add some context
    context = {
        "task_history": [
            {"task": "First task", "timestamp": "2024-01-01T10:00:00"},
            {"task": "Second task", "timestamp": "2024-01-01T11:00:00"}
        ],
        "accumulated_context": {
            "key_findings": ["Finding 1", "Finding 2"],
            "important_notes": "This is important"
        }
    }
    
    print(f"  Saving context with {len(context)} fields")
    service.save_context(test_session_id, context)
    
    # Step 2: Simulate session recovery (as if server restarted)
    print("\n2. Simulating session recovery...")
    
    # Clear active sessions to simulate restart
    service.active_sessions.clear()
    
    # Try to recover the session
    recovered_fs = service.get_virtual_filesystem(test_session_id)
    recovered_context = service.get_context(test_session_id)
    
    print(f"  Recovered {len(recovered_fs)} files from virtual filesystem")
    print(f"  Recovered context with {len(recovered_context)} fields")
    
    # Step 3: Verify the recovered data
    print("\n3. Verifying recovered data...")
    
    success = True
    
    # Check virtual filesystem
    for filename, content in virtual_fs.items():
        if filename not in recovered_fs:
            print(f"  ❌ File '{filename}' not found in recovered filesystem")
            success = False
        elif recovered_fs[filename] != content:
            print(f"  ❌ File '{filename}' content mismatch")
            success = False
        else:
            print(f"  ✅ File '{filename}' recovered correctly")
    
    # Check context
    if recovered_context.get("task_history") != context["task_history"]:
        print(f"  ❌ Task history mismatch")
        success = False
    else:
        print(f"  ✅ Task history recovered correctly")
    
    if recovered_context.get("accumulated_context") != context["accumulated_context"]:
        print(f"  ❌ Accumulated context mismatch")
        success = False
    else:
        print(f"  ✅ Accumulated context recovered correctly")
    
    # Step 4: Test listing sessions
    print("\n4. Testing session listing...")
    sessions = service.list_sessions()
    print(f"  Found {len(sessions)} sessions: {sessions}")
    
    if test_session_id in sessions:
        print(f"  ✅ Test session found in list")
    else:
        print(f"  ❌ Test session not found in list")
        success = False
    
    # Step 5: Clean up
    print("\n5. Cleaning up test session...")
    service.delete_session(test_session_id)
    
    sessions_after = service.list_sessions()
    if test_session_id not in sessions_after:
        print(f"  ✅ Test session deleted successfully")
    else:
        print(f"  ❌ Test session still exists after deletion")
        success = False
    
    # Final result
    print("\n" + "=" * 60)
    if success:
        print("✅ ALL TESTS PASSED - Session persistence is working!")
    else:
        print("❌ SOME TESTS FAILED - Check the implementation")
    print("=" * 60)
    
    return success

if __name__ == "__main__":
    success = asyncio.run(test_session_persistence())
    sys.exit(0 if success else 1)