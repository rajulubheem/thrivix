"""
Real Research API with LLM Integration
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
from typing import Dict, Any, List, Optional, AsyncGenerator
from pydantic import BaseModel
import asyncio
import uuid
import time
import logging
import json
from datetime import datetime
import os
import aiohttp
import re
from openai import AsyncOpenAI

router = APIRouter(prefix="/research", tags=["research-real"])
logger = logging.getLogger(__name__)

# Store active research sessions
research_sessions: Dict[str, Dict[str, Any]] = {}

# Initialize OpenAI client
openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

class ResearchStartRequest(BaseModel):
    query: str
    session_id: Optional[str] = None
    model: Optional[str] = "gpt-4o-mini"

class ResearchStatusResponse(BaseModel):
    session_id: str
    status: str
    progress: float
    steps: List[Dict[str, Any]]
    content: str
    sources: List[Dict[str, Any]]
    timestamp: str

async def stream_research(session_id: str, query: str, model: str = "gpt-4o-mini") -> AsyncGenerator[str, None]:
    """
    Stream research results with real LLM integration
    """
    session = research_sessions[session_id]
    api_key = os.getenv("TAVILY_API_KEY") or "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"
    
    try:
        session['status'] = 'running'
        
        # Step 1: Understanding the query
        step1 = {
            'id': 'understanding',
            'title': 'Understanding your question',
            'status': 'active',
            'icon': 'brain',
            'content': f'Analyzing: "{query}"',
            'expanded': False
        }
        session['steps'].append(step1)
        yield f"data: {json.dumps({'type': 'step', 'data': step1})}\n\n"
        await asyncio.sleep(0.5)
        
        # Use LLM to analyze the query
        analysis_prompt = f"""Analyze this search query and extract key information:
Query: "{query}"

Provide:
1. Main topic/entity
2. Key search terms
3. Type of information needed (news, analysis, facts, etc.)
4. Time relevance (latest, historical, specific date)

Format as JSON."""

        analysis_response = await openai_client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": "You are a research assistant."}, 
                     {"role": "user", "content": analysis_prompt}],
            temperature=0.3,
            max_tokens=200
        )
        
        step1['status'] = 'completed'
        step1['content'] = analysis_response.choices[0].message.content
        yield f"data: {json.dumps({'type': 'step_update', 'data': step1})}\n\n"
        
        # Step 2: Searching for information
        step2 = {
            'id': 'searching',
            'title': 'Searching multiple sources',
            'status': 'active',
            'icon': 'search',
            'content': 'Querying web sources...',
            'expanded': False
        }
        session['steps'].append(step2)
        yield f"data: {json.dumps({'type': 'step', 'data': step2})}\n\n"
        
        # Perform actual search with Tavily
        search_results = await execute_tavily_search(query, api_key)
        
        step2['status'] = 'completed'
        step2['content'] = f"Found {len(search_results.get('results', []))} relevant sources"
        yield f"data: {json.dumps({'type': 'step_update', 'data': step2})}\n\n"
        
        # Step 3: Processing sources
        step3 = {
            'id': 'processing',
            'title': 'Analyzing sources',
            'status': 'active',
            'icon': 'chart',
            'content': 'Extracting key information...',
            'expanded': False
        }
        session['steps'].append(step3)
        yield f"data: {json.dumps({'type': 'step', 'data': step3})}\n\n"
        
        # Process and send sources
        results = search_results.get('results', [])
        for i, result in enumerate(results[:10], 1):
            source = {
                'id': f'source-{i}',
                'title': result.get('title', 'Untitled'),
                'url': result.get('url', ''),
                'domain': extract_domain(result.get('url', '')),
                'snippet': result.get('content', '')[:200] + '...' if result.get('content') else '',
                'favicon': f"https://www.google.com/s2/favicons?domain={extract_domain(result.get('url', ''))}&sz=32",
                'relevance': result.get('score', 0.5)
            }
            session['sources'].append(source)
            yield f"data: {json.dumps({'type': 'source', 'data': source})}\n\n"
        
        step3['status'] = 'completed'
        yield f"data: {json.dumps({'type': 'step_update', 'data': step3})}\n\n"
        
        # Step 4: Synthesizing answer
        step4 = {
            'id': 'synthesizing',
            'title': 'Creating comprehensive answer',
            'status': 'active',
            'icon': 'synthesis',
            'content': 'Combining insights from all sources...',
            'expanded': False
        }
        session['steps'].append(step4)
        yield f"data: {json.dumps({'type': 'step', 'data': step4})}\n\n"
        
        # Create comprehensive answer using LLM
        sources_context = "\n\n".join([
            f"Source {i}: {result.get('title', '')}\n{result.get('content', '')[:500]}"
            for i, result in enumerate(results[:5], 1)
        ])
        
        synthesis_prompt = f"""Based on the following search results about "{query}", create a comprehensive answer.

{sources_context}

Provide a detailed response that:
1. Directly answers the query
2. Includes specific facts and figures
3. Cites sources using [1], [2], etc.
4. Highlights key insights
5. Maintains accuracy and objectivity

Format the response in markdown with clear sections."""

        # Stream the response
        stream = await openai_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a research assistant providing comprehensive, well-cited answers."},
                {"role": "user", "content": synthesis_prompt}
            ],
            temperature=0.5,
            max_tokens=1500,
            stream=True
        )
        
        content = ""
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                text = chunk.choices[0].delta.content
                content += text
                session['content'] = content
                yield f"data: {json.dumps({'type': 'content', 'data': text})}\n\n"
        
        step4['status'] = 'completed'
        yield f"data: {json.dumps({'type': 'step_update', 'data': step4})}\n\n"
        
        # Complete
        session['status'] = 'completed'
        session['progress'] = 100
        yield f"data: {json.dumps({'type': 'complete', 'data': {'status': 'completed'}})}\n\n"
        
    except Exception as e:
        logger.error(f"Research error: {e}")
        session['status'] = 'error'
        session['error'] = str(e)
        yield f"data: {json.dumps({'type': 'error', 'data': {'error': str(e)}})}\n\n"

async def execute_tavily_search(query: str, api_key: str) -> Dict[str, Any]:
    """Execute Tavily search"""
    try:
        payload = {
            "api_key": api_key,
            "query": query,
            "search_depth": "advanced",
            "max_results": 10,
            "include_answer": True,
            "include_images": False,
            "include_raw_content": False
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.tavily.com/search",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=15)
            ) as response:
                if response.status == 200:
                    return await response.json()
                return {"error": f"Search failed: {response.status}", "results": []}
                
    except Exception as e:
        logger.error(f"Search error: {e}")
        return {"error": str(e), "results": []}

def extract_domain(url: str) -> str:
    """Extract domain from URL"""
    if not url:
        return ""
    try:
        domain = re.sub(r'^https?://', '', url)
        domain = re.sub(r'^www\.', '', domain)
        domain = domain.split('/')[0]
        return domain
    except:
        return ""

@router.post("/start")
async def start_research(request: ResearchStartRequest):
    """Start a research session with streaming"""
    session_id = request.session_id or str(uuid.uuid4())
    
    # Initialize session
    research_sessions[session_id] = {
        'session_id': session_id,
        'query': request.query,
        'status': 'initializing',
        'progress': 0,
        'steps': [],
        'content': '',
        'sources': [],
        'timestamp': datetime.now().isoformat()
    }
    
    logger.info(f"Started research session {session_id} for query: {request.query}")
    
    return {
        'session_id': session_id,
        'status': 'started',
        'message': 'Research started successfully'
    }

@router.get("/stream/{session_id}")
async def stream_research_endpoint(session_id: str):
    """Stream research results"""
    if session_id not in research_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = research_sessions[session_id]
    
    return StreamingResponse(
        stream_research(session_id, session['query']),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.get("/status/{session_id}")
async def get_research_status(session_id: str):
    """Get current status of research session"""
    if session_id not in research_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = research_sessions[session_id]
    
    return ResearchStatusResponse(
        session_id=session_id,
        status=session['status'],
        progress=session['progress'],
        steps=session['steps'],
        content=session['content'],
        sources=session['sources'],
        timestamp=session['timestamp']
    )

@router.get("/health")
async def health_check():
    """Health check"""
    return {
        'status': 'healthy',
        'service': 'research-real',
        'active_sessions': len(research_sessions)
    }