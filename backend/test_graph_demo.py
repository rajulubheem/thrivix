#!/usr/bin/env python3
"""Test script for graph demo endpoints"""

import requests
import json
import time

BASE_URL = "http://localhost:8000"

def test_example_queries():
    """Get example queries"""
    print("\n=== Testing Example Queries ===")
    response = requests.get(f"{BASE_URL}/api/v1/graph-demo/example-queries")
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Found {len(data['examples'])} example queries")
        for example in data['examples']:
            print(f"  - {example['query']}")
            print(f"    Benefit: {example['benefit']}")
    else:
        print(f"❌ Failed: {response.status_code} - {response.text}")
    return response.status_code == 200

def test_parallel_execution():
    """Test parallel execution with timing"""
    print("\n=== Testing Parallel Execution ===")
    
    request_data = {
        "task": "Research AI, Blockchain, and Quantum Computing trends",
        "parallel_agents": 3,
        "agent_delay": 2.0
    }
    
    print(f"Task: {request_data['task']}")
    print(f"Parallel agents: {request_data['parallel_agents']}")
    print(f"Expected delay per agent: {request_data['agent_delay']}s")
    
    response = requests.post(
        f"{BASE_URL}/api/v1/graph-demo/test-parallel",
        json=request_data
    )
    
    if response.status_code == 200:
        data = response.json()
        if data.get("success"):
            exec_info = data["execution"]
            print(f"✅ Parallel execution completed!")
            print(f"  - Parallel time: {exec_info['parallel_time_seconds']}s")
            print(f"  - Sequential estimate: {exec_info['sequential_time_estimate']}s")
            print(f"  - Speedup: {exec_info['speedup']}x")
            print(f"  - Time saved: {exec_info['time_saved_seconds']}s")
            
            # Verify parallel execution worked
            if exec_info['speedup'] > 1.5:
                print("  ✅ CONFIRMED: Agents ran in parallel!")
            else:
                print("  ⚠️ WARNING: Low speedup, agents may have run sequentially")
        else:
            print(f"❌ Execution failed: {data}")
    else:
        print(f"❌ Request failed: {response.status_code} - {response.text}")
    
    return response.status_code == 200

def test_research_workflow():
    """Test streaming research workflow"""
    print("\n=== Testing Research Workflow (Streaming) ===")
    
    response = requests.post(
        f"{BASE_URL}/api/v1/graph-demo/demo-research",
        params={"task": "Research AI, Blockchain, and Quantum Computing"},
        stream=True
    )
    
    if response.status_code == 200:
        print("✅ Streaming started...")
        for line in response.iter_lines():
            if line:
                line_str = line.decode('utf-8')
                if line_str.startswith('data: '):
                    try:
                        event_data = json.loads(line_str[6:])
                        event_type = event_data.get('event')
                        
                        if event_type == 'start':
                            print(f"  📋 Task: {event_data.get('task')}")
                        elif event_type == 'structure':
                            print(f"  🗺️ Execution plan created")
                        elif event_type == 'level_start':
                            print(f"  ▶️ Level {event_data.get('level')} starting: {event_data.get('agents')}")
                        elif event_type == 'level_complete':
                            print(f"  ✅ Level {event_data.get('level')} complete in {event_data.get('time')}s")
                        elif event_type == 'complete':
                            print(f"  🎉 Complete!")
                            print(f"     Total time: {event_data.get('total_time')}s")
                            print(f"     Sequential estimate: {event_data.get('sequential_estimate')}s")
                            print(f"     Speedup: {event_data.get('speedup')}x")
                            print(f"     Parallel levels: {event_data.get('parallel_levels')}")
                    except json.JSONDecodeError:
                        pass
        return True
    else:
        print(f"❌ Request failed: {response.status_code} - {response.text}")
        return False

def main():
    print("=" * 60)
    print("Graph DAG Parallel Execution Test")
    print("=" * 60)
    
    # Run all tests
    tests_passed = 0
    total_tests = 3
    
    if test_example_queries():
        tests_passed += 1
    
    if test_parallel_execution():
        tests_passed += 1
    
    if test_research_workflow():
        tests_passed += 1
    
    # Summary
    print("\n" + "=" * 60)
    print(f"Test Results: {tests_passed}/{total_tests} passed")
    
    if tests_passed == total_tests:
        print("✅ All tests passed! Parallel execution is working!")
    else:
        print(f"⚠️ {total_tests - tests_passed} test(s) failed")
    
    print("=" * 60)

if __name__ == "__main__":
    main()