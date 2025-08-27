"""
Research API with Polling (like SwarmChat)
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
from openai import AsyncOpenAI

router = APIRouter(prefix="/research", tags=["research-polling"])
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
    progress: float = 0
    steps: List[Dict[str, Any]] = []
    content: str = ""
    sources: List[Dict[str, Any]] = []
    timestamp: str
    error: Optional[str] = None

async def perform_research(session_id: str, query: str, model: str = "gpt-4o-mini"):
    """
    Perform research with real LLM integration
    """
    session = research_sessions[session_id]
    api_key = os.getenv("TAVILY_API_KEY") or "REMOVED_API_KEY"
    
    try:
        session['status'] = 'running'
        
        # Step 1: Understanding the query
        step1 = {
            'id': 'step-1',
            'title': 'Understanding your question',
            'description': f'Analyzing query: "{query}"',
            'status': 'active',
            'icon': 'brain'
        }
        session['steps'].append(step1)
        await asyncio.sleep(0.5)
        
        # Use LLM to analyze the query
        analysis_prompt = f"""Analyze this search query and identify key search terms:
Query: "{query}"

Extract:
1. Main entities/topics
2. Key search terms (3-5 terms)
3. Information type needed

Be concise."""

        try:
            analysis_response = await openai_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are a research assistant."},
                    {"role": "user", "content": analysis_prompt}
                ],
                temperature=0.3,
                max_tokens=150
            )
            analysis_content = analysis_response.choices[0].message.content
            step1['description'] = analysis_content[:200]
        except Exception as e:
            logger.error(f"LLM analysis error: {e}")
            step1['description'] = f'Analyzing: {query}'
        
        step1['status'] = 'completed'
        await asyncio.sleep(0.3)
        
        # Step 2: Searching for information
        step2 = {
            'id': 'step-2',
            'title': 'Searching multiple sources',
            'description': 'Querying web sources for relevant information...',
            'status': 'active',
            'icon': 'search'
        }
        session['steps'].append(step2)
        await asyncio.sleep(0.5)
        
        # Perform actual search with Tavily
        search_results = await execute_tavily_search(query, api_key)
        results = search_results.get('results', [])
        
        step2['description'] = f'Found {len(results)} relevant sources'
        step2['status'] = 'completed'
        await asyncio.sleep(0.3)
        
        # Step 3: Processing sources
        step3 = {
            'id': 'step-3',
            'title': 'Analyzing sources',
            'description': 'Extracting and validating information...',
            'status': 'active',
            'icon': 'database'
        }
        session['steps'].append(step3)
        await asyncio.sleep(0.5)
        
        # Add sources
        for i, result in enumerate(results[:10], 1):
            source = {
                'id': f'source-{i}',
                'title': result.get('title', 'Untitled'),
                'url': result.get('url', ''),
                'domain': extract_domain(result.get('url', '')),
                'snippet': result.get('content', '')[:200] + '...' if result.get('content') else '',
                'favicon': f"https://www.google.com/s2/favicons?domain={extract_domain(result.get('url', ''))}&sz=32"
            }
            session['sources'].append(source)
        
        step3['status'] = 'completed'
        await asyncio.sleep(0.3)
        
        # Step 4: Synthesizing answer
        step4 = {
            'id': 'step-4',
            'title': 'Creating comprehensive answer',
            'description': 'Combining insights from all sources...',
            'status': 'active',
            'icon': 'synthesis'
        }
        session['steps'].append(step4)
        await asyncio.sleep(0.5)
        
        # Create comprehensive answer using LLM
        sources_context = "\n\n".join([
            f"[{i}] {result.get('title', '')}: {result.get('content', '')[:400]}"
            for i, result in enumerate(results[:5], 1)
        ])
        
        synthesis_prompt = f"""Based on these search results about "{query}", provide a comprehensive answer.

Sources:
{sources_context}

Instructions:
- Answer the query directly and comprehensively
- Include specific facts, data, and insights
- Use inline citations like [1], [2] to reference sources
- Structure with clear sections using markdown
- Be objective and accurate
- Highlight key findings"""

        try:
            # Generate the response
            stream = await openai_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are an expert research assistant. Provide detailed, well-cited answers based on the sources provided."},
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
                    # Small delay to simulate streaming
                    if len(content) % 50 == 0:
                        await asyncio.sleep(0.05)
                        
        except Exception as e:
            logger.error(f"LLM synthesis error: {e}")
            # Fallback to Tavily's answer if available
            if search_results.get('answer'):
                session['content'] = search_results['answer']
            else:
                session['content'] = f"Found {len(results)} sources about {query}. Please check the sources for detailed information."
        
        step4['status'] = 'completed'
        
        # Complete
        session['status'] = 'completed'
        session['progress'] = 100
        
    except Exception as e:
        logger.error(f"Research error: {e}")
        session['status'] = 'error'
        session['error'] = str(e)

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
        import re
        domain = re.sub(r'^https?://', '', url)
        domain = re.sub(r'^www\.', '', domain)
        domain = domain.split('/')[0]
        return domain
    except:
        return ""

@router.post("/start-polling")
async def start_research(request: ResearchStartRequest, background_tasks: BackgroundTasks):
    """Start a research session with polling"""
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
        'timestamp': datetime.now().isoformat(),
        'error': None
    }
    
    # Log all active sessions for debugging
    logger.info(f"Active sessions before start: {list(research_sessions.keys())}")
    
    # Start research in background
    background_tasks.add_task(perform_research, session_id, request.query, request.model)
    
    logger.info(f"Started research session {session_id} for query: {request.query}")
    logger.info(f"Active sessions after start: {list(research_sessions.keys())}")
    
    return {
        'session_id': session_id,
        'status': 'started',
        'message': 'Research started successfully'
    }

@router.get("/status/{session_id}")
async def get_research_status(session_id: str):
    """Get current status of research session"""
    logger.info(f"Status request for session: {session_id}")
    logger.info(f"Active sessions: {list(research_sessions.keys())}")
    
    if session_id not in research_sessions:
        logger.warning(f"Session {session_id} not found in {len(research_sessions)} active sessions")
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    
    session = research_sessions[session_id]
    
    return ResearchStatusResponse(
        session_id=session_id,
        status=session['status'],
        progress=session['progress'],
        steps=session['steps'],
        content=session['content'],
        sources=session['sources'],
        timestamp=session['timestamp'],
        error=session.get('error')
    )

@router.delete("/session/{session_id}")
async def delete_session(session_id: str):
    """Delete a research session"""
    if session_id in research_sessions:
        del research_sessions[session_id]
        return {"message": "Session deleted"}
    return {"message": "Session not found"}

@router.get("/health-polling")
async def health_check():
    """Health check"""
    return {
        'status': 'healthy',
        'service': 'research-polling',
        'active_sessions': len(research_sessions)
    }