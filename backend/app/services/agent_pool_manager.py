"""
Agent Pool Manager - Controls agent lifecycle and prevents runaway executions
"""
import asyncio
import time
import uuid
import psutil
import os
import signal
from typing import Dict, List, Optional, Set
from dataclasses import dataclass
from datetime import datetime, timedelta
import logging
import threading

from app.services.circuit_breaker import CircuitBreaker

logger = logging.getLogger(__name__)

@dataclass
class AgentProcess:
    """Track individual agent process"""
    agent_id: str
    name: str
    role: str
    process_id: Optional[int] = None
    start_time: float = 0.0
    status: str = "idle"  # idle, running, completed, failed, killed
    cpu_percent: float = 0.0
    memory_mb: float = 0.0
    last_activity: float = 0.0

class AgentPoolManager:
    """Manages agent pool with hard limits and circuit breakers"""
    
    def __init__(
        self,
        max_concurrent_agents: int = 3,
        max_total_agents: int = 10,
        max_execution_time: int = 300,  # 5 minutes
        max_agent_runtime: int = 120,   # 2 minutes per agent
        cpu_limit_percent: float = 80.0,
        memory_limit_mb: float = 1024.0  # 1GB process limit (was 500MB)
    ):
        self.max_concurrent_agents = max_concurrent_agents
        self.max_total_agents = max_total_agents
        self.max_execution_time = max_execution_time
        self.max_agent_runtime = max_agent_runtime
        self.cpu_limit_percent = cpu_limit_percent
        self.memory_limit_mb = memory_limit_mb
        
        # State tracking
        self.active_agents: Dict[str, AgentProcess] = {}
        self.agent_history: List[AgentProcess] = []
        self.total_agents_spawned = 0
        self.execution_start_time: Optional[float] = None
        self.execution_id: Optional[str] = None
        
        # Control mechanisms
        self.circuit_breaker = CircuitBreaker(failure_threshold=3, recovery_timeout=30)
        self.is_stopped = False
        self.monitor_task: Optional[asyncio.Task] = None
        
        # Resource monitoring  
        self.resource_violations = 0
        self.max_resource_violations = 10  # Increased from 5 to allow more work
        
        # Thread safety for agent spawning
        self._spawn_lock = asyncio.Lock()
        self._spawning_agents: Set[str] = set()  # Track agents currently being spawned
        self._state_lock = threading.RLock()  # For synchronizing state changes
    
    async def start_execution(self, execution_id: str):
        """Start a new execution with monitoring"""
        self.execution_id = execution_id
        self.execution_start_time = time.time()
        self.is_stopped = False
        self.total_agents_spawned = 0
        self.active_agents.clear()
        self.agent_history.clear()
        self.resource_violations = 0
        self.circuit_breaker.reset()
        
        # Start resource monitoring
        self.monitor_task = asyncio.create_task(self._monitor_resources())
        logger.info(f"🎯 Agent pool manager started for execution {execution_id}")
    
    async def stop_execution(self, force: bool = False):
        """Stop execution and clean up all agents"""
        self.is_stopped = True
        
        if force:
            await self._force_kill_all_agents()
        else:
            await self._graceful_shutdown_agents()
        
        # Stop monitoring
        if self.monitor_task and not self.monitor_task.done():
            self.monitor_task.cancel()
            try:
                await self.monitor_task
            except asyncio.CancelledError:
                pass
        
        logger.info(f"🛑 Agent pool manager stopped (force={force})")
    
    async def can_spawn_agent(self, role: str) -> tuple[bool, str]:
        """Thread-safe check if we can spawn a new agent"""
        with self._state_lock:
            if self.is_stopped:
                return False, "Execution is stopped"
            
            if self.circuit_breaker.is_open:
                return False, "Circuit breaker is open"
            
            # Include agents currently being spawned in the count
            total_active = len(self.active_agents) + len(self._spawning_agents)
            if total_active >= self.max_concurrent_agents:
                return False, f"Max concurrent agents reached ({self.max_concurrent_agents})"
            
            if self.total_agents_spawned >= self.max_total_agents:
                return False, f"Max total agents reached ({self.max_total_agents})"
            
            if self._execution_time_exceeded():
                return False, f"Max execution time exceeded ({self.max_execution_time}s)"
            
            # Check if this role is already being spawned
            if role in self._spawning_agents:
                return False, f"Agent role '{role}' is already being spawned"
            
            return True, "OK"
    
    async def register_agent(self, agent_name: str, role: str) -> str:
        """Thread-safe agent registration"""
        async with self._spawn_lock:
            # Double-check after acquiring lock
            can_spawn, reason = await self.can_spawn_agent(role)
            if not can_spawn:
                raise Exception(f"Cannot spawn agent: {reason}")
            
            # Mark role as being spawned
            with self._state_lock:
                self._spawning_agents.add(role)
            
            try:
                agent_id = str(uuid.uuid4())
                agent_process = AgentProcess(
                    agent_id=agent_id,
                    name=agent_name,
                    role=role,
                    start_time=time.time(),
                    status="idle",
                    last_activity=time.time()
                )
                
                with self._state_lock:
                    self.active_agents[agent_id] = agent_process
                    self.total_agents_spawned += 1
                
                logger.info(f"🤖 Agent registered: {agent_name} ({role}) - {len(self.active_agents)}/{self.max_concurrent_agents} active")
                return agent_id
                
            finally:
                # Remove from spawning set
                with self._state_lock:
                    self._spawning_agents.discard(role)
    
    async def mark_agent_running(self, agent_id: str, process_id: Optional[int] = None):
        """Thread-safe mark agent as running"""
        with self._state_lock:
            if agent_id in self.active_agents:
                self.active_agents[agent_id].status = "running"
                self.active_agents[agent_id].process_id = process_id or os.getpid()
                self.active_agents[agent_id].last_activity = time.time()
                logger.debug(f"🏃 Agent {agent_id} marked as running")
    
    async def mark_agent_completed(self, agent_id: str, success: bool = True):
        """Thread-safe mark agent as completed and move to history"""
        with self._state_lock:
            if agent_id not in self.active_agents:
                return
            
            agent = self.active_agents[agent_id]
            agent.status = "completed" if success else "failed"
            
            # Move to history
            self.agent_history.append(agent)
            del self.active_agents[agent_id]
            
            # Remove from spawning set if it was there
            self._spawning_agents.discard(agent.role)
            
            if not success:
                self.circuit_breaker._on_failure()
            else:
                self.circuit_breaker._on_success()
            
            logger.info(f"✅ Agent {agent_id} completed ({agent.status}) - {len(self.active_agents)} active")
    
    async def _monitor_resources(self):
        """Monitor system resources and agent health"""
        while not self.is_stopped:
            try:
                await asyncio.sleep(5)  # Check every 5 seconds (was 2) - less aggressive
                
                # Check execution timeout
                if self._execution_time_exceeded():
                    logger.error(f"⏰ Execution time exceeded ({self.max_execution_time}s) - forcing stop")
                    # Send timeout notification before stopping
                    try:
                        # Notify any listeners about timeout
                        if hasattr(self, 'streaming_callback') and self.streaming_callback:
                            await self.streaming_callback(
                                type="execution_timeout",
                                agent=None,
                                data={
                                    "timeout": self.max_execution_time,
                                    "message": f"Execution time limit of {self.max_execution_time}s reached",
                                    "execution_id": self.execution_id
                                }
                            )
                    except Exception as e:
                        logger.error(f"Failed to send timeout notification: {e}")
                    
                    await self.stop_execution(force=True)
                    break
                
                # Check individual agent timeouts
                current_time = time.time()
                for agent_id, agent in list(self.active_agents.items()):
                    agent_runtime = current_time - agent.start_time
                    if agent_runtime > self.max_agent_runtime:
                        logger.error(f"⏰ Agent {agent_id} exceeded runtime limit ({self.max_agent_runtime}s) - killing")
                        # Notify about agent timeout before killing
                        try:
                            if hasattr(self, 'streaming_callback') and self.streaming_callback:
                                await self.streaming_callback(
                                    type="agent_timeout",
                                    agent=agent_id,
                                    data={
                                        "runtime": int(agent_runtime),
                                        "limit": self.max_agent_runtime,
                                        "agent_id": agent_id
                                    }
                                )
                        except Exception:
                            pass
                        await self._kill_agent(agent_id)
                
                # Monitor system resources
                await self._check_system_resources()
                
            except Exception as e:
                logger.error(f"Resource monitoring error: {e}")
    
    async def _check_system_resources(self):
        """Check current Python process CPU and memory usage"""
        try:
            # Get current process (our Python backend)
            current_process = psutil.Process()
            
            # Check CPU usage of our process (not system-wide)
            cpu_percent = current_process.cpu_percent(interval=1)
            
            # Check memory usage of our process (not system-wide)
            memory_info = current_process.memory_info()
            process_memory_mb = memory_info.rss / (1024 * 1024)  # Resident Set Size in MB
            
            if cpu_percent > self.cpu_limit_percent:
                self.resource_violations += 1
                logger.warning(f"⚠️ High process CPU usage: {cpu_percent:.1f}% (violation {self.resource_violations})")
            
            if process_memory_mb > self.memory_limit_mb:
                self.resource_violations += 1
                logger.warning(f"⚠️ High process memory usage: {process_memory_mb:.1f}MB (violation {self.resource_violations})")
            
            # Force stop if too many violations
            if self.resource_violations >= self.max_resource_violations:
                logger.error("🚨 Too many resource violations - forcing stop")
                await self.stop_execution(force=True)
            
        except Exception as e:
            logger.debug(f"Resource check failed: {e}")
    
    async def _kill_agent(self, agent_id: str):
        """Kill a specific agent"""
        if agent_id not in self.active_agents:
            return
        
        agent = self.active_agents[agent_id]
        
        try:
            if agent.process_id:
                os.kill(agent.process_id, signal.SIGTERM)
                await asyncio.sleep(1)  # Give it a chance to terminate gracefully
                
                try:
                    # Check if still alive and force kill
                    os.kill(agent.process_id, 0)  # Check if process exists
                    os.kill(agent.process_id, signal.SIGKILL)
                    logger.warning(f"🔪 Force killed agent {agent_id}")
                except ProcessLookupError:
                    pass  # Already dead
            
        except (ProcessLookupError, PermissionError):
            pass  # Process already dead or no permission
        
        # Mark as killed
        agent.status = "killed"
        self.agent_history.append(agent)
        del self.active_agents[agent_id]
        
        logger.info(f"💀 Killed agent {agent_id}")
    
    async def _graceful_shutdown_agents(self):
        """Gracefully shutdown all agents"""
        logger.info("🔄 Gracefully shutting down agents...")
        
        # Give agents 5 seconds to finish
        await asyncio.sleep(5)
        
        # Force kill any remaining agents
        await self._force_kill_all_agents()
    
    async def _force_kill_all_agents(self):
        """Force kill all active agents"""
        logger.warning("🔪 Force killing all active agents")
        
        kill_tasks = []
        for agent_id in list(self.active_agents.keys()):
            task = asyncio.create_task(self._kill_agent(agent_id))
            kill_tasks.append(task)
        
        if kill_tasks:
            await asyncio.gather(*kill_tasks, return_exceptions=True)
    
    def _execution_time_exceeded(self) -> bool:
        """Check if execution time limit exceeded"""
        if not self.execution_start_time:
            return False
        return time.time() - self.execution_start_time > self.max_execution_time
    
    @property
    def status(self) -> dict:
        """Get current pool status"""
        return {
            "execution_id": self.execution_id,
            "active_agents": len(self.active_agents),
            "total_spawned": self.total_agents_spawned,
            "max_concurrent": self.max_concurrent_agents,
            "max_total": self.max_total_agents,
            "execution_time": time.time() - self.execution_start_time if self.execution_start_time else 0,
            "max_execution_time": self.max_execution_time,
            "is_stopped": self.is_stopped,
            "circuit_breaker": self.circuit_breaker.status,
            "resource_violations": self.resource_violations,
            "agent_list": [
                {
                    "id": agent.agent_id,
                    "name": agent.name,
                    "role": agent.role,
                    "status": agent.status,
                    "runtime": time.time() - agent.start_time
                }
                for agent in self.active_agents.values()
            ]
        }