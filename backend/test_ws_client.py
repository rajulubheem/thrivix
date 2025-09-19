#!/usr/bin/env python3
"""Test WebSocket client to debug duplicate tokens"""

import asyncio
import json
import websockets
from collections import defaultdict

async def test_websocket():
    # Call test endpoint to get new execution
    import requests
    response = requests.get("http://localhost:8000/api/v1/streaming/stream/v2/test")
    data = response.json()
    exec_id = data["exec_id"]
    print(f"Started test execution: {exec_id}")
    await asyncio.sleep(0.5)  # Give backend time to start
    
    uri = f"ws://localhost:8000/api/v1/ws/{exec_id}?start_from=0"
    print(f"Connecting to: {uri}")
    
    # Track received tokens
    agent_tokens = defaultdict(list)
    agent_sequences = defaultdict(set)
    duplicates = []
    
    async with websockets.connect(uri) as websocket:
        print("Connected to WebSocket")
        
        # Send ping
        await websocket.send(json.dumps({"type": "ping"}))
        
        try:
            while True:
                message = await asyncio.wait_for(websocket.recv(), timeout=10.0)
                data = json.loads(message)
                
                if data.get("frame_type") == "token":
                    agent_id = data.get("agent_id")
                    seq = data.get("seq")
                    text = data.get("text", "")
                    
                    # Check for duplicate sequences
                    if seq in agent_sequences[agent_id]:
                        duplicates.append({
                            "agent": agent_id,
                            "seq": seq,
                            "text": text
                        })
                        print(f"❌ DUPLICATE: Agent {agent_id}, Seq {seq}: '{text}'")
                    else:
                        agent_sequences[agent_id].add(seq)
                        agent_tokens[agent_id].append(text)
                        print(f"✓ Agent {agent_id}, Seq {seq}: '{text}'")
                
                elif data.get("frame_type") == "control":
                    control_type = data.get("type")
                    agent_id = data.get("agent_id", "system")
                    print(f"📋 Control: {control_type} - Agent: {agent_id}")
                    
                    if control_type == "session_end":
                        print("\n=== Session Complete ===")
                        break
                        
        except asyncio.TimeoutError:
            print("\n=== Timeout - no more messages ===")
        except websockets.exceptions.ConnectionClosed:
            print("\n=== Connection closed ===")
    
    # Print summary
    print("\n=== SUMMARY ===")
    for agent_id, tokens in agent_tokens.items():
        full_text = "".join(tokens)
        print(f"\n{agent_id}:")
        print(f"  Tokens received: {len(tokens)}")
        print(f"  Unique sequences: {len(agent_sequences[agent_id])}")
        print(f"  Full text: {full_text[:100]}...")
    
    if duplicates:
        print(f"\n❌ Found {len(duplicates)} duplicate tokens!")
        for dup in duplicates[:5]:  # Show first 5
            print(f"  - Agent {dup['agent']}, Seq {dup['seq']}: '{dup['text']}'")
    else:
        print("\n✅ No duplicate tokens found!")

if __name__ == "__main__":
    asyncio.run(test_websocket())