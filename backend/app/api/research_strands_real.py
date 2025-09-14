"""
Research API using Strands Agents with Real Tools - Fixed version
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
import asyncio
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import asyncio
import uuid
import logging
from datetime import datetime
from strands import Agent
from strands.models.openai import OpenAIModel
from app.services.strands_session_service import StrandsSessionService
from strands_tools import handoff_to_user
from app.tools.tavily_search_tool import tavily_search, get_all_search_results, get_last_search_results, clear_search_results
from app.tools.research_planner_tool import research_planner
from app.tools.research_synthesis_tool import research_synthesis
from app.tools.research_verifier_tool import research_verifier
from app.tools.simple_browser_tool import browse_and_capture, browse_multiple_sites, get_captured_screenshots, clear_screenshots
from app.services.shared_state_service import SharedStateService
from app.tools.use_llm_wrapper import use_llm_fixed, use_llm_with_model
import os
import json
import threading
from duckduckgo_search import DDGS

router = APIRouter(prefix="/research", tags=["research-strands-real"])
logger = logging.getLogger(__name__)

# Store active research sessions
research_sessions: Dict[str, Dict[str, Any]] = {}
SESSION_SERVICE = StrandsSessionService()
SHARED_STATE = SharedStateService()

def fallback_search_ddg(query: str, max_results: int = 5):
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
            out = []
            for r in results:
                out.append({
                    'title': r.get('title') or r.get('source') or 'Untitled',
                    'url': r.get('href') or r.get('url') or '',
                    'content': r.get('body') or r.get('snippet') or ''
                })
            return out
    except Exception:
        return []

def _load_optional_strands_tools() -> List:
    """Best-effort import of useful strands_tools for deep research.
    Returns a list of callable tools. Safe no-op if strands_tools not installed.
    """
    tool_names = [
        'http_request',        # Fetch APIs/HTML with headers
        'python_repl',         # Quick data analysis
        'diagram',             # Mermaid diagrams / graphs
        'generate_image',      # Charts/renders when needed
        'image_reader',        # OCR/analysis on images
        'retrieve',            # Retrieval / KB
        'task_planner',        # Explicit plan scaffolding
        'workflow',            # Multi-step orchestration
        'journal',             # Running notes for report
        'file_read', 'file_write', # Artifact IO
        'editor',              # Structured editing
        'calculator',          # Quick math
        'current_time',        # Timestamping
        'environment', 'system_info' # Context
    ]
    loaded = []
    try:
        import importlib
        mod = importlib.import_module('strands_tools')
        for name in tool_names:
            fn = getattr(mod, name, None)
            if callable(fn):
                loaded.append(fn)
    except Exception:
        pass
    return loaded

def _extract_company_ticker_year(query: str) -> Dict[str, Optional[str]]:
    """Lightweight entity extraction: company, ticker, year from the user query.
    Tries LLM JSON output first; falls back to simple heuristics.
    """
    result = {"company": None, "ticker": None, "year": None}
    try:
        sys = (
            "Extract company name, stock ticker (if present), and dominant year from the text. "
            "Output STRICT JSON: {\"company\":string|null, \"ticker\":string|null, \"year\":string|null}. "
            "Ticker should be UPPER CASE letters 1-5, no suffixes."
        )
        raw = use_llm_fixed(prompt=query, system_prompt=sys)
        import json as _json
        data = None
        try:
            data = _json.loads(raw) if isinstance(raw, str) else raw
        except Exception:
            data = None
        if isinstance(data, dict):
            for k in ("company","ticker","year"):
                v = data.get(k)
                if isinstance(v, str) and v.strip():
                    result[k] = v.strip()
    except Exception:
        pass
    # Heuristics fallback
    try:
        import re
        # Ticker in parentheses like Tesla (TSLA) or standalone upper-case token
        m = re.search(r"\(([A-Z]{1,5})\)", query)
        if m and not result["ticker"]:
            result["ticker"] = m.group(1)
        if not result["year"]:
            m2 = re.search(r"\b(20\d{2})\b", query)
            if m2:
                result["year"] = m2.group(1)
        # Company guess: take leading proper noun phrase before '(' or 'stock' words
        if not result["company"]:
            candidate = re.split(r"\(|\bstock\b|\bticker\b|\bshares\b", query, flags=re.I)[0].strip()
            result["company"] = candidate[:80] if candidate else None
    except Exception:
        pass
    return result

def _detect_coverage_gaps(sources: List[Dict[str, Any]]) -> Dict[str, bool]:
    """Detect whether key coverage areas are present in sources by URL/title heuristics."""
    flags = {
        'sec_filings': False,
        'investor_update': False,
        'earnings_release': False,
        'call_transcript': False,
        'analyst_ratings': False,
        'price_targets': False,
        'guidance': False,
        'peer_comparison': False,
        'macro_trends': False,
        'valuation': False,
    }
    for s in sources or []:
        url = (s.get('url') or '').lower()
        title = (s.get('title') or '').lower()
        text = title + ' ' + (s.get('snippet') or '').lower()
        if 'sec.gov' in url or '10-q' in text or '10-k' in text or '8-k' in text:
            flags['sec_filings'] = True
        if 'investor relations' in text or '/ir' in url or '/investor' in url:
            flags['investor_update'] = True
        if 'earnings' in text and ('release' in text or 'results' in text):
            flags['earnings_release'] = True
        if 'transcript' in text or 'earnings call' in text:
            flags['call_transcript'] = True
        if 'analyst' in text and ('ratings' in text or 'recommendations' in text):
            flags['analyst_ratings'] = True
        if 'price target' in text or 'target price' in text:
            flags['price_targets'] = True
        if 'guidance' in text or 'outlook' in text:
            flags['guidance'] = True
        if 'vs.' in text or 'competitor' in text or 'peers' in text:
            flags['peer_comparison'] = True
        if 'market trends' in text or 'macro' in text or 'sector' in text:
            flags['macro_trends'] = True
        if 'p/e' in text or 'valuation' in text or 'multiple' in text:
            flags['valuation'] = True
    return flags

def _build_gap_queries(entity: Dict[str, Optional[str]], gaps: Dict[str, bool]) -> List[str]:
    """Build targeted queries to fill missing coverage areas."""
    company = (entity.get('company') or '').strip()
    ticker = (entity.get('ticker') or '').strip()
    year = (entity.get('year') or '').strip() or str(datetime.now().year)
    tag = f"{company} {ticker}".strip()
    tag = tag if tag else company or ticker or ''
    q = []
    if not tag:
        return q
    if not gaps.get('sec_filings'):
        q.append(f"{tag} site:sec.gov 10-Q {year}")
    if not gaps.get('investor_update'):
        q.append(f"{company} investor relations update {year}")
    if not gaps.get('earnings_release'):
        q.append(f"{tag} earnings release {year}")
    if not gaps.get('call_transcript'):
        q.append(f"{tag} earnings call transcript {year}")
    if not gaps.get('analyst_ratings'):
        q.append(f"{ticker or company} analyst ratings {year}")
    if not gaps.get('price_targets'):
        q.append(f"{ticker or company} price targets {year}")
    if not gaps.get('guidance'):
        q.append(f"{company} guidance {year}")
    if not gaps.get('peer_comparison'):
        q.append(f"{company} competitors peer comparison {year}")
    if not gaps.get('macro_trends'):
        q.append(f"{company} industry macro trends {year}")
    if not gaps.get('valuation'):
        q.append(f"{ticker or company} valuation multiples P/E EV/EBITDA {year}")
    # Deduplicate and cap
    dedup = []
    seen = set()
    for item in q:
        if item not in seen:
            dedup.append(item)
            seen.add(item)
    return dedup[:8]

def _build_domain_angles_queries(entity: Dict[str, Optional[str]]) -> List[str]:
    """Domain-agnostic angles to deepen research when the user intent is broader than financials.
    Covers product/tech, roadmap, supply chain, regulatory, partnerships, market sizing, customers, and risks.
    """
    company = (entity.get('company') or '').strip()
    ticker = (entity.get('ticker') or '').strip()
    year = (entity.get('year') or '').strip() or str(datetime.now().year)
    tag = f"{company} {ticker}".strip() or company or ticker or ''
    if not tag:
        return []
    queries = [
        f"{tag} technology roadmap {year}",
        f"{company or ticker} product pipeline milestones {year}",
        f"{company or ticker} partnerships contracts {year}",
        f"{company or ticker} regulatory approvals compliance {year}",
        f"{company or ticker} supply chain risks suppliers {year}",
        f"{company or ticker} hiring headcount engineering openings {year}",
        f"{company or ticker} patents publications {year}",
        f"{company or ticker} market sizing TAM SAM SOM {year}",
        f"{company or ticker} customer segments use cases {year}",
        f"{company or ticker} unit economics cost structure {year}",
        f"{company or ticker} competitive matrix {year}",
        f"{company or ticker} risks opportunities outlook {year}",
    ]
    # Dedup
    out = []
    seen = set()
    for q in queries:
        if q not in seen:
            out.append(q)
            seen.add(q)
    return out

class ResearchStartRequest(BaseModel):
    query: str
    session_id: Optional[str] = None
    require_approval: Optional[bool] = False
    mode: Optional[str] = 'deep'
    focus: Optional[str] = None
    tone: Optional[str] = None
    model_provider: Optional[str] = None
    model_id: Optional[str] = None

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
        # Capture run-local indices to assemble a per-run trace
        try:
            prev_events_idx = len(session.setdefault('events', []))
            prev_steps_idx = len(session.setdefault('steps', []))
        except Exception:
            prev_events_idx = 0
            prev_steps_idx = 0
        
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
            tools = [tavily_search, research_planner, research_synthesis, research_verifier, use_llm_fixed, browse_and_capture, browse_multiple_sites]
            # Optionally extend with strands_tools (if installed) for richer research/report/visualization
            if os.getenv('RESEARCH_ENABLE_STRANDS_TOOLS', '1') in ('1','true','yes'):
                tools.extend(_load_optional_strands_tools())
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
            total_tool_calls = 0
            rate_limit_hits = 0
            reasoning_steps = []  # Track agent's reasoning process
            processed_tool_ids = set()  # Track which tool uses we've already processed
            thoughts_buffer = []  # Track agent's thoughts and planning
            current_thought = ""  # Current thought being built
            # Buffer streamed tool inputs by toolUseId to avoid acting on partial chunks
            tool_input_buffers: Dict[str, Dict[str, Any]] = {}
            
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
            
            # Structured pipeline switch (aligns with agent loop + agents-as-tools concepts)
            USE_STRUCTURED_PIPELINE = True

            if USE_STRUCTURED_PIPELINE:
                # Create a single session-managed coordinator agent that will be reused
                # across planning, research coordination, and synthesis. This ensures
                # a single conversation log and consistent agent_id (session_id).
                # Stamp current date for recency guidance
                _today = datetime.now().strftime('%Y-%m-%d')
                # Adopt model selection from session (if provided via start/continue)
                sel_provider = (session.get('model_provider') or 'openai').lower()
                sel_model = session.get('model_id') or 'gpt-4o-mini'
                coordinator_agent = SESSION_SERVICE.create_agent_with_session(
                    session_id=session_id,
                    agent_name="coordinator",
                    tools=tools,
                    system_prompt=(
                        "You are an expert research coordinator. Today is " + _today + ". "
                        "Use tools (search/browse) for any facts after your training cutoff. "
                        "Maintain continuity with prior session context. Plan, search with tools, and synthesize findings with citations. "
                        "Never fabricate current data; prefer primary sources (SEC, IR, transcripts) and include citations."
                    ),
                    model_config={
                        "provider": sel_provider,
                        "model_id": sel_model,
                        "max_tokens": 8000,
                        "temperature": 0.7
                    }
                )
                # ===== Phase 1: Planner (no web tools) =====
                session.setdefault('events', [])
                # emit phase_start(planning)
                session['events'].append({'type': 'phase_start', 'phase': 'planning', 'ts': datetime.now().isoformat()})
                # Build context from previous content (last ~1500 chars)
                prev_context = (session.get('content','') or '')[-1500:]
                session['steps'].append({
                    'id': 'phase-1',
                    'title': 'Planning research',
                    'description': 'Creating bounded search plan',
                    'status': 'active',
                    'icon': 'plan'
                })
                session['thoughts'].append({
                    'type': 'planning',
                    'content': f'🧭 Planning search strategy for: {query}',
                    'timestamp': datetime.now().isoformat()
                })

                user_focus = (session.get('focus') or '').strip()
                user_tone = (session.get('tone') or '').strip()
                _plan_parts = [
                    f"SESSION_GOAL: {query}\n",
                    "Create a bounded web search plan for the user query. ",
                    "Output STRICT JSON with fields: queries (array of strings, max 10), goals (array), stop_condition (string). ",
                    "Focus on diverse angles and recency. Use prior conversation context implicitly; DO NOT repeat or quote prior answer text.",
                ]
                if user_focus:
                    _plan_parts.append(f"\nFOCUS: {user_focus}")
                if user_tone:
                    _plan_parts.append(f"\nTONE: {user_tone}")
                _plan_parts.append(f"\n\nUSER_QUERY: {query}\n\nJSON_ONLY:")
                plan_prompt = ''.join(_plan_parts)
                # Use the session-managed coordinator agent for planning so the
                # plan becomes part of the conversation context
                plan_text_chunks = []
                try:
                    async for pevt in coordinator_agent.stream_async(plan_prompt):
                        # Allow cancellation during planning
                        if research_sessions.get(session_id, {}).get('cancel'):
                            session['status'] = 'cancelled'
                            session.setdefault('events', []).append({'type': 'cancelled', 'phase': 'planning', 'ts': datetime.now().isoformat()})
                            return
                        if "data" in pevt:
                            plan_text_chunks.append(pevt["data"])
                except Exception as _pe:
                    logger.warning(f"Planner stream failed, will fallback to direct tool: {_pe}")
                plan_text = ''.join(plan_text_chunks) if plan_text_chunks else None
                if not plan_text:
                    # Fallback: call the planner tool directly if streaming fails
                    plan_text = research_planner(query=query, max_queries=int(os.getenv('TAVILY_MAX_CALLS_PER_RUN', 12)))

                def _extract_json_block(text: str):
                    import re, json
                    if not text:
                        return None
                    m = re.search(r"```json\s*(\{[\s\S]*?\})\s*```", text)
                    raw = m.group(1) if m else text
                    try:
                        return json.loads(raw)
                    except Exception:
                        # Try to find the first {...} block
                        m2 = re.search(r"(\{[\s\S]*\})", raw)
                        if m2:
                            try:
                                return json.loads(m2.group(1))
                            except Exception:
                                return None
                        return None

                import os as _os
                plan = _extract_json_block(plan_text) or {"queries": [], "goals": [], "stop_condition": "budget"}
                _max_calls = int(_os.getenv("TAVILY_MAX_CALLS_PER_RUN", 12))
                base_queries = [q for q in plan.get('queries', []) if isinstance(q, str)]
                # Enrich with domain-agnostic angles when space allows
                entity = _extract_company_ticker_year(query)
                angles = _build_domain_angles_queries(entity)
                # Merge while preserving order and cap by _max_calls
                merged = []
                seen = set()
                for q in base_queries + angles:
                    if isinstance(q, str) and q.strip() and q not in seen:
                        merged.append(q.strip())
                        seen.add(q.strip())
                    if len(merged) >= _max_calls:
                        break
                queries = merged

                session['steps'][-1]['status'] = 'completed'
                # emit phase_end(planning)
                session['events'].append({'type': 'phase_end', 'phase': 'planning', 'plan': plan, 'ts': datetime.now().isoformat()})
                session['steps'].append({
                    'id': 'phase-2',
                    'title': 'Executing planned searches',
                    'description': f'Running {len(queries)} searches',
                    'status': 'active',
                    'icon': 'search'
                })
                # emit phase_start(research)
                session['events'].append({'type': 'phase_start', 'phase': 'research', 'count': len(queries), 'ts': datetime.now().isoformat()})

                # Helper to honor cancellation
                def _cancelled() -> bool:
                    try:
                        return bool(session.get('cancel'))
                    except Exception:
                        return False

                # ===== Phase 2: Researcher (agent-driven tool usage for each planned query) =====
                for idx, q in enumerate(queries, 1):
                    if _cancelled():
                        session['status'] = 'cancelled'
                        session.setdefault('events', []).append({'type': 'cancelled', 'phase': 'research', 'ts': datetime.now().isoformat()})
                        return
                    session['thoughts'].append({
                        'type': 'searching',
                        'content': f'🔎 [Planned Search #{idx}] {q}',
                        'timestamp': datetime.now().isoformat()
                    })
                    step = {
                        'id': f'planned-search-{idx}',
                        'title': f'Planned Search #{idx}',
                        'description': q,
                        'status': 'active',
                        'icon': 'search'
                    }
                    session['steps'].append(step)
                    # emit tool_start for tavily
                    session['events'].append({'type': 'tool_start', 'tool': 'tavily_search', 'query': q, 'index': idx, 'ts': datetime.now().isoformat()})
                    # Ask the coordinator agent to use tavily_search for this query
                    instruction = (
                        "SESSION_GOAL: " + query + "\n"
                        f"Use tavily_search on this query and then provide a concise 1-2 sentence summary.\n\nQUERY: {q}"
                    )
                    try:
                        found = False
                        async for _evt in coordinator_agent.stream_async(instruction):
                            if _cancelled():
                                session['status'] = 'cancelled'
                                session.setdefault('events', []).append({'type': 'cancelled', 'phase': 'research', 'ts': datetime.now().isoformat()})
                                return
                            # The tavily_search tool populates global results we read below
                            if isinstance(_evt, dict) and 'tool_result' in _evt:
                                # Try to parse a brief summary if available
                                tr = _evt.get('tool_result') or {}
                                if isinstance(tr, dict):
                                    out_text = tr.get('result') or tr.get('output') or tr.get('content') or ''
                                    if isinstance(out_text, str):
                                        # Heuristic: first line as summary
                                        step['summary'] = (out_text.splitlines() or [''])[0][:200]
                                found = True
                                break
                    except Exception as _e:
                        logger.warning(f"Agent-driven search failed for '{q}': {_e}")

                    # Attach structured results for this specific search
                    try:
                        last_results = get_last_search_results() or []
                        if not last_results:
                            # Fallback: use DDG if Tavily returned nothing
                            last_results = fallback_search_ddg(q, max_results=5)
                        mapped = []
                        for i, r in enumerate(last_results, 1):
                            u = r.get('url', '')
                            dom = extract_domain(u)
                            # Prefer provider images if available
                            images = r.get('images') or r.get('image_urls') or []
                            thumb = images[0] if isinstance(images, list) and images else f"https://picsum.photos/seed/{i}_{idx}/400/300"
                            mapped.append({
                                'index': i,
                                'title': r.get('title', 'Untitled'),
                                'url': u,
                                'snippet': (r.get('content', '') or '')[:200],
                                'favicon': f"https://www.google.com/s2/favicons?domain={dom}&sz=64" if dom else None,
                                'thumbnail': thumb,
                            })
                        step['results'] = mapped

                        # Also incrementally add to session.sources_all so UI can show live feed
                        existing = session.get('sources_all', []) or []
                        seen_urls = set(s.get('url') for s in existing if isinstance(s, dict))
                        for j, r in enumerate(last_results, 1):
                            url = r.get('url', '')
                            if not url or url in seen_urls:
                                continue
                            num = len(existing) + 1
                            src = {
                                'id': f'source-{num}',
                                'number': num,
                                'title': r.get('title', 'Untitled'),
                                'url': url,
                                'domain': extract_domain(url),
                                'snippet': (r.get('content', '') or '')[:200],
                                'favicon': f"https://www.google.com/s2/favicons?domain={extract_domain(url)}&sz=64",
                                'thumbnail': f"https://picsum.photos/seed/{num}/400/300",
                            }
                            existing.append(src)
                            seen_urls.add(url)
                        session['sources_all'] = existing
                        # emit sources_delta
                        session['events'].append({'type': 'sources_delta', 'added': mapped, 'index': idx, 'ts': datetime.now().isoformat()})

                        # Optional: visit top result to extract on-page text and screenshots (Strands tool-driven)
                        try:
                            import os as _os2
                            browse_enabled = _os2.getenv('RESEARCH_BROWSE_TOP', '1') in ('1','true','yes')
                            if browse_enabled and last_results:
                                top_url = last_results[0].get('url')
                                if top_url:
                                    # Track previously captured screenshots
                                    prev_shots = get_captured_screenshots() or []
                                    prev_count = len(prev_shots)
                                    # Ask the coordinator agent to browse the page
                                    browse_instruction = (
                                        "SESSION_GOAL: " + query + "\n"
                                        f"Use browse_and_capture on this URL to extract visible text: {top_url}"
                                    )
                                    # Trigger one browse action then continue
                                    _did_browse = False
                                    async for _bevt in coordinator_agent.stream_async(browse_instruction):
                                        if _cancelled():
                                            session['status'] = 'cancelled'
                                            session.setdefault('events', []).append({'type': 'cancelled', 'phase': 'research', 'ts': datetime.now().isoformat()})
                                            return
                                        _did_browse = True
                                        break
                                    # Fetch any new screenshots
                                    new_shots = get_captured_screenshots() or []
                                    if len(new_shots) > prev_count:
                                        latest = new_shots[-1]
                                        # Attach OCR text to the matching source if possible
                                        for s in session['sources']:
                                            if s.get('url') == top_url:
                                                s['content'] = (latest.get('ocr_text') or '')[:1500]
                                                break
                                        # Push a lightweight screenshot event for UI (if it chooses to render)
                                        session.setdefault('events', []).append({
                                            'type': 'screenshot',
                                            'url': top_url,
                                            'description': latest.get('description', ''),
                                            'ts': datetime.now().isoformat()
                                        })
                        except Exception:
                            # Browsing is best-effort; ignore failures silently
                            pass
                    except Exception:
                        step['results'] = []
                    # Record results_count for trace
                    try:
                        step['results_count'] = len(step.get('results') or [])
                    except Exception:
                        step['results_count'] = None
                    step['status'] = 'completed'
                    # emit tool_end (include query for matching)
                    session['events'].append({'type': 'tool_end', 'tool': 'tavily_search', 'index': idx, 'query': q, 'summary': step.get('summary'), 'results_count': step.get('results_count'), 'ts': datetime.now().isoformat()})
                    # Do NOT append research chunks to session['content']; keep thinking separate
                    # Emit incremental content chunk for live view (summary + top results)
                    try:
                        lines = [f"### [Search #{idx}] {q}"]
                        if step.get('summary'):
                            lines.append(f"Summary: {step['summary']}")
                        if step.get('results'):
                            for r in step['results'][:3]:
                                title = r.get('title', 'Untitled')
                                url = r.get('url', '')
                                snippet = r.get('snippet', '')
                                lines.append(f"- [{title}]({url}) — {snippet}")
                        chunk = "\n".join(lines)
                        session['events'].append({'type': 'content_delta', 'final': False, 'chunk': chunk, 'ts': datetime.now().isoformat()})
                    except Exception:
                        pass

                # After planned searches, perform targeted gap-filling if needed
                try:
                    # Analyze coverage
                    baseline_sources = session.get('sources', []) or []
                    coverage = _detect_coverage_gaps(baseline_sources)
                    entity = _extract_company_ticker_year(query)
                    gap_queries = _build_gap_queries(entity, coverage)
                    # Respect overall search budget: use only remaining slots
                    try:
                        total_budget = int(os.getenv('TAVILY_MAX_CALLS_PER_RUN', 12))
                    except Exception:
                        total_budget = 12
                    remaining = max(0, total_budget - len(queries))
                    gap_cap = int(os.getenv('TAVILY_GAP_MAX', 6))
                    # Remove duplicates that already exist in the planned query list
                    planned_set = set(queries)
                    gap_queries = [g for g in gap_queries if g not in planned_set][: min(remaining, gap_cap)]
                    if gap_queries:
                        # Mark gap-fill phase
                        session['steps'].append({
                            'id': 'phase-2b',
                            'title': 'Gap fill searches',
                            'description': f'Running {len(gap_queries)} targeted queries',
                            'status': 'active',
                            'icon': 'search'
                        })
                        session['events'].append({'type': 'phase_start', 'phase': 'gap_fill', 'count': len(gap_queries), 'ts': datetime.now().isoformat()})
                        for gidx, gq in enumerate(gap_queries, 1):
                            if _cancelled():
                                session['status'] = 'cancelled'
                                session.setdefault('events', []).append({'type': 'cancelled', 'phase': 'gap_fill', 'ts': datetime.now().isoformat()})
                                return
                            session['thoughts'].append({
                                'type': 'searching',
                                'content': f'🔎 [Gap Search #{gidx}] {gq}',
                                'timestamp': datetime.now().isoformat()
                            })
                            step = {
                                'id': f'gap-search-{gidx}',
                                'title': f'Gap Search #{gidx}',
                                'description': gq,
                                'status': 'active',
                                'icon': 'search'
                            }
                            session['steps'].append(step)
                            session['events'].append({'type': 'tool_start', 'tool': 'tavily_search', 'query': gq, 'index': gidx, 'ts': datetime.now().isoformat()})
                            # Execute with agent to keep consistent tool usage
                            instruction = (
                                "SESSION_GOAL: " + query + "\n"
                                f"Use tavily_search on this gap query and provide a concise summary.\n\nQUERY: {gq}"
                            )
                            try:
                                async for _evt in coordinator_agent.stream_async(instruction):
                                    if _cancelled():
                                        session['status'] = 'cancelled'
                                        session.setdefault('events', []).append({'type': 'cancelled', 'phase': 'gap_fill', 'ts': datetime.now().isoformat()})
                                        return
                                    if isinstance(_evt, dict) and 'tool_result' in _evt:
                                        tr = _evt.get('tool_result') or {}
                                        if isinstance(tr, dict):
                                            out_text = tr.get('result') or tr.get('output') or tr.get('content') or ''
                                            if isinstance(out_text, str):
                                                step['summary'] = (out_text.splitlines() or [''])[0][:200]
                                        break
                            except Exception:
                                pass
                            # Attach results
                            last_results = get_last_search_results() or []
                            if not last_results:
                                last_results = fallback_search_ddg(gq, max_results=5)
                            mapped = []
                            for i, r in enumerate(last_results, 1):
                                u = r.get('url', '')
                                dom = extract_domain(u)
                                images = r.get('images') or r.get('image_urls') or []
                                thumb = images[0] if isinstance(images, list) and images else f"https://picsum.photos/seed/g{gidx}_{i}/400/300"
                                mapped.append({
                                    'index': i,
                                    'title': r.get('title', 'Untitled'),
                                    'url': u,
                                    'snippet': (r.get('content', '') or '')[:200],
                                    'favicon': f"https://www.google.com/s2/favicons?domain={dom}&sz=64" if dom else None,
                                    'thumbnail': thumb,
                                })
                            step['results'] = mapped
                            # Merge into sources live
                            existing = session.get('sources_all', []) or []
                            seen_urls = set(s.get('url') for s in existing if isinstance(s, dict))
                            for r in last_results:
                                url = r.get('url', '')
                                if not url or url in seen_urls:
                                    continue
                                num = len(existing) + 1
                                src = {
                                    'id': f'source-{num}',
                                    'number': num,
                                    'title': r.get('title', 'Untitled'),
                                    'url': url,
                                    'domain': extract_domain(url),
                                    'snippet': (r.get('content', '') or '')[:200],
                                    'favicon': f"https://www.google.com/s2/favicons?domain={extract_domain(url)}&sz=64",
                                    'thumbnail': f"https://picsum.photos/seed/{num}/400/300",
                                }
                                existing.append(src)
                                seen_urls.add(url)
                            session['sources_all'] = existing
                            # Close the gap step
                            try:
                                step['results_count'] = len(step.get('results') or [])
                            except Exception:
                                step['results_count'] = None
                            step['status'] = 'completed'
                            session['events'].append({'type': 'tool_end', 'tool': 'tavily_search', 'index': gidx, 'query': gq, 'summary': step.get('summary'), 'results_count': step.get('results_count'), 'ts': datetime.now().isoformat()})
                        # Close gap-fill phase
                        session['steps'][-1]['status'] = 'completed'
                        session['events'].append({'type': 'phase_end', 'phase': 'gap_fill', 'ts': datetime.now().isoformat()})
                except Exception:
                    pass

                session['steps'][-1]['status'] = 'completed'
                # emit phase_end(research)
                session['events'].append({'type': 'phase_end', 'phase': 'research', 'ts': datetime.now().isoformat()})
                session['steps'].append({
                    'id': 'phase-3',
                    'title': 'Synthesis',
                    'description': 'Combining findings into final report',
                    'status': 'active',
                    'icon': 'synthesis'
                })
                # emit phase_start(synthesis)
                session['events'].append({'type': 'phase_start', 'phase': 'synthesis', 'ts': datetime.now().isoformat()})

                # ===== Phase 3: Synthesizer (streaming, same coordinator agent) =====
                if _cancelled():
                    session['status'] = 'cancelled'
                    session.setdefault('events', []).append({'type': 'cancelled', 'phase': 'synthesis', 'ts': datetime.now().isoformat()})
                    return
                # Build a compact source summary for synthesis
                all_results = get_all_search_results() or []
                src_summary = []
                base_list = all_results[:30]
                # Fallback: if Tavily returned nothing, use session.sources accumulated from fallback DDG
                if not base_list:
                    for s in (session.get('sources') or [])[:20]:
                        src_summary.append(f"- {s.get('title','Untitled')} ({s.get('url','')}) :: {(s.get('content','') or s.get('snippet','') or '')[:200]}")
                else:
                    for r in base_list:
                        t = r.get('title', 'Untitled')
                        u = r.get('url', '')
                        c = (r.get('content', '') or '')[:200]
                        src_summary.append(f"- {t} ({u}) :: {c}")
                _synth_parts = [
                    f"SESSION_GOAL: {query}\n",
                    "Synthesize findings into a structured research response with inline numeric citations [1], [2], etc., matching the order of the sources list provided. ",
                    "Include these sections: 1) Executive Summary, 2) Financials & Earnings (EPS, revenue, margins, growth, segment highlights; include latest quarter and Y/Y deltas), ",
                    "3) Filings & Transcripts (list key SEC forms and latest call transcript with links), 4) Analyst & Price Targets, 5) Market/Macro & Competitive Landscape, 6) Risks & Opportunities, 7) Outlook & Scenarios, 8) Actionable Takeaways. ",
                    "If the topic is product/engineering (e.g., satellites or R&D), adapt sections to: 2) Product/Tech Overview, 3) Architecture & Dependencies, 4) Roadmap & Milestones (timeline), 5) Supply Chain & Manufacturing Plan, 6) Regulatory/Compliance, 7) Partnerships & Contracts, 8) Economics (CapEx/Opex; unit economics if available), 9) Risks & Mitigations, 10) Outlook & Scenarios, 11) Next Actions. ",
                    "Maintain continuity with prior conversation but DO NOT repeat previous answer text; focus on updated user intent. Keep claims grounded in the sources.\n\n",
                ]
                if user_focus:
                    _synth_parts.append(f"FOCUS: {user_focus}\n")
                if user_tone:
                    _synth_parts.append(f"TONE: {user_tone}\n")
                _synth_parts.extend([
                    "If visualization tools are available, do the following near the top of the response after the executive summary: \n",
                    "1) If the 'diagram' tool exists, generate ONE Mermaid diagram that captures structure (e.g., competitive landscape, process, or timeline). Include the Mermaid block in the output.\n",
                    "2) If the 'generate_image' tool exists and numeric comparisons are present, render ONE chart (bar/line) and embed it as a markdown image. If the tool returns a data URI, embed it as ![Chart](data:...).\n",
                    "Keep the number of visuals to 1–2 to avoid clutter.\n\n",
                    "SOURCES (ordered):\n",
                    "\n".join(src_summary)
                ])
                synth_prompt = ''.join(_synth_parts)
                # Reset content before final synthesis to avoid leaking tool traces
                session['content'] = ''
                # Stream synthesis using a nested Agent for realtime updates
                synth_buffer = []
                try:
                    # Reuse the same coordinator agent to keep one conversation
                    async for sevt in coordinator_agent.stream_async(synth_prompt):
                        if _cancelled():
                            session['status'] = 'cancelled'
                            session.setdefault('events', []).append({'type': 'cancelled', 'phase': 'synthesis', 'ts': datetime.now().isoformat()})
                            return
                        if "data" in sevt:
                            chunk = sevt["data"]
                            if chunk:
                                synth_buffer.append(chunk)
                                # emit incremental content chunk
                                session['events'].append({'type': 'content_delta', 'final': False, 'chunk': chunk, 'ts': datetime.now().isoformat()})
                except Exception as e:
                    # Fallback: if streaming fails, call non-streaming synthesis tool
                    final_text_fallback = research_synthesis(sources_summary="\n".join(src_summary))
                    synth_buffer.append(final_text_fallback or '')
                final_text = ''.join(synth_buffer)
                session['content'] = final_text
                # Align session.sources order to match the SOURCES (ordered) list used in synthesis
                try:
                    ordered_results = all_results[:30]
                    if not ordered_results:
                        # Build ordered_results from session.sources when Tavily list is empty
                        fallback_pool = (session.get('sources_all') or session.get('sources') or [])
                        ordered_results = [{
                            'title': s.get('title','Untitled'),
                            'url': s.get('url',''),
                            'content': s.get('content') or s.get('snippet') or ''
                        } for s in fallback_pool[:30]]
                    aligned_sources = []
                    seen_urls = set()
                    idx_num = 1
                    for r in ordered_results:
                        url = r.get('url', '')
                        if not url or url in seen_urls:
                            continue
                        seen_urls.add(url)
                        aligned_sources.append({
                            'id': f'source-{idx_num}',
                            'number': idx_num,
                            'title': r.get('title', 'Untitled'),
                            'url': url,
                            'domain': extract_domain(url),
                            'snippet': (r.get('content', '') or '')[:200],
                            'favicon': f"https://www.google.com/s2/favicons?domain={extract_domain(url)}&sz=64",
                            'thumbnail': f"https://picsum.photos/seed/{idx_num}/400/300",
                            'score': r.get('score', 0),
                            'content': r.get('content', '')
                        })
                        idx_num += 1
                    if aligned_sources:
                        # Keep aligned citations separate, but do not drop full list
                        session['sources'] = aligned_sources
                        session['events'].append({'type': 'sources_reordered', 'count': len(aligned_sources), 'ts': datetime.now().isoformat()})
                except Exception:
                    pass
                # emit content_delta final (send a small completion marker if buffer already streamed)
                session['events'].append({'type': 'content_delta', 'final': True, 'chunk': final_text[-2000:] if final_text else '', 'ts': datetime.now().isoformat()})

                session['steps'][-1]['status'] = 'completed'
                # emit phase_end(synthesis)
                session['events'].append({'type': 'phase_end', 'phase': 'synthesis', 'ts': datetime.now().isoformat()})

                # ===== Phase 4: Verification (optional, disable by default for UX/perf) =====
                AUTO_VERIFY = os.getenv('RESEARCH_AUTO_VERIFY', '0') in ('1','true','yes')
                if AUTO_VERIFY:
                    session['steps'].append({
                        'id': 'phase-4',
                        'title': 'Verification',
                        'description': 'Checking citations and flagging weak claims',
                        'status': 'active',
                        'icon': 'verify'
                    })
                    session['events'].append({'type': 'phase_start', 'phase': 'verify', 'ts': datetime.now().isoformat()})
                    try:
                        import json as _json
                        verifier_raw = research_verifier(content=final_text or '', sources=session.get('sources', []))
                        verification = _json.loads(verifier_raw) if isinstance(verifier_raw, str) else verifier_raw
                    except Exception as _e:
                        verification = {"weak_citations":[],"missing_citations":[],"notes":[f"verifier error: {_e}"],"flagged_urls":[]}
                    session['verification'] = verification
                    session['events'].append({'type': 'verify_result', 'data': verification, 'ts': datetime.now().isoformat()})
                    session['steps'][-1]['status'] = 'completed'
                    session['events'].append({'type': 'phase_end', 'phase': 'verify', 'ts': datetime.now().isoformat()})

                # Add user query and assistant response to history
                if 'messages' not in session:
                    session['messages'] = []
                
                # Add user message if not already there
                if query and (not session['messages'] or session['messages'][0].get('role') != 'user'):
                    session['messages'].insert(0, {
                        'role': 'user',
                        'content': query,
                        'timestamp': session.get('timestamp', datetime.now().isoformat()),
                        'mode': 'scholar'
                    })
                
                # Build per-run trace for Thinking & Tools UI
                trace = {}
                try:
                    run_events = session.get('events', [])[prev_events_idx:]
                    steps_added = session.get('steps', [])[prev_steps_idx:]
                    tool_calls = []
                    current = {}
                    for evt in run_events:
                        if not isinstance(evt, dict):
                            continue
                        if evt.get('type') == 'tool_start':
                            current = {
                                'tool': evt.get('tool'),
                                'query': evt.get('query'),
                                'index': evt.get('index')
                            }
                        elif evt.get('type') == 'tool_end':
                            if current:
                                current['summary'] = evt.get('summary')
                                current['results_count'] = evt.get('results_count')
                                tool_calls.append(current)
                                current = {}
                    trace = {
                        'events': run_events[-200:],
                        'steps': steps_added,
                        'tool_calls': tool_calls,
                        'sources': session.get('sources', [])[:50]
                    }
                except Exception:
                    trace = {}

                # Add final assistant message to history
                if session.get('content'):
                    session['messages'].append({
                        'role': 'assistant',
                        'content': session['content'],
                        'timestamp': datetime.now().isoformat(),
                        'sources': session.get('sources', []),
                        'thoughts': session.get('thoughts', []),
                        'trace': trace,
                        'mode': 'scholar'
                    })
                
                session['status'] = 'completed'
                session['progress'] = 100
                return

            # Fallback to legacy streaming pipeline if needed (session-managed for continuity)
            research_agent = SESSION_SERVICE.create_agent_with_session(
                session_id=session_id,
                agent_name="coordinator",
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
                ,
                model_config={"model_id": "gpt-4o-mini", "max_tokens": 8000, "temperature": 0.7}
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
            
            # Ensure we use a session-managed agent for the research phase so context persists
            # across turns in the same session (Strands standard session behavior).
            research_agent = SESSION_SERVICE.create_agent_with_session(
                session_id=session_id,
                agent_name="coordinator",
                tools=tools,
                system_prompt=(
                    "You are an expert research coordinator. Use available tools to plan, search, "
                    "analyze, and synthesize. Maintain continuity with prior session context."
                ),
                model_config={"model_id": "gpt-4o-mini", "max_tokens": 8000, "temperature": 0.7}
            )

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

MINIMUM OUTPUT: 2000 words

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
                            total_tool_calls += 1
                            tool_use_id = (
                                tool_info.get("toolUseId")
                                or tool_info.get("id")
                                or f"{tool_name}:{len(tool_input_buffers)}"
                            )

                            # Initialize buffer entry
                            if tool_use_id not in tool_input_buffers:
                                tool_input_buffers[tool_use_id] = {"name": tool_name, "raw": "", "parsed": None}
                            
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
                                # If already processed, ignore further deltas
                                if tool_use_id in processed_tool_ids:
                                    continue

                                # Accumulate input across streamed events
                                tool_input = tool_info.get("input", {})
                                if isinstance(tool_input, str):
                                    tool_input_buffers[tool_use_id]["raw"] += tool_input
                                elif isinstance(tool_input, dict):
                                    tool_input_buffers[tool_use_id]["parsed"] = tool_input

                                # Try to parse when we seem to have complete JSON
                                analysis_prompt = ""
                                parsed_args = tool_input_buffers[tool_use_id]["parsed"]
                                raw = tool_input_buffers[tool_use_id]["raw"].strip()
                                if parsed_args is None and raw:
                                    try:
                                        # Only attempt parse when raw looks like a full JSON object
                                        if raw.startswith('{') and raw.endswith('}'):
                                            parsed_args = json.loads(raw)
                                            tool_input_buffers[tool_use_id]["parsed"] = parsed_args
                                    except Exception:
                                        parsed_args = None

                                if isinstance(parsed_args, dict):
                                    analysis_prompt = parsed_args.get("prompt", "")

                                # Only once we have a meaningful prompt, mark processed and emit thinking step
                                if analysis_prompt and len(analysis_prompt) > 10:
                                    processed_tool_ids.add(tool_use_id)
                                    thinking_step = {
                                        'id': f'step-thinking-{len([s for s in session["steps"] if s.get("icon") == "brain"]) + 1}',
                                        'title': '🧠 Deep Analysis',
                                        'description': f'Analyzing: "{analysis_prompt[:100]}..."' if len(analysis_prompt) > 100 else f'Analyzing: "{analysis_prompt}"',
                                        'status': 'active',
                                        'icon': 'brain'
                                    }
                                    session['steps'].append(thinking_step)
                                    session['progress'] = min(session['progress'] + 5, 85)
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

                                    # Guardrails: if too many tool calls already, stop to prevent loops
                                    if total_tool_calls > 40:
                                        thoughts_buffer.append({
                                            'type': 'warning',
                                            'content': '⚠️ Too many tool calls detected; pausing to avoid loops.',
                                            'timestamp': datetime.now().isoformat()
                                        })
                                        session['thoughts'] = thoughts_buffer[-20:]
                                        session['status'] = 'error'
                                        session['error'] = 'Too many tool calls; likely rate limit or loop. Please refine query or try later.'
                                        logger.warning("Aborting research due to excessive tool calls", total_tool_calls=total_tool_calls)
                                        return
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

                                # Detect rate limit responses and stop if repeated
                                # Try different keys where result text may be stored
                                result_text = (
                                    tool_result.get('result')
                                    or tool_result.get('output')
                                    or tool_result.get('content')
                                    or ''
                                )
                                if isinstance(result_text, dict):
                                    result_text = json.dumps(result_text)[:200]
                                if isinstance(result_text, str) and ('429' in result_text or 'rate-limit' in result_text.lower()):
                                    rate_limit_hits += 1
                                    logger.warning("Tavily rate limit hit", count=rate_limit_hits)
                                    if rate_limit_hits >= 3:
                                        thoughts_buffer.append({
                                            'type': 'warning',
                                            'content': '⚠️ Web search rate-limited repeatedly. Pausing research — please try again shortly.',
                                            'timestamp': datetime.now().isoformat()
                                        })
                                        session['thoughts'] = thoughts_buffer[-20:]
                                        session['status'] = 'error'
                                        session['error'] = 'Rate limited by search provider (429). Please wait and retry.'
                                        return
                    
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
            # Build per-run trace (events, steps added, tool calls, sources snapshot)
            trace = {}
            try:
                run_events = session.get('events', [])[prev_events_idx:]
                steps_added = session.get('steps', [])[prev_steps_idx:]
                # Extract simple tool_calls list
                tool_calls = []
                current = {}
                for evt in run_events:
                    if not isinstance(evt, dict):
                        continue
                    if evt.get('type') == 'tool_start':
                        current = {
                            'tool': evt.get('tool'),
                            'query': evt.get('query'),
                            'index': evt.get('index')
                        }
                    elif evt.get('type') == 'tool_end':
                        if current:
                            current['summary'] = evt.get('summary')
                            current['results_count'] = evt.get('results_count')
                            tool_calls.append(current)
                            current = {}
                trace = {
                    'events': run_events[-200:],  # cap to avoid huge payloads
                    'steps': steps_added,
                    'tool_calls': tool_calls,
                    'sources': session.get('sources', [])[:50]
                }
            except Exception:
                trace = {}

            # Add user query and assistant response to history
            if 'messages' not in session:
                session['messages'] = []
            
            # Add user message if not already there
            if query and (not session['messages'] or session['messages'][0].get('role') != 'user'):
                session['messages'].insert(0, {
                    'role': 'user',
                    'content': query,
                    'timestamp': session.get('timestamp', datetime.now().isoformat()),
                    'mode': 'deep'
                })
            
            # Add final assistant message to history
            if session.get('content'):
                session['messages'].append({
                    'role': 'assistant',
                    'content': session['content'],
                    'timestamp': datetime.now().isoformat(),
                    'sources': session.get('sources', []),
                    'thoughts': session.get('thoughts', []),
                    'trace': trace,
                    'mode': 'deep'
                })
            
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
    
    # Initialize or reuse session (preserve context on explicit same session_id)
    if session_id in research_sessions:
        session = research_sessions[session_id]
        session['query'] = request.query
        session['status'] = 'initializing'
        session['progress'] = 0
        session['cancel'] = False
        session['timestamp'] = datetime.now().isoformat()
        session.setdefault('events', []).append({'type':'phase_start','phase':'new_run','ts': datetime.now().isoformat()})
        # Clear active content buffer for the new run; prior content remains in UI history
        session['content'] = ''
        if request.focus:
            session['focus'] = request.focus
        if request.tone:
            session['tone'] = request.tone
        if request.model_provider:
            session['model_provider'] = request.model_provider
        if request.model_id:
            session['model_id'] = request.model_id
    else:
        research_sessions[session_id] = {
            'session_id': session_id,
            'query': request.query,
            'status': 'initializing',
            'progress': 0,
            'steps': [],
            'events': [],
            'content': '',
            'sources': [],
            'sources_all': [],
            'thoughts': [],  # Initialize thoughts array
            'timestamp': datetime.now().isoformat(),
            'error': None,
            'requires_approval': False,
            'approval_message': None,
            'cancel': False,
            'model_provider': request.model_provider or 'openai',
            'model_id': request.model_id or 'gpt-4o-mini',
            'messages': [
                {
                    'role': 'user',
                    'content': request.query,
                    'timestamp': datetime.now().isoformat(),
                    'mode': request.mode
                }
            ],
            'focus': request.focus,
            'tone': request.tone
        }
    
    # Record task in shared state for continuity
    try:
        SHARED_STATE.append_task_history(session_id, request.query)
        SHARED_STATE.set_current_goal(session_id, request.query)
    except Exception:
        pass
    # Emit debug context snapshot
    try:
        ctx = SESSION_SERVICE.analyze_session_context(session_id)
        research_sessions[session_id].setdefault('events', []).append({'type':'debug','subtype':'session_context','data':ctx,'ts': datetime.now().isoformat()})
        logger.info(f"Session {session_id} context: messages={ctx.get('total_messages')} agents_used={ctx.get('agents_used')}")
    except Exception:
        pass
    # Start research in a thread (not using background_tasks to avoid event loop issues)
    perform_strands_research(session_id, request.query, request.require_approval)
    
    logger.info(f"Started Strands research session {session_id} for query: {request.query}")
    
    return {
        'session_id': session_id,
        'status': 'started',
        'message': 'Research started successfully'
    }

@router.post("/continue-strands-real")
async def continue_research(request: ResearchStartRequest):
    """Continue an existing research session with additional user input.

    Frontend uses this for Deep/Scholar continuation. This re-invokes the
    research agent for the provided session_id and query while preserving the
    existing session record. Results are exposed via the status endpoint.
    """
    if not request.session_id:
        raise HTTPException(status_code=400, detail="session_id is required for continuation")
    
    session_id = request.session_id
    if session_id not in research_sessions:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")

    # Reset/prepare minimal fields for a new pass while keeping history
    session = research_sessions[session_id]
    session['status'] = 'initializing'
    session['progress'] = 0
    session['cancel'] = False
    session['timestamp'] = datetime.now().isoformat()
    # Reset full sources accumulator for a new pass
    session['sources_all'] = session.get('sources_all') or []
    # Do not clear steps/sources to preserve history; frontend presents its own history
    # Clear active content so the new response doesn't echo the previous one
    session.setdefault('events', []).append({'type':'phase_start','phase':'new_run','ts': datetime.now().isoformat()})
    session['error'] = None
    session['content'] = ''
    
    # Append to task history and set goal
    try:
        SHARED_STATE.append_task_history(session_id, request.query)
        SHARED_STATE.set_current_goal(session_id, request.query)
    except Exception:
        pass
    # Emit debug context snapshot
    try:
        ctx = SESSION_SERVICE.analyze_session_context(session_id)
        research_sessions[session_id].setdefault('events', []).append({'type':'debug','subtype':'session_context','data':ctx,'ts': datetime.now().isoformat()})
        logger.info(f"[CONTINUE] Session {session_id} context: messages={ctx.get('total_messages')} agents_used={ctx.get('agents_used')}")
    except Exception:
        pass
    # Adopt model selection if provided
    if request.model_provider:
        session['model_provider'] = request.model_provider
    if request.model_id:
        session['model_id'] = request.model_id

    # Build an effective follow-up query to preserve topic when the user sends a short follow-up
    prev_goal = (session.get('query') or '').strip()
    user_q = (request.query or '').strip()
    effective_query = user_q
    try:
        # Heuristic: short follow-ups or those lacking topic words should bind to previous goal
        if prev_goal and (len(user_q) < 40 or user_q.lower() in ["compare", "what about", "more", "continue", "next", "follow up", "follow-up"]):
            effective_query = f"Follow-up to prior topic: {prev_goal}. Specifically: {user_q}"
    except Exception:
        effective_query = user_q or prev_goal or ''

    # Update session visible query for continuity
    session['query'] = effective_query or user_q or prev_goal
    
    # Kick off another research pass without approval by default unless specified
    perform_strands_research(session_id, effective_query, request.require_approval or False)

    return {
        'session_id': session_id,
        'status': 'continued',
        'message': 'Research continuation started successfully'
    }

@router.get("/status-strands-real/{session_id}")
async def get_research_status(session_id: str):
    """Get current status of Strands research session"""
    # Handle double session_ prefix issue
    clean_session_id = session_id
    if session_id.startswith("session_session_"):
        clean_session_id = session_id.replace("session_session_", "session_")
    
    if clean_session_id not in research_sessions:
        # Try to load from Strands persistent storage
        try:
            session_data = await SESSION_SERVICE.load_session_data(clean_session_id)
            if session_data:
                research_sessions[clean_session_id] = session_data
                logger.info(f"Loaded session {clean_session_id} from persistent storage")
            else:
                logger.warning(f"Session {clean_session_id} not found in storage")
                raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
        except Exception as e:
            logger.error(f"Error loading session {clean_session_id}: {e}")
            raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    
    session = research_sessions[clean_session_id]
    
    # Get message history if available
    messages = session.get('messages', [])
    if not messages:
        # Try to load from Strands if not in memory
        messages = SESSION_SERVICE.get_session_messages(clean_session_id)
        if messages:
            session['messages'] = messages
    
    # Build response with messages
    response_dict = {
        "session_id": session_id,  # Keep original for frontend consistency
        "status": session['status'],
        "progress": session['progress'],
        "steps": session['steps'],
        "content": session['content'],
        "sources": session['sources'],
        "sources_all": session.get('sources_all', []),
        "thoughts": session.get('thoughts', []),
        "timestamp": session['timestamp'],
        "error": session.get('error'),
        "requires_approval": session.get('requires_approval', False),
        "approval_message": session.get('approval_message'),
        "messages": messages
    }
    
    return response_dict

@router.delete("/clear-all-sessions")
async def clear_all_sessions():
    """Clear all research sessions from memory and disk"""
    global research_sessions
    
    try:
        # Clear in-memory sessions
        research_sessions.clear()
        
        # Clear Strands sessions
        import shutil
        from pathlib import Path
        
        strands_path = Path("./strands_sessions")
        if strands_path.exists():
            for session_dir in strands_path.glob("session_*"):
                if session_dir.is_dir():
                    shutil.rmtree(session_dir)
        
        # Clear other session directories
        sessions_path = Path("./sessions")
        if sessions_path.exists():
            for session_file in sessions_path.glob("*"):
                if session_file.is_file():
                    session_file.unlink()
        
        research_sessions_path = Path("./research_sessions")
        if research_sessions_path.exists():
            for session_file in research_sessions_path.glob("*"):
                if session_file.is_file():
                    session_file.unlink()
        
        logger.info("Cleared all sessions")
        return {"message": "All sessions cleared successfully"}
        
    except Exception as e:
        logger.error(f"Failed to clear sessions: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear sessions: {str(e)}")

@router.get("/stream-strands-real/{session_id}")
async def stream_research(session_id: str):
    """Server-Sent Events stream for research session.
    Emits periodic JSON snapshots to drive live UI without polling.
    """
    if session_id not in research_sessions:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")

    async def event_gen():
        last_serialized = None
        while True:
            session = research_sessions.get(session_id)
            if not session:
                break
            payload = {
                'session_id': session_id,
                'status': session.get('status'),
                'progress': session.get('progress'),
                'steps': session.get('steps', []),
                'content': session.get('content', ''),
                'sources': session.get('sources', []),
                'sources_all': session.get('sources_all', []),
                'thoughts': session.get('thoughts', []),
                'timestamp': session.get('timestamp'),
                'error': session.get('error')
            }
            import json
            data_str = json.dumps(payload, ensure_ascii=False)
            # Send only if changed or every 1s
            if data_str != last_serialized:
                yield f"data: {data_str}\n\n"
                last_serialized = data_str
            # Stop when session completes or errors
            if session.get('status') in ('completed', 'error', 'cancelled'):
                break
            await asyncio.sleep(1.0)

    return StreamingResponse(event_gen(), media_type='text/event-stream')

@router.get("/stream-events-strands-real/{session_id}")
async def stream_research_events(session_id: str):
    """Typed SSE event stream for research session (phase/tool/content/sources).
    Sends heartbeat events if no new events are available to keep the connection alive.
    """
    if session_id not in research_sessions:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")

    async def event_gen():
        last_idx = 0
        while True:
            session = research_sessions.get(session_id)
            if not session:
                break
            events = session.get('events', [])
            # Flush any pending events
            flushed = False
            while last_idx < len(events):
                import json
                evt = events[last_idx]
                yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"
                last_idx += 1
                flushed = True
            if not flushed:
                # Heartbeat to keep the stream alive
                yield "data: {\"type\":\"heartbeat\"}\n\n"
            # Stop when complete and nothing left to flush
            if session.get('status') in ('completed', 'error', 'cancelled') and last_idx >= len(events):
                break
            await asyncio.sleep(1.0)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_gen(), media_type='text/event-stream', headers=headers)

@router.post("/verify-strands-real/{session_id}")
async def verify_research(session_id: str):
    """Run verification on demand for an existing session (no streaming)."""
    if session_id not in research_sessions:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")

    session = research_sessions[session_id]
    content = session.get('content', '') or ''
    sources = session.get('sources', []) or []
    if not content.strip():
        raise HTTPException(status_code=400, detail="No final content available to verify yet")

    try:
        import json as _json
        verifier_raw = research_verifier(content=content, sources=sources)
        verification = _json.loads(verifier_raw) if isinstance(verifier_raw, str) else verifier_raw
    except Exception as e:
        verification = {"weak_citations":[],"missing_citations":[],"notes":[f"verifier error: {e}"],"flagged_urls":[]}

    session['verification'] = verification
    # Also push an event for any live listeners
    events = session.setdefault('events', [])
    events.append({'type': 'verify_result', 'data': verification, 'ts': datetime.now().isoformat()})

    return {"status": "ok", "verification": verification}

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
        
        # Prepare session for continuation while preserving context
        session['query'] = enhanced_query
        session['approval_message'] = None
        session['status'] = 'running'
        # Keep steps and sources for continuity; add a boundary event
        session.setdefault('events', []).append({'type':'phase_start','phase':'new_run','ts': datetime.now().isoformat()})
        session['progress'] = 0
        # Clear active content buffer to avoid echo
        session['content'] = ''
        
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
            'tavily': bool(os.getenv('TAVILY_API_KEY')),
            'anthropic': bool(os.getenv('ANTHROPIC_API_KEY')),
            'aws': bool(os.getenv('AWS_ACCESS_KEY_ID') and os.getenv('AWS_SECRET_ACCESS_KEY') and os.getenv('AWS_REGION'))
        }
    }

@router.get("/model-config")
async def model_config():
    """Return recommended model lists per provider, reading optional JSON config.

    If a `MODEL_CONFIG_JSON` env var points to a file, we will load it.
    Otherwise returns sensible defaults for OpenAI, Anthropic, and AWS Bedrock.
    """
    import json as _json
    import os as _os
    default_cfg = {
        'openai': {
            'name': 'OpenAI',
            'models': [
                # Featured / Frontier
                'gpt-5', 'gpt-5-mini', 'gpt-5-nano',
                'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
                # Specialized
                'o3-deep-research', 'o4-mini-deep-research', 'o3-pro', 'o3', 'o4-mini',
                # Realtime & audio
                'gpt-realtime', 'gpt-audio',
                # 4o family
                'gpt-4o', 'gpt-4o-mini', 'gpt-4o-mini-tts', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe',
                'gpt-4o-search-preview', 'gpt-4o-mini-search-preview', 'gpt-4o-realtime-preview', 'gpt-4o-mini-realtime-preview', 'gpt-4o-mini-audio-preview', 'gpt-4o-audio-preview',
                # Images
                'gpt-image-1', 'dall-e-3',
                # Moderation / OSS / legacy useful ones
                'omni-moderation-latest', 'gpt-oss-120b', 'gpt-oss-20b',
                # Embeddings
                'text-embedding-3-large', 'text-embedding-3-small'
            ]
        },
        'anthropic': {
            'name': 'Anthropic',
            'models': [
                'claude-opus-4-1-20250805',
                'claude-opus-4-20250514',
                'claude-sonnet-4-20250514',
                'claude-3-7-sonnet-20250219',
                'claude-3-5-haiku-20241022',
                'claude-3-haiku-20240307'
            ]
        },
        'bedrock': {
            'name': 'AWS Bedrock',
            'models': [
                # Latest Anthropic Claude on Bedrock (verify availability per region)
                'anthropic.claude-opus-4-1-20250805-v1:0',
                'anthropic.claude-opus-4-20250514-v1:0',
                'anthropic.claude-sonnet-4-20250514-v1:0',
                'anthropic.claude-3-7-sonnet-20250219-v1:0',
                'anthropic.claude-3-5-haiku-20241022-v1:0',
                'anthropic.claude-3-5-sonnet-20241022-v2:0',
                'anthropic.claude-3-opus-20240229-v1:0',
                'anthropic.claude-3-haiku-20240307-v1:0'
            ]
        }
    }
    path = _os.getenv('MODEL_CONFIG_JSON')
    cfg = default_cfg
    if path and _os.path.exists(path):
        try:
            with open(path, 'r') as f:
                cfg = _json.load(f)
        except Exception:
            cfg = default_cfg
    # Merge optional local override file
    override_path = './model_config.override.json'
    if _os.path.exists(override_path):
        try:
            with open(override_path, 'r') as f:
                override = _json.load(f)
                for k,v in (override or {}).items():
                    cfg[k] = v
        except Exception:
            pass
    return {
        'providers': cfg,
        'api_keys_configured': {
            'openai': bool(os.getenv('OPENAI_API_KEY')),
            'anthropic': bool(os.getenv('ANTHROPIC_API_KEY')),
            'aws': bool(os.getenv('AWS_ACCESS_KEY_ID') and os.getenv('AWS_SECRET_ACCESS_KEY') and os.getenv('AWS_REGION'))
        }
    }

@router.post("/model-config")
async def save_model_config(payload: Dict[str, Any]):
    """Persist model config override to a writable file model_config.override.json.
    Expected body: { providers: { provider: { name: string, models: string[] } } }
    """
    try:
        providers = payload.get('providers') or {}
        if not isinstance(providers, dict):
            raise HTTPException(status_code=400, detail='providers must be an object')
        import json as _json
        with open('./model_config.override.json', 'w') as f:
            _json.dump(providers, f, indent=2)
        return { 'status': 'ok' }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/model-test")
async def model_test(req: Dict[str, Any]):
    """Quick readiness test for provider+model.
    For OpenAI: runs a minimal request through a transient agent.
    For Anthropic/Bedrock: validates env credentials and returns readiness.
    """
    provider = (req.get('provider') or 'openai').lower()
    model_id = req.get('model_id') or 'gpt-4o-mini'
    try:
        if provider == 'openai':
            from strands import Agent
            from strands.models.openai import OpenAIModel
            key_ok = bool(os.getenv('OPENAI_API_KEY'))
            if not key_ok:
                return { 'ok': False, 'provider': provider, 'model_id': model_id, 'reason': 'OPENAI_API_KEY missing' }
            model = OpenAIModel(model_id=model_id, params={ 'temperature': 0.1, 'max_tokens': 64 })
            agent = Agent(model=model, system_prompt='You are a ping utility.')
            text = agent('Respond with OK only.')
            ok = isinstance(text, str) and ('OK' in text.upper())
            return { 'ok': ok, 'provider': provider, 'model_id': model_id, 'response_preview': (text[:80] if isinstance(text,str) else str(text)) }
        elif provider == 'anthropic':
            ready = bool(os.getenv('ANTHROPIC_API_KEY'))
            return { 'ok': ready, 'provider': provider, 'model_id': model_id, 'note': 'Runtime ping not implemented in this build' }
        elif provider == 'bedrock':
            ready = bool(os.getenv('AWS_ACCESS_KEY_ID') and os.getenv('AWS_SECRET_ACCESS_KEY') and os.getenv('AWS_REGION'))
            if not ready:
                return { 'ok': False, 'provider': provider, 'model_id': model_id, 'reason': 'AWS credentials/region missing' }
            # Attempt a lightweight invoke if boto3 is available
            try:
                import json as _json
                import boto3
                client = boto3.client('bedrock-runtime', region_name=os.getenv('AWS_REGION'))
                # Minimal Anthropic prompt for Claude on Bedrock
                body = {
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": 16,
                    "messages": [ { "role": "user", "content": [ { "type":"text", "text": "Reply with OK" } ] } ]
                }
                resp = client.invoke_model(modelId=model_id, body=_json.dumps(body))
                payload = _json.loads(resp.get('body').read().decode('utf-8')) if hasattr(resp.get('body'),'read') else {}
                # Try different shapes for text
                out = ''
                if isinstance(payload, dict):
                    if 'output_text' in payload:
                        out = payload.get('output_text','')
                    elif 'content' in payload and isinstance(payload['content'], list) and payload['content']:
                        part = payload['content'][0]
                        if isinstance(part, dict) and 'text' in part:
                            out = part['text']
                ok = 'OK' in (out or '').upper()
                return { 'ok': ok, 'provider': provider, 'model_id': model_id, 'response_preview': (out[:120] if isinstance(out,str) else str(out)) }
            except ModuleNotFoundError:
                return { 'ok': ready, 'provider': provider, 'model_id': model_id, 'note': 'boto3 not installed; cannot ping runtime' }
            except Exception as e:
                return { 'ok': False, 'provider': provider, 'model_id': model_id, 'error': str(e) }
        else:
            return { 'ok': False, 'provider': provider, 'model_id': model_id, 'reason': 'Unknown provider' }
    except Exception as e:
        return { 'ok': False, 'provider': provider, 'model_id': model_id, 'error': str(e) }

@router.post("/browse-playlist-strands-real/{session_id}")
async def browse_playlist(session_id: str, payload: Dict[str, Any]):
    """Server-driven browsing of a list of URLs using Playwright-based tool.
    Emits session events so the UI can show previews. Avoids browser popup policies.
    Body: { urls: string[], dwell_seconds?: int }
    """
    if session_id not in research_sessions:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")

    urls: List[str] = payload.get('urls') or []
    dwell = int(payload.get('dwell_seconds') or 8)
    top_n = int(payload.get('top_n') or 0)
    urls = [u for u in urls if isinstance(u, str) and u.startswith('http')]
    if top_n and top_n > 0:
        urls = urls[:top_n]
    if not urls:
        raise HTTPException(status_code=400, detail="No valid URLs provided")

    session = research_sessions[session_id]
    session.setdefault('events', []).append({'type': 'browse_start', 'total': len(urls), 'ts': datetime.now().isoformat()})

    def _runner():
        try:
            total = len(urls)
            for i, url in enumerate(urls, 1):
                session['events'].append({'type': 'browse_visit', 'index': i, 'total': total, 'url': url, 'ts': datetime.now().isoformat()})
                try:
                    # Use our reliable Playwright-based tool
                    _ = browse_and_capture(url)
                    # Emit a lightweight screenshot event (image itself already accessible via prior logic)
                    session['events'].append({'type': 'screenshot', 'url': url, 'description': f'Visited {url}', 'ts': datetime.now().isoformat()})
                    # AI skim using latest OCR text
                    try:
                        shots = get_captured_screenshots() or []
                        latest = shots[-1] if shots else {}
                        ocr_text = (latest.get('ocr_text') or '')[:2000]
                        if ocr_text:
                            skim_prompt = (
                                "You are an efficient research assistant. Read the page text and output STRICT JSON with: "
                                "{\"bullets\":[{\"type\":\"key_claim\",\"text\":string},{\"type\":\"evidence\",\"text\":string},{\"type\":\"uncertainty\",\"text\":string}],\"tags\":[string]} "
                                "Bullets must be short (<=160 chars). Tags include topic or date cues."
                            )
                            raw = use_llm_fixed(prompt=f"PAGE_TEXT:\n{ocr_text}", system_prompt=skim_prompt)
                            import json as _json
                            data = None
                            try:
                                data = _json.loads(raw) if isinstance(raw, str) else raw
                            except Exception:
                                data = None
                            if isinstance(data, dict):
                                session['events'].append({'type': 'skim_result', 'url': url, 'data': data, 'ts': datetime.now().isoformat()})
                    except Exception:
                        pass
                except Exception as _e:
                    session['events'].append({'type': 'browse_error', 'url': url, 'error': str(_e), 'ts': datetime.now().isoformat()})
                # Dwell between pages
                try:
                    import time as _time
                    # Allow cancellation
                    for _ in range(max(1, dwell)):
                        if session.get('browse_cancel'):
                            raise KeyboardInterrupt('cancelled')
                        _time.sleep(1)
                except Exception:
                    pass
            session['events'].append({'type': 'browse_done', 'count': total, 'ts': datetime.now().isoformat()})
        except Exception as e:
            if isinstance(e, KeyboardInterrupt):
                session['events'].append({'type': 'browse_cancelled', 'ts': datetime.now().isoformat()})
            else:
                session['events'].append({'type': 'browse_error', 'error': str(e), 'ts': datetime.now().isoformat()})

    threading.Thread(target=_runner, daemon=True).start()
    return { 'status': 'started', 'count': len(urls), 'dwell_seconds': dwell }

@router.post("/browse-cancel-strands-real/{session_id}")
async def browse_cancel(session_id: str):
    if session_id not in research_sessions:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    research_sessions[session_id]['browse_cancel'] = True
    return { 'status': 'ok' }

@router.post("/cancel-strands-real/{session_id}")
async def cancel_research(session_id: str):
    """Signal cancellation to the running research. Cooperative; returns immediately."""
    if session_id not in research_sessions:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    sess = research_sessions[session_id]
    sess['cancel'] = True
    sess.setdefault('events', []).append({'type': 'cancel_requested', 'ts': datetime.now().isoformat()})
    return { 'status': 'ok', 'message': 'Cancellation requested' }

@router.post("/check-links-strands-real/{session_id}")
async def check_links(session_id: str):
    """Check all source links for validity and emit link_status events."""
    if session_id not in research_sessions:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    session = research_sessions[session_id]
    sources = session.get('sources') or []
    if not sources:
        return { 'checked': 0 }
    import requests as _req
    ok = 0
    total = 0
    for s in sources:
        url = s.get('url')
        if not url:
            continue
        total += 1
        status_code = None
        is_ok = False
        try:
            resp = _req.head(url, allow_redirects=True, timeout=5)
            status_code = resp.status_code
            is_ok = 200 <= status_code < 400
            if not is_ok:
                # Try GET fallback
                resp = _req.get(url, allow_redirects=True, timeout=8)
                status_code = resp.status_code
                is_ok = 200 <= status_code < 400
        except Exception:
            is_ok = False
        if is_ok:
            ok += 1
        session.setdefault('events', []).append({
            'type': 'link_status',
            'url': url,
            'ok': bool(is_ok),
            'status_code': status_code,
            'ts': datetime.now().isoformat()
        })
    return { 'checked': total, 'ok': ok }

@router.get("/session-debug-strands-real/{session_id}")
async def session_debug(session_id: str):
    """Return a quick debug snapshot to verify session reuse and context."""
    if session_id not in research_sessions:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    sess = research_sessions[session_id]
    try:
        ctx = SESSION_SERVICE.analyze_session_context(session_id)
    except Exception:
        ctx = {"session_id": session_id, "error": "analyze_failed"}
    return {
        "session_id": session_id,
        "status": sess.get('status'),
        "steps_count": len(sess.get('steps', [])),
        "sources_count": len(sess.get('sources', [])),
        "events_count": len(sess.get('events', [])),
        "content_len": len(sess.get('content', '') or ''),
        "strands": ctx,
    }
