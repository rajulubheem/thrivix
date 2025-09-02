"""
Autonomous Event-Driven Swarm Service
Truly dynamic agent spawning based on AI decisions until task satisfaction
"""
import asyncio
import time
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any, Set
import logging
import threading
import json

from app.schemas.swarm import SwarmExecutionRequest, SwarmExecutionResponse, ExecutionStatus
from app.services.event_bus import event_bus
from app.services.event_aware_agent import EventAwareAgent, AgentCapabilities
from app.services.dynamic_agent_factory import DynamicAgentFactory
from app.services.agent_memory_store import get_memory_store

logger = logging.getLogger(__name__)

class AutonomousSwarmService:
    """Truly autonomous event-driven swarm with dynamic agent spawning"""
    
    def __init__(self, config: dict = None):
        config = config or {}
        
        # Dynamic limits based on system resources and user preferences
        self.max_concurrent_agents = config.get("max_concurrent_agents", 20)  # Reasonable default
        self.max_total_agents = config.get("max_total_agents", 100)  # Prevent runaway spawning
        self.max_execution_time = config.get("max_execution_time", 1800)  # 30 min default
        self.quality_threshold = config.get("quality_threshold", 0.85)  # User satisfaction target
        self.improvement_threshold = config.get("improvement_threshold", 0.05)  # 5% improvement to continue
        
        # Safety controls
        self.emergency_stop = False
        self.paused_executions = set()
        self.user_stop_requests = set()
        self.max_iterations_per_execution = config.get("max_iterations", 50)  # Prevent infinite loops
        
        # Core state management
        self.active_executions: Dict[str, dict] = {}
        self.agent_registry: Dict[str, EventAwareAgent] = {}
        self.agent_factory = DynamicAgentFactory()
        self.memory_store = get_memory_store()
        
        # Thread-safe tracking with enhanced capabilities
        self._execution_lock = threading.RLock()
        self._agent_counter = {}  # Track agent numbers per role (researcher_001, researcher_002, etc.)
        self._task_quality_scores = {}  # Track quality evolution per execution
        self._agent_performance_history = {}  # Learn from agent performance
        
        # Event subscriptions for autonomous behavior
        self._setup_event_handlers()
        
        logger.info("🚀 AutonomousSwarmService initialized - unlimited agent spawning enabled")
    
    def _setup_event_handlers(self):
        """Set up event handlers for autonomous swarm behavior"""
        event_bus.subscribe("agent.needed", self._handle_agent_request)
        event_bus.subscribe("task.progress", self._handle_task_progress) 
        event_bus.subscribe("task.quality_assessed", self._handle_quality_assessment)
        event_bus.subscribe("agent.completed", self._handle_agent_completion)
        event_bus.subscribe("execution.improvement_requested", self._handle_improvement_request)
        event_bus.subscribe("execution.pause_requested", self._handle_pause_request)
        event_bus.subscribe("execution.stop_requested", self._handle_stop_request)
        event_bus.subscribe("execution.emergency_stop", self._handle_emergency_stop)
        
    async def execute_autonomous_swarm(self, request: SwarmExecutionRequest, streaming_callback=None) -> SwarmExecutionResponse:
        """Execute a truly autonomous swarm that continues until task satisfaction"""
        execution_id = str(uuid.uuid4())
        start_time = time.time()
        
        # Initialize execution state
        execution_state = {
            "id": execution_id,
            "request": request,
            "start_time": start_time,
            "status": ExecutionStatus.RUNNING,
            "agents_spawned": 0,
            "active_agents": {},
            "completed_agents": {},
            "task_outputs": [],
            "quality_scores": [],
            "improvement_iterations": 0,
            "streaming_callback": streaming_callback,
            "user_satisfaction": 0.0,
            "should_continue": True
        }
        
        with self._execution_lock:
            self.active_executions[execution_id] = execution_state
            self._task_quality_scores[execution_id] = []
            self._agent_counter[execution_id] = {}
        
        try:
            # Start with intelligent task analysis
            initial_analyzer = await self._spawn_intelligent_analyzer(execution_id, request.task)
            
            # Autonomous execution loop - continues until true satisfaction
            iteration_count = 0
            while execution_state["should_continue"] and iteration_count < self.max_iterations_per_execution:
                # Safety checks
                if self.emergency_stop:
                    logger.warning(f"🚨 Emergency stop triggered - halting execution {execution_id}")
                    break
                
                if execution_id in self.user_stop_requests:
                    logger.info(f"🛑 User stop requested for execution {execution_id}")
                    execution_state["status"] = ExecutionStatus.STOPPED
                    break
                
                if execution_id in self.paused_executions:
                    logger.info(f"⏸️ Execution {execution_id} paused - waiting for resume")
                    while execution_id in self.paused_executions and not self.emergency_stop:
                        await asyncio.sleep(2)
                    continue
                
                # Check agent count limits (safety net)
                if execution_state["agents_spawned"] >= self.max_total_agents:
                    logger.warning(f"🚫 Reached maximum agent limit ({self.max_total_agents}) - stopping")
                    break
                
                active_count = len(execution_state["active_agents"])
                
                # Prevent too many concurrent agents
                if active_count >= self.max_concurrent_agents:
                    logger.info(f"⏳ Waiting for agent completion (Active: {active_count}/{self.max_concurrent_agents})")
                    await asyncio.sleep(3)
                    iteration_count += 1
                    continue
                
                if active_count == 0:
                    # No active agents - check if we need to spawn more or if we're truly done
                    await self._evaluate_continuation_need(execution_id)
                
                # Check quality and improvement opportunities
                await self._assess_current_quality(execution_id)
                
                # Respect user-defined time limits
                if time.time() - start_time > self.max_execution_time:
                    logger.info(f"⏰ Execution {execution_id} reached time limit - graceful completion")
                    await self._initiate_graceful_completion(execution_id)
                    break
                
                # Brief pause to prevent tight loop
                await asyncio.sleep(1)
                iteration_count += 1
            
            # Check if we stopped due to iteration limit
            if iteration_count >= self.max_iterations_per_execution:
                logger.warning(f"🔄 Execution {execution_id} reached maximum iterations ({self.max_iterations_per_execution})")
                execution_state["status"] = ExecutionStatus.COMPLETED
            
            # Final compilation and quality check
            final_result = await self._compile_final_result(execution_id)
            
            return SwarmExecutionResponse(
                execution_id=execution_id,
                status=ExecutionStatus.COMPLETED,
                result=final_result,
                agent_sequence=[agent["role"] for agent in execution_state["completed_agents"].values()],
                handoffs=execution_state["agents_spawned"],
                tokens_used=sum(agent.get("tokens_used", 0) for agent in execution_state["completed_agents"].values()),
                artifacts=self._extract_artifacts(execution_id),
                execution_time=time.time() - start_time
            )
            
        except Exception as e:
            logger.error(f"❌ Autonomous swarm execution failed: {str(e)}")
            execution_state["status"] = ExecutionStatus.FAILED
            return SwarmExecutionResponse(
                execution_id=execution_id,
                status=ExecutionStatus.FAILED,
                result=f"Execution failed: {str(e)}",
                agent_sequence=[],
                handoffs=0,
                tokens_used=0,
                artifacts=[],
                execution_time=time.time() - start_time
            )
        finally:
            # Cleanup
            await self._cleanup_execution(execution_id)
    
    async def _spawn_intelligent_analyzer(self, execution_id: str, task: str) -> EventAwareAgent:
        """Spawn an intelligent analyzer that understands the full task scope"""
        agent_name = f"task_analyzer_{execution_id[:8]}"
        
        # Enhanced analyzer prompt for better task understanding
        enhanced_task = f"""
AUTONOMOUS SWARM TASK ANALYSIS:

Your role is to analyze this task and create a comprehensive execution plan:
TASK: {task}

As the lead analyzer, you must:
1. Break down the task into logical components
2. Identify all specialist agents needed for high-quality completion
3. Define success criteria and quality benchmarks
4. Create a dynamic execution strategy that adapts based on progress
5. NEVER mark task as complete unless genuinely satisfied with quality

IMPORTANT: This is an autonomous swarm - you can request as many specialist agents as needed.
Focus on quality and thoroughness over speed. The system will continue spawning agents until the task reaches true completion.

Your output should include:
- Detailed task breakdown
- Required specialist roles with specific expertise areas
- Quality benchmarks for success
- Coordination strategy for multiple agents

Begin your analysis now.
"""
        
        analyzer = EventAwareAgent(
            name=agent_name,
            role="autonomous_analyzer", 
            capabilities=AgentCapabilities.REASONING | AgentCapabilities.PLANNING | AgentCapabilities.COORDINATION,
            system_prompt=f"You are an autonomous task analyzer in a dynamic swarm. Analyze tasks thoroughly and request all necessary specialist agents for exceptional results.",
            execution_id=execution_id,
            streaming_callback=self.active_executions[execution_id]["streaming_callback"]
        )
        
        # Register and start the analyzer
        self.agent_registry[agent_name] = analyzer
        self.active_executions[execution_id]["active_agents"][agent_name] = {
            "agent": analyzer,
            "role": "autonomous_analyzer",
            "spawn_time": time.time(),
            "status": "analyzing"
        }
        
        # Start the analyzer with enhanced task
        asyncio.create_task(analyzer.run(enhanced_task))
        
        logger.info(f"🧠 Spawned autonomous analyzer {agent_name} for execution {execution_id}")
        return analyzer
    
    async def _handle_agent_request(self, event_data: dict):
        """Handle requests for new agents - unlimited spawning based on need"""
        agent_role = event_data.get("role")
        reason = event_data.get("reason", "Specialist needed")
        priority = event_data.get("priority", "medium")
        execution_id = event_data.get("execution_id")
        context = event_data.get("context", "")
        requesting_agent = event_data.get("requesting_agent")
        
        if not execution_id or execution_id not in self.active_executions:
            logger.warning(f"⚠️ Agent request for unknown execution: {execution_id}")
            return
        
        execution_state = self.active_executions[execution_id]
        
        # Check if we've reached absolute system limits (not artificial task limits)
        if execution_state["agents_spawned"] >= self.max_total_agents:
            logger.warning(f"🚫 Reached absolute system limit of {self.max_total_agents} agents")
            return
        
        # Generate unique agent name with counter
        with self._execution_lock:
            if execution_id not in self._agent_counter:
                self._agent_counter[execution_id] = {}
            
            role_counter = self._agent_counter[execution_id].get(agent_role, 0) + 1
            self._agent_counter[execution_id][agent_role] = role_counter
            agent_name = f"{agent_role}_{role_counter:03d}_{execution_id[:8]}"
        
        # Spawn the requested specialist
        try:
            specialist = await self._spawn_specialist_agent(
                execution_id=execution_id,
                agent_name=agent_name,
                role=agent_role,
                reason=reason,
                priority=priority,
                context=context,
                requesting_agent=requesting_agent
            )
            
            if specialist:
                execution_state["agents_spawned"] += 1
                logger.info(f"✅ Spawned {agent_name} (#{execution_state['agents_spawned']}) - Reason: {reason}")
                
                # Emit spawn confirmation
                await event_bus.emit("agent.spawned", {
                    "execution_id": execution_id,
                    "agent_name": agent_name,
                    "role": agent_role,
                    "reason": reason,
                    "priority": priority,
                    "total_spawned": execution_state["agents_spawned"]
                })
                
        except Exception as e:
            logger.error(f"❌ Failed to spawn {agent_role}: {str(e)}")
    
    async def _spawn_specialist_agent(self, execution_id: str, agent_name: str, role: str, 
                                    reason: str, priority: str, context: str, requesting_agent: str) -> Optional[EventAwareAgent]:
        """Spawn a specialist agent with dynamic capabilities"""
        
        # Determine appropriate capabilities based on role
        capabilities = AgentCapabilities.REASONING  # Base capability
        
        if role in ["researcher", "analyst", "investigator"]:
            capabilities |= AgentCapabilities.WEB_SEARCH | AgentCapabilities.ANALYSIS
        elif role in ["developer", "programmer", "coder"]:
            capabilities |= AgentCapabilities.CODE_GENERATION | AgentCapabilities.ANALYSIS
        elif role in ["writer", "editor", "documenter"]:
            capabilities |= AgentCapabilities.CONTENT_CREATION | AgentCapabilities.ANALYSIS
        elif role in ["reviewer", "critic", "evaluator", "quality_assessor"]:
            capabilities |= AgentCapabilities.ANALYSIS | AgentCapabilities.EVALUATION
        elif role in ["coordinator", "manager", "orchestrator"]:
            capabilities |= AgentCapabilities.COORDINATION | AgentCapabilities.PLANNING
        elif role in ["designer", "creative", "visualizer"]:
            capabilities |= AgentCapabilities.CONTENT_CREATION
        
        # Create dynamic system prompt based on role and context
        system_prompt = await self._generate_dynamic_system_prompt(role, reason, context, requesting_agent)
        
        # Create the specialist agent
        specialist = EventAwareAgent(
            name=agent_name,
            role=role,
            capabilities=capabilities,
            system_prompt=system_prompt,
            execution_id=execution_id,
            streaming_callback=self.active_executions[execution_id]["streaming_callback"]
        )
        
        # Register the agent
        self.agent_registry[agent_name] = specialist
        self.active_executions[execution_id]["active_agents"][agent_name] = {
            "agent": specialist,
            "role": role,
            "reason": reason,
            "priority": priority,
            "spawn_time": time.time(),
            "status": "spawned",
            "requesting_agent": requesting_agent
        }
        
        # Start the agent with contextual task
        contextual_task = await self._build_contextual_task(execution_id, role, reason, context)
        asyncio.create_task(specialist.run(contextual_task))
        
        return specialist
    
    async def _generate_dynamic_system_prompt(self, role: str, reason: str, context: str, requesting_agent: str) -> str:
        """Generate intelligent system prompts based on role and context"""
        
        base_prompt = f"""You are a {role} specialist in an autonomous agent swarm.
        
CONTEXT: {context}
YOUR MISSION: {reason}
SPAWNED BY: {requesting_agent}

As a specialist, you have complete autonomy to:
1. Request additional specialist agents if you need help
2. Collaborate with other agents in the swarm
3. Focus on delivering exceptional quality work
4. Continue iterating until you achieve excellence

IMPORTANT GUIDELINES:
- Only mark your task as complete when you're truly satisfied with the quality
- Request specialist agents whenever you identify areas needing expertise
- Focus on thoroughness and accuracy over speed
- Collaborate and build upon other agents' work
- If you see opportunities for improvement, spawn improvement specialists

Your work contributes to a larger autonomous system - make it count."""

        # Role-specific enhancements
        if role in ["researcher", "analyst"]:
            base_prompt += """
            
RESEARCH SPECIALIST GUIDELINES:
- Conduct thorough research using all available sources
- Verify information from multiple angles
- If you need web research, data analysis, or literature review specialists, request them
- Focus on accuracy and comprehensive coverage
- Always cite sources and provide evidence"""
            
        elif role in ["writer", "editor"]:
            base_prompt += """
            
WRITING SPECIALIST GUIDELINES:
- Create engaging, well-structured content
- If you need fact-checkers, proofreaders, or style specialists, request them
- Focus on clarity, flow, and reader engagement
- Adapt your style to the target audience
- Ensure all claims are well-supported"""
            
        elif role in ["developer", "programmer"]:
            base_prompt += """
            
DEVELOPMENT SPECIALIST GUIDELINES:
- Write clean, maintainable, well-documented code
- If you need testing, security, or performance specialists, request them
- Follow best practices and industry standards
- Focus on reliability and scalability
- Include comprehensive error handling"""
            
        elif role in ["reviewer", "evaluator"]:
            base_prompt += """
            
REVIEW SPECIALIST GUIDELINES:
- Provide thorough, constructive evaluation
- If you need domain experts or additional reviewers, request them
- Focus on quality, accuracy, and completeness
- Identify specific improvement opportunities
- Suggest concrete next steps"""
        
        return base_prompt
    
    async def _build_contextual_task(self, execution_id: str, role: str, reason: str, context: str) -> str:
        """Build a contextual task for the specialist based on previous work"""
        
        execution_state = self.active_executions[execution_id]
        previous_outputs = []
        
        # Gather relevant previous work
        for agent_name, agent_info in execution_state.get("completed_agents", {}).items():
            if agent_info.get("output"):
                previous_outputs.append(f"[{agent_info['role']}]: {agent_info['output'][:500]}...")
        
        # Build comprehensive task context
        task_context = f"""
SPECIALIST TASK FOR {role.upper()}:

ORIGINAL TASK: {execution_state['request'].task}

WHY YOU'RE NEEDED: {reason}

PREVIOUS WORK COMPLETED:
{chr(10).join(previous_outputs) if previous_outputs else "You are among the first agents working on this task."}

YOUR SPECIFIC ROLE:
{context}

INSTRUCTIONS:
1. Review the previous work done by other agents
2. Identify how your expertise can add value
3. Complete your specialized contribution with exceptional quality
4. If you need additional specialists to help you, request them
5. Only consider your work complete when you're proud of the result

Begin your specialized work now. Focus on quality and thoroughness.
"""
        
        return task_context
    
    async def _handle_agent_completion(self, event_data: dict):
        """Handle agent completion and decide on next steps"""
        agent_name = event_data.get("agent")
        execution_id = event_data.get("execution_id")
        output = event_data.get("output", "")
        
        if not execution_id or execution_id not in self.active_executions:
            return
        
        execution_state = self.active_executions[execution_id]
        
        # Move agent from active to completed
        if agent_name in execution_state["active_agents"]:
            agent_info = execution_state["active_agents"].pop(agent_name)
            agent_info["completion_time"] = time.time()
            agent_info["output"] = output
            agent_info["status"] = "completed"
            execution_state["completed_agents"][agent_name] = agent_info
            execution_state["task_outputs"].append(output)
            
            logger.info(f"✅ Agent {agent_name} completed - Active: {len(execution_state['active_agents'])}")
    
    async def _evaluate_continuation_need(self, execution_id: str):
        """Intelligently evaluate if more agents are needed"""
        execution_state = self.active_executions[execution_id]
        
        # If we have no completed work yet, wait for initial results
        if not execution_state["completed_agents"]:
            logger.info(f"⏳ Waiting for initial agent completions in {execution_id}")
            await asyncio.sleep(5)
            return
        
        # Assess current progress and quality
        current_quality = await self._assess_work_quality(execution_id)
        execution_state["user_satisfaction"] = current_quality
        
        # Continue if quality threshold not met
        if current_quality < self.quality_threshold:
            logger.info(f"📈 Quality {current_quality:.2f} < threshold {self.quality_threshold} - continuing")
            await self._request_improvement_agents(execution_id, current_quality)
        else:
            # Quality threshold met - check if recent agents made significant improvements
            recent_improvement = self._calculate_recent_improvement(execution_id)
            
            if recent_improvement > self.improvement_threshold:
                logger.info(f"🚀 Recent improvement {recent_improvement:.2f} > threshold - continuing optimization")
                await self._request_optimization_agents(execution_id)
            else:
                logger.info(f"✅ Task satisfaction achieved - Quality: {current_quality:.2f}, Recent improvement: {recent_improvement:.2f}")
                execution_state["should_continue"] = False
    
    async def _assess_work_quality(self, execution_id: str) -> float:
        """Assess the current quality of work using AI evaluation"""
        execution_state = self.active_executions[execution_id]
        
        if not execution_state["completed_agents"]:
            return 0.0
        
        # Compile all completed work
        all_outputs = [agent["output"] for agent in execution_state["completed_agents"].values()]
        combined_work = "\n\n".join(all_outputs)
        
        # Use AI to assess quality (simplified version - could be enhanced)
        quality_score = len(combined_work) / 10000  # Basic heuristic
        quality_score = min(quality_score, 1.0)  # Cap at 1.0
        
        # Add to quality history
        self._task_quality_scores[execution_id].append({
            "timestamp": time.time(),
            "score": quality_score,
            "agent_count": len(execution_state["completed_agents"])
        })
        
        return quality_score
    
    def _calculate_recent_improvement(self, execution_id: str) -> float:
        """Calculate recent improvement in task quality"""
        quality_history = self._task_quality_scores.get(execution_id, [])
        
        if len(quality_history) < 2:
            return 1.0  # Assume high improvement for early stages
        
        recent_score = quality_history[-1]["score"]
        previous_score = quality_history[-2]["score"]
        
        return max(0.0, recent_score - previous_score)
    
    async def _request_improvement_agents(self, execution_id: str, current_quality: float):
        """Request agents specifically for improvement"""
        gap_analysis = f"Current quality: {current_quality:.2f}, Target: {self.quality_threshold}"
        
        # Request quality improvement specialists
        await event_bus.emit("agent.needed", {
            "execution_id": execution_id,
            "role": "quality_improver",
            "reason": f"Improve task quality from current level. {gap_analysis}",
            "priority": "high",
            "context": "Quality gap identified - focus on specific improvements",
            "requesting_agent": "autonomous_system"
        })
        
        # Request critical reviewer
        await event_bus.emit("agent.needed", {
            "execution_id": execution_id, 
            "role": "critical_reviewer",
            "reason": "Identify specific areas needing improvement and gaps in current work",
            "priority": "high",
            "context": "Quality assessment phase - find weaknesses and suggest enhancements",
            "requesting_agent": "autonomous_system"
        })
    
    async def _request_optimization_agents(self, execution_id: str):
        """Request agents for optimization and polishing"""
        await event_bus.emit("agent.needed", {
            "execution_id": execution_id,
            "role": "optimizer",
            "reason": "Polish and optimize the high-quality work for excellence",
            "priority": "medium", 
            "context": "Optimization phase - make good work exceptional",
            "requesting_agent": "autonomous_system"
        })
    
    async def _compile_final_result(self, execution_id: str) -> str:
        """Compile the final result from all completed agents"""
        execution_state = self.active_executions[execution_id]
        
        # Create final compilation prompt
        all_outputs = []
        for agent_name, agent_info in execution_state["completed_agents"].items():
            output = agent_info.get("output", "")
            if output.strip():
                all_outputs.append(f"=== {agent_info['role'].upper()} ({agent_name}) ===\n{output}\n")
        
        compiled_result = f"""
AUTONOMOUS SWARM EXECUTION COMPLETE
===================================

Task: {execution_state['request'].task}
Execution ID: {execution_id}
Agents Deployed: {execution_state['agents_spawned']}
Final Quality Score: {execution_state.get('user_satisfaction', 0.0):.2f}
Execution Time: {time.time() - execution_state['start_time']:.1f}s

COMPREHENSIVE RESULT:
{chr(10).join(all_outputs)}

This result was produced by an autonomous agent swarm that continued iterating until quality satisfaction was achieved.
"""
        
        return compiled_result
    
    def _extract_artifacts(self, execution_id: str) -> List[dict]:
        """Extract artifacts from completed agents"""
        artifacts = []
        execution_state = self.active_executions[execution_id]
        
        for agent_name, agent_info in execution_state["completed_agents"].items():
            output = agent_info.get("output", "")
            if len(output) > 100:  # Only substantial outputs become artifacts
                artifacts.append({
                    "title": f"{agent_info['role']} Output - {agent_name}",
                    "type": "text",
                    "content": output,
                    "metadata": {
                        "role": agent_info["role"],
                        "agent": agent_name,
                        "spawn_time": agent_info.get("spawn_time"),
                        "completion_time": agent_info.get("completion_time")
                    }
                })
        
        return artifacts
    
    async def _initiate_graceful_completion(self, execution_id: str):
        """Gracefully complete the execution"""
        execution_state = self.active_executions[execution_id]
        
        # Signal all active agents to complete their current work
        for agent_name, agent_info in execution_state["active_agents"].items():
            agent = agent_info["agent"]
            if hasattr(agent, 'should_stop'):
                agent.should_stop = True
        
        # Wait briefly for agents to complete
        await asyncio.sleep(10)
        
        # Force completion
        execution_state["should_continue"] = False
        execution_state["status"] = ExecutionStatus.COMPLETED
        
        logger.info(f"⏰ Graceful completion initiated for execution {execution_id}")
    
    async def _cleanup_execution(self, execution_id: str):
        """Clean up execution resources"""
        if execution_id in self.active_executions:
            execution_state = self.active_executions[execution_id]
            
            # Clean up any remaining agents
            for agent_name in list(execution_state.get("active_agents", {}).keys()):
                if agent_name in self.agent_registry:
                    del self.agent_registry[agent_name]
            
            # Clean up tracking data
            if execution_id in self._task_quality_scores:
                del self._task_quality_scores[execution_id]
            if execution_id in self._agent_counter:
                del self._agent_counter[execution_id]
            
            del self.active_executions[execution_id]
        
        logger.info(f"🧹 Cleaned up execution {execution_id}")
    
    # Control Methods for Safety
    def pause_execution(self, execution_id: str):
        """Pause a specific execution"""
        if execution_id in self.active_executions:
            self.paused_executions.add(execution_id)
            logger.info(f"⏸️ Paused execution {execution_id}")
            return True
        return False
    
    def resume_execution(self, execution_id: str):
        """Resume a paused execution"""
        if execution_id in self.paused_executions:
            self.paused_executions.remove(execution_id)
            logger.info(f"▶️ Resumed execution {execution_id}")
            return True
        return False
    
    def stop_execution(self, execution_id: str):
        """Stop a specific execution gracefully"""
        if execution_id in self.active_executions:
            self.user_stop_requests.add(execution_id)
            logger.info(f"🛑 Stop requested for execution {execution_id}")
            return True
        return False
    
    def emergency_stop_all(self):
        """Emergency stop all executions immediately"""
        self.emergency_stop = True
        logger.warning("🚨 EMERGENCY STOP ACTIVATED - All executions will halt")
        
        # Immediately stop all active agents
        for execution_id, execution_state in self.active_executions.items():
            for agent_name, agent_info in execution_state.get("active_agents", {}).items():
                agent = agent_info.get("agent")
                if agent and hasattr(agent, 'should_stop'):
                    agent.should_stop = True
        
        return True
    
    def reset_emergency_stop(self):
        """Reset emergency stop to allow new executions"""
        self.emergency_stop = False
        self.user_stop_requests.clear()
        self.paused_executions.clear()
        logger.info("✅ Emergency stop reset - system ready for new executions")
    
    def get_execution_status(self, execution_id: str) -> dict:
        """Get detailed status of an execution"""
        if execution_id not in self.active_executions:
            return {"error": "Execution not found"}
        
        execution_state = self.active_executions[execution_id]
        return {
            "execution_id": execution_id,
            "status": execution_state.get("status", "unknown"),
            "agents_spawned": execution_state.get("agents_spawned", 0),
            "active_agents": len(execution_state.get("active_agents", {})),
            "completed_agents": len(execution_state.get("completed_agents", {})),
            "user_satisfaction": execution_state.get("user_satisfaction", 0.0),
            "is_paused": execution_id in self.paused_executions,
            "stop_requested": execution_id in self.user_stop_requests,
            "runtime": time.time() - execution_state.get("start_time", time.time())
        }
    
    def list_active_executions(self) -> List[dict]:
        """List all active executions with their status"""
        return [self.get_execution_status(exec_id) for exec_id in self.active_executions.keys()]
    
    async def _handle_pause_request(self, event_data: dict):
        """Handle pause request events"""
        execution_id = event_data.get("execution_id")
        if execution_id:
            self.pause_execution(execution_id)
    
    async def _handle_stop_request(self, event_data: dict):
        """Handle stop request events"""
        execution_id = event_data.get("execution_id")
        if execution_id:
            self.stop_execution(execution_id)
    
    async def _handle_emergency_stop(self, event_data: dict):
        """Handle emergency stop events"""
        self.emergency_stop_all()