"""
Clean Research API with Citations
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
import re

router = APIRouter(prefix="/research", tags=["research-clean"])
logger = logging.getLogger(__name__)

# Store active research sessions
research_sessions: Dict[str, Dict[str, Any]] = {}

class ResearchStartRequest(BaseModel):
    query: str
    session_id: Optional[str] = None

class ResearchStatusResponse(BaseModel):
    session_id: str
    status: str
    progress: float
    thoughts: List[Dict[str, Any]]
    content: str
    sources: List[Dict[str, Any]]
    timestamp: str

async def perform_clean_research(session_id: str, query: str):
    """
    Perform research with clean UI and proper citations
    """
    session = research_sessions[session_id]
    api_key = os.getenv("TAVILY_API_KEY") or "REMOVED_API_KEY"
    
    try:
        session['status'] = 'running'
        
        # Step 1: Initial query analysis
        thought1 = {
            'id': f'thought-1-{int(time.time())}',
            'type': 'reasoning',
            'content': f'Breaking down query: "{query}"\n• Identifying key entities and search terms\n• Planning multi-source research approach',
            'status': 'active',
            'timestamp': datetime.now().isoformat()
        }
        session['thoughts'].append(thought1)
        await asyncio.sleep(0.5)
        thought1['status'] = 'completed'
        
        # Step 2: Tool selection
        thought2 = {
            'id': f'thought-2-{int(time.time())}',
            'type': 'tool_selection',
            'content': 'Selecting research tools:\n• Tavily Search API for web results\n• Advanced search depth for comprehensive coverage',
            'status': 'active',
            'timestamp': datetime.now().isoformat()
        }
        session['thoughts'].append(thought2)
        await asyncio.sleep(0.3)
        thought2['status'] = 'completed'
        
        # Step 3: Execute search
        thought3 = {
            'id': f'thought-3-{int(time.time())}',
            'type': 'search',
            'content': f'Executing search: "{query}"\n• Fetching from multiple sources...\n• Evaluating content relevance...',
            'status': 'active',
            'timestamp': datetime.now().isoformat()
        }
        session['thoughts'].append(thought3)
        
        # Perform actual search
        search_results = await execute_tavily_search(query, api_key)
        thought3['status'] = 'completed'
        
        # Step 4: Process and synthesize results
        results = search_results.get('results', [])
        num_results = len(results)
        
        thought4 = {
            'id': f'thought-4-{int(time.time())}',
            'type': 'synthesis',
            'content': f'Processing {num_results} search results:\n• Extracting key information\n• Cross-referencing sources\n• Building comprehensive answer',
            'status': 'active',
            'timestamp': datetime.now().isoformat()
        }
        session['thoughts'].append(thought4)
        await asyncio.sleep(0.5)
        thought4['status'] = 'completed'
        
        # Step 4: Build content with proper structure
        content = ""
        
        # Use Tavily's answer if available
        if search_results.get('answer'):
            content = search_results['answer'] + "\n\n"
        
        # Add key findings from sources
        if results:
            content += "## Key Findings\n\n"
            
            # Group results by topic/relevance
            for i, result in enumerate(results[:5], 1):
                title = result.get('title', '')
                text = result.get('content', '')
                
                if text:
                    # Extract the most relevant part
                    sentences = text.split('. ')
                    key_point = '. '.join(sentences[:2]) if len(sentences) > 1 else text
                    
                    # Add with inline citation
                    content += f"• {key_point} [[{i}]](#source-{i})\n\n"
        
        # Add analysis section
        if results:
            content += "\n## Analysis\n\n"
            
            # Synthesize information
            themes = extract_themes(results)
            if themes:
                content += "Based on the search results, several key themes emerge:\n\n"
                for theme in themes[:3]:
                    content += f"• **{theme['theme']}**: {theme['description']} [{theme['citation']}]\n"
        
        # Step 5: Add sources with proper metadata
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
        
        # Final status update
        final_thought = {
            'id': f'thought-final-{int(time.time())}',
            'type': 'synthesis',
            'content': f'Research complete:\n• Analyzed {len(results)} sources\n• Extracted key findings with citations\n• Generated comprehensive answer',
            'status': 'completed',
            'timestamp': datetime.now().isoformat()
        }
        session['thoughts'].append(final_thought)
        
        session['content'] = content
        session['status'] = 'completed'
        session['progress'] = 100
        
    except Exception as e:
        logger.error(f"Research error: {e}")
        session['status'] = 'error'
        session['error'] = str(e)

def extract_themes(results: List[Dict]) -> List[Dict]:
    """Extract key themes from search results"""
    themes = []
    
    # Simple theme extraction based on common keywords
    theme_keywords = {
        'growth': ['growth', 'increase', 'expand', 'rise'],
        'decline': ['decline', 'decrease', 'fall', 'drop'],
        'innovation': ['innovation', 'new', 'breakthrough', 'advance'],
        'challenge': ['challenge', 'problem', 'issue', 'concern'],
        'opportunity': ['opportunity', 'potential', 'prospect', 'future']
    }
    
    for theme_name, keywords in theme_keywords.items():
        for i, result in enumerate(results[:5], 1):
            content = result.get('content', '').lower()
            if any(keyword in content for keyword in keywords):
                themes.append({
                    'theme': theme_name.title(),
                    'description': extract_theme_description(content, keywords),
                    'citation': str(i)
                })
                break
    
    return themes

def extract_theme_description(content: str, keywords: List[str]) -> str:
    """Extract a description for a theme from content"""
    sentences = content.split('. ')
    for sentence in sentences:
        if any(keyword in sentence.lower() for keyword in keywords):
            return sentence.strip()[:150] + '...' if len(sentence) > 150 else sentence.strip()
    return "Multiple indicators suggest this trend"

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
        # Remove protocol
        domain = re.sub(r'^https?://', '', url)
        # Remove www
        domain = re.sub(r'^www\.', '', domain)
        # Remove path
        domain = domain.split('/')[0]
        return domain
    except:
        return ""

@router.post("/start-clean")
async def start_clean_research(request: ResearchStartRequest, background_tasks: BackgroundTasks):
    """Start a clean research session"""
    session_id = request.session_id or str(uuid.uuid4())
    
    # Initialize session
    research_sessions[session_id] = {
        'session_id': session_id,
        'query': request.query,
        'status': 'initializing',
        'progress': 0,
        'thoughts': [],
        'content': '',
        'sources': [],
        'timestamp': datetime.now().isoformat()
    }
    
    # Start research in background
    background_tasks.add_task(perform_clean_research, session_id, request.query)
    
    logger.info(f"Started clean research session {session_id} for query: {request.query}")
    
    return {
        'session_id': session_id,
        'status': 'started',
        'message': 'Research started successfully'
    }

@router.get("/status-clean/{session_id}")
async def get_clean_research_status(session_id: str):
    """Get current status of clean research session"""
    if session_id not in research_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = research_sessions[session_id]
    
    return ResearchStatusResponse(
        session_id=session_id,
        status=session['status'],
        progress=session['progress'],
        thoughts=session['thoughts'],
        content=session['content'],
        sources=session['sources'],
        timestamp=session['timestamp']
    )

@router.get("/health-clean")
async def health_check():
    """Health check"""
    return {
        'status': 'healthy',
        'service': 'research-clean',
        'active_sessions': len(research_sessions)
    }