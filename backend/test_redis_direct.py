#!/usr/bin/env python3
"""Check Redis streams directly to see if there are duplicate entries"""

import asyncio
import redis.asyncio as redis
import json
from collections import defaultdict

async def check_redis_stream(exec_id: str):
    # Connect to Redis
    r = await redis.from_url("redis://localhost:6379", decode_responses=True)
    
    # Get all messages from token stream
    stream_key = f"exec.{exec_id}.token"
    messages = await r.xrange(stream_key, "-", "+")
    
    print(f"\nChecking stream: {stream_key}")
    print(f"Total messages: {len(messages)}")
    
    # Track sequences per agent
    agent_sequences = defaultdict(list)
    duplicates = []
    
    for msg_id, data in messages:
        frame_data = json.loads(data.get("data", "{}"))
        agent_id = frame_data.get("agent_id")
        seq = frame_data.get("seq")
        text = frame_data.get("text", "")
        
        # Check for duplicate sequences
        if seq in agent_sequences[agent_id]:
            duplicates.append({
                "msg_id": msg_id,
                "agent": agent_id,
                "seq": seq,
                "text": text
            })
            print(f"❌ DUPLICATE in Redis: msg_id={msg_id}, agent={agent_id}, seq={seq}, text='{text}'")
        else:
            agent_sequences[agent_id].append(seq)
            print(f"✓ msg_id={msg_id}, agent={agent_id}, seq={seq}, text='{text}'")
    
    # Summary
    print("\n=== SUMMARY ===")
    for agent_id, seqs in agent_sequences.items():
        print(f"{agent_id}: {len(seqs)} sequences")
        print(f"  Sequences: {sorted(seqs)[:10]}...")  # Show first 10
    
    if duplicates:
        print(f"\n❌ Found {len(duplicates)} duplicate sequences IN REDIS ITSELF!")
    else:
        print("\n✅ No duplicate sequences in Redis")
    
    await r.close()

if __name__ == "__main__":
    exec_id = input("Enter execution ID: ").strip()
    asyncio.run(check_redis_stream(exec_id))