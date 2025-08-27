"""
Test conversation flow with clarification
"""
import requests
import json
import time

BASE_URL = "http://localhost:8000/api/v1/conversation"

def test_clarification_flow():
    print("\n" + "="*60)
    print("Testing Conversation Flow with Clarification")
    print("="*60 + "\n")
    
    # Step 1: Start a conversation with ambiguous query
    print("1. Starting conversation with ambiguous query...")
    response = requests.post(f"{BASE_URL}/start", json={
        "message": "Create a small satellite App"
    })
    
    if response.status_code != 200:
        print(f"Error starting conversation: {response.text}")
        return
    
    data = response.json()
    session_id = data['session_id']
    print(f"   Session ID: {session_id}")
    print(f"   Status: {data['status']}")
    
    # Step 2: Wait for processing and check status
    print("\n2. Waiting for clarification request...")
    for i in range(10):
        time.sleep(2)
        response = requests.get(f"{BASE_URL}/status/{session_id}")
        if response.status_code == 200:
            status_data = response.json()
            if status_data['status'] == 'waiting_for_clarification':
                print(f"   Status: {status_data['status']}")
                if 'clarification_message' in status_data:
                    print(f"   Clarification needed: {status_data.get('clarification_message', 'N/A')}")
                else:
                    # Look in messages for assistant's question
                    messages = status_data.get('messages', [])
                    if messages:
                        for msg in messages:
                            if msg['role'] == 'assistant':
                                print(f"   Agent asks: {msg['content'][:200]}...")
                break
            print(f"   Status: {status_data['status']} (waiting...)")
        else:
            print(f"   Error checking status: {response.text}")
    
    # Step 3: Provide clarification
    print("\n3. Providing clarification...")
    response = requests.post(f"{BASE_URL}/continue", json={
        "session_id": session_id,
        "message": "I want to create a web application for tracking and visualizing small satellite orbits using React and Python"
    })
    
    if response.status_code != 200:
        print(f"   Error continuing conversation: {response.status_code} - {response.text}")
        # If session not found, it means server reloaded - start fresh
        if response.status_code == 404:
            print("\n   Note: Session was lost due to server reload. In production, sessions would persist.")
        return
    
    print(f"   Continuation response: {response.json()['status']}")
    
    # Step 4: Wait for final response
    print("\n4. Waiting for research to complete...")
    for i in range(30):
        time.sleep(3)
        response = requests.get(f"{BASE_URL}/status/{session_id}")
        if response.status_code == 200:
            status_data = response.json()
            if status_data['status'] == 'completed':
                print(f"   Status: COMPLETED")
                messages = status_data.get('messages', [])
                # Find assistant's response
                for msg in reversed(messages):
                    if msg['role'] == 'assistant':
                        print(f"\n5. Assistant's final response:")
                        print("-" * 40)
                        print(msg['content'][:1000])
                        if len(msg['content']) > 1000:
                            print("... [truncated]")
                        print("-" * 40)
                        break
                break
            elif status_data['status'] == 'error':
                print(f"   Error: {status_data.get('error', 'Unknown error')}")
                break
            else:
                thoughts = status_data.get('thoughts', [])
                if thoughts:
                    latest_thought = thoughts[-1]
                    print(f"   {latest_thought.get('content', 'Processing...')}")
        else:
            print(f"   Error checking status: {response.text}")
            break
    
    print("\n" + "="*60)
    print("Test Complete")
    print("="*60 + "\n")

if __name__ == "__main__":
    test_clarification_flow()