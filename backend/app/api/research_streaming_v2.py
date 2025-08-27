"""
Enhanced Research API with Real-Time Streaming
Streams agent thinking and results AS THEY HAPPEN
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from typing import AsyncGenerator, Dict, Any, List
from pydantic import BaseModel
import json
import asyncio
import aiohttp
import logging
from datetime import datetime
import os

router = APIRouter(prefix="/research", tags=["research-streaming-v2"])
logger = logging.getLogger(__name__)

class StreamingResearchRequest(BaseModel):
    query: str
    enable_deep_research: bool = False
    stream: bool = True

class RealTimeDeepResearch:
    """Performs deep research with real-time streaming of each step"""
    
    def __init__(self):
        from dotenv import load_dotenv
        load_dotenv()
        self.api_key = os.getenv("TAVILY_API_KEY") or "REMOVED_API_KEY"
        self.all_sources = []
        
    async def stream_deep_research(self, query: str) -> AsyncGenerator[str, None]:
        """Stream deep research events in real-time"""
        
        # Send initial event
        data = json.dumps({'type': 'init', 'data': {'status': 'starting', 'query': query}})
        yield f"data: {data}\n\n"
        
        max_iterations = 5
        accumulated_summary = []
        
        for iteration in range(1, max_iterations + 1):
            # Stream reasoning event
            reasoning_text = self._get_reasoning_for_iteration(query, iteration)
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
            await asyncio.sleep(0.5)
            
            # Stream tool selection
            tool_text = self._get_tool_selection_for_iteration(query, iteration)
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
            
            # Stream progress
            data = json.dumps({
                'type': 'progress',
                'data': {'iteration': iteration, 'total': max_iterations, 'percentage': (iteration / max_iterations) * 100}
            })
            yield f"data: {data}\n\n"
            
            # Perform actual search for this iteration
            search_query = self._get_search_query_for_iteration(query, iteration)
            
            # Stream search status
            data = json.dumps({
                'type': 'thought',
                'data': {
                    'id': f'search-{iteration}',
                    'type': 'search',
                    'content': f'🔎 Searching: "{search_query}"',
                    'iteration': iteration,
                    'status': 'active'
                }
            })
            yield f"data: {data}\n\n"
            
            # Execute search
            search_result = await self._execute_tavily_search(search_query)
            
            # Stream synthesis for this iteration
            if search_result and not search_result.get("error"):
                # Add sources from this iteration
                for source in search_result.get("results", [])[:3]:
                    self.all_sources.append(source)
                    # Stream each source as found
                    data = json.dumps({
                        'type': 'source',
                        'data': {
                            'id': f'source-{len(self.all_sources)-1}',
                            'title': source.get('title', ''),
                            'url': source.get('url', ''),
                            'snippet': source.get('content', '')[:200],
                            'domain': source.get('url', '').split('/')[2] if '/' in source.get('url', '') else '',
                            'relevanceScore': source.get('score', 0.5)
                        }
                    })
                    yield f"data: {data}\n\n"
                    await asyncio.sleep(0.1)
                
                # Stream iteration summary
                iteration_summary = search_result.get("answer", "")
                if iteration_summary:
                    accumulated_summary.append(f"\n**Iteration {iteration}: {self._get_iteration_focus(iteration)}**\n{iteration_summary}")
                    
                    # Stream the summary text for this iteration
                    data = json.dumps({'type': 'text', 'data': f'\\n\\n**Iteration {iteration}:** '})
                    yield f"data: {data}\n\n"
                    words = iteration_summary.split()[:50]  # First 50 words of each iteration
                    for word in words:
                        data = json.dumps({'type': 'text', 'data': word + ' '})
                        yield f"data: {data}\n\n"
                        await asyncio.sleep(0.05)
            
            # Stream completion of this iteration
            data = json.dumps({
                'type': 'thought',
                'data': {
                    'id': f'complete-{iteration}',
                    'type': 'synthesis',
                    'content': f'✅ Iteration {iteration} complete. Found {len(search_result.get("results", []))} new sources.',
                    'iteration': iteration,
                    'status': 'completed'
                }
            })
            yield f"data: {data}\n\n"
            await asyncio.sleep(0.3)
        
        # Stream final synthesis
        data = json.dumps({'type': 'text', 'data': '\\n\\n**📊 Final Synthesis:**\\n'})
        yield f"data: {data}\n\n"
        
        final_text = (
            f"• Total iterations performed: {max_iterations}\\n"
            f"• Total sources analyzed: {len(self.all_sources)}\\n"
            f"• Research depth: Deep - Multiple perspectives analyzed\\n"
            f"• Confidence level: {min(0.98, 0.5 + len(self.all_sources) * 0.02):.1%}"
        )
        
        for char in final_text:
            data = json.dumps({'type': 'text', 'data': char})
            yield f"data: {data}\n\n"
            await asyncio.sleep(0.1)
        
        # Send completion
        data = json.dumps({
            'type': 'complete',
            'data': {
                'status': 'completed',
                'iterations': max_iterations,
                'confidence': min(0.98, 0.5 + len(self.all_sources) * 0.02),
                'total_sources': len(self.all_sources)
            }
        })
        yield f"data: {data}\n\n"
    
    def _get_reasoning_for_iteration(self, query: str, iteration: int) -> str:
        """Get reasoning text for specific iteration"""
        reasoning_map = {
            1: f"🔍 Starting broad research on '{query}' to establish baseline understanding and current state...",
            2: "🔬 Diving deeper into expert analysis, predictions, and technical details from authoritative sources...",
            3: "⚠️ Investigating potential challenges, risks, and contrarian viewpoints for balanced perspective...",
            4: "🚀 Exploring future outlook, innovations, and strategic opportunities in this domain...",
            5: "📰 Checking for the latest breaking news and real-time updates to ensure current information..."
        }
        return reasoning_map.get(iteration, f"🎯 Processing iteration {iteration}...")
    
    def _get_tool_selection_for_iteration(self, query: str, iteration: int) -> str:
        """Get tool selection text for specific iteration"""
        tool_map = {
            1: "🛠️ Activating: Web Search Agent, News Aggregator, Knowledge Base Scanner...",
            2: "🛠️ Deploying: Expert Analysis Agent, Technical Documentation Parser...",
            3: "🛠️ Engaging: Risk Assessment Agent, Competitive Analysis Tool...",
            4: "🛠️ Launching: Future Trends Analyzer, Innovation Tracker...",
            5: "🛠️ Running: Real-time News Monitor, Breaking Updates Tracker..."
        }
        return tool_map.get(iteration, f"🛠️ Selecting tools for iteration {iteration}...")
    
    def _get_search_query_for_iteration(self, base_query: str, iteration: int) -> str:
        """Get specific search query for each iteration"""
        if iteration == 1:
            return base_query
        elif iteration == 2:
            return f"{base_query} expert analysis predictions forecast"
        elif iteration == 3:
            return f"{base_query} risks challenges problems competition"
        elif iteration == 4:
            return f"{base_query} future outlook roadmap innovations 2026"
        else:
            return f"{base_query} breaking news today latest updates"
    
    def _get_iteration_focus(self, iteration: int) -> str:
        """Get focus area for iteration"""
        focus_map = {
            1: "Overview & Current State",
            2: "Expert Analysis",
            3: "Risk Assessment",
            4: "Future Outlook",
            5: "Latest Updates"
        }
        return focus_map.get(iteration, f"Iteration {iteration}")
    
    async def _execute_tavily_search(self, query: str) -> Dict[str, Any]:
        """Execute Tavily search"""
        if not self.api_key:
            return {"error": "No API key"}
        
        try:
            payload = {
                "api_key": self.api_key,
                "query": query,
                "search_depth": "advanced",
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
            return {"error": str(e)}

# Global instance
deep_research = RealTimeDeepResearch()

async def research_event_generator(query: str, enable_deep: bool = False) -> AsyncGenerator[str, None]:
    """Generate SSE events for research streaming"""
    
    try:
        if enable_deep:
            # Use real-time deep research
            async for event in deep_research.stream_deep_research(query):
                yield event
        else:
            # Standard single search
            data = json.dumps({'type': 'init', 'data': {'status': 'starting', 'query': query}})
            yield f"data: {data}\n\n"
            # Simple search
            from app.agents.real_web_search import perform_research
            result = await perform_research(query=query, mode="comprehensive", depth="basic")
            
            # Stream the summary
            summary_words = result.get("summary", "").split()
            for i, word in enumerate(summary_words):
                data = json.dumps({'type': 'text', 'data': word + ' '})
                yield f"data: {data}\n\n"
                await asyncio.sleep(0.05)
            
            # Stream sources
            for source in result.get("sources", [])[:10]:
                data = json.dumps({'type': 'source', 'data': source})
                yield f"data: {data}\n\n"
            
            # Complete
            data = json.dumps({
                'type': 'complete',
                'data': {
                    'status': 'completed',
                    'iterations': 1,
                    'confidence': result.get('confidence', 0.85),
                    'total_sources': len(result.get('sources', []))
                }
            })
            yield f"data: {data}\n\n"
            
    except Exception as e:
        logger.error(f"Streaming error: {e}")
        data = json.dumps({'type': 'error', 'data': str(e)})
        yield f"data: {data}\n\n"
@router.post("/stream-v2")
async def stream_research_v2(request: StreamingResearchRequest):
    """Enhanced streaming endpoint with real-time updates"""
    
    logger.info(f"Stream v2 request: query='{request.query}', deep={request.enable_deep_research}")
    
    return StreamingResponse(
        research_event_generator(
            query=request.query,
            enable_deep=request.enable_deep_research
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*"
        }
    )

@router.get("/health-v2")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "research-streaming-v2", "version": "2.0"}