"""
Production-ready streaming endpoint with polling-based approach
Supports Redis for distributed session storage
"""
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks, Query
from fastapi.responses import JSONResponse, StreamingResponse, Response
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
from app.services.shared_state_service import SharedStateService
from fastapi.responses import StreamingResponse
import io
import zipfile
# from app.services.swarm_dag_adapter import swarm_dag_adapter, ExecutionMode  # Disabled DAG
from app.core.config import settings
from .streaming_optimizer import optimizer
from .tools_hub import router as tools_hub_router

router = APIRouter()
router.include_router(tools_hub_router, prefix="/tools", tags=["tools-hub"])
# Track live SSE sessions for hard cancellation
_live_sse_sessions: Dict[str, Dict[str, Any]] = {}
# Track service instances per session for precise stop routing
_services_by_session: Dict[str, Any] = {}
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
                
                # DEBUG: Log what was stored
                chunk_type = chunk.get("type", "unknown")
                chunk_agent = chunk.get("agent", "N/A")
                chunk_content_len = len(chunk.get("content", "")) if "content" in chunk else 0
                total_chunks = len(session["chunks"])
                logger.info(f"📦 Stored chunk #{total_chunks} for {session_id[:8]} - type: {chunk_type}, agent: {chunk_agent}, content: {chunk_content_len} chars")

                # Update metrics safely
                if "metrics" in session:
                    session["metrics"]["chunk_count"] = len(session["chunks"])
            else:
                logger.warning(f"❌ Session {session_id[:8]} not found when appending chunk type={chunk.get('type', 'unknown')}")
                logger.warning(f"❌ Available sessions: {list(self.sessions.keys())[:5]}")
        except Exception as e:
            logger.error(f"Error appending chunk to session {session_id}: {e}")

    async def get_chunks(self, session_id: str, offset: int = 0, limit: int = 100) -> List[Dict]:
        """Get chunks with pagination to prevent huge payloads"""
        try:
            session = self.sessions.get(session_id)
            if not session:
                logger.warning(f"Session {session_id[:8]} not found in get_chunks")
                logger.warning(f"Available sessions: {list(self.sessions.keys())[:5]}")  # Show first 5 session IDs
                return []

            if "chunks" not in session:
                logger.info(f"No chunks in session {session_id[:8]}")
                logger.info(f"Session keys: {list(session.keys())}")  # Debug what keys exist
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

            # CRITICAL FIX: Sort delta chunks by sequence number if present
            # This fixes the text formatting issue where tokens arrive out of order
            def sort_key(chunk):
                if chunk.get("type") == "delta" and "sequence" in chunk:
                    return (chunk["sequence"], chunk.get("timestamp", ""))
                return (0, chunk.get("timestamp", ""))
            
            result.sort(key=sort_key)

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
                import redis.asyncio as redis
                # Use the redis async API
                self.redis = redis.from_url(
                    settings.REDIS_URL or 'redis://localhost:6379',
                    encoding='utf-8',
                    decode_responses=True
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

        # Use the new aioredis 2.0 setex syntax
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

        # Update session last accessed AND chunk count
        session_key = f"stream_session:{session_id}"
        await self.redis.expire(session_key, 300)
        
        # Update chunk count in session metrics
        try:
            session_data = await self.get(session_id)
            if session_data and "metrics" in session_data:
                chunk_count = await self.redis.llen(chunks_key)
                session_data["metrics"]["chunk_count"] = chunk_count
                await self.set(session_id, session_data)
        except Exception as e:
            logger.warning(f"Failed to update chunk count for session {session_id}: {e}")

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


@router.post("/streaming/start/sse")
async def start_streaming_sse(
    payload: SwarmExecutionRequest,
    request: Request
):
    """
    Start a new streaming session using native Strands streaming with Server-Sent Events
    """
    # Use session_id from request if provided, otherwise generate new one
    session_id = payload.session_id if payload.session_id else str(uuid.uuid4())
    
    logger.info(f"🆕 SSE START: session_id={session_id}, task={payload.task[:50] if payload.task else ''}...")
    
    if not payload.task:
        raise HTTPException(status_code=400, detail="task is required")
    
    async def event_generator():
        try:
            # Get Strands session service for proper persistence
            strands_service = get_strands_session_service()
            
            # Initialize context for new session
            context = {
                "previous_messages": [],
                "virtual_filesystem": {},
                "accumulated_context": {},
                "task_history": [{
                    "task": payload.task,
                    "timestamp": datetime.utcnow().isoformat()
                }]
            }
            
            # Save initial context
            strands_service.save_context(session_id, context)

            # Initialize shared state and append first task
            try:
                shared_service = SharedStateService()
                shared_service.ensure_initialized(session_id)
                if payload.task:
                    shared_service.append_task_history(session_id, payload.task)
            except Exception as e:
                logger.warning(f"Shared state init failed: {e}")
            
            # Create event queue for async communication
            event_queue = asyncio.Queue()
            
            # Streaming callback
            async def streaming_callback(**kwargs):
                event_type = kwargs.get("type", "unknown")
                agent = kwargs.get("agent")
                data = kwargs.get("data", {})
                
                event = {
                    "type": event_type,
                    "agent": agent,
                    "data": data,
                    "timestamp": datetime.utcnow().isoformat()
                }
                
                await event_queue.put(event)
            
            # Determine swarm engine
            swarm_cfg = (payload.context or {}).get('swarm_config', {}) if hasattr(payload, 'context') else {}
            engine = (swarm_cfg.get('engine') or '').lower()

            # Send start event with session ID
            yield f"data: {json.dumps({'type': 'session_start', 'session_id': session_id, 'timestamp': datetime.utcnow().isoformat()})}\n\n"

            if False and engine in ('event', 'graph', 'event_driven'):
                # Use event-driven streaming swarm (supports handoffs)
                logger.info(f"🧠 Using event-driven swarm engine for session {session_id}")
                from app.services.streaming_swarm_service import StreamingSwarmService
                ev_service = StreamingSwarmService()

                # Build agent configs map if provided
                agent_configs = None
                if payload.agents:
                    try:
                        agent_configs = {
                            a.name: {
                                'system_prompt': a.system_prompt,
                                'tools': getattr(a, 'tools', []) or [],
                                'model': getattr(a, 'model', 'gpt-4o-mini') or 'gpt-4o-mini',
                                'temperature': getattr(a, 'temperature', 0.7) or 0.7,
                                'max_tokens': getattr(a, 'max_tokens', 4000) or 4000
                            } for a in payload.agents
                        }
                    except Exception as e:
                        logger.warning(f"Failed to map agent configs: {e}")

                async for ev in ev_service.execute_streaming_swarm(
                    execution_id=session_id,
                    task=payload.task,
                    agent_configs=agent_configs,
                    max_handoffs=payload.max_handoffs or 10,
                    max_iterations=payload.max_iterations or 20,
                    conversation_history=[]
                ):
                    # Forward events as SSE
                    yield f"data: {json.dumps(ev)}\n\n"
                return
            else:
                # Default: EnhancedSwarmService (sequential/parallel)
                from app.services.enhanced_swarm_service import EnhancedSwarmService
                service = EnhancedSwarmService()
                # Expose globally for stop endpoint and map session->execution
                import app.api.v1.endpoints.streaming as streaming_module
                streaming_module._global_swarm_service = service
                streaming_module._services_by_session[session_id] = service
                if not hasattr(streaming_module, '_session_execution_map'):
                    streaming_module._session_execution_map = {}
                streaming_module._session_execution_map[session_id] = payload.execution_id or session_id

                logger.info(f"🚀 Starting native Strands streaming for new session {session_id}")

                # Start swarm execution
                async def run_swarm():
                    try:
                        payload.execution_id = session_id
                        logger.info(f"🔗 SSE: Set request.execution_id to {session_id} for session synchronization")

                        result = await service.execute_swarm_async(
                            request=payload,
                            user_id="stream_user",
                            callback_handler=streaming_callback,
                            conversation_history=[]
                        )
                        result_content = ""
                        if result:
                            if hasattr(result, 'result'):
                                result_content = result.result
                            elif hasattr(result, 'message'):
                                result_content = result.message
                            else:
                                result_content = str(result)

                        await event_queue.put({
                            'type': 'session_complete',
                            'result': result_content,
                            'timestamp': datetime.utcnow().isoformat()
                        })
                    except Exception as e:
                        logger.error(f"Swarm execution error: {e}")
                        await event_queue.put({
                            'type': 'error',
                            'error': str(e),
                            'timestamp': datetime.utcnow().isoformat()
                        })
                    finally:
                        await event_queue.put(None)
            
            # Start execution
            swarm_task = asyncio.create_task(run_swarm())
            # Register live SSE session for stop/cancel support
            import app.api.v1.endpoints.streaming as streaming_module
            streaming_module._live_sse_sessions[session_id] = {
                "task": swarm_task,
                "queue": event_queue
            }
            
            # Stream events
            while True:
                try:
                    # Stop if client disconnected
                    if await request.is_disconnected():
                        try:
                            await service.stop_execution(session_id)
                        except Exception:
                            pass
                        break
                    event = await asyncio.wait_for(event_queue.get(), timeout=1.0)
                    if event is None:
                        break
                    # Update shared state on agent_completed
                    try:
                        if event.get('type') == 'agent_completed' and event.get('agent'):
                            output = ''
                            data = event.get('data') or {}
                            if isinstance(data, dict):
                                output = data.get('output') or ''
                            if output:
                                SharedStateService().set_agent_output(session_id, event['agent'], output)
                    except Exception as e:
                        logger.warning(f"Shared state update failed on agent_completed: {e}")
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'type': 'keepalive', 'timestamp': datetime.utcnow().isoformat()})}\n\n"
                    if swarm_task.done():
                        break
                except asyncio.CancelledError:
                    try:
                        await service.stop_execution(session_id)
                    except Exception:
                        pass
                    break
            
        except Exception as e:
            logger.error(f"SSE streaming error: {e}")
            error_event = {
                "type": "error",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
            yield f"data: {json.dumps(error_event)}\n\n"
        finally:
            # Cleanup live session registry
            import app.api.v1.endpoints.streaming as streaming_module
            if session_id in streaming_module._live_sse_sessions:
                streaming_module._live_sse_sessions.pop(session_id, None)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            # Critical: disable proxy/app buffering and compression for real-time SSE
            "X-Accel-Buffering": "no",
            "Content-Encoding": "identity",
        }
    )


@router.post("/streaming/start")
async def start_streaming(
    request: SwarmExecutionRequest,
    background_tasks: BackgroundTasks
):
    """
    Start a new streaming session
    Returns session ID for polling
    """

    # Use provided session_id if available, otherwise generate new one
    session_id = request.session_id if request.session_id else str(uuid.uuid4())
    
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

    # Temporary buffer for ordering chunks per agent
    agent_chunk_buffers = {}
    agent_expected_sequence = {}
    
    # Callback handler for streaming
    async def stream_callback(**kwargs):
        """Process streaming events"""
        try:
            event_type = kwargs.get("type", "unknown")
            agent = kwargs.get("agent")
            data = kwargs.get("data", {})
            
            # Only log important events, not every token
            if event_type not in ["text_generation"]:
                logger.info(f"🔄 STREAM CALLBACK: type={event_type}, agent={agent}")

            event = None

            if event_type == "agent_started" and agent:
                event = {
                    "type": "agent_start",
                    "agent": agent,
                    "timestamp": datetime.utcnow().isoformat()
                }
                # Attach parent relationship if available from service
                try:
                    import app.api.v1.endpoints.streaming as streaming_module
                    svc = getattr(streaming_module, '_services_by_session', {}).get(session_id)
                    if svc and isinstance(getattr(svc, 'active_executions', None), dict):
                        parent_map = svc.active_executions.get(session_id, {}).get('parent_map', {})
                        parent = parent_map.get(agent)
                        if parent:
                            event['parent'] = parent
                except Exception:
                    pass

                # Update metrics and initialize accumulator
                session = await storage.get(session_id)
                if session:
                    if "metrics" in session:
                        session["metrics"]["agent_count"] += 1
                    # Initialize accumulator for this agent
                    accumulated = session.get("accumulated", {})
                    accumulated[agent] = ""
                    session["accumulated"] = accumulated
                    await storage.set(session_id, session)

            elif event_type == "text_generation" and agent:
                chunk = data.get("chunk", "") or data.get("text", "")
                sequence = data.get("sequence")
                
                if chunk and sequence is not None:
                    # CRITICAL FIX: Buffer chunks to ensure proper ordering
                    if agent not in agent_chunk_buffers:
                        agent_chunk_buffers[agent] = {}
                        agent_expected_sequence[agent] = 0  # Start from 0, not 1
                    
                    # Store chunk in buffer with sequence number
                    chunk_event = {
                        "type": "delta",
                        "agent": agent,
                        "content": chunk,
                        "sequence": sequence,
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    
                    if data.get("is_tool_result"):
                        chunk_event["is_tool_result"] = True
                    
                    agent_chunk_buffers[agent][sequence] = chunk_event
                    
                    # Flush consecutive chunks in order
                    expected_seq = agent_expected_sequence[agent]
                    while expected_seq in agent_chunk_buffers[agent]:
                        ordered_event = agent_chunk_buffers[agent].pop(expected_seq)
                        await storage.append_chunk(session_id, ordered_event)
                        
                        # Also accumulate the text
                        session = await storage.get(session_id)
                        if session:
                            accumulated = session.get("accumulated", {})
                            if agent not in accumulated:
                                accumulated[agent] = ""
                            accumulated[agent] += ordered_event.get("content", "")
                            session["accumulated"] = accumulated
                            await storage.set(session_id, session)
                        
                        expected_seq += 1
                    
                    agent_expected_sequence[agent] = expected_seq
                    return  # Return immediately to prevent any delay
                
                elif chunk:
                    # Fallback for chunks without sequence numbers
                    event = {
                        "type": "delta", 
                        "agent": agent,
                        "content": chunk,
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    if data.get("is_tool_result"):
                        event["is_tool_result"] = True
                    
                    # Also accumulate text for the agent
                    session = await storage.get(session_id)
                    if session:
                        accumulated = session.get("accumulated", {})
                        if agent not in accumulated:
                            accumulated[agent] = ""
                        accumulated[agent] += chunk
                        session["accumulated"] = accumulated
                        await storage.set(session_id, session)
                    
                    await storage.append_chunk(session_id, event)
                    return

            elif event_type == "agent_completed" and agent:
                # Flush any remaining buffered chunks for this agent
                if agent in agent_chunk_buffers:
                    remaining_sequences = sorted(agent_chunk_buffers[agent].keys())
                    for seq in remaining_sequences:
                        remaining_event = agent_chunk_buffers[agent].pop(seq)
                        await storage.append_chunk(session_id, remaining_event)
                    # Clean up agent buffers
                    del agent_chunk_buffers[agent]
                    if agent in agent_expected_sequence:
                        del agent_expected_sequence[agent]

                # CRITICAL FIX: First try to get output from the event data
                # The coordinator sends the complete output in data.output
                accumulated_text = data.get("output", "")
                
                # If no output in event, fall back to accumulated text from session
                if not accumulated_text:
                    session = await storage.get(session_id)
                    if session and "accumulated" in session:
                        accumulated_text = session["accumulated"].get(agent, "")
                
                logger.info(f"✅ Agent {agent} completed with {len(accumulated_text)} chars")

                event = {
                    "type": "agent_done",
                    "agent": agent,
                    "content": accumulated_text,
                    "tokens": data.get("tokens", 0),
                    "timestamp": datetime.utcnow().isoformat()
                }
                # Attach parent if known
                try:
                    import app.api.v1.endpoints.streaming as streaming_module
                    svc = getattr(streaming_module, '_services_by_session', {}).get(session_id)
                    if svc and isinstance(getattr(svc, 'active_executions', None), dict):
                        parent_map = svc.active_executions.get(session_id, {}).get('parent_map', {})
                        parent = parent_map.get(agent)
                        if parent:
                            event['parent'] = parent
                except Exception:
                    pass
                
                # CRITICAL FIX: Append agent_done event to storage immediately
                # First verify session exists
                session_check = await storage.get(session_id)
                if session_check:
                    await storage.append_chunk(session_id, event)
                    logger.info(f"📤 Appended agent_done event to storage for {agent} with {len(accumulated_text)} chars")
                    
                    # Verify it was actually stored
                    updated_session = await storage.get(session_id)
                    if updated_session and "chunks" in updated_session:
                        logger.info(f"✅ Verified: Session now has {len(updated_session['chunks'])} total chunks")
                else:
                    logger.error(f"❌ CRITICAL: Session {session_id} not found when trying to append agent_done event!")
                
                # CRITICAL: Save agent message to database for persistence
                if accumulated_text and len(accumulated_text.strip()) > 0:
                    try:
                        from app.services.chat_service import ChatService
                        from app.core.database import get_async_session
                        from app.schemas.chat import ChatMessageCreate, ChatSessionCreate
                        
                        async with get_async_session() as db:
                            chat_service = ChatService(db)
                            user_id = "default_user"  # TODO: Get actual user_id from session
                            
                            # First ensure session exists in database
                            existing_session = await chat_service.get_session(session_id, user_id)
                            if not existing_session:
                                # Create session if it doesn't exist
                                session_data = ChatSessionCreate(
                                    session_id=session_id,
                                    title=f"Streaming Session {session_id[:8]}",
                                    description="Auto-created streaming session"
                                )
                                await chat_service.create_session(user_id, session_data)
                                logger.info(f"📋 Created database session for {session_id}")
                            
                            message_data = ChatMessageCreate(
                                role="assistant",
                                content=accumulated_text,
                                agent_name=agent,
                                message_type="text"
                            )
                            
                            await chat_service.add_message(
                                session_id, 
                                user_id,
                                message_data
                            )
                            logger.info(f"💾 Saved {agent} message to database ({len(accumulated_text)} chars)")
                    except Exception as e:
                        logger.error(f"Failed to save {agent} message to database: {e}")

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

            elif event_type == "ai_decision":
                # Handle AI decision events from event_aware_agent.py
                logger.info(f"🧠 AI DECISION EVENT: agent={agent}, data={data}")
                event = {
                    "type": "ai_decision",
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
        logger.info(f"🚀 BACKGROUND TASK STARTED for session {session_id}")
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
            
            # Use appropriate service based on execution mode
            if request.execution_mode == "event_driven":
                # Use CONTROLLED event-driven service with user-configurable limits
                from app.services.controlled_swarm_service import ControlledSwarmService
                
                # Extract user configuration from request context
                user_config = {}
                if hasattr(request, 'context') and request.context:
                    swarm_config = request.context.get('swarm_config', {})
                    user_config = {
                        "max_concurrent_agents": swarm_config.get("max_concurrent_agents", 3),
                        "max_total_agents": swarm_config.get("max_total_agents", 8),
                        "max_execution_time": swarm_config.get("max_execution_time", 180),
                        "max_agent_runtime": swarm_config.get("max_agent_runtime", 60)
                    }
                # Extract tool preferences if provided
                tool_preferences = {}
                if hasattr(request, 'context') and request.context:
                    tool_preferences = request.context.get('tool_preferences', {}) or {}

                service = ControlledSwarmService(config=user_config)
                # Attach tool preferences to the service so agents can adapt
                try:
                    service.user_tool_preferences = {
                        'selected_tools': list(tool_preferences.get('selected_tools', []) or []),
                        'restrict_to_selected': bool(tool_preferences.get('restrict_to_selected', False)),
                    }
                except Exception:
                    service.user_tool_preferences = {'selected_tools': [], 'restrict_to_selected': False}
                # Store service globally so stop endpoint can access it
                import app.api.v1.endpoints.streaming as streaming_module
                streaming_module._global_swarm_service = service
                # Also keep per-session reference for better control
                if not hasattr(streaming_module, '_services_by_session'):
                    streaming_module._services_by_session = {}
                streaming_module._services_by_session[session_id] = service
                # Store mapping between session_id and execution_id for stop functionality
                if not hasattr(streaming_module, '_session_execution_map'):
                    streaming_module._session_execution_map = {}
                streaming_module._session_execution_map[session_id] = request.execution_id or session_id
                logger.info(f"🎯 Using CONTROLLED event-driven swarm with user config: {user_config}")
            elif hasattr(settings, 'USE_REALTIME_STREAMING') and settings.USE_REALTIME_STREAMING:
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
            
            # Execute based on mode
            logger.info(f"🔍 DEBUG: Background task execution_mode = '{request.execution_mode}'")
            if request.execution_mode == "event_driven":
                # Event-driven execution in background task - EXECUTE HERE
                logger.info("🎯 Executing event-driven swarm in background task")
                
                # CRITICAL: Set session_id on request for human-loop compatibility
                request.session_id = session_id
                # CRITICAL FIX: Set execution_id to session_id for proper session management
                request.execution_id = session_id
                logger.info(f"🔗 Set request.session_id and execution_id to {session_id} for session synchronization")
                
                result = await service.execute_swarm_async(
                    request=request,
                    user_id="stream_user",
                    callback_handler=stream_callback
                )
            elif use_dag:  # This will never execute now
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
                    # CRITICAL FIX: Set execution_id to session_id for proper session management
                    request.execution_id = session_id
                    logger.info(f"🔗 Set request.execution_id to {session_id} for DAG fallback")
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
                
                # ALWAYS start with fresh agents - let the service create appropriate ones for each task
                existing_agents = None
                conversation_history = []
                
                # Extract conversation history if available (for context, not agent reuse)
                # IMPORTANT: Use Strands-persisted messages, not accumulated map
                try:
                    strands_service = get_strands_session_service()
                    saved_ctx = strands_service.get_context(session_id) or {}
                    msgs = saved_ctx.get("messages", [])
                    if isinstance(msgs, list):
                        conversation_history = msgs
                        logger.info(f"📖 Using {len(conversation_history)} persisted messages for context")
                    else:
                        conversation_history = []
                except Exception as e:
                    logger.warning(f"Could not load persisted messages for context: {e}")
                
                logger.info(f"🆕 Starting with fresh agents - service will create appropriate ones")
                
                # CRITICAL FIX: Set execution_id to session_id for proper session management
                request.execution_id = session_id
                logger.info(f"🔗 Set request.execution_id to {session_id} for session synchronization")
                
                # Expose service globally so stop endpoint can address it
                import app.api.v1.endpoints.streaming as streaming_module
                streaming_module._global_swarm_service = service
                if not hasattr(streaming_module, '_session_execution_map'):
                    streaming_module._session_execution_map = {}
                streaming_module._session_execution_map[session_id] = request.execution_id or session_id

                # Include current task as the latest user message for immediate context
                conv_plus_current = list(conversation_history) + ([{"role": "user", "content": request.task}] if request.task else [])
                result = await service.execute_swarm_async(
                    request=request,
                    user_id="stream_user",
                    callback_handler=stream_callback,
                    conversation_history=conv_plus_current,
                    existing_agents=existing_agents
                )

            # No buffering needed - all chunks sent immediately

            # Update status and store result
            session = await storage.get(session_id)
            if session:
                session["status"] = "complete"
                # Serialize the result object properly
                if result:
                    if hasattr(result, 'dict'):
                        session["result"] = result.dict()
                    elif hasattr(result, 'model_dump'):
                        session["result"] = result.model_dump()
                    else:
                        session["result"] = str(result)
                else:
                    session["result"] = None
                session["metrics"]["end_time"] = datetime.utcnow().isoformat()
                await storage.set(session_id, session)
                
                # CRITICAL: Save messages and context to Strands for future continuation
                logger.info(f"💾 Saving messages and context for session {session_id}")
                
                # Build complete message history
                all_messages = []
                
                # Add the user's task message
                all_messages.append({
                    "role": "user",
                    "content": request.task
                })
                
                # Add each finalized agent output in order of completion
                try:
                    chunks = await storage.get_chunks(session_id, offset=0, limit=2000)
                except Exception:
                    chunks = []
                # Collect agent_done events in order
                for ch in chunks:
                    if ch.get("type") in ("agent_done", "agent_completed"):
                        content = ch.get("content") or (ch.get("data", {}) or {}).get("output")
                        if content and isinstance(content, str) and content.strip():
                            all_messages.append({
                                "role": "assistant",
                                "content": content
                            })
                
                # If we didn't capture any assistant content via chunks, fallback to single assistant message
                if not any(m.get('role') == 'assistant' for m in all_messages):
                    assistant_content = ""
                    # First check result object
                    if result:
                        if hasattr(result, 'result'):
                            assistant_content = str(result.result)
                        elif hasattr(result, 'output'):
                            assistant_content = str(result.output)
                        elif hasattr(result, 'content'):
                            assistant_content = str(result.content)
                        else:
                            assistant_content = str(result)
                    # If no result, check accumulated content
                    if not assistant_content and session.get("accumulated"):
                        accumulated = session["accumulated"]
                        if "coordinator" in accumulated:
                            assistant_content = accumulated["coordinator"]
                        else:
                            for agent_name, content in accumulated.items():
                                if content and isinstance(content, str) and len(content.strip()) > 0:
                                    assistant_content = content
                                    break
                    # If still empty, aggregate text_generation chunks
                    if not assistant_content and chunks:
                        try:
                            for ch in chunks:
                                if ch.get("type") == "text_generation" and ch.get("content"):
                                    assistant_content += ch.get("content")
                            assistant_content = assistant_content.strip()
                        except Exception:
                            pass
                    if assistant_content:
                        all_messages.append({
                            "role": "assistant",
                            "content": assistant_content
                        })
                
                # Save messages to database
                try:
                    from app.core.database import AsyncSessionLocal
                    from app.services.chat_service import ChatService
                    from app.schemas.chat import ChatMessageCreate, ChatSessionCreate
                    
                    async with AsyncSessionLocal() as db:
                        chat_service = ChatService(db)
                        
                        # First ensure the session exists in the database
                        existing_session = await chat_service.get_session(session_id, "default_user")
                        if not existing_session:
                            # Create the session if it doesn't exist
                            session_data = ChatSessionCreate(
                                session_id=session_id,
                                title=request.task[:50] if request.task else "New Chat",
                                max_handoffs=request.max_handoffs or 20,
                                max_iterations=request.max_iterations or 20
                            )
                            await chat_service.create_session("default_user", session_data)
                            logger.info(f"Created chat session {session_id} in database")
                        
                        # REMOVED: Message saving - frontend handles this to avoid duplicates
                        # Frontend saves messages through the chat API when:
                        # 1. User sends a message (saveMessageToSession)
                        # 2. Assistant message is finalized (finalizeStreamingMessage)
                        logger.info(f"📝 Skipping backend message save - frontend handles persistence")
                except Exception as e:
                    logger.error(f"Failed to save messages to database: {e}")
                
                context_to_save = {
                    "messages": all_messages,  # CRITICAL: Save messages for context
                    "accumulated_context": session.get("accumulated", {}),
                    "virtual_filesystem": session.get("virtual_filesystem", {}),
                    "task_history": session.get("task_history", [])
                }
                # Avoid UnboundLocalError by fetching service at use-site
                get_strands_session_service().save_context(session_id, context_to_save)
                logger.info(f"✅ Saved {len(all_messages)} messages to Strands session")

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
    logger.info(f"🔥 Adding background task for session {session_id}")
    background_tasks.add_task(run_execution)

    return JSONResponse({
        "session_id": session_id,
        "status": "started",
        "poll_url": f"/api/v1/streaming/poll/{session_id}"
    })


@router.post("/streaming/stop/{session_id}")
async def stop_execution(session_id: str):
    """Stop a running swarm execution (idempotent and resilient)."""
    try:
        import app.api.v1.endpoints.streaming as streaming_module

        # Best-effort: mark session as stopped if present in storage
        stopped_any = False
        try:
            session = await storage.get(session_id)
            if session:
                session["status"] = "stopped"
                await storage.set(session_id, session)
                stopped_any = True
        except Exception as e:
            logger.debug(f"Stop: could not update storage for {session_id}: {e}")

        # Determine execution_id mapping (falls back to session_id)
        execution_id = session_id
        if hasattr(streaming_module, '_session_execution_map'):
            execution_id = streaming_module._session_execution_map.get(session_id, session_id)

        # Signal the active service if available (prefer per-session service)
        try:
            svc = None
            if hasattr(streaming_module, '_services_by_session'):
                svc = streaming_module._services_by_session.get(session_id)
            if not svc and hasattr(streaming_module, '_global_swarm_service') and streaming_module._global_swarm_service:
                svc = streaming_module._global_swarm_service
            if svc:
                stopped = svc.stop_execution(execution_id)
                try:
                    import inspect
                    if inspect.isawaitable(stopped):
                        stopped = await stopped
                except Exception:
                    pass
                stopped_any = stopped_any or bool(stopped)
                logger.info(f"🛑 Stop propagated to service for execution {execution_id} (session {session_id}) - success: {stopped}")
            else:
                logger.info(f"🛑 No global service instance found for execution {execution_id}")
        except Exception as svc_err:
            logger.error(f"Stop: error stopping service for {execution_id}: {svc_err}")

        # Cancel any live SSE stream
        try:
            live = getattr(streaming_module, '_live_sse_sessions', {}).get(session_id)
            if live and live.get("task"):
                try:
                    live["task"].cancel()
                    stopped_any = True
                except Exception:
                    pass
            if live and live.get("queue"):
                try:
                    await live["queue"].put(None)
                except Exception:
                    pass
        except Exception as live_err:
            logger.debug(f"Stop: live SSE cleanup issue for {session_id}: {live_err}")

        # Append stop chunk if session exists
        try:
            session = await storage.get(session_id)
            if session:
                await storage.append_chunk(session_id, {
                    "type": "execution_stopped",
                    "message": "Execution stopped by user",
                    "timestamp": datetime.utcnow().isoformat()
                })
        except Exception:
            pass

        logger.info(f"🛑 Stop completed for session {session_id}; any_effect={stopped_any}")
        return {"status": "stopped", "session_id": session_id, "any_effect": stopped_any}

    except Exception as e:
        logger.error(f"Error stopping execution: {e}")
        # Return 200 with graceful message to avoid UI errors, but include detail
        return JSONResponse({"status": "stopped", "session_id": session_id, "error": str(e)}, status_code=200)


@router.post("/streaming/emergency-stop/{session_id}")
async def emergency_stop(session_id: str):
    """Emergency stop: fast, idempotent, cancels SSE + flags execution.

    This endpoint returns 202 immediately after scheduling stop operations,
    without waiting for storage or service confirmations.
    """
    try:
        import app.api.v1.endpoints.streaming as streaming_module
        # Fire-and-forget: mark storage (best-effort) and cancel SSE
        async def _do_stop():
            try:
                sess = await storage.get(session_id)
                if sess:
                    sess["status"] = "stopped"
                    await storage.set(session_id, sess)
            except Exception:
                pass
            # Map session->execution
            execution_id = session_id
            if hasattr(streaming_module, '_session_execution_map'):
                execution_id = streaming_module._session_execution_map.get(session_id, session_id)
            # Signal any known services
            try:
                if hasattr(streaming_module, '_global_swarm_service') and streaming_module._global_swarm_service:
                    svc = streaming_module._global_swarm_service
                    res = svc.stop_execution(execution_id)
                    try:
                        import inspect
                        if inspect.isawaitable(res):
                            await res
                    except Exception:
                        pass
            except Exception:
                pass
            # Cancel live SSE session if present
            try:
                live = getattr(streaming_module, '_live_sse_sessions', {}).get(session_id)
                if live and live.get("task"):
                    try:
                        live["task"].cancel()
                    except Exception:
                        pass
                if live and live.get("queue"):
                    try:
                        await live["queue"].put(None)
                    except Exception:
                        pass
            except Exception:
                pass
        # Schedule and return
        asyncio.create_task(_do_stop())
        return JSONResponse({"status": "stop_requested", "session_id": session_id}, status_code=202)
    except Exception as e:
        # Still return 202 to keep UI responsive
        return JSONResponse({"status": "stop_requested", "session_id": session_id, "error": str(e)}, status_code=202)


@router.post("/streaming/stop-agent/{session_id}/{agent_name}")
async def stop_agent(session_id: str, agent_name: str):
    """Stop a single agent within an active execution"""
    try:
        import app.api.v1.endpoints.streaming as streaming_module
        from app.services.event_driven_strands_swarm import EventDrivenStrandsSwarm
        execution_id = session_id
        if hasattr(streaming_module, '_session_execution_map'):
            execution_id = streaming_module._session_execution_map.get(session_id, session_id)
        if hasattr(streaming_module, '_global_swarm_service'):
            svc = streaming_module._global_swarm_service
            ok = hasattr(svc, 'stop_agent') and svc.stop_agent(execution_id, agent_name)
            if ok:
                return {"status": "agent_stop_requested", "agent": agent_name}
        raise HTTPException(status_code=404, detail="No active service")
    except Exception as e:
        logger.error(f"Error stopping agent: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/streaming/timeout-agent/{session_id}/{agent_name}")
async def set_agent_timeout(session_id: str, agent_name: str, request: Dict[str, Any]):
    """Set/override per-agent timeout (seconds) for an active execution"""
    try:
        seconds = int(request.get('seconds', 60))
        import app.api.v1.endpoints.streaming as streaming_module
        execution_id = session_id
        if hasattr(streaming_module, '_session_execution_map'):
            execution_id = streaming_module._session_execution_map.get(session_id, session_id)
        if hasattr(streaming_module, '_global_swarm_service'):
            svc = streaming_module._global_swarm_service
            if hasattr(svc, 'set_agent_timeout'):
                ok = svc.set_agent_timeout(execution_id, agent_name, seconds)
                if ok:
                    return {"status": "timeout_set", "agent": agent_name, "seconds": seconds}
        raise HTTPException(status_code=404, detail="No active service")
    except Exception as e:
        logger.error(f"Error setting agent timeout: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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


@router.get("/sessions/{session_id}/export")
async def export_session(session_id: str):
    """Export a session snapshot as a ZIP containing:
    - report.html (print-friendly)
    - data.json (raw snapshot)
    - artifacts/ (virtual filesystem files)
    - chunks.json (SSE timeline)
    """
    try:
        strands = get_strands_session_service()
        shared = SharedStateService()
        try:
            ctx = strands.get_context(session_id) or {}
        except Exception:
            ctx = {}
        try:
            vfs = strands.get_virtual_filesystem(session_id) or {}
            if not isinstance(vfs, dict):
                vfs = {}
        except Exception:
            vfs = {}
        try:
            shared_ctx = shared.get_all(session_id) or {}
        except Exception:
            shared_ctx = {}
        try:
            session = await storage.get(session_id) or {}
        except Exception:
            session = {}
        try:
            chunks = await storage.get_chunks(session_id, offset=0, limit=5000)
            if not isinstance(chunks, list):
                chunks = []
        except Exception:
            chunks = []

        messages = ctx.get("messages", []) if isinstance(ctx, dict) else []
        agent_outputs = (shared_ctx.get("shared_context", {}) or {}).get("agent_outputs", {})
        task_history = (shared_ctx.get("shared_context", {}) or {}).get("task_history", [])

        # Build enhanced HTML report with modern design and better formatting
        def esc(s: str) -> str:
            """Escape HTML special characters for safe rendering"""
            try:
                text = str(s or "")
                return (text.replace("&", "&amp;")
                           .replace("<", "&lt;")
                           .replace(">", "&gt;")
                           .replace('"', "&quot;")
                           .replace("'", "&#39;"))
            except Exception:
                return str(s)
        
        def format_markdown(text: str) -> str:
            """Convert basic markdown to HTML for better formatting"""
            if not text:
                return ""
            
            # Handle code blocks
            parts = []
            code_blocks = text.split("```")
            for i, part in enumerate(code_blocks):
                if i % 2 == 1:  # Inside code block
                    lines = part.split("\n", 1)
                    if len(lines) > 1 and lines[0].strip():
                        lang = esc(lines[0].strip())
                        code = esc(lines[1])
                        parts.append(f'<pre class="code-block" data-lang="{lang}"><code>{code}</code></pre>')
                    else:
                        parts.append(f'<pre class="code-block"><code>{esc(part)}</code></pre>')
                else:  # Outside code block
                    formatted = esc(part)
                    # Convert **bold** text
                    import re
                    formatted = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', formatted)
                    # Convert line breaks
                    formatted = formatted.replace("\n", "<br>")
                    parts.append(formatted)
            
            return "".join(parts)

        html_parts = []
        # Modern HTML template with enhanced styling and better UX
        html_parts.append(f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Swarm Session Report - {esc(session_id[:8])}</title>
    <style>
        :root {{
            --primary: #6366f1;
            --primary-light: #818cf8;
            --primary-dark: #4f46e5;
            --secondary: #06b6d4;
            --secondary-light: #22d3ee;
            --success: #10b981;
            --warning: #f59e0b;
            --danger: #ef4444;
            --dark: #1e293b;
            --dark-lighter: #334155;
            --dark-card: #0f172a;
            --text: #f1f5f9;
            --text-muted: #94a3b8;
            --border: #334155;
            --code-bg: #0f172a;
        }}
        
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: var(--text);
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            min-height: 100vh;
        }}
        
        .container {{
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }}
        
        header {{
            background: rgba(15, 23, 42, 0.95);
            backdrop-filter: blur(10px);
            border-bottom: 1px solid var(--border);
            padding: 2rem 0;
            margin-bottom: 2rem;
            position: sticky;
            top: 0;
            z-index: 100;
        }}
        
        .header-content {{
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 2rem;
            display: flex;
            align-items: center;
            gap: 1.5rem;
        }}
        
        .logo {{
            width: 48px;
            height: 48px;
            background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 24px;
            color: white;
            box-shadow: 0 4px 24px rgba(99, 102, 241, 0.3);
        }}
        
        .header-text h1 {{
            font-size: 1.875rem;
            font-weight: 700;
            background: linear-gradient(135deg, var(--primary-light) 0%, var(--secondary-light) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }}
        
        .header-text p {{
            color: var(--text-muted);
            font-size: 0.875rem;
            margin-top: 0.25rem;
        }}
        
        .stats-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }}
        
        .stat-card {{
            background: var(--dark-card);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 1.5rem;
            transition: all 0.3s ease;
        }}
        
        .stat-card:hover {{
            transform: translateY(-2px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            border-color: var(--primary);
        }}
        
        .stat-label {{
            font-size: 0.75rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 0.5rem;
        }}
        
        .stat-value {{
            font-size: 2rem;
            font-weight: 700;
            color: var(--primary-light);
        }}
        
        .stat-value.small {{
            font-size: 1rem;
            word-break: break-all;
        }}
        
        .card {{
            background: var(--dark-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 2rem;
            margin-bottom: 1.5rem;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        }}
        
        .card h2 {{
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 1.5rem;
            color: var(--text);
            border-bottom: 2px solid var(--primary);
            padding-bottom: 0.5rem;
        }}
        
        .agent-chips {{
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
        }}
        
        .chip {{
            background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 24px;
            font-size: 0.875rem;
            font-weight: 500;
            transition: transform 0.2s;
        }}
        
        .chip:hover {{
            transform: scale(1.05);
        }}
        
        .message-bubble {{
            background: var(--dark-lighter);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 1rem 1.5rem;
            margin-bottom: 1rem;
            position: relative;
        }}
        
        .message-bubble.user {{
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(79, 70, 229, 0.2) 100%);
            border-left: 3px solid var(--primary);
            margin-left: 2rem;
        }}
        
        .message-bubble.assistant {{
            background: var(--dark-card);
            margin-right: 2rem;
            border-left: 3px solid var(--secondary);
        }}
        
        .message-bubble.system {{
            background: rgba(245, 158, 11, 0.1);
            border-left: 3px solid var(--warning);
            font-size: 0.875rem;
        }}
        
        .message-role {{
            font-size: 0.75rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 0.5rem;
            font-weight: 600;
        }}
        
        .message-content {{
            color: var(--text);
            word-wrap: break-word;
        }}
        
        .code-block {{
            background: var(--code-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 1rem;
            margin: 1rem 0;
            overflow-x: auto;
            position: relative;
        }}
        
        .code-block[data-lang]:not([data-lang=""])::before {{
            content: attr(data-lang);
            position: absolute;
            top: 0;
            right: 0;
            background: var(--primary);
            color: white;
            padding: 0.25rem 0.75rem;
            border-radius: 0 8px 0 8px;
            font-size: 0.75rem;
            text-transform: uppercase;
        }}
        
        .code-block code {{
            color: #e2e8f0;
            font-family: 'Cascadia Code', 'Fira Code', 'Monaco', 'Courier New', monospace;
            font-size: 0.875rem;
            line-height: 1.5;
        }}
        
        table {{
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            border: 1px solid var(--border);
            border-radius: 8px;
            overflow: hidden;
            margin: 1rem 0;
        }}
        
        th {{
            background: var(--primary);
            color: white;
            padding: 1rem;
            text-align: left;
            font-weight: 600;
            font-size: 0.875rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }}
        
        td {{
            padding: 1rem;
            border-top: 1px solid var(--border);
            color: var(--text);
            vertical-align: top;
        }}
        
        tr:hover td {{
            background: rgba(99, 102, 241, 0.1);
        }}
        
        .timeline-item {{
            display: flex;
            gap: 1rem;
            padding: 1rem;
            border-bottom: 1px solid var(--border);
        }}
        
        .timeline-item:last-child {{
            border-bottom: none;
        }}
        
        .timeline-badge {{
            background: var(--primary);
            color: white;
            padding: 0.5rem;
            border-radius: 8px;
            font-size: 0.75rem;
            font-weight: 600;
            height: fit-content;
            min-width: 80px;
            text-align: center;
        }}
        
        .agent-output {{
            background: var(--dark-lighter);
            border-left: 3px solid var(--secondary);
            padding: 1.5rem;
            margin-bottom: 1.5rem;
            border-radius: 8px;
        }}
        
        .agent-name {{
            background: linear-gradient(135deg, var(--secondary) 0%, var(--secondary-light) 100%);
            color: white;
            padding: 0.25rem 0.75rem;
            border-radius: 16px;
            font-size: 0.875rem;
            font-weight: 600;
            display: inline-block;
            margin-bottom: 1rem;
        }}
        
        .empty-state {{
            text-align: center;
            padding: 3rem;
            color: var(--text-muted);
            font-style: italic;
        }}
        
        .task-item {{
            background: var(--dark-lighter);
            border-left: 3px solid var(--success);
            padding: 1rem;
            margin-bottom: 0.75rem;
            border-radius: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        
        .task-text {{
            font-family: 'Cascadia Code', 'Fira Code', monospace;
            color: var(--text);
        }}
        
        .task-time {{
            color: var(--text-muted);
            font-size: 0.875rem;
        }}
        
        .footer {{
            text-align: center;
            padding: 2rem;
            margin-top: 3rem;
            border-top: 1px solid var(--border);
            color: var(--text-muted);
            font-size: 0.875rem;
        }}
        
        @media print {{
            body {{
                background: white;
                color: black;
            }}
            
            header {{
                position: static;
                background: white;
                border-bottom: 2px solid black;
            }}
            
            .card {{
                page-break-inside: avoid;
                border: 1px solid black;
                box-shadow: none;
            }}
            
            .message-bubble {{
                page-break-inside: avoid;
            }}
        }}
        
        /* Smooth scrolling */
        html {{
            scroll-behavior: smooth;
        }}
        
        /* Custom scrollbar */
        ::-webkit-scrollbar {{
            width: 12px;
            height: 12px;
        }}
        
        ::-webkit-scrollbar-track {{
            background: var(--dark);
        }}
        
        ::-webkit-scrollbar-thumb {{
            background: var(--primary);
            border-radius: 6px;
        }}
        
        ::-webkit-scrollbar-thumb:hover {{
            background: var(--primary-light);
        }}
    </style>
</head>
<body>
    <header>
        <div class="header-content">
            <div class="logo">S</div>
            <div class="header-text">
                <h1>Swarm Session Report</h1>
                <p>Comprehensive analysis and export of your collaborative AI session</p>
            </div>
        </div>
    </header>
    
    <div class="container">
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">Session ID</div>
                <div class="stat-value small">
""")

        html_parts.append(esc(session_id))
        html_parts.append("""
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Messages</div>
                <div class="stat-value">""")
        html_parts.append(str(len(messages)))
        html_parts.append("""
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Artifacts</div>
                <div class="stat-value">""")
        html_parts.append(str(len(vfs)))
        html_parts.append("""
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Tasks</div>
                <div class="stat-value">""")
        html_parts.append(str(len(task_history)))
        html_parts.append("""
                </div>
            </div>
        </div>
""")

        # Skip redundant summary block since we have the stats grid

        # Agents section with enhanced styling
        agent_names = []
        try:
            if isinstance(agent_outputs, dict):
                agent_names = list(agent_outputs.keys())
        except Exception:
            agent_names = []
        
        html_parts.append("<div class='card'><h2>Active Agents</h2>")
        if agent_names:
            html_parts.append("<div class='agent-chips'>")
            for n in agent_names:
                html_parts.append(f"<span class='chip'>{esc(n)}</span>")
            html_parts.append("</div>")
        else:
            html_parts.append("<div class='empty-state'>No agents were activated in this session</div>")
        html_parts.append("</div>")

        # Task history with improved layout
        html_parts.append("<div class='card'><h2>Task History</h2>")
        if task_history:
            for t in task_history:
                task_text = esc(t.get("task", "Unknown task"))
                task_time = esc(t.get("timestamp", "No timestamp"))
                html_parts.append(f"""
                <div class="task-item">
                    <div class="task-text">{task_text}</div>
                    <div class="task-time">{task_time}</div>
                </div>
                """)
        else:
            html_parts.append("<div class='empty-state'>No tasks have been recorded</div>")
        html_parts.append("</div>")

        # Conversation with enhanced message rendering
        html_parts.append("<div class='card'><h2>Conversation</h2>")
        if messages:
            for m in messages:
                role_raw = (m.get("role", "") or "").lower()
                role = esc(role_raw.title())
                content_raw = m.get("content") or ""
                
                # Use the format_markdown function for better rendering
                body = format_markdown(content_raw)
                
                css = 'system' if role_raw == 'system' else ('user' if role_raw == 'user' else 'assistant')
                html_parts.append(f"""
                <div class='message-bubble {css}'>
                    <div class='message-role'>{role}</div>
                    <div class='message-content'>{body}</div>
                </div>
                """)
        else:
            html_parts.append("<div class='empty-state'>No messages have been captured</div>")
        html_parts.append("</div>")

        # Agent outputs with improved formatting
        html_parts.append("<div class='card'><h2>Agent Outputs</h2>")
        if agent_outputs:
            for name, out in agent_outputs.items():
                html_parts.append(f"""
                <div class='agent-output'>
                    <div class='agent-name'>{esc(name)}</div>
                    <div class='message-content'>{format_markdown(str(out))}</div>
                </div>
                """)
        else:
            html_parts.append("<div class='empty-state'>No agent outputs have been recorded</div>")
        html_parts.append("</div>")

        # Timeline with enhanced table styling
        html_parts.append("<div class='card'><h2>Event Timeline</h2>")
        if chunks:
            html_parts.append("""
            <table>
                <thead>
                    <tr>
                        <th>Type</th>
                        <th>Agent</th>
                        <th>Preview</th>
                    </tr>
                </thead>
                <tbody>
            """)
            for ch in chunks:
                typ = esc(ch.get("type", "unknown"))
                ag = esc(ch.get("agent", "system"))
                preview = ch.get("content") or ch.get("data") or ""
                if isinstance(preview, dict):
                    pv = esc(json.dumps(preview, ensure_ascii=False)[:300])
                else:
                    pv = esc(str(preview)[:300])
                if len(str(preview)) > 300:
                    pv += "..."
                html_parts.append(f"""
                <tr>
                    <td style="font-family: monospace;">{typ}</td>
                    <td style="font-family: monospace;">{ag}</td>
                    <td>{pv}</td>
                </tr>
                """)
            html_parts.append("</tbody></table>")
        else:
            html_parts.append("<div class='empty-state'>No timeline events recorded</div>")
        html_parts.append("</div>")

        # Artifacts with improved presentation
        html_parts.append("<div class='card'><h2>Artifacts (Virtual Filesystem)</h2>")
        if isinstance(vfs, dict) and vfs:
            html_parts.append("""
            <table>
                <thead>
                    <tr>
                        <th>File Path</th>
                        <th>Content Preview</th>
                    </tr>
                </thead>
                <tbody>
            """)
            for path, content in vfs.items():
                preview = str(content)
                # Limit preview length and lines
                lines = preview.splitlines()
                if len(lines) > 20:
                    preview = "\n".join(lines[:20]) + f"\n... (+{len(lines)-20} more lines)"
                if len(preview) > 4000:
                    preview = preview[:4000] + "\n... (truncated)"
                html_parts.append(f"""
                <tr>
                    <td style="font-family: monospace; font-weight: 600;">{esc(path)}</td>
                    <td><pre class="code-block"><code>{esc(preview)}</code></pre></td>
                </tr>
                """)
            html_parts.append("</tbody></table>")
        else:
            html_parts.append("<div class='empty-state'>No artifacts have been generated</div>")
        html_parts.append("</div>")

        # Enhanced footer
        generation_time = datetime.utcnow().strftime("%B %d, %Y at %H:%M:%S UTC")
        html_parts.append(f"""
        <div class='footer'>
            <p>Generated by Swarm Intelligence Export System</p>
            <p>{esc(generation_time)}</p>
        </div>
    </div>
</body>
</html>
""")
        # Compile the final HTML
        report_html = "".join(html_parts)

        # Prepare ZIP
        mem = io.BytesIO()
        with zipfile.ZipFile(mem, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
            # Always include report.html
            try:
                zf.writestr('report.html', report_html)
            except Exception:
                zf.writestr('report.html', '<html><body><h1>Session Report</h1><p>Report generation failed.</p></body></html>')
            # data.json
            data_payload = {
                'session_id': session_id,
                'messages': messages,
                'agent_outputs': agent_outputs,
                'task_history': task_history,
                'virtual_filesystem': list(vfs.keys()) if isinstance(vfs, dict) else [],
                'chunks': chunks if isinstance(chunks, list) else []
            }
            try:
                zf.writestr('data.json', json.dumps(data_payload, ensure_ascii=False, indent=2))
            except Exception:
                zf.writestr('data.json', '{}')
            # chunks.json
            try:
                zf.writestr('chunks.json', json.dumps(chunks if isinstance(chunks, list) else [], ensure_ascii=False, indent=2))
            except Exception:
                zf.writestr('chunks.json', '[]')
            # Add artifacts
            if isinstance(vfs, dict):
                for path, content in vfs.items():
                    try:
                        # Normalize to string; encode to utf-8 bytes
                        data_bytes = content if isinstance(content, (bytes, bytearray)) else str(content).encode('utf-8', errors='ignore')
                        zf.writestr(f'artifacts/{path}', data_bytes)
                    except Exception:
                        safe = str(path).replace('..','_').replace('/', '_')
                        try:
                            zf.writestr(f'artifacts/{safe}', str(content))
                        except Exception:
                            zf.writestr(f'artifacts/{safe}', '<unserializable>')
        mem.seek(0)
        headers = {"Content-Disposition": f"attachment; filename=session_{session_id}.zip"}
        # Return as a normal Response to avoid any streaming iterator edge cases
        return Response(content=mem.getvalue(), media_type='application/zip', headers=headers)
    except Exception as e:
        logger.error(f"Export failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Convenience alias (path variant) to reduce 404s from mismatched prefixes
@router.get("/export/{session_id}")
async def export_session_alias(session_id: str):
    return await export_session(session_id)


@router.get("/sessions/{session_id}/shared-state")
async def get_shared_state(session_id: str):
    """Expose current shared state snapshot for a session."""
    try:
        strands = get_strands_session_service()
        shared = SharedStateService()
        data = shared.get_all(session_id)

        # Provide agent list (names) for visibility
        agents = strands.get_all_agents(session_id)
        agent_names = list(agents.keys()) if agents else []
        # Include any agents present in agent_outputs to improve visibility
        try:
            outputs = data.get("shared_context", {}).get("agent_outputs", {})
            for k in outputs.keys():
                if k not in agent_names:
                    agent_names.append(k)
        except Exception:
            pass

        return JSONResponse({
            "session_id": session_id,
            "shared_context": data.get("shared_context", {}),
            "agent_outputs": data.get("shared_context", {}).get("agent_outputs", {}),
            "task_history": data.get("shared_context", {}).get("task_history", []),
            "current_goal": data.get("shared_context", {}).get("current_goal", ""),
            "namespaces": data.get("namespaces", {}),
            "agents": agent_names,
        })
    except Exception as e:
        logger.error(f"Failed to get shared state: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sessions/{session_id}/shared-state")
async def update_shared_state(session_id: str, request: Dict[str, Any]):
    """Update shared state: set current_goal, append task, or set a namespace key."""
    try:
        shared = SharedStateService()
        updated = {}

        if isinstance(request, dict):
            if "current_goal" in request:
                shared.set_current_goal(session_id, str(request.get("current_goal") or ""))
                updated["current_goal"] = request.get("current_goal")
            if "append_task" in request and request.get("append_task"):
                shared.append_task_history(session_id, str(request.get("append_task")))
            if "set_namespace" in request and isinstance(request.get("set_namespace"), dict):
                ns = request["set_namespace"]
                key = ns.get("key")
                value = ns.get("value")
                if key is not None:
                    shared.set_namespace(session_id, str(key), value)
            if request.get("clear_agent_outputs"):
                ctx = shared.get_shared_context(session_id)
                ctx["agent_outputs"] = {}
                shared.set_shared_context(session_id, ctx, merge=False)

        data = shared.get_all(session_id)
        return JSONResponse({
            "session_id": session_id,
            "shared_context": data.get("shared_context", {}),
            "namespaces": data.get("namespaces", {}),
            "updated": updated
        })
    except Exception as e:
        logger.error(f"Failed to update shared state: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/streaming/continue/sse")
async def continue_streaming_sse(
    payload: Dict[str, Any],
    request: Request
):
    """
    Continue streaming session using native Strands streaming with Server-Sent Events
    This replaces the polling-based approach with proper streaming
    """
    session_id = payload.get("session_id")
    task = payload.get("task", "")
    previous_messages = payload.get("previous_messages", [])
    agents = payload.get("agents", [])
    max_handoffs = payload.get("max_handoffs", 20)
    execution_mode = payload.get("execution_mode", "auto")
    
    logger.info(f"🔄 SSE CONTINUE: session_id={session_id}, task={task[:50]}...")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    
    if not task:
        raise HTTPException(status_code=400, detail="task is required")
    
    async def event_generator():
        try:
            # Get Strands session service for proper persistence
            strands_service = get_strands_session_service()
            
            # Load context from Strands persistent storage
            saved_context = strands_service.get_context(session_id)
            virtual_filesystem = strands_service.get_virtual_filesystem(session_id)
            
            logger.info(f"📖 Loaded saved_context keys: {list(saved_context.keys())}")
            logger.info(f"📖 Messages in saved_context: {len(saved_context.get('messages', []))}")
            
            # Build context for swarm execution
            # CRITICAL FIX: Always use saved messages for continuation, not request messages
            # This ensures conversation history is preserved across continuations
            previous_messages = saved_context.get("messages", [])
            context = {
                "previous_messages": previous_messages,  # Always use saved messages
                "messages": previous_messages,  # CRITICAL: Also save as "messages" for consistency
                "virtual_filesystem": virtual_filesystem,
                "accumulated_context": saved_context.get("accumulated_context", {}),
                "task_history": saved_context.get("task_history", [])
            }
            
            # Add current task to history
            context["task_history"].append({
                "task": task,
                "timestamp": datetime.utcnow().isoformat()
            })
            
            # Save updated context with proper message key
            strands_service.save_context(session_id, context)

            # Initialize/Update shared state for this continuation
            try:
                shared_service = SharedStateService()
                shared_service.ensure_initialized(session_id)
                if task:
                    shared_service.append_task_history(session_id, task)
            except Exception as e:
                logger.warning(f"Shared state init (continue) failed: {e}")
            
            # Create swarm request
            swarm_request = SwarmExecutionRequest(
                task=task,
                agents=agents,  # For continuation, always generate fresh agents
                max_handoffs=max_handoffs,
                execution_id=session_id,
                context=context,
                execution_mode=execution_mode
            )
            
            # Determine swarm engine
            swarm_cfg = (swarm_request.context or {}).get('swarm_config', {}) if hasattr(swarm_request, 'context') else {}
            engine = (swarm_cfg.get('engine') or '').lower()

            # Send start event
            yield f"data: {json.dumps({'type': 'session_start', 'session_id': session_id, 'timestamp': datetime.utcnow().isoformat()})}\n\n"

            if False and engine in ('event', 'graph', 'event_driven'):
                # Event-driven engine path
                from app.services.streaming_swarm_service import StreamingSwarmService
                ev_service = StreamingSwarmService()

                agent_configs = None
                if swarm_request.agents:
                    try:
                        agent_configs = {
                            a.name: {
                                'system_prompt': a.system_prompt,
                                'tools': getattr(a, 'tools', []) or [],
                                'model': getattr(a, 'model', 'gpt-4o-mini') or 'gpt-4o-mini',
                                'temperature': getattr(a, 'temperature', 0.7) or 0.7,
                                'max_tokens': getattr(a, 'max_tokens', 4000) or 4000
                            } for a in swarm_request.agents
                        }
                    except Exception as e:
                        logger.warning(f"Failed to map agent configs: {e}")

                async for ev in ev_service.execute_streaming_swarm(
                    execution_id=session_id,
                    task=task,
                    agent_configs=agent_configs,
                    max_handoffs=swarm_request.max_handoffs or 10,
                    max_iterations=swarm_request.max_iterations or 20,
                    conversation_history=previous_messages
                ):
                    # Update shared state for agent completion
                    try:
                        if ev.get('type') in ('agent_complete','agent_completed') and ev.get('agent'):
                            SharedStateService().set_agent_output(session_id, ev['agent'], ev.get('message') or '')
                    except Exception:
                        pass
                    yield f"data: {json.dumps(ev)}\n\n"
                return
            else:
                # Default: EnhancedSwarmService
                from app.services.enhanced_swarm_service import EnhancedSwarmService
                service = EnhancedSwarmService()
                # Expose globally for stop endpoint and map session->execution
                import app.api.v1.endpoints.streaming as streaming_module
                streaming_module._global_swarm_service = service
                streaming_module._services_by_session[session_id] = service
                if not hasattr(streaming_module, '_session_execution_map'):
                    streaming_module._session_execution_map = {}
                streaming_module._session_execution_map[session_id] = swarm_request.execution_id or session_id

                # Create event queue for async communication between callback and generator
                event_queue = asyncio.Queue()

                async def streaming_callback(**kwargs):
                    event_type = kwargs.get("type", "unknown")
                    agent = kwargs.get("agent")
                    data = kwargs.get("data", {})
                    event = {
                        "type": event_type,
                        "agent": agent,
                        "data": data,
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    await event_queue.put(event)

                logger.info(f"🚀 Starting native Strands streaming for session {session_id}")

                async def run_swarm():
                    try:
                        conversation_history = context.get("previous_messages", [])
                        logger.info(f"📚 Passing {len(conversation_history)} messages to swarm executor")

                        result = await service.execute_swarm_async(
                            request=swarm_request,
                            user_id="stream_user",
                            callback_handler=streaming_callback,
                            conversation_history=conversation_history
                        )
                        await event_queue.put({
                            'type': 'session_complete', 
                            'result': str(result) if result else None, 
                            'timestamp': datetime.utcnow().isoformat()
                        })
                    except Exception as e:
                        logger.error(f"Swarm execution error: {e}")
                        await event_queue.put({
                            'type': 'error', 
                            'error': str(e), 
                            'timestamp': datetime.utcnow().isoformat()
                        })
                    finally:
                        await event_queue.put(None)

                swarm_task = asyncio.create_task(run_swarm())
                import app.api.v1.endpoints.streaming as streaming_module
                streaming_module._live_sse_sessions[session_id] = {
                    "task": swarm_task,
                    "queue": event_queue
                }

                while True:
                    try:
                        if await request.is_disconnected():
                            try:
                                await service.stop_execution(session_id)
                            except Exception:
                                pass
                            break
                        event = await asyncio.wait_for(event_queue.get(), timeout=1.0)
                        if event is None:
                            break
                        try:
                            if event.get('type') == 'agent_completed' and event.get('agent'):
                                output = ''
                                data = event.get('data') or {}
                                if isinstance(data, dict):
                                    output = data.get('output') or ''
                                if output:
                                    SharedStateService().set_agent_output(session_id, event['agent'], output)
                        except Exception as e:
                            logger.warning(f"Shared state update (continue) failed: {e}")
                        yield f"data: {json.dumps(event)}\n\n"
                    except asyncio.TimeoutError:
                        yield f"data: {json.dumps({'type': 'keepalive', 'timestamp': datetime.utcnow().isoformat()})}\n\n"
                        if swarm_task.done():
                            break
                    except asyncio.CancelledError:
                        try:
                            await service.stop_execution(session_id)
                        except Exception:
                            pass
                        break
            
        except Exception as e:
            logger.error(f"SSE streaming error: {e}")
            error_event = {
                "type": "error",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
            yield f"data: {json.dumps(error_event)}\n\n"
        finally:
            # Cleanup live session registry
            import app.api.v1.endpoints.streaming as streaming_module
            if session_id in streaming_module._live_sse_sessions:
                streaming_module._live_sse_sessions.pop(session_id, None)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            # Critical: disable proxy/app buffering and compression for real-time SSE
            "X-Accel-Buffering": "no",
            "Content-Encoding": "identity",
        }
    )


@router.post("/streaming/continue")
async def continue_streaming(
    request: Dict[str, Any],
    background_tasks: BackgroundTasks
):
    """
    Continue an existing streaming session using proper Strands session management
    """
    print("🚨🚨🚨 STREAMING CONTINUE ENDPOINT CALLED!")
    logger.info("🚨🚨🚨 STREAMING CONTINUE ENDPOINT CALLED!")
    session_id = request.get("session_id")
    task = request.get("task", "")
    previous_messages = request.get("previous_messages", [])
    agents = request.get("agents", [])
    max_handoffs = request.get("max_handoffs", 20)
    execution_mode = request.get("execution_mode", "auto")
    
    logger.info(f"🔄 CONTINUE REQUEST: session_id={session_id}, task={task[:50]}..., agents={len(agents)}, messages={len(previous_messages)}, execution_mode={execution_mode}")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    
    # Get Strands session service - this handles proper persistence
    strands_service = get_strands_session_service()
    
    # Load messages from database if not provided
    # NOTE: Disabled database loading for now - using Strands persistence
    # if not previous_messages:
    #     try:
    #         from app.services.chat_service import get_chat_service
    #         chat_service = get_chat_service()
    #         db_messages = await chat_service.get_session_messages(session_id)
    #         previous_messages = [
    #             {"role": msg.role, "content": msg.content}
    #             for msg in db_messages
    #         ]
    #         logger.info(f"📚 Loaded {len(previous_messages)} messages from database")
    #     except Exception as e:
    #         logger.error(f"Failed to load messages from database: {e}")
    #         previous_messages = []
    
    # Check if session exists in Strands persistent storage
    existing_agents = strands_service.get_agents(session_id)
    saved_context = strands_service.get_context(session_id)
    virtual_filesystem = strands_service.get_virtual_filesystem(session_id)
    
    logger.info(f"📊 Strands Session Analysis:")
    logger.info(f"  - Persistent agents: {len(existing_agents)}")
    logger.info(f"  - Saved messages: {len(saved_context.get('messages', []))}")
    logger.info(f"  - Virtual files: {len(virtual_filesystem)}")
    
    # For continuation, we should ALWAYS create fresh agents, not reuse old ones
    # This ensures dynamic agent selection based on the new task
    
    # Check if we have persisted session data
    session_exists = session_id in strands_service.list_sessions()
    if session_exists:
        logger.info(f"Found persisted session {session_id}, will use existing context")
    else:
        logger.info(f"Session {session_id} not found in persistent storage, will create new session")
    
    logger.info("🤖 AGENT SELECTION: Using AI Orchestrator for intelligent decisions")
    logger.info(f"📝 Task: {task[:100]}...")
    logger.info(f"💬 Context: {len(previous_messages)} previous messages")
    
    # For continuation, always generate fresh agents (don't reuse old ones)
    # This ensures dynamic agent selection based on the new task
    if agents and len(agents) > 0:
        logger.info(f"📥 Using {len(agents)} agents provided by frontend")
    else:
        logger.info("🆕 Generating fresh agents for new task")
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
    
    # CRITICAL FIX: Combine all message sources for continuation
    # This ensures conversation history is preserved across continuations
    saved_messages = saved_context.get("messages", [])
    all_messages = previous_messages + saved_messages
    # Remove duplicates while preserving order
    seen = set()
    unique_messages = []
    for msg in all_messages:
        msg_key = f"{msg.get('role', '')}:{msg.get('content', '')}"
        if msg_key not in seen:
            seen.add(msg_key)
            unique_messages.append(msg)
    
    logger.info(f"📚 Combined {len(unique_messages)} unique messages from all sources")
    
    context = {
        "previous_messages": unique_messages,  # Use combined messages
        "messages": unique_messages,  # Also store as "messages" for compatibility
        "virtual_filesystem": virtual_filesystem or saved_context.get("virtual_filesystem", {}),
        "accumulated_context": saved_context.get("accumulated_context", {}),
        "task_history": saved_context.get("task_history", [])
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
    
    # CRITICAL FIX: Save context BEFORE starting execution to avoid race condition
    # This ensures context is persisted before any async operations begin
    strands_service.save_context(session_id, context)
    logger.info(f"💾 Context saved for session {session_id} BEFORE execution starts")
    
    # Initialize session for streaming (Strands handles persistence automatically)
    # CRITICAL: Always start with empty chunks for new execution
    # The previous chunks are already delivered to frontend, we don't need to preserve them
    existing_chunks = []
    existing_chunk_count = 0
    logger.info(f"📊 Starting fresh chunk collection for task: {task[:50]}...")
    
    # Update session while preserving chunks
    await storage.set(session_id, {
        "status": "initializing",
        "agents": agents,
        "task": task,
        "context": context,
        "virtual_filesystem": context["virtual_filesystem"],
        "accumulated": {},  # Fresh start for new task
        "task_history": context["task_history"],
        "chunks": existing_chunks,  # PRESERVE existing chunks
        "metrics": {
            "start_time": datetime.utcnow().isoformat(),
            "chunk_count": existing_chunk_count,  # PRESERVE chunk count
            "agent_count": 0,
            "tool_calls": 0,
            "handoffs": 0
        }
    })
    logger.info(f"✅ Session {session_id} initialized for continuation")
    
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
    # Expose globally so stop endpoint can stop this execution
    import app.api.v1.endpoints.streaming as streaming_module
    streaming_module._global_swarm_service = service
    if not hasattr(streaming_module, '_session_execution_map'):
        streaming_module._session_execution_map = {}
    streaming_module._session_execution_map[session_id] = swarm_request.execution_id or session_id
    
    # Execute in background with context preservation
    background_tasks.add_task(
        execute_swarm_with_context,
        session_id,
        swarm_request,
        service,
        context,
        storage  # Pass the storage instance
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
    context: Dict[str, Any],
    storage_instance: SessionStorage = None
):
    """Execute swarm with preserved context"""
    try:
        # Use provided storage or get default
        storage = storage_instance or get_session_storage()
        
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
                
            # Handle agent_started event
            if event_type == "agent_started" and agent:
                event["type"] = "agent_start"
                # Initialize accumulator for this agent
                session = await storage.get(session_id)
                if session:
                    accumulated = session.get("accumulated", {})
                    accumulated[agent] = ""
                    session["accumulated"] = accumulated
                    await storage.set(session_id, session)
                
            # Special handling for content/delta events
            if event_type == "token":
                # Handle token events from coordinator
                content = kwargs.get("content", "") or data.get("content", "")
                if content:
                    logger.info(f"🔄 Processing token event for {agent}: {content[:20]}...")
                    event["type"] = "delta"
                    event["content"] = content
                    if agent:
                        event["agent"] = agent
                    # Accumulate tokens for the agent
                    session = await storage.get(session_id)
                    if session:
                        accumulated = session.get("accumulated", {})
                        if agent not in accumulated:
                            accumulated[agent] = ""
                        accumulated[agent] += content
                        session["accumulated"] = accumulated
                        await storage.set(session_id, session)
                        logger.info(f"✅ Token accumulated, total: {len(accumulated[agent])} chars")
            elif event_type == "text_generation":
                # Handle text generation events from Strands
                chunk = data.get("chunk", "") or data.get("text", "")
                if chunk:
                    logger.info(f"🔄 Processing text_generation event for {agent}: {chunk[:50]}...")
                    event["type"] = "delta"
                    event["content"] = chunk
                    if agent:
                        event["agent"] = agent
                    # Also accumulate text for the agent
                    session = await storage.get(session_id)
                    if session:
                        accumulated = session.get("accumulated", {})
                        if agent not in accumulated:
                            accumulated[agent] = ""
                        accumulated[agent] += chunk
                        session["accumulated"] = accumulated
                        await storage.set(session_id, session)
                        logger.info(f"✅ Accumulated {len(accumulated[agent])} chars for {agent}")
                
            # Handle direct agent_done event from coordinator
            if event_type == "agent_done":
                content = kwargs.get("content", "")
                if content and agent:
                    done_event = {
                        "type": "agent_done",
                        "agent": agent,
                        "content": content,
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    await storage.append_chunk(session_id, done_event)
                    logger.info(f"✅ Stored direct agent_done event for {agent} with {len(content)} chars")
                return  # Don't process further
            
            # Save to storage (but not for certain event types)
            # CRITICAL: Don't save individual text_generation/token events as chunks
            # They should only accumulate and be saved as agent_done
            if event_type not in ["agents_generated", "agent_completed", "text_generation", "token"]:
                await storage.append_chunk(session_id, event)
            
            # Special handling for agent_completed event
            if event_type == "agent_completed" and agent:
                logger.info(f"🎯 Processing agent_completed for {agent}, data keys: {data.keys() if data else 'None'}")
                session = await storage.get(session_id)
                accumulated_text = ""
                
                # CRITICAL FIX: Check for content in the data field first (from coordinator)
                if data and "output" in data:
                    accumulated_text = data["output"]
                    logger.info(f"📝 Using output from agent_completed event: {len(accumulated_text)} chars")
                elif session and "accumulated" in session:
                    accumulated_text = session["accumulated"].get(agent, "")
                    logger.info(f"📝 Using accumulated text: {len(accumulated_text)} chars")
                
                # CRITICAL: Only create event if we have actual content
                if accumulated_text and accumulated_text.strip():
                    # Create completion event with FULL accumulated text
                    completion_event = {
                        "type": "agent_done",
                        "agent": agent,
                        "content": accumulated_text,  # Full message, not truncated
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    await storage.append_chunk(session_id, completion_event)
                    logger.info(f"✅ Appended agent_done event for {agent} with COMPLETE message: {len(accumulated_text)} chars")
                    
                    # Clear accumulator after sending complete message
                    if session:
                        session["accumulated"][agent] = ""
                        await storage.set(session_id, session)
                
                # Update metrics
                if session:
                    session["metrics"]["agent_count"] = session.get("metrics", {}).get("agent_count", 0) + 1
                    await storage.set(session_id, session)
            
            # Special handling for agents_generated event
            elif event_type == "agents_generated":
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
        # CRITICAL: Pass ALL messages for proper context preservation
        conversation_history = []
        
        if context.get("previous_messages"):
            logger.info(f"📝 Found {len(context['previous_messages'])} previous messages")
            # Pass ALL messages to maintain full context
            conversation_history = context["previous_messages"]
            logger.info(f"📝 Using full conversation history with {len(conversation_history)} messages")
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
            try:
                await storage.append_chunk(session_id, {
                    "type": "execution_mode",
                    "mode": "sequential",
                    "reason": "Sequential mode selected or optimal for task",
                    "timestamp": datetime.utcnow().isoformat()
                })
                # Pass context to the service with conversation history
                logger.info(f"🎯 Passing {len(conversation_history)} conversation history items to agents")
                logger.info(f"📋 Request details: task={request.task}, agents={len(request.agents)}")
                logger.info(f"📋 Conversation history: {conversation_history}")
                
                # Include current task at the tail of conversation history for immediate context
                conv_plus_current = list(conversation_history)
                if task:
                    conv_plus_current.append({"role": "user", "content": task})
                result = await service.execute_swarm_async(
                    request=request,
                    user_id="stream_user",
                    callback_handler=streaming_callback,
                    use_orchestrator=True,
                    conversation_history=conv_plus_current,
                    existing_agents=context.get("existing_agents", [])
                )
                logger.info(f"✅ Sequential execution completed with result: {result}")
            except Exception as seq_error:
                logger.error(f"❌ Sequential execution failed: {seq_error}", exc_info=True)
                raise
        
            # Save final result
            session = await storage.get(session_id)
            if session:
                session["status"] = "complete"
                # Serialize the result object properly
                if result:
                    if hasattr(result, 'dict'):
                        session["result"] = result.dict()
                    elif hasattr(result, 'model_dump'):
                        session["result"] = result.model_dump()
                    else:
                        session["result"] = str(result)
                else:
                    session["result"] = None
                await storage.set(session_id, session)
            
            # CRITICAL: Save ALL context including messages to Strands for future continuation
            logger.info(f"💾 Saving complete context for continued session {session_id}")
            
            # Build complete message history
            all_messages = []
            # Include previous messages from context
            if context.get("previous_messages"):
                all_messages.extend(context["previous_messages"])
            # Add the current task as a user message
            all_messages.append({"role": "user", "content": request.task})
            
            # Append each agent's final output in the order they completed
            try:
                chunks = await storage.get_chunks(session_id, offset=0, limit=2000)
            except Exception:
                chunks = []
            for ch in chunks:
                if ch.get("type") in ("agent_done", "agent_completed"):
                    content = ch.get("content") or (ch.get("data", {}) or {}).get("output")
                    if content and isinstance(content, str) and content.strip():
                        all_messages.append({"role": "assistant", "content": content})
            
            # Fallback to single assistant message if none were found
            if not any(m.get('role') == 'assistant' for m in all_messages):
                result_content = ""
                if result:
                    if hasattr(result, 'result'):
                        result_content = result.result
                    elif hasattr(result, 'message'):
                        result_content = result.message
                    elif hasattr(result, 'content'):
                        result_content = result.content
                    else:
                        result_content = str(result)
                if result_content:
                    all_messages.append({"role": "assistant", "content": result_content})
            
            context_to_save = {
                "messages": all_messages,  # Save complete message history
                "accumulated_context": session.get("accumulated", {}),
                "virtual_filesystem": session.get("virtual_filesystem", {}),
                "task_history": session.get("task_history", [])
            }
            
            strands_svc = get_strands_session_service()
            strands_svc.save_context(session_id, context_to_save)
            logger.info(f"✅ Saved {len(all_messages)} messages to persistent context")
            
            # Save messages to database for UI visibility
            try:
                from app.core.database import AsyncSessionLocal
                from app.services.chat_service import ChatService
                from app.schemas.chat import ChatMessageCreate, ChatSessionCreate
                
                async with AsyncSessionLocal() as db:
                    chat_service = ChatService(db)
                    
                    # First ensure the session exists in the database
                    existing_session = await chat_service.get_session(session_id, "default_user")
                    if not existing_session:
                        # Create the session if it doesn't exist
                        session_data = ChatSessionCreate(
                            session_id=session_id,
                            title=request.task[:50] if request.task else "Continued Chat",
                            max_handoffs=request.max_handoffs or 20,
                            max_iterations=request.max_iterations or 20
                        )
                        await chat_service.create_session("default_user", session_data)
                        logger.info(f"Created chat session {session_id} in database for continuation")
                    
                    # REMOVED: Message saving - frontend handles this to avoid duplicates
                    # Frontend saves messages through the chat API when:
                    # 1. User sends a message (saveMessageToSession)
                    # 2. Assistant message is finalized (finalizeStreamingMessage)
                    logger.info(f"📝 Skipping backend message save for continuation - frontend handles persistence")
            except Exception as e:
                logger.error(f"Failed to save messages to database: {e}")
            
        # Send completion event  
        final_session = await storage.get(session_id)
        await storage.append_chunk(session_id, {
            "type": "done",
            "timestamp": datetime.utcnow().isoformat(),
            "metrics": final_session.get("metrics") if final_session else None
        })
        
    except Exception as e:
        logger.error(f"Swarm execution failed: {e}", exc_info=True)
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        await storage.append_chunk(session_id, {
            "type": "error",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        })


@router.get("/streaming/status/{session_id}")
async def get_execution_status(session_id: str):
    """Get detailed execution status including agent pool information"""
    try:
        # Get basic session info
        # Use the shared storage instance initialized at module import
        session = await storage.get(session_id)
        
        base_status = {
            "session_id": session_id,
            "session_found": session is not None,
            "session_status": session.get("status") if session else None
        }
        
        # Get execution ID
        import app.api.v1.endpoints.streaming as streaming_module
        execution_id = session_id
        if hasattr(streaming_module, '_session_execution_map'):
            execution_id = streaming_module._session_execution_map.get(session_id, session_id)
        
        # Get detailed service status if available
        if hasattr(streaming_module, '_global_swarm_service'):
            service = streaming_module._global_swarm_service
            if hasattr(service, 'get_execution_status'):
                detailed_status = service.get_execution_status(execution_id)
                base_status.update(detailed_status)
            elif hasattr(service, 'pool_manager'):
                base_status["pool_manager"] = service.pool_manager.status
        
        return base_status
        
    except Exception as e:
        logger.error(f"Failed to get execution status: {e}")
        return {
            "session_id": session_id,
            "error": str(e),
            "session_found": False
        }
