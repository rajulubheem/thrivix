"""
Research API using Strands Agents with Real Tools
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
from strands_tools import handoff_to_user
from app.tools.tavily_search_tool import tavily_search, get_all_search_results, clear_search_results
import os
import json
import threading

router = APIRouter(prefix="/research", tags=["research-strands-real"])
logger = logging.getLogger(__name__)

# Store active research sessions
research_sessions: Dict[str, Dict[str, Any]] = {}

class ResearchStartRequest(BaseModel):
    query: str
    session_id: Optional[str] = None
    require_approval: Optional[bool] = False

class ResearchStatusResponse(BaseModel):
    session_id: str
    status: str
    progress: float = 0
    steps: List[Dict[str, Any]] = []
    content: str = ""
    sources: List[Dict[str, Any]] = []
    timestamp: str
    error: Optional[str] = None
    requires_approval: Optional[bool] = False
    approval_message: Optional[str] = None

def perform_strands_research(session_id: str, query: str, require_approval: bool = False):
    """
    Perform research using Strands Agent with real tools and proper streaming
    Run in a thread with its own event loop to avoid context issues
    """
    def _run_research():
        session = research_sessions[session_id]
        
        try:
            session['status'] = 'running'
            session['progress'] = 10
        
            # Clear any previous search results
            clear_search_results()
            
            # Step 1: Initialize research
            step1 = {
                'id': 'step-1',
                'title': 'Initializing research agent',
                'description': f'Setting up research for: "{query}"',
                'status': 'active',
                'icon': 'brain'
            }
            session['steps'].append(step1)
            await asyncio.sleep(0.2)
        
            # Set up tools list
            tools = [tavily_search]
            if require_approval:
                # Use the standard handoff_to_user from strands_agents_tools
                tools.append(handoff_to_user)
            
            logger.info(f"Research agent using tools: {[t.__name__ if hasattr(t, '__name__') else str(t) for t in tools]}")
        
            # Track content accumulation
            content_buffer = []
            sources_found = []
            search_count = 0
            reasoning_steps = []  # Track agent's reasoning process
        
            # Create OpenAI model configuration
            openai_model = OpenAIModel(
                client_args={
                    "api_key": os.getenv("OPENAI_API_KEY"),
                },
                model_id="gpt-4o-mini",
                params={
                    "max_tokens": 4000,
                    "temperature": 0.7,
                }
            )
        
            # Create Strands research agent with enhanced prompting for deep research
            research_agent = Agent(
            model=openai_model,
            tools=tools,
            system_prompt="""You are an expert research assistant specializing in deep, comprehensive analysis. 

## Your Research Process:

### 1. Initial Analysis & Planning
- Break down the query into key components
- Identify what specific information is needed
- Share your reasoning about the research approach
{handoff_prompt}

### 2. Comprehensive Search Strategy
- Use tavily_search tool multiple times with varied queries
- Search for different perspectives and angles
- Look for recent data, expert opinions, and contradicting views
- Search for both broad context and specific details

### 3. Critical Analysis & Synthesis
- Evaluate the credibility and relevance of sources
- Identify patterns, trends, and insights
- Note any conflicting information or gaps
- Synthesize findings into coherent conclusions

### 4. Structured Response
- Begin with an executive summary
- Present findings in logical sections
- Include specific data points and facts
- Use inline citations [1], [2] for all claims
- Highlight key insights and implications
- Note any limitations or areas needing clarification

### 5. Human Interaction (when handoff_to_user tool is available)
- IMPORTANT: If the handoff_to_user tool is available, you MUST use it to:
  * Ask for clarification when the query is ambiguous or unclear
  * Request user preferences for specific research directions (e.g., "Would you like me to focus on technical details or market analysis?")
  * Get approval before researching sensitive or potentially controversial topics
  * Share intermediate findings and ask if the user wants you to explore specific aspects deeper
  * Ask for additional context or constraints that would help refine the research

Example usage:
- For ambiguous queries: Use handoff_to_user(message="Your query about 'Apple' could refer to the company or the fruit. Which would you like me to research?", breakout_of_loop=False)
- For preferences: Use handoff_to_user(message="I found information about Tesla's stock performance and technology. Which aspect would you like me to explore in more detail?", breakout_of_loop=False)
- For sensitive topics: Use handoff_to_user(message="This topic involves medical/financial advice. Should I proceed with general information only?", breakout_of_loop=False)

IMPORTANT RULES:
- ALWAYS use tavily_search before making any claims
- Search at least 3-5 times with different queries for comprehensive coverage
- If handoff_to_user is available and the query could benefit from clarification, USE IT EARLY in your research
- Share your thought process and reasoning
- Be transparent about uncertainty or conflicting information
- Use markdown formatting for clarity""".format(
                handoff_prompt="""
- PROACTIVELY use handoff_to_user if available to clarify ambiguous queries
- Ask the user for preferences on research direction BEFORE starting searches""" if require_approval else ""
            )
            )
            
            step1['status'] = 'completed'
            step1['description'] = 'Research agent initialized with tools'
            session['progress'] = 20
        
            # Step 2: Performing research
            step2 = {
                'id': 'step-2',
                'title': 'Executing research',
                'description': 'Searching for information...',
                'status': 'active',
                'icon': 'search'
            }
            session['steps'].append(step2)
        
            # Prepare the research prompt
            handoff_instruction = """0. FIRST CHECK: Is this query ambiguous or would benefit from user clarification? 
   - If yes, use handoff_to_user to ask for clarification BEFORE searching
   - Examples: "Apple" (company or fruit?), "best investment" (what type?), "latest news" (what topic?)
""" if require_approval else ""
        
            research_prompt = f"""Research this query thoroughly: "{query}"

Remember to:
{handoff_instruction}1. Use tavily_search tool multiple times with different search terms
2. Search for latest news, recent developments, and expert analysis
3. Provide specific data points and statistics from your searches
4. Cite your sources using [1], [2], etc.
5. Structure the response with clear sections

Start your research for: {query}"""
        
            logger.info(f"Starting research for: {query}")
            
            # Execute research using stream_async for real-time updates
            try:
                response_text = ""
                current_tool_input = ""  # Buffer for accumulating tool input
                current_search_id = None
                
                async for event in research_agent.stream_async(research_prompt):
                    # Handle text generation
                    if "data" in event:
                        text_chunk = event["data"]
                        response_text += text_chunk
                        content_buffer.append(text_chunk)
                        session['content'] = ''.join(content_buffer)
                        session['progress'] = min(50 + len(content_buffer), 90)
                    
                        # Track reasoning steps in the agent's output
                        if any(keyword in text_chunk.lower() for keyword in ['analyzing', 'searching for', 'looking for', 'considering', 'evaluating']):
                            if len(reasoning_steps) == 0 or len(reasoning_steps[-1]) > 200:
                                reasoning_steps.append(text_chunk)
                            else:
                                reasoning_steps[-1] += text_chunk
                
                    # Handle tool usage - accumulate streaming input
                    elif "partial_tool_use" in event:
                        # This is a partial tool input being streamed - SKIP for handoff_to_user
                        partial_info = event["partial_tool_use"]
                        if isinstance(partial_info, dict):
                            tool_name = partial_info.get("name", "")
                            # Only accumulate for tavily_search, ignore partial events for handoff_to_user
                            if tool_name == "tavily_search":
                                partial_input = partial_info.get("input", "")
                                current_tool_input += str(partial_input)
                            # Explicitly skip handoff_to_user partial events to prevent duplicates
                            elif tool_name == "handoff_to_user":
                                continue
                            
                    # Handle complete tool usage
                    elif "current_tool_use" in event:
                        tool_info = event["current_tool_use"]
                        logger.debug(f"Tool event received: {tool_info}")
                        if isinstance(tool_info, dict):
                            tool_name = tool_info.get("name", "")
                            
                            if tool_name == "handoff_to_user":
                                # Handle human-in-the-loop interaction
                                tool_input = tool_info.get("input", {})
                                if isinstance(tool_input, dict):
                                    handoff_message = tool_input.get("message", "")
                                    breakout = tool_input.get("breakout_of_loop", False)
                                elif isinstance(tool_input, str):
                                    # If input is a string, parse JSON if possible
                                    try:
                                        import json
                                        parsed = json.loads(tool_input)
                                        if isinstance(parsed, dict):
                                            handoff_message = parsed.get("message", tool_input)
                                            breakout = parsed.get("breakout_of_loop", False)
                                        else:
                                            handoff_message = tool_input
                                            breakout = False
                                    except:
                                        handoff_message = tool_input
                                        breakout = False
                                else:
                                    handoff_message = str(tool_input)
                                    breakout = False
                                
                                # Only process if we have a meaningful message
                                if handoff_message and not handoff_message.startswith('{"'):
                                    session['requires_approval'] = True
                                    session['approval_message'] = handoff_message
                                    
                                    # Check if we already have a handoff step to avoid duplicates
                                    has_handoff = any(step.get('icon') == 'user' for step in session['steps'])
                                    if not has_handoff:
                                        # Add handoff step
                                        handoff_step = {
                                            'id': f'step-handoff-{len(reasoning_steps)}',
                                            'title': '🤝 Human Input Requested',
                                            'description': handoff_message,
                                            'status': 'waiting',
                                            'icon': 'user'
                                        }
                                        session['steps'].append(handoff_step)
                                    else:
                                        # Update existing handoff step
                                        for step in session['steps']:
                                            if step.get('icon') == 'user':
                                                step['description'] = handoff_message
                                                break
                                
                                    # Always pause for user input in web context
                                    session['status'] = 'waiting_for_user'
                                    # Return early to wait for user input - don't continue processing
                                    logger.info(f"Pausing for user input: {handoff_message}")
                                    return  # Exit the function completely to wait for user response
                            
                            elif tool_name == "tavily_search":
                                # Handle different input formats
                                tool_input = tool_info.get("input", {})
                                
                                # Extract clean query from tool input
                                query_used = None
                                if isinstance(tool_input, dict):
                                    query_used = tool_input.get("query", "")
                                elif isinstance(tool_input, str):
                                    # Try to parse JSON string
                                    try:
                                        import json
                                        # Clean up malformed JSON
                                        clean_input = tool_input.strip()
                                        if clean_input.startswith('{"query"'):
                                            # Try to find complete JSON
                                            if clean_input.count('}') >= 1:
                                                end_idx = clean_input.find('}') + 1
                                                clean_input = clean_input[:end_idx]
                                            parsed = json.loads(clean_input)
                                            if isinstance(parsed, dict):
                                                query_used = parsed.get("query", "")
                                        else:
                                            query_used = clean_input
                                    except:
                                        # If not valid JSON, check if it's a partial query
                                        if tool_input and len(tool_input) > 5:  # Skip very short partials
                                            query_used = tool_input
                                
                                # Only add step if we have a meaningful query
                                if query_used and len(str(query_used)) > 3 and not query_used.startswith('{"'):
                                    search_count += 1
                                    # Update step
                                    search_step = {
                                        'id': f'step-search-{search_count}',
                                        'title': f'Web Search #{search_count}',
                                        'description': f'Searching for: "{str(query_used)}"',
                                        'status': 'active',
                                        'icon': 'search',
                                        'tool_input': str(query_used),
                                        'tool_output': None  # Will be populated after search completes
                                    }
                                    session['steps'].append(search_step)
                                    session['progress'] = min(30 + (search_count * 10), 80)
                        elif isinstance(tool_info, str):
                            # Handle string format
                            if "tavily_search" in tool_info:
                                search_count += 1
                                search_step = {
                                    'id': f'step-search-{search_count}',
                                    'title': f'Web Search #{search_count}',
                                    'description': f'Searching for information...',
                                    'status': 'active',
                                    'icon': 'search'
                                }
                                session['steps'].append(search_step)
                                session['progress'] = min(30 + (search_count * 10), 80)
                
                    # Handle completion
                    elif "complete" in event:
                        logger.info(f"Research stream completed")
                    
            except Exception as e:
                logger.error(f"Error during research stream: {e}")
                raise
        
            # After research completes, get ALL search results for sources
            search_results = get_all_search_results()
        
            # Process search results into sources (deduplicate by URL)
            seen_urls = set()
            source_idx = 1
            for result in search_results[:20]:  # Get up to 20 sources
                if result and isinstance(result, dict):
                    url = result.get('url', '')
                    if url and url not in seen_urls:
                        seen_urls.add(url)
                        source = {
                            'id': f'source-{source_idx}',
                            'title': result.get('title', 'Untitled'),
                            'url': url,
                            'domain': extract_domain(url),
                            'snippet': result.get('content', '')[:200] + '...' if result.get('content') else '',
                            'favicon': f"https://www.google.com/s2/favicons?domain={extract_domain(url)}&sz=64",
                            'thumbnail': f"https://picsum.photos/seed/{source_idx}/400/300",  # Use reliable placeholder
                            'score': result.get('score', 0)
                        }
                        sources_found.append(source)
                        source_idx += 1
        
            session['sources'] = sources_found
            
            # Update step statuses
            step2['status'] = 'completed'
            step2['description'] = f'Completed {search_count} searches'
        
            for step in session['steps']:
                if step.get('id', '').startswith('step-search-') and step['status'] == 'active':
                    step['status'] = 'completed'
        
            # Step 3: Process sources
            step3 = {
                'id': 'step-3',
                'title': 'Processing sources',
                'description': f'Processed {len(sources_found)} sources',
                'status': 'completed',
                'icon': 'synthesis'
            }
            session['steps'].append(step3)
            
            # Complete
            session['status'] = 'completed'
            session['progress'] = 100
            
        except Exception as e:
            logger.error(f"Research error: {e}")
            session['status'] = 'error'
            session['error'] = str(e)
    
    # Run the async function in a new event loop
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_async_research())
    finally:
        loop.close()

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

@router.post("/start-strands-real")
async def start_research(request: ResearchStartRequest, background_tasks: BackgroundTasks):
    """Start a research session using Strands Agent with real tools"""
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
        'error': None,
        'requires_approval': False,
        'approval_message': None
    }
    
    # Start research in background (synchronous function will handle its own async loop)
    background_tasks.add_task(
        perform_strands_research, 
        session_id, 
        request.query, 
        request.require_approval
    )
    
    logger.info(f"Started Strands research session {session_id} for query: {request.query}")
    
    return {
        'session_id': session_id,
        'status': 'started',
        'message': 'Research started successfully'
    }

@router.get("/status-strands-real/{session_id}")
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
        error=session.get('error'),
        requires_approval=session.get('requires_approval', False),
        approval_message=session.get('approval_message')
    )

@router.post("/approve/{session_id}")
async def approve_research(session_id: str, approval: Dict[str, Any], background_tasks: BackgroundTasks):
    """Approve a research action that requires human approval"""
    if session_id not in research_sessions:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    
    session = research_sessions[session_id]
    session['requires_approval'] = False
    
    user_input = approval.get('user_input', '')
    approved = approval.get('approved', False)
    
    if approved and user_input:
        # Combine the original query with user's additional request
        original_query = session.get('query', '')
        enhanced_query = f"{original_query}. Additional user request: {user_input}"
        
        # Clear session for fresh restart
        session['query'] = enhanced_query
        session['approval_message'] = None
        session['status'] = 'running'
        session['steps'] = []  # Clear old steps
        session['content'] = ''  # Clear old content
        session['sources'] = []  # Clear old sources
        session['progress'] = 0
        
        # Restart research with enhanced query (synchronous function will handle its own async loop)
        background_tasks.add_task(
            perform_strands_research, 
            session_id, 
            enhanced_query, 
            False  # Don't ask for approval again
        )
        
        return {
            'session_id': session_id,
            'status': 'approved',
            'message': f'Research continuing with additional context: {user_input}'
        }
    else:
        session['status'] = 'cancelled'
        session['approval_message'] = None
        return {
            'session_id': session_id,
            'status': 'cancelled',
            'message': 'Research cancelled by user'
        }

@router.get("/health-strands-real")
async def health_check():
    """Health check for Strands research with real tools"""
    # Test if we can import the tools
    try:
        from app.tools.tavily_search_tool import tavily_search
        tools_available = True
    except ImportError:
        tools_available = False
        
    return {
        'status': 'healthy',
        'service': 'research-strands-real',
        'active_sessions': len(research_sessions),
        'backend': 'Strands Agents SDK',
        'tools_available': tools_available,
        'api_keys_configured': {
            'openai': bool(os.getenv('OPENAI_API_KEY')),
            'tavily': bool(os.getenv('TAVILY_API_KEY'))
        }
    }