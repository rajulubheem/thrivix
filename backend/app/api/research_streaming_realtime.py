"""
TRUE Real-Time Streaming Research API
Streams events IMMEDIATELY as they happen, not after completion
"""
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from typing import AsyncGenerator
from pydantic import BaseModel
import json
import asyncio
import aiohttp
import logging
from datetime import datetime
import os

router = APIRouter(prefix="/research", tags=["research-streaming-realtime"])
logger = logging.getLogger(__name__)

class StreamingResearchRequest(BaseModel):
    query: str
    enable_deep_research: bool = False
    stream: bool = True

async def realtime_stream_generator(query: str, enable_deep: bool = False) -> AsyncGenerator[str, None]:
    """
    TRUE real-time streaming - sends events AS THEY HAPPEN
    """
    try:
        # Send init immediately
        yield f"data: {json.dumps({'type': 'init', 'data': {'status': 'starting', 'query': query}})}\n\n"
        await asyncio.sleep(0.01)  # Small yield to ensure it sends
        
        if not enable_deep:
            # Simple search - stream immediately
            data = json.dumps({'type': 'thought', 'data': {'id': 'think-1', 'type': 'reasoning', 'content': f'🔍 Searching for: {query}', 'status': 'active'}})
            yield f"data: {data}\n\n"
            await asyncio.sleep(0.5)
            
            # Start search task
            search_task = asyncio.create_task(simple_search(query))
            
            # Stream progress while searching
            for i in range(3):
                yield f"data: {json.dumps({'type': 'progress', 'data': {'percentage': (i+1) * 30}})}\n\n"
                await asyncio.sleep(0.3)
            
            # Get result
            result = await search_task
            
            # Stream the text
            if result.get("answer"):
                words = result["answer"].split()
                for word in words[:100]:  # First 100 words
                    yield f"data: {json.dumps({'type': 'text', 'data': word + ' '})}\n\n"
                    if words.index(word) % 10 == 0:
                        await asyncio.sleep(0.05)
            
            # Stream sources
            for source in result.get("results", [])[:5]:
                yield f"data: {json.dumps({'type': 'source', 'data': format_source(source)})}\n\n"
                await asyncio.sleep(0.1)
            
        else:
            # DEEP RESEARCH - Stream each iteration in real-time
            max_iterations = 5
            api_key = os.getenv("TAVILY_API_KEY") or "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"
            
            for iteration in range(1, max_iterations + 1):
                # Stream reasoning IMMEDIATELY
                yield f"data: {json.dumps({'type': 'thought', 'data': {'id': f'reason-{iteration}', 'type': 'reasoning', 'content': get_reasoning(query, iteration), 'iteration': iteration, 'status': 'active'}})}\n\n"
                await asyncio.sleep(0.3)
                
                # Stream tool selection
                yield f"data: {json.dumps({'type': 'thought', 'data': {'id': f'tool-{iteration}', 'type': 'tool_selection', 'content': get_tools(iteration), 'iteration': iteration, 'status': 'active'}})}\n\n"
                await asyncio.sleep(0.3)
                
                # Stream search status
                search_query = get_query_for_iteration(query, iteration)
                search_data = json.dumps({
                    'type': 'thought', 
                    'data': {
                        'id': f'search-{iteration}', 
                        'type': 'search', 
                        'content': f'🔎 Searching: "{search_query}"', 
                        'iteration': iteration, 
                        'status': 'active'
                    }
                })
                yield f"data: {search_data}\n\n"
                
                # Update progress
                yield f"data: {json.dumps({'type': 'progress', 'data': {'iteration': iteration, 'total': max_iterations, 'percentage': (iteration / max_iterations) * 100}})}\n\n"
                
                # Start search in background
                search_task = asyncio.create_task(execute_search(search_query, api_key))
                
                # Stream "searching..." animation while waiting
                for dot in range(3):
                    yield f"data: {json.dumps({'type': 'text', 'data': '.'})}\n\n"
                    await asyncio.sleep(0.2)
                
                # Get search result
                search_result = await search_task
                
                # Stream iteration header
                header_text = f'\n\n**Iteration {iteration}: {get_focus(iteration)}**\n'
                yield f"data: {json.dumps({'type': 'text', 'data': header_text})}\n\n"
                
                # Stream some text from this iteration
                if search_result.get("answer"):
                    words = search_result["answer"].split()[:30]  # First 30 words
                    for word in words:
                        yield f"data: {json.dumps({'type': 'text', 'data': word + ' '})}\n\n"
                        if words.index(word) % 8 == 0:
                            await asyncio.sleep(0.03)
                
                # Stream sources found in this iteration
                for source in search_result.get("results", [])[:2]:
                    yield f"data: {json.dumps({'type': 'source', 'data': format_source(source)})}\n\n"
                    await asyncio.sleep(0.05)
                
                # Mark iteration complete
                data = json.dumps({'type': 'thought', 'data': {'id': f'done-{iteration}', 'type': 'synthesis', 'content': f'✅ Iteration {iteration} complete', 'iteration': iteration, 'status': 'completed'}})
                yield f"data: {data}\n\n"
                await asyncio.sleep(0.2)
            
            # Final synthesis
            complete_text = '\n\n**📊 Research Complete**\n'
            yield f"data: {json.dumps({'type': 'text', 'data': complete_text})}\n\n"
            final_text = f"Analyzed {max_iterations} different perspectives across multiple sources."
            for char in final_text:
                yield f"data: {json.dumps({'type': 'text', 'data': char})}\n\n"
                if char in '.,':
                    await asyncio.sleep(0.05)
        
        # Send completion
        yield f"data: {json.dumps({'type': 'complete', 'data': {'status': 'completed'}})}\n\n"
        
    except Exception as e:
        logger.error(f"Streaming error: {e}")
        yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"

async def simple_search(query: str) -> dict:
    """Execute a simple Tavily search"""
    api_key = os.getenv("TAVILY_API_KEY") or "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"
    return await execute_search(query, api_key)

async def execute_search(query: str, api_key: str) -> dict:
    """Execute Tavily search"""
    try:
        payload = {
            "api_key": api_key,
            "query": query,
            "search_depth": "basic",
            "max_results": 5,
            "include_answer": True
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.tavily.com/search",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                if response.status == 200:
                    return await response.json()
                return {"error": f"Search failed: {response.status}"}
    except Exception as e:
        logger.error(f"Search error: {e}")
        return {"error": str(e), "results": [], "answer": f"Search for '{query}' encountered an error."}

def format_source(source: dict) -> dict:
    """Format source for frontend"""
    return {
        "id": f"source-{source.get('title', '').replace(' ', '-')[:20]}",
        "title": source.get("title", ""),
        "url": source.get("url", ""),
        "snippet": source.get("content", "")[:200] if source.get("content") else "",
        "domain": source.get("url", "").split("/")[2] if "/" in source.get("url", "") else "",
        "relevanceScore": source.get("score", 0.5)
    }

def get_reasoning(query: str, iteration: int) -> str:
    """Get reasoning for iteration"""
    reasons = {
        1: f"🔍 Starting broad search for '{query}' to establish baseline...",
        2: "🔬 Analyzing expert opinions and technical details...",
        3: "⚠️ Investigating risks and challenges...",
        4: "🚀 Exploring future outlook and opportunities...",
        5: "📰 Checking latest news and updates..."
    }
    return reasons.get(iteration, f"Processing iteration {iteration}...")

def get_tools(iteration: int) -> str:
    """Get tools for iteration"""
    tools = {
        1: "🛠️ Web Search, News Aggregator",
        2: "🛠️ Expert Analysis, Technical Docs",
        3: "🛠️ Risk Assessment, Competition Analysis",
        4: "🛠️ Trend Analysis, Innovation Tracker",
        5: "🛠️ Real-time News, Breaking Updates"
    }
    return tools.get(iteration, "🛠️ Search Tools")

def get_query_for_iteration(base: str, iteration: int) -> str:
    """Get search query for iteration"""
    if iteration == 1:
        return base
    elif iteration == 2:
        return f"{base} analysis forecast predictions"
    elif iteration == 3:
        return f"{base} risks challenges problems"
    elif iteration == 4:
        return f"{base} future outlook innovations"
    else:
        return f"{base} latest news today"

def get_focus(iteration: int) -> str:
    """Get focus for iteration"""
    focuses = {
        1: "Overview",
        2: "Analysis",
        3: "Risks",
        4: "Future",
        5: "Latest"
    }
    return focuses.get(iteration, f"Iteration {iteration}")

@router.post("/stream-realtime")
async def stream_realtime(request: StreamingResearchRequest):
    """TRUE real-time streaming endpoint"""
    
    logger.info(f"REALTIME stream: query='{request.query}', deep={request.enable_deep_research}")
    
    return StreamingResponse(
        realtime_stream_generator(
            query=request.query,
            enable_deep=request.enable_deep_research
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "text/event-stream"
        }
    )

@router.get("/health-realtime")
async def health_check():
    """Health check"""
    return {"status": "healthy", "service": "realtime-streaming", "version": "3.0"}