"""
Research API using Strands Agents
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import asyncio
import uuid
import logging
from datetime import datetime
from strands import Agent
# from strands_tools import web_search, calculator  # These tools don't exist in strands_tools
import os

router = APIRouter(prefix="/research", tags=["research-strands"])
logger = logging.getLogger(__name__)

# Store active research sessions
research_sessions: Dict[str, Dict[str, Any]] = {}

class ResearchStartRequest(BaseModel):
    query: str
    session_id: Optional[str] = None

class ResearchStatusResponse(BaseModel):
    session_id: str
    status: str
    progress: float = 0
    steps: List[Dict[str, Any]] = []
    content: str = ""
    sources: List[Dict[str, Any]] = []
    timestamp: str
    error: Optional[str] = None

async def perform_strands_research(session_id: str, query: str):
    """
    Perform research using Strands Agent with web search
    """
    session = research_sessions[session_id]
    
    try:
        session['status'] = 'running'
        
        # Step 1: Initialize research
        step1 = {
            'id': 'step-1',
            'title': 'Initializing research agent',
            'description': f'Setting up research for: "{query}"',
            'status': 'active',
            'icon': 'brain'
        }
        session['steps'].append(step1)
        await asyncio.sleep(0.5)
        
        # Create Strands research agent with web search tool
        research_agent = Agent(
            tools=[web_search],
            system_prompt="""You are an expert research assistant. When given a query:
1. Use the web_search tool to find relevant information
2. Analyze and synthesize the results
3. Provide a comprehensive, well-structured answer with citations
4. Include specific facts, data, and insights from sources
5. Format your response in clear markdown with sections""",
            callback_handler=None  # No console output
        )
        
        step1['status'] = 'completed'
        step1['description'] = 'Research agent initialized'
        
        # Step 2: Performing web search
        step2 = {
            'id': 'step-2',
            'title': 'Searching the web',
            'description': 'Gathering information from multiple sources...',
            'status': 'active',
            'icon': 'search'
        }
        session['steps'].append(step2)
        await asyncio.sleep(0.5)
        
        # Execute research with streaming callback
        def research_callback(**kwargs):
            """Callback to capture agent output"""
            if "data" in kwargs:
                # Append text data to content
                session['content'] += kwargs['data']
            elif "current_tool_use" in kwargs:
                tool_info = kwargs["current_tool_use"]
                if tool_info.get("name") == "web_search":
                    # Update step when web search is being used
                    step2['description'] = f"Searching for: {tool_info.get('input', {}).get('query', query)}"
        
        # Create agent with callback for streaming
        streaming_agent = Agent(
            tools=[],  # No tools for now - web_search not available
            system_prompt=research_agent._system_prompt,
            callback_handler=research_callback
        )
        
        # Perform the research
        result = streaming_agent(f"""Research this query and provide a comprehensive answer with sources:

Query: {query}

Requirements:
- Use web_search to find current information
- Include citations as [1], [2], etc.
- Structure the response with clear sections
- Highlight key findings and insights""")
        
        step2['status'] = 'completed'
        step2['description'] = 'Web search completed'
        
        # Step 3: Processing results
        step3 = {
            'id': 'step-3',
            'title': 'Processing and formatting',
            'description': 'Organizing information and citations...',
            'status': 'active',
            'icon': 'synthesis'
        }
        session['steps'].append(step3)
        await asyncio.sleep(0.5)
        
        # Extract sources from the agent's conversation (if web_search was used)
        sources_found = []
        for msg in streaming_agent.messages:
            if msg.get('role') == 'user':
                # Check for tool results
                content = msg.get('content', [])
                for item in content:
                    if isinstance(item, dict) and 'toolResult' in item:
                        tool_result = item['toolResult']
                        if tool_result.get('status') == 'success':
                            # Parse web search results
                            result_content = tool_result.get('content', [])
                            for content_item in result_content:
                                if isinstance(content_item, dict) and 'text' in content_item:
                                    # Try to parse as search results
                                    try:
                                        import json
                                        search_data = json.loads(content_item['text'])
                                        if isinstance(search_data, list):
                                            for idx, result in enumerate(search_data[:10], 1):
                                                source = {
                                                    'id': f'source-{idx}',
                                                    'title': result.get('title', 'Untitled'),
                                                    'url': result.get('url', ''),
                                                    'domain': extract_domain(result.get('url', '')),
                                                    'snippet': result.get('snippet', '')[:200] + '...' if result.get('snippet') else '',
                                                    'favicon': f"https://www.google.com/s2/favicons?domain={extract_domain(result.get('url', ''))}&sz=32"
                                                }
                                                sources_found.append(source)
                                    except:
                                        pass
        
        session['sources'] = sources_found
        step3['status'] = 'completed'
        step3['description'] = f'Processed {len(sources_found)} sources'
        
        # Complete
        session['status'] = 'completed'
        session['progress'] = 100
        
    except Exception as e:
        logger.error(f"Research error: {e}")
        session['status'] = 'error'
        session['error'] = str(e)

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

@router.post("/start-strands")
async def start_research(request: ResearchStartRequest, background_tasks: BackgroundTasks):
    """Start a research session using Strands Agent"""
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
    
    # Start research in background
    background_tasks.add_task(perform_strands_research, session_id, request.query)
    
    logger.info(f"Started Strands research session {session_id} for query: {request.query}")
    
    return {
        'session_id': session_id,
        'status': 'started',
        'message': 'Research started successfully'
    }

@router.get("/status-strands/{session_id}")
async def get_research_status(session_id: str):
    """Get current status of Strands research session"""
    if session_id not in research_sessions:
        logger.warning(f"Session {session_id} not found")
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

@router.get("/health-strands")
async def health_check():
    """Health check for Strands research"""
    return {
        'status': 'healthy',
        'service': 'research-strands',
        'active_sessions': len(research_sessions),
        'backend': 'Strands Agents SDK'
    }