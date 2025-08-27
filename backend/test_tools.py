#!/usr/bin/env python3
"""
Test script for built-in tools
"""
import asyncio
import requests
import json

BASE_URL = "http://localhost:8000"

def test_tool_configuration():
    """Test getting tool configuration"""
    print("\n1. Testing Tool Configuration Endpoint...")
    response = requests.get(f"{BASE_URL}/api/v1/tool-config/configuration")
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Found {len(data['tools'])} tools")
        for tool in data['tools']:
            status = "🟢" if tool['enabled'] else "🔴"
            print(f"   {status} {tool['name']} ({tool['id']}) - {tool['category']}")
    else:
        print(f"❌ Failed: {response.status_code}")
    return response.status_code == 200

def test_tool_enable_disable():
    """Test enabling/disabling a tool"""
    print("\n2. Testing Tool Enable/Disable...")
    tool_id = "file_write"
    
    # First disable
    response = requests.put(
        f"{BASE_URL}/api/v1/tool-config/tools/{tool_id}",
        json={"enabled": False}
    )
    if response.status_code == 200:
        print(f"✅ Disabled {tool_id}")
    
    # Then enable
    response = requests.put(
        f"{BASE_URL}/api/v1/tool-config/tools/{tool_id}",
        json={"enabled": True}
    )
    if response.status_code == 200:
        print(f"✅ Enabled {tool_id}")
    
    return response.status_code == 200

def test_orchestrator_with_tools():
    """Test orchestrator with tool usage"""
    print("\n3. Testing Orchestrator with Tools...")
    
    task = "Create a simple Python hello world script and save it to hello.py"
    
    response = requests.post(
        f"{BASE_URL}/api/v1/orchestrator/orchestrate",
        json={"task": task}
    )
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Orchestration successful")
        print(f"   Generated {len(data['agents'])} agents:")
        for agent in data['agents']:
            tools = ", ".join(agent.get('tools', []))
            print(f"   - {agent['name']}: {tools or 'no tools'}")
    else:
        print(f"❌ Failed: {response.status_code}")
    
    return response.status_code == 200

def test_swarm_execution():
    """Test actual swarm execution with tools"""
    print("\n4. Testing Swarm Execution...")
    
    # Create execution
    response = requests.post(
        f"{BASE_URL}/api/v1/swarm/execute",
        json={
            "task": "Write 'Hello World' to a file called test.txt",
            "agents": [{
                "name": "FileWriter",
                "system_prompt": "You are a file writing assistant. Use the file_write tool to create files.",
                "tools": ["file_write", "file_read"]
            }]
        }
    )
    
    if response.status_code == 200:
        data = response.json()
        execution_id = data.get('execution_id')
        print(f"✅ Execution started: {execution_id}")
        
        # Poll for results
        import time
        for _ in range(10):
            time.sleep(1)
            status_response = requests.get(f"{BASE_URL}/api/v1/swarm/poll/{execution_id}")
            if status_response.status_code == 200:
                events = status_response.json()
                for event in events:
                    if event['type'] == 'tool_approval_required':
                        print(f"   ⚠️ Tool approval required: {event['data']['tool_name']}")
                    elif event['type'] == 'tool_executed':
                        print(f"   🔧 Tool executed: {event['data']['tool_name']}")
                    elif event['type'] == 'execution_completed':
                        print(f"   ✅ Execution completed")
                        return True
    else:
        print(f"❌ Failed: {response.status_code}")
    
    return False

def main():
    """Run all tests"""
    print("=" * 50)
    print("STRANDS AI - TOOL TESTING")
    print("=" * 50)
    
    tests = [
        test_tool_configuration,
        test_tool_enable_disable,
        test_orchestrator_with_tools,
        test_swarm_execution
    ]
    
    results = []
    for test in tests:
        try:
            results.append(test())
        except Exception as e:
            print(f"❌ Test failed with error: {e}")
            results.append(False)
    
    print("\n" + "=" * 50)
    print(f"RESULTS: {sum(results)}/{len(results)} tests passed")
    print("=" * 50)

if __name__ == "__main__":
    main()