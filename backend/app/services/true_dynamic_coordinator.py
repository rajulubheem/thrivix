"""
True Dynamic Coordinator: Creates agents dynamically based on task requirements
No predefined agent types - completely flexible agent creation
Properly handles async execution and event streaming
"""

import asyncio
import json
import time
import logging
from typing import AsyncIterator, Dict, Any, Optional, List, Union, Set
from dataclasses import dataclass, field

from strands import Agent, tool
from strands.models.openai import OpenAIModel
import os
from strands.session.file_session_manager import FileSessionManager

from app.services.agent_runtime import AgentRuntime, AgentContext
from app.services.event_hub import TokenFrame, ControlFrame, ControlType, get_event_hub
from app.tools.tool_registry import ToolRegistry
from app.services.dynamic_tool_wrapper import DynamicToolWrapper

try:
    from strands.tools.executors import ConcurrentToolExecutor, SequentialToolExecutor
    EXECUTORS_AVAILABLE = True
except Exception:
    EXECUTORS_AVAILABLE = False

logger = logging.getLogger(__name__)


@dataclass
class PlannedAgent:
    """Represents an agent that has been planned but not yet executed"""
    agent_id: str
    name: str
    role: str
    task: str
    system_prompt: str
    model: str = "gpt-4o-mini"
    temperature: float = 0.7
    depends_on: List[str] = field(default_factory=list)  # Use agent_ids, not names
    tools: List[Dict[str, str]] = field(default_factory=list)
    timeout: float = 60.0  # Per-agent timeout in seconds
    tool_executor: str = "concurrent"  # 'concurrent' or 'sequential'
    
    def get_dependency_ids(self) -> List[str]:
        """Get dependency IDs - handles both agent_ids and names for backward compat"""
        return [dep if dep.startswith('agent_') else dep for dep in self.depends_on]


class TrueDynamicCoordinator(AgentRuntime):
    """
    Coordinator that truly dynamically creates agents based on task analysis
    No predefined agent types - creates exactly what's needed for each task
    """
    
    def __init__(
        self,
        agent_id: str,
        name: str = "Dynamic Task Coordinator",
        model: str = "gpt-4o-mini",
        session_id: Optional[str] = None
    ):
        super().__init__(agent_id, name, model)
        self.session_id = session_id or agent_id
        self.session_manager = FileSessionManager(
            session_id=self.session_id,
            storage_dir="./sessions"
        )
        self.planned_agents: List[PlannedAgent] = []
        self.planned_by_id: Dict[str, PlannedAgent] = {}  # ID to agent mapping for O(1) lookup
        self.executed_agents: Dict[str, Any] = {}  # Keyed by agent_id now
        self.agent_name_to_id: Dict[str, str] = {}  # Name to ID mapping
        self.shared_state = {"agents_created": [], "results": {}}
        self._agent_counter = 0
        self.max_planning_rounds = 3  # Soft limit for iterative plan→execute→replan cycles
        self.soft_agent_cap = 12      # Soft cap to avoid runaway planning; not a hard limit
        self._initialize_coordinator()
    
    def _initialize_coordinator(self):
        """Initialize coordinator with planning-only tools"""
        
        @tool
        async def plan_specialist_agent(
            name: str,
            role: str,
            task: str,
            system_prompt: str,
            model: str = "gpt-4o-mini",
            temperature: float = 0.7,
            depends_on: List[str] = None,
            timeout: float = 60.0
        ) -> str:
            """
            Plan a specialist agent with any role and capabilities
            
            Args:
                name: Agent name (e.g., "Market Research Expert")
                role: Agent's role/specialty
                task: Specific task for this agent
                system_prompt: Full system prompt defining agent's behavior
                model: LLM model to use
                temperature: Creativity level (0.0-1.0)
                depends_on: List of agent names or IDs this depends on
                timeout: Maximum execution time in seconds
            """
            agent_id = f"agent_{self._agent_counter:03d}"
            self._agent_counter += 1
            
            # Normalize dependencies to agent_ids
            dep_ids = []
            if depends_on:
                for dep in depends_on:
                    if dep.startswith('agent_'):
                        dep_ids.append(dep)
                    elif dep in self.agent_name_to_id:
                        dep_ids.append(self.agent_name_to_id[dep])
                    else:
                        dep_ids.append(dep)  # Will resolve later
            
            planned = PlannedAgent(
                agent_id=agent_id,
                name=name,
                role=role,
                task=task,
                system_prompt=system_prompt,
                model=model,
                temperature=temperature,
                depends_on=dep_ids,
                timeout=timeout
            )
            
            self.planned_agents.append(planned)
            self.planned_by_id[agent_id] = planned  # O(1) lookup
            self.agent_name_to_id[name] = agent_id
            logger.info(f"✅ AGENT CREATED: {name} ({agent_id}) - {role}")
            logger.info(f"Total planned agents now: {len(self.planned_agents)}")
            logger.info(f"Dependencies: {dep_ids if dep_ids else 'None'}")
            
            return f"✅ Successfully created agent '{name}' ({agent_id}) with role '{role}'. Agent will execute after planning phase."
        
        @tool
        async def plan_agent_with_tools(
            name: str,
            role: str,
            task: str,
            system_prompt: str,
            tool_descriptions: List[Dict[str, str]] = None,
            tool_names: List[str] = None,
            model: str = "gpt-4o-mini",
            temperature: float = 0.7,
            depends_on: List[str] = None,
            timeout: float = 60.0,
            tool_executor: str = "concurrent"
        ) -> str:
            """
            Plan an agent with custom tools/capabilities
            
            Args:
                name: Agent name
                role: Agent's role
                task: Task to perform
                system_prompt: System prompt
                tool_descriptions: List of tool descriptions
                model: Model to use
            """
            agent_id = f"agent_{self._agent_counter:03d}"
            self._agent_counter += 1
            
            # Normalize tool list: accept tool_descriptions or tool_names
            tool_descriptions = tool_descriptions or []
            if tool_names:
                try:
                    reg = ToolRegistry()
                    for tn in tool_names:
                        tobj = reg.get_tool(tn)
                        desc = getattr(tobj, 'description', '') if tobj else ''
                        tool_descriptions.append({"name": tn, "description": desc})
                except Exception:
                    # Fallback: include names without descriptions
                    for tn in tool_names:
                        tool_descriptions.append({"name": tn, "description": ""})

            # Add tools to system prompt for clarity
            tools_prompt = "\n\nYou have the following capabilities:\n"
            for tool_desc in tool_descriptions:
                try:
                    tools_prompt += f"- {tool_desc['name']}: {tool_desc.get('description','')}\n"
                except Exception:
                    pass
            full_system_prompt = system_prompt + tools_prompt
            
            # Normalize dependencies
            dep_ids = []
            if depends_on:
                for dep in depends_on:
                    if dep.startswith('agent_'):
                        dep_ids.append(dep)
                    elif dep in self.agent_name_to_id:
                        dep_ids.append(self.agent_name_to_id[dep])
                    else:
                        dep_ids.append(dep)
            
            planned = PlannedAgent(
                agent_id=agent_id,
                name=name,
                role=role,
                task=task,
                system_prompt=full_system_prompt,
                model=model,
                temperature=temperature,
                tools=tool_descriptions,
                depends_on=dep_ids,
                timeout=timeout,
                tool_executor=tool_executor if tool_executor in ("concurrent", "sequential") else "concurrent"
            )
            
            self.planned_agents.append(planned)
            self.planned_by_id[agent_id] = planned  # O(1) lookup
            self.agent_name_to_id[name] = agent_id
            logger.info(f"Planned tool-enabled agent: {name} ({agent_id})")
            
            return f"Planned tool-enabled agent '{name}' ({agent_id}) with {len(tool_descriptions)} tools."
        
        @tool
        async def get_execution_plan() -> str:
            """Get the current execution plan"""
            if not self.planned_agents:
                return "No agents planned yet."
            plan = []
            for agent in self.planned_agents:
                plan.append({
                    "name": agent.name,
                    "role": agent.role,
                    "task": agent.task,
                    "depends_on": agent.depends_on
                })
            return json.dumps(plan, indent=2)

        # Build a catalog of available tools for planning-time awareness
        try:
            registry = ToolRegistry()
            try:
                catalog = registry.list_tools()
            except Exception:
                catalog = [{
                    'id': name,
                    'name': name,
                    'description': getattr(t, 'description', '')
                } for name, t in registry.get_all_tools().items()]
            self.available_tools_catalog = [
                {'name': c.get('name') or c.get('id'), 'description': c.get('description', '')}
                for c in catalog if (c.get('name') or c.get('id'))
            ]
            self.available_tool_names = {t['name'] for t in self.available_tools_catalog}
        except Exception:
            self.available_tools_catalog = []
            self.available_tool_names = set()

        @tool
        async def list_available_tools() -> str:
            """Return JSON list of available tool names/descriptions for planning"""
            return json.dumps(self.available_tools_catalog, indent=2)
        
        # Create the main coordinator with optimal temperature for tool use
        openai_model = OpenAIModel(
            model_id=self.model,
            temperature=0.0  # Lower temperature for more deterministic tool calling
        )
        
        # Store tools as instance attributes so they're accessible
        self.plan_specialist_agent = plan_specialist_agent
        self.plan_agent_with_tools = plan_agent_with_tools
        self.get_execution_plan = get_execution_plan
        
        logger.info(f"Initializing coordinator with {len([plan_specialist_agent, plan_agent_with_tools, get_execution_plan, list_available_tools])} planning tools")
        
        self.coordinator = Agent(
            name=self.name,
            system_prompt="""You are a Dynamic Task Coordinator. Your job is to analyze the user's request, break it into concrete sub-tasks, and create the right number of focused specialist agents to complete the work end‑to‑end.

OPERATING PRINCIPLES
- Decompose the request into actionable sub-tasks with clear deliverables.
- Choose as many agents as needed for quality and safety; prefer fewer for latency/cost. If you exceed a handful, justify briefly in the agent names/roles.
- Create agents using the available tools (plan_specialist_agent, plan_agent_with_tools).
- Prefer plan_specialist_agent for most cases; use plan_agent_with_tools when you must embed explicit capability hints in the system prompt.
- RULE: Any agent that needs to browse, fetch, compute, read or write MUST be created with plan_agent_with_tools and include explicit tool_names. Do not use plan_specialist_agent for those cases.
- Keep agents small and focused; avoid a single mega‑agent.
 - Round discipline: In round 1, create a minimal core (e.g., planner, one tool-enabled specialist such as budget/research, and a synthesizer). Defer optional specialists to later rounds after execution feedback.

FOR EACH AGENT YOU CREATE, SPECIFY
- name: concise and capability‑signaling (e.g., "Competitor Researcher").
- role: what the agent is in one line.
- task: precise instruction including acceptance criteria and required output format.
- system_prompt: include role, goals, inputs, step‑by‑step method, constraints, and definition of done. Be explicit about the desired output format (e.g., JSON fields, Markdown sections, file types).
- model: choose 'gpt-4o' for deep reasoning; 'gpt-4o-mini' for speed/cost.
- temperature: 0.0–0.3 for extraction/synthesis/evaluation; 0.5–0.8 for ideation/creative writing.
- timeout: set a reasonable bound (60–120s by default, longer only if necessary).
- depends_on: reference earlier agents by name when outputs are prerequisites (names are allowed and will be resolved to IDs).

PLANNING RULES
- Always include a final Synthesizer/Reviewer agent that aggregates prior outputs and produces the final deliverable; set depends_on to all prerequisite agents.
- Simple requests may only need 1–2 agents (specialist + synthesizer). Complex requests may need more, but keep it lean.
- After planning, you may call get_execution_plan once to verify coverage; refine if a critical gap exists.
- If results reveal gaps, you may plan additional agents in subsequent rounds until the deliverable is complete.

COMMUNICATION RULES
- Do not answer the user directly.
- Your response must primarily be tool calls that create agents. Avoid free text except minimal rationale when strictly necessary; prefer calling tools immediately.
- Do NOT call get_execution_plan as your first action. First, CALL plan_specialist_agent / plan_agent_with_tools to create at least two agents. You may call get_execution_plan later if needed.

QUALITY & SAFETY
- Include explicit success criteria and output format for every agent to improve determinism.
- If information is missing, state assumptions in the synthesizer's output and proceed with reasonable defaults.
- Avoid including your chain‑of‑thought in any agent outputs; request concise deliverables only.

TOOLS & EXECUTION STRATEGY
- If an agent needs external capabilities, use plan_agent_with_tools and list tool_names ONLY from the available catalog (call list_available_tools to fetch). The coordinator will attach these actual tools.
- For independent tool calls, set tool_executor="concurrent"; for ordered steps, set tool_executor="sequential" and encode order in the agent's task.

AVAILABLE TOOLS
- Call list_available_tools to view the current catalog of tool_names and descriptions.
- Use only names from that catalog; do not invent tool names.
""",
            model=openai_model,
            tools=[
                plan_specialist_agent,
                plan_agent_with_tools,
                get_execution_plan,
                list_available_tools
            ],
            session_manager=self.session_manager
        )
        
        logger.info(f"Initialized true dynamic coordinator: {self.agent_id}")
    
    async def _execute_planned_agent(
        self, 
        planned: PlannedAgent,
        context: AgentContext
    ):
        """Execute a planned agent and stream its execution"""
        
        # Emit agent started event with full configuration
        yield ControlFrame(
            exec_id=context.exec_id,
            type=ControlType.AGENT_STARTED,
            agent_id=planned.agent_id,
            payload={
                "name": planned.name,
                "role": planned.role,
                "parent": self.agent_id,
                "model": planned.model,
                "temperature": planned.temperature
            }
        )
        
        # Get context from dependencies (resolve both names and IDs)
        context_text = ""
        if planned.depends_on:
            for dep in planned.depends_on:
                # Try as agent_id first
                if dep in self.executed_agents:
                    context_text += f"\n{dep} results:\n{self.executed_agents[dep]}\n"
                # Try as name
                elif dep in self.agent_name_to_id:
                    dep_id = self.agent_name_to_id[dep]
                    if dep_id in self.executed_agents:
                        context_text += f"\n{dep} results:\n{self.executed_agents[dep_id]}\n"
        
        # Build prompt with clear deliverable rules (kept out of chain-of-thought)
        full_prompt = (
            f"Task: {planned.task}\n\n"
            "Deliverable Rules:\n"
            "- Output only the final deliverable in the requested format.\n"
            "- If required information is missing, list 1–3 concise assumptions and proceed.\n"
            "- Use any provided context; do not include reasoning or meta commentary in the output.\n"
        )
        if context_text:
            full_prompt = f"Context from previous agents:{context_text}\n\n{full_prompt}"
        
        # Create the agent with temperature
        openai_model = OpenAIModel(
            model_id=planned.model,
            temperature=planned.temperature
        )
        
        # Create unique session for this sub-agent
        sub_agent_session = FileSessionManager(
            session_id=f"{self.session_id}_{planned.agent_id}",
            storage_dir="./sessions"
        )
        
        # Resolve tools for this agent by creating Strands-visible wrappers
        resolved_tools = []
        requested: List[str] = []
        try:
            wrapper = DynamicToolWrapper()
            registry = ToolRegistry()
            # Try to import Strands dynamic registry (initialized at app startup)
            try:
                from app.tools.strands_tool_registry import strands_tool_registry
                strands_registry = strands_tool_registry
            except Exception:
                strands_registry = None
            # Respect only the planner’s decision; do not infer keywords
            if planned.tools:
                for t in planned.tools:
                    tname = None
                    try:
                        tname = t.get('name') if isinstance(t, dict) else str(t)
                    except Exception:
                        tname = None
                    if not tname:
                        continue
                    requested.append(tname)
                    # First try strands_tools wrapping
                    wrapped = wrapper.wrap_strands_tool(tname, planned.name)
                    # Fallback 1: Strands dynamic registry (handler)
                    if not wrapped and strands_registry and getattr(strands_registry, 'tools', None):
                        try:
                            st = strands_registry.tools.get(tname)
                            if st and hasattr(st, 'handler') and callable(st.handler):
                                wrapped = wrapper.create_visible_wrapper(tname, st.handler, planned.name)
                        except Exception:
                            wrapped = None
                    # Fallback 2: wrap our app tool instance if available
                    if not wrapped:
                        try:
                            tool_obj = registry.get_tool(tname)
                            # tool_obj may be a class instance with a __call__ or attribute 'handler'
                            if tool_obj:
                                func = getattr(tool_obj, 'handler', None)
                                if not callable(func):
                                    func = tool_obj if callable(tool_obj) else None
                                if func:
                                    wrapped = wrapper.create_visible_wrapper(tname, func, planned.name)
                        except Exception:
                            wrapped = None
                    if wrapped:
                        resolved_tools.append(wrapped)

            # Do NOT auto-add handoff_to_user; only include if planner requested it explicitly in tool_names
        except Exception as e:
            logger.warning(f"Tool wrapping failed for {planned.name}: {e}")

        # Augment system prompt with visible capabilities
        effective_system_prompt = planned.system_prompt
        try:
            if resolved_tools:
                caps = []
                for tobj in resolved_tools:
                    tname = getattr(tobj, '__name__', 'tool')
                    caps.append(f"- {tname}")
                if caps:
                    effective_system_prompt = (
                        effective_system_prompt + "\n\nYou can use the following tools when helpful (call them directly):\n" + "\n".join(caps)
                    )
        except Exception:
            pass

        agent_kwargs = dict(
            name=planned.name,
            system_prompt=effective_system_prompt,
            model=openai_model,
            session_manager=sub_agent_session
        )

        # Attach tools and executor if available
        if resolved_tools:
            agent_kwargs['tools'] = resolved_tools
            if EXECUTORS_AVAILABLE:
                if planned.tool_executor == 'sequential':
                    agent_kwargs['tool_executor'] = SequentialToolExecutor()
                else:
                    agent_kwargs['tool_executor'] = ConcurrentToolExecutor()

        agent = Agent(**agent_kwargs)
        
        logger.info(f"Executing agent {planned.name} ({planned.agent_id})")
        
        # Stream the agent's execution with timeout
        result_text = ""
        start_time = time.time()
        try:
            # Apply timeout to the entire streaming operation
            async with asyncio.timeout(planned.timeout):
                async for event in agent.stream_async(full_prompt):
                    if "data" in event:
                        text_chunk = event["data"]
                        if text_chunk:
                            result_text += text_chunk
                            # Stream text from sub-agent
                            yield TokenFrame(
                                exec_id=context.exec_id,
                                agent_id=planned.agent_id,
                                seq=self._next_seq(),
                                text=text_chunk,
                                ts=time.time(),
                                final=False
                            )
        except asyncio.TimeoutError:
            logger.error(f"Agent {planned.name} timed out after {planned.timeout}s")
            error_msg = f"\n⚠️ Timeout: Agent execution exceeded {planned.timeout} seconds\n"
            result_text = error_msg
            yield TokenFrame(
                exec_id=context.exec_id,
                agent_id=planned.agent_id,
                seq=self._next_seq(),
                text=error_msg,
                ts=time.time(),
                final=False
            )
        except Exception as e:
            logger.error(f"Error executing agent {planned.name}: {e}")
            error_msg = f"\n⚠️ Error: {str(e)}\n"
            result_text = error_msg
            yield TokenFrame(
                exec_id=context.exec_id,
                agent_id=planned.agent_id,
                seq=self._next_seq(),
                text=error_msg,
                ts=time.time(),
                final=False
            )
        
        # Final token for sub-agent
        yield TokenFrame(
            exec_id=context.exec_id,
            agent_id=planned.agent_id,
            seq=self._next_seq(),
            text="",
            ts=time.time(),
            final=True
        )
        
        # Store result by agent_id (stable key)
        self.executed_agents[planned.agent_id] = result_text
        # Also store in shared state for backward compatibility
        self.shared_state["results"][planned.agent_id] = result_text
        
        # Calculate execution time
        execution_time = time.time() - start_time
        
        # Emit agent completed event with timing metrics
        yield ControlFrame(
            exec_id=context.exec_id,
            type=ControlType.AGENT_COMPLETED,
            agent_id=planned.agent_id,
            payload={
                "name": planned.name,
                "result": result_text[:200] + "..." if len(result_text) > 200 else result_text,
                "execution_time": round(execution_time, 2),
                "timeout": planned.timeout
            }
        )
    
    async def stream(
        self,
        context: AgentContext
    ) -> AsyncIterator[Union[TokenFrame, ControlFrame]]:
        """Stream execution with dynamic agent spawning"""
        
        # Emit coordinator started
        yield ControlFrame(
            exec_id=context.exec_id,
            type=ControlType.AGENT_STARTED,
            agent_id=self.agent_id,
            payload={
                "name": self.name,
                "role": "dynamic_coordinator",
                "task": context.task,
                "model": self.model
            }
        )
        
        try:
            # Maintain execution across iterative planning rounds
            already_executed: Set[str] = set()
            spawned_announced: Set[str] = set()
            planning_context = ""
            
            # Iterative loop: plan -> execute -> evaluate -> (optionally) replan
            for round_idx in range(1, self.max_planning_rounds + 1):
                # Phase 1: Planning
                # Add few-shot examples to prime the model for tool calling
                examples = """
Example 1 — Research task
plan_agent_with_tools(
  name="Climate Researcher",
  role="Research Specialist",
  task="Collect top 5 credible sources and summarize key climate change impacts. Return a markdown report with sections: Sources, Key Impacts, Uncertainties.",
  system_prompt="You are an expert researcher. Gather credible sources, extract facts, and synthesize concise findings. Return only the markdown report.",
  tool_names=["tavily_search","http_request"],
  temperature=0.3,
  timeout=90,
  tool_executor="sequential"
)
plan_specialist_agent(
  name="Synthesis Reviewer",
  role="Report Synthesizer",
  task="Review and refine the researcher’s report for clarity and completeness. Ensure the sections are complete and non‑redundant.",
  system_prompt="You are a precise editor and synthesizer. Improve clarity, ensure section completeness, and return the final markdown only.",
  temperature=0.1,
  depends_on=["Climate Researcher"],
  timeout=60
)

Example 2 — Build a website
plan_agent_with_tools(
  name="Frontend Dev",
  role="Frontend Developer",
  task="Design a simple responsive landing page layout with header, hero, features grid, and CTA. Return HTML+CSS code blocks only.",
  system_prompt="You are a frontend developer focused on clean, accessible, responsive UI.",
  tool_names=["editor"],
  temperature=0.6,
  timeout=120
)
plan_agent_with_tools(
  name="Backend Dev",
  role="Backend Developer",
  task="Define minimal REST endpoints and a sample payload for newsletter signup. Return OpenAPI YAML only.",
  system_prompt="You are a backend developer producing clear, minimal OpenAPI specs.",
  tool_names=["editor","python_repl"],
  temperature=0.2,
  depends_on=["Frontend Dev"],
  timeout=120,
  tool_executor="sequential"
)
plan_specialist_agent(
  name="Delivery Synthesizer",
  role="Final Assembler",
  task="Assemble final deliverables: 1) HTML/CSS, 2) OpenAPI YAML. Return a single concise markdown with both artifacts.",
  system_prompt="You produce final, polished deliverables by aggregating prior outputs. Return only the requested markdown.",
  temperature=0.1,
  depends_on=["Frontend Dev", "Backend Dev"],
  timeout=60
)
"""
                prompt = f"""Round {round_idx} — Task: {context.task}

Create agents using the available planning tools. Prefer plan_specialist_agent; use plan_agent_with_tools when embedding explicit capability hints is helpful. Always include a final synthesizer/reviewer that depends_on all prerequisite agents and produces the final deliverable.
{examples}

Now create your agents by calling the planning tools (not text descriptions)."""

                if planning_context:
                    prompt += f"\n\nPlanning context: {planning_context}"
                if context.parent_result:
                    prompt += f"\n\nParent context: {context.parent_result}"

                # Stream planning phase
                planning_response = ""
                try:
                    async for event in self.coordinator.stream_async(prompt):
                        if "data" in event:
                            text_chunk = event["data"]
                            if text_chunk:
                                planning_response += text_chunk
                                yield TokenFrame(
                                    exec_id=context.exec_id,
                                    agent_id=self.agent_id,
                                    seq=self._next_seq(),
                                    text=text_chunk,
                                    ts=time.time(),
                                    final=False
                                )
                                # While planning streams, announce any newly planned agents immediately
                                try:
                                    for planned in self.planned_agents:
                                        if planned.agent_id not in spawned_announced:
                                            spawned_announced.add(planned.agent_id)
                                            yield ControlFrame(
                                                exec_id=context.exec_id,
                                                type="agent_spawned",
                                                agent_id=planned.agent_id,
                                                payload={
                                                    "id": planned.agent_id,
                                                    "name": planned.name,
                                                    "role": planned.role,
                                                    "parent": self.agent_id,
                                                    "depends_on": planned.depends_on,
                                                    "model": planned.model,
                                                    "temperature": planned.temperature,
                                                    "has_tools": len(planned.tools) > 0
                                                }
                                            )
                                except Exception:
                                    pass
                except Exception as e:
                    logger.error(f"Error during planning phase: {e}")
                    error_msg = f"\n\n⚠️ Error during planning: {str(e)}\n"
                    yield TokenFrame(
                        exec_id=context.exec_id,
                        agent_id=self.agent_id,
                        seq=self._next_seq(),
                        text=error_msg,
                        ts=time.time(),
                        final=False
                    )
                    # Continue with any agents that were planned before the error
                    planning_response += error_msg

                # Check if agents were actually created
                if not self.planned_agents or len([a for a in self.planned_agents if a.agent_id not in already_executed]) == 0:
                    logger.warning("⚠️ NO NEW AGENTS WERE CREATED! The coordinator may not have called the tool functions.")
                    yield TokenFrame(
                        exec_id=context.exec_id,
                        agent_id=self.agent_id,
                        seq=self._next_seq(),
                        text="\n\n⚠️ WARNING: No new agents were created! The coordinator needs to use the tool functions.\n",
                        ts=time.time(),
                        final=False
                    )

                # Validate that non-synthesizer agents include tools; if not, replan with explicit instruction
                try:
                    planned_before_ids = set(aid for aid in already_executed)  # Use executed ids as boundary
                    new_agents = [a for a in self.planned_agents if a.agent_id not in planned_before_ids]
                    missing_tools = [a for a in new_agents if not (('synth' in (a.name or '').lower()) or ('review' in (a.role or '').lower())) and (not a.tools or len(a.tools) == 0)]
                    if missing_tools:
                        names = ", ".join(a.name for a in missing_tools)
                        warn = f"\n⚠️ Planning validator: The following agents lack tool_names and will be ineffective: {names}.\n" \
                               f"👉 Replan by calling plan_agent_with_tools for each, specifying appropriate tool_names (e.g., tavily_search, http_request, editor, python_repl, calculator).\n"
                        yield TokenFrame(
                            exec_id=context.exec_id,
                            agent_id=self.agent_id,
                            seq=self._next_seq(),
                            text=warn,
                            ts=time.time(),
                            final=False
                        )
                        # Prime next round with an explicit directive for the planner, but DO NOT skip execution
                        planning_context = f"Agents missing tools: {names}. For each, re-create using plan_agent_with_tools with explicit tool_names."
                except Exception as e:
                    logger.warning(f"Planning validator failed: {e}")

                # Final token for planning phase
                yield TokenFrame(
                    exec_id=context.exec_id,
                    agent_id=self.agent_id,
                    seq=self._next_seq(),
                    text="",
                    ts=time.time(),
                    final=True
                )

                # Ensure there is a final synthesizer/reviewer; add one if missing
                if self.planned_agents:
                    try:
                        synth_present = any(
                            ('synth' in (a.name or '').lower()) or ('review' in (a.role or '').lower())
                            for a in self.planned_agents
                        )
                        if not synth_present:
                            new_id = f"agent_{self._agent_counter:03d}"
                            self._agent_counter += 1
                            depends_all = [a.agent_id for a in self.planned_agents]
                            synth_agent = PlannedAgent(
                                agent_id=new_id,
                                name="Delivery Synthesizer",
                                role="Final Assembler",
                                task="Aggregate outputs from all prior agents and produce the final deliverable in the requested format. Start with a single JSON status line: {\"status\":\"DONE|NEEDS_INFO|BLOCKED\", \"missing\":[...], \"next_steps\":[...]}. Then return the final deliverable.",
                                system_prompt=(
                                    "You synthesize and polish final deliverables from prior agent outputs. "
                                    "Begin your response with a single JSON status line that will be parsed programmatically. "
                                    "Ensure clarity, completeness, and consistency. Then return only the final deliverable."
                                ),
                                model="gpt-4o-mini",
                                temperature=0.1,
                                depends_on=depends_all,
                                timeout=90,
                                tool_executor="sequential"
                            )
                            self.planned_agents.append(synth_agent)
                            self.planned_by_id[new_id] = synth_agent
                            self.agent_name_to_id[synth_agent.name] = new_id
                            logger.info("Auto-added Delivery Synthesizer to complete the workflow")
                    except Exception as e:
                        logger.warning(f"Failed to auto-add synthesizer: {e}")

                # Emit planning summary with structured plan + graph edges
                if self.planned_agents:
                    plan_data = [{
                        "id": agent.agent_id,
                        "name": agent.name,
                        "role": agent.role,
                        "depends_on": agent.depends_on,
                        "model": agent.model
                    } for agent in self.planned_agents]

                    # Build graph edges from depends_on (dep -> agent)
                    edges = []
                    known_ids = {a.agent_id for a in self.planned_agents}
                    for agent in self.planned_agents:
                        deps = agent.depends_on or []
                        for dep in deps:
                            dep_id = dep
                            if not isinstance(dep_id, str):
                                dep_id = str(dep_id)
                            if not dep_id.startswith('agent_'):
                                dep_id = self.agent_name_to_id.get(dep_id, dep_id)
                            # Only add edges for dependencies we know about
                            if dep_id in known_ids:
                                edges.append({
                                    "from": dep_id,
                                    "to": agent.agent_id
                                })

                    # Entry points: nodes with no known dependencies
                    entry_points = [a.agent_id for a in self.planned_agents if not a.depends_on]

                    yield ControlFrame(
                        exec_id=context.exec_id,
                        type="planning_complete",
                        agent_id=self.agent_id,
                        payload={
                            "plan": plan_data,
                            "agent_count": len(self.planned_agents),
                            "round": round_idx,
                            "graph": {
                                "nodes": [{"id": a.agent_id, "name": a.name, "role": a.role} for a in self.planned_agents],
                                "edges": edges,
                                "entry_points": entry_points
                            }
                        }
                    )

                    # Emit spawn events for newly planned agents BEFORE execution
                    for planned in self.planned_agents:
                        if planned.agent_id in spawned_announced:
                            continue
                        spawned_announced.add(planned.agent_id)
                        yield ControlFrame(
                            exec_id=context.exec_id,
                            type="agent_spawned",
                            agent_id=planned.agent_id,
                            payload={
                                "id": planned.agent_id,
                                "name": planned.name,
                                "role": planned.role,
                                "parent": self.agent_id,
                                "depends_on": planned.depends_on,
                                "model": planned.model,
                                "temperature": planned.temperature,
                                "has_tools": len(planned.tools) > 0
                            }
                        )

                # Emit DAG structure for visualization after planning
                if self.planned_agents and len(self.planned_agents) > len(already_executed):
                    # Build DAG structure for new agents
                    dag_nodes = []
                    dag_edges = []
                    
                    # Add coordinator node if this is the first round
                    if round_idx == 1:
                        dag_nodes.append({
                            "id": self.agent_id,
                            "name": self.name,
                            "role": "Coordinator",
                            "task": "Analyze task and plan agents",
                            "type": "coordinator"
                        })
                    
                    for agent in self.planned_agents:
                        if agent.agent_id not in already_executed:
                            dag_nodes.append({
                                "id": agent.agent_id,
                                "name": agent.name,
                                "role": agent.role,
                                "task": agent.task[:100] + "..." if len(agent.task) > 100 else agent.task,
                                "type": "tool_agent" if agent.tools else "specialist_agent"
                            })
                            
                            # Add edges for dependencies
                            if agent.depends_on:
                                for dep in agent.depends_on:
                                    # Resolve dependency ID
                                    dep_id = dep
                                    if dep in self.agent_name_to_id:
                                        dep_id = self.agent_name_to_id[dep]
                                    dag_edges.append({
                                        "source": dep_id,
                                        "target": agent.agent_id,
                                        "type": "dependency"
                                    })
                            else:
                                # If no dependencies, connect to coordinator
                                dag_edges.append({
                                    "source": self.agent_id,
                                    "target": agent.agent_id,
                                    "type": "spawned"
                                })
                    
                    # Emit DAG structure
                    yield ControlFrame(
                        exec_id=context.exec_id,
                        type="dag_structure",
                        agent_id=self.agent_id,
                        payload={
                            "nodes": dag_nodes,
                            "edges": dag_edges,
                            "round": round_idx
                        }
                    )
                
                # Phase 2: Execution with dependency resolution (streaming preserved)
                logger.info(f"About to execute agents. Planned count: {len(self.planned_agents)}; already executed: {len(already_executed)}")
                if self.planned_agents:
                    # Emit execution starting
                    yield TokenFrame(
                        exec_id=context.exec_id,
                        agent_id=self.agent_id,
                        seq=self._next_seq(),
                        text=f"\n\n🚀 Round {round_idx}: Executing planned agents...\n\n",
                        ts=time.time(),
                        final=False
                    )

                    # Track execution state
                    pending_agents = set(a.agent_id for a in self.planned_agents if a.agent_id not in already_executed)
                    executed = set()
                    failed_deps = set()
                    max_iterations = max(1, len(pending_agents) * 2)  # Prevent infinite loops
                    iteration = 0

                    # Execute agents with dependency resolution
                    while pending_agents and iteration < max_iterations:
                        iteration += 1
                        ready_to_execute = []

                        for agent_id in list(pending_agents):
                            agent = self.planned_by_id[agent_id]  # O(1) lookup

                            # Check dependencies using agent_ids
                            deps_resolved = True
                            for dep in agent.get_dependency_ids():
                                # Resolve name to ID if needed
                                dep_id = self.agent_name_to_id.get(dep, dep) if not dep.startswith('agent_') else dep
                                if dep_id not in already_executed and dep_id not in executed and dep_id not in failed_deps:
                                    deps_resolved = False
                                    break

                            if deps_resolved:
                                ready_to_execute.append(agent)

                        # Execute ready agents in parallel (with concurrency limit)
                        if ready_to_execute:
                            # Limit concurrent executions to avoid overwhelming the system
                            max_concurrent = 3

                            # Process in batches
                            for i in range(0, len(ready_to_execute), max_concurrent):
                                batch = ready_to_execute[i:i + max_concurrent]

                                # Execute and stream each agent's output in real-time
                                for agent in batch:
                                    try:
                                        async for frame in self._execute_planned_agent(agent, context):
                                            yield frame  # Stream immediately
                                        executed.add(agent.agent_id)
                                        already_executed.add(agent.agent_id)
                                    except Exception as e:
                                        logger.error(f"Failed to execute agent {agent.name}: {e}")
                                        failed_deps.add(agent.agent_id)
                                    finally:
                                        pending_agents.remove(agent.agent_id)
                        else:
                            # No progress possible - report unresolved dependencies
                            if pending_agents:
                                unresolved = []
                                for agent_id in pending_agents:
                                    agent = self.planned_by_id[agent_id]  # O(1) lookup
                                    unresolved.append(f"{agent.name} ({agent.agent_id}): waiting for {agent.depends_on}")

                                error_msg = f"\n⚠️ Unresolved dependencies detected:\n" + "\n".join(unresolved) + "\n"
                                yield TokenFrame(
                                    exec_id=context.exec_id,
                                    agent_id=self.agent_id,
                                    seq=self._next_seq(),
                                    text=error_msg,
                                    ts=time.time(),
                                    final=False
                                )

                                # Emit control frame for UI
                                yield ControlFrame(
                                    exec_id=context.exec_id,
                                    type="dependencies_unresolved",
                                    agent_id=self.agent_id,
                                    payload={
                                        "unresolved": [{
                                            "agent_id": aid,
                                            "name": self.planned_by_id[aid].name,
                                            "depends_on": self.planned_by_id[aid].depends_on
                                        } for aid in pending_agents]
                                    }
                                )
                            break

                # Phase 3: Evaluate structured status and decide next round
                synth_id = None
                for a in reversed(self.planned_agents):
                    if 'synth' in (a.name or '').lower() or 'review' in (a.role or '').lower():
                        synth_id = a.agent_id
                        break
                continue_planning = False
                needs_info: List[str] = []

                if synth_id and synth_id in self.executed_agents:
                    synth_output = self.executed_agents[synth_id] or ""
                    first_line = (synth_output.splitlines() or [""])[0].strip()
                    status_obj = None
                    try:
                        status_obj = json.loads(first_line)
                    except Exception:
                        status_obj = None

                    if isinstance(status_obj, dict) and 'status' in status_obj:
                        st = (status_obj.get('status') or '').upper()
                        if st == 'DONE':
                            continue_planning = False
                        elif st == 'NEEDS_INFO':
                            needs_info = status_obj.get('missing') or []
                            # Emit handoff request to UI and stop
                            msg = "Additional information required: " + ", ".join(needs_info)
                            yield ControlFrame(
                                exec_id=context.exec_id,
                                type="handoff_request",
                                agent_id=self.agent_id,
                                payload={"message": msg, "missing": needs_info}
                            )
                            yield TokenFrame(
                                exec_id=context.exec_id,
                                agent_id=self.agent_id,
                                seq=self._next_seq(),
                                text=f"\n⏸️ Waiting for user input: {msg}\n",
                                ts=time.time(),
                                final=True
                            )
                            # Persist state for resume
                            try:
                                if hasattr(self.coordinator, 'state'):
                                    self.coordinator.state.set('dynamic_state', {
                                        'round': round_idx,
                                        'planned': [a.agent_id for a in self.planned_agents],
                                        'executed': list(already_executed),
                                        'needs_info': needs_info
                                    })
                            except Exception:
                                pass
                            return
                        elif st == 'BLOCKED':
                            continue_planning = False
                        else:
                            # Unknown, check next_steps
                            next_steps = status_obj.get('next_steps') or []
                            if next_steps:
                                planning_context = f"Next steps suggested: {next_steps}"
                                continue_planning = True
                    else:
                        # If no structured status but deliverable seems incomplete, allow one more round if under cap
                        continue_planning = False

                # Persist round state
                try:
                    if hasattr(self.coordinator, 'state'):
                        self.coordinator.state.set('dynamic_state', {
                            'round': round_idx,
                            'planned': [a.agent_id for a in self.planned_agents],
                            'executed': list(already_executed),
                            'needs_info': needs_info
                        })
                except Exception:
                    pass

                if not continue_planning:
                    break

            # Final summary after loop
            summary = f"\n\n✅ Execution complete. {len(self.executed_agents)} agents executed successfully.\n"
            yield TokenFrame(
                exec_id=context.exec_id,
                agent_id=self.agent_id,
                seq=self._next_seq(),
                text=summary,
                ts=time.time(),
                final=True
            )

            # Emit completion
            yield ControlFrame(
                exec_id=context.exec_id,
                type=ControlType.AGENT_COMPLETED,
                agent_id=self.agent_id,
                payload={
                    "agents_planned": len(self.planned_agents),
                    "agents_executed": len(self.executed_agents),
                    "agent_ids": list(self.executed_agents.keys())
                }
            )
            
        except Exception as e:
            logger.error(f"Dynamic coordinator {self.agent_id} error: {e}")
            
            yield ControlFrame(
                exec_id=context.exec_id,
                type=ControlType.ERROR,
                agent_id=self.agent_id,
                payload={
                    "error": str(e),
                    "type": type(e).__name__
                }
            )
