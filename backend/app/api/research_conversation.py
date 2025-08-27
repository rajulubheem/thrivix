"""
Research API with Conversation Support using Strands Session Management
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
from strands.session.file_session_manager import FileSessionManager
from strands.agent.conversation_manager import SlidingWindowConversationManager
from app.tools.tavily_search_tool import tavily_search, get_all_search_results, clear_search_results
from app.tools.use_llm_wrapper import use_llm_fixed
from app.tools.simple_browser_tool import (
    browse_and_capture, browse_multiple_sites, 
    get_captured_screenshots, clear_screenshots
)
from app.tools.animated_browser import (
    capture_scrolling_preview, quick_visual_scan,
    get_animated_previews, clear_animated_cache
)
# Keep smart browser as fallback
try:
    from app.tools.smart_browser_tool import (
        start_browser_session, navigate_to_url, scroll_page, 
        search_on_page, click_element, get_browsing_summary, 
        close_browser_session, get_current_screenshots
    )
except:
    pass
from strands_tools import handoff_to_user
import os
import json
import threading
from pathlib import Path

router = APIRouter(prefix="/conversation", tags=["research-conversation"])
logger = logging.getLogger(__name__)

# Store active conversation sessions
conversation_sessions: Dict[str, Dict[str, Any]] = {}

# Directory for storing session data
SESSIONS_DIR = Path("./research_sessions")
SESSIONS_DIR.mkdir(exist_ok=True)

class ConversationStartRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    mode: str = "fast"  # "fast", "deep", or "scholar"

class ConversationContinueRequest(BaseModel):
    message: str
    session_id: str
    feedback: Optional[str] = None
    mode: Optional[str] = "fast"  # "fast", "deep", or "scholar"

class ConversationStatusResponse(BaseModel):
    session_id: str
    status: str
    messages: List[Dict[str, Any]] = []
    sources: List[Dict[str, Any]] = []
    thoughts: List[Dict[str, Any]] = []
    screenshots: List[Dict[str, Any]] = []  # Add screenshots field
    timestamp: str
    error: Optional[str] = None
    conversation_count: int = 0
    awaiting_response: Optional[bool] = False

def perform_conversation_research(session_id: str, message: str, is_continuation: bool = False, mode: str = "fast"):
    """
    Perform research with conversation context using Strands Session Management
    Mode can be: "fast", "deep", or "scholar"
    """
    # Store message in outer scope for nested functions
    user_message = message
    
    def _run_conversation():
        # Create a new event loop for this thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            logger.info(f"Thread started for session {session_id}")
            # Run the async function in the new loop
            loop.run_until_complete(_async_conversation_impl())
            logger.info(f"Thread completed for session {session_id}")
        except Exception as e:
            logger.error(f"Thread error for session {session_id}: {e}")
            import traceback
            logger.error(traceback.format_exc())
        finally:
            loop.close()
    
    async def _async_conversation_impl():
        session = conversation_sessions[session_id]
        
        try:
            session['status'] = 'running'
            
            # Clear previous search results if starting new research
            if not is_continuation:
                clear_search_results()
            
            # Track thoughts and content
            thoughts_buffer = []
            
            # Get mode from session context or default
            session_mode = session.get('context', {}).get('mode', mode) if session else mode
            
            # Set up tools based on mode
            if session_mode == "fast":
                # Fast mode: Basic search only for quick responses
                tools = [
                    tavily_search,
                    handoff_to_user
                ]
                model_params = {
                    "max_tokens": 2000,
                    "temperature": 0.5,  # More focused responses
                }
                model_id = "gpt-4o-mini"
            elif session_mode == "deep":
                # Deep mode: All tools including browser and deep analysis
                tools = [
                    tavily_search, 
                    use_llm_fixed,  # For deep analysis
                    browse_and_capture,  # Simple reliable browsing
                    browse_multiple_sites,  # Browse multiple sites at once
                    capture_scrolling_preview,  # Animated GIF preview
                    quick_visual_scan,  # Quick multi-site scan
                    handoff_to_user
                ]
                model_params = {
                    "max_tokens": 6000,  # More tokens for comprehensive analysis
                    "temperature": 0.7,
                }
                model_id = "gpt-4o"  # Use better model for deep research
            else:  # scholar mode
                # Scholar mode: Research tools with academic focus
                tools = [
                    tavily_search,
                    use_llm_fixed,  # For academic analysis
                    browse_and_capture,
                    handoff_to_user
                ]
                model_params = {
                    "max_tokens": 4000,
                    "temperature": 0.6,  # Balanced for academic writing
                }
                model_id = "gpt-4o-mini"
            
            # Create OpenAI model configuration
            openai_model = OpenAIModel(
                client_args={
                    "api_key": os.getenv("OPENAI_API_KEY"),
                },
                model_id=model_id,
                params=model_params
            )
            
            # System prompt for conversation-aware research with proper context
            from datetime import datetime
            current_date = datetime.now().strftime("%Y-%m-%d")
            current_time = datetime.now().strftime("%H:%M %Z")
            
            # Adjust system prompt based on mode
            if session_mode == "fast":
                mode_description = """You are a quick-response assistant providing concise, accurate answers.
Focus on delivering the most relevant information quickly without excessive detail.
Aim for clear, direct responses that address the user's immediate needs."""
            elif session_mode == "deep":
                mode_description = """You are a comprehensive research analyst providing in-depth analysis.
Use multiple searches, analyze thoroughly, and use the use_llm tool for deeper insights.
Take screenshots of important websites and provide detailed, multi-faceted responses.
Structure your response with clear sections and comprehensive coverage of the topic."""
            else:  # scholar mode
                mode_description = """You are an academic research assistant providing scholarly analysis.
Focus on authoritative sources, cite all references properly, and maintain academic rigor.
Use formal language, provide critical analysis, and explore multiple perspectives.
Include proper citations in academic format [Author, Year] style."""
            
            system_prompt = f"""You are an expert research assistant with conversation memory and web search capabilities.

MODE: {session_mode.upper()} RESEARCH
{mode_description}

CURRENT CONTEXT:
- Today's date: {current_date}
- Current time: {current_time}
- Mode: {session_mode}
- You have access to web search and browser tools for real-time information

IMPORTANT: For ambiguous queries, use handoff_to_user ONCE to ask for clarification. Never call it multiple times.

When to ask for clarification (use handoff_to_user ONCE):
1. Single word queries that could have multiple meanings (e.g., "Apple", "Python", "Java", "Mercury", "Tesla")
2. Vague requests (e.g., "tell me about", "explain", "what is" without clear context)  
3. Queries that could refer to different domains (technology vs nature, person vs place vs thing)
4. Requests missing key details (e.g., "best framework" - for what? "latest news" - about what?)

HANDOFF EXAMPLES - Call handoff_to_user ONLY ONCE for queries like:
- "Apple" → Ask: "Are you asking about Apple Inc. (technology company), apple fruit, or something else?"
- "Python" → Ask: "Are you interested in Python programming language or python snakes?"
- "Best practices" → Ask: "Best practices for what specific area or technology?"
- "Tell me about quantum" → Ask: "Are you interested in quantum physics, quantum computing, or quantum mechanics?"

AFTER CLARIFICATION OR IF QUERY IS CLEAR:
1. Use tavily_search (2-3 searches) to find relevant URLs and comprehensive information
When using any search tool, always include date context if the user asks for "latest", "recent", "current", or specifies a date
2. Analyze and synthesize information from search results thoroughly
3. If user mentions specific sites or asks to see websites, use browser tools:
   - browse_and_capture(url) for single sites
   - browse_multiple_sites([urls]) for multiple sites
4. Focus on providing detailed, thoughtful answers based on search results
5. Include relevant quotes and insights from sources
6. Cite sources with [1], [2], etc.

When the user continues a conversation:
1. Reference previous topics naturally
2. Build upon earlier research findings with NEW searches
3. Provide new insights while maintaining context
4. Use phrases like "As we discussed...", "Building on our earlier research...", "To add to what we found..."

For follow-up questions:
- Acknowledge the connection to previous topics
- Perform NEW searches for deeper analysis or new angles
- Suggest related areas to explore

For feedback:
- Thank the user for their input
- Incorporate their feedback into your understanding
- Adjust your approach based on their preferences

CRITICAL: 
- NEVER provide information without searching first
- Use tavily_search (2-3 searches) to find URLs
- Use smart browser tools for detailed exploration:
  * Start session → Navigate → Scroll → Search → Click → Summary → Close
- Each action captures a screenshot visible to users
- Narrate what you're doing: "Now I'm scrolling down to find..."
- Focus on OCR text from screenshots
- ALWAYS cite sources with [1], [2] format
- Close browser session when done"""

            # Always use FileSessionManager for persistence across server restarts
            # Create session manager with unique session ID
            session_manager = FileSessionManager(
                session_id=session_id,
                storage_dir="./research_sessions"  # Store sessions locally
            )
            
            # Create conversation manager to handle context
            conversation_manager = SlidingWindowConversationManager(
                window_size=50,  # Keep last 50 messages
                should_truncate_results=True
            )
            
            # Create agent with proper session management
            # The FileSessionManager will automatically restore previous conversation
            research_agent = Agent(
                model=openai_model,
                tools=tools,
                system_prompt=system_prompt,
                session_manager=session_manager,  # Use Strands' session management
                conversation_manager=conversation_manager  # Use Strands' conversation management
            )
            
            # The agent will automatically restore its state from the session if it exists
            logger.info(f"Created agent with FileSessionManager for session {session_id}, continuation={is_continuation}")
            logger.info(f"Agent has {len(research_agent.messages)} existing messages")
            
            # Store agent reference (but it's not needed for persistence)
            conversation_sessions[session_id]['agent'] = research_agent
            
            # Track conversation count
            session['conversation_count'] = len(research_agent.messages) // 2  # Rough estimate of turns
            
            # Add initial thought tracking with more detail
            thoughts_buffer.append({
                'type': 'planning',
                'content': f'🎯 {"Continuing" if is_continuation else "Starting"} conversation: "{user_message[:100]}..."',
                'timestamp': datetime.now().isoformat()
            })
            
            # Add planning stage thought
            thoughts_buffer.append({
                'type': 'planning',
                'content': '📋 Analyzing request and planning approach...',
                'timestamp': datetime.now().isoformat()
            })
            
            # Add context awareness for continuations
            if is_continuation and len(research_agent.messages) > 0:
                thoughts_buffer.append({
                    'type': 'referencing',
                    'content': f'🔄 Using context from {len(research_agent.messages)} previous messages',
                    'timestamp': datetime.now().isoformat()
                })
            
            session['thoughts'] = thoughts_buffer
            
            # Execute conversation using stream_async for real-time updates
            response_text = ""
            current_thought = ""
            sources_found = []
            last_tool_name = ""
            assistant_response = ""  # Initialize assistant response
            
            # Track the user message in session immediately
            # For continuations, preserve existing messages
            if is_continuation and 'messages' in session:
                # Keep existing messages and add new user message
                session['messages'].append({
                    'role': 'user',
                    'content': user_message,
                    'timestamp': datetime.now().isoformat()
                })
            else:
                # New conversation - start fresh
                session['messages'] = []
                session['messages'].append({
                    'role': 'user',
                    'content': user_message,
                    'timestamp': datetime.now().isoformat()
                })
            
            logger.info(f"Starting agent stream for message: {user_message[:100]}...")
            
            # Add thinking thought before streaming
            thoughts_buffer.append({
                'type': 'analyzing',
                'content': '🧠 Processing request with AI agent...',
                'timestamp': datetime.now().isoformat()
            })
            session['thoughts'] = thoughts_buffer
            
            # Track assistant response as it builds
            assistant_response = ""
            
            async for event in research_agent.stream_async(user_message):
                # Handle text generation
                if "data" in event:
                    text_chunk = event["data"]
                    response_text += text_chunk
                    current_thought += text_chunk
                    assistant_response += text_chunk
                    
                    # Update the assistant message in real-time
                    # Check if we need to add a new assistant message
                    if len(session['messages']) == 0 or session['messages'][-1]['role'] != 'assistant':
                        session['messages'].append({
                            'role': 'assistant',
                            'content': assistant_response,
                            'timestamp': datetime.now().isoformat()
                        })
                    else:
                        # Update existing assistant message
                        session['messages'][-1]['content'] = assistant_response
                    
                    # Detect thought completion
                    if any(punct in text_chunk for punct in ['. ', '.\n', '! ', '?\n']):
                        if current_thought.strip():
                            # Determine thought type
                            thought_type = 'general'
                            if any(kw in current_thought.lower() for kw in ['searching', 'looking for']):
                                thought_type = 'searching'
                            elif any(kw in current_thought.lower() for kw in ['analyzing', 'examining']):
                                thought_type = 'analyzing'
                            elif any(kw in current_thought.lower() for kw in ['as we discussed', 'earlier']):
                                thought_type = 'referencing'
                            
                            thoughts_buffer.append({
                                'type': thought_type,
                                'content': current_thought.strip(),
                                'timestamp': datetime.now().isoformat()
                            })
                            session['thoughts'] = thoughts_buffer[-20:]  # Keep last 20 thoughts
                            current_thought = ""
                
                # Handle tool results for screenshots
                elif "tool_result" in event:
                    tool_result = event.get("tool_result", {})
                    
                    # Check for browser tool results and get screenshots immediately
                    if last_tool_name in ["browse_and_capture", "browse_multiple_sites", "capture_scrolling_preview", "quick_visual_scan"]:
                        # Get screenshots from simple browser tool
                        browser_screenshots = []
                        
                        try:
                            simple_screenshots = get_captured_screenshots()
                            if simple_screenshots:
                                browser_screenshots.extend(simple_screenshots)
                        except:
                            pass
                        
                        try:
                            animated_previews = get_animated_previews()
                            if animated_previews:
                                browser_screenshots.extend(animated_previews)
                        except:
                            pass
                        
                        if browser_screenshots:
                            if 'screenshots' not in session:
                                session['screenshots'] = []
                            
                            # Only add new screenshots (not already in session)
                            existing_timestamps = {s.get('timestamp') for s in session['screenshots']}
                            for screenshot in browser_screenshots:
                                if screenshot.get('timestamp') not in existing_timestamps:
                                    # Add thought about what we're seeing
                                    thoughts_buffer.append({
                                        'type': 'visual_analysis',
                                        'content': f"📸 Captured: {screenshot.get('description', 'webpage view')}",
                                        'timestamp': datetime.now().isoformat()
                                    })
                                    
                                    # Add screenshot to session
                                    session['screenshots'].append({
                                        'url': screenshot.get('url', ''),
                                        'description': screenshot.get('description', ''),
                                        'data': screenshot.get('data', ''),  # base64 image
                                        'type': 'screenshot',
                                        'timestamp': screenshot.get('timestamp', datetime.now().isoformat())
                                    })
                            
                            session['thoughts'] = thoughts_buffer[-20:]
                    
                    # Check for smart browser tool results and get screenshots
                    elif last_tool_name in ["navigate_to_url", "scroll_page", "search_on_page", "click_element"]:
                        # Get screenshots from smart browser session
                        browser_screenshots = get_current_screenshots()
                        if browser_screenshots:
                            if 'screenshots' not in session:
                                session['screenshots'] = []
                            
                            # Only add new screenshots (not already in session)
                            existing_timestamps = {s.get('timestamp') for s in session['screenshots']}
                            for screenshot in browser_screenshots:
                                if screenshot.get('timestamp') not in existing_timestamps:
                                    # Add thought about what we're seeing
                                    thoughts_buffer.append({
                                        'type': 'visual_analysis',
                                        'content': f"📸 Captured: {screenshot.get('description', 'webpage view')}",
                                        'timestamp': datetime.now().isoformat()
                                    })
                                    
                                    # Add screenshot to session
                                    session['screenshots'].append({
                                        'url': screenshot.get('url', ''),
                                        'description': screenshot.get('description', ''),
                                        'data': screenshot.get('data', ''),  # base64 image
                                        'type': 'screenshot',
                                        'timestamp': screenshot.get('timestamp', datetime.now().isoformat())
                                    })
                            
                            session['thoughts'] = thoughts_buffer[-20:]
                    
                    elif isinstance(tool_result, dict):
                        # Check if this is a browse_webpage result with screenshots
                        if "screenshot_data" in tool_result:
                            screenshots_from_tool = tool_result.get("screenshot_data", [])
                            if screenshots_from_tool and 'screenshots' not in session:
                                session['screenshots'] = []
                            
                            for screenshot in screenshots_from_tool:
                                # Add thought about what we're seeing
                                thoughts_buffer.append({
                                    'type': 'visual_analysis',
                                    'content': f"📸 Captured: {screenshot.get('description', 'webpage view')}",
                                    'timestamp': datetime.now().isoformat()
                                })
                                
                                # Add screenshot to session
                                session['screenshots'].append({
                                    'url': session.get('current_browsing_url', ''),
                                    'description': screenshot.get('description', ''),
                                    'data': screenshot.get('data', ''),  # base64 image
                                    'type': screenshot.get('type', 'screenshot'),
                                    'timestamp': datetime.now().isoformat()
                                })
                            
                            session['thoughts'] = thoughts_buffer[-20:]
                
                # Handle tool usage
                elif "current_tool_use" in event:
                    tool_info = event["current_tool_use"]
                    if isinstance(tool_info, dict):
                        tool_name = tool_info.get("name", "")
                        last_tool_name = tool_name  # Store for use in tool_result event
                        
                        if tool_name == "handoff_to_user":
                            # Only process if not already awaiting response
                            if not session.get('awaiting_response', False):
                                # Add tool usage thought ONLY for the first handoff
                                thoughts_buffer.append({
                                    'type': 'evaluating',
                                    'content': f'🔧 Using tool: {tool_name}',
                                    'timestamp': datetime.now().isoformat()
                                })
                                session['thoughts'] = thoughts_buffer[-20:]
                                # Handle human-in-the-loop interaction
                                tool_input = tool_info.get("input", {})
                                handoff_message = ""
                                if isinstance(tool_input, dict):
                                    handoff_message = tool_input.get("message", "")
                                elif isinstance(tool_input, str):
                                    try:
                                        import json
                                        parsed = json.loads(tool_input)
                                        handoff_message = parsed.get("message", tool_input) if isinstance(parsed, dict) else tool_input
                                    except:
                                        handoff_message = tool_input
                                
                                # Only process if we have a meaningful message
                                if handoff_message and not handoff_message.startswith('{"'):
                                    # Mark session as awaiting response IMMEDIATELY
                                    session['status'] = 'waiting_for_clarification'
                                    session['awaiting_response'] = True
                                    session['clarification_message'] = handoff_message
                                    
                                    thoughts_buffer.append({
                                        'type': 'coordinating',
                                        'content': f'🤝 Asking for clarification',
                                        'timestamp': datetime.now().isoformat()
                                    })
                                    session['thoughts'] = thoughts_buffer[-20:]
                                    
                                    # Pause for user input
                                    logger.info(f"Waiting for user clarification: {handoff_message}")
                                    
                                    # Exit the function completely to wait for user response
                                    return  # Exit the entire function to wait for user response
                        
                        else:
                            # For non-handoff tools, always record
                            thoughts_buffer.append({
                                'type': 'evaluating',
                                'content': f'🔧 Using tool: {tool_name}',
                                'timestamp': datetime.now().isoformat()
                            })
                            session['thoughts'] = thoughts_buffer[-20:]
                        
                        if tool_name == "tavily_search":
                            tool_input = tool_info.get("input", {})
                            query_used = None
                            if isinstance(tool_input, dict):
                                query_used = tool_input.get("query", "")
                            
                            if query_used:
                                thoughts_buffer.append({
                                    'type': 'searching',
                                    'content': f'🔍 Web search: "{query_used}"',
                                    'timestamp': datetime.now().isoformat()
                                })
                                thoughts_buffer.append({
                                    'type': 'searching',
                                    'content': '⏳ Fetching results from multiple sources...',
                                    'timestamp': datetime.now().isoformat()
                                })
                                session['current_search_query'] = query_used
                                session['thoughts'] = thoughts_buffer[-20:]
                        
                        elif tool_name == "use_llm_fixed":
                            thoughts_buffer.append({
                                'type': 'analyzing',
                                'content': '🧠 Performing deep analysis...',
                                'timestamp': datetime.now().isoformat()
                            })
                            session['thoughts'] = thoughts_buffer[-20:]
                        
                        elif tool_name in ["start_browser_session", "navigate_to_url", "scroll_page", 
                                         "search_on_page", "click_element", "close_browser_session"]:
                            # Track browser actions
                            action_descriptions = {
                                "start_browser_session": "🌐 Starting browser session",
                                "navigate_to_url": "🔗 Navigating to webpage",
                                "scroll_page": "📜 Scrolling to see more content",
                                "search_on_page": "🔍 Searching on the page",
                                "click_element": "👆 Clicking on element",
                                "close_browser_session": "🔚 Closing browser"
                            }
                            
                            thoughts_buffer.append({
                                'type': 'browsing',
                                'content': action_descriptions.get(tool_name, f"Browser action: {tool_name}"),
                                'timestamp': datetime.now().isoformat()
                            })
                            session['thoughts'] = thoughts_buffer[-20:]
                        
                        elif tool_name == "browse_webpage":
                            tool_input = tool_info.get("input", {})
                            url_browsing = None
                            if isinstance(tool_input, dict):
                                url_browsing = tool_input.get("url", "")
                            
                            if url_browsing:
                                thoughts_buffer.append({
                                    'type': 'browsing',
                                    'content': f'🌐 Opening browser: {url_browsing}',
                                    'timestamp': datetime.now().isoformat()
                                })
                                thoughts_buffer.append({
                                    'type': 'browsing',
                                    'content': '📸 Capturing page content and screenshots...',
                                    'timestamp': datetime.now().isoformat()
                                })
                                session['thoughts'] = thoughts_buffer[-20:]
                                
                                # Note: Screenshots will be captured from tool results
                                session['current_browsing_url'] = url_browsing
                        
                        elif tool_name == "close_browser_session":
                            # Capture screenshots before closing browser
                            browser_screenshots = get_current_screenshots()
                            if browser_screenshots:
                                if 'screenshots' not in session:
                                    session['screenshots'] = []
                                for screenshot in browser_screenshots:
                                    if not any(s.get('timestamp') == screenshot.get('timestamp') for s in session['screenshots']):
                                        session['screenshots'].append({
                                            'url': screenshot.get('url', ''),
                                            'description': screenshot.get('description', ''),
                                            'data': screenshot.get('data', ''),
                                            'type': 'screenshot',  # Add type field
                                            'ocr_text': screenshot.get('ocr_text', ''),
                                            'timestamp': screenshot.get('timestamp', datetime.now().isoformat())
                                        })
                            
                            thoughts_buffer.append({
                                'type': 'cleanup',
                                'content': '🔚 Closing browser window',
                                'timestamp': datetime.now().isoformat()
                            })
                            session['thoughts'] = thoughts_buffer[-20:]
                        
                        elif tool_name in ["browse_and_capture", "browse_multiple_sites"]:
                            # Simple browser tool actions
                            tool_input = tool_info.get("input", {})
                            url_info = None
                            if isinstance(tool_input, dict):
                                url_info = tool_input.get("url", "") or tool_input.get("urls", [])
                            
                            if url_info:
                                if isinstance(url_info, list):
                                    thoughts_buffer.append({
                                        'type': 'browsing',
                                        'content': f'📸 Preparing to capture {len(url_info)} websites',
                                        'timestamp': datetime.now().isoformat()
                                    })
                                    for idx, url in enumerate(url_info[:5], 1):
                                        thoughts_buffer.append({
                                            'type': 'browsing',
                                            'content': f'  {idx}. Opening: {url}',
                                            'timestamp': datetime.now().isoformat()
                                        })
                                else:
                                    thoughts_buffer.append({
                                        'type': 'browsing',
                                        'content': f'📸 Opening browser for: {url_info}',
                                        'timestamp': datetime.now().isoformat()
                                    })
                                    thoughts_buffer.append({
                                        'type': 'browsing',
                                        'content': '⏳ Waiting for page to load completely...',
                                        'timestamp': datetime.now().isoformat()
                                    })
                                
                                session['thoughts'] = thoughts_buffer[-20:]
                        
                        elif tool_name in ["capture_scrolling_preview", "quick_visual_scan"]:
                            # Animated browser tool actions
                            thoughts_buffer.append({
                                'type': 'browsing',
                                'content': f'🎬 Creating animated preview with {tool_name}',
                                'timestamp': datetime.now().isoformat()
                            })
                            session['thoughts'] = thoughts_buffer[-20:]
                        
                        elif tool_name == "close_browser_session":
                            thoughts_buffer.append({
                                'type': 'cleanup',
                                'content': '🔚 Closing browser window',
                                'timestamp': datetime.now().isoformat()
                            })
                            session['thoughts'] = thoughts_buffer[-20:]
            
            # Final check for any remaining screenshots that weren't captured during streaming
            browser_screenshots = []
            
            # Try simple browser tool first
            try:
                simple_screenshots = get_captured_screenshots()
                if simple_screenshots:
                    browser_screenshots.extend(simple_screenshots)
            except:
                pass
            
            # Get animated previews
            try:
                animated_previews = get_animated_previews()
                if animated_previews:
                    browser_screenshots.extend(animated_previews)
            except:
                pass
            
            # Try smart browser tool as fallback
            try:
                smart_screenshots = get_current_screenshots()
                if smart_screenshots:
                    browser_screenshots.extend(smart_screenshots)
            except:
                pass
            
            if browser_screenshots:
                if 'screenshots' not in session:
                    session['screenshots'] = []
                    
                # Only add new screenshots not already captured
                existing_timestamps = {s.get('timestamp') for s in session['screenshots']}
                for screenshot in browser_screenshots:
                    if screenshot.get('timestamp') not in existing_timestamps:
                        session['screenshots'].append({
                            'url': screenshot.get('url', ''),
                            'description': screenshot.get('description', ''),
                            'data': screenshot.get('data', ''),
                            'type': 'screenshot',  # Add type field
                            'ocr_text': screenshot.get('ocr_text', ''),
                            'timestamp': screenshot.get('timestamp', datetime.now().isoformat())
                        })
                    
            # Cleanup browser sessions AFTER we've collected all screenshots
            # Only clear at the very end to ensure we don't lose any data
            try:
                # Clear simple browser screenshots for next session
                clear_screenshots()
                logger.info("Cleared screenshot cache")
            except:
                pass
            
            try:
                # Clear animated previews cache
                clear_animated_cache()
                logger.info("Cleared animated preview cache")
            except:
                pass
                
            try:
                # Force close smart browser if it was used
                from app.tools.smart_browser_tool import close_browser_session as force_close_browser
                force_close_browser()
                logger.info("Force closed browser session at end of conversation")
            except Exception as e:
                pass
            
            # Get search results if any searches were performed
            search_results = get_all_search_results()
            if search_results:
                seen_urls = set()
                source_idx = 1
                for result in search_results[:20]:
                    if result and isinstance(result, dict):
                        url = result.get('url', '')
                        if url and url not in seen_urls:
                            seen_urls.add(url)
                            domain = extract_domain(url)
                            sources_found.append({
                                'id': f'source-{source_idx}',
                                'number': source_idx,
                                'title': result.get('title', 'Untitled'),
                                'url': url,
                                'domain': domain,
                                'snippet': result.get('content', '')[:200] + '...' if result.get('content') else '',
                                'favicon': f'https://www.google.com/s2/favicons?domain={domain}&sz=64',
                                'thumbnail': f'https://api.microlink.io/?url={url}&screenshot=true&meta=false&embed=screenshot.url'
                            })
                            source_idx += 1
            
            # Final update of session
            # Messages have already been built during streaming
            # Just ensure the final assistant message is complete
            if len(session['messages']) > 1:
                session['messages'][-1]['content'] = assistant_response
            
            session['sources'] = sources_found
            
            # Only mark as completed if we're not waiting for clarification
            if not session.get('awaiting_response', False):
                session['status'] = 'completed'
            # Otherwise status is already 'waiting_for_clarification'
            
            session['conversation_count'] = len(research_agent.messages) // 2
            
            # Add completion thoughts
            thoughts_buffer.append({
                'type': 'synthesizing',
                'content': '📝 Compiling findings and evidence...',
                'timestamp': datetime.now().isoformat()
            })
            thoughts_buffer.append({
                'type': 'synthesizing',
                'content': f'✅ Response ready with {len(sources_found)} sources and {len(session.get("screenshots", []))} screenshots',
                'timestamp': datetime.now().isoformat()
            })
            session['thoughts'] = thoughts_buffer[-20:]
            
        except Exception as e:
            import traceback
            error_msg = f"Conversation error: {e}\n{traceback.format_exc()}"
            logger.error(error_msg)
            session['status'] = 'error'
            session['error'] = str(e)
            # Also add to thoughts so user can see something went wrong
            thoughts_buffer.append({
                'type': 'error',
                'content': f'❌ Error: {str(e)}',
                'timestamp': datetime.now().isoformat()
            })
            session['thoughts'] = thoughts_buffer[-20:]
    
    # Run the conversation in a separate thread to avoid event loop conflicts
    thread = threading.Thread(target=_run_conversation)
    thread.start()

def get_message_text(msg) -> str:
    """Extract text content from a message"""
    try:
        # Handle different message formats
        if isinstance(msg, dict):
            # Handle dict format
            content = msg.get('content', '')
            if isinstance(content, str):
                return content
            elif isinstance(content, list):
                # Handle content blocks
                text_parts = []
                for block in content:
                    if isinstance(block, dict):
                        if 'text' in block:
                            text_parts.append(block['text'])
                        elif 'content' in block:
                            text_parts.append(str(block['content']))
                    elif hasattr(block, 'text'):
                        text_parts.append(block.text)
                    elif hasattr(block, 'content'):
                        text_parts.append(str(block.content))
                return ' '.join(text_parts)
            return str(content)
        elif hasattr(msg, 'content'):
            if isinstance(msg.content, str):
                return msg.content
            elif isinstance(msg.content, list):
                # Handle content blocks
                text_parts = []
                for block in msg.content:
                    if hasattr(block, 'text'):
                        text_parts.append(block.text)
                    elif isinstance(block, dict) and 'text' in block:
                        text_parts.append(block['text'])
                    elif hasattr(block, 'content'):
                        text_parts.append(str(block.content))
                return ' '.join(text_parts)
            else:
                return str(msg.content)
        return str(msg)
    except Exception as e:
        logger.warning(f"Error extracting message text: {e}")
        return str(msg)

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

@router.post("/start")
async def start_conversation(request: ConversationStartRequest, background_tasks: BackgroundTasks):
    """Start a new conversation session or continue an existing one"""
    session_id = request.session_id or str(uuid.uuid4())
    
    # Check if continuing existing session
    is_continuation = session_id in conversation_sessions
    
    if not is_continuation:
        # Initialize new session - always start fresh with context
        conversation_sessions[session_id] = {
            'session_id': session_id,
            'status': 'initializing',
            'messages': [],
            'sources': [],
            'thoughts': [],
            'screenshots': [],  # Add screenshots list
            'timestamp': datetime.now().isoformat(),
            'error': None,
            'conversation_count': 0,
            'context': {
                'date': datetime.now().strftime("%Y-%m-%d"),
                'time': datetime.now().strftime("%H:%M %Z"),
                'initial_query': request.message,
                'mode': request.mode
            }
        }
        # Remove any cached agent to ensure fresh start
        if 'agent' in conversation_sessions.get(session_id, {}):
            del conversation_sessions[session_id]['agent']
    else:
        # For continuation, keep messages but clear temporary fields
        if session_id in conversation_sessions:
            conversation_sessions[session_id]['thoughts'] = []
            conversation_sessions[session_id]['error'] = None
            # Remove agent to force recreation
            if 'agent' in conversation_sessions[session_id]:
                del conversation_sessions[session_id]['agent']
    
    # Start conversation in a thread with mode
    perform_conversation_research(session_id, request.message, is_continuation, request.mode)
    
    logger.info(f"{'Continuing' if is_continuation else 'Started'} conversation {session_id} in {request.mode} mode: {request.message}")
    
    return {
        'session_id': session_id,
        'status': 'started',
        'message': f'Conversation {"continued" if is_continuation else "started"} successfully',
        'is_continuation': is_continuation
    }


@router.post("/continue")
async def continue_conversation(request: ConversationContinueRequest, background_tasks: BackgroundTasks):
    """Continue an existing conversation with a follow-up message"""
    session_id = request.session_id
    
    # Check if session exists in memory, if not try to restore it
    if session_id not in conversation_sessions:
        # Check if session exists on disk (from FileSessionManager)
        session_dir = SESSIONS_DIR / f"session_{session_id}"
        if not session_dir.exists():
            raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
        
        # Restore minimal session data to memory
        conversation_sessions[session_id] = {
            'session_id': session_id,
            'status': 'restored',
            'messages': [],
            'sources': [],
            'thoughts': [],
            'screenshots': [],
            'timestamp': datetime.now().isoformat(),
            'error': None,
            'conversation_count': 0,
            'awaiting_response': False
        }
        logger.info(f"Restored session {session_id} from disk")
    
    # Build message with feedback if provided
    full_message = request.message
    if request.feedback:
        full_message = f"[User Feedback: {request.feedback}]\n{request.message}"
    
    # Check if we're responding to a clarification request
    if conversation_sessions[session_id].get('awaiting_response', False):
        # This is a clarification response, enhance the message to be clear
        clarification_msg = conversation_sessions[session_id].get('clarification_message', '')
        full_message = f"The user has provided clarification to your question '{clarification_msg}'. Their answer is: {request.message}. Now proceed with the research based on this clarification."
        conversation_sessions[session_id]['awaiting_response'] = False
        conversation_sessions[session_id]['clarification_message'] = None
    
    # Make sure the session has completed its previous request
    if conversation_sessions[session_id].get('status') == 'running':
        raise HTTPException(status_code=409, detail="Previous request still processing")
    
    # Clear temporary fields for continuation but KEEP messages and sources
    conversation_sessions[session_id]['thoughts'] = []
    conversation_sessions[session_id]['error'] = None
    conversation_sessions[session_id]['status'] = 'initializing'
    # Keep messages, sources, and screenshots from previous conversation
    
    # Continue conversation with the same or updated mode
    current_mode = conversation_sessions[session_id].get('context', {}).get('mode', 'fast')
    new_mode = request.mode or current_mode
    
    # Update mode in session context if changed
    if 'context' in conversation_sessions[session_id]:
        conversation_sessions[session_id]['context']['mode'] = new_mode
    
    perform_conversation_research(session_id, full_message, is_continuation=True, mode=new_mode)
    
    logger.info(f"Continuing conversation {session_id} in {new_mode} mode with: {full_message}")
    
    return {
        'session_id': session_id,
        'status': 'continued',
        'message': 'Conversation continued successfully'
    }

@router.get("/status/{session_id}")
async def get_conversation_status(session_id: str):
    """Get current status of conversation session"""
    if session_id not in conversation_sessions:
        # Try to check if session exists on disk
        session_path = SESSIONS_DIR / f"session_{session_id}"
        if session_path.exists():
            # Session exists but not loaded
            return ConversationStatusResponse(
                session_id=session_id,
                status='inactive',
                messages=[],
                sources=[],
                thoughts=[],
                timestamp=datetime.now().isoformat(),
                conversation_count=0
            )
        else:
            raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    
    session = conversation_sessions[session_id]
    
    # If waiting for clarification, add the clarification message as an assistant message
    messages = session.get('messages', []).copy()
    if session.get('status') == 'waiting_for_clarification' and session.get('clarification_message'):
        # Check if clarification message is already in messages
        has_clarification = any(
            msg.get('role') == 'assistant' and 
            msg.get('content') == session['clarification_message'] 
            for msg in messages
        )
        
        if not has_clarification:
            messages.append({
                'role': 'assistant',
                'content': session['clarification_message'],
                'timestamp': datetime.now().isoformat()
            })
    
    return ConversationStatusResponse(
        session_id=session_id,
        status=session['status'],
        messages=messages,
        sources=session.get('sources', []),
        thoughts=session.get('thoughts', []),
        screenshots=session.get('screenshots', []),  # Include screenshots
        timestamp=session['timestamp'],
        error=session.get('error'),
        conversation_count=session.get('conversation_count', 0),
        awaiting_response=session.get('awaiting_response', False)
    )

@router.get("/sessions")
async def list_sessions():
    """List all available conversation sessions"""
    active_sessions = []
    
    # Active sessions in memory
    for sid, session in conversation_sessions.items():
        active_sessions.append({
            'session_id': sid,
            'status': session.get('status', 'unknown'),
            'conversation_count': session.get('conversation_count', 0),
            'timestamp': session.get('timestamp', ''),
            'active': True
        })
    
    # Sessions on disk
    for session_dir in SESSIONS_DIR.iterdir():
        if session_dir.is_dir() and session_dir.name.startswith('session_'):
            sid = session_dir.name.replace('session_', '')
            if sid not in conversation_sessions:
                # Session exists on disk but not active
                active_sessions.append({
                    'session_id': sid,
                    'status': 'inactive',
                    'conversation_count': 0,
                    'timestamp': datetime.fromtimestamp(session_dir.stat().st_mtime).isoformat(),
                    'active': False
                })
    
    return {
        'sessions': active_sessions,
        'total': len(active_sessions)
    }

@router.delete("/session/{session_id}")
async def delete_session(session_id: str):
    """Delete a conversation session"""
    # Remove from memory
    if session_id in conversation_sessions:
        del conversation_sessions[session_id]
    
    # Remove from disk
    session_path = SESSIONS_DIR / f"session_{session_id}"
    if session_path.exists():
        import shutil
        shutil.rmtree(session_path)
    
    return {
        'session_id': session_id,
        'status': 'deleted',
        'message': 'Session deleted successfully'
    }

@router.get("/health")
async def health_check():
    """Health check for conversation API"""
    return {
        'status': 'healthy',
        'service': 'research-conversation',
        'active_sessions': len(conversation_sessions),
        'sessions_dir': str(SESSIONS_DIR),
        'api_keys_configured': {
            'openai': bool(os.getenv('OPENAI_API_KEY')),
            'tavily': bool(os.getenv('TAVILY_API_KEY'))
        }
    }