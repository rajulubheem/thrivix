"""Test simple SSE endpoint"""
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import asyncio
import json
from datetime import datetime

app = FastAPI()

@app.get("/test-sse")
async def test_sse():
    async def generate():
        for i in range(5):
            data = json.dumps({"count": i, "time": datetime.now().isoformat()})
            yield f"data: {data}\n\n"
            await asyncio.sleep(1)
        yield f"data: {json.dumps({'done': True})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)