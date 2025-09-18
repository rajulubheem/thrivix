"""Test SSE streaming from event-swarm endpoint"""
import asyncio
import aiohttp
import json
import sys
from datetime import datetime

async def test_event_stream():
    """Test the event-swarm SSE endpoint"""
    url = "http://localhost:8000/api/v1/event-swarm/stream"
    
    # Test task - more complex to trigger multiple agents
    payload = {
        "task": "Create a calculator app with add, subtract, multiply and divide functions, then write unit tests for it",
        "execution_mode": "event_driven",
        "agents": [],
        "context": {
            "swarm_config": {
                "max_concurrent_agents": 10,
                "max_total_agents": 30,
                "max_execution_time": 600,
                "max_agent_runtime": 120,
                "enable_human_loop": True
            }
        }
    }
    
    print(f"[{datetime.now()}] Starting SSE test with task: {payload['task']}")
    print("-" * 80)
    
    agent_outputs = {}
    event_counts = {}
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload) as response:
            if response.status != 200:
                print(f"Error: HTTP {response.status}")
                return
            
            print(f"Connected! Reading stream...")
            buffer = ""
            
            async for chunk in response.content:
                buffer += chunk.decode('utf-8')
                lines = buffer.split('\n')
                buffer = lines[-1]  # Keep incomplete line
                
                for line in lines[:-1]:
                    line = line.strip()
                    if not line:
                        continue
                    
                    if line.startswith('data: '):
                        try:
                            data = json.loads(line[6:])
                            event_type = data.get('type', 'unknown')
                            agent = data.get('agent', 'unknown')
                            
                            # Track event counts
                            event_key = f"{event_type}:{agent}"
                            event_counts[event_key] = event_counts.get(event_key, 0) + 1
                            
                            # Track text generation
                            if event_type == 'text_generation':
                                # Check all possible text locations
                                text = (data.get('output') or 
                                       data.get('data', {}).get('chunk') or 
                                       data.get('data', {}).get('text') or 
                                       data.get('data', {}).get('content') or
                                       data.get('content') or '')
                                
                                if text:
                                    if agent not in agent_outputs:
                                        agent_outputs[agent] = ""
                                        print(f"\n[NEW AGENT] {agent} started outputting")
                                    
                                    agent_outputs[agent] += text
                                    print(f"[{agent}] +{len(text)} chars (total: {len(agent_outputs[agent])})")
                                else:
                                    print(f"[WARNING] text_generation from {agent} but no text found in: {data}")
                            
                            elif event_type == 'agent.started':
                                print(f"\n[AGENT STARTED] {agent}")
                            
                            elif event_type == 'agent.completed':
                                if agent in agent_outputs:
                                    print(f"\n[AGENT COMPLETED] {agent} - Output length: {len(agent_outputs[agent])}")
                                else:
                                    print(f"\n[AGENT COMPLETED] {agent} - No output captured!")
                            
                            elif event_type == 'error':
                                print(f"\n[ERROR] {data.get('message', 'Unknown error')}")
                                
                            elif event_type != 'keepalive':
                                print(f"[{event_type}] from {agent}")
                                
                        except json.JSONDecodeError as e:
                            print(f"Failed to parse JSON: {e}")
                            print(f"Line was: {line}")
    
    print("\n" + "=" * 80)
    print("SUMMARY:")
    print(f"Total agents that produced output: {len(agent_outputs)}")
    for agent, output in agent_outputs.items():
        preview = output[:100].replace('\n', ' ')
        print(f"  - {agent}: {len(output)} chars")
        print(f"    Preview: {preview}...")
    
    print(f"\nEvent counts:")
    for event_key, count in sorted(event_counts.items()):
        print(f"  - {event_key}: {count}")

if __name__ == "__main__":
    asyncio.run(test_event_stream())