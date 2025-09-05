"""
True Dynamic Swarm Service with Session-Based Architecture
Implements the session-based dynamic agent spawning from the article using real Strands agents
"""
import asyncio
import json
import time
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
import structlog

from app.services.event_system import global_event_bus
from app.services.controlled_swarm_service import ControlledSwarmService
from app.services.dynamic_agent_factory import DynamicAgentFactory

# Import Strands SDK for real agent execution (following documentation)
try:
    from strands import Agent
    from strands.models.openai import OpenAIModel
    from strands.session.file_session_manager import FileSessionManager
    STRANDS_AVAILABLE = True
except ImportError:
    STRANDS_AVAILABLE = False
    Agent = None
    OpenAIModel = None
    FileSessionManager = None

logger = structlog.get_logger()

@dataclass
class SwarmSession:
    """Shared session data across all agents in the swarm"""
    session_id: str
    project_context: Dict[str, Any]
    agent_registry: Dict[str, Dict[str, Any]]
    communication_log: List[Dict[str, Any]]
    shared_results: Dict[str, Any]
    spawn_queue: List[Dict[str, Any]]
    execution_state: Dict[str, Any]

class SwarmCoordinator:
    """
    Manages dynamic agent spawning and coordination through shared sessions
    Based on the Strands session-based architecture patterns
    """
    
    def __init__(self, session_id: str = None):
        self.session_id = session_id or str(uuid.uuid4())
        self.swarm_session = SwarmSession(
            session_id=self.session_id,
            project_context={},
            agent_registry={},
            communication_log=[],
            shared_results={},
            spawn_queue=[],
            execution_state={}
        )
        
        # Active agents in this swarm
        self.active_agents: Dict[str, Any] = {}
        self.main_agents: List[str] = []
        self.sub_agents: List[str] = []
        
        # Coordination state
        self.is_coordinating = False
        self.spawn_in_progress = False
        
        logger.info(f"🎯 SwarmCoordinator initialized with session: {self.session_id}")
    
    def register_agent(self, agent_name: str, agent_spec: Dict[str, Any], is_main_agent: bool = False):
        """Register an agent in the swarm registry"""
        # Check if agent already exists to prevent duplicates
        if agent_name in self.swarm_session.agent_registry:
            logger.info(f"⚠️ Agent {agent_name} already registered, skipping duplicate registration")
            return
            
        agent_data = {
            **agent_spec,
            "registered_at": datetime.utcnow().isoformat(),
            "status": "registered",
            "is_main_agent": is_main_agent,
            "session_id": self.session_id
        }
        
        # Store in both agent_registry and active_agents
        self.swarm_session.agent_registry[agent_name] = agent_data
        self.active_agents[agent_name] = agent_data
        
        # Prevent duplicate entries in agent lists
        if is_main_agent and agent_name not in self.main_agents:
            self.main_agents.append(agent_name)
        elif not is_main_agent and agent_name not in self.sub_agents:
            self.sub_agents.append(agent_name)
            
        logger.info(f"📝 Registered {'main' if is_main_agent else 'sub'} agent: {agent_name}")
    
    def store_project_context(self, context: Dict[str, Any]):
        """Store project-wide context accessible to all agents"""
        self.swarm_session.project_context.update(context)
        logger.info(f"💾 Updated project context: {list(context.keys())}")
    
    def get_project_context(self) -> Dict[str, Any]:
        """Retrieve current project context"""
        return self.swarm_session.project_context.copy()
    
    def log_agent_communication(self, from_agent: str, to_agent: str, 
                              message: str, message_type: str = "coordination"):
        """Log inter-agent communication for coordination"""
        comm_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "from": from_agent,
            "to": to_agent,
            "message": message,
            "type": message_type,
            "session_id": self.session_id
        }
        
        self.swarm_session.communication_log.append(comm_entry)
        logger.debug(f"📞 Agent communication: {from_agent} → {to_agent}")
    
    def share_task_result(self, agent_name: str, task: str, result: Any):
        """Share task results across the swarm"""
        result_key = f"{agent_name}_{task}_{int(time.time())}"
        self.swarm_session.shared_results[result_key] = {
            "agent": agent_name,
            "task": task,
            "result": result,
            "completed_at": datetime.utcnow().isoformat(),
            "session_id": self.session_id
        }
        logger.info(f"📊 Shared result from {agent_name}: {task}")
    
    def queue_agent_spawn(self, agent_specs: List[Dict[str, Any]], requesting_agent: str):
        """Queue agents for spawning based on AI decisions"""
        for spec in agent_specs:
            spawn_entry = {
                "spec": spec,
                "requesting_agent": requesting_agent,
                "requested_at": datetime.utcnow().isoformat(),
                "status": "queued",
                "session_id": self.session_id
            }
            self.swarm_session.spawn_queue.append(spawn_entry)
            
        logger.info(f"📋 Queued {len(agent_specs)} agents for spawning from {requesting_agent}")
    
    async def process_spawn_queue(self) -> List[str]:
        """Process queued agent spawn requests"""
        if self.spawn_in_progress or not self.swarm_session.spawn_queue:
            return []
        
        self.spawn_in_progress = True
        spawned_agents = []
        
        try:
            # Process all queued spawn requests
            queue_copy = self.swarm_session.spawn_queue.copy()
            self.swarm_session.spawn_queue.clear()
            
            for spawn_entry in queue_copy:
                try:
                    agent_spec = spawn_entry["spec"]
                    agent_name = await self._create_specialist_agent(
                        role=agent_spec.get("role", "specialist"),
                        priority=agent_spec.get("priority", "medium"),
                        requirements=agent_spec.get("requirements", []),
                        requesting_agent=spawn_entry["requesting_agent"]
                    )
                    
                    if agent_name:
                        spawned_agents.append(agent_name)
                        
                        # Emit spawn confirmation
                        await global_event_bus.emit("agent.spawned", {
                            "session_id": self.session_id,
                            "agent_name": agent_name,
                            "role": agent_spec.get("role"),
                            "requesting_agent": spawn_entry["requesting_agent"],
                            "spawn_time": datetime.utcnow().isoformat()
                        }, source="swarm_coordinator")
                        
                except Exception as e:
                    logger.error(f"❌ Failed to spawn agent: {e}")
                    
        finally:
            self.spawn_in_progress = False
            
        logger.info(f"✨ Successfully spawned {len(spawned_agents)} agents")
        return spawned_agents
    
    async def _create_specialist_agent(self, role: str, priority: str, 
                                     requirements: List[str], requesting_agent: str) -> Optional[str]:
        """Create a specialist agent with shared session context"""
        agent_name = f"{role.lower().replace(' ', '_')}_{uuid.uuid4().hex[:8]}"
        
        # Register the agent
        self.register_agent(agent_name, {
            "role": role,
            "priority": priority,
            "requirements": requirements,
            "requesting_agent": requesting_agent,
            "context": self.get_project_context()
        }, is_main_agent=False)
        
        # Store in active agents for execution
        self.active_agents[agent_name] = {
            "name": agent_name,
            "role": role,
            "priority": priority,
            "status": "spawned",
            "session_id": self.session_id,
            "created_at": time.time()
        }
        
        return agent_name
    
    def get_agent_registry(self) -> Dict[str, Dict[str, Any]]:
        """Get all registered agents"""
        return self.swarm_session.agent_registry.copy()
    
    def get_communication_log(self) -> List[Dict[str, Any]]:
        """Get agent communication history"""
        return self.swarm_session.communication_log.copy()
    
    def get_shared_results(self) -> Dict[str, Any]:
        """Get shared results across the swarm"""
        return self.swarm_session.shared_results.copy()

class TrueDynamicSwarmService:
    """
    True Dynamic Swarm Service implementing session-based architecture
    Solves the sub-agent execution problem by using shared sessions and coordination
    """
    
    def __init__(self, config: dict = None):
        self.config = config or {}
        # Native Strands session management
        self.active_sessions: Dict[str, dict] = {}  # session_id -> session data with FileSessionManager
        self.completed_sessions: Dict[str, dict] = {}  # completed sessions
        # Legacy support for existing code
        self.active_swarms: Dict[str, SwarmCoordinator] = {}
        self.completed_swarms: Dict[str, SwarmCoordinator] = {}
        self.execution_tasks: Dict[str, asyncio.Task] = {}
        
        # Enhanced limits for true dynamic spawning
        self.max_agents_per_swarm = self.config.get("max_agents_per_swarm", 50)
        self.max_execution_time = self.config.get("max_execution_time", 3600)  # 1 hour
        self.coordination_interval = self.config.get("coordination_interval", 5)  # 5 seconds
        
        # Event handlers for AI decision processing
        self._setup_event_handlers()
        
        logger.info("🚀 TrueDynamicSwarmService initialized with session-based architecture")
    
    def _setup_event_handlers(self):
        """Setup event handlers for dynamic coordination"""
        global_event_bus.on("ai.decision", self._handle_ai_decision)
        global_event_bus.on("agent.completed", self._handle_agent_completion)
        global_event_bus.on("swarm.spawn_request", self._handle_spawn_request)
    
    async def execute_swarm_async(self, request, user_id: str, streaming_callback):
        """Execute a true dynamic swarm with native Strands session management"""
        execution_id = request.execution_id or str(uuid.uuid4())
        
        try:
            # Create FileSessionManager for persistent conversation memory
            session_manager = FileSessionManager(
                session_id=execution_id,
                storage_dir="./sessions"  # Store in sessions directory
            )
            
            # Track session with proper session manager
            self.active_sessions[execution_id] = {
                "session_manager": session_manager,
                "task": request.task,
                "user_id": user_id,
                "execution_mode": "true_dynamic",
                "start_time": datetime.utcnow().isoformat(),
                "max_agents": self.max_agents_per_swarm,
                "agents": {}  # Track created Strands agents
            }
            
            logger.info(f"🎯 Starting Strands execution with session persistence for {execution_id}")
            
            # Create and run the main analyzer with session persistence
            await self._create_and_run_analyzer(execution_id, request.task, streaming_callback)
            
            return {"status": "completed", "execution_id": execution_id}
            
        except Exception as e:
            logger.error(f"❌ Swarm execution failed: {e}")
            await self._cleanup_swarm(execution_id)
            raise
    
    async def _start_main_analyzer(self, execution_id: str, task: str, streaming_callback):
        """Start the main analyzer agent with session context (supports both Strands and legacy)"""
        # Try new Strands session format first
        session_data = self.active_sessions.get(execution_id)
        if session_data:
            # Strands session format - agent will be created with session management
            analyzer_name = f"analyzer_{execution_id[:8]}"
            
            # Agent info for Strands session (clean system prompt, no manual history)
            agent_info = {
                "system_prompt": f"""You are the main task analyzer for a dynamic swarm system.

IMPORTANT: You have access to the full conversation history through Strands session management.

For simple questions that can be answered directly, answer DIRECTLY without spawning additional agents.

For complex tasks requiring specialized knowledge, you may spawn specialists using this format:

## Analysis Result
[Your analysis here]

## Agents Needed (X)
role_name
priority (high/medium/low)
[Specific requirements for this agent]

WHEN TO ANSWER DIRECTLY: For simple questions, just provide the answer.""",
                "role": "main_analyzer",
                "task": task
            }
            
            # Create and store agent with session management
            strands_agent = await self._create_strands_agent_with_session(
                execution_id, analyzer_name, agent_info
            )
            
            if strands_agent:
                logger.info(f"🧠 Main analyzer {analyzer_name} created with Strands session management")
                
                # Emit agent started event
                await global_event_bus.emit("agent.started", {
                    "session_id": execution_id,
                    "agent": analyzer_name,
                    "role": "main_analyzer",
                    "task": task
                }, source="swarm_coordinator")
            else:
                logger.error(f"❌ Failed to create main analyzer with Strands session")
                
            return
        
        # Legacy format fallback
        swarm = self.active_swarms.get(execution_id)
        if not swarm:
            logger.error(f"❌ No session or swarm found for execution {execution_id}")
            return
        
        # Create main analyzer agent (legacy - simplified, no manual history)
        analyzer_name = f"analyzer_{execution_id[:8]}"
        
        swarm.register_agent(analyzer_name, {
            "role": "task_analyzer", 
            "task": task,
            "system_prompt": f"""You are the main task analyzer for a dynamic swarm system.

Session ID: {execution_id}
Current task: {task}

IMPORTANT: You have access to conversation history through the session management.

For simple questions that can be answered directly, answer DIRECTLY without spawning additional agents.

For complex tasks requiring specialized knowledge, you may spawn specialists using this format:

## Analysis Result
[Your analysis here]

## Agents Needed (X)
role_name
priority (high/medium/low)
[Specific requirements for this agent]

WHEN TO ANSWER DIRECTLY: For simple questions, just provide the answer."""
        }, is_main_agent=True)
        
        # Emit analyzer start
        await global_event_bus.emit("agent.started", {
            "session_id": execution_id,
            "agent": analyzer_name,
            "role": "main_analyzer",
            "task": task
        }, source="swarm_coordinator")
        
        if streaming_callback:
            await streaming_callback(
                type="agent_start",
                agent=analyzer_name,
                data={"role": "main_analyzer", "task": task}
            )
    
    async def _coordinate_swarm_execution(self, execution_id: str, streaming_callback):
        """Continuous coordination loop for the swarm"""
        swarm = self.active_swarms.get(execution_id)
        if not swarm:
            return
            
        coordination_cycles = 0
        max_cycles = self.max_execution_time // self.coordination_interval
        
        while coordination_cycles < max_cycles:
            try:
                # Process spawn queue
                newly_spawned = await swarm.process_spawn_queue()
                
                # Execute newly spawned agents
                for agent_name in newly_spawned:
                    await self._execute_agent_with_context(execution_id, agent_name, streaming_callback)
                
                # Check for completion conditions
                if await self._check_swarm_completion(execution_id):
                    logger.info(f"🎯 Swarm {execution_id} completed successfully")
                    break
                
                await asyncio.sleep(self.coordination_interval)
                coordination_cycles += 1
                
            except Exception as e:
                logger.error(f"❌ Coordination error in swarm {execution_id}: {e}")
                await asyncio.sleep(1)
        
        # Cleanup
        await self._cleanup_swarm(execution_id)
    
    async def _execute_agent_with_context(self, execution_id: str, agent_name: str, streaming_callback):
        """Execute an agent with full swarm session context"""
        swarm = self.active_swarms.get(execution_id)
        if not swarm:
            return
            
        agent_info = swarm.active_agents.get(agent_name)
        if not agent_info:
            return
        
        try:
            # Get shared context
            project_context = swarm.get_project_context()
            communication_log = swarm.get_communication_log()
            shared_results = swarm.get_shared_results()
            
            # Create context-aware task for the agent
            agent_task = f"""
Context from Session {execution_id}:
- Main Task: {project_context.get('task')}
- Your Role: {agent_info['role']} 
- Priority: {agent_info['priority']}

Previous Work by Other Agents:
{self._format_shared_results(shared_results)}

Communication Log:
{self._format_communication_log(communication_log[-5:])}  # Last 5 communications

Execute your specialized task with full awareness of the swarm's progress.
When complete, clearly state your results and any follow-up agents needed.
"""
            
            # Update agent status
            agent_info["status"] = "executing"
            
            # Emit execution start
            if streaming_callback:
                await streaming_callback(
                    type="agent_start",
                    agent=agent_name,
                    data={
                        "role": agent_info["role"],
                        "priority": agent_info["priority"],
                        "context": project_context
                    }
                )
            
            # Simulate agent execution with context (in real implementation, this would call Strands agents)
            await asyncio.sleep(2)  # Simulate work
            
            # Mock completion result
            result = f"Completed {agent_info['role']} task with session context awareness"
            
            # Store results in shared memory
            swarm.share_task_result(agent_name, agent_info['role'], result)
            
            # Update status
            agent_info["status"] = "completed"
            agent_info["completed_at"] = time.time()
            
            # Emit completion
            if streaming_callback:
                await streaming_callback(
                    type="agent_completed",
                    agent=agent_name,
                    data={
                        "result": result,
                        "execution_time": agent_info["completed_at"] - agent_info["created_at"]
                    }
                )
            
            logger.info(f"✅ Agent {agent_name} completed with session context")
            
        except Exception as e:
            logger.error(f"❌ Agent {agent_name} execution failed: {e}")
            agent_info["status"] = "failed"
    
    def _format_shared_results(self, shared_results: Dict[str, Any]) -> str:
        """Format shared results for agent context"""
        if not shared_results:
            return "No previous results available."
            
        formatted = []
        for key, result in list(shared_results.items())[-3:]:  # Last 3 results
            formatted.append(f"- {result['agent']}: {result['result']}")
            
        return "\n".join(formatted)
    
    def _format_communication_log(self, comm_log: List[Dict[str, Any]]) -> str:
        """Format communication log for agent context"""
        if not comm_log:
            return "No previous communications."
            
        formatted = []
        for comm in comm_log:
            formatted.append(f"- {comm['from']} → {comm['to']}: {comm['message']}")
            
        return "\n".join(formatted)
    
    async def _handle_ai_decision(self, event):
        """Handle AI decisions that contain agent spawn requests"""
        try:
            execution_id = event.data.get("session_id") or event.data.get("execution_id")
            if not execution_id or execution_id not in self.active_swarms:
                return
                
            swarm = self.active_swarms[execution_id]
            content = event.data.get("content", "")
            requesting_agent = event.source or "unknown"
            
            # Parse "Agents Needed" from AI decision
            agent_specs = self._parse_agents_needed(content)
            if agent_specs:
                swarm.queue_agent_spawn(agent_specs, requesting_agent)
                logger.info(f"🎯 AI Decision processed: {len(agent_specs)} agents queued")
                
        except Exception as e:
            logger.error(f"❌ Failed to handle AI decision: {e}")
    
    def _parse_agents_needed(self, content: str) -> List[Dict[str, Any]]:
        """Parse 'Agents Needed (X)' section from AI output"""
        agents = []
        lines = content.split('\n')
        
        parsing_agents = False
        current_agent = None
        
        for line in lines:
            line = line.strip()
            
            # Detect start of agents section
            if "Agents Needed" in line and "(" in line:
                parsing_agents = True
                continue
                
            if parsing_agents:
                # Stop parsing if we hit another section
                if line.startswith("#") or line.startswith("##"):
                    break
                    
                # New agent role (not a priority or requirement line)
                if line and not any(p in line.lower() for p in ["priority", "high", "medium", "low"]) and len(line) > 3:
                    if current_agent:
                        agents.append(current_agent)
                    
                    current_agent = {
                        "role": line,
                        "priority": "medium",
                        "requirements": []
                    }
                elif "priority" in line.lower() or any(p in line.lower() for p in ["high priority", "medium priority", "low priority"]):
                    if current_agent:
                        if "high" in line.lower():
                            current_agent["priority"] = "high"
                        elif "low" in line.lower():
                            current_agent["priority"] = "low"
                        else:
                            current_agent["priority"] = "medium"
                elif line and current_agent:
                    current_agent["requirements"].append(line)
        
        # Add the last agent
        if current_agent:
            agents.append(current_agent)
            
        return agents
    
    async def _check_swarm_completion(self, execution_id: str) -> bool:
        """Check if swarm has completed its work"""
        swarm = self.active_swarms.get(execution_id)
        if not swarm:
            return True
            
        # Check if all spawned agents have completed
        active_count = sum(1 for agent in swarm.active_agents.values() 
                          if agent["status"] in ["spawned", "executing"])
        
        # Check if spawn queue is empty
        has_queued = len(swarm.swarm_session.spawn_queue) > 0
        
        return active_count == 0 and not has_queued
    
    async def _cleanup_swarm(self, execution_id: str):
        """Clean up swarm resources and move completed swarms to completed registry"""
        if execution_id in self.active_swarms:
            # Move to completed swarms instead of deleting
            swarm = self.active_swarms[execution_id]
            self.completed_swarms[execution_id] = swarm
            
            # Mark completion time in project context
            swarm.store_project_context({
                "completion_time": datetime.utcnow().isoformat(),
                "status": "completed"
            })
            
            del self.active_swarms[execution_id]
            
        if execution_id in self.execution_tasks:
            task = self.execution_tasks[execution_id]
            if not task.done():
                task.cancel()
            del self.execution_tasks[execution_id]
            
        logger.info(f"🧹 Cleaned up swarm {execution_id}")
    
    async def _run_coordination_loop(self, execution_id: str, streaming_callback):
        """Run the main coordination loop with asynchronous agent execution (supports Strands and legacy)"""
        # Check if we're using new Strands session format
        session_data = self.active_sessions.get(execution_id)
        if session_data:
            logger.info(f"🎯 Starting Strands coordination loop for session {execution_id}")
            
            # For Strands sessions, we execute the main analyzer directly
            analyzer_name = f"analyzer_{execution_id[:8]}"
            
            logger.info(f"🚀 Executing main analyzer with Strands session: {analyzer_name}")
            
            # Execute the main analyzer agent with session management
            task = asyncio.create_task(
                self._execute_strands_agent(execution_id, analyzer_name, streaming_callback)
            )
            
            # Wait for completion
            await task
            logger.info(f"✅ Strands coordination loop completed for session {execution_id}")
            return
        
        # Legacy format fallback
        swarm = self.active_swarms.get(execution_id)
        if not swarm:
            logger.warning(f"⚠️ No session or swarm found for execution {execution_id}")
            return
            
        logger.info(f"🎯 Starting legacy coordination loop for swarm {execution_id}")
        
        # Create tasks for all main agents to run concurrently
        main_agents = swarm.main_agents.copy()
        agent_tasks = []
        
        for agent_name in main_agents:
            logger.info(f"🚀 Creating task for main agent: {agent_name}")
            
            # Update agent status
            if agent_name in swarm.active_agents:
                swarm.active_agents[agent_name]["status"] = "executing"
            
            # Create task for agent execution (don't await yet)
            task = asyncio.create_task(
                self._execute_strands_agent(execution_id, agent_name, streaming_callback)
            )
            agent_tasks.append(task)
        
        # Wait for all agent tasks to complete
        if agent_tasks:
            logger.info(f"⏳ Waiting for {len(agent_tasks)} agents to complete...")
            await asyncio.gather(*agent_tasks, return_exceptions=True)
            logger.info(f"✅ All agents completed for swarm {execution_id}")
        
        logger.info(f"✅ Coordination loop completed for swarm {execution_id}")
    
    async def _create_strands_agent_with_session(self, execution_id: str, agent_name: str, agent_info: dict):
        """Create a Strands agent with proper session management"""
        if not STRANDS_AVAILABLE:
            logger.error("❌ Strands SDK not available - cannot create agent")
            return None
            
        # Import required classes
        from strands.models.openai import OpenAIModel
        import os
        from dotenv import load_dotenv
        
        load_dotenv()
        api_key = os.getenv("OPENAI_API_KEY")
        
        if not api_key:
            logger.error("❌ OpenAI API key not found in environment")
            return None
        
        # Get session manager for this execution
        session_data = self.active_sessions.get(execution_id)
        if not session_data:
            logger.error(f"❌ No session data found for execution {execution_id}")
            return None
        
        session_manager = session_data["session_manager"]
        
        # Create OpenAI model
        model = OpenAIModel(
            client_args={"api_key": api_key},
            model_id="gpt-4o-mini",
            params={"max_tokens": 4000, "temperature": 0.7}
        )
        
        # Create conversation manager for context handling
        conversation_manager = SlidingWindowConversationManager(
            window_size=30  # Keep last 30 messages
        )
        
        # Create agent with Strands session management
        agent = Agent(
            name=agent_name,
            system_prompt=agent_info.get("system_prompt", "You are a helpful assistant."),
            model=model,
            session_manager=session_manager,
            conversation_manager=conversation_manager,
            tools=[]  # Add tools if needed
        )
        
        # Store agent reference in session data
        session_data["agents"][agent_name] = agent
        
        logger.info(f"✅ Created Strands agent {agent_name} with native session management")
        return agent

    async def _execute_strands_agent(self, execution_id: str, agent_name: str, streaming_callback):
        """Execute a Strands agent with native session management"""
        if not STRANDS_AVAILABLE:
            logger.error("❌ Strands SDK not available - cannot execute real agents")
            return
        
        # Safety check: prevent duplicate execution of the same agent
        session_data = self.active_sessions.get(execution_id)
        if not session_data:
            # Check legacy format
            swarm = self.active_swarms.get(execution_id)
            if swarm and agent_name in swarm.active_agents:
                agent_status = swarm.active_agents[agent_name].get("status")
                if agent_status in ["executing", "completed"]:
                    logger.info(f"⚠️ Agent {agent_name} already {agent_status}, skipping execution")
                    return
        
        # Get session data (try new format first, fallback to legacy)
        current_task = ""
        agent_info = None
        
        if session_data:
            # New Strands session format
            current_task = session_data.get("task", "")
            # For new format, we need to get agent info differently
            # Let's create a simple agent info for the main analyzer
            if agent_name.startswith("analyzer_"):
                agent_info = {
                    "system_prompt": f"""You are the main task analyzer for a dynamic swarm system.

Session: {execution_id}
Current task: {current_task}

IMPORTANT: You have conversation history through Strands session management.

For simple questions, answer DIRECTLY without spawning agents.

For complex tasks requiring specialists, use this format:

## Analysis Result
[Your analysis here]

## Agents Needed (X)
role_name
priority (high/medium/low)
[Requirements]

WHEN TO ANSWER DIRECTLY: For simple questions, just provide the answer."""
                }
        else:
            # Legacy format fallback
            swarm = self.active_swarms.get(execution_id)
            if not swarm:
                logger.error(f"❌ No session or swarm found for execution {execution_id}")
                return
                
            project_context = swarm.get_project_context()
            current_task = project_context.get("task", "")
            agent_info = swarm.swarm_session.agent_registry.get(agent_name)
        
        if not agent_info:
            logger.error(f"❌ Agent {agent_name} not found")
            return
        
        try:
            # Import OpenAI model (same as event-driven swarm)
            from strands.models.openai import OpenAIModel
            import os
            from dotenv import load_dotenv
            
            load_dotenv()
            api_key = os.getenv("OPENAI_API_KEY")
            
            if not api_key:
                logger.warning("No OpenAI API key - using simulation mode")
                response = f"Mock response for {task} (no API key available)"
                
                # Store mock response
                swarm.swarm_session.shared_results[agent_name] = {
                    "response": response,
                    "timestamp": datetime.utcnow().isoformat(),
                    "status": "completed"
                }
                
                if agent_name in swarm.active_agents:
                    swarm.active_agents[agent_name]["status"] = "completed"
                    
                logger.info(f"✅ Mock agent {agent_name} completed")
                return
            
            # Create OpenAI model (same configuration as event-driven swarm)
            model = OpenAIModel(
                client_args={"api_key": api_key},
                model_id="gpt-4o-mini",
                params={"max_tokens": 4000, "temperature": 0.7}
            )
            
            # Create a real Strands agent with OpenAI model
            strands_agent = Agent(
                name=agent_name,
                system_prompt=agent_info.get("system_prompt", "You are a helpful assistant."),
                tools=[],  # Add tools if needed
                model=model
            )
            
            logger.info(f"🚀 Executing real Strands agent: {agent_name}")
            
            # Mark agent as executing to prevent duplicates
            if session_data:
                # For new format, we could add agent status tracking here if needed
                pass
            else:
                # For legacy format, update status
                swarm = self.active_swarms.get(execution_id)
                if swarm and agent_name in swarm.active_agents:
                    swarm.active_agents[agent_name]["status"] = "executing"
            
            # Execute the agent using current task (Strands handles conversation context automatically)
            logger.info(f"📝 Executing agent with task: {current_task[:200]}...")
            
            if hasattr(strands_agent, 'run'):
                try:
                    # Try async first
                    response = await strands_agent.run(current_task)
                except TypeError:
                    # If not awaitable, call synchronously
                    response = strands_agent.run(current_task)
            elif hasattr(strands_agent, '__call__'):
                try:
                    response = await strands_agent(current_task)
                except TypeError:
                    response = strands_agent(current_task)
            else:
                raise AttributeError(f"Agent {agent_name} has no callable interface")
            
            # Store the response in shared results
            swarm.swarm_session.shared_results[agent_name] = {
                "response": str(response),
                "timestamp": datetime.utcnow().isoformat(),
                "status": "completed"
            }
            
            # Log the communication (use current task, not full context)
            swarm.log_agent_communication("user", agent_name, current_task, "task_input")
            swarm.log_agent_communication(agent_name, "user", str(response), "task_completion")
            
            # Update agent status
            if agent_name in swarm.active_agents:
                swarm.active_agents[agent_name]["status"] = "completed"
            
            # Emit completion event with real response
            event_data = {
                "execution_id": execution_id,
                "agent_name": agent_name,
                "response": str(response),
                "timestamp": datetime.utcnow().isoformat()
            }
            logger.info(f"🔔 Emitting agent.completed event: {event_data}")
            await global_event_bus.emit("agent.completed", event_data, source="true_dynamic_swarm")
            logger.info(f"📡 Event emitted to global_event_bus, current history length: {len(global_event_bus.event_history)}")
            
            logger.info(f"✅ Real Strands agent {agent_name} completed execution")
            
        except Exception as e:
            logger.error(f"❌ Error executing Strands agent {agent_name}: {e}")
            
            # Update agent status to failed
            if agent_name in swarm.active_agents:
                swarm.active_agents[agent_name]["status"] = "failed"
            
            # Store error in shared results
            swarm.swarm_session.shared_results[agent_name] = {
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
                "status": "failed"
            }
    
    def get_swarm_status(self, execution_id: str) -> Dict[str, Any]:
        """Get comprehensive swarm status"""
        # Check active swarms first
        swarm = self.active_swarms.get(execution_id)
        if not swarm:
            # Check completed swarms
            swarm = self.completed_swarms.get(execution_id)
        
        if not swarm:
            return {"error": "Swarm not found"}
            
        return {
            "session_id": swarm.session_id,
            "project_context": swarm.get_project_context(),
            "agent_registry": swarm.get_agent_registry(),
            "active_agents": len([a for a in swarm.active_agents.values() if a["status"] == "executing"]),
            "completed_agents": len([a for a in swarm.active_agents.values() if a["status"] == "completed"]),
            "spawn_queue_size": len(swarm.swarm_session.spawn_queue),
            "total_communications": len(swarm.swarm_session.communication_log),
            "shared_results_count": len(swarm.swarm_session.shared_results)
        }
    
    async def _handle_agent_completion(self, event):
        """Handle agent completion events"""
        try:
            execution_id = event.data.get("execution_id")
            agent_name = event.data.get("agent_name")
            
            if not execution_id or execution_id not in self.active_swarms:
                return
                
            swarm = self.active_swarms[execution_id]
            if agent_name in swarm.active_agents:
                swarm.active_agents[agent_name]["status"] = "completed"
                logger.info(f"✅ Agent {agent_name} completed in swarm {execution_id}")
                
        except Exception as e:
            logger.error(f"❌ Error handling agent completion: {e}")
    
    async def _handle_spawn_request(self, event):
        """Handle agent spawn requests"""
        try:
            execution_id = event.data.get("execution_id")
            agent_spec = event.data.get("agent_spec", {})
            
            if not execution_id or execution_id not in self.active_swarms:
                return
                
            swarm = self.active_swarms[execution_id]
            # Add to spawn queue
            swarm.swarm_session.spawn_queue.append(agent_spec)
            logger.info(f"🚀 Added agent spawn request to queue for swarm {execution_id}")
            
        except Exception as e:
            logger.error(f"❌ Error handling spawn request: {e}")
    
    async def _send_task_to_existing_analyzer(self, session_id: str, task: str):
        """Send a new task to an existing analyzer without creating duplicates"""
        try:
            analyzer_name = f"analyzer_{session_id[:8]}"
            
            # Check if agent exists in current session
            session_data = self.active_sessions.get(session_id)
            if session_data and analyzer_name in session_data.get("agents", {}):
                # Get the existing Strands agent
                agent = session_data["agents"][analyzer_name]
                
                logger.info(f"🔄 Using existing agent {analyzer_name} for new task")
                
                # Use streaming with existing Strands agent
                full_response = ""
                async for event in agent.stream_async(task):
                    # Collect text data for the complete response
                    if "data" in event:
                        full_response += event["data"]
                    
                    # Handle tool usage events
                    if "current_tool_use" in event and event["current_tool_use"].get("name"):
                        tool_name = event["current_tool_use"]["name"]
                        logger.info(f"🔧 Existing agent using tool: {tool_name}")
                
                # Use the accumulated response or fall back to a default
                if not full_response.strip():
                    full_response = "Task completed successfully"
                
                # Emit completion event (matching expected frontend format)
                await global_event_bus.emit("agent.completed", {
                    "agent": analyzer_name,
                    "output": full_response.strip(),
                    "execution_id": session_id,
                    "timestamp": datetime.utcnow().isoformat()
                }, source="true_dynamic_swarm")
                
                logger.info(f"✅ Existing analyzer {analyzer_name} processed new task")
                return full_response.strip()
            
            # Legacy format fallback - execute the existing agent directly
            swarm = self.active_swarms.get(session_id)
            if swarm and analyzer_name in swarm.main_agents:
                # Execute the existing legacy agent directly (no coordination loop)
                logger.info(f"🚀 Executing existing legacy analyzer {analyzer_name}")
                
                # Log the task input
                swarm.log_agent_communication("user", analyzer_name, task, "task_input")
                
                # Execute the agent using the same method as coordination loop
                await self._execute_strands_agent(session_id, analyzer_name, None)
                
                logger.info(f"✅ Existing legacy analyzer {analyzer_name} completed task")
                return "Task sent to existing analyzer"
            
            logger.warning(f"⚠️ No existing analyzer found for session {session_id}")
            return None
            
        except Exception as e:
            logger.error(f"❌ Error sending task to existing analyzer: {e}")
            return None
    
    async def _create_and_run_analyzer(self, execution_id: str, task: str, streaming_callback):
        """Create and run analyzer with proper Strands session management"""
        if not STRANDS_AVAILABLE:
            logger.error("❌ Strands SDK not available")
            return
        
        try:
            # Get session data
            session_data = self.active_sessions.get(execution_id)
            if not session_data:
                logger.error(f"❌ No session data found for {execution_id}")
                return
            
            session_manager = session_data["session_manager"]
            
            # Load environment
            import os
            from dotenv import load_dotenv
            load_dotenv()
            
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                logger.error("❌ OpenAI API key not found")
                return
            
            # Create OpenAI model
            model = OpenAIModel(
                client_args={"api_key": api_key},
                model_id="gpt-4o-mini",
                params={"max_tokens": 4000, "temperature": 0.7}
            )
            
            # Create agent with session manager (following Strands documentation)
            analyzer_name = f"analyzer_{execution_id[:8]}"
            agent = Agent(
                name=analyzer_name,
                system_prompt=f"""You are the main task analyzer for a dynamic swarm system.

For simple questions, answer DIRECTLY without spawning agents.

For complex tasks requiring specialists, use this format:

## Analysis Result
[Your analysis here]

## Agents Needed (X)
role_name
priority (high/medium/low)
[Requirements]""",
                session_manager=session_manager,
                model=model
            )
            
            # Store agent reference
            session_data["agents"][analyzer_name] = agent
            
            logger.info(f"✅ Created Strands agent {analyzer_name} with session persistence")
            
            # Execute the agent with streaming (using stream_async from documentation)
            logger.info(f"🚀 Executing agent with task: {task}")
            
            full_response = ""
            event_count = 0
            
            try:
                logger.info(f"🔄 Starting agent.stream_async() iteration...")
                async for event in agent.stream_async(task):
                    event_count += 1
                    logger.info(f"📨 Received event #{event_count}: {event.get('type', 'unknown')} - keys: {list(event.keys())}")
                    
                    # Collect text data for the complete response
                    if "data" in event:
                        full_response += event["data"]
                        logger.info(f"📝 Accumulated response length: {len(full_response)}")
                    
                    # Handle tool usage events
                    if "current_tool_use" in event and event["current_tool_use"].get("name"):
                        tool_name = event["current_tool_use"]["name"]
                        logger.info(f"🔧 Agent using tool: {tool_name}")
                    
                    # Handle final result
                    if "result" in event:
                        final_result = event["result"]
                        logger.info(f"✅ Agent completed with result: {type(final_result)}")
                
                logger.info(f"🏁 Agent stream completed after {event_count} events")
                
            except Exception as stream_error:
                logger.error(f"❌ Error during agent streaming: {stream_error}", exc_info=True)
                if not full_response.strip():
                    full_response = f"Agent execution failed: {str(stream_error)}"
            
            # Use the accumulated response or fall back to a default
            if not full_response.strip():
                full_response = "Task completed successfully"
            
            # Emit completion event (matching expected frontend format)
            await global_event_bus.emit("agent.completed", {
                "agent": analyzer_name,
                "output": full_response.strip(),
                "execution_id": execution_id,
                "timestamp": datetime.utcnow().isoformat()
            }, source="true_dynamic_swarm")
            
            logger.info(f"✅ Agent {analyzer_name} completed successfully")
            
        except Exception as e:
            logger.error(f"❌ Error in agent execution: {e}")
            raise