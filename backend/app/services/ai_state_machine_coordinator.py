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

from strands import Agent
from strands.models.openai import OpenAIModel
import os

from app.services.event_hub import TokenFrame, ControlFrame, ControlType, get_event_hub
from app.tools.tool_registry import ToolRegistry
from app.services.strands_agent_runtime import StrandsAgentRuntime, StrandsAgentConfig
from app.services.agent_runtime import AgentContext

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

    def submit_decision(self, exec_id: str, state_id: str, event: str) -> bool:
        key = self._decision_key(exec_id, state_id)
        fut = self._decision_waiters.get(key)
        if fut and not fut.done():
            fut.set_result(event)
            return True
        return False

    async def _await_human_decision(self, exec_id: str, state: Dict[str, Any], allowed: list[str], timeout: float = 300.0) -> Optional[str]:
        """Publish a decision request and wait for user input via API."""
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
        """
        states = machine.get('states', []) or []
        edges = machine.get('edges', []) or []

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
            list_names = [n for n in names if n in tools]
        elif restrict and sel:
            list_names = [n for n in sel if n in tools]
        else:
            list_names = list(tools.keys())
        lines = []
        for n in list_names[:50]:
            desc = getattr(tools.get(n), 'description', '') or ''
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

    async def analyze_and_create_state_machine(self, task: str) -> Dict[str, Any]:
        """Use AI to dynamically generate a complete state machine based on the task"""
        
        # Let AI create the ENTIRE state machine dynamically
        # Provide allowed tools context so the model doesn't invent tool names
        prefs = self.config.get('tool_preferences') or {}
        selected = list(prefs.get('selected_tools') or [])
        restrict = bool(prefs.get('restrict_to_selected', False))
        registry_names = list((self.tool_registry.tools or {}).keys()) if hasattr(self.tool_registry, 'tools') else []
        # Compute allowed tool names for planning
        if restrict and selected:
            allowed_tools = [n for n in selected if n in registry_names]
        else:
            allowed_tools = registry_names

        allowed_text = ", ".join(allowed_tools) if allowed_tools else ""

        prompt = f"""You are an AI state machine architect. Analyze this task and create a sophisticated state machine.

Task: {task}

Return a JSON object with this EXACT structure:
{{
    "name": "Dynamic Workflow for [task name]",
    "initial_state": "initialization",
    "states": [
        {{
            "id": "unique_state_id",
            "name": "State Display Name", 
            "type": "analysis|tool_call|decision|parallel|final",
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

Requirements:
1. Create AS MANY states as needed for the task (could be 5, could be 50)
2. Each state can have MULTIPLE transition events (not just success/failure)
3. Include retry loops, error recovery, validation steps
4. Add parallel processing where it makes sense
5. Include final states for both success and failure scenarios
6. Make it as complex as needed - don't simplify!

Tool constraints:
- Do NOT invent tool names.
- If a state has type "tool_call", its "tools" array MUST be a subset of ALLOWED_TOOLS below.
- If no allowed tools apply, set "tools": [] for that state.
ALLOWED_TOOLS: [{allowed_text}]

Example events: success, failure, retry, timeout, validated, invalid, partial_success, needs_review, escalate, rollback, skip, cancel

Think step-by-step about what this specific task requires and create appropriate states.
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
                params={"temperature": 0.3, "max_tokens": 4000}  # Increased for complex state machines
            )
            
            planner = Agent(
                name="state_machine_planner",
                system_prompt="You are a state machine architect that designs complex workflows. Always respond with valid JSON.",
                model=model
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
                
                logger.info(f"AI generated state machine with {len(state_machine.get('states', []))} states")
                return self._normalize_state_machine(state_machine)
            
        except Exception as e:
            logger.error(f"Failed to generate AI state machine: {e}")
        
        # Fallback: Create a dynamic example (but this should rarely be used)
        return self._normalize_state_machine(self.create_fallback_dynamic_state_machine(task))
    
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
            (['validated', 'approve', 'approved', 'ok', 'ready', 'all_ready', 'proceed', 'success', 'pass'], 'validated'),
            (['invalid', 'reject', 'rejected', 'fail', 'failure', 'error', 'unresolved', 'timeout'], 'failure'),
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
                # Resolve planned tool names and actual tool instances
                planned_names = self._resolve_tool_names_for_state(state)
                # Map names to instances (only valid names remain)
                resolved_tools = []
                for n in planned_names:
                    t = self.tool_registry.get_tool(n)
                    if t:
                        resolved_tools.append(t)
                tool_inventory = self._tool_inventory_text(planned_names)
                agent_config = StrandsAgentConfig(
                    name=state['name'],
                    system_prompt=f"""You are {state.get('agent_role', 'an AI agent')} in a multi-agent workflow.

Your specific responsibility: {state.get('description', state.get('task', 'Execute your role'))}

You must:
1. Complete your specific task thoroughly
2. Build upon any previous agent outputs provided
3. Produce clear, actionable output for the next agent
4. Focus on your role without repeating work already done

Available tools you may call (pre-selected for this state):
{tool_inventory}

At the very end of your response, output exactly one line:
NEXT_EVENT: <one of {allowed_events}>
No extra commentary after that line.""",
                    model=state.get('model', 'gpt-4o-mini'),
                    temperature=0.7,
                    tools=resolved_tools
                )
                
                agent_runtime = StrandsAgentRuntime(
                    agent_id=state_id,
                    config=agent_config
                )
                
                # Store agent
                self.active_agents[state_id] = agent_runtime
                
                # Stream execution
                output = ""
                agent_context = AgentContext(
                    exec_id=context['exec_id'],
                    agent_id=state_id,
                    task=state.get('description', state.get('task', context.get('task', 'Execute assigned task'))),
                    config=agent_config.__dict__,
                    parent_result=context.get('previous_results', {}).get(context.get('last_state'), ""),
                    metadata=context.get('previous_results', {})
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

            elif state_type in ['analysis', 'decision']:
                # Create analysis agent
                task_with_context = state.get('description', state.get('task', 'Execute assigned task'))
                # Build comprehensive context from all previous states
                if context.get('previous_results'):
                    prev_results = context['previous_results']
                    # Format previous results concisely with a char budget to stay within token limits
                    max_total = 1200
                    per_item = 400
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
                        task_with_context += "\n\nPrevious agent outputs (truncated):\n" + "\n\n".join(context_parts)
                
                allowed_events = list(state.get('transitions', {}).keys())
                tool_inventory = self._tool_inventory_text()
                agent_config = StrandsAgentConfig(
                    name=state['name'],
                    system_prompt=f"""You are {state.get('agent_role', 'an AI agent')} in a multi-agent workflow.

Your specific responsibility: {state.get('description', state.get('task', 'Execute your role'))}

You must:
1. Analyze and build upon the outputs from previous agents
2. Add your unique contribution based on your role
3. Produce structured, clear output that advances the workflow
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
                
                agent_runtime = StrandsAgentRuntime(
                    agent_id=state_id,
                    config=agent_config
                )
                
                # Store agent
                self.active_agents[state_id] = agent_runtime
                
                # Stream execution
                output = ""
                agent_context = AgentContext(
                    exec_id=context['exec_id'],
                    agent_id=state_id,
                    task=task_with_context,
                    config=agent_config.__dict__,
                    parent_result=context.get('previous_results', {}).get(context.get('last_state'), ""),
                    metadata=context.get('previous_results', {})
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
                
                result = output if output else "Analysis completed"
                # Parse or infer next event from the model output
                ne = self._parse_next_event(result, allowed_events)
                if ne and state_type != 'decision':
                    next_event = ne
                else:
                    # For decision states (or if we couldn't infer), ask human if possible
                    human_choice = await self._await_human_decision(context['exec_id'], state, allowed_events)
                    if human_choice and human_choice in allowed_events:
                        next_event = human_choice
                    elif ne:
                        next_event = ne
                        
            elif state_type == 'parallel':
                # Execute parallel operations
                # This would spawn multiple agents in parallel
                result = "Parallel execution completed"
                
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
    
    async def execute(self, task: str, exec_id: str, **kwargs) -> AsyncIterator[Union[TokenFrame, ControlFrame]]:
        """Main execution: AI creates state machine, then executes it"""
        
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
                available_names = set((self._all_tools or {}).keys())
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
            except Exception:
                pass
            
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
            context = {
                'exec_id': exec_id,
                'task': task,
                'results': {}
            }
            
            # Build state lookup
            states = {s['id']: s for s in state_machine['states']}
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
                
                # Find next state based on transition
                transitions = current_state.get('transitions', {})
                next_state_id = transitions.get(event)
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
