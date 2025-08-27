"""
Research API using Strands Agents with Real Tools - Fixed version
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
from app.tools.use_llm_wrapper import use_llm_fixed
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
    thoughts: List[Dict[str, Any]] = []  # Agent thoughts and reasoning
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
        # Create a new event loop for this thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            # Run the async function in the new loop
            loop.run_until_complete(_async_research_impl())
        finally:
            loop.close()
    
    async def _async_research_impl():
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
            
            # Set up tools list - include use_llm_fixed for deep analysis
            tools = [tavily_search, use_llm_fixed]
            if require_approval:
                # Use the standard handoff_to_user from strands_agents_tools
                tools.append(handoff_to_user)
            
            # Log tool details for debugging
            for tool in tools:
                logger.info(f"Tool registered: {getattr(tool, '__name__', 'unknown')} - callable: {callable(tool)}")
            
            logger.info(f"Research agent using tools: {[getattr(t, '__name__', str(t)) for t in tools]}")
            
            # Track content accumulation
            content_buffer = []
            sources_found = []
            search_count = 0
            reasoning_steps = []  # Track agent's reasoning process
            processed_tool_ids = set()  # Track which tool uses we've already processed
            thoughts_buffer = []  # Track agent's thoughts and planning
            current_thought = ""  # Current thought being built
            
            # Create OpenAI model configuration with higher token limit for deep analysis
            openai_model = OpenAIModel(
                client_args={
                    "api_key": os.getenv("OPENAI_API_KEY"),
                },
                model_id="gpt-4o-mini",
                params={
                    "max_tokens": 8000,  # Increased for deeper analysis
                    "temperature": 0.7,
                }
            )
            
            # Create Strands research agent with enhanced prompting for deep research
            research_agent = Agent(
                model=openai_model,
                tools=tools,
                system_prompt="""You are an expert research assistant specializing in deep, comprehensive analysis with multi-step reasoning.

## Your Advanced Research Process:

### Phase 1: Initial Exploration & Understanding
- Break down the query into ALL key components and subtopics
- Identify primary questions and secondary questions to explore
- Plan a comprehensive research strategy covering multiple angles
{handoff_prompt}

### Phase 2: Broad Information Gathering (MINIMUM 8-10 searches)
- Search for the main topic from different perspectives
- Search for recent news and latest developments
- Search for historical context and background
- Search for expert opinions and analysis
- Search for data, statistics, and trends
- Search for challenges, problems, and controversies
- Search for solutions, innovations, and future outlook
- Search for case studies and real-world examples

### Phase 3: Deep Dive & Refinement
After initial searches, STOP and THINK:
- What patterns am I seeing across sources?
- What critical information is still missing?
- What contradictions need to be resolved?
- What specific details would strengthen the analysis?

Then conduct 5-8 MORE targeted searches to:
- Fill information gaps identified
- Verify controversial or uncertain claims
- Get more recent or specific data
- Find authoritative sources for key claims
- Explore unexpected connections discovered

### Phase 4: Critical Analysis & Synthesis
- Cross-reference information across all sources
- Identify consensus views vs. controversial points
- Evaluate source credibility and potential biases
- Synthesize findings into coherent insights
- Draw meaningful conclusions with nuance

### Phase 5: Comprehensive Response
Structure your DETAILED response with:
1. **Executive Summary** - Key findings in 4-5 comprehensive bullets (minimum 3 lines each)
2. **Current State Analysis** - Detailed analysis of what's happening now (minimum 300 words)
3. **Key Insights & Trends** - Deep patterns and important findings (minimum 400 words)
4. **Data & Evidence** - Extensive specific numbers, facts, examples with context (minimum 300 words)
5. **Multiple Perspectives** - Diverse viewpoints with pros/cons analysis (minimum 300 words)
6. **Future Outlook** - Detailed predictions with timelines and scenarios (minimum 300 words)
7. **Actionable Recommendations** - 5-7 specific, detailed recommendations (minimum 400 words)
8. **Areas for Further Research** - Detailed questions and research gaps (minimum 200 words)

IMPORTANT: Each section must be THOROUGH and DETAILED.
Use inline citations [1], [2] for EVERY claim.
Include 20-30 high-quality sources.
TOTAL OUTPUT should be AT LEAST 2500 words.

### Human Interaction (when handoff_to_user tool is available):
- IMPORTANT: If the handoff_to_user tool is available, you MUST use it to:
  * Ask for clarification when the query is ambiguous or unclear
  * Request user preferences for specific research directions
  * Get approval before researching sensitive topics
  * Share intermediate findings and ask if user wants specific aspects explored deeper

IMPORTANT RULES:
- ALWAYS use tavily_search before making any claims
- Search at least 15-20 times with different queries for comprehensive coverage
- If handoff_to_user is available and the query could benefit from clarification, USE IT EARLY
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
            
            research_prompt = f"""Research this query with EXTREME DEPTH using the use_llm_fixed tool for deep analysis: "{query}"

## STEP-BY-STEP PROCESS (FOLLOW EXACTLY):

### STEP 1: DEEP ANALYSIS (MANDATORY - DO THIS FIRST)
Call the use_llm_fixed tool IMMEDIATELY with this exact format:
use_llm_fixed(
    prompt="Perform deep analysis of: {query}. Break down into: 1) Core questions and sub-topics, 2) Key assumptions to challenge, 3) Information gaps to fill, 4) Research angles to explore, 5) Potential controversies or debates, 6) Historical context needed, 7) Future implications to consider. Provide extensive analysis with at least 500 words.",
    system_prompt="You are an expert research analyst. Provide deep, comprehensive analysis with specific insights and non-obvious connections."
)

### STEP 2: COMPREHENSIVE SEARCH (20-25 searches minimum)
{handoff_instruction}Based on your deep analysis from Step 1, conduct searches:
- 5 searches: Core topic from different angles
- 5 searches: Latest developments and news
- 5 searches: Technical details and specifications  
- 5 searches: Market analysis and competitors
- 5 searches: Challenges, controversies, and solutions

### STEP 3: PATTERN ANALYSIS (MANDATORY - USE use_llm_fixed)
After completing initial searches, call use_llm_fixed again:
use_llm_fixed(
    prompt="Analyze these search findings: [summarize key findings]. Identify: 1) Patterns and trends, 2) Contradictions to resolve, 3) Information gaps remaining, 4) Non-obvious connections, 5) Areas needing deeper investigation. Provide at least 400 words of analysis.",
    system_prompt="You are an expert at pattern recognition and synthesis. Find deep insights and connections."
)

### STEP 4: TARGETED DEEP SEARCHES
Based on the pattern analysis, conduct 5-10 more targeted searches to:
- Fill identified gaps
- Resolve contradictions
- Verify key claims
- Get expert opinions

### STEP 5: FINAL SYNTHESIS (MANDATORY - USE use_llm_fixed)
Call use_llm_fixed for final synthesis:
use_llm_fixed(
    prompt="Synthesize all research into comprehensive insights. Provide: 1) Key findings with implications, 2) Non-obvious connections, 3) Contrarian perspectives, 4) Future scenarios, 5) Actionable recommendations. Write at least 600 words.",
    system_prompt="You are an expert at synthesizing complex information into actionable insights."
)

### STEP 6: COMPREHENSIVE OUTPUT
Based on ALL the above analysis, write your response with:
1. **Executive Summary** - 5 detailed bullets (60+ words each)
2. **Deep Analysis from use_llm_fixed** - Include insights from Step 1
3. **Current State** - 500+ words with extensive detail
4. **Key Patterns & Insights** - 600+ words from pattern analysis
5. **Data & Evidence** - 500+ words with specific metrics
6. **Multiple Perspectives** - 500+ words including contrarian views
7. **Future Scenarios** - 500+ words with timeline
8. **Actionable Recommendations** - 8-10 specific recommendations (600+ words)
9. **Synthesis Insights** - Key insights from final use_llm_fixed analysis
10. **Research Gaps** - 400+ words on what remains unknown

MINIMUM OUTPUT: 4000 words

CRITICAL CITATION REQUIREMENTS:
- Use inline citations [1], [2], [3] etc. for EVERY factual claim
- Citations MUST correspond to the actual source order in the sources list
- When citing, reference the EXACT source number that contains that information
- Include at least 30+ citations throughout the text
- EXAMPLE: "According to recent market analysis [1], Tesla's market share has declined to 3% [2]."
- The numbers in brackets MUST match the source numbers shown in the sources section
- At the end, include a "Sources" section listing all referenced sources with their numbers

START NOW with Step 1 - Call use_llm_fixed FIRST for deep analysis of: {query}"""
            
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
                        current_thought += text_chunk
                        
                        # Detect thought boundaries and categorize
                        thought_keywords = {
                            'planning': ['step 1:', 'step 2:', 'step 3:', 'first,', 'next,', 'then,', 'finally,', 'plan:', 'will', 'going to', 'need to'],
                            'analyzing': ['analyzing', 'breaking down', 'examining', 'investigating', 'exploring', 'understanding', 'deep analysis'],
                            'searching': ['searching for', 'looking for', 'querying', 'finding', 'search #', 'tavily_search'],
                            'evaluating': ['considering', 'evaluating', 'assessing', 'comparing', 'based on', 'according to'],
                            'synthesizing': ['combining', 'synthesizing', 'merging', 'integrating', 'pattern', 'insight', 'conclusion'],
                            'deciding': ['deciding', 'choosing', 'selecting', 'determining', 'therefore', 'thus'],
                            'coordinating': ['use_llm_fixed', 'calling', 'invoking', 'deep agent', 'handoff']
                        }
                        
                        # Check for thought type
                        thought_type = 'general'
                        for category, keywords in thought_keywords.items():
                            if any(kw in text_chunk.lower() for kw in keywords):
                                thought_type = category
                                break
                        
                        # Check for sentence completion (rough heuristic)
                        if any(punct in text_chunk for punct in ['. ', '.\n', '! ', '?\n', ':\n']):
                            if current_thought.strip():
                                thoughts_buffer.append({
                                    'type': thought_type,
                                    'content': current_thought.strip(),
                                    'timestamp': datetime.now().isoformat()
                                })
                                session['thoughts'] = thoughts_buffer[-20:]  # Keep last 20 thoughts
                                current_thought = ""
                        
                        # Regular content processing
                        content_buffer.append(text_chunk)
                        session['content'] = ''.join(content_buffer)
                        session['progress'] = min(50 + len(content_buffer), 90)
                        
                        # Track reasoning steps and ensure citations are preserved
                        import re
                        citation_pattern = r'\[\d+\]'
                        if re.search(citation_pattern, text_chunk):
                            logger.debug(f"Found citations in chunk: {text_chunk[:100]}")
                        
                        if any(keyword in text_chunk.lower() for keyword in ['analyzing', 'searching for', 'looking for', 'considering', 'evaluating']):
                            if len(reasoning_steps) == 0 or len(reasoning_steps[-1]) > 200:
                                reasoning_steps.append(text_chunk)
                            else:
                                reasoning_steps[-1] += text_chunk
                    
                    # Handle tool usage - accumulate streaming input
                    elif "partial_tool_use" in event:
                        # This is a partial tool input being streamed
                        partial_info = event["partial_tool_use"]
                        if isinstance(partial_info, dict):
                            tool_name = partial_info.get("name", "")
                            # Skip all partial events for handoff_to_user and use_llm_fixed
                            if tool_name in ["handoff_to_user", "use_llm_fixed"]:
                                continue
                            # Only accumulate for tavily_search
                            elif tool_name == "tavily_search":
                                partial_input = partial_info.get("input", "")
                                current_tool_input += str(partial_input)
                            
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
                            
                            elif tool_name == "use_llm_fixed":
                                # Generate a unique ID for this tool use
                                tool_use_id = tool_info.get("id", str(tool_info))
                                
                                # Skip if we've already processed this tool use
                                if tool_use_id in processed_tool_ids:
                                    continue
                                
                                processed_tool_ids.add(tool_use_id)
                                
                                # Handle deep analysis using use_llm_fixed
                                tool_input = tool_info.get("input", {})
                                
                                # Extract analysis prompt  
                                analysis_prompt = ""
                                if isinstance(tool_input, dict):
                                    analysis_prompt = tool_input.get("prompt", "")
                                elif isinstance(tool_input, str):
                                    try:
                                        import json
                                        # Clean up the input string
                                        clean_input = tool_input.strip()
                                        if clean_input.startswith('{') and clean_input.endswith('}'):
                                            parsed = json.loads(clean_input)
                                            if isinstance(parsed, dict):
                                                analysis_prompt = parsed.get("prompt", "")
                                        else:
                                            analysis_prompt = tool_input
                                    except:
                                        analysis_prompt = tool_input if len(tool_input) < 200 else ""
                                
                                # Only add thinking step if we have a meaningful prompt
                                if analysis_prompt and len(analysis_prompt) > 10 and not analysis_prompt.startswith('{'):
                                    thinking_step = {
                                        'id': f'step-thinking-{len([s for s in session["steps"] if s.get("icon") == "brain"]) + 1}',
                                        'title': '🧠 Deep Analysis',
                                        'description': f'Analyzing: "{analysis_prompt[:100]}..."' if len(analysis_prompt) > 100 else f'Analyzing: "{analysis_prompt}"',
                                        'status': 'active',
                                        'icon': 'brain'
                                    }
                                    session['steps'].append(thinking_step)
                                    session['progress'] = min(session['progress'] + 5, 85)
                                    
                                    # Add thought for deep analysis starting
                                    thoughts_buffer.append({
                                        'type': 'analyzing',
                                        'content': f'🧠 [Deep Agent] Starting analysis: {analysis_prompt[:200]}',
                                        'timestamp': datetime.now().isoformat()
                                    })
                                    session['thoughts'] = thoughts_buffer[-20:]
                            
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
                                    
                                    # Add search thought
                                    thoughts_buffer.append({
                                        'type': 'searching',
                                        'content': f'🔍 [Search #{search_count}] {str(query_used)}',
                                        'timestamp': datetime.now().isoformat()
                                    })
                                    session['thoughts'] = thoughts_buffer[-20:]
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
                    
                    # Handle tool completion events
                    elif "tool_result" in event:
                        tool_result = event["tool_result"]
                        if isinstance(tool_result, dict):
                            tool_name = tool_result.get("tool_name", "")
                            if tool_name == "use_llm_fixed":
                                # Mark the corresponding thinking step as completed
                                for step in session['steps']:
                                    if step.get('icon') == 'brain' and step['status'] == 'active':
                                        step['status'] = 'completed'
                                        break
                                
                                # Add completion thought
                                thoughts_buffer.append({
                                    'type': 'synthesizing',
                                    'content': '✅ [Deep Agent] Analysis complete - insights ready',
                                    'timestamp': datetime.now().isoformat()
                                })
                                session['thoughts'] = thoughts_buffer[-20:]
                            
                            elif tool_name == "tavily_search":
                                # Add search completion thought
                                thoughts_buffer.append({
                                    'type': 'searching',
                                    'content': f'✅ [Search] Results received, processing...',
                                    'timestamp': datetime.now().isoformat()
                                })
                                session['thoughts'] = thoughts_buffer[-20:]
                    
                    # Handle completion
                    elif "complete" in event:
                        logger.info(f"Research stream completed")
                        
                        # Mark all remaining thinking steps as completed
                        for step in session['steps']:
                            if step.get('icon') == 'brain' and step['status'] == 'active':
                                step['status'] = 'completed'
                    
            except Exception as e:
                logger.error(f"Error during research stream: {e}")
                raise
            
            # After research completes, get ALL search results for sources
            search_results = get_all_search_results()
            
            # Process search results into sources (deduplicate by URL)
            seen_urls = set()
            source_idx = 1
            for result in search_results[:40]:  # Get up to 40 sources for comprehensive research
                if result and isinstance(result, dict):
                    url = result.get('url', '')
                    if url and url not in seen_urls:
                        seen_urls.add(url)
                        source = {
                            'id': f'source-{source_idx}',
                            'number': source_idx,  # Add explicit number for citation matching
                            'title': result.get('title', 'Untitled'),
                            'url': url,
                            'domain': extract_domain(url),
                            'snippet': result.get('content', '')[:200] + '...' if result.get('content') else '',
                            'favicon': f"https://www.google.com/s2/favicons?domain={extract_domain(url)}&sz=64",
                            'thumbnail': f"https://picsum.photos/seed/{source_idx}/400/300",  # Use reliable placeholder
                            'score': result.get('score', 0),
                            'content': result.get('content', '')  # Keep full content for agent reference
                        }
                        sources_found.append(source)
                        source_idx += 1
            
            # Log sources for debugging
            logger.info(f"Collected {len(sources_found)} sources for research")
            for idx, source in enumerate(sources_found[:10], 1):
                logger.debug(f"Source [{idx}]: {source['title']} - {source['url']}")
            
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
    
    # Run the research in a separate thread to avoid event loop conflicts
    thread = threading.Thread(target=_run_research)
    thread.start()

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
        'thoughts': [],  # Initialize thoughts array
        'timestamp': datetime.now().isoformat(),
        'error': None,
        'requires_approval': False,
        'approval_message': None
    }
    
    # Start research in a thread (not using background_tasks to avoid event loop issues)
    perform_strands_research(session_id, request.query, request.require_approval)
    
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
        thoughts=session.get('thoughts', []),
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
        
        # Restart research with enhanced query (directly, not using background_tasks)
        perform_strands_research(session_id, enhanced_query, False)  # Don't ask for approval again
        
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