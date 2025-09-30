"""
AI State Machine Coordinator: AI agents dynamically create and execute state machines
Agents analyze tasks, create state graphs with tool calls, and execute them
"""

import asyncio
import json
import time
import logging
from typing import AsyncIterator, Dict, Any, Optional, List, Union, Set, Tuple
from dataclasses import dataclass, field
from enum import Enum

import os

# Optional strands imports
try:
    from strands import Agent
    from strands.models.openai import OpenAIModel
    STRANDS_AVAILABLE = True
except ImportError:
    STRANDS_AVAILABLE = False
    Agent = None
    OpenAIModel = None

from app.services.event_hub import TokenFrame, ControlFrame, ControlType, get_event_hub
from app.tools.tool_registry import ToolRegistry

# Optional tool imports
try:
    from app.tools.strands_tool_registry import get_dynamic_tools, StrandsToolRegistry
    from app.services.dynamic_tool_wrapper import DynamicToolWrapper
    TOOLS_AVAILABLE = True
except ImportError:
    TOOLS_AVAILABLE = False
    get_dynamic_tools = None
    StrandsToolRegistry = None
    DynamicToolWrapper = None
from app.services.strands_agent_runtime import StrandsAgentRuntime, StrandsAgentConfig
from app.services.agent_runtime import AgentContext
from app.services.tool_parameter_resolver import tool_parameter_resolver
from app.services.enhanced_context_manager import enhanced_context_manager, MissionContext

logger = logging.getLogger(__name__)


@dataclass
class StateNode:
    """Represents a state in the AI-generated state machine"""
    id: str
    name: str
    type: str  # 'analysis', 'tool_call', 'decision', 'parallel', 'final'
    task: str
    tools: List[str] = field(default_factory=list)
    transitions: Dict[str, str] = field(default_factory=dict)  # event -> next_state
    agent_config: Dict[str, Any] = field(default_factory=dict)
    position: Optional[Tuple[float, float]] = None


class AIStateMachineCoordinator:
    """Coordinator that uses AI to create and execute state machines"""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.hub = get_event_hub()
        self.config = config or {}
        self.tool_registry = ToolRegistry()
        self.active_agents: Dict[str, StrandsAgentRuntime] = {}
        self.strands_registry = None  # Will be initialized on first use
        # Persist graphs and execution context per execution id for reruns/patches
        self.graph_by_exec: Dict[str, Dict[str, Any]] = {}
        self.context_by_exec: Dict[str, Dict[str, Any]] = {}
        # Cache of available tools
        try:
            self._all_tools = self.tool_registry.get_all_tools()  # name -> instance
        except Exception:
            self._all_tools = {}
        # Simple alias map to translate AI-suggested tool labels to registry names
        self._tool_alias_map = {
            'web_search': 'tavily_search',
            'design_tool': 'diagram',
            'simulation_tool': 'python_repl',
            'browser': 'http_request',
            'extract_links': 'http_request',
            'fetch_webpage': 'http_request',
            'wikipedia_search': 'tavily_search',
        }
        # Aliases are optional; default off to prefer direct tool names
        self._enable_aliases = bool(self.config.get('enable_aliases', False))
        # Human-in-the-loop decision waiters per execution/state
        self._decision_waiters: Dict[str, asyncio.Future] = {}

    def _decision_key(self, exec_id: str, state_id: str) -> str:
        return f"{exec_id}:{state_id}"

    
    def submit_decision(self, exec_id: str, state_id: str, event: str, data: Optional[Any] = None) -> bool:
        """Submit a human decision or input. If data is provided, it is attached.
        The waiter receives a dict: {"event": str, "data": Any} for richer inputs.
        """
        key = self._decision_key(exec_id, state_id)
        fut = self._decision_waiters.get(key)
        if fut and not fut.done():
            try:
                fut.set_result({"event": event, "data": data})
            except Exception:
                # Fallback to event-only
                fut.set_result(event)
            return True
        return False

    async def _await_human_decision(self, exec_id: str, state: Dict[str, Any], allowed: list[str], timeout: float = 300.0) -> Optional[Union[str, Dict[str, Any]]]:
        """Publish a decision request and wait for user input via API.
        Returns either an event string or a dict with {"event", "data"} for input states.
        """
        # Notify UI
        await self.hub.publish_control(ControlFrame(
            exec_id=exec_id,
            type="human_decision_required",
            agent_id=state.get('id'),
            payload={
                "state": {
                    "id": state.get('id'),
                    "name": state.get('name'),
                    "type": state.get('type'),
                    "description": state.get('description'),
                    "agent_role": state.get('agent_role'),
                },
                "allowed_events": allowed
            }
        ))

        # Create waiter
        loop = asyncio.get_running_loop()
        fut: asyncio.Future = loop.create_future()
        key = self._decision_key(exec_id, state.get('id'))
        self._decision_waiters[key] = fut

        try:
            selected = await asyncio.wait_for(fut, timeout=timeout)
            return selected
        except asyncio.TimeoutError:
            logger.warning(f"Human decision timeout for {key}")
            return None
        finally:
            # Cleanup
            self._decision_waiters.pop(key, None)
        
    def _normalize_state_machine(self, machine: Dict[str, Any]) -> Dict[str, Any]:
        """Ensure consistency between states and edges, fill missing nodes, and sync transitions.
        - Deduplicate edges
        - Add placeholder states referenced by edges but missing in states
        - Build transitions on each state from edges if missing
        - Ensure initial_state exists
        - Map enhanced_blocks parameters to states for user input preservation
        """
        states = machine.get('states', []) or []
        edges = machine.get('edges', []) or []
        enhanced_blocks = machine.get('enhanced_blocks', []) or []

        # Create a map of enhanced blocks by ID for quick lookup
        enhanced_map = {}
        for block in enhanced_blocks:
            block_id = block.get('id')
            if block_id:
                enhanced_map[block_id] = block
                logger.debug(f"Found enhanced block {block_id} with data: {block.get('data', {})}")

        # Deduplicate edges
        seen = set()
        unique_edges = []
        for e in edges:
            key = (e.get('source'), e.get('target'), e.get('event'))
            if key not in seen:
                seen.add(key)
                unique_edges.append(e)
        edges = unique_edges

        # Index states by id
        state_map: Dict[str, Dict[str, Any]] = {}
        for s in states:
            sid = s.get('id') or s.get('name')
            if not sid:
                continue
            s['id'] = sid
            # Ensure transitions dict
            if 'transitions' not in s or not isinstance(s['transitions'], dict):
                s['transitions'] = {}

            # Map parameters from enhanced_blocks to states
            if sid in enhanced_map:
                enhanced_block = enhanced_map[sid]
                block_data = enhanced_block.get('data', {})

                # Extract tool parameters from enhanced block
                if block_data.get('parameters'):
                    s['tool_parameters'] = block_data['parameters']
                    logger.info(f"Mapped user parameters for state {sid}: {block_data['parameters']}")

                # Also preserve the tool name from enhanced block
                if block_data.get('toolName'):
                    if 'tools' not in s:
                        s['tools'] = []
                    if block_data['toolName'] not in s['tools']:
                        s['tools'].append(block_data['toolName'])

            state_map[sid] = s

        # Add placeholder states for any referenced ids missing
        def ensure_state(node_id: str):
            if node_id in state_map or node_id is None:
                return
            placeholder_type = 'final' if any(k in node_id.lower() for k in ['final', 'success', 'failure', 'abort']) else 'analysis'
            state_map[node_id] = {
                'id': node_id,
                'name': node_id.replace('_', ' ').title(),
                'type': placeholder_type,
                'task': f'Auto-added placeholder for {node_id}',
                'transitions': {}
            }

        for e in edges:
            ensure_state(e.get('source'))
            ensure_state(e.get('target'))

        # Rebuild states list
        states = list(state_map.values())

        # Resolve planned tools for each state at creation time
        for s in states:
            try:
                planned = self._resolve_tool_names_for_state(s)
                # Always overwrite tools with planned list to remove arbitrary AI names
                s['tools'] = planned
                # Announce planned tools so UI can show them immediately
                try:
                    # Will be published later when exec_id exists; here we only annotate
                    pass
                except Exception:
                    pass
            except Exception:
                continue

        # Build transitions from edges (merge with existing)
        for e in edges:
            src = e.get('source'); tgt = e.get('target'); ev = e.get('event')
            if not src or not ev or src not in state_map:
                continue
            state_map[src]['transitions'][ev] = tgt

        # Infer decision states by transition vocabulary if type is missing/incorrect
        decision_markers = {'approve', 'reject', 'escalate'}
        for s in state_map.values():
            if s.get('type') == 'final':
                continue
            trans = set((s.get('transitions') or {}).keys())
            if trans & decision_markers:
                s['type'] = 'decision'

        # Ensure initial_state exists
        init = machine.get('initial_state')
        if not init or init not in state_map:
            # Pick a sensible initial: 'initialization' if present, else first state
            init = 'initialization' if 'initialization' in state_map else (states[0]['id'] if states else 'start')
            machine['initial_state'] = init

        machine['states'] = states
        machine['edges'] = edges
        return machine

    def _tool_inventory_text(self, names: Optional[List[str]] = None) -> str:
        """Return a concise list of tools and descriptions.
        If names is provided, limit to those; otherwise respect restrict_to_selected preferences.
        """
        tools = self._all_tools or {}
        prefs = self.config.get('tool_preferences') or {}
        sel = set(prefs.get('selected_tools') or [])
        restrict = bool(prefs.get('restrict_to_selected', False))

        list_names: List[str]
        if names is not None:
            list_names = names  # Use provided names directly
        elif restrict and sel:
            list_names = list(sel)
        else:
            list_names = list(tools.keys()) if tools else []
        
        lines = []
        for n in list_names[:50]:
            # Get description from tool registry or use empty string
            desc = ''
            if n in tools:
                tool = tools.get(n)
                if isinstance(tool, dict):
                    desc = tool.get('description', '')
                else:
                    desc = getattr(tool, 'description', '') or ''
            lines.append(f"- {n}: {desc}")
        return "\n".join(lines)

    def _resolve_tools_for_state(self, state: Dict[str, Any]) -> List[Any]:
        """Pick the best matching tools for a state using simple heuristics.
        - If state specifies tools, use those (and ignore unknowns)
        - Else choose a subset based on state name/description/type
        - Exclude tools that require approval unless config allows
        """
        available = self._all_tools or {}
        prefs = self.config.get('tool_preferences') or {}
        sel = set(prefs.get('selected_tools') or [])
        restrict = bool(prefs.get('restrict_to_selected', False))
        allow_approval = bool(self.config.get('allow_approval_tools') or prefs.get('allow_approval_tools', False))
        names = []
        # use explicitly requested tools first
        for t in (state.get('tools') or []):
            if t in available and (not restrict or t in sel):
                names.append(t)
        if not names:
            text = f"{state.get('name','')} {state.get('description','')} {state.get('task','')}".lower()
            def add_if_present(opts: List[str]):
                for o in opts:
                    if o in available and o not in names and (not restrict or o in sel):
                        names.append(o)

            if any(k in text for k in ['research', 'search', 'gather', 'web', 'news']):
                add_if_present(['tavily_search', 'http_request', 'file_read'])
            if any(k in text for k in ['design', 'diagram', 'architecture']):
                add_if_present(['diagram'])
            if any(k in text for k in ['develop', 'code', 'script', 'generate code', 'implementation']):
                add_if_present(['python_repl', 'shell_command'])
            if any(k in text for k in ['file', 'document', 'write', 'save']):
                add_if_present(['file_read', 'file_write', 'editor'])
            if any(k in text for k in ['plan', 'task', 'todo']):
                add_if_present(['task_planner', 'agent_todo'])
            if not names:
                # general-purpose safe defaults
                add_if_present(['http_request', 'file_read'])

        # Filter out tools that explicitly require approval unless permitted
        resolved: List[Any] = []
        for n in names:
            tool = available.get(n)
            if not tool:
                continue
            requires_approval = getattr(tool, 'requires_approval', False)
            if requires_approval and not allow_approval:
                continue
            resolved.append(tool)

        # Cap the number to keep prompts light
        return resolved[:6]

    def _alias_tool_name(self, name: str) -> str:
        if not self._enable_aliases:
            return name
        return self._tool_alias_map.get(name, name)

    def _resolve_tool_names_for_state(self, state: Dict[str, Any]) -> List[str]:
        """Resolve preferred tool NAMES for a state using aliases, prefs, and heuristics."""
        available = set((self._all_tools or {}).keys())
        prefs = self.config.get('tool_preferences') or {}
        sel = set(prefs.get('selected_tools') or [])
        restrict = bool(prefs.get('restrict_to_selected', False))
        allow_approval = bool(self.config.get('allow_approval_tools') or prefs.get('allow_approval_tools', False))

        # Start from state-declared tools (after aliasing)
        declared = [self._alias_tool_name(t) for t in (state.get('tools') or [])]
        names: List[str] = []
        for t in declared:
            if t in available and (not restrict or t in sel):
                names.append(t)

        # If empty and state is a tool_call, use heuristics via instance resolution
        if not names and state.get('type') == 'tool_call':
            tool_objs = self._resolve_tools_for_state(state)
            # reverse map instance -> name
            rev = {v: k for k, v in (self._all_tools or {}).items()}
            for obj in tool_objs:
                n = rev.get(obj)
                if not n:
                    # best-effort: skip unnamed
                    continue
                if restrict and n not in sel:
                    continue
                # if requires approval and not allowed, coordinator already filtered
                names.append(n)

        # De-dup and cap
        seen = set()
        final: List[str] = []
        for n in names:
            if n in seen:
                continue
            # respect approval preference again using metadata if available
            tool = (self._all_tools or {}).get(n)
            if tool:
                req = getattr(tool, 'requires_approval', False)
                if req and not allow_approval:
                    continue
            seen.add(n)
            final.append(n)
        return final[:6]

    def _build_planner_prompt(
        self,
        task: str,
        allowed_tools_text: str,
        min_states: int,
        max_states: int,
        min_parallel_branches: int
    ) -> str:
        phase_min = max(1, min_states // 6)  # rough phase quota
        return f"""You are an AI state‑machine architect. Design a rigorous, production‑grade workflow for the task below. Be ambitious (parallelism, retries, validation), yet precise and minimal in assumptions.

Task: {task}

AVAILABLE_TOOLS = {allowed_tools_text}

TARGET COMPLEXITY
- Minimum states: {min_states}
- Preferred range: {min_states}–{max_states}
- Parallel branches: at least {min_parallel_branches} independent branches somewhere in the flow

HARD RULES
- Use ONLY names listed in AVAILABLE_TOOLS for any tool_call state. Never invent or alias names.
- If a state performs external research/search/browsing and 'tavily_search' is available, include it in tools.
- Every state MUST have a unique, slug‑style id (lowercase, a–z, 0–9, underscores only) and a concise, human‑readable name.
- Every non‑final state MUST declare transitions for at least success and one alternative (failure, retry, timeout, needs_review, etc.).
- Prefer parallel where independent work exists; gate with decision/validation states when necessary.
- Include explicit validation, rollback/error‑recovery, and a clear success and failure final state.

DESIGN GUIDELINES
- Phase the flow: initialization → research/planning → execution → validation → reporting → finals.
- Use tool_call states only when tool use is actually needed; analysis states elsewhere.
- Add proactive quality checks: schema checks, invariants, canary/shadow tests, and synthetic monitoring where applicable.
- Build retry loops with capped attempts and exponential backoff; add timeout branches.
- Where helpful, add decision (human‑in‑the‑loop) states with allowed events like approve/reject/escalate.
- Prefer smaller focused states over mega‑states; keep descriptions actionable.
- Rough quotas (not fields in output): ≥{phase_min} states per major phase where applicable.

Return a JSON object with this EXACT structure (no extra text before/after):
{{
    "name": "Dynamic Workflow for [task name]",
    "initial_state": "initialization",
    "states": [
        {{
            "id": "unique_state_id",
            "name": "State Display Name",
            "type": "analysis|tool_call|decision|input|parallel|final",
            "description": "What this state does",
            "agent_role": "Role of the agent",
            "tools": ["tool1", "tool2"],  // if type is tool_call
            "transitions": {{
                "event_name": "target_state_id"
            }}
        }}
    ],
    "edges": [
        {{
            "source": "source_state_id",
            "target": "target_state_id",
            "event": "success|failure|retry|timeout|validated|etc"
        }}
    ]
}}

CHECKLIST (must satisfy before returning JSON)
- Tool names are strictly from AVAILABLE_TOOLS; omit any that aren't present.
- Research/gathering states include "tavily_search" when available.
- Parallel stages for independent work; explicit joins via decision/validation states.
- Retries with capped attempts (e.g., 2–3) and backoff via retry/timeout transitions.
- Final states for both success and failure with clear entry conditions.

HINTS
- Favor more, smaller states with tight responsibilities.
- Prefer descriptive events (validated, invalid, timeout, partial_success, needs_review, rollback, escalate).
- Where human approval matters, add a decision state with allowed events (approve/reject/escalate).
"""

    async def analyze_and_create_state_machine(self, task: str) -> Dict[str, Any]:
        """Use AI to dynamically generate a complete state machine based on the task"""

        # PHASE 1: Lightweight Planning - Send only tool names (not full schemas)
        # This is much more efficient than sending 3000+ lines of tool schemas

        # Get list of available tool names only
        tool_names = tool_parameter_resolver.get_tool_names_only()

        # Apply preferences if any
        prefs = self.config.get('tool_preferences') or {}
        selected = list(prefs.get('selected_tools') or [])
        restrict = bool(prefs.get('restrict_to_selected', False))

        if restrict and selected:
            allowed_tools = [n for n in selected if n in tool_names]
        else:
            allowed_tools = tool_names

        # Format tools as a proper list for clarity (names only, no schemas)
        if allowed_tools:
            allowed_text = "[" + ", ".join(f'"{tool}"' for tool in allowed_tools[:50]) + "]"  # Limit to 50 most common
        else:
            allowed_text = "[]"

        prompt = f"""You are an AI state‑machine architect. Design a rigorous, production‑grade workflow for the task below. Be ambitious (parallelism, retries, validation), yet precise and minimal in assumptions.

Task: {task}

AVAILABLE_TOOLS = {allowed_text}

HARD RULES
- Use ONLY names listed in AVAILABLE_TOOLS for any tool_call state. Never invent or alias names.
- If a state performs external research/search/browsing, include "tavily_search" when present in AVAILABLE_TOOLS.
- Every state MUST have a unique, slug‑style id (lowercase, a–z, 0–9, underscores only) and a concise, human‑readable name.
- Every non‑final state MUST declare transitions for at least success and one alternative (failure, retry, timeout, needs_review, etc.).
- Prefer parallel where independent work exists; gate with decision states when necessary.
- Include explicit validation, rollback/error‑recovery, and a clear success and failure final state.

DESIGN GUIDELINES
- Think in phases: initialization → research/planning → generation/execution → validation → rollout/reporting → final.
- Use tool_call states only when tool use is actually needed; analysis states elsewhere.
- Use 'input' type for collecting user data (research topic, parameters, etc)
- Use 'decision' type ONLY for approve/reject/escalate choices
- Add proactive quality checks: data validation, consistency checks, guardrails, shadow tests, and synthetic monitoring.
- Build retry loops with capped attempts and exponential backoff; add timeout branches.
- Where helpful, add decision states for approval with events like approve/reject/escalate.
- Prefer smaller focused states over mega‑states; keep descriptions actionable.

Return a JSON object with this EXACT structure (no extra text before/after):
{{
    "name": "Dynamic Workflow for [task name]",
    "initial_state": "initialization",
    "states": [
        {{
            "id": "unique_state_id",
            "name": "State Display Name",
            "type": "analysis|tool_call|decision|input|parallel|final",
            "description": "What this state does",
            "agent_role": "Role of the agent",
            "tools": ["tool1", "tool2"],  // if type is tool_call
            "transitions": {{
                "event_name": "target_state_id"
            }}
        }}
    ],
    "edges": [
        {{
            "source": "source_state_id",
            "target": "target_state_id",
            "event": "success|failure|retry|timeout|validated|etc"
        }}
    ]
}}

CHECKLIST (must satisfy before returning JSON)
- Tool names are strictly from AVAILABLE_TOOLS; omit any that aren't present.
- Research/gathering states include "tavily_search" when available.
- Parallel stages for independent work; explicit joins via decision/validation states.
- Retries with capped attempts (e.g., 2–3) and backoff via retry/timeout transitions.
- Final states for both success and failure with clear entry conditions.

HINTS\n"
"- Favor more, smaller states with tight responsibilities.\n"
"- Prefer descriptive events (validated, invalid, timeout, partial_success, needs_review, rollback, escalate).\n"
"- Where human approval matters, add a decision state with allowed events (approve/reject/escalate).\n"

Example events you can use: success, failure, retry, timeout, validated, invalid, partial_success, needs_review, approve, reject, escalate, rollback, skip, cancel.

Output only the JSON object. No commentary.
"""
        
        try:
            # Use AI to generate the complete state machine
            import os
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                logger.warning("No OpenAI API key found, using fallback")
                return self.create_fallback_dynamic_state_machine(task)
            
            model = OpenAIModel(
                client_args={"api_key": api_key},
                model_id="gpt-4o-mini",
                params={"temperature": 0.3, "max_tokens": 16000}  # Maximum for complex workflows
            )
            
            planner = Agent(
                name="state_machine_planner",
                system_prompt=(
                    "ROLE\n"
                    "You are an elite state‑machine architect for mission‑critical systems. You design layered,\n"
                    "fault‑tolerant workflows that balance parallelism, guardrails, and clear exit criteria.\n\n"
                    "CONSTRAINTS\n"
                    "- OUTPUT: Return STRICT, valid JSON only (no prose).\n"
                    "- IDS: slug_case only (a–z, 0–9, underscores), unique.\n"
                    "- TRANSITIONS: Every non‑final state declares at least success + one alternative.\n"
                    "- TOOLS: Use only names provided by the caller (no aliases or inventions).\n"
                    "- PRIVACY: Do not include chain‑of‑thought or explanations.\n\n"
                    "ARCHITECTURE DIRECTIVES\n"
                    "- Phase the flow: initialization → research/planning → execution → validation → reporting → finals.\n"
                    "- Parallelize independent work; join via decision/validation gates.\n"
                    "- Add quality gates: schema checks, invariants, canary/shadow tests where applicable.\n"
                    "- Add robust failure handling: retry (capped), timeout, rollback, escalate/needs_review.\n"
                    "- Provide clear final_success and final_failure states.\n\n"
                    "TOOL DISCIPLINE\n"
                    "- Mark a state as type=tool_call only if a tool is actually needed.\n"
                    "- Include only permitted tool names from the list provided.\n"
                    "- If research/browsing is needed and 'tavily_search' is available, include it.\n"
                    "- DO NOT include tool parameters - they will be resolved separately.\n\n"
                    "VALIDATION BEFORE OUTPUT\n"
                    "- Validate edges reference existing states.\n"
                    "- Validate every tool name is permitted.\n"
                    "- Validate initial_state exists.\n"
                ),
                model=model
            )

            # Complexity knobs
            min_states = int(self.config.get('min_states', 16))
            max_states = int(self.config.get('max_states', 40))
            min_parallel_branches = int(self.config.get('min_parallel_branches', 2))

            prompt = self._build_planner_prompt(
                task=task,
                allowed_tools_text=allowed_text,
                min_states=min_states,
                max_states=max_states,
                min_parallel_branches=min_parallel_branches,
            )

            response = planner(prompt)
            response_text = str(response)
            
            # Try to parse the AI response as JSON
            import json
            
            # Extract JSON from the response (AI might include explanation text)
            json_start = response_text.find('{')
            json_end = response_text.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                json_str = response_text[json_start:json_end]
                state_machine = json.loads(json_str)
                
                count = len(state_machine.get('states', []) or [])
                logger.info(f"AI generated state machine with {count} states")

                # Only regenerate if explicitly requested and count is very low
                auto_regenerate = self.config.get('auto_regenerate', False)  # Default to False
                if auto_regenerate and count < min_states and count < 5:  # Only if very low
                    logger.info(f"State count {count} is very low, attempting ONE regeneration")
                    try:
                        regen_prompt = prompt + f"\n\nNOTE: Please generate a more detailed workflow with AT LEAST {min_states} states."
                        response2 = planner(regen_prompt)
                        response_text2 = str(response2)
                        js_start2 = response_text2.find('{')
                        js_end2 = response_text2.rfind('}') + 1
                        if js_start2 >= 0 and js_end2 > js_start2:
                            state_machine2 = json.loads(response_text2[js_start2:js_end2])
                            normalized2 = self._normalize_state_machine(state_machine2)
                            # Phase 2 for regenerated workflow
                            try:
                                normalized2 = await tool_parameter_resolver.resolve_parameters(normalized2, task)
                            except Exception as param_error2:
                                logger.warning(f"Failed to resolve params for regen: {param_error2}")
                            return normalized2
                    except Exception as regen_error:
                        logger.error(f"Regeneration failed, using original: {regen_error}")
                        # Fall through to use original

                # Normalize the state machine
                normalized = self._normalize_state_machine(state_machine)

                # PHASE 2: Parameter Resolution
                # Now that we have the workflow with tool names, resolve parameters
                logger.info("Phase 2: Resolving tool parameters for selected tools")
                try:
                    normalized = await tool_parameter_resolver.resolve_parameters(normalized, task)
                except Exception as param_error:
                    logger.warning(f"Failed to resolve parameters, using defaults: {param_error}")

                return normalized
            
        except Exception as e:
            logger.error(f"Failed to generate AI state machine: {e}")
        
        # Fallback: Create a dynamic example (but this should rarely be used)
        fallback = self._normalize_state_machine(self.create_fallback_dynamic_state_machine(task))
        # Try to resolve parameters even for fallback
        try:
            fallback = await tool_parameter_resolver.resolve_parameters(fallback, task)
        except Exception:
            pass  # Use fallback as-is
        return fallback
    
    def create_fallback_dynamic_state_machine(self, task: str) -> Dict[str, Any]:
        """Fallback to create a basic dynamic state machine when AI fails"""
        # This is just a fallback - the AI should normally generate everything
        states = []
        edges = []
        
        # Basic flow for ANY task
        states.extend([
            {
                "id": "initialization",
                "name": "System Initialization",
                "type": "analysis",
                "description": f"Initialize system for task: {task}",
                "agent_role": "System Coordinator",
                "transitions": {"success": "planning", "failure": "init_recovery"}
            },
            {
                "id": "planning",
                "name": "Task Planning",
                "type": "analysis", 
                "description": "Analyze requirements and create execution plan",
                "agent_role": "Planning Specialist",
                "transitions": {"success": "execution", "needs_info": "research", "invalid": "abort"}
            },
            {
                "id": "research",
                "name": "Information Gathering",
                "type": "tool_call",
                "description": "Gather necessary information",
                "agent_role": "Research Agent",
                "tools": ["web_search"],
                "transitions": {"success": "execution", "failure": "research_retry", "timeout": "abort"}
            },
            {
                "id": "execution",
                "name": "Main Execution",
                "type": "parallel",
                "description": "Execute the main task",
                "agent_role": "Execution Team",
                "transitions": {"success": "validation", "partial_success": "recovery", "failure": "troubleshooting"}
            },
            {
                "id": "validation",
                "name": "Result Validation", 
                "type": "decision",
                "description": "Validate execution results",
                "agent_role": "QA Specialist",
                "transitions": {"valid": "finalization", "invalid": "execution", "needs_review": "review"}
            },
            {
                "id": "finalization",
                "name": "Task Completion",
                "type": "final",
                "description": "Successfully completed task",
                "agent_role": "Completion Handler",
                "transitions": {}
            },
            {
                "id": "abort",
                "name": "Task Aborted",
                "type": "final",
                "description": "Task aborted due to unrecoverable error",
                "agent_role": "Error Handler",
                "transitions": {}
            }
        ])
        
        # Build edges from transitions
        for state in states:
            for event, target in state.get("transitions", {}).items():
                edges.append({
                    "source": state["id"],
                    "target": target,
                    "event": event
                })
        
        return {
            "name": f"Fallback Workflow: {task[:50]}",
            "initial_state": "initialization",
            "states": states,
            "edges": edges
        }
    
    def create_advanced_state_machine(self, task: str, needs_search: bool, needs_code: bool, needs_analysis: bool, needs_creative: bool) -> Dict[str, Any]:
        """Create an advanced state machine with sophisticated workflow"""
        states = []
        edges = []
        
        # Initial planning state
        states.append({
            "id": "taskPlanning",
            "name": "Task Planning",
            "type": "analysis",
            "task": f"Analyze and decompose: {task}",
            "agent_role": "Strategic Planner",
            "transitions": {"success": "requirementsAnalysis"}
        })
        
        # Requirements analysis
        states.append({
            "id": "requirementsAnalysis", 
            "name": "Requirements Analysis",
            "type": "analysis",
            "task": "Extract detailed requirements and constraints",
            "agent_role": "Requirements Analyst",
            "transitions": {"success": "resourceIdentification"}
        })
        edges.append({"source": "taskPlanning", "target": "requirementsAnalysis", "event": "success"})
        
        # Resource identification
        states.append({
            "id": "resourceIdentification",
            "name": "Resource Identification",
            "type": "parallel",
            "task": "Identify needed resources and tools",
            "agent_role": "Resource Manager",
            "transitions": {"success": "dataGathering" if needs_search else "implementation"}
        })
        edges.append({"source": "requirementsAnalysis", "target": "resourceIdentification", "event": "success"})
        
        # Data gathering phase (if needed)
        if needs_search:
            states.append({
                "id": "dataGathering",
                "name": "Data Gathering",
                "type": "tool_call",
                "task": "Gather relevant information from multiple sources",
                "tools": ["web_search", "tavily_search"],
                "agent_role": "Research Specialist",
                "transitions": {"success": "dataValidation", "failure": "fallbackResearch"}
            })
            edges.append({"source": "resourceIdentification", "target": "dataGathering", "event": "success"})
            
            states.append({
                "id": "dataValidation",
                "name": "Data Validation",
                "type": "analysis",
                "task": "Validate and cross-reference gathered data",
                "agent_role": "Data Validator",
                "transitions": {"success": "implementation"}
            })
            edges.append({"source": "dataGathering", "target": "dataValidation", "event": "success"})
            
            states.append({
                "id": "fallbackResearch",
                "name": "Fallback Research",
                "type": "tool_call",
                "task": "Alternative research methods",
                "agent_role": "Backup Researcher",
                "transitions": {"success": "implementation", "failure": "errorHandling"}
            })
            edges.append({"source": "dataGathering", "target": "fallbackResearch", "event": "failure"})
            edges.append({"source": "fallbackResearch", "target": "implementation", "event": "success"})
            edges.append({"source": "dataValidation", "target": "implementation", "event": "success"})
        else:
            edges.append({"source": "resourceIdentification", "target": "implementation", "event": "success"})
        
        # Implementation phase
        if needs_code:
            states.append({
                "id": "implementation",
                "name": "Code Implementation",
                "type": "tool_call",
                "task": "Implement the solution with code",
                "tools": ["python_repl", "editor"],
                "agent_role": "Software Developer",
                "transitions": {"success": "codeReview", "failure": "debugging"}
            })
            
            states.append({
                "id": "codeReview",
                "name": "Code Review",
                "type": "analysis",
                "task": "Review code for quality and correctness",
                "agent_role": "Code Reviewer",
                "transitions": {"success": "testing", "failure": "implementation"}
            })
            edges.append({"source": "implementation", "target": "codeReview", "event": "success"})
            
            states.append({
                "id": "testing",
                "name": "Testing",
                "type": "tool_call",
                "task": "Test the implementation",
                "tools": ["python_repl"],
                "agent_role": "QA Engineer",
                "transitions": {"success": "optimization", "failure": "debugging"}
            })
            edges.append({"source": "codeReview", "target": "testing", "event": "success"})
            edges.append({"source": "codeReview", "target": "implementation", "event": "failure"})
            
            states.append({
                "id": "debugging",
                "name": "Debugging",
                "type": "tool_call",
                "task": "Debug and fix issues",
                "agent_role": "Debug Specialist",
                "transitions": {"success": "testing", "failure": "errorHandling"}
            })
            edges.append({"source": "implementation", "target": "debugging", "event": "failure"})
            edges.append({"source": "testing", "target": "debugging", "event": "failure"})
            edges.append({"source": "debugging", "target": "testing", "event": "success"})
            
            next_state = "optimization"
        else:
            states.append({
                "id": "implementation",
                "name": "Solution Implementation",
                "type": "analysis",
                "task": "Implement the solution",
                "agent_role": "Implementation Specialist",
                "transitions": {"success": "optimization"}
            })
            next_state = "optimization"
        
        # Optimization
        states.append({
            "id": "optimization",
            "name": "Optimization",
            "type": "parallel",
            "task": "Optimize the solution",
            "agent_role": "Optimization Team",
            "transitions": {"success": "qualityAssurance"}
        })
        edges.append({"source": "testing" if needs_code else "implementation", "target": "optimization", "event": "success"})
        
        # Quality assurance
        states.append({
            "id": "qualityAssurance",
            "name": "Quality Assurance",
            "type": "decision",
            "task": "Final quality check and validation",
            "agent_role": "QA Manager",
            "transitions": {"success": "documentation", "failure": "optimization"}
        })
        edges.append({"source": "optimization", "target": "qualityAssurance", "event": "success"})
        edges.append({"source": "qualityAssurance", "target": "optimization", "event": "failure"})
        
        # Documentation
        states.append({
            "id": "documentation",
            "name": "Documentation",
            "type": "analysis",
            "task": "Create comprehensive documentation",
            "agent_role": "Technical Writer",
            "transitions": {"success": "delivery"}
        })
        edges.append({"source": "qualityAssurance", "target": "documentation", "event": "success"})
        
        # Final delivery
        states.append({
            "id": "delivery",
            "name": "Final Delivery",
            "type": "final",
            "task": "Package and deliver the complete solution",
            "agent_role": "Delivery Manager",
            "transitions": {}
        })
        edges.append({"source": "documentation", "target": "delivery", "event": "success"})
        
        # Error handling
        states.append({
            "id": "errorHandling",
            "name": "Error Recovery",
            "type": "analysis",
            "task": "Handle errors and provide fallback solutions",
            "agent_role": "Error Recovery Specialist",
            "transitions": {"success": "delivery", "failure": "criticalFailure"}
        })
        edges.append({"source": "fallbackResearch", "target": "errorHandling", "event": "failure"})
        edges.append({"source": "debugging", "target": "errorHandling", "event": "failure"})
        edges.append({"source": "errorHandling", "target": "delivery", "event": "success"})
        
        # Critical failure
        states.append({
            "id": "criticalFailure",
            "name": "Critical Failure",
            "type": "final",
            "task": "Report critical failure and provide recommendations",
            "agent_role": "Incident Manager",
            "transitions": {}
        })
        edges.append({"source": "errorHandling", "target": "criticalFailure", "event": "failure"})
        
        return {
            "name": "Advanced AI Workflow",
            "states": states,
            "initial_state": "taskPlanning",
            "edges": edges
        }
    
    def create_dynamic_state_machine(self, task: str, needs_search: bool, needs_analysis: bool) -> Dict[str, Any]:
        """Create a dynamic state machine based on task requirements"""
        states = []
        edges = []
        
        # Always start with task analysis
        states.append({
            "id": "analyze",
            "name": "Analyze Task",
            "type": "analysis",
            "task": f"Analyze the following request and create a detailed plan: {task}. Break it down into clear components and identify key requirements.",
            "agent_role": "Task Analyst and Planner",
            "position": (100, 100),
            "transitions": {
                "success": "research" if needs_search else "process"
            }
        })
        
        current_y = 200
        
        # Add search state if needed
        if needs_search:
            states.append({
                "id": "research",
                "name": "Research & Gather Data",
                "type": "tool_call",
                "task": "Search for relevant information and gather data",
                "tools": ["web_search", "file_read"],
                "agent_role": "Research Agent",
                "position": (100, current_y),
                "transitions": {
                    "success": "validate",
                    "failure": "error"
                }
            })
            edges.append({"source": "analyze", "target": "research", "event": "success"})
            current_y += 100
            
            # Add validation after search
            states.append({
                "id": "validate",
                "name": "Validate Information",
                "type": "analysis",
                "task": "Validate and verify gathered information",
                "agent_role": "Data Validator",
                "position": (100, current_y),
                "transitions": {
                    "success": "process"
                }
            })
            edges.append({"source": "research", "target": "validate", "event": "success"})
            edges.append({"source": "research", "target": "error", "event": "failure"})
            edges.append({"source": "validate", "target": "process", "event": "success"})
            current_y += 100
        else:
            edges.append({"source": "analyze", "target": "process", "event": "success"})
        
        # Add processing state
        states.append({
            "id": "process",
            "name": "Process Information",
            "type": "analysis",
            "task": "Process and synthesize the information gathered. Transform raw data into structured insights.",
            "agent_role": "Information Synthesizer",
            "position": (100, current_y),
            "transitions": {
                "success": "generate"
            }
        })
        current_y += 100
        
        # Add analysis state if needed
        if needs_analysis:
            states.append({
                "id": "deep_analysis",
                "name": "Deep Analysis",
                "type": "parallel",  # Can run multiple analysis agents
                "task": "Perform comprehensive analysis from multiple perspectives",
                "agent_role": "Analysis Team",
                "position": (300, current_y - 100),
                "transitions": {
                    "success": "generate"
                }
            })
            # Process feeds into both generate and deep_analysis
            states[-2]["transitions"]["success"] = "deep_analysis"  # Update process state
            edges.append({"source": "process", "target": "deep_analysis", "event": "success"})
            edges.append({"source": "deep_analysis", "target": "generate", "event": "success"})
        else:
            edges.append({"source": "process", "target": "generate", "event": "success"})
        
        # Generate output
        states.append({
            "id": "generate",
            "name": "Generate Output",
            "type": "analysis",
            "task": f"Generate the final output for: {task}. Use all previous agent outputs to create a comprehensive, actionable result.",
            "agent_role": "Output Generator and Finalizer",
            "position": (100, current_y),
            "transitions": {
                "success": "review"
            }
        })
        edges.append({"source": "generate", "target": "review", "event": "success"})
        current_y += 100
        
        # Add review state
        states.append({
            "id": "review",
            "name": "Review & Finalize",
            "type": "decision",
            "task": "Review the generated output for quality, completeness, and accuracy. Determine if it fully addresses the original request.",
            "agent_role": "Quality Assurance Specialist",
            "position": (100, current_y),
            "transitions": {
                "success": "complete",
                "failure": "generate"  # Loop back if quality issues
            }
        })
        edges.append({"source": "review", "target": "complete", "event": "success"})
        edges.append({"source": "review", "target": "generate", "event": "failure"})
        current_y += 100
        
        # Complete state
        states.append({
            "id": "complete",
            "name": "Complete",
            "type": "final",
            "task": "Task completed successfully",
            "position": (100, current_y),
            "transitions": {}
        })
        
        # Error state
        states.append({
            "id": "error",
            "name": "Error Handler",
            "type": "final",
            "task": "Handle errors and provide fallback",
            "position": (300, current_y),
            "transitions": {}
        })
        
        return {
            "name": "Dynamic AI Workflow",
            "states": states,
            "initial_state": "analyze",
            "edges": edges,
            "metadata": {
                "task": task,
                "needs_search": needs_search,
                "needs_analysis": needs_analysis,
                "created_by": "AI State Machine Coordinator"
            }
        }
    
    def create_fallback_state_machine(self, task: str) -> Dict[str, Any]:
        """Create a simple fallback state machine"""
        return {
            "name": "Dynamic Workflow",
            "states": [
                {
                    "id": "analyze",
                    "name": "Analyze Task",
                    "type": "analysis",
                    "task": f"Analyze and understand: {task}",
                    "agent_role": "Task Analyst",
                    "transitions": {
                        "success": "research"
                    }
                },
                {
                    "id": "research",
                    "name": "Research & Gather Data",
                    "type": "tool_call",
                    "task": "Gather relevant information",
                    "tools": ["web_search", "file_read"],
                    "agent_role": "Research Agent",
                    "transitions": {
                        "success": "process",
                        "failure": "error"
                    }
                },
                {
                    "id": "process",
                    "name": "Process Information",
                    "type": "analysis",
                    "task": "Process and synthesize gathered information",
                    "agent_role": "Data Processor",
                    "transitions": {
                        "success": "generate"
                    }
                },
                {
                    "id": "generate",
                    "name": "Generate Output",
                    "type": "analysis",
                    "task": "Generate final output and recommendations",
                    "agent_role": "Output Generator",
                    "transitions": {
                        "success": "complete"
                    }
                },
                {
                    "id": "complete",
                    "name": "Complete",
                    "type": "final",
                    "task": "Workflow completed",
                    "transitions": {}
                },
                {
                    "id": "error",
                    "name": "Error Handler",
                    "type": "final",
                    "task": "Handle errors",
                    "transitions": {}
                }
            ],
            "initial_state": "analyze",
            "edges": [
                {"source": "analyze", "target": "research", "event": "success"},
                {"source": "research", "target": "process", "event": "success"},
                {"source": "research", "target": "error", "event": "failure"},
                {"source": "process", "target": "generate", "event": "success"},
                {"source": "generate", "target": "complete", "event": "success"}
            ]
        }
    
    def _parse_next_event(self, output: str, allowed: list[str]) -> Optional[str]:
        """Parse or infer the next event from model output constrained to allowed transitions.
        Strategy:
        - Look for an explicit line: "NEXT_EVENT: <event>"
        - If not present, use lightweight keyword heuristics
        - Fall back to first allowed
        """
        if not allowed:
            return None
        allowed_lc = {e.lower(): e for e in allowed}
        text = (output or "").strip()
        # Explicit tag
        for line in text.splitlines()[::-1]:  # scan from bottom
            if "NEXT_EVENT:" in line:
                val = line.split("NEXT_EVENT:", 1)[1].strip()
                val = val.strip().strip('"\'').lower()
                if val in allowed_lc:
                    return allowed_lc[val]
        # Heuristics
        t = text.lower()
        pri = [
            (['approve', 'approved'], 'approve'),
            (['reject', 'rejected'], 'reject'),
            (['true', 'yes'], 'success'),
            (['false', 'no'], 'failure'),
            (['validated', 'ok', 'ready', 'all_ready', 'proceed', 'success', 'pass'], 'validated'),
            (['invalid', 'fail', 'failure', 'error', 'unresolved', 'timeout'], 'failure'),
            (['needs_review', 'review', 'revise', 'partial', 'partial_success'], 'needs_review'),
            (['retry', 're-try', 'try again'], 'retry'),
        ]
        for keywords, canonical in pri:
            if any(k in t for k in keywords):
                for a in allowed:
                    if canonical == a or canonical in a.lower():
                        return a
        # Fallback: if common names exist
        for pref in ['validated', 'approved', 'success', 'needs_review', 'failure', 'invalid']:
            for a in allowed:
                if pref == a or pref in a.lower():
                    return a
        return allowed[0]

    async def execute_state(self, state: Dict[str, Any], context: Dict[str, Any]) -> Tuple[str, Any]:
        """Execute a single state with AI agent and tools"""

        state_id = state['id']
        state_type = state['type']

        # Update mission phase based on current state
        mission = context.get('mission')
        if mission:
            new_phase = enhanced_context_manager.determine_phase_from_state(
                state, mission.current_phase
            )
            mission.current_phase = new_phase
            logger.debug(f"State {state_id} - Mission phase: {new_phase}")

        # Get intelligent context relevant to this state
        state_dependencies = context.get('state_dependencies', {})
        relevant_context = {}
        if state_dependencies and context.get('results'):
            relevant_context = enhanced_context_manager.get_relevant_context(
                state,
                context['results'],
                state_dependencies,
                max_context_size=2000  # Increased from 1200
            )

        # Notify UI about state activation
        await self.hub.publish_control(ControlFrame(
            exec_id=context['exec_id'],
            type="state_entered",
            agent_id=state_id,
            payload={
                "state": state,
                "timestamp": time.time()
            }
        ))
        
        result = None
        next_event = "success"
        
        try:
            if state_type == 'final':
                # Final state, just complete
                result = "Workflow completed"
                
            elif state_type == 'tool_call':
                # Create agent with tools
                allowed_events = list(state.get('transitions', {}).keys())
                # Resolve planned tool names and wrap them properly for Strands
                planned_names = self._resolve_tool_names_for_state(state)
                
                # Use DynamicToolWrapper to properly wrap tools for Strands if available
                resolved_tools = []
                if TOOLS_AVAILABLE and DynamicToolWrapper:
                    try:
                        tool_wrapper = DynamicToolWrapper(callback_handler=None)
                        for tool_name in planned_names:
                            wrapped_tool = tool_wrapper.wrap_strands_tool(tool_name, state['name'])
                            if wrapped_tool:
                                resolved_tools.append(wrapped_tool)
                                logger.info(f"✅ Added tool {tool_name} to state {state_id}")
                            else:
                                logger.warning(f"⚠️ Could not wrap tool {tool_name} for state {state_id}")
                    except Exception as e:
                        logger.warning(f"Tool wrapping failed for state {state_id}: {e}")
                else:
                    # If DynamicToolWrapper not available, try direct import as fallback
                    for tool_name in planned_names:
                        if tool_name == 'tavily_search':
                            try:
                                from tools.tavily_search_tool import tavily_search
                                resolved_tools.append(tavily_search)
                                logger.info(f"✅ Directly loaded tavily_search for state {state_id}")
                            except ImportError:
                                logger.warning(f"Could not import tavily_search")
                tool_inventory = self._tool_inventory_text(planned_names)

                # Build tool parameters instruction if available
                params_instruction = ""
                if state.get('tool_parameters'):
                    params_instruction = "\n\nIMPORTANT TOOL PARAMETERS:\nYou have been provided with specific parameters for your tools. Use these exact parameters when calling tools:\n"
                    for tool_name, params in state['tool_parameters'].items():
                        params_instruction += f"\n{tool_name}: {params}"

                # Build enhanced mission-aware context
                enhanced_context_str = ""
                if mission and relevant_context:
                    enhanced_context_str = enhanced_context_manager.build_enhanced_context(
                        state, mission, relevant_context
                    )
                else:
                    # Fallback to simple context formatting if no mission
                    if relevant_context:
                        enhanced_context_str = "\n=== RELEVANT CONTEXT FROM PREVIOUS WORK ===\n"
                        for sid, res in relevant_context.items():
                            enhanced_context_str += f"\n{sid}: {str(res)[:300]}...\n"

                agent_config = StrandsAgentConfig(
                    name=state['name'],
                    system_prompt=f"""You are {state.get('agent_role', 'an AI agent')} in a multi-agent workflow.

{enhanced_context_str}

Your specific responsibility: {state.get('description', state.get('task', 'Execute your role'))}

You must:
1. Complete your specific task thoroughly using the tools provided
2. Build upon the relevant context provided above
3. Produce clear, actionable output that advances toward the overall goal
4. Focus on your role without repeating work already done

IMPORTANT: You have been given specific tools for this task. You MUST use the appropriate tools from the list below to complete your work:
{tool_inventory}

If tools are available, use them to research, analyze, or perform your task. Do not just describe what you would do - actually use the tools to do it.
{params_instruction}

At the very end of your response, output exactly one line:
NEXT_EVENT: <one of {allowed_events}>
No extra commentary after that line.""",
                    model=state.get('model', 'gpt-4o-mini'),
                    temperature=0.7,
                    tools=resolved_tools
                )
                
                # Log the tools being passed
                logger.info(f"Creating agent {state_id} with {len(resolved_tools)} tools")
                if resolved_tools:
                    tool_names = [getattr(t, '__name__', str(t)) for t in resolved_tools]
                    logger.info(f"Tools for {state_id}: {tool_names}")
                
                agent_runtime = StrandsAgentRuntime(
                    agent_id=state_id,
                    config=agent_config
                )
                
                # Store agent
                self.active_agents[state_id] = agent_runtime
                
                # Stream execution
                output = ""

                # Include tool parameters and recent aggregates if available
                metadata = {
                    **(context.get('previous_results', {})),
                    'allowed_events': allowed_events,
                }
                agg = context.get('last_parallel_aggregate')
                if agg and context.get('last_state') == agg.get('aggregator'):
                    metadata['parallel_aggregate'] = agg

                # Add tool parameters from state if present (support both 'parameters' and 'tool_parameters')
                params = state.get('parameters') or state.get('tool_parameters')
                if params:
                    metadata['tool_parameters'] = params
                    logger.info(f"Using tool parameters for state {state_id}: {params}")

                agent_context = AgentContext(
                    exec_id=context['exec_id'],
                    agent_id=state_id,
                    task=state.get('description', state.get('task', context.get('task', 'Execute assigned task'))),
                    config=agent_config.__dict__,
                    parent_result=context.get('previous_results', {}).get(context.get('last_state'), ""),
                    metadata=metadata
                )
                async for frame in agent_runtime.stream(agent_context):
                    # Publish based on frame type
                    if frame.frame_type == 'token':
                        await self.hub.publish_token(frame)
                        # Accumulate text from non-final frames
                        if not frame.final:
                            output += frame.text
                    elif frame.frame_type == 'control':
                        await self.hub.publish_control(frame)
                        # Capture result from AGENT_COMPLETED frame
                        if frame.type == ControlType.AGENT_COMPLETED and frame.payload:
                            result_text = frame.payload.get('result', '')
                            if result_text:
                                output = result_text
                
                result = output if output else "Task completed"
                # Determine next event from output and allowed transitions
                ne = self._parse_next_event(result, allowed_events)
                if ne:
                    next_event = ne

            elif state_type in ['analysis', 'decision', 'loop']:
                # Create analysis agent
                # Build enhanced mission-aware context
                enhanced_context_str = ""
                if mission and relevant_context:
                    enhanced_context_str = enhanced_context_manager.build_enhanced_context(
                        state, mission, relevant_context
                    )
                else:
                    # Fallback to old truncated context if no mission
                    if context.get('previous_results'):
                        prev_results = context['previous_results']
                        # Format previous results concisely with a char budget to stay within token limits
                        max_total = 2000  # Increased from 1200
                        per_item = 600  # Increased from 400
                        used = 0
                        context_parts = []
                        for state_key, state_result in prev_results.items():
                            if not state_result or not str(state_result).strip():
                                continue
                            snippet = str(state_result)
                            if len(snippet) > per_item:
                                snippet = snippet[:per_item] + "..."
                            line = f"{state_key}: {snippet}"
                            if used + len(line) > max_total:
                                break
                            context_parts.append(line)
                            used += len(line)
                        if context_parts:
                            enhanced_context_str = "\n\nPrevious agent outputs:\n" + "\n\n".join(context_parts)

                allowed_events = list(state.get('transitions', {}).keys())
                tool_inventory = self._tool_inventory_text()
                agent_config = StrandsAgentConfig(
                    name=state['name'],
                    system_prompt=f"""You are {state.get('agent_role', 'an AI agent')} in a multi-agent workflow.

{enhanced_context_str}

Your specific responsibility: {state.get('description', state.get('task', 'Execute your role'))}

You must:
1. Analyze and build upon the relevant context provided above
2. Add your unique contribution based on your role
3. Produce structured, clear output that advances toward the overall goal
4. Be concise but thorough in your specific domain

Available tools (for reference; prefer reasoning first):
{tool_inventory}

At the very end of your response, output exactly one line:
NEXT_EVENT: <one of {allowed_events}>
No extra commentary after that line.""",
                    model=state.get('model', 'gpt-4o-mini'),
                    temperature=0.7,
                    tools=[]  # Analysis agents typically don't need tools
                )
                
                # Log that no tools for analysis agents
                logger.info(f"Creating analysis agent {state_id} with no tools")
                
                agent_runtime = StrandsAgentRuntime(
                    agent_id=state_id,
                    config=agent_config
                )
                
                # Store agent
                self.active_agents[state_id] = agent_runtime
                
                # Stream execution
                output = ""
                # Include any recent parallel aggregation details for analysis/decision
                agg2 = context.get('last_parallel_aggregate')
                base_meta = {
                    **(context.get('previous_results', {})),
                    'allowed_events': allowed_events,
                }
                if agg2 and context.get('last_state') == agg2.get('aggregator'):
                    base_meta['parallel_aggregate'] = agg2

                agent_context = AgentContext(
                    exec_id=context['exec_id'],
                    agent_id=state_id,
                    task=state.get('description', state.get('task', 'Execute assigned task')),  # Use original task, context is in system prompt
                    config=agent_config.__dict__,
                    parent_result=context.get('previous_results', {}).get(context.get('last_state'), ""),
                    metadata=base_meta
                )
                async for frame in agent_runtime.stream(agent_context):
                    # Publish based on frame type
                    if frame.frame_type == 'token':
                        await self.hub.publish_token(frame)
                        # Accumulate text from non-final frames
                        if not frame.final:
                            output += frame.text
                    elif frame.frame_type == 'control':
                        await self.hub.publish_control(frame)
                        # Capture result from AGENT_COMPLETED frame
                        if frame.type == ControlType.AGENT_COMPLETED and frame.payload:
                            result_text = frame.payload.get('result', '')
                            if result_text:
                                output = result_text
                
                result = output if output else ("Loop step completed" if state_type == 'loop' else "Analysis completed")
                # Parse or infer next event from the model output
                ne = self._parse_next_event(result, allowed_events)
                if state_type == 'decision':
                    # Always involve human for explicit decision states
                    human_choice = await self._await_human_decision(context['exec_id'], state, allowed_events)
                    if isinstance(human_choice, dict):
                        evt = human_choice.get('event')
                        if evt and evt in allowed_events:
                            next_event = evt
                        else:
                            next_event = ne or next_event
                    elif isinstance(human_choice, str) and human_choice in allowed_events:
                        next_event = human_choice
                    elif ne:
                        next_event = ne
                else:
                    # Non-decision states: prefer parser, else fall back to human if ambiguous
                    if ne:
                        next_event = ne
                    else:
                        human_choice = await self._await_human_decision(context['exec_id'], state, allowed_events)
                        if isinstance(human_choice, dict):
                            evt = human_choice.get('event')
                            if evt and evt in allowed_events:
                                next_event = evt
                        elif isinstance(human_choice, str) and human_choice in allowed_events:
                            next_event = human_choice

            elif state_type in ('parallel', 'parallel_load'):
                # Execute contributing branches whose transitions feed back into this parallel aggregator.
                graph = context.get('graph') or {}
                edges: List[Dict[str, Any]] = graph.get('edges', [])
                states_map: Dict[str, Dict[str, Any]] = graph.get('states', {})

                # Prefer explicit children if provided; else infer via heuristic (sources targeting this id)
                overrides = (context.get('ui_overrides') or {}).get('parallel_children', {})
                explicit_children = state.get('children') or overrides.get(state_id) or []
                contributor_ids: List[str] = []
                if explicit_children:
                    contributor_ids = [cid for cid in explicit_children if cid in states_map]
                else:
                    if state_type == 'parallel_load':
                        # Fan-out model: children are nodes directly targeted by this node
                        contributor_ids = list({e.get('target') for e in edges if e.get('source') == state_id})
                    else:
                        # Aggregator model: children are nodes that fed into this node
                        contributor_ids = list({e.get('source') for e in edges if e.get('target') == state_id})
                # Filter valid, non-final contributors
                contributors = [states_map[cid] for cid in contributor_ids if cid in states_map and states_map[cid].get('type') != 'final']
                # Fallback: if none detected, try union of incoming and outgoing just in case
                if not contributors:
                    all_ids = {e.get('source') for e in edges if e.get('target') == state_id} | {e.get('target') for e in edges if e.get('source') == state_id}
                    contributors = [states_map[cid] for cid in all_ids if cid in states_map and states_map[cid].get('type') not in ('final', 'parallel', 'parallel_load', 'join') and cid != state_id]

                # Avoid re-running the same child many times within this exec
                executed_map: Dict[str, set] = context.setdefault('parallel_executed', {})
                already: set = executed_map.setdefault(state_id, set())

                # Telemetry: parallel start
                await self.hub.publish_control(ControlFrame(
                    exec_id=context['exec_id'],
                    type="parallel_start",
                    agent_id=state_id,
                    payload={"children": [c['id'] for c in contributors]}
                ))

                branch_events: List[str] = []
                # If we just came from one of the contributors, count it as completed based on last_event, avoid immediate re-run
                last_state = context.get('last_state')
                last_event = context.get('last_event') or 'success'
                if last_state and any(c.get('id') == last_state for c in contributors) and last_state not in already:
                    already.add(last_state)
                    branch_events.append(str(last_event))

                async def run_child(child_state: Dict[str, Any]):
                    cid = child_state['id']
                    # Use a shallow-copied context for child execution to minimize race conditions
                    child_ctx = {
                        **context,
                        'results': dict(context.get('results', {})),
                        'previous_results': dict(context.get('results', {})),
                    }
                    try:
                        ev, _ = await self.execute_state(child_state, child_ctx)
                        # Merge results back
                        context['results'].update(child_ctx.get('results', {}))
                        await self.hub.publish_control(ControlFrame(
                            exec_id=context['exec_id'],
                            type="parallel_child_completed",
                            agent_id=state_id,
                            payload={"child": cid, "event": ev}
                        ))
                        return ev
                    except Exception as ce:
                        logger.warning(f"Parallel child {cid} failed: {ce}")
                        await self.hub.publish_control(ControlFrame(
                            exec_id=context['exec_id'],
                            type="parallel_child_completed",
                            agent_id=state_id,
                            payload={"child": cid, "event": "failure", "error": str(ce)}
                        ))
                        return 'failure'

                # Launch remaining children concurrently
                tasks: List[asyncio.Task] = []
                for child in contributors:
                    cid = child['id']
                    if cid in already:
                        continue
                    tasks.append(asyncio.create_task(run_child(child)))

                if tasks:
                    done = await asyncio.gather(*tasks, return_exceptions=False)
                    branch_events.extend([str(ev) for ev in done])

                # Mark all contributors as executed for this aggregator
                for c in contributors:
                    already.add(c['id'])

                # Build aggregate of child results for downstream consumers
                results_map: Dict[str, Any] = {}
                try:
                    for c in contributors:
                        cid = c['id']
                        if cid in (context.get('results') or {}):
                            results_map[cid] = context['results'][cid]
                except Exception:
                    results_map = {}

                # Cache last aggregate in context so the very next node can use it
                context['last_parallel_aggregate'] = {
                    'aggregator': state_id,
                    'children': [c['id'] for c in contributors],
                    'events': list(branch_events),
                    'results': results_map,
                }

                # Simple aggregation: success if no failures/timeouts, else failure
                bad = any(ev in ('failure', 'timeout', 'reject') for ev in branch_events)
                # Map to allowed transitions on this parallel node
                allowed = set((state.get('transitions') or {}).keys())
                if bad:
                    if 'failure' in allowed:
                        next_event = 'failure'
                    elif 'invalid' in allowed:
                        next_event = 'invalid'
                    else:
                        next_event = next(iter(allowed)) if allowed else 'failure'
                else:
                    if 'validated' in allowed:
                        next_event = 'validated'
                    elif 'success' in allowed:
                        next_event = 'success'
                    else:
                        next_event = next(iter(allowed)) if allowed else 'success'
                result = f"Parallel executed {len(contributors)} branches: {', '.join(branch_events) or 'none'}"

                # Determine a reasonable next state target to continue after aggregation.
                # If this is a fan-out pattern (parallel -> children), try to find a common downstream target.
                forced_next: Optional[str] = None
                # Prefer precomputed join for parallel_load
                if state_type == 'parallel_load':
                    try:
                        forced_next = (context.get('fanout_joins') or {}).get(state_id)
                    except Exception:
                        forced_next = None
                try:
                    child_set = {c['id'] for c in contributors}
                    # Count outgoing targets from children that are not looping back to parallel or staying within children
                    counts: Dict[str, int] = {}
                    for e in edges:
                        src = e.get('source'); tgt = e.get('target')
                        if src in child_set and tgt and tgt != state_id and tgt not in child_set:
                            counts[tgt] = counts.get(tgt, 0) + 1
                    if counts:
                        # Pick the most common target (simple join)
                        forced_next = max(counts.items(), key=lambda kv: kv[1])[0]
                except Exception:
                    forced_next = None

                if not forced_next:
                    # Fallback: if the parallel node has an explicit transition for our next_event, use that
                    tgt = (state.get('transitions') or {}).get(next_event)
                    if tgt:
                        forced_next = tgt

                if forced_next:
                    # Store in context to steer the main loop
                    context['forced_next_state_id'] = forced_next

                # Telemetry: aggregated
                await self.hub.publish_control(ControlFrame(
                    exec_id=context['exec_id'],
                    type="parallel_aggregated",
                    agent_id=state_id,
                    payload={"children": [c['id'] for c in contributors], "events": branch_events, "next_event": next_event, "next_state_id": forced_next}
                ))

            elif state_type == 'join':
                # Join node: collect results from all incoming sources and pass them forward as a single aggregate
                graph = context.get('graph') or {}
                edges: List[Dict[str, Any]] = graph.get('edges', [])
                incoming = [e.get('source') for e in edges if e.get('target') == state_id]
                agg_map: Dict[str, Any] = {}
                for src in incoming:
                    if not src:
                        continue
                    if src in (context.get('results') or {}):
                        agg_map[src] = context['results'][src]
                # Save aggregation and set as this state's result
                context['last_parallel_aggregate'] = {
                    'aggregator': state_id,
                    'children': list(agg_map.keys()),
                    'events': [],
                    'results': agg_map,
                }
                result = agg_map
                # Choose next event (prefer success)
                allowed = list((state.get('transitions') or {}).keys())
                if 'success' in allowed:
                    next_event = 'success'
                elif allowed:
                    next_event = allowed[0]

            elif state_type == 'input':
                # Request human input explicitly
                allowed = list(state.get('transitions', {}).keys()) or ['submitted', 'cancel']
                # Notify UI with explicit input request
                await self.hub.publish_control(ControlFrame(
                    exec_id=context['exec_id'],
                    type="human_input_required",
                    agent_id=state_id,
                    payload={
                        "state": {
                            "id": state.get('id'),
                            "name": state.get('name'),
                            "type": state.get('type'),
                            "description": state.get('description'),
                            "agent_role": state.get('agent_role'),
                        },
                        "allowed_events": allowed,
                        "input_schema": state.get('input_schema') or state.get('parameters') or {}
                    }
                ))

                selected = await self._await_human_decision(context['exec_id'], state, allowed)
                # Default to submitted if not provided
                picked_event: Optional[str] = None
                provided_data: Any = None
                if isinstance(selected, dict):
                    picked_event = selected.get('event')
                    provided_data = selected.get('data')
                elif isinstance(selected, str):
                    picked_event = selected

                if picked_event and picked_event in allowed:
                    next_event = picked_event
                else:
                    next_event = allowed[0]

                # Store provided input as the result for this state
                result = provided_data if provided_data is not None else f"Input {next_event}"

        except Exception as e:
            logger.error(f"State execution error: {e}")
            result = str(e)
            next_event = "failure"
        
        # Store result in context
        if 'results' not in context:
            context['results'] = {}
        context['results'][state_id] = result
        context['previous_results'] = context['results']
        context['last_state'] = state_id  # Track last state for chaining

        # Update mission context with key findings from this state
        mission = context.get('mission')
        if mission and result:
            mission = enhanced_context_manager.update_mission_from_result(
                mission, state_id, result
            )
            # Calculate progress toward goal
            mission.progress = enhanced_context_manager.calculate_progress(
                mission, context['results']
            )
            context['mission'] = mission
            logger.debug(f"Mission progress after {state_id}: {mission.progress:.0%}")
        
        # Notify UI about state completion
        await self.hub.publish_control(ControlFrame(
            exec_id=context['exec_id'],
            type="state_exited",
            agent_id=state_id,
            payload={
                "state": state,
                "result": result,
                "next_event": next_event,
                "timestamp": time.time()
            }
        ))
        
        return next_event, result
    
    async def execute(self, task: str, exec_id: str, machine_override: Optional[Dict[str, Any]] = None, **kwargs) -> AsyncIterator[Union[TokenFrame, ControlFrame]]:
        """Main execution: create or accept a provided state machine, then execute it.
        If machine_override is provided, it is used (after normalization) instead of AI planning.
        """
        
        # Ensure hub is connected
        await self.hub.connect()
        
        try:
            # Step 1: AI analyzes task and creates state machine
            await self.hub.publish_control(ControlFrame(
                exec_id=exec_id,
                type="planning_started",
                payload={"task": task}
            ))

            # Announce tool preferences and effective tools
            try:
                prefs = self.config.get('tool_preferences') or {}
                selected = list(prefs.get('selected_tools') or [])
                restrict = bool(prefs.get('restrict_to_selected', False))
                
                # Get all available tools from both registries dynamically
                available_names = set((self._all_tools or {}).keys())
                
                # Get ALL tools from strands registry - no hardcoding
                if TOOLS_AVAILABLE:
                    try:
                        # Initialize strands registry if not done
                        if not self.strands_registry:
                            from app.tools.strands_tool_registry import get_dynamic_tools
                            self.strands_registry = await get_dynamic_tools()
                        
                        # Add ALL strands tool names to available
                        if self.strands_registry and hasattr(self.strands_registry, 'tools'):
                            available_names.update(self.strands_registry.tools.keys())
                            logger.debug(f"Available tools from strands: {list(self.strands_registry.tools.keys())[:20]}...")
                    except Exception as e:
                        logger.debug(f"Could not get strands tools: {e}")
                
                unknown = [n for n in selected if n not in available_names]
                effective = [n for n in selected if n in available_names] if restrict else list(available_names)
                await self.hub.publish_control(ControlFrame(
                    exec_id=exec_id,
                    type="tool_preferences",
                    payload={
                        "selected": selected,
                        "restrict_to_selected": restrict,
                        "effective": effective[:50],
                        "unknown": unknown
                    }
                ))
            except Exception as e:
                logger.debug(f"Error announcing tool preferences: {e}")
            
            if machine_override:
                state_machine = self._normalize_state_machine(machine_override)
            else:
                state_machine = await self.analyze_and_create_state_machine(task)
            # Deduplicate edges to avoid duplicate React keys client-side
            try:
                edges = state_machine.get('edges', []) or []
                seen = set()
                unique_edges = []
                for e in edges:
                    key = (e.get('source'), e.get('target'), e.get('event'))
                    if key not in seen:
                        seen.add(key)
                        unique_edges.append(e)
                state_machine['edges'] = unique_edges
            except Exception:
                pass
            
            # Send state machine definition to UI
            logger.info(f"Created state machine with {len(state_machine.get('states', []))} states and {len(state_machine.get('edges', []))} edges")
            await self.hub.publish_control(ControlFrame(
                exec_id=exec_id,
                type="state_machine_created",
                payload={
                    "machine": state_machine,
                    "task": task
                }
            ))
            # Persist graph for this execution so we can patch/rerun later
            try:
                self.graph_by_exec[exec_id] = state_machine
            except Exception:
                logger.debug("Failed to persist state machine graph for exec %s", exec_id)
            # Also publish planned tools per state so UI can tag nodes immediately
            try:
                for s in state_machine.get('states', []):
                    await self.hub.publish_control(ControlFrame(
                        exec_id=exec_id,
                        type="state_tools_resolved",
                        agent_id=s.get('id'),
                        payload={
                            "state_id": s.get('id'),
                            "tools": s.get('tools', [])
                        }
                    ))
            except Exception:
                pass
            
            # Step 2: Execute the state machine
            # Extract mission context from task
            mission = enhanced_context_manager.extract_mission_from_task(task)

            # Map state dependencies for intelligent context management
            states_list = state_machine.get('states', [])
            edges_list = state_machine.get('edges', [])
            state_dependencies = enhanced_context_manager.map_state_dependencies(states_list, edges_list)

            context = {
                'exec_id': exec_id,
                'task': task,
                'mission': mission,  # Add mission context
                'state_dependencies': state_dependencies,  # Add dependency map
                'results': {},
                'visits': {},
                # Optional UI overrides passed via request body
                'ui_overrides': kwargs.get('ui_overrides', {}) if kwargs else {}
            }
            
            # Build state lookup
            states = {s['id']: s for s in state_machine['states']}
            # Persist graph in context for inner execution (e.g., parallel aggregation)
            context['graph'] = {
                'states': states,
                'edges': state_machine.get('edges', [])
            }
            # Precompute fan-out mapping for 'parallel_load' nodes and likely joins
            try:
                edges_list: List[Dict[str, Any]] = context['graph']['edges'] or []
                fanout_children: Dict[str, List[str]] = {}
                fanout_joins: Dict[str, Optional[str]] = {}
                by_source: Dict[str, List[Dict[str, Any]]] = {}
                for e in edges_list:
                    by_source.setdefault(e.get('source'), []).append(e)
                for sid, st in states.items():
                    if st.get('type') == 'parallel_load':
                        child_ids = list({e.get('target') for e in by_source.get(sid, []) if e.get('target')})
                        child_ids = [cid for cid in child_ids if cid in states and states[cid].get('type') not in ('final', 'parallel', 'parallel_load', 'join')]
                        fanout_children[sid] = child_ids
                        counts: Dict[str, int] = {}
                        cset = set(child_ids)
                        for e in edges_list:
                            src = e.get('source'); tgt = e.get('target')
                            if src in cset and tgt and tgt not in cset and tgt != sid:
                                counts[tgt] = counts.get(tgt, 0) + 1
                        fanout_joins[sid] = max(counts, key=counts.get) if counts else None
                context['fanout_children'] = fanout_children
                context['fanout_joins'] = fanout_joins
            except Exception:
                context['fanout_children'] = {}
                context['fanout_joins'] = {}
            # Save live context reference for reruns
            self.context_by_exec[exec_id] = context
            current_state_id = state_machine['initial_state']
            steps = 0
            max_steps = int(self.config.get('max_steps', 200))
            
            # Execute states in sequence, allowing cycles but with a step cap
            while current_state_id:
                if steps >= max_steps:
                    logger.warning(f"Max steps reached ({max_steps}); stopping execution")
                    await self.hub.publish_control(ControlFrame(
                        exec_id=exec_id,
                        type="workflow_stopped",
                        payload={"reason": "max_steps_reached", "max_steps": max_steps}
                    ))
                    break
                
                if current_state_id not in states:
                    logger.error(f"Next state '{current_state_id}' not found; stopping")
                    await self.hub.publish_control(ControlFrame(
                        exec_id=exec_id,
                        type="error",
                        payload={"error": f"State '{current_state_id}' not found"}
                    ))
                    break
                
                current_state = states[current_state_id]
                
                # Execute the state
                event, result = await self.execute_state(current_state, context)
                
                # Check if we reached a final state
                if current_state['type'] == 'final':
                    break
                
                # Find next state based on transition (allow parallel to override)
                forced = context.pop('forced_next_state_id', None)
                transitions = current_state.get('transitions', {})
                next_state_id = forced or transitions.get(event)
                if not next_state_id:
                    # Fallback: if exactly one transition exists, use it
                    if len(transitions) == 1:
                        next_state_id = list(transitions.values())[0]
                    else:
                        await self.hub.publish_control(ControlFrame(
                            exec_id=exec_id,
                            type="error",
                            payload={"error": f"No transition for event '{event}' from state '{current_state_id}'"}
                        ))
                        break
                # Remember last transition for nested aggregators
                context['last_state'] = current_state_id
                context['last_event'] = event
                # Anti‑loop guard: if a state is visited too often, try alternative branch or fail
                visits = context.get('visits', {})
                visits[current_state_id] = visits.get(current_state_id, 0) + 1
                context['visits'] = visits
                max_visits_per_state = int(self.config.get('max_visits_per_state', 3))

                if visits.get(next_state_id, 0) >= max_visits_per_state:
                    # Try an alternative event that leads to a less-visited state
                    alt = None
                    for ev, tgt in transitions.items():
                        if ev == event:
                            continue
                        if visits.get(tgt, 0) < max_visits_per_state:
                            alt = tgt
                            break
                    if alt:
                        next_state_id = alt
                    else:
                        # Escalate to any failure/timeout branch if present
                        for pref in ['failure', 'timeout', 'cancel', 'rollback']:
                            if pref in transitions:
                                next_state_id = transitions[pref]
                                break
                # Record last transition for downstream logic (e.g., parallel aggregator)
                context['last_state'] = current_state_id
                context['last_event'] = event

                # Pair loop breaker: if we bounce A -> B -> A repeatedly, reroute after cap
                try:
                    pair_cycles = context.setdefault('pair_cycles', {})
                    last_state = context.get('last_state')
                    # last_state just set to current_state_id above; we need the previous-last-state instead
                    prev_state = context.get('prev_state')
                    # Keep a rolling previous state
                    context['prev_state'] = current_state_id
                    if prev_state and next_state_id == prev_state:
                        key = '::'.join(sorted([current_state_id, next_state_id]))
                        pair_cycles[key] = pair_cycles.get(key, 0) + 1
                        cap = int(self.config.get('pair_loop_cap', 2))
                        if pair_cycles[key] >= cap:
                            # Try alternative transition target different from prev_state
                            alt = None
                            pref = ['failure', 'timeout', 'rollback', 'cancel', 'escalate', 'needs_review']
                            for ev in pref:
                                if ev in transitions and transitions[ev] != prev_state:
                                    alt = transitions[ev]
                                    event = ev
                                    break
                            if not alt:
                                for ev, tgt in transitions.items():
                                    if tgt != prev_state:
                                        alt = tgt
                                        event = ev
                                        break
                            if alt:
                                await self.hub.publish_control(ControlFrame(
                                    exec_id=exec_id,
                                    type='loop_breaker',
                                    agent_id=current_state_id,
                                    payload={
                                        'pair': [current_state_id, prev_state],
                                        'count': pair_cycles[key],
                                        'reroute_event': event,
                                        'reroute_target': alt
                                    }
                                ))
                                next_state_id = alt
                                # Reset counter so we don't immediately trigger again
                                pair_cycles[key] = 0
                except Exception:
                    pass

                current_state_id = next_state_id
                steps += 1
            
            # Complete
            await self.hub.publish_control(ControlFrame(
                exec_id=exec_id,
                type="workflow_completed",
                payload={
                    "results": context['results'],
                    "task": task
                }
            ))
            
        except Exception as e:
            logger.error(f"Workflow execution error: {e}")
            await self.hub.publish_control(ControlFrame(
                exec_id=exec_id,
                type="error",
                payload={"error": str(e)}
            ))
        
        finally:
            # Connect to hub if not connected
            await self.hub.connect()

    async def update_graph(self, exec_id: str, graph_patch: Dict[str, Any]) -> Dict[str, Any]:
        """Patch/extend the current state machine graph for an execution and notify UI.
        Supports:
        - states: list of state objects to upsert (merge)
        - edges: list of edges to add
        - remove_states: list of state ids to remove
        - remove_edges: list of {source,target,event} edges to remove
        - set_initial_state: string to switch initial state (if exists)
        Returns the updated machine.
        """
        machine = self.graph_by_exec.get(exec_id)
        if not machine:
            raise RuntimeError(f"No state machine for execution {exec_id}")

        # Merge states
        states = machine.get('states', []) or []
        edges = machine.get('edges', []) or []
        state_map = {s.get('id'): s for s in states if s.get('id')}

        # Optional removals first
        remove_states = set(graph_patch.get('remove_states') or [])
        remove_edges = graph_patch.get('remove_edges') or []
        if remove_states:
            for sid in remove_states:
                state_map.pop(sid, None)
            edges = [e for e in edges if e.get('source') not in remove_states and e.get('target') not in remove_states]

        for s in (graph_patch.get('states') or []):
            sid = s.get('id') or s.get('name')
            if not sid:
                continue
            s['id'] = sid
            state_map[sid] = {**state_map.get(sid, {}), **s}
        states = list(state_map.values())

        # Merge edges and dedupe, applying edge removals
        def edge_key(e: Dict[str, Any]):
            return (e.get('source'), e.get('target'), e.get('event'))

        if remove_edges:
            remove_keys = set(edge_key(e) for e in remove_edges)
            edges = [e for e in edges if edge_key(e) not in remove_keys]

        merged_edges = edges + (graph_patch.get('edges') or [])
        seen = set()
        unique_edges = []
        for e in merged_edges:
            key = (e.get('source'), e.get('target'), e.get('event'))
            if key in seen:
                continue
            seen.add(key)
            unique_edges.append(e)

        updated = {
            **machine,
            'states': states,
            'edges': unique_edges,
        }
        # Switch initial state if requested
        if isinstance(graph_patch.get('set_initial_state'), str):
            cand = graph_patch['set_initial_state']
            if cand in state_map:
                updated['initial_state'] = cand

        # Normalize and persist
        updated = self._normalize_state_machine(updated)
        self.graph_by_exec[exec_id] = updated

        # Broadcast to UI
        await self.hub.publish_control(ControlFrame(
            exec_id=exec_id,
            type="graph_updated",
            payload={
                "machine": updated
            }
        ))
        return updated

    async def rerun_from(self, exec_id: str, start_state_id: str, graph_patch: Optional[Dict[str, Any]] = None) -> None:
        """Rerun execution from a specific state, optionally patching the graph first.
        Continues to publish to the same exec_id streams so the existing WebSocket receives updates.
        """
        await self.hub.connect()

        # Optionally update graph first
        if graph_patch:
            try:
                await self.update_graph(exec_id, graph_patch)
            except Exception as e:
                logger.warning(f"Graph patch failed for {exec_id}: {e}")

        machine = self.graph_by_exec.get(exec_id)
        if not machine:
            raise RuntimeError(f"No state machine for execution {exec_id}")

        # Prepare context, preserving previous results
        base_ctx = self.context_by_exec.get(exec_id) or {
            'exec_id': exec_id,
            'task': (machine.get('metadata') or {}).get('task', ''),
            'results': {},
            'visits': {},
            'ui_overrides': {}
        }
        # Ensure graph references are up to date
        states_map = {s['id']: s for s in machine.get('states', [])}
        ctx = base_ctx
        ctx['graph'] = {
            'states': states_map,
            'edges': machine.get('edges', [])
        }
        # Also ensure previous_results alias
        ctx['previous_results'] = ctx.get('results', {})
        # Save back
        self.context_by_exec[exec_id] = ctx

        # Notify UI
        await self.hub.publish_control(ControlFrame(
            exec_id=exec_id,
            type="rerun_started",
            agent_id=start_state_id,
            payload={"start_state": start_state_id}
        ))

        # Execution loop starting from the requested state
        current_state_id = start_state_id
        steps = 0
        max_steps = int(self.config.get('max_steps', 200))

        while current_state_id:
            if steps >= max_steps:
                await self.hub.publish_control(ControlFrame(
                    exec_id=exec_id,
                    type="workflow_stopped",
                    payload={"reason": "max_steps_reached", "max_steps": max_steps}
                ))
                break

            if current_state_id not in states_map:
                await self.hub.publish_control(ControlFrame(
                    exec_id=exec_id,
                    type="error",
                    payload={"error": f"State '{current_state_id}' not found"}
                ))
                break

            state = states_map[current_state_id]
            event, _ = await self.execute_state(state, ctx)

            # If final, stop
            if state.get('type') == 'final':
                break

            forced = ctx.pop('forced_next_state_id', None)
            transitions = state.get('transitions', {})
            next_state_id = forced or transitions.get(event)
            if not next_state_id:
                if len(transitions) == 1:
                    next_state_id = list(transitions.values())[0]
                else:
                    await self.hub.publish_control(ControlFrame(
                        exec_id=exec_id,
                        type="error",
                        payload={"error": f"No transition for event '{event}' from state '{current_state_id}'"}
                    ))
                    break

            # Maintain loop protections similar to main execute
            visits = ctx.get('visits', {})
            visits[current_state_id] = visits.get(current_state_id, 0) + 1
            ctx['visits'] = visits
            max_visits_per_state = int(self.config.get('max_visits_per_state', 3))
            if visits.get(next_state_id, 0) >= max_visits_per_state:
                alt = None
                for ev, tgt in transitions.items():
                    if ev == event:
                        continue
                    if visits.get(tgt, 0) < max_visits_per_state:
                        alt = tgt
                        break
                if alt:
                    next_state_id = alt

            # Advance
            ctx['last_state'] = current_state_id
            ctx['last_event'] = event
            current_state_id = next_state_id
            steps += 1

        # Done
        await self.hub.publish_control(ControlFrame(
            exec_id=exec_id,
            type="rerun_completed",
            payload={"start_state": start_state_id, "steps": steps}
        ))
