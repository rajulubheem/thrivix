#!/usr/bin/env python3
import asyncio
import sys
sys.path.insert(0, '/Users/bheemarajulu/project_wksp/strands_ai_agent/backend')

from app.api.v1.endpoints.streaming import InMemorySessionStorage

async def test():
    storage = InMemorySessionStorage()
    
    # Create a test session with chunks
    session_id = "test-session"
    await storage.set(session_id, {
        "status": "running",
        "chunks": [],
        "metrics": {"chunk_count": 0}
    })
    
    # Add 20 test chunks
    for i in range(20):
        await storage.append_chunk(session_id, {
            "type": "delta",
            "content": f"Chunk {i}",
            "index": i
        })
    
    # Test get_chunks with different parameters
    print("Testing get_chunks pagination:")
    
    tests = [
        (0, 5, "Get first 5"),
        (5, 5, "Get next 5"),
        (10, 3, "Get 3 from offset 10"),
        (15, 10, "Get 10 from offset 15 (should get 5)"),
    ]
    
    for offset, limit, desc in tests:
        chunks = await storage.get_chunks(session_id, offset, limit)
        print(f"\n{desc}:")
        print(f"  Request: offset={offset}, limit={limit}")
        print(f"  Response: {len(chunks)} chunks")
        if chunks:
            print(f"  First chunk: {chunks[0].get('content')}")
            print(f"  Last chunk: {chunks[-1].get('content')}")
        print(f"  Expected: {min(limit, 20 - offset)} chunks")

asyncio.run(test())