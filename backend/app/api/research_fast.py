"""
Fast Research API - Simple Perplexity-style quick research
Based on original working implementation
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import asyncio
import uuid
import logging
from datetime import datetime
from strands import Agent
from strands.models.openai import OpenAIModel
from app.services.strands_session_service import StrandsSessionService
from app.tools.tavily_search_tool import tavily_search, get_all_search_results, clear_search_results
import os
import threading

router = APIRouter(prefix="/research", tags=["fast-research"])
logger = logging.getLogger(__name__)

# Store active research sessions
research_sessions: Dict[str, Dict[str, Any]] = {}
SESSION_SERVICE = StrandsSessionService()

class ResearchStartRequest(BaseModel):
    query: str
    session_id: Optional[str] = None

class ResearchStatusResponse(BaseModel):
    session_id: str
    status: str
    progress: float = 0.0
    steps: List[Dict[str, Any]] = []
    content: str = ""
    sources: List[Dict[str, Any]] = []
    thoughts: List[Dict[str, Any]] = []  # Add real-time thinking with proper structure
    timestamp: str

def perform_fast_research(session_id: str, query: str):
    """
    Perform fast Perplexity-style research with 5-8 quick searches
    """
    def _run_research():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_async_research())
        finally:
            loop.close()
    
    async def _async_research():
        session = research_sessions[session_id]
        
        try:
            session['status'] = 'running'
            session['progress'] = 0.1
            
            # Clear previous search results
            clear_search_results()
            
            # Simple tools setup - just search
            tools = [tavily_search]
            
            # Fast model configuration (session-managed agent will use this)
            model_config = {"model_id": "gpt-4o-mini", "max_tokens": 2000, "temperature": 0.6}
            
            # Get current date for context
            from datetime import datetime
            current_date = datetime.now()
            date_str = current_date.strftime("%B %d, %Y")
            
            # Simple fast research prompt with current date context
            system_prompt = f"""You are a fast research assistant like Perplexity AI. Today's date is {date_str}.

Your approach:
1. IMPORTANT: You MUST perform multiple searches (at least 3-5) to gather comprehensive information
2. Search for different aspects:
   - First search: latest news and most recent updates (prioritize 2025 content, then 2024)
   - Second search: current data, statistics, and real-time information
   - Third search: recent trends, analysis, and expert opinions
   - Additional searches: specific details, forecasts, or related developments
3. Each search should explore a different angle of the query
4. When searching, include "2025" or "latest" or "current" in your search queries to get recent information
5. Synthesize all findings into a concise response with inline citations

Output format:
📌 **Quick Summary** (2-3 bullets)
• Most important finding with citation [1]
• Key data point with citation [2] 
• Latest development with citation [3]

📊 **Key Information**
[Main findings in 2-3 paragraphs, 400-600 words total. Include inline citations like [1], [2], etc. throughout the text to reference your sources]

🔗 **Sources**
[1] Source Title - Publisher/Website
    URL: https://...
[2] Source Title - Publisher/Website  
    URL: https://...
[Continue numbering all sources]

Be quick, accurate, and comprehensive. Today is {date_str} - focus on the most current information available.
Remember: Use the tavily_search tool multiple times with different search queries, including temporal terms like "2025", "latest", "current", "today"."""

            # Create session-managed agent for continuity across runs
            research_agent = SESSION_SERVICE.create_agent_with_session(
                session_id=session_id,
                agent_name="fast",
                tools=tools,
                system_prompt=system_prompt,
                model_config=model_config
            )
            
            # Update progress
            session['progress'] = 0.3
            session['steps'].append({
                'step': 'Starting research',
                'status': 'active',
                'timestamp': datetime.now().isoformat()
            })
            session['thoughts'] = [
                {
                    'type': 'planning',
                    'content': f'🔍 Starting research on: {query}',
                    'timestamp': datetime.now().isoformat()
                },
                {
                    'type': 'analyzing',
                    'content': '📊 Analyzing query and planning search strategy...',
                    'timestamp': datetime.now().isoformat()
                }
            ]
            
            # Execute research
            response_text = ""
            current_chunk = ""
            last_tool_id = None  # Track tool IDs to avoid duplicates
            
            async for event in research_agent.stream_async(query):
                if "data" in event:
                    text_chunk = event["data"]
                    response_text += text_chunk
                    current_chunk += text_chunk
                    
                    # Update content in real-time
                    session['content'] = response_text
                    session['progress'] = min(0.9, session['progress'] + 0.01)
                    
                    # Skip adding response text to thoughts - too verbose
                    # Frontend should display the streaming content directly
                
                elif "current_tool_use" in event:
                    # Show actual tool usage
                    tool_info = event.get("current_tool_use", {})
                    if isinstance(tool_info, dict) and tool_info.get("name") == "tavily_search":
                        # Get tool ID to prevent duplicates
                        tool_id = tool_info.get("toolUseId") or tool_info.get("id")
                        
                        # Only add if this is a new tool call
                        if tool_id and tool_id != last_tool_id:
                            last_tool_id = tool_id
                            
                            # Count actual searches performed
                            search_count = sum(1 for t in session.get('thoughts', []) if t.get('type') == 'searching')
                            
                            # Get search query from tool args if available
                            search_query = ''
                            if 'args' in tool_info:
                                args = tool_info['args']
                                if isinstance(args, dict):
                                    search_query = args.get('query', '')
                                elif isinstance(args, str):
                                    # Args might be JSON string
                                    try:
                                        import json
                                        args_dict = json.loads(args)
                                        search_query = args_dict.get('query', '')
                                    except:
                                        pass
                            elif 'input' in tool_info:
                                input_data = tool_info['input']
                                if isinstance(input_data, dict):
                                    search_query = input_data.get('query', '')
                            
                            # Add real search thought
                            session['thoughts'].append({
                                'type': 'searching',
                                'content': f'🔎 Searching: {search_query if search_query else "Gathering information from web sources..."}',
                                'timestamp': datetime.now().isoformat()
                            })
                            session['steps'].append({
                                'step': f'Web search {search_count + 1}',
                                'status': 'active',
                                'timestamp': datetime.now().isoformat()
                            })
                            session['progress'] = min(0.8, 0.3 + (search_count * 0.1))
            
            # Get search results with enhanced metadata
            search_results = get_all_search_results()
            for i, result in enumerate(search_results, 1):
                # Extract domain from URL for thumbnail
                url = result.get('url', '')
                domain = ''
                if url:
                    from urllib.parse import urlparse
                    parsed = urlparse(url)
                    domain = parsed.netloc or parsed.path
                
                # Create enhanced source object
                source = {
                    'id': f'source_{i}',
                    'title': result.get('title', 'Source'),
                    'url': url,
                    'snippet': result.get('snippet', '')[:300],  # Longer snippet
                    'domain': domain,
                    'thumbnail': f'https://www.google.com/s2/favicons?domain={domain}&sz=64' if domain else '',
                    'publishDate': result.get('publishDate', datetime.now().isoformat()),
                    'author': result.get('author', domain),
                    'relevanceScore': result.get('relevanceScore', 0.8)
                }
                session['sources'].append(source)
            
            # Complete
            session['status'] = 'completed'
            session['progress'] = 1.0
            session['content'] = response_text
            
            # Add final thoughts
            search_count = sum(1 for t in session.get('thoughts', []) if t.get('type') == 'searching')
            session['thoughts'].append({
                'type': 'completed',
                'content': f'✅ Research complete! Performed {search_count} search{"es" if search_count != 1 else ""} and compiled findings.',
                'timestamp': datetime.now().isoformat()
            })
            session['thoughts'].append({
                'type': 'summary',
                'content': f'📝 Generated {len(response_text.split())} word report with {len(session["sources"])} sources.',
                'timestamp': datetime.now().isoformat()
            })
            
            session['steps'].append({
                'step': 'Research complete',
                'status': 'done',
                'timestamp': datetime.now().isoformat()
            })
            
            logger.info(f"Fast research completed for session {session_id}")
            
        except Exception as e:
            logger.error(f"Fast research error: {e}")
            session['status'] = 'error'
            session['error'] = str(e)
    
    # Start research in background thread
    thread = threading.Thread(target=_run_research)
    thread.start()

@router.post("/start")
async def start_research(request: ResearchStartRequest, background_tasks: BackgroundTasks):
    """Start fast research"""
    session_id = request.session_id or str(uuid.uuid4())
    
    # Initialize session
    research_sessions[session_id] = {
        'session_id': session_id,
        'status': 'initializing',
        'progress': 0.0,
        'steps': [],
        'content': '',
        'sources': [],
        'thoughts': [],  # Initialize thoughts
        'timestamp': datetime.now().isoformat(),
        'query': request.query
    }
    
    # Start research
    perform_fast_research(session_id, request.query)
    
    return {
        "session_id": session_id,
        "status": "started",
        "message": "Fast research started"
    }

@router.get("/status/{session_id}")
async def get_research_status(session_id: str):
    """Get research status"""
    if session_id not in research_sessions:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    
    session = research_sessions[session_id]
    return ResearchStatusResponse(**session)
