#!/usr/bin/env python3
"""
Direct test of SSE streaming to verify if the issue is with sse-starlette
"""
import asyncio
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
import json
from datetime import datetime

app = FastAPI()

@app.get("/test-direct-sse")
async def test_direct_sse(request: Request):
    """Test direct SSE streaming without sse-starlette"""
    
    async def generate():
        """Generate SSE events directly"""
        # Send headers
        yield f"retry: 1000\n\n".encode()
        
        # Send initial event
        data = json.dumps({"type": "start", "time": datetime.utcnow().isoformat()})
        yield f"event: message\ndata: {data}\n\n".encode()
        
        # Stream 10 events with delays
        for i in range(10):
            if await request.is_disconnected():
                break
                
            data = json.dumps({
                "type": "chunk",
                "index": i,
                "message": f"Chunk {i}",
                "time": datetime.utcnow().isoformat()
            })
            yield f"event: message\ndata: {data}\n\n".encode()
            
            # Small delay between chunks
            await asyncio.sleep(0.5)
        
        # Send completion
        data = json.dumps({"type": "complete", "time": datetime.utcnow().isoformat()})
        yield f"event: message\ndata: {data}\n\n".encode()
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )

if __name__ == "__main__":
    import uvicorn
    print("Starting test SSE server on http://localhost:8001/test-direct-sse")
    print("Test with: curl -N http://localhost:8001/test-direct-sse")
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")