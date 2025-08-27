#!/usr/bin/env python3
"""
Test script to verify parallel execution is working properly
"""

import asyncio
import httpx
import json
from datetime import datetime

async def test_parallel_execution():
    """Test that parallel mode actually executes agents in parallel"""
    
    print("🧪 Testing Parallel Execution Mode")
    print("=" * 50)
    
    # Test query that should benefit from parallel execution
    test_query = "List 3 benefits each of Python, JavaScript, and Go programming languages"
    
    # Test both modes
    modes = ["sequential", "parallel"]
    
    for mode in modes:
        print(f"\n📊 Testing {mode.upper()} mode...")
        
        # Start streaming session
        async with httpx.AsyncClient() as client:
            start_time = datetime.now()
            
            response = await client.post(
                "http://localhost:8000/api/v1/streaming/start",
                json={
                    "task": test_query,
                    "execution_mode": mode,
                    "agents": [],  # Let orchestrator decide
                    "max_handoffs": 10
                },
                timeout=30.0
            )
            
            if response.status_code != 200:
                print(f"❌ Failed to start session: {response.status_code}")
                continue
                
            session_data = response.json()
            session_id = session_data["session_id"]
            print(f"✅ Session started: {session_id}")
            
            # Poll for results
            execution_events = []
            agent_timings = {}
            poll_count = 0
            max_polls = 30  # Max 30 seconds
            
            while poll_count < max_polls:
                poll_response = await client.get(
                    f"http://localhost:8000/api/v1/streaming/poll/{session_id}?offset=0&timeout=1",
                    timeout=5.0
                )
                
                if poll_response.status_code == 200:
                    poll_data = poll_response.json()
                    
                    # Look for execution mode events
                    for chunk in poll_data.get("chunks", []):
                        if chunk.get("type") == "execution_mode":
                            execution_events.append(chunk)
                            print(f"  🎯 Execution mode: {chunk.get('mode')} - {chunk.get('reason')}")
                        
                        # Track agent start/complete times
                        if chunk.get("type") == "agent_start":
                            agent_name = chunk.get("agent")
                            if agent_name:
                                agent_timings[agent_name] = {"start": chunk.get("timestamp")}
                                print(f"  ▶️ Agent started: {agent_name}")
                        
                        if chunk.get("type") == "agent_complete":
                            agent_name = chunk.get("agent")
                            if agent_name and agent_name in agent_timings:
                                agent_timings[agent_name]["end"] = chunk.get("timestamp")
                                print(f"  ✅ Agent completed: {agent_name}")
                    
                    # Check if completed
                    if poll_data.get("status") == "completed":
                        print(f"  ✅ Execution completed")
                        break
                    elif poll_data.get("status") == "error":
                        print(f"  ❌ Execution failed: {poll_data.get('error')}")
                        break
                
                poll_count += 1
                await asyncio.sleep(1)
            
            end_time = datetime.now()
            duration = (end_time - start_time).total_seconds()
            
            print(f"\n  📈 Results for {mode.upper()} mode:")
            print(f"  - Total duration: {duration:.2f} seconds")
            print(f"  - Agents used: {len(agent_timings)}")
            
            # Check for parallel execution
            if len(agent_timings) > 1:
                # Check if any agents ran in parallel (overlapping times)
                agents_list = list(agent_timings.items())
                parallel_detected = False
                
                for i in range(len(agents_list)):
                    for j in range(i + 1, len(agents_list)):
                        agent1_name, agent1_times = agents_list[i]
                        agent2_name, agent2_times = agents_list[j]
                        
                        if "start" in agent1_times and "end" in agent1_times and \
                           "start" in agent2_times and "end" in agent2_times:
                            # Check if their execution times overlap
                            if agent1_times["start"] < agent2_times["end"] and \
                               agent2_times["start"] < agent1_times["end"]:
                                parallel_detected = True
                                print(f"  - ⚡ Parallel execution detected: {agent1_name} and {agent2_name}")
                
                if not parallel_detected and mode == "parallel":
                    print(f"  - ⚠️ No parallel execution detected despite parallel mode")
                elif parallel_detected and mode == "sequential":
                    print(f"  - ⚠️ Unexpected parallel execution in sequential mode")
    
    print("\n" + "=" * 50)
    print("✅ Test completed")

if __name__ == "__main__":
    asyncio.run(test_parallel_execution())