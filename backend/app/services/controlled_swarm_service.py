"""
Controlled Event-Driven Swarm Service with Agent Pool Management
"""
import asyncio
import time
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any, Set
import logging
import threading

from app.schemas.swarm import SwarmExecutionRequest, SwarmExecutionResponse, ExecutionStatus
from app.services.agent_pool_manager import AgentPoolManager
from app.services.circuit_breaker import CircuitBreaker
from app.services.event_bus import event_bus
from app.services.event_aware_agent import EventAwareAgent, AgentCapabilities
from app.services.human_loop_agent import HumanLoopAgent
from app.services.agent_memory_store import get_memory_store

logger = logging.getLogger(__name__)

class ControlledSwarmService:
    """Event-driven swarm with strict controls and limits"""
    
    def __init__(self, config: dict = None):
        # Use user-provided config or defaults
        config = config or {}
        
        self.pool_manager = AgentPoolManager(
            max_concurrent_agents=config.get("max_concurrent_agents", 3),
            max_total_agents=config.get("max_total_agents", 8), 
            max_execution_time=config.get("max_execution_time", 180),
            max_agent_runtime=config.get("max_agent_runtime", 60),
            cpu_limit_percent=config.get("cpu_limit_percent", 75.0),
            memory_limit_mb=config.get("memory_limit_mb", 1024.0)  # 1GB process limit
        )
        
        self.active_executions: Dict[str, dict] = {}
        self.agent_registry: Dict[str, EventAwareAgent] = {}
        
        # Circuit breakers for different failure types
        self.spawn_breaker = CircuitBreaker(failure_threshold=3, recovery_timeout=60)
        self.execution_breaker = CircuitBreaker(failure_threshold=5, recovery_timeout=120)
        
        # Thread-safe tracking of spawned roles per execution
        self._spawned_roles_lock = threading.RLock()
        self._spawned_roles_by_execution: Dict[str, Set[str]] = {}
        
        # Human-in-the-loop and memory management
        self.memory_store = get_memory_store()
        self.enable_human_loop = config.get("enable_human_loop", True)
        self.human_interactions: Dict[str, Dict] = {}  # Track pending human interactions
        
        # Register for human interaction events
        if self.enable_human_loop:
            self._register_human_interaction_handlers()
        
        # UI-provided tool preferences (set by API layer)
        self.user_tool_preferences: Dict[str, Any] = {
            'selected_tools': [],
            'restrict_to_selected': False,
        }
        # Execution graphs for JSON export and UI introspection
        self.execution_graphs: Dict[str, Dict[str, Any]] = {}
        # Queue spawn requests per execution
        self._pending_spawns: Dict[str, List[Any]] = {}
        try:
            # Register listener to capture agent.needed
            event_bus.on("agent.needed", self._on_agent_needed)
        except Exception:
            pass
        # Queue spawn requests per execution for reliable processing
        self._pending_spawns: Dict[str, List[Any]] = {}
        try:
            # Register listener to capture agent.needed as they happen
            event_bus.on("agent.needed", self._on_agent_needed)
        except Exception:
            pass
    
    def _register_human_interaction_handlers(self):
        """Register handlers to track human interactions"""
        event_bus.on("human.approval.needed", self._track_human_interaction)
        event_bus.on("human.question", self._track_human_interaction)
        event_bus.on("human.handoff.requested", self._track_human_interaction)
        event_bus.on("human.approval.response", self._resolve_human_interaction)
        event_bus.on("human.response", self._resolve_human_interaction)
    
    async def _track_human_interaction(self, event):
        """Track when a human interaction is needed"""
        interaction_id = event.data.get("id")
        if interaction_id:
            self.human_interactions[interaction_id] = {
                "status": "pending",
                "type": event.type,
                "timestamp": event.timestamp,
                "data": event.data
            }
            logger.info(f"📋 Tracking human interaction: {interaction_id} ({event.type})")
    
    async def _resolve_human_interaction(self, event):
        """Track when a human interaction is resolved"""
        # Try to find the interaction ID from the event
        interaction_id = None
        if event.type.startswith("human.approval.response"):
            interaction_id = event.type.split(".")[-1]  # Extract from "human.approval.response.{id}"
        elif event.type.startswith("human.response"):
            interaction_id = event.type.split(".")[-1]  # Extract from "human.response.{id}"
        
        if interaction_id and interaction_id in self.human_interactions:
            self.human_interactions[interaction_id]["status"] = "resolved"
            logger.info(f"✅ Resolved human interaction: {interaction_id}")
        
    async def execute_swarm_async(
        self,
        request: SwarmExecutionRequest,
        user_id: str,
        callback_handler=None
    ) -> SwarmExecutionResponse:
        """Execute swarm with strict controls"""
        execution_id = request.execution_id or str(uuid.uuid4())
        start_time = time.time()
        
        logger.info(f"🎯 Starting CONTROLLED swarm execution {execution_id}")
        
        try:
            # Start pool management
            await self.pool_manager.start_execution(execution_id)
            
            # Track execution
            self.active_executions[execution_id] = {
                "status": "running",
                "start_time": start_time,
                "user_id": user_id,
                "request": request,
                "callback": callback_handler,
                "parent_map": {}
            }
            
            # Pass streaming callback to pool_manager for timeout notifications
            if callback_handler:
                self.pool_manager.streaming_callback = callback_handler
            
            # Execute with controls
            result = await self._execute_with_controls(execution_id, request, callback_handler)
            
            # Mark as completed
            self.active_executions[execution_id]["status"] = "completed"
            
            return SwarmExecutionResponse(
                status=ExecutionStatus.COMPLETED,
                result=result,
                execution_id=execution_id,
                agents_used=list(self.agent_registry.keys()),
                total_time=time.time() - start_time
            )
            
        except Exception as e:
            logger.error(f"❌ Controlled swarm execution failed: {e}")
            
            # Mark as failed and cleanup
            if execution_id in self.active_executions:
                self.active_executions[execution_id]["status"] = "failed"
            
            await self.pool_manager.stop_execution(force=True)
            
            return SwarmExecutionResponse(
                status=ExecutionStatus.FAILED,
                result=f"Execution failed: {str(e)}",
                execution_id=execution_id,
                agents_used=list(self.agent_registry.keys()),
                total_time=time.time() - start_time
            )
        finally:
            # Cleanup
            await self._cleanup_execution(execution_id)
    
    async def _execute_with_controls(
        self,
        execution_id: str,
        request: SwarmExecutionRequest,
        callback_handler
    ) -> str:
        """Main execution loop with strict controls"""
        
        # Extract session_id for human-loop compatibility
        session_id = request.session_id
        logger.info(f"🔗 Controlled swarm execution with session_id: {session_id}")
        
        # Send initial status update
        if callback_handler:
            await callback_handler(
                type="status",
                data={"message": "🎯 Starting controlled swarm execution", "execution_id": execution_id}
            )
        
        # Step 1: Spawn initial analyzer agent (controlled)
        try:
            if callback_handler:
                await callback_handler(
                    type="status", 
                    data={"message": "🤖 Spawning initial analyzer agent", "execution_id": execution_id}
                )
            
            initial_agent_id = await self._spawn_controlled_agent(
                execution_id=execution_id,
                role="analyzer",
                task=request.task,
                callback_handler=callback_handler,
                session_id=session_id
            )
            
            if not initial_agent_id:
                raise Exception("Failed to spawn initial agent")
                
        except Exception as e:
            if callback_handler:
                await callback_handler(
                    type="error",
                    data={"message": f"❌ Initial agent spawn failed: {e}", "execution_id": execution_id}
                )
            raise Exception(f"Initial agent spawn failed: {e}")
        
        # Step 2: Controlled execution loop
        result = await self._controlled_execution_loop(execution_id, request.task, callback_handler, session_id)
        
        # Send completion status
        if callback_handler:
            await callback_handler(
                type="completion",
                data={"message": "✅ Controlled swarm execution completed", "result": result, "execution_id": execution_id}
            )
            
            # CRITICAL: Send done event to mark completion and stop infinite polling
            await callback_handler(
                type="done",
                data={"execution_id": execution_id}
            )
        
        return result
    
    async def _spawn_agent_atomic(
        self, 
        execution_id: str, 
        request, 
        original_query: str, 
        accumulated_results: list,
        callback_handler,
        session_id: str = None
    ) -> Optional[str]:
        """Atomically spawn a single agent with race condition protection"""
        agent_role = request.data.get("role", "writer")
        reason = request.data.get("reason", "AI requested agent")
        
        # Check if this role is already spawned for this execution
        with self._spawned_roles_lock:
            spawned_roles = self._spawned_roles_by_execution.get(execution_id, set())
            if agent_role in spawned_roles:
                logger.info(f"🔄 Role {agent_role} already spawned for execution {execution_id}")
                return None
            
            # Mark as spawning to prevent other threads from spawning the same role
            spawned_roles.add(agent_role)
        
        try:
            new_agent_id = await self._spawn_controlled_agent(
                execution_id=execution_id,
                role=agent_role,
                task=f"Original task: {original_query}. Your specific role: {reason}",
                context={
                    "reason": reason, 
                    "priority": request.data.get("priority", "medium"),
                    "original_query": original_query,
                    "accumulated_results": accumulated_results,  # Pass full context
                    "agent_role": agent_role,
                    "tool_preferences": self.user_tool_preferences,
                    "parent": getattr(request, 'source', None) or request.data.get('requesting_agent')
                },
                callback_handler=callback_handler,
                session_id=session_id
            )
            
            if new_agent_id:
                logger.info(f"✅ Atomically spawned {agent_role} agent: {new_agent_id}")
                # Record parent-child mapping and graph edge now that we know ids
                try:
                    parent = getattr(request, 'source', None) or request.data.get('requesting_agent')
                    if parent:
                        exec_data = self.active_executions.get(execution_id, {})
                        parent_map = exec_data.get('parent_map', {})
                        child_name = f"{agent_role}_{new_agent_id[:8]}"
                        parent_map[child_name] = parent
                        exec_data['parent_map'] = parent_map
                        self.active_executions[execution_id] = exec_data
                        # Also update execution graph with edge and parent
                        graph = self.execution_graphs.get(execution_id)
                        if graph is not None:
                            node = graph['nodes'].get(child_name, {"name": child_name, "role": agent_role, "parent": parent, "status": "starting", "started_at": None, "finished_at": None})
                            node['parent'] = parent
                            graph['nodes'][child_name] = node
                            graph['edges'].append({"from": parent, "to": child_name})
                            self.execution_graphs[execution_id] = graph
                        logger.info(f"🧬 Linked subagent {child_name} to parent {parent}")
                except Exception as map_err:
                    logger.debug(f"Parent mapping/graph update failed: {map_err}")
                return new_agent_id
            else:
                logger.warning(f"⚠️ Failed to spawn {agent_role} agent")
                # Remove from spawned roles on failure
                with self._spawned_roles_lock:
                    spawned_roles = self._spawned_roles_by_execution.get(execution_id, set())
                    spawned_roles.discard(agent_role)
                return None
                
        except Exception as spawn_error:
            logger.error(f"❌ Error spawning agent {agent_role}: {spawn_error}")
            # Remove from spawned roles on error
            with self._spawned_roles_lock:
                spawned_roles = self._spawned_roles_by_execution.get(execution_id, set())
                spawned_roles.discard(agent_role)
            raise spawn_error
    
    @CircuitBreaker(failure_threshold=3, recovery_timeout=60)
    async def _spawn_controlled_agent(
        self,
        execution_id: str,
        role: str,
        task: str,
        context: dict = None,
        callback_handler=None,
        session_id: str = None
    ) -> Optional[str]:
        """Spawn agent with strict controls"""
        
        # Check if we can spawn
        can_spawn, reason = await self.pool_manager.can_spawn_agent(role)
        if not can_spawn:
            logger.warning(f"🚫 Cannot spawn {role}: {reason}")
            return None
        
        try:
            # Register with pool manager
            agent_id = await self.pool_manager.register_agent(f"{role}_{len(self.agent_registry)}", role)
            
            # Create controlled agent with session_id for human-loop compatibility
            agent = await self._create_controlled_agent(role, agent_id, execution_id, callback_handler, session_id)
            
            # Store in registry
            self.agent_registry[agent_id] = agent

            # Record node in execution graph
            try:
                child_name = f"{role}_{agent_id[:8]}"
                if execution_id not in self.execution_graphs:
                    self.execution_graphs[execution_id] = {"nodes": {}, "edges": [], "requested": [], "spawned": []}
                graph = self.execution_graphs[execution_id]
                graph["nodes"][child_name] = graph["nodes"].get(child_name, { 
                    "name": child_name,
                    "role": role,
                    "parent": None,
                    "status": "starting",
                    "started_at": None,
                    "finished_at": None
                })
                if child_name not in graph["spawned"]:
                    graph["spawned"].append(child_name)
            except Exception:
                pass
            
            # Mark as running
            await self.pool_manager.mark_agent_running(agent_id)
            
            # Execute task with timeout
            asyncio.create_task(self._execute_agent_with_timeout(agent_id, task, context or {}))
            
            logger.info(f"✅ Spawned controlled agent: {role} (ID: {agent_id})")
            return agent_id
            
        except Exception as e:
            logger.error(f"❌ Failed to spawn {role}: {e}")
            await self.pool_manager.mark_agent_completed(agent_id, success=False)
            raise e
    
    async def _create_controlled_agent(
        self,
        role: str,
        agent_id: str,
        execution_id: str,
        callback_handler,
        session_id: str = None
    ) -> HumanLoopAgent:
        """Create an event-aware agent with controls"""
        
        # Generate dynamic capabilities based on role using AI
        capabilities = await self._generate_dynamic_capabilities(role)
        
        # Generate AI-driven system prompt
        system_prompt = await self._generate_dynamic_system_prompt(role)
        
        # Augment prompt with execution rules and tool guidance (bias toward concrete outputs)
        try:
            selected_tools = list(self.user_tool_preferences.get('selected_tools') or [])
            restrict_flag = bool(self.user_tool_preferences.get('restrict_to_selected', False))
            if selected_tools:
                tool_text = ", ".join(sorted(set(selected_tools)))
            else:
                tool_text = "(auto)"
            system_prompt += (
                "\n\nExecution Rules:\n"
                f"- You are a specialized '{role}' agent. Do not re-plan; execute your part.\n"
                "- Prefer concrete outputs over analysis. Use tools when helpful.\n"
                f"- Available tools preference: {tool_text}. Restrict mode: {'on' if restrict_flag else 'off'}.\n"
                "- If coding, generate files and artifacts; if researching, include citations and links.\n"
                "- Keep responses concise and action-oriented. Mark completion clearly.\n"
            )
        except Exception:
            pass
        
        # Use HumanLoopAgent if human interaction is enabled
        if self.enable_human_loop:
            # Use session_id if provided, otherwise fall back to execution_id
            effective_execution_id = session_id or execution_id
            logger.info(f"🔗🤖 Creating HumanLoopAgent with execution_id: {effective_execution_id} (session_id: {session_id}, original: {execution_id})")
            logger.info(f"🔗🤖 HumanLoopAgent config: role={role}, enable_human_loop={self.enable_human_loop}")
            
            agent = HumanLoopAgent(
                name=f"{role}_{agent_id[:8]}",
                role=role,
                system_prompt=system_prompt,
                capabilities=capabilities,
                execution_id=effective_execution_id,
                memory_store=self.memory_store
            )
            # Set the callback handler for streaming output
            agent.callback_handler = callback_handler
            logger.info(f"✅🤖 Successfully created HumanLoopAgent: {agent.name} (callback_handler: {callback_handler is not None})")
        else:
            logger.info(f"⚠️ Creating regular EventAwareAgent because enable_human_loop={self.enable_human_loop}")
            agent = EventAwareAgent(
                name=f"{role}_{agent_id[:8]}",
                role=role,
                system_prompt=system_prompt,
                capabilities=capabilities
            )
            # Set the callback handler for streaming output
            agent.callback_handler = callback_handler
            logger.info(f"✅🤖 Successfully created EventAwareAgent: {agent.name} (callback_handler: {callback_handler is not None})")
        
        return agent
    
    async def _generate_dynamic_capabilities(self, role: str) -> AgentCapabilities:
        """Generate dynamic agent capabilities using AI analysis"""
        try:
            from strands import Agent
            from strands.models.openai import OpenAIModel
            import os
            from dotenv import load_dotenv
            import json
            
            load_dotenv()
            api_key = os.getenv("OPENAI_API_KEY")
            
            if not api_key:
                logger.warning("No OpenAI API key - using fallback capabilities")
                return self._fallback_capabilities(role)
            
            # Create AI capability generator
            model = OpenAIModel(
                client_args={"api_key": api_key},
                model_id="gpt-4o-mini",
                params={"max_tokens": 300, "temperature": 0.2}
            )
            
            capability_generator = Agent(
                name="capability_generator",
                system_prompt="""You are an intelligent agent capability generator. Analyze a role description and generate appropriate capabilities.

Given a role, respond with ONLY a JSON object containing:
{
  "skills": ["skill1", "skill2", ...],
  "tools": ["tool1", "tool2", ...], 
  "listens_to": ["event1", "event2", ...],
  "emits": ["event1", "event2", ...]
}

Skills: Core competencies this agent has
Tools: Technical tools needed (web_search, code_interpreter, file_editor, data_analysis)
Listens_to: Event types this agent responds to 
Emits: Event types this agent can generate

Be specific and relevant to the role. Don't be generic.""",
                model=model
            )
            
            prompt = f"Generate capabilities for this agent role: {role}"
            
            # Use stream_async to get capabilities with a strict timeout
            async def _consume_stream() -> str:
                content = ""
                async for event in capability_generator.stream_async(prompt):
                    if "data" in event:
                        content += event["data"]
                    elif "result" in event:
                        result = event["result"]
                        if hasattr(result, 'content'):
                            content = result.content
                        else:
                            content = str(result)
                        break
                return content

            try:
                capabilities_content = await asyncio.wait_for(_consume_stream(), timeout=20.0)
            except asyncio.TimeoutError:
                logger.warning("Capability generation timed out; using fallback")
                return self._fallback_capabilities(role)
                    
            response = capabilities_content.strip()
            
            # Parse JSON response
            try:
                capabilities_data = json.loads(response)
                
                # Merge UI-selected tools into capabilities, with mapping where needed
                base_tools = capabilities_data.get("tools", []) or []
                merged_tools = self._merge_selected_tools(base_tools)

                return AgentCapabilities(
                    skills=capabilities_data.get("skills", [role.lower()]),
                    tools=merged_tools,
                    listens_to=capabilities_data.get("listens_to", ["agent.needed"]),
                    emits=capabilities_data.get("emits", ["task.complete"])
                )
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse capabilities JSON: {e}")
                return self._fallback_capabilities(role)
                
        except Exception as e:
            logger.error(f"AI capability generation failed: {e}")
            # Ensure fallback respects selected tools
            caps = self._fallback_capabilities(role)
            caps.tools = self._merge_selected_tools(caps.tools)
            return caps
    
    def _fallback_capabilities(self, role: str) -> AgentCapabilities:
        """Fallback capabilities when AI generation fails"""
        caps = AgentCapabilities(
            skills=[role.lower().replace(" ", "_"), "problem_solving"],
            tools=[],
            listens_to=["agent.needed"],
            emits=["task.complete"]
        )
        return caps

    def _merge_selected_tools(self, ai_tools: List[str]) -> List[str]:
        """Merge UI-selected tool names into agent capability tool flags.
        Maps known tool IDs to capability flags used by agents.
        """
        try:
            selected = set([t for t in (self.user_tool_preferences.get('selected_tools') or []) if isinstance(t, str)])
            restrict = bool(self.user_tool_preferences.get('restrict_to_selected', False))
        except Exception:
            selected = set()
            restrict = False

        # Start from AI-suggested capabilities/tools
        merged: set = set(ai_tools or [])

        # Map specific tool ids to capability flags recognized by agents, and also include raw ids
        tool_to_cap = {
            'tavily_search': 'web_search',
            'web_search': 'web_search',
            'http_request': 'web_search',  # treat as research capability
            'file_read': 'file_read',
            'file_write': 'file_write',
            'python_repl': 'python_repl',
            'editor': 'editor',
        }

        # Always union the raw selected ids so agents can check directly
        merged |= selected

        # Add mapped capability flags for selected tool ids
        for t in list(selected):
            cap = tool_to_cap.get(t)
            if cap:
                merged.add(cap)

        if restrict:
            # Keep only selected ids and their mapped caps; drop unrelated AI-suggested caps
            keep_caps = set()
            for t in selected:
                cap = tool_to_cap.get(t)
                if cap:
                    keep_caps.add(cap)
            merged = (selected | keep_caps)

        return list(merged)

    # Queue handler to capture spawn requests reliably and record into graph
    async def _on_agent_needed(self, event):
        try:
            exec_id = None
            if isinstance(event.data, dict):
                exec_id = event.data.get('execution_id')
            if not exec_id:
                exec_id = self.pool_manager.execution_id
            if not exec_id:
                return
            if exec_id not in self._pending_spawns:
                self._pending_spawns[exec_id] = []
            # Deduplicate by role
            role = event.data.get('role') if isinstance(event.data, dict) else None
            if role and any(getattr(e, 'data', {}).get('role') == role for e in self._pending_spawns[exec_id]):
                return
            self._pending_spawns[exec_id].append(event)

            # Record requested in execution graph
            try:
                if exec_id not in self.execution_graphs:
                    self.execution_graphs[exec_id] = {"nodes": {}, "edges": [], "requested": [], "spawned": []}
                req = {
                    "role": role,
                    "priority": event.data.get('priority') if isinstance(event.data, dict) else None,
                    "reason": event.data.get('reason') if isinstance(event.data, dict) else None,
                    "requested_by": event.source,
                    "ts": event.timestamp
                }
                self.execution_graphs[exec_id]["requested"].append(req)
            except Exception:
                pass
        except Exception as e:
            logger.debug(f"Queueing agent.needed failed: {e}")

    # Queue handler to capture spawn requests reliably
    async def _on_agent_needed(self, event):
        try:
            exec_id = None
            if isinstance(event.data, dict):
                exec_id = event.data.get('execution_id')
            if not exec_id:
                exec_id = self.pool_manager.execution_id
            if not exec_id:
                return
            if exec_id not in self._pending_spawns:
                self._pending_spawns[exec_id] = []
            # Deduplicate by role
            role = event.data.get('role') if isinstance(event.data, dict) else None
            if role and any(getattr(e, 'data', {}).get('role') == role for e in self._pending_spawns[exec_id]):
                return
            self._pending_spawns[exec_id].append(event)
        except Exception as e:
            logger.debug(f"Queueing agent.needed failed: {e}")
    
    async def _generate_dynamic_system_prompt(self, role: str) -> str:
        """Generate AI-driven system prompt for the specific role"""
        try:
            from strands import Agent
            from strands.models.openai import OpenAIModel
            import os
            from dotenv import load_dotenv
            
            load_dotenv()
            api_key = os.getenv("OPENAI_API_KEY")
            
            if not api_key:
                logger.warning("No OpenAI API key - using fallback system prompt")
                return self._fallback_system_prompt(role)
            
            # Create AI prompt generator
            model = OpenAIModel(
                client_args={"api_key": api_key},
                model_id="gpt-4o-mini",
                params={"max_tokens": 400, "temperature": 0.3}
            )
            
            prompt_generator = Agent(
                name="prompt_generator",
                system_prompt="""You are an AI system prompt generator for specialized agents. Create effective system prompts for different agent roles.

Requirements for all system prompts:
- Include CONTROLLED multi-agent system context
- 60-second time limit for efficiency
- Clear completion marking with "TASK COMPLETE"
- Role-specific expertise and behaviors
- Professional and focused tone
- Specific to the role's function

Generate a system prompt that makes the agent highly effective at their specific role.""",
                model=model
            )
            
            prompt = f"Create a specialized system prompt for a '{role}' agent in a multi-agent swarm system."
            
            # Use stream_async to get the system prompt with timeout
            async def _consume_stream() -> str:
                content = ""
                async for event in prompt_generator.stream_async(prompt):
                    if "data" in event:
                        content += event["data"]
                    elif "result" in event:
                        result = event["result"]
                        if hasattr(result, 'content'):
                            content = result.content
                        else:
                            content = str(result)
                        break
                return content

            try:
                prompt_content = await asyncio.wait_for(_consume_stream(), timeout=25.0)
            except asyncio.TimeoutError:
                logger.warning("System prompt generation timed out; using fallback")
                return self._fallback_system_prompt(role)
                    
            system_prompt = prompt_content.strip()
            
            logger.info(f"✅ Generated AI-driven system prompt for {role}")
            return system_prompt
                
        except Exception as e:
            logger.error(f"AI system prompt generation failed: {e}")
            return self._fallback_system_prompt(role)
    
    def _fallback_system_prompt(self, role: str) -> str:
        """Fallback system prompt when AI generation fails"""
        return f"""You are a specialized {role} agent in a CONTROLLED multi-agent system.

STRICT RULES:
1. You have LIMITED TIME (max 60 seconds) - work efficiently  
2. Complete your task in ONE response
3. Mark completion with "TASK COMPLETE" when done
4. Focus on your role: {role}

Complete your assigned task efficiently and professionally."""
    
    async def _execute_agent_with_timeout(self, agent_id: str, task: str, context: dict):
        """Execute agent task with timeout protection"""
        try:
            agent = self.agent_registry.get(agent_id)
            if not agent:
                return
            
            # Notify frontend that this agent is starting (for timelines)
            try:
                exec_ctx = self.active_executions.get(self.pool_manager.execution_id, {})
                cb = exec_ctx.get("callback")
                if cb:
                    # Attach parent for grouping
                    parent_name = None
                    parent_map = exec_ctx.get('parent_map', {})
                    parent_name = parent_map.get(agent.name)
                    await cb(type="agent_started", agent=agent.name, parent=parent_name)
            except Exception:
                pass

            # Update execution graph with started_at and parent if known
            try:
                graph = self.execution_graphs.get(self.pool_manager.execution_id)
                if graph is not None:
                    node = graph['nodes'].get(agent.name)
                    if node is None:
                        graph['nodes'][agent.name] = {"name": agent.name, "role": getattr(agent, 'role', ''), "parent": parent_name, "status": "running", "started_at": datetime.utcnow().isoformat(), "finished_at": None}
                    else:
                        node['status'] = 'running'
                        node['started_at'] = node.get('started_at') or datetime.utcnow().isoformat()
                        if parent_name and not node.get('parent'):
                            node['parent'] = parent_name
                        graph['nodes'][agent.name] = node
                    # Add edge if parent available and not already present
                    if parent_name:
                        exists = any(e for e in graph['edges'] if e.get('from')==parent_name and e.get('to')==agent.name)
                        if not exists:
                            graph['edges'].append({"from": parent_name, "to": agent.name})
                    self.execution_graphs[self.pool_manager.execution_id] = graph
            except Exception:
                pass

            # Create event with execution context and streaming callback
            event_data = {
                "task": task,
                "context": context,
                "execution_id": agent_id,  # Use agent_id as execution context
                "controlled": True,
                "streaming_callback": self.active_executions.get(self.pool_manager.execution_id, {}).get("callback")
            }
            
            # Create a mock event for the agent
            from app.services.event_bus import SwarmEvent
            mock_event = SwarmEvent(
                id=str(uuid.uuid4()),
                type="task.execute",
                data=event_data,
                source="controller",
                timestamp=datetime.utcnow().isoformat()
            )
            
            # Execute with timeout
            await asyncio.wait_for(
                agent.activate(mock_event),
                timeout=60.0  # 1 minute max per agent
            )

            # Mark as completed
            await self.pool_manager.mark_agent_completed(agent_id, success=True)

            # Notify frontend that this agent completed (streaming layer will finalize text)
            try:
                exec_ctx = self.active_executions.get(self.pool_manager.execution_id, {})
                cb = exec_ctx.get("callback")
                if cb:
                    parent_name = exec_ctx.get('parent_map', {}).get(agent.name)
                    await cb(type="agent_completed", agent=agent.name, parent=parent_name, data={})
            except Exception:
                pass

            # Update execution graph with finished_at and status
            try:
                graph = self.execution_graphs.get(self.pool_manager.execution_id)
                if graph is not None:
                    node = graph['nodes'].get(agent.name)
                    if node is None:
                        graph['nodes'][agent.name] = {"name": agent.name, "role": getattr(agent, 'role', ''), "parent": None, "status": "completed", "started_at": None, "finished_at": datetime.utcnow().isoformat()}
                    else:
                        node['status'] = 'completed'
                        node['finished_at'] = datetime.utcnow().isoformat()
                        graph['nodes'][agent.name] = node
                    self.execution_graphs[self.pool_manager.execution_id] = graph
            except Exception:
                pass

        except asyncio.TimeoutError:
            logger.error(f"⏰ Agent {agent_id} timed out")
            await self.pool_manager.mark_agent_completed(agent_id, success=False)
        except Exception as e:
            logger.error(f"❌ Agent {agent_id} failed: {e}")
            await self.pool_manager.mark_agent_completed(agent_id, success=False)
    
    async def _controlled_execution_loop(self, execution_id: str, original_query: str, callback_handler=None, session_id: str = None) -> str:
        """Main execution loop with controls"""
        loop_count = 0
        max_loops = 50  # Allow more iterations for complex multi-agent tasks
        
        accumulated_results = []
        processed_events = set()  # Track processed events to avoid duplicates
        
        # Initialize thread-safe spawned roles tracking for this execution
        with self._spawned_roles_lock:
            self._spawned_roles_by_execution[execution_id] = set()
        # Initialize pending spawn queue for this execution
        self._pending_spawns[execution_id] = []
        # Initialize execution graph container
        if execution_id not in self.execution_graphs:
            self.execution_graphs[execution_id] = {"nodes": {}, "edges": [], "requested": [], "spawned": []}
        
        while loop_count < max_loops and not self.pool_manager.is_stopped:
            loop_count += 1
            logger.info(f"🔄 Control loop {loop_count}/{max_loops}")
            
            # Send progress update
            if callback_handler:
                await callback_handler(
                    type="progress",
                    data={
                        "message": f"🔄 Control loop {loop_count}/{max_loops}",
                        "active_agents": len(self.pool_manager.active_agents),
                        "execution_id": execution_id
                    }
                )
            
            # Wait a bit for agents to work
            await asyncio.sleep(3)
            
            # Check if any agents are still working OR waiting for human approval
            active_agents = len(self.pool_manager.active_agents)
            pending_human_interactions = len([h for h in self.human_interactions.values() if h.get("status") == "pending"])
            
            if active_agents == 0 and pending_human_interactions == 0:
                # Wait a bit longer to ensure agents have actually completed
                await asyncio.sleep(2)
                
                # Double-check no agents are still active and no pending human interactions
                active_agents = len(self.pool_manager.active_agents)
                pending_human_interactions = len([h for h in self.human_interactions.values() if h.get("status") == "pending"])
                
                if active_agents > 0 or pending_human_interactions > 0:
                    logger.info(f"🔄 Still have {active_agents} active agents and {pending_human_interactions} pending human interactions, continuing...")
                    continue
                
                # Spawn ONE needed agent (sequential) using queued requests (preferred)
                spawn_requests = list(self._pending_spawns.get(execution_id, []))
                if not spawn_requests:
                    spawn_requests = event_bus.get_recent_events(250, event_type="agent.needed")
                logger.info(f"🔍 Loop {loop_count}: pending spawn requests: {len(spawn_requests)}")
                
                # Thread-safe filtering of already spawned agent roles to prevent duplicates
                unique_spawn_requests = {}
                with self._spawned_roles_lock:
                    spawned_roles = self._spawned_roles_by_execution.get(execution_id, set())
                    for req in spawn_requests:
                        role = req.data.get("role", "writer")
                        # Only add if we haven't spawned this role yet
                        if role not in spawned_roles and role not in unique_spawn_requests:
                            unique_spawn_requests[role] = req
                
                # Spawn ONLY ONE agent at a time - true sequential event-driven behavior
                if unique_spawn_requests:
                    # Order requests by priority: high > medium > low
                    prio_map = {"high": 3, "medium": 2, "low": 1}
                    candidates = list(unique_spawn_requests.values())
                    candidates.sort(key=lambda r: prio_map.get(str(r.data.get("priority", "medium")).lower(), 2), reverse=True)
                    next_agent_request = candidates[0]
                    role = next_agent_request.data.get("role", "writer")
                    
                    logger.info(f"🔄 Spawning SINGLE agent sequentially: {role}")
                    
                    # Spawn only ONE agent
                    try:
                        new_agent_id = await self._spawn_agent_atomic(
                            execution_id=execution_id,
                            request=next_agent_request,
                            original_query=original_query,
                            accumulated_results=accumulated_results,
                            callback_handler=callback_handler,
                            session_id=session_id
                        )
                        
                        if new_agent_id:
                            logger.info(f"✅ Successfully spawned {role} agent: {new_agent_id}")
                            # Remove from pending queue if present
                            try:
                                if execution_id in self._pending_spawns and next_agent_request in self._pending_spawns[execution_id]:
                                    self._pending_spawns[execution_id].remove(next_agent_request)
                            except Exception:
                                pass
                            # Record parent-child mapping for UI timeline
                            try:
                                parent = getattr(next_agent_request, 'source', None) or next_agent_request.data.get('requesting_agent')
                                if parent:
                                    exec_data = self.active_executions.get(execution_id)
                                    if exec_data is not None:
                                        parent_map = exec_data.get('parent_map', {})
                                        # Map by agent NAME, not internal id, to match streaming events
                                        child_name = f"{role}_{new_agent_id[:8]}"
                                        parent_map[child_name] = parent
                                        exec_data['parent_map'] = parent_map
                                        self.active_executions[execution_id] = exec_data
                                        logger.info(f"🧬 Linked subagent {new_agent_id} to parent {parent}")
                            except Exception as map_err:
                                logger.debug(f"Parent mapping failed: {map_err}")
                            # Brief pause to let agent initialize
                            await asyncio.sleep(1)
                        else:
                            logger.warning(f"⚠️ Failed to spawn {role} agent")
                            
                    except Exception as e:
                        logger.error(f"❌ Error spawning {role}: {e}")
                    
                    # Continue loop to let the single new agent work
                    continue
                else:
                    logger.info("✅ No active agents and no pending spawn requests - execution complete")
                    if callback_handler:
                        await callback_handler(
                            type="status",
                            data={"message": "✅ No active agents - execution complete", "execution_id": execution_id}
                        )
                    break
            
            # Check for completion events
            recent_events = event_bus.get_recent_events(5)
            for event in recent_events:
                # Skip if we've already processed this event
                if event.id in processed_events:
                    continue
                    
                if event.type in ["task.complete", "analysis.complete", "content.complete", "agent.completed"]:
                    # Handle different output formats
                    result = None
                    if "final_output" in event.data:
                        result = event.data["final_output"]
                    elif "output" in event.data:
                        result = event.data["output"]
                    
                    if result and result not in accumulated_results:  # Avoid duplicates
                        accumulated_results.append(result)
                        processed_events.add(event.id)  # Mark as processed
                        logger.info(f"📝 Captured result from {event.source}: {len(result)} characters")
                        
                        # Send the actual result content
                        if callback_handler:
                            await callback_handler(
                                type="text_generation",
                                data={
                                    "chunk": result,
                                    "agent": event.source if hasattr(event, 'source') else 'unknown',
                                    "execution_id": execution_id
                                }
                            )
                        
                        # DISABLED: Text-based completion detection conflicts with AI decision logic
                        # The AI decision system is more sophisticated and handles completion properly
                        # Text-based detection was causing premature termination even when AI decided more agents were needed
                        
                        # OLD CODE (disabled to prevent conflicts):
                        # if ("TASK COMPLETE" in result and 
                        #     (result.strip().endswith("TASK COMPLETE") or 
                        #      "TASK COMPLETE." in result or
                        #      "task is complete" in result.lower() or
                        #      "completed the task" in result.lower())):
                        #     logger.info(f"🎯 Agent {event.source} marked task as complete")
                        #     if len(accumulated_results) > 0:
                        #         logger.info("✅ Task completion detected - will stop after current agents finish")
                        #         await asyncio.sleep(3)
                        #         self.pool_manager.is_stopped = True
                        #         break
                        
                        # Instead, rely on AI decision logic and proper agent spawn handling below
                        
            
            # Check if we should continue - only stop if we have results AND no active agents AND no pending spawn requests
            if accumulated_results and len(self.pool_manager.active_agents) == 0:
                # Check if there are any pending agent spawn requests
                spawn_requests = event_bus.get_recent_events(100, event_type="agent.needed")
                
                # Thread-safe filtering of already spawned agent roles
                pending_spawn_requests = []
                with self._spawned_roles_lock:
                    spawned_roles = self._spawned_roles_by_execution.get(execution_id, set())
                    for req in spawn_requests:
                        role = req.data.get("role", "writer")
                        if role not in spawned_roles:
                            pending_spawn_requests.append(req)
                
                if not pending_spawn_requests:
                    logger.info("✅ Have results, no active agents, and no pending spawn requests - execution complete")
                    break
                else:
                    logger.info(f"🔄 Have results but {len(pending_spawn_requests)} pending spawn requests - continuing execution")
            
            # For simple tasks, only complete if we have output AND no pending spawn requests
            if (loop_count > 2 and accumulated_results and 
                len(accumulated_results) > 0 and len(accumulated_results[0]) > 50 and
                len(self.pool_manager.active_agents) == 0):
                
                # Check if there are any pending agent spawn requests before stopping
                spawn_requests = event_bus.get_recent_events(100, event_type="agent.needed")
                
                pending_spawn_requests = []
                with self._spawned_roles_lock:
                    spawned_roles = self._spawned_roles_by_execution.get(execution_id, set())
                    for req in spawn_requests:
                        role = req.data.get("role", "writer")
                        if role not in spawned_roles:
                            pending_spawn_requests.append(req)
                
                if not pending_spawn_requests:
                    logger.info("✅ Simple task completed with substantial output and no pending requests - stopping execution")
                    break
                else:
                    logger.info(f"🔄 Simple task has output but {len(pending_spawn_requests)} pending spawn requests - continuing")
        
        # Force stop if we hit loop limit
        if loop_count >= max_loops:
            logger.warning("🔄 Hit maximum loop iterations - forcing stop")
            if callback_handler:
                await callback_handler(
                    type="error",
                    data={"message": "⏰ Maximum loop iterations reached - forcing stop", "execution_id": execution_id}
                )
            await self.pool_manager.stop_execution(force=True)
        
        # Compile results and ensure we always send something to UI
        final_result = ""
        if accumulated_results:
            final_result = "\\n\\n".join(accumulated_results)
        else:
            # Create a simple response if agents didn't produce output
            final_result = f"Task '{original_query}' has been analyzed using controlled swarm with {len(self.agent_registry)} agents."
        
        # ALWAYS send the final result to the UI
        if callback_handler:
            await callback_handler(
                type="text_generation", 
                data={
                    "chunk": final_result,
                    "agent": "controller",
                    "execution_id": execution_id
                }
            )
            
            # Send summary
            await callback_handler(
                type="status",
                data={
                    "message": f"📊 Summary: Used {len(self.agent_registry)} agents, {len(accumulated_results)} results",
                    "execution_id": execution_id
                }
            )
        
        return final_result
    
    async def stop_execution(self, execution_id: str) -> bool:
        """Stop a running execution"""
        logger.info(f"🛑 Stopping controlled execution {execution_id}")
        
        if execution_id in self.active_executions:
            self.active_executions[execution_id]["status"] = "stopped"
            # Notify frontend via callback so polling exits promptly
            try:
                cb = self.active_executions[execution_id].get("callback")
                if cb:
                    await cb(type="execution_stopped", agent=None, data={"execution_id": execution_id})
            except Exception:
                pass
        
        # Force stop pool manager
        await self.pool_manager.stop_execution(force=True)
        
        return True
    
    async def _cleanup_execution(self, execution_id: str):
        """Clean up execution resources"""
        logger.info(f"🧹 Cleaning up execution {execution_id}")
        
        # Stop pool manager
        await self.pool_manager.stop_execution(force=True)
        
        # Clean up agents
        for agent_id, agent in list(self.agent_registry.items()):
            try:
                agent.cleanup()
            except:
                pass
        
        self.agent_registry.clear()
        
        # Clean up spawned roles tracking
        with self._spawned_roles_lock:
            self._spawned_roles_by_execution.pop(execution_id, None)
        
        # Remove from active executions
        if execution_id in self.active_executions:
            del self.active_executions[execution_id]
        
        logger.info(f"✅ Cleanup complete for {execution_id}")
    
    def get_execution_status(self, execution_id: str) -> dict:
        """Get detailed execution status"""
        base_status = self.active_executions.get(execution_id, {"status": "not_found"})
        pool_status = self.pool_manager.status
        
        return {
            **base_status,
            "pool_manager": pool_status,
            "total_agents": len(self.agent_registry),
            "circuit_breakers": {
                "spawn": self.spawn_breaker.status,
                "execution": self.execution_breaker.status
            }
        }
