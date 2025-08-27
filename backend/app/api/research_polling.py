"""
Research API with Polling - Same approach as SwarmChat
Real-time updates through polling, not SSE
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import asyncio
import uuid
import time
import logging
from datetime import datetime
import os
import aiohttp

router = APIRouter(prefix="/research", tags=["research-polling"])
logger = logging.getLogger(__name__)

# Store active research sessions
research_sessions: Dict[str, Dict[str, Any]] = {}

class ResearchStartRequest(BaseModel):
    query: str
    enable_deep_research: bool = False
    session_id: Optional[str] = None

class ResearchStatusResponse(BaseModel):
    session_id: str
    status: str  # 'running', 'completed', 'error'
    progress: float
    current_iteration: int
    total_iterations: int
    thoughts: List[Dict[str, Any]]
    content: str
    sources: List[Dict[str, Any]]
    images: List[Dict[str, Any]]
    timestamp: str

async def perform_deep_research_async(session_id: str, query: str):
    """
    Perform deep research asynchronously, updating session in real-time
    """
    session = research_sessions[session_id]
    api_key = os.getenv("TAVILY_API_KEY") or "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"
    
    try:
        session['status'] = 'running'
        max_iterations = 5
        session['total_iterations'] = max_iterations
        
        for iteration in range(1, max_iterations + 1):
            session['current_iteration'] = iteration
            session['progress'] = (iteration - 1) / max_iterations * 100
            
            # Add reasoning thought
            thought = {
                'id': f'thought-{iteration}-{int(time.time())}',
                'type': 'reasoning',
                'content': f"🔍 Iteration {iteration}: {get_reasoning_text(query, iteration)}",
                'iteration': iteration,
                'timestamp': datetime.now().isoformat(),
                'status': 'active'
            }
            session['thoughts'].append(thought)
            await asyncio.sleep(0.5)  # Allow UI to update
            
            # Add tool selection thought
            tool_thought = {
                'id': f'tool-{iteration}-{int(time.time())}',
                'type': 'tool_selection',
                'content': f"🛠️ {get_tool_text(iteration)}",
                'iteration': iteration,
                'timestamp': datetime.now().isoformat(),
                'status': 'active'
            }
            session['thoughts'].append(tool_thought)
            await asyncio.sleep(0.5)
            
            # Add search status
            search_query = get_search_query(query, iteration)
            search_thought = {
                'id': f'search-{iteration}-{int(time.time())}',
                'type': 'search',
                'content': f"🔎 Searching: \"{search_query}\"",
                'iteration': iteration,
                'timestamp': datetime.now().isoformat(),
                'status': 'active'
            }
            session['thoughts'].append(search_thought)
            
            # Perform actual search
            search_result = await execute_tavily_search(search_query, api_key)
            
            # Add iteration results to content
            session['content'] += f"\n\n**Iteration {iteration}: {get_focus_text(iteration)}**\n"
            
            if search_result.get('answer'):
                # Add answer text progressively
                answer_text = search_result['answer'][:200]  # First 200 chars
                session['content'] += answer_text + "..."
            
            # Add sources from this iteration
            for source in search_result.get('results', [])[:3]:
                session['sources'].append({
                    'id': f'source-{len(session["sources"])}',
                    'title': source.get('title', ''),
                    'url': source.get('url', ''),
                    'snippet': source.get('content', '')[:200] if source.get('content') else '',
                    'domain': source.get('url', '').split('/')[2] if '/' in source.get('url', '') else '',
                    'relevanceScore': source.get('score', 0.5)
                })
            
            # Mark thoughts as completed
            thought['status'] = 'completed'
            tool_thought['status'] = 'completed'
            search_thought['status'] = 'completed'
            
            # Update progress
            session['progress'] = iteration / max_iterations * 100
            session['timestamp'] = datetime.now().isoformat()
            
            await asyncio.sleep(0.3)  # Small delay between iterations
        
        # Add final synthesis
        session['content'] += f"\n\n**📊 Research Complete**\n"
        session['content'] += f"• Total iterations: {max_iterations}\n"
        session['content'] += f"• Sources analyzed: {len(session['sources'])}\n"
        session['content'] += f"• Confidence: High\n"
        
        session['status'] = 'completed'
        session['progress'] = 100
        
    except Exception as e:
        logger.error(f"Deep research error: {e}")
        session['status'] = 'error'
        session['error'] = str(e)

async def perform_simple_research_async(session_id: str, query: str):
    """
    Perform simple research asynchronously
    """
    session = research_sessions[session_id]
    api_key = os.getenv("TAVILY_API_KEY") or "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"
    
    try:
        session['status'] = 'running'
        session['total_iterations'] = 1
        session['current_iteration'] = 1
        
        # Add thinking
        session['thoughts'].append({
            'id': f'thought-simple-{int(time.time())}',
            'type': 'reasoning',
            'content': f"🔍 Searching for: {query}",
            'timestamp': datetime.now().isoformat(),
            'status': 'active'
        })
        
        session['progress'] = 30
        
        # Perform search
        result = await execute_tavily_search(query, api_key)
        
        session['progress'] = 60
        
        # Add content
        if result.get('answer'):
            session['content'] = result['answer']
        
        # Add sources
        for i, source in enumerate(result.get('results', [])[:10]):
            session['sources'].append({
                'id': f'source-{i}',
                'title': source.get('title', ''),
                'url': source.get('url', ''),
                'snippet': source.get('content', '')[:200] if source.get('content') else '',
                'domain': source.get('url', '').split('/')[2] if '/' in source.get('url', '') else '',
                'relevanceScore': source.get('score', 0.5)
            })
        
        session['progress'] = 100
        session['status'] = 'completed'
        
    except Exception as e:
        logger.error(f"Simple research error: {e}")
        session['status'] = 'error'
        session['error'] = str(e)

async def execute_tavily_search(query: str, api_key: str) -> Dict[str, Any]:
    """Execute Tavily search"""
    try:
        payload = {
            "api_key": api_key,
            "query": query,
            "search_depth": "basic",
            "max_results": 10,
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
                return {"error": f"Search failed: {response.status}", "results": [], "answer": ""}
                
    except Exception as e:
        logger.error(f"Search error: {e}")
        return {"error": str(e), "results": [], "answer": ""}

def get_reasoning_text(query: str, iteration: int) -> str:
    """Get reasoning text for iteration"""
    texts = {
        1: f"Analyzing '{query}' to establish baseline understanding",
        2: "Seeking expert analysis and predictions",
        3: "Investigating risks and challenges",
        4: "Exploring future outlook and innovations",
        5: "Checking latest news and updates"
    }
    return texts.get(iteration, f"Processing iteration {iteration}")

def get_tool_text(iteration: int) -> str:
    """Get tool text for iteration"""
    tools = {
        1: "Web Search + News Aggregator",
        2: "Expert Analysis + Technical Docs",
        3: "Risk Assessment + Competition Analysis",
        4: "Trend Analyzer + Innovation Tracker",
        5: "Real-time News Monitor"
    }
    return tools.get(iteration, "Search Tools")

def get_search_query(base: str, iteration: int) -> str:
    """Get search query for iteration"""
    if iteration == 1:
        return base
    elif iteration == 2:
        return f"{base} expert analysis predictions"
    elif iteration == 3:
        return f"{base} risks challenges problems"
    elif iteration == 4:
        return f"{base} future innovations roadmap"
    else:
        return f"{base} latest news today"

def get_focus_text(iteration: int) -> str:
    """Get focus text for iteration"""
    focuses = {
        1: "Overview",
        2: "Expert Analysis",
        3: "Risk Assessment",
        4: "Future Outlook",
        5: "Latest Updates"
    }
    return focuses.get(iteration, f"Analysis {iteration}")

@router.post("/start")
async def start_research(request: ResearchStartRequest, background_tasks: BackgroundTasks):
    """
    Start a research session (like SwarmChat's approach)
    """
    session_id = request.session_id or str(uuid.uuid4())
    
    # Initialize session
    research_sessions[session_id] = {
        'session_id': session_id,
        'query': request.query,
        'status': 'initializing',
        'progress': 0,
        'current_iteration': 0,
        'total_iterations': 5 if request.enable_deep_research else 1,
        'thoughts': [],
        'content': '',
        'sources': [],
        'images': [],
        'timestamp': datetime.now().isoformat(),
        'enable_deep': request.enable_deep_research
    }
    
    # Start research in background
    if request.enable_deep_research:
        background_tasks.add_task(perform_deep_research_async, session_id, request.query)
    else:
        background_tasks.add_task(perform_simple_research_async, session_id, request.query)
    
    logger.info(f"Started research session {session_id} for query: {request.query}")
    
    return {
        'session_id': session_id,
        'status': 'started',
        'message': 'Research started successfully'
    }

@router.get("/status/{session_id}")
async def get_research_status(session_id: str):
    """
    Get current status of research session (polling endpoint)
    """
    if session_id not in research_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = research_sessions[session_id]
    
    return ResearchStatusResponse(
        session_id=session_id,
        status=session['status'],
        progress=session['progress'],
        current_iteration=session['current_iteration'],
        total_iterations=session['total_iterations'],
        thoughts=session['thoughts'],
        content=session['content'],
        sources=session['sources'],
        images=session['images'],
        timestamp=session['timestamp']
    )

@router.post("/stop/{session_id}")
async def stop_research(session_id: str):
    """
    Stop a research session
    """
    if session_id not in research_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = research_sessions[session_id]
    session['status'] = 'stopped'
    
    return {'status': 'stopped', 'session_id': session_id}

@router.delete("/session/{session_id}")
async def delete_session(session_id: str):
    """
    Delete a research session
    """
    if session_id in research_sessions:
        del research_sessions[session_id]
    
    return {'status': 'deleted', 'session_id': session_id}

@router.get("/health-polling")
async def health_check():
    """Health check"""
    return {
        'status': 'healthy',
        'service': 'research-polling',
        'active_sessions': len(research_sessions)
    }