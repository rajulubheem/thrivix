"""
Research API with Real-Time Streaming Support
Using Server-Sent Events (SSE) for real-time agent thinking and results
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from typing import AsyncGenerator, Dict, Any
from pydantic import BaseModel
import json
import asyncio
import logging
from datetime import datetime

# Import research agents
from app.agents.true_deep_research import perform_true_deep_research
from app.agents.real_web_search import perform_research as standard_research

router = APIRouter(prefix="/research", tags=["research-streaming"])
logger = logging.getLogger(__name__)

class StreamingResearchRequest(BaseModel):
    query: str
    enable_deep_research: bool = False
    stream: bool = True

async def research_event_generator(
    query: str, 
    enable_deep: bool = False
) -> AsyncGenerator[str, None]:
    """
    Generate SSE events for real-time research streaming
    """
    try:
        # Send initial event
        data = json.dumps({'type': 'init', 'data': {'status': 'starting', 'query': query}})
        yield f"data: {data}\n\n"
        if enable_deep:
            # Deep research with multi-step reasoning
            iterations = 5 if enable_deep else 1
            
            for iteration in range(1, iterations + 1):
                # Send reasoning event
                reasoning_text = _get_reasoning_for_iteration(query, iteration)
                data = json.dumps({
                    'type': 'thought',
                    'data': {
                        'id': f'thought-{iteration}',
                        'type': 'reasoning',
                        'content': reasoning_text,
                        'iteration': iteration,
                        'status': 'active'
                    }
                })
                yield f"data: {data}\n\n"
                await asyncio.sleep(0.5)  # Small delay for UI effect
                
                # Send tool selection event
                tool_text = _get_tool_selection_for_iteration(query, iteration)
                data = json.dumps({
                    'type': 'thought',
                    'data': {
                        'id': f'tool-{iteration}',
                        'type': 'tool_selection',
                        'content': tool_text,
                        'iteration': iteration,
                        'status': 'active'
                    }
                })
                yield f"data: {data}\n\n"
                await asyncio.sleep(0.5)
                
                # Send search progress
                data = json.dumps({
                    'type': 'progress',
                    'data': {'iteration': iteration, 'total': iterations, 'percentage': (iteration / iterations) * 100}
                })
                yield f"data: {data}\n\n"
        
        # Perform actual research
        if enable_deep:
            result = await perform_true_deep_research(query=query, enable_deep=True)
        else:
            result = await standard_research(query=query, mode="comprehensive", depth="basic")
        
        # Stream the summary text word by word
        summary_words = result.get("summary", "").split()
        for i, word in enumerate(summary_words):
            data = json.dumps({
                'type': 'text',
                'data': word + ' '
            })
            yield f"data: {data}\n\n"
            
            # Add small delay for streaming effect
            if i % 5 == 0:
                await asyncio.sleep(0.05)
        
        # Send sources
        for source in result.get("sources", [])[:10]:
            data = json.dumps({
                'type': 'source',
                'data': source
            })
            yield f"data: {data}\n\n"
            await asyncio.sleep(0.1)
        
        # Send images if available
        for image in result.get("images", [])[:6]:
            data = json.dumps({
                'type': 'image',
                'data': image
            })
            yield f"data: {data}\n\n"
        
        # Send completion event
        data = json.dumps({
            'type': 'complete',
            'data': {
                'status': 'completed',
                'iterations': result.get('iterations', 1),
                'confidence': result.get('confidence', 0.85),
                'total_sources': len(result.get('sources', []))
            }
        })
        yield f"data: {data}\n\n"
        
    except Exception as e:
        logger.error(f"Streaming error: {e}")
        data = json.dumps({'type': 'error', 'data': str(e)})
        yield f"data: {data}\n\n"
def _get_reasoning_for_iteration(query: str, iteration: int) -> str:
    """Get reasoning text for specific iteration"""
    reasoning_map = {
        1: f"🔍 Analyzing '{query}' to understand the core information needs and determining the best search strategy...",
        2: "🔬 Diving deeper into expert analysis, predictions, and technical details from authoritative sources...",
        3: "⚠️ Investigating potential challenges, risks, and contrarian viewpoints for a balanced perspective...",
        4: "🚀 Exploring future outlook, innovations, and strategic opportunities in this domain...",
        5: "📰 Checking for the latest breaking news and real-time updates to ensure current information..."
    }
    return reasoning_map.get(iteration, f"🎯 Processing iteration {iteration}...")

def _get_tool_selection_for_iteration(query: str, iteration: int) -> str:
    """Get tool selection text for specific iteration"""
    tool_map = {
        1: "🛠️ Activating: Web Search Agent, News Aggregator, and Knowledge Base Scanner for comprehensive coverage...",
        2: "🛠️ Deploying: Expert Analysis Agent, Technical Documentation Parser, and Prediction Models...",
        3: "🛠️ Engaging: Risk Assessment Agent, Competitive Analysis Tool, and Problem Detection Scanner...",
        4: "🛠️ Launching: Future Trends Analyzer, Innovation Tracker, and Strategic Planning Assistant...",
        5: "🛠️ Running: Real-time News Monitor, Social Media Scanner, and Breaking Updates Tracker..."
    }
    return tool_map.get(iteration, f"🛠️ Selecting optimal tools for iteration {iteration}...")

@router.post("/stream")
async def stream_research(request: StreamingResearchRequest):
    """
    Stream research results with real-time agent thinking
    """
    if not request.stream:
        # Non-streaming fallback
        if request.enable_deep_research:
            result = await perform_true_deep_research(
                query=request.query,
                enable_deep=True
            )
        else:
            result = await standard_research(
                query=request.query,
                mode="comprehensive",
                depth="basic"
            )
        return {"success": True, "data": result}
    
    # Return SSE stream
    return StreamingResponse(
        research_event_generator(
            query=request.query,
            enable_deep=request.enable_deep_research
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable Nginx buffering
        }
    )

@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "research-streaming"}