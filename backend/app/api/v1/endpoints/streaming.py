"""
Production-ready streaming endpoint with polling-based approach
Supports Redis for distributed session storage
"""
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks, Query
from fastapi.responses import JSONResponse
import json
import asyncio
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import structlog
import hashlib

from app.schemas.swarm import SwarmExecutionRequest
from app.services.enhanced_swarm_service import EnhancedSwarmService
from app.services.realtime_swarm_service import RealtimeSwarmService
from app.services.strands_session_service import get_strands_session_service
# from app.services.swarm_dag_adapter import swarm_dag_adapter, ExecutionMode  # Disabled DAG
from app.core.config import settings
from .streaming_optimizer import optimizer

router = APIRouter()
logger = structlog.get_logger()

# Session storage interface
class SessionStorage:
    """Abstract session storage interface"""

    async def get(self, session_id: str) -> Optional[Dict]:
        raise NotImplementedError

    async def set(self, session_id: str, data: Dict, ttl: int = 300):
        raise NotImplementedError

    async def delete(self, session_id: str):
        raise NotImplementedError

    async def append_chunk(self, session_id: str, chunk: Dict):
        raise NotImplementedError

    async def get_chunks(self, session_id: str, offset: int = 0, limit: int = 100) -> List[Dict]:
        raise NotImplementedError


class InMemorySessionStorage(SessionStorage):
    """In-memory session storage for development/single-instance deployments"""

    def __init__(self):
        self.sessions: Dict[str, Dict] = {}
        self.cleanup_task = None

    async def get(self, session_id: str) -> Optional[Dict]:
        session = self.sessions.get(session_id)
        if session:
            session["last_accessed"] = datetime.utcnow()
        return session

    async def set(self, session_id: str, data: Dict, ttl: int = 300):
        self.sessions[session_id] = {
            **data,
            "created_at": datetime.utcnow(),
            "last_accessed": datetime.utcnow(),
            "ttl": ttl
        }

        # Start cleanup task if not running
        if not self.cleanup_task:
            self.cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def delete(self, session_id: str):
        self.sessions.pop(session_id, None)

    async def append_chunk(self, session_id: str, chunk: Dict):
        try:
            session = self.sessions.get(session_id)
            if session:
                if "chunks" not in session:
                    session["chunks"] = []

                # Limit chunks to prevent memory issues
                MAX_CHUNKS = 10000  # Reasonable limit
                if len(session["chunks"]) >= MAX_CHUNKS:
                    logger.warning(f"Session {session_id} reached max chunks limit")
                    # Remove oldest chunks to make room
                    session["chunks"] = session["chunks"][-MAX_CHUNKS + 100:]

                session["chunks"].append(chunk)
                session["last_accessed"] = datetime.utcnow()

                # Update metrics safely
                if "metrics" in session:
                    session["metrics"]["chunk_count"] = len(session["chunks"])
        except Exception as e:
            logger.error(f"Error appending chunk to session {session_id}: {e}")

    async def get_chunks(self, session_id: str, offset: int = 0, limit: int = 100) -> List[Dict]:
        """Get chunks with pagination to prevent huge payloads"""
        try:
            session = self.sessions.get(session_id)
            if not session:
                logger.warning(f"Session {session_id[:8]} not found in get_chunks")
                return []

            if "chunks" not in session:
                logger.info(f"No chunks in session {session_id[:8]}")
                return []

            chunks = session.get("chunks", [])
            total_chunks = len(chunks)

            # Validate offset
            if offset < 0:
                logger.warning(f"Negative offset {offset} corrected to 0")
                offset = 0
            if offset >= total_chunks:
                logger.info(f"Offset {offset} >= total {total_chunks}, no new chunks")
                return []

            # Validate limit
            if limit <= 0:
                logger.warning(f"Invalid limit {limit}, using default 50")
                limit = 50
            if limit > 100:
                logger.warning(f"Limit {limit} exceeds max, capping at 100")
                limit = 100

            # Return limited number of chunks (pagination)
            end_index = min(offset + limit, total_chunks)
            result = chunks[offset:end_index]

            logger.info(f"get_chunks: session={session_id[:8]}, offset={offset}, limit={limit}, total={total_chunks}, returning={len(result)}")

            # Double-check result size
            if len(result) > limit:
                logger.error(f"BUG: Returning {len(result)} chunks but limit is {limit}!")
                result = result[:limit]  # Force truncate

            return result

        except Exception as e:
            logger.error(f"Error in get_chunks for session {session_id}: {e}", exc_info=True)
            return []

    async def _cleanup_loop(self):
        """Cleanup expired sessions periodically"""
        while True:
            await asyncio.sleep(60)  # Check every minute

            now = datetime.utcnow()
            to_delete = []

            for session_id, session in self.sessions.items():
                ttl = session.get("ttl", 300)
                last_accessed = session.get("last_accessed", now)

                if isinstance(last_accessed, datetime):
                    age = (now - last_accessed).total_seconds()
                    if age > ttl:
                        to_delete.append(session_id)

            for session_id in to_delete:
                await self.delete(session_id)
                logger.info(f"Cleaned up expired session: {session_id}")


class RedisSessionStorage(SessionStorage):
    """Redis-based session storage for production/distributed deployments"""

    def __init__(self):
        self.redis = None
        self._initialized = False

    async def _ensure_initialized(self):
        """Lazy initialization of Redis connection"""
        if not self._initialized:
            try:
                import aioredis
                self.redis = await aioredis.create_redis_pool(
                    settings.REDIS_URL or 'redis://localhost:6379',
                    encoding='utf-8'
                )
                self._initialized = True
                logger.info("Redis session storage initialized")
            except Exception as e:
                logger.error(f"Failed to connect to Redis: {e}")
                raise

    async def get(self, session_id: str) -> Optional[Dict]:
        await self._ensure_initialized()

        key = f"stream_session:{session_id}"
        data = await self.redis.get(key)

        if data:
            # Update last accessed time
            await self.redis.expire(key, 300)  # Reset TTL
            return json.loads(data)
        return None

    async def set(self, session_id: str, data: Dict, ttl: int = 300):
        await self._ensure_initialized()

        key = f"stream_session:{session_id}"
        data["created_at"] = datetime.utcnow().isoformat()
        data["last_accessed"] = datetime.utcnow().isoformat()

        await self.redis.setex(
            key,
            ttl,
            json.dumps(data)
        )

    async def delete(self, session_id: str):
        await self._ensure_initialized()

        key = f"stream_session:{session_id}"
        chunks_key = f"stream_chunks:{session_id}"

        await self.redis.delete(key)
        await self.redis.delete(chunks_key)

    async def append_chunk(self, session_id: str, chunk: Dict):
        await self._ensure_initialized()

        chunks_key = f"stream_chunks:{session_id}"
        await self.redis.rpush(chunks_key, json.dumps(chunk))
        await self.redis.expire(chunks_key, 300)  # Reset TTL

        # Update session last accessed
        session_key = f"stream_session:{session_id}"
        await self.redis.expire(session_key, 300)

    async def get_chunks(self, session_id: str, offset: int = 0, limit: int = 100) -> List[Dict]:
        """Get chunks with pagination"""
        await self._ensure_initialized()

        chunks_key = f"stream_chunks:{session_id}"
        # Use limit for Redis range query
        end_index = offset + limit - 1
        chunks_json = await self.redis.lrange(chunks_key, offset, end_index)

        if chunks_json:
            await self.redis.expire(chunks_key, 300)  # Reset TTL
            return [json.loads(chunk) for chunk in chunks_json]
        return []


# Initialize appropriate storage based on environment
def get_session_storage() -> SessionStorage:
    """Factory function to get appropriate session storage"""
    if hasattr(settings, 'REDIS_URL') and settings.REDIS_URL:
        try:
            return RedisSessionStorage()
        except Exception as e:
            logger.warning(f"Failed to initialize Redis storage, falling back to in-memory: {e}")

    return InMemorySessionStorage()


# Global storage instance
storage = get_session_storage()
logger.info(f"STORAGE DEBUG: Using {storage.__class__.__name__}")


@router.post("/streaming/start")
async def start_streaming(
    request: SwarmExecutionRequest,
    background_tasks: BackgroundTasks
):
    """
    Start a new streaming session
    Returns session ID for polling
    """

    # Generate secure session ID
    session_id = str(uuid.uuid4())
    
    logger.info(f"🆕 START REQUEST: new session_id={session_id}, task={request.task[:50] if request.task else ''}..., agents={len(request.agents) if request.agents else 0}")
    
    # Initialize Strands session for persistence
    strands_service = get_strands_session_service()
    
    # Initialize session with virtual filesystem support
    await storage.set(session_id, {
        "task": request.task,
        "status": "initializing",
        "agents": request.agents if request.agents else [],  # CRITICAL: Save agents for continuation
        "chunks": [],
        "accumulated": {},
        "virtual_filesystem": {},  # Initialize empty virtual filesystem
        "metrics": {
            "start_time": datetime.utcnow().isoformat(),
            "chunk_count": 0,
            "agent_count": 0,
            "total_tokens": 0
        }
    })
    
    # Also save initial context to Strands
    initial_context = {
        "task": request.task,
        "start_time": datetime.utcnow().isoformat(),
        "task_history": [{"task": request.task, "timestamp": datetime.utcnow().isoformat()}]
    }
    strands_service.save_context(session_id, initial_context)

    # Callback handler for streaming
    async def stream_callback(**kwargs):
        """Process streaming events"""
        try:
            event_type = kwargs.get("type", "unknown")
            agent = kwargs.get("agent")
            data = kwargs.get("data", {})

            event = None

            if event_type == "agent_started" and agent:
                event = {
                    "type": "agent_start",
                    "agent": agent,
                    "timestamp": datetime.utcnow().isoformat()
                }

                # Update metrics
                session = await storage.get(session_id)
                if session and "metrics" in session:
                    session["metrics"]["agent_count"] += 1
                    await storage.set(session_id, session)

            elif event_type == "text_generation" and agent:
                chunk = data.get("chunk", "") or data.get("text", "")
                if chunk:
                    # Send chunks immediately without any batching
                    event = {
                        "type": "delta",
                        "agent": agent,
                        "content": chunk,
                        "timestamp": datetime.utcnow().isoformat()
                    }

                    # Pass through is_tool_result flag if present
                    if data.get("is_tool_result"):
                        event["is_tool_result"] = True
                    
                    # Store immediately for real-time streaming
                    await storage.append_chunk(session_id, event)
                    return  # Return immediately to prevent any delay

            elif event_type == "agent_completed" and agent:
                # No buffering - chunks are sent immediately

                session = await storage.get(session_id)
                accumulated_text = ""

                if session and "accumulated" in session:
                    accumulated_text = session["accumulated"].get(agent, "")

                event = {
                    "type": "agent_done",
                    "agent": agent,
                    "content": accumulated_text,
                    "tokens": data.get("tokens", 0),
                    "timestamp": datetime.utcnow().isoformat()
                }

                # Update metrics
                if session:
                    session["metrics"]["total_tokens"] += data.get("tokens", 0)
                    await storage.set(session_id, session)

            elif event_type == "agents_generated":
                # CRITICAL: Update session with generated agents for continuation
                if data and data.get("agents"):
                    # Save to in-memory session
                    session = await storage.get(session_id)
                    if session:
                        session["agents"] = data["agents"]
                        await storage.set(session_id, session)
                    
                    # ALSO save to persistent Strands storage
                    strands_svc = get_strands_session_service()
                    strands_svc.save_agents(session_id, data["agents"])
                    logger.info(f"💾 Saved {len(data['agents'])} generated agents to persistent storage for {session_id}")
                return  # Don't send this event to frontend
            elif event_type == "handoff":
                event = {
                    "type": "handoff",
                    "from": data.get("from_agent"),
                    "to": data.get("to_agent"),
                    "reason": data.get("reason"),
                    "timestamp": datetime.utcnow().isoformat()
                }

            elif event_type == "tool_execution":
                event = {
                    "type": "tool",
                    "agent": agent,
                    "tool": data.get("tool"),
                    "filename": data.get("filename"),
                    "timestamp": datetime.utcnow().isoformat()
                }

            elif event_type == "tool_approval_required":
                # CRITICAL: Handle approval request events
                logger.info(f"APPROVAL EVENT: tool_approval_required for {agent}")
                event = {
                    "type": "tool_approval_required",
                    "agent": agent,
                    "data": data,  # Contains tool, parameters, approval_id, etc.
                    "timestamp": datetime.utcnow().isoformat()
                }
                # Store this as high priority
                await storage.append_chunk(session_id, event)
                return  # Return early to ensure it gets sent immediately

            elif event_type == "tool_approval_response":
                event = {
                    "type": "tool_approval_response",
                    "agent": agent,
                    "data": data,
                    "timestamp": datetime.utcnow().isoformat()
                }

            elif event_type == "tool_rejected":
                event = {
                    "type": "tool_rejected",
                    "agent": agent,
                    "data": data,
                    "timestamp": datetime.utcnow().isoformat()
                }

            elif event_type == "tool_executed":
                event = {
                    "type": "tool_executed",
                    "agent": agent,
                    "data": data,
                    "timestamp": datetime.utcnow().isoformat()
                }

            elif event_type == "tool_call":
                # Handle tool call events (before execution)
                # Ensure data has the expected structure
                tool_data = {
                    "tool": data.get("tool") or data.get("name", "Unknown Tool"),
                    "parameters": data.get("parameters") or data.get("params", {}),
                    "formatted": data.get("formatted", "")
                }
                event = {
                    "type": "tool_call",
                    "agent": agent,
                    "data": tool_data,
                    "timestamp": datetime.utcnow().isoformat()
                }
                # Store immediately for tool visibility
                await storage.append_chunk(session_id, event)
                return  # Return early to ensure immediate visibility

            elif event_type == "tool_result":
                # Handle tool result events with structured data
                # Ensure data has the expected structure
                result_data = {
                    "tool": data.get("tool") or data.get("name", "Tool"),
                    "success": data.get("success", True),
                    "summary": data.get("summary") or data.get("message", ""),
                    "results": data.get("results") or data.get("output") or data.get("content"),
                    "formatted": data.get("formatted", "")
                }
                event = {
                    "type": "tool_result",
                    "agent": agent,
                    "data": result_data,
                    "timestamp": datetime.utcnow().isoformat()
                }

            elif event_type == "artifact":
                # Handle single artifact creation
                # Ensure artifact has proper structure
                artifact_data = {
                    "name": data.get("name") or data.get("filename") or data.get("title", "Untitled"),
                    "content": data.get("content", ""),
                    "type": data.get("type", "code"),
                    "language": data.get("language") or data.get("lang", "plaintext")
                }
                
                # Save to virtual filesystem via Strands session
                strands_svc = get_strands_session_service()
                session = await storage.get(session_id)
                if session:
                    virtual_fs = session.get("virtual_filesystem", {})
                    virtual_fs[artifact_data["name"]] = artifact_data["content"]
                    session["virtual_filesystem"] = virtual_fs
                    await storage.set(session_id, session)
                    # Also persist to Strands
                    strands_svc.save_virtual_filesystem(session_id, virtual_fs)
                
                event = {
                    "type": "artifact",
                    "agent": agent,
                    "data": artifact_data,
                    "timestamp": datetime.utcnow().isoformat()
                }

            elif event_type == "artifacts_created":
                # Handle multiple artifacts creation
                # Ensure each artifact has proper structure
                artifacts = data.get("artifacts", [])
                formatted_artifacts = []
                
                # Get Strands service and current session
                strands_svc = get_strands_session_service()
                session = await storage.get(session_id)
                virtual_fs = session.get("virtual_filesystem", {}) if session else {}
                
                for artifact in artifacts:
                    formatted_artifact = {
                        "name": artifact.get("name") or artifact.get("filename") or artifact.get("title", "Untitled"),
                        "content": artifact.get("content", ""),
                        "type": artifact.get("type", "code"),
                        "language": artifact.get("language") or artifact.get("lang", "plaintext")
                    }
                    formatted_artifacts.append(formatted_artifact)
                    # Add to virtual filesystem
                    virtual_fs[formatted_artifact["name"]] = formatted_artifact["content"]
                
                # Save updated virtual filesystem
                if session:
                    session["virtual_filesystem"] = virtual_fs
                    await storage.set(session_id, session)
                    # Also persist to Strands
                    strands_svc.save_virtual_filesystem(session_id, virtual_fs)
                
                event = {
                    "type": "artifacts_created",
                    "agent": agent,
                    "data": {"artifacts": formatted_artifacts},
                    "timestamp": datetime.utcnow().isoformat()
                }

            if event:
                # Check if we haven't exceeded chunk limit
                session = await storage.get(session_id)
                current_chunks = session.get("metrics", {}).get("chunk_count", 0) if session else 0

                if current_chunks < 9900:  # Leave some room before hitting limit
                    await storage.append_chunk(session_id, event)
                elif event["type"] in ["agent_done", "done", "error"]:
                    # Always allow completion events
                    await storage.append_chunk(session_id, event)
                else:
                    logger.warning(f"Skipping chunk for session {session_id}, limit reached: {current_chunks}")

        except Exception as e:
            logger.error(f"Error in stream callback: {e}")

    # Execute in background
    async def run_execution():
        """Run the swarm execution in background"""
        try:
            # Update status
            session = await storage.get(session_id)
            if session:
                session["status"] = "running"
                await storage.set(session_id, session)

            # DAG mode disabled - always use sequential
            logger.info(f"➡️ Using sequential execution for task: {request.task[:50]}...")
                
            # Analyze if DAG would be beneficial
            agents_for_dag = []
            if request.agents:
                for agent in request.agents:
                    if hasattr(agent, 'dict'):
                        agents_for_dag.append(agent.dict())
                    elif isinstance(agent, dict):
                        agents_for_dag.append(agent)
                    else:
                        agents_for_dag.append({
                            "name": getattr(agent, 'name', 'Unknown'),
                            "system_prompt": getattr(agent, 'system_prompt', ''),
                            "tools": getattr(agent, 'tools', [])
                        })
            
            # DAG disabled - always use sequential
            use_dag = False
            dag_reason = ""
            # if execution_mode == ExecutionMode.PARALLEL:
            #     use_dag = True
            #     dag_reason = "Parallel mode forced"
            # elif execution_mode == ExecutionMode.AUTO and len(agents_for_dag) >= 3:
            #     # Auto-detect if task would benefit from parallel
            #     use_parallel, reason = swarm_dag_adapter.analyze_task_for_parallelism(request.task)
            #     use_dag = use_parallel
            #     dag_reason = reason
                
            if use_dag:
                logger.info(f"🚀 Using DAG parallel execution: {dag_reason}")
                # Send a chunk indicating DAG mode
                await storage.append_chunk(session_id, {
                    "type": "execution_mode",
                    "mode": "parallel",
                    "reason": dag_reason,
                    "timestamp": datetime.utcnow().isoformat()
                })
            else:
                logger.info(f"➡️ Using sequential execution")
                await storage.append_chunk(session_id, {
                    "type": "execution_mode", 
                    "mode": "sequential",
                    "reason": "Sequential mode selected or optimal for task",
                    "timestamp": datetime.utcnow().isoformat()
                })
            
            # Use appropriate service
            if hasattr(settings, 'USE_REALTIME_STREAMING') and settings.USE_REALTIME_STREAMING:
                service = RealtimeSwarmService()
            else:
                service = EnhancedSwarmService()
                if hasattr(service, '_ensure_initialized'):
                    await service._ensure_initialized()

            # Save agents to session before execution
            if request.agents and len(request.agents) > 0:
                # Convert agents to dict format for storage
                agent_dicts = []
                for agent in request.agents:
                    if hasattr(agent, 'dict'):
                        agent_dicts.append(agent.dict())
                    elif isinstance(agent, dict):
                        agent_dicts.append(agent)
                    else:
                        agent_dicts.append({
                            "name": getattr(agent, 'name', 'Unknown'),
                            "role": getattr(agent, 'role', ''),
                            "tools": getattr(agent, 'tools', [])
                        })
                
                # Save to in-memory session - merge with existing agents if any
                session = await storage.get(session_id)
                if session:
                    existing_agents = session.get("agents", [])
                    # Merge new agents with existing ones (avoid duplicates)
                    # Handle both dict and object formats
                    existing_names = set()
                    for agent in existing_agents:
                        if isinstance(agent, dict):
                            existing_names.add(agent.get("name"))
                        else:
                            existing_names.add(getattr(agent, "name", None))
                    
                    for new_agent in agent_dicts:
                        agent_name = new_agent.get("name") if isinstance(new_agent, dict) else getattr(new_agent, "name", None)
                        if agent_name and agent_name not in existing_names:
                            existing_agents.append(new_agent)
                    
                    session["agents"] = existing_agents
                    await storage.set(session_id, session)
                    logger.info(f"📋 Merged agents: {len(existing_agents)} total ({len(agent_dicts)} new)")
                else:
                    session = {"agents": agent_dicts}
                    await storage.set(session_id, session)
                
                # ALSO save to persistent Strands storage
                strands_svc = get_strands_session_service()
                strands_svc.save_agents(session_id, session.get("agents", agent_dicts))
                logger.info(f"💾 Saved agents to persistent storage for {session_id}")
            
            # Execute with DAG if beneficial, otherwise use normal swarm
            if use_dag:  # This will never execute now
                # Build and execute DAG
                # graph = swarm_dag_adapter.build_dag_from_agents(agents_for_dag, request.task)
                graph = None  # DAG disabled
                if graph:
                    logger.info(f"📊 Executing DAG with {len(graph.nodes)} nodes in {len(graph._get_execution_levels())} parallel levels")
                    # Execute the graph
                    from app.graph import GraphResult
                    graph_result = await graph.execute_async(request.task)
                    
                    # Convert graph result to swarm-like result
                    result = {
                        "status": "completed",
                        "execution_mode": "parallel",
                        "parallel_levels": len(graph._get_execution_levels()),
                        "nodes_executed": graph_result.completed_nodes,
                        "result": str(graph_result)
                    }
                    
                    # Send completion chunks for each completed node
                    for node_id, node in graph.nodes.items():
                        if node.result:
                            await storage.append_chunk(session_id, {
                                "type": "agent_complete",
                                "agent": node_id,
                                "content": str(node.result),
                                "execution_time_ms": node.execution_time_ms,
                                "timestamp": datetime.utcnow().isoformat()
                            })
                else:
                    # Fallback to sequential if DAG building failed
                    logger.warning("DAG building failed, falling back to sequential")
                    result = await service.execute_swarm_async(
                        request=request,
                        user_id="stream_user",
                        callback_handler=stream_callback
                    )
            else:
                # Normal sequential execution with intelligent agent management
                # Get existing agents from session if available (only for continuation)
                existing_agents = None
                conversation_history = []
                
                session = await storage.get(session_id)
                
                # Only use existing agents if this is a continuation (session has accumulated context)
                if session and "accumulated" in session and len(session["accumulated"]) > 0:
                    # This is a continuation - preserve existing agents
                    if "agents" in session:
                        existing_agents = session["agents"]
                        logger.info(f"📋 Continuation detected - found {len(existing_agents)} existing agents in session")
                    
                    # Extract conversation history from accumulated context
                    conversation_history = session["accumulated"]
                    logger.info(f"📖 Using {len(conversation_history)} conversation history items")
                else:
                    # Fresh session - no existing agents
                    logger.info(f"🆕 Fresh session - starting with no existing agents")
                
                result = await service.execute_swarm_async(
                    request=request,
                    user_id="stream_user",
                    callback_handler=stream_callback,
                    conversation_history=conversation_history,
                    existing_agents=existing_agents
                )

            # No buffering needed - all chunks sent immediately

            # Update status and store result
            session = await storage.get(session_id)
            if session:
                session["status"] = "complete"
                session["result"] = result
                session["metrics"]["end_time"] = datetime.utcnow().isoformat()
                await storage.set(session_id, session)
                
                # CRITICAL: Save accumulated context to Strands for future continuation
                if session.get("accumulated"):
                    logger.info(f"💾 Saving accumulated context for session {session_id}")
                    context_to_save = {
                        "accumulated_context": session["accumulated"],
                        "virtual_filesystem": session.get("virtual_filesystem", {}),
                        "task_history": session.get("task_history", [])
                    }
                    strands_service.save_context(session_id, context_to_save)

                # Send completion event
                await storage.append_chunk(session_id, {
                    "type": "done",
                    "timestamp": datetime.utcnow().isoformat(),
                    "metrics": session["metrics"]
                })

        except Exception as e:
            logger.error(f"Execution error for session {session_id}: {e}")

            session = await storage.get(session_id)
            if session:
                session["status"] = "error"
                session["error"] = str(e)
                await storage.set(session_id, session)

                # Send error event
                await storage.append_chunk(session_id, {
                    "type": "error",
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat()
                })

    # Add to background tasks
    background_tasks.add_task(run_execution)

    return JSONResponse({
        "session_id": session_id,
        "status": "started",
        "poll_url": f"/api/v1/streaming/poll/{session_id}"
    })


@router.get("/streaming/poll/{session_id}")
async def poll_stream(
    session_id: str,
    offset: int = Query(0, ge=0),
    timeout: int = Query(10, ge=1, le=30),  # Reduced default timeout for faster response
    limit: int = Query(50, ge=1, le=100)  # Max chunks per response
):
    """
    Poll for new chunks from a streaming session with pagination

    Args:
        session_id: The streaming session ID
        offset: Number of chunks already received
        timeout: Max time to wait for new chunks (seconds)
        limit: Max number of chunks to return per request

    Returns:
        JSON with new chunks and updated offset
    """

    try:
        # CRITICAL DEBUG: Log entry point
        logger.info(f"ENTRY: poll_stream called with session_id={session_id[:8]}, offset={offset}, limit={limit}")

        # Validate session exists
        session = await storage.get(session_id)
        if not session:
            logger.info("Session not found, returning empty response")
            return JSONResponse(
                status_code=200,
                content={
                    "session_id": session_id,
                    "status": "not_found",
                    "offset": offset,
                    "chunks": [],
                    "has_more": False,
                    "error": "Session not found or expired"
                }
            )
        # Validate parameters
        if limit > 100:
            limit = 100
        if limit <= 0:
            limit = 50
        if offset < 0:
            offset = 0
        if timeout > 30:
            timeout = 30
        if timeout <= 0:
            timeout = 1

        logger.info(f"Validated params: offset={offset}, limit={limit}, timeout={timeout}")

        # Long polling implementation
        start_time = asyncio.get_event_loop().time()
        end_time = start_time + timeout
        chunks = []

        while asyncio.get_event_loop().time() < end_time:
            # Get chunks with pagination
            chunks = await storage.get_chunks(session_id, offset, limit)

            if chunks:
                logger.info(f"Got {len(chunks)} chunks at offset {offset}")
                break

            # Check if execution is complete
            session = await storage.get(session_id)
            if not session or session.get("status") in ["complete", "error", "stopped"]:
                break

            # Small delay before next check
            await asyncio.sleep(0.05)

        # Refresh session for latest status
        session = await storage.get(session_id)
        if not session:
            # Return gracefully instead of raising exception
            return JSONResponse(
                status_code=200,
                content={
                    "session_id": session_id,
                    "status": "expired",
                    "offset": offset,
                    "chunks": [],
                    "has_more": False,
                    "error": "Session expired"
                }
            )

        # Calculate next offset
        new_offset = offset + len(chunks)

        # Determine if there are more chunks
        total_chunks = session.get("metrics", {}).get("chunk_count", 0)
        has_more = (new_offset < total_chunks) or (session.get("status") == "running")

        # Build response
        response_data = {
            "session_id": session_id,
            "status": session.get("status", "unknown"),
            "offset": new_offset,
            "chunks": chunks,
            "has_more": has_more,
            "metrics": session.get("metrics") if session.get("status") == "complete" else None
        }

        logger.info(f"Returning {len(chunks)} chunks, new_offset={new_offset}, has_more={has_more}")

        return JSONResponse(content=response_data)

    except Exception as e:
        logger.error(f"ERROR in poll_stream at offset {offset}: {e}", exc_info=True)
        # Always return 200 with error details to prevent 500s
        return JSONResponse(
            status_code=200,
            content={
                "session_id": session_id,
                "status": "error",
                "offset": offset,
                "chunks": [],
                "has_more": False,
                "error": str(e),
                "error_type": type(e).__name__
            }
        )


@router.delete("/streaming/stop/{session_id}")
async def stop_stream(session_id: str):
    """
    Stop and clean up a streaming session

    Args:
        session_id: The streaming session ID to stop
    """

    session = await storage.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Mark as stopped and cleanup
    session["status"] = "stopped"
    await storage.set(session_id, session, ttl=60)  # Keep for 1 minute for final polls

    return JSONResponse({
        "status": "stopped",
        "session_id": session_id
    })


@router.get("/streaming/status/{session_id}")
async def get_stream_status(session_id: str):
    """
    Get the status and metrics of a streaming session

    Args:
        session_id: The streaming session ID
    """

    session = await storage.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return JSONResponse({
        "session_id": session_id,
        "status": session["status"],
        "task": session.get("task"),
        "metrics": session.get("metrics"),
        "error": session.get("error")
    })


# Health check endpoint
@router.get("/streaming/health")
async def health_check():
    """Check if streaming service is healthy"""

    # Test storage connectivity
    test_id = f"health_check_{uuid.uuid4()}"

    try:
        await storage.set(test_id, {"test": True}, ttl=10)
        data = await storage.get(test_id)
        await storage.delete(test_id)

        storage_healthy = data is not None
    except Exception as e:
        logger.error(f"Storage health check failed: {e}")
        storage_healthy = False

    return JSONResponse({
        "status": "healthy" if storage_healthy else "degraded",
        "storage_type": storage.__class__.__name__,
        "storage_healthy": storage_healthy,
        "timestamp": datetime.utcnow().isoformat()
    })


@router.post("/streaming/continue")
async def continue_streaming(
    request: Dict[str, Any],
    background_tasks: BackgroundTasks
):
    """
    Continue an existing streaming session with context preservation using Strands SDK
    """
    session_id = request.get("session_id")
    task = request.get("task", "")
    previous_messages = request.get("previous_messages", [])
    agents = request.get("agents", [])
    max_handoffs = request.get("max_handoffs", 20)
    execution_mode = request.get("execution_mode", "auto")
    
    logger.info(f"🔄 CONTINUE REQUEST: session_id={session_id}, task={task[:50]}..., agents={len(agents)}, messages={len(previous_messages)}, execution_mode={execution_mode}")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    
    # Get Strands session service
    strands_service = get_strands_session_service()
    
    # Get existing session and virtual filesystem from Strands
    session = await storage.get(session_id)
    virtual_filesystem = strands_service.get_virtual_filesystem(session_id)
    saved_context = strands_service.get_context(session_id)
    
    # Perform session context analysis for intelligent decisions
    session_analysis = strands_service.analyze_session_context(session_id)
    logger.info(f"📊 Session Analysis Results:")
    logger.info(f"  - Total messages: {session_analysis.get('total_messages', 0)}")
    logger.info(f"  - Agents used: {session_analysis.get('agents_used', 0)}")
    logger.info(f"  - Task domains: {session_analysis.get('task_domains', set())}")
    logger.info(f"  - Continuation suitable: {session_analysis.get('continuation_suitable', False)}")
    
    if not session:
        # If session doesn't exist in memory, check if we have it persisted
        logger.info(f"Session {session_id} not in memory, checking persisted sessions")
        if session_id in strands_service.list_sessions():
            logger.info(f"Found persisted session {session_id}, restoring context")
        else:
            # Session not found anywhere, but keep the same session_id to maintain continuity
            logger.info(f"Session {session_id} not found, creating new session with same ID")
    
    # STRANDS PATTERN: Use AI Orchestrator for intelligent agent selection
    # The orchestrator analyzes tasks and creates optimal agent configurations
    
    logger.info("🤖 AGENT SELECTION: Using AI Orchestrator for intelligent decisions")
    logger.info(f"📝 Task: {task[:100]}...")
    logger.info(f"💬 Context: {len(previous_messages)} previous messages")
    
    # Simple check: is this a continuation of the same conversation?
    is_continuation = False
    if agents and len(agents) > 0:
        # Frontend provided agents - respect that choice
        logger.info(f"📥 Using {len(agents)} agents provided by frontend")
    elif previous_messages and task:
        # Check for continuation keywords  
        continuation_keywords = ["continue", "more", "also", "extend", "add to", "update", "modify"]
        is_continuation = any(keyword in task.lower() for keyword in continuation_keywords)
        
        if is_continuation and session_analysis.get('agents_used', 0) > 0:
            # Try to reuse existing agents for continuation
            existing_agents = strands_service.get_agents(session_id)
            if existing_agents:
                logger.info(f"✅ Continuation detected - reusing {len(existing_agents)} existing agents")
                agents = existing_agents
            else:
                logger.info("🆕 No existing agents found - will create new ones")
                agents = []
        else:
            logger.info("🆕 New task or context switch - will create fresh agents")
            agents = []
    else:
        logger.info("🆕 No context - will create new agents")
        agents = []
    
    
    # Convert to proper AgentConfig format if we have agents
    if agents:
        from app.schemas.swarm import AgentConfig
        converted_agents = []
        for agent in agents:
            if isinstance(agent, dict):
                # Extract only the fields that AgentConfig accepts
                agent_data = {
                    "name": agent.get("name", "Unknown"),
                    "system_prompt": agent.get("system_prompt") or agent.get("role", "Assistant"),
                    "tools": agent.get("tools", []),
                }
                # Add optional fields if they exist
                if "description" in agent:
                    agent_data["description"] = agent["description"]
                if "icon" in agent:
                    agent_data["icon"] = agent["icon"]
                if "model" in agent:
                    agent_data["model"] = agent["model"]
                if "temperature" in agent:
                    agent_data["temperature"] = agent["temperature"]
                if "max_tokens" in agent:
                    agent_data["max_tokens"] = agent["max_tokens"]
                    
                converted_agents.append(AgentConfig(**agent_data))
            elif hasattr(agent, '__dict__'):
                # It's already some kind of object, keep as is
                converted_agents.append(agent)
            else:
                converted_agents.append(agent)
        agents = converted_agents
        logger.info(f"✅ Converted {len(agents)} agents to proper format")
    
    # Merge context from different sources, prioritizing saved context
    # Load messages from saved context if not provided
    if not previous_messages and saved_context.get("messages"):
        logger.info(f"📚 Loading {len(saved_context['messages'])} messages from saved context")
        previous_messages = saved_context["messages"]
    
    context = {
        "previous_messages": previous_messages,
        "messages": previous_messages,  # Also store as "messages" for compatibility
        "virtual_filesystem": virtual_filesystem or saved_context.get("virtual_filesystem", {}) or (session.get("virtual_filesystem", {}) if session else {}),
        "accumulated_context": saved_context.get("accumulated_context", {}) or (session.get("accumulated", {}) if session else {}),
        "task_history": saved_context.get("task_history", []) or (session.get("task_history", []) if session else [])
    }
    
    # Log what we loaded
    logger.info(f"📊 Context loaded:")
    logger.info(f"  - Messages: {len(context['previous_messages'])}")
    logger.info(f"  - Virtual files: {len(context['virtual_filesystem'])}")
    logger.info(f"  - Accumulated context items: {len(context['accumulated_context'])}")
    logger.info(f"  - Task history: {len(context['task_history'])}")
    
    # Add current task to history
    context["task_history"].append({
        "task": task,
        "timestamp": datetime.utcnow().isoformat()
    })
    
    # Save context to Strands session
    strands_service.save_context(session_id, context)
    
    # Initialize session with preserved context
    await storage.set(session_id, {
        "status": "initializing",
        "agents": agents,
        "task": task,
        "context": context,
        "virtual_filesystem": context["virtual_filesystem"],
        "accumulated": context["accumulated_context"],
        "task_history": context["task_history"],
        "chunks": [],
        "metrics": {
            "start_time": datetime.utcnow().isoformat(),
            "chunk_count": 0,
            "agent_count": 0,
            "tool_calls": 0,
            "handoffs": 0
        }
    })
    
    # Create request with context
    swarm_request = SwarmExecutionRequest(
        task=task,
        agents=agents,
        max_handoffs=max_handoffs,
        execution_id=session_id,
        context=context,  # Pass context to swarm
        execution_mode=execution_mode  # Pass execution mode from request
    )
    
    # Use enhanced service for better context handling
    service = EnhancedSwarmService()
    
    # Execute in background with context preservation
    background_tasks.add_task(
        execute_swarm_with_context,
        session_id,
        swarm_request,
        service,
        context
    )
    
    return JSONResponse({
        "session_id": session_id,
        "poll_url": f"/api/v1/streaming/poll/{session_id}",
        "status": "started",
        "context_preserved": True
    })


async def execute_swarm_with_context(
    session_id: str,
    request: SwarmExecutionRequest,
    service: EnhancedSwarmService,
    context: Dict[str, Any]
):
    """Execute swarm with preserved context"""
    try:
        # Get Strands service once outside the callback to capture in closure
        strands_service = get_strands_session_service()
        
        # Create a callback that saves events to storage
        async def streaming_callback(**kwargs):
            event_type = kwargs.get("type", "unknown")
            agent = kwargs.get("agent")
            data = kwargs.get("data", {})
            
            # Create event based on type
            event = {
                "type": event_type,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            if agent:
                event["agent"] = agent
            if data:
                event["data"] = data
                
            # Special handling for content/delta events
            if event_type == "token" and "content" in data:
                event["type"] = "delta"
                event["content"] = data["content"]
                
            # Save to storage
            await storage.append_chunk(session_id, event)
            
            # Special handling for agents_generated event
            if event_type == "agents_generated":
                # CRITICAL: Update session with generated agents for continuation
                if data and data.get("agents"):
                    session = await storage.get(session_id)
                    if session:
                        session["agents"] = data["agents"]
                        await storage.set(session_id, session)
                    
                    # ALSO save to persistent Strands storage (strands_service is from outer scope)
                    strands_service.save_agents(session_id, data["agents"])
                    logger.info(f"💾 Saved {len(data['agents'])} generated agents to persistent storage for {session_id}")
                return  # Don't send this event to frontend
            
            # Update virtual filesystem if artifacts are created
            elif event_type in ["artifact", "artifacts_created"]:
                session = await storage.get(session_id)
                if session:
                    virtual_fs = session.get("virtual_filesystem", {})
                    if event_type == "artifact":
                        artifact_name = data.get("name", "unnamed")
                        artifact_content = data.get("content", "")
                        virtual_fs[artifact_name] = artifact_content
                    elif event_type == "artifacts_created":
                        for artifact in data.get("artifacts", []):
                            virtual_fs[artifact.get("name", "unnamed")] = artifact.get("content", "")
                    session["virtual_filesystem"] = virtual_fs
                    await storage.set(session_id, session)
                    strands_svc.save_virtual_filesystem(session_id, virtual_fs)
        
        # Build conversation history from context
        conversation_history = []
        
        # Add previous messages from context
        if context.get("previous_messages"):
            logger.info(f"📝 Adding {len(context['previous_messages'])} previous messages to conversation history")
            
            # Add the actual messages for full context
            for msg in context["previous_messages"]:
                if msg.get("role") and msg.get("content"):
                    conversation_history.append({
                        "role": msg["role"],
                        "content": msg["content"]
                    })
        else:
            logger.info("📝 No previous messages in context")
        
        # Add accumulated context as system message to guide agents
        if context.get("accumulated_context"):
            logger.info(f"📚 Found accumulated context for {len(context['accumulated_context'])} agents")
            for agent_name, agent_context in context["accumulated_context"].items():
                if agent_context:
                    logger.info(f"  - Adding context from {agent_name}: {len(agent_context)} chars")
                    conversation_history.append({
                        "role": "system",
                        "content": f"Previous work by {agent_name}:\n{agent_context}"
                    })
        else:
            logger.info("📚 No accumulated context found")
        
        # Add virtual filesystem info if present
        if context.get("virtual_filesystem"):
            files_list = list(context["virtual_filesystem"].keys())
            if files_list:
                conversation_history.append({
                    "role": "system", 
                    "content": f"Files already created: {', '.join(files_list)}"
                })
        
        # Always use sequential execution - removed DAG/parallel mode
        logger.info(f"➡️ Using sequential execution in continue endpoint")
        
        # Direct execution without DAG check
        if False:  # Disabled DAG execution
            logger.info(f"🚀 Using DAG parallel execution in continue: {dag_reason}")
            # Send a chunk indicating DAG mode
            await storage.append_chunk(session_id, {
                "type": "execution_mode",
                "mode": "parallel",
                "reason": dag_reason,
                "timestamp": datetime.utcnow().isoformat()
            })
            
            # Build and execute DAG
            # graph = swarm_dag_adapter.build_dag_from_agents(agents_for_dag, request.task)
            graph = None  # DAG disabled
            if graph:
                logger.info(f"📊 Executing DAG with {len(graph.nodes)} nodes in continue endpoint")
                try:
                    # Execute the DAG
                    result = await graph.execute_async(
                        task=request.task,
                        callback_handler=streaming_callback
                    )
                    # Send completion event
                    await storage.append_chunk(session_id, {
                        "type": "dag_complete",
                        "nodes_executed": len(graph.nodes),
                        "timestamp": datetime.utcnow().isoformat()
                    })
                except Exception as e:
                    logger.error(f"DAG execution failed in continue: {e}")
                    # Fallback to sequential
                    result = await service.execute_swarm_async(
                        request=request,
                        user_id="stream_user",
                        callback_handler=streaming_callback,
                        conversation_history=conversation_history
                    )
            else:
                # Fallback to sequential if DAG building failed
                logger.warning("DAG building failed in continue, falling back to sequential")
                result = await service.execute_swarm_async(
                    request=request,
                    user_id="stream_user",
                    callback_handler=streaming_callback,
                    conversation_history=conversation_history
                )
        else:
            logger.info(f"➡️ Using sequential execution in continue")
            await storage.append_chunk(session_id, {
                "type": "execution_mode",
                "mode": "sequential",
                "reason": "Sequential mode selected or optimal for task",
                "timestamp": datetime.utcnow().isoformat()
            })
            # Pass context to the service with conversation history
            logger.info(f"🎯 Passing {len(conversation_history)} conversation history items to agents")
            result = await service.execute_swarm_async(
                request=request,
                user_id="stream_user",
                callback_handler=streaming_callback,
                conversation_history=conversation_history
            )
        
        # Save final result
        session = await storage.get(session_id)
        if session:
            session["status"] = "complete"
            session["result"] = result
            await storage.set(session_id, session)
            
            # CRITICAL: Save ALL context including messages to Strands for future continuation
            logger.info(f"💾 Saving complete context for continued session {session_id}")
            
            # Build complete message history
            all_messages = []
            
            # Include previous messages from context
            if context.get("previous_messages"):
                all_messages.extend(context["previous_messages"])
            
            # Add the current task as a user message
            all_messages.append({
                "role": "user",
                "content": request.task
            })
            
            # Add the result as assistant message if available
            if result:
                all_messages.append({
                    "role": "assistant", 
                    "content": str(result)
                })
            
            context_to_save = {
                "messages": all_messages,  # Save complete message history
                "accumulated_context": session.get("accumulated", {}),
                "virtual_filesystem": session.get("virtual_filesystem", {}),
                "task_history": session.get("task_history", [])
            }
            
            strands_svc = get_strands_session_service()
            strands_svc.save_context(session_id, context_to_save)
            logger.info(f"✅ Saved {len(all_messages)} messages to persistent context")
            
        # Send completion event
        await storage.append_chunk(session_id, {
            "type": "done",
            "timestamp": datetime.utcnow().isoformat(),
            "metrics": session.get("metrics") if session else None
        })
        
    except Exception as e:
        logger.error(f"Swarm execution failed: {e}")
        await storage.append_chunk(session_id, {
            "type": "error",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        })