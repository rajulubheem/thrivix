"""
Controlled Event-Driven Swarm Service with Agent Pool Management
"""
import asyncio
import time
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any
import logging

from app.schemas.swarm import SwarmExecutionRequest, SwarmExecutionResponse, ExecutionStatus
from app.services.agent_pool_manager import AgentPoolManager
from app.services.circuit_breaker import CircuitBreaker
from app.services.event_bus import event_bus
from app.services.event_aware_agent import EventAwareAgent, AgentCapabilities

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
                "callback": callback_handler
            }
            
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
                callback_handler=callback_handler
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
        result = await self._controlled_execution_loop(execution_id, request.task, callback_handler)
        
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
    
    @CircuitBreaker(failure_threshold=3, recovery_timeout=60)
    async def _spawn_controlled_agent(
        self,
        execution_id: str,
        role: str,
        task: str,
        context: dict = None,
        callback_handler=None
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
            
            # Create controlled agent
            agent = await self._create_controlled_agent(role, agent_id, execution_id, callback_handler)
            
            # Store in registry
            self.agent_registry[agent_id] = agent
            
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
        callback_handler
    ) -> EventAwareAgent:
        """Create an event-aware agent with controls"""
        
        # Define capabilities based on role
        capabilities_map = {
            "analyzer": AgentCapabilities(
                skills=["analysis", "task_breakdown"],
                tools=["web_search"],
                listens_to=["agent.needed", "task.analyze"],
                emits=["analysis.complete", "agent.needed"]
            ),
            "researcher": AgentCapabilities(
                skills=["research", "information_gathering"],
                tools=["web_search"],
                listens_to=["agent.needed", "research.needed"],
                emits=["research.complete"]
            ),
            "writer": AgentCapabilities(
                skills=["writing", "content_creation"],
                tools=[],
                listens_to=["agent.needed", "content.needed"],
                emits=["content.complete"]
            )
        }
        
        capabilities = capabilities_map.get(role, AgentCapabilities(
            skills=[role],
            tools=[],
            listens_to=["agent.needed"],
            emits=["task.complete"]
        ))
        
        # Create agent with controlled system prompt
        system_prompt = self._get_controlled_system_prompt(role)
        
        agent = EventAwareAgent(
            name=f"{role}_{agent_id[:8]}",
            role=role,
            system_prompt=system_prompt,
            capabilities=capabilities
        )
        
        return agent
    
    def _get_controlled_system_prompt(self, role: str) -> str:
        """Get system prompt with built-in controls"""
        base_prompt = f"""You are a {role} agent in a CONTROLLED multi-agent system.

STRICT RULES:
1. You have LIMITED TIME (max 60 seconds) - work efficiently
2. Complete your task in ONE response - don't ask for more information
3. For simple requests (jokes, basic questions), provide the answer directly
4. Mark your completion clearly with "TASK COMPLETE" when done
5. Do NOT ask users for clarification on simple requests

Your role: {role}

IMPORTANT: If the user asks for something simple like a joke, story, or basic information - just provide it directly and mark TASK COMPLETE.
"""
        
        role_specific = {
            "analyzer": "Analyze the given task and provide a brief analysis. Be concise and actionable.",
            "researcher": "Research the topic quickly and provide key findings. Focus on most relevant information.",
            "writer": "Create content based on provided information. Keep it focused and well-structured."
        }
        
        return base_prompt + role_specific.get(role, "Complete your assigned task efficiently.")
    
    async def _execute_agent_with_timeout(self, agent_id: str, task: str, context: dict):
        """Execute agent task with timeout protection"""
        try:
            agent = self.agent_registry.get(agent_id)
            if not agent:
                return
            
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
            
        except asyncio.TimeoutError:
            logger.error(f"⏰ Agent {agent_id} timed out")
            await self.pool_manager.mark_agent_completed(agent_id, success=False)
        except Exception as e:
            logger.error(f"❌ Agent {agent_id} failed: {e}")
            await self.pool_manager.mark_agent_completed(agent_id, success=False)
    
    async def _controlled_execution_loop(self, execution_id: str, original_query: str, callback_handler=None) -> str:
        """Main execution loop with controls"""
        loop_count = 0
        max_loops = 10  # Hard limit on loop iterations
        
        accumulated_results = []
        processed_events = set()  # Track processed events to avoid duplicates
        
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
            
            # Check if any agents are still working
            if len(self.pool_manager.active_agents) == 0:
                # Wait a bit longer to ensure agents have actually completed
                await asyncio.sleep(2)
                
                # Double-check no agents are still active after waiting
                if len(self.pool_manager.active_agents) > 0:
                    logger.info(f"🔄 Agents still active after wait, continuing...")
                    continue
                
                # Only spawn ONE new agent at a time to prevent overwhelming
                recent_events = event_bus.get_recent_events(10)  # Get more recent events
                spawn_requests = [e for e in recent_events if e.type == "agent.needed"]  # Remove loop count filter
                
                logger.info(f"🔍 Loop {loop_count}: Found {len(recent_events)} recent events, {len(spawn_requests)} spawn requests")
                
                # Allow spawning in first 5 loops to give more chances
                if spawn_requests and loop_count <= 5:
                    # Only spawn the MOST RECENT agent request, not multiple
                    latest_request = spawn_requests[-1]
                    logger.info(f"🔄 Found agent spawn request, spawning ONE agent...")
                    
                    try:
                        agent_role = latest_request.data.get("role", "writer")
                        reason = latest_request.data.get("reason", "AI requested agent")
                        
                        # Spawn only ONE agent
                        new_agent_id = await self._spawn_controlled_agent(
                            execution_id=execution_id,
                            role=agent_role,
                            task=f"Previous context: {accumulated_results[-1] if accumulated_results else original_query}. Task: {reason}",
                            context={"reason": reason, "priority": latest_request.data.get("priority", "medium")},
                            callback_handler=callback_handler
                        )
                        
                        if new_agent_id:
                            logger.info(f"✅ Spawned {agent_role} agent: {new_agent_id}")
                            # Wait for this agent to start working before next loop
                            await asyncio.sleep(3)
                        else:
                            logger.warning(f"⚠️ Failed to spawn {agent_role} agent")
                            
                    except Exception as spawn_error:
                        logger.error(f"❌ Error spawning agent: {spawn_error}")
                    
                    # Continue loop to let the new agent work
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
                    
                if event.type in ["task.complete", "analysis.complete", "content.complete"]:
                    if "final_output" in event.data:
                        result = event.data["final_output"]
                        accumulated_results.append(result)
                        processed_events.add(event.id)  # Mark as processed
                        
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
                        
            
            # If we have results and no active agents, we're done
            if accumulated_results and len(self.pool_manager.active_agents) == 0:
                break
        
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