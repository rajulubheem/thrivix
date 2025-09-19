"""
Event-Driven Swarm API endpoints with human-in-loop support
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import json
import asyncio
import time
from collections import deque, defaultdict
import os
from datetime import datetime
import uuid

from app.schemas.swarm import SwarmExecutionRequest, SwarmExecutionResponse
from app.schemas.events import TextGenerationEvent, AgentCompletedEvent, BusEvent
from app.core.database import AsyncSessionLocal
from sqlalchemy import select
from app.models.database import SwarmExecution, ExecutionEvent, ExecutionStatus as DBExecStatus
from app.services.event_driven_strands_swarm import EventDrivenStrandsSwarm
from app.services.event_system import global_event_bus
from app.core.security import get_current_user
import structlog

router = APIRouter()
logger = structlog.get_logger()

# Global swarm service instance
event_swarm_service = EventDrivenStrandsSwarm()

# In-memory replay buffers for SSE resume (Last-Event-ID)
# Per-execution ring buffer of the last N events with assigned SSE ids
_REPLAY_MAX = int(os.getenv('SWARM_SSE_REPLAY_MAX', '2000'))
_RUNTIME_CONFIG: Dict[str, Any] = {
    'replay_max': _REPLAY_MAX,
    'sample_every': int(os.getenv('SWARM_TEXT_SAMPLE_EVERY', '20')),
    'coalesce': False,
    'coalesce_ms': int(os.getenv('SWARM_COALESCE_MS', '15')),
}
_replay_state = {}  # execution_id -> { 'next_id': int, 'buffer': deque[(int, dict)] }

def _get_replay_state(execution_id: str):
    state = _replay_state.get(execution_id)
    if not state:
        state = {
            'next_id': 1,
            'buffer': deque(maxlen=int(_RUNTIME_CONFIG.get('replay_max') or _REPLAY_MAX)),
        }
        _replay_state[execution_id] = state
    return state

def _emit_and_buffer_sse(execution_id: str, event_obj: dict) -> str:
    state = _get_replay_state(execution_id)
    sse_id = state['next_id']
    state['next_id'] += 1
    # Store copy to avoid mutation surprises
    state['buffer'].append((sse_id, dict(event_obj)))
    payload = json.dumps(event_obj)
    return f"id: {sse_id}\n" f"data: {payload}\n\n"

def _format_sse_with_id(event_obj: dict, sse_id: int) -> str:
    payload = json.dumps(event_obj)
    return f"id: {sse_id}\n" f"data: {payload}\n\n"

# Per-execution streaming metrics and budget state
_stream_metrics: Dict[str, Dict[str, Dict[str, int]]] = defaultdict(lambda: defaultdict(lambda: {
    'last_sequence': 0,
    'chunks': 0,
    'chars': 0
}))

_budget_state: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
    'tokens_last_min': deque(),  # (timestamp, tokens)
    'requests_last_min': deque(),  # (timestamp)
    'tokens_total': 0,
    'chunks_total': 0,
    'budget_exceeded': False,
    'last_rate_limit_notice': 0.0
})

def _now_ts() -> float:
    return time.time()


@router.post("/execute")
async def execute_event_swarm(
    request: SwarmExecutionRequest,
    current_user: dict = Depends(get_current_user)
):
    """Execute swarm with event-driven coordination - returns execution ID for polling"""
    try:
        # Set execution mode to event_driven
        request.execution_mode = "event_driven"
        
        # Generate execution ID
        execution_id = request.execution_id or str(uuid.uuid4())
        request.execution_id = execution_id
        
        # Start execution in background (non-blocking)
        asyncio.create_task(
            event_swarm_service.execute_swarm_async(
                request,
                current_user["id"],
                None  # No streaming callback needed for polling
            )
        )
        
        # Return immediately with execution ID for polling
        return {
            "execution_id": execution_id,
            "status": "started",
            "message": "Event-driven swarm execution started"
        }
        
    except Exception as e:
        logger.error(f"Event swarm execution failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/replay/{execution_id}")
async def get_replay_depth(execution_id: str):
    """Return current replay buffer depth and ID range for an execution."""
    state = _get_replay_state(execution_id)
    buf = state['buffer']
    depth = len(buf)
    oldest = buf[0][0] if depth > 0 else None
    newest = buf[-1][0] if depth > 0 else None
    return {
        'execution_id': execution_id,
        'depth': depth,
        'max': _REPLAY_MAX,
        'next_id': state['next_id'],
        'oldest_id': oldest,
        'newest_id': newest
    }


@router.get("/status/{execution_id}/streams")
async def get_stream_metrics(execution_id: str):
    """Return per-agent last-seen sequence and simple counters for a session."""
    agents = _stream_metrics.get(execution_id, {})
    budget = _budget_state.get(execution_id, {})
    return {
        'execution_id': execution_id,
        'agents': agents,
        'budget': {
            'tokens_total': budget.get('tokens_total', 0),
            'chunks_total': budget.get('chunks_total', 0),
            'budget_exceeded': budget.get('budget_exceeded', False)
        }
    }


@router.get("/config")
async def get_runtime_config():
    """Get current runtime configuration for SSE and sampling."""
    return {
        'replay_max': _RUNTIME_CONFIG.get('replay_max'),
        'sample_every': _RUNTIME_CONFIG.get('sample_every'),
        'coalesce': _RUNTIME_CONFIG.get('coalesce'),
        'coalesce_ms': _RUNTIME_CONFIG.get('coalesce_ms')
    }


class UpdateConfigRequest(BaseModel):
    replay_max: Optional[int] = None
    sample_every: Optional[int] = None
    coalesce: Optional[bool] = None
    coalesce_ms: Optional[int] = None


@router.post("/config")
async def update_runtime_config(req: UpdateConfigRequest):
    """Update runtime configuration and apply changes immediately."""
    changed = {}
    if req.replay_max is not None and req.replay_max > 0:
        new_max = int(req.replay_max)
        _RUNTIME_CONFIG['replay_max'] = new_max
        # Update existing buffers to new maxlen
        for exec_id, st in _replay_state.items():
            old_buf = st['buffer']
            new_buf = deque(maxlen=new_max)
            # Preserve the newest entries up to new_max
            for _, item in list(old_buf)[-new_max:]:
                # We need to reassign IDs? Keep existing ids as-is for consistency
                pass
            # Rebuild while preserving (id, payload)
            for pair in list(old_buf)[-new_max:]:
                new_buf.append(pair)
            st['buffer'] = new_buf
        global _REPLAY_MAX
        _REPLAY_MAX = new_max
        changed['replay_max'] = new_max

    if req.sample_every is not None and req.sample_every > 0:
        _RUNTIME_CONFIG['sample_every'] = int(req.sample_every)
        changed['sample_every'] = int(req.sample_every)

    if req.coalesce is not None:
        _RUNTIME_CONFIG['coalesce'] = bool(req.coalesce)
        changed['coalesce'] = bool(req.coalesce)

    if req.coalesce_ms is not None and req.coalesce_ms >= 0:
        _RUNTIME_CONFIG['coalesce_ms'] = int(req.coalesce_ms)
        changed['coalesce_ms'] = int(req.coalesce_ms)

    return {
        'ok': True,
        'changed': changed,
        'config': {
            'replay_max': _RUNTIME_CONFIG['replay_max'],
            'sample_every': _RUNTIME_CONFIG['sample_every'],
            'coalesce': _RUNTIME_CONFIG['coalesce'],
            'coalesce_ms': _RUNTIME_CONFIG['coalesce_ms']
        }
    }


@router.post("/stream")
async def stream_event_swarm(
    request: SwarmExecutionRequest,
    http_request: Request,
    # Temporarily disabled for testing: current_user: dict = Depends(get_current_user)
):
    """Stream swarm execution with Server-Sent Events"""
    logger.info(f"Starting SSE stream for execution: {request.task}")
    
    async def event_generator():
        logger.info("SSE generator started")
        try:
            # Set execution mode
            request.execution_mode = "event_driven"
            execution_id = request.execution_id or str(uuid.uuid4())
            request.execution_id = execution_id
            logger.info(f"Execution ID: {execution_id}")
            
            # Optional client retry hint (5s)
            yield "retry: 5000\n\n"

            # Send initial connection event
            yield _emit_and_buffer_sse(execution_id, {'type': 'connected', 'execution_id': execution_id, 'timestamp': datetime.now().isoformat()})
            logger.info("Sent initial connection event")

            # Persist/ensure execution record exists
            try:
                async with AsyncSessionLocal() as session:
                    # Upsert-like behavior
                    q = await session.execute(select(SwarmExecution).where(SwarmExecution.execution_id == execution_id))
                    existing = q.scalars().first()
                    if not existing:
                        rec = SwarmExecution(
                            execution_id=execution_id,
                            user_id='anonymous',
                            task=request.task,
                            agents_config=( [a.dict() for a in request.agents] if getattr(request, 'agents', None) else None ),
                            status=DBExecStatus.RUNNING,
                            started_at=datetime.utcnow(),
                        )
                        session.add(rec)
                        await session.commit()
            except Exception as e:
                logger.warning(f"Failed to persist execution record: {e}")
            
            # Create a queue for streaming events with size limit to prevent memory issues
            # Use a larger buffer to minimize dropped token chunks under bursty loads
            event_queue = asyncio.Queue(maxsize=2000)
            
            # Track events from global event bus
            event_listener_task = None
            
            # Whitelist of event types to forward from bus (avoid duplicates from streaming_callback)
            BUS_EVENT_WHITELIST = {
                "session_start",
                "agent.spawned", 
                "agent.started",
                "agent.needed",
                "handoff.requested",
                "task.started",
                "task.complete",
                "error",
                "human.approval.needed",
                "human.question"
            }
            
            # Register listener for select events from the global event bus
            async def forward_bus_events(event):
                """Forward select events from the global event bus to the SSE stream"""
                try:
                    # Scope by execution_id to avoid cross-session noise
                    try:
                        ev_exec = (event.data or {}).get('execution_id')
                    except Exception:
                        ev_exec = None
                    if ev_exec and ev_exec != execution_id:
                        return
                    # Skip events that are already handled by streaming_callback
                    # These would be duplicates
                    if event.type in ["text_generation", "agent_completed", "agent.completed"]:
                        return
                    
                    # Only forward whitelisted events to avoid noise
                    if event.type not in BUS_EVENT_WHITELIST:
                        return
                    
                    logger.debug(f"Forwarding bus event: {event.type} from {event.source}")
                    
                    # Forward whitelisted bus events (validated)
                    event_data = BusEvent(
                        type=event.type,
                        agent=event.source,
                        data=event.data or {},
                        timestamp=event.timestamp,
                        execution_id=execution_id
                    ).dict()
                    # Normalize agent for frontend consumers
                    try:
                        if isinstance(event.data, dict) and 'agent' in event.data:
                            event_data["agent"] = event.data.get("agent")
                        elif event.source:
                            event_data["agent"] = event.source
                    except Exception:
                        pass
                    
                    # Special handling for agent.completed events
                    if event.type == "agent.completed":
                        logger.info(f"Agent completed event detected: {event.data}")
                        # Don't send output again - it was already streamed
                        # The output field should not be in agent.completed anymore
                    
                    # Forward the original event - use put_nowait to avoid blocking
                    try:
                        event_queue.put_nowait(event_data)
                    except asyncio.QueueFull:
                        logger.warning(f"Queue full, dropping bus event: {event.type}")

                    # Persist non-text events (offload)
                    try:
                        _audit_queue.put_nowait({
                            'execution_id': execution_id,
                            'event_type': event.type,
                            'agent': event.source,
                            'data': event.data or {}
                        })
                    except asyncio.QueueFull:
                        pass
                except Exception as e:
                    logger.error(f"Error forwarding bus event: {e}", exc_info=True)
            
            # Register the event listener
            global_event_bus.on("*", forward_bus_events)
            
            # Track pending events using deque for O(1) operations
            pending_events = deque()
            # Per-agent tiny-chunk coalescing to reduce event flood and latency
            coalesce_buffers: Dict[str, Dict[str, Any]] = defaultdict(lambda: {'buf': '', 'seq': None})
            coalesce_interval_sec = 0.03  # 30ms flush cadence
            
            # Track recent events to avoid duplicates
            recent_event_hashes = set()
            event_dedup_window = 100  # Keep last 100 event hashes
            
            # Create async streaming callback to handle events from swarm
            # Budget configuration (optional) from request.context.swarm_config
            budget_cfg = {}
            try:
                if request.context and isinstance(request.context, dict):
                    budget_cfg = (request.context.get('swarm_config') or {})
            except Exception:
                budget_cfg = {}
            token_budget = int(budget_cfg.get('token_budget') or 0) or None
            chunk_budget = int(budget_cfg.get('chunk_budget') or 0) or None
            tpm = int(budget_cfg.get('tpm') or 0) or None  # tokens per minute
            rpm = int(budget_cfg.get('rpm') or 0) or None  # chunks per minute
            sample_every = int(_RUNTIME_CONFIG.get('sample_every') or 20)
            min_sample_chars = 20

            async def streaming_callback(**kwargs):
                # Log what we receive for debugging - but only log the keys, not the values
                received_keys = list(kwargs.keys())
                if received_keys:
                    logger.debug(f"Streaming callback received keys: {received_keys}")
                
                # IMPORTANT: Process ONLY the expected fields from HumanLoopAgent
                # HumanLoopAgent sends: type, agent, data (containing chunk)
                event_type = kwargs.get("type", None)
                agent = kwargs.get("agent", None)
                data = kwargs.get("data", None)
                
                # Skip if missing required fields
                if not event_type or not agent:
                    logger.debug(f"Missing required fields: type={event_type}, agent={agent}")
                    return
                
                content = ""
                # Scope by execution_id to this stream
                try:
                    k_exec = None
                    if isinstance(data, dict):
                        k_exec = data.get('execution_id') or kwargs.get('execution_id')
                    else:
                        k_exec = kwargs.get('execution_id')
                    if k_exec and k_exec != execution_id:
                        return
                except Exception:
                    pass
                
                # Create hash for deduplication - be more specific to avoid false positives
                # For text_generation events, include sequence number if available to avoid dropping ordered chunks
                chunk_text = ""
                sequence_num = None
                if event_type == "text_generation" and isinstance(data, dict):
                    chunk_text = data.get("chunk", "")
                    sequence_num = data.get("sequence")  # Get sequence number if available
                
                # Include sequence number for better deduplication
                # If no sequence, fallback to timestamp bucket
                import time
                timestamp_bucket = int(time.time() * 10)  # 100ms buckets
                
                event_hash = hash((
                    event_type,
                    agent,
                    chunk_text if chunk_text else str(data),  # Use full text for uniqueness
                    sequence_num if sequence_num is not None else timestamp_bucket  # Use sequence or time bucket
                ))
                
                # Skip if we've seen this exact event recently
                if event_hash in recent_event_hashes:
                    logger.debug(f"Skipping duplicate event from {agent}")
                    return
                
                # Add to recent events (use deque for proper FIFO)
                recent_event_hashes.add(event_hash)
                # Don't limit the dedup window - just clear it periodically
                if len(recent_event_hashes) > event_dedup_window * 2:
                    # Clear half the hashes to prevent memory growth
                    recent_event_hashes.clear()
                
                # Handle different event types based on what HumanLoopAgent sends
                # text_generation events contain streaming chunks
                if event_type == "text_generation" and data:
                    # Extract chunk content and sequence from data dict
                    if isinstance(data, dict):
                        content = data.get("chunk", "")
                        sequence = data.get("sequence")  # Preserve sequence number
                    else:
                        content = str(data) if data else ""
                        sequence = None

                    # Coalesce per-agent tiny chunks and return quickly
                    if content and agent:
                        # Update metrics
                        _stream_metrics[execution_id][agent]['last_sequence'] = max(_stream_metrics[execution_id][agent]['last_sequence'], sequence or 0)
                        _stream_metrics[execution_id][agent]['chunks'] += 1
                        _stream_metrics[execution_id][agent]['chars'] += len(content)

                        # Budget checks (approximate tokens by words)
                        approx_tokens = max(1, len(content.split()))
                        bs = _budget_state[execution_id]
                        now = _now_ts()
                        while bs['tokens_last_min'] and now - bs['tokens_last_min'][0][0] > 60:
                            bs['tokens_last_min'].popleft()
                        while bs['requests_last_min'] and now - bs['requests_last_min'][0] > 60:
                            bs['requests_last_min'].popleft()
                        bs['tokens_last_min'].append((now, approx_tokens))
                        bs['requests_last_min'].append(now)
                        bs['tokens_total'] += approx_tokens
                        bs['chunks_total'] += 1

                        over_token_budget = token_budget is not None and bs['tokens_total'] > token_budget
                        over_chunk_budget = chunk_budget is not None and bs['chunks_total'] > chunk_budget
                        over_tpm = tpm is not None and sum(t for _, t in bs['tokens_last_min']) > tpm
                        over_rpm = rpm is not None and len(bs['requests_last_min']) > rpm
                        if over_token_budget or over_chunk_budget or over_tpm or over_rpm:
                            if not bs['budget_exceeded'] or (now - bs['last_rate_limit_notice'] > 2.0):
                                notice = {
                                    "type": "rate_limited",
                                    "agent": agent,
                                    "data": {
                                        "over_token_budget": bool(over_token_budget),
                                        "over_chunk_budget": bool(over_chunk_budget),
                                        "over_tpm": bool(over_tpm),
                                        "over_rpm": bool(over_rpm)
                                    },
                                    "timestamp": datetime.now().isoformat(),
                                    "execution_id": execution_id
                                }
                                try:
                                    event_queue.put_nowait(notice)
                                except asyncio.QueueFull:
                                    pass
                                bs['budget_exceeded'] = True
                                bs['last_rate_limit_notice'] = now
                            return  # Drop this tiny chunk due to budget

                        # Coalesce small chunks per agent
                        cb = coalesce_buffers[agent]
                        cb['buf'] += content
                        if sequence is not None:
                            cb['seq'] = sequence
                        # Persist sampled partial text for audit (offload) using raw content
                        if sequence and sequence % sample_every == 0 and len(content) >= min_sample_chars:
                            try:
                                _audit_queue.put_nowait({
                                    'execution_id': execution_id,
                                    'event_type': 'text_generation_sample',
                                    'agent': agent,
                                    'data': {'sequence': sequence, 'sample': content[:500], 'len': len(content)}
                                })
                            except asyncio.QueueFull:
                                pass
                        return  # Return: actual SSE emit is in coalescer
                        
                elif event_type == "agent_completed":
                    # Agent has completed - flush coalesced buffer then send completion
                    try:
                        cb = coalesce_buffers.get(agent or '', None)
                        if cb and cb.get('buf'):
                            ev = TextGenerationEvent(
                                agent=agent or kwargs.get("source", "unknown"),
                                data={
                                    "chunk": cb['buf'],
                                    "sequence": cb.get('seq'),
                                    "execution_id": execution_id
                                },
                                execution_id=execution_id
                            ).dict()
                            # Best effort enqueue
                            try:
                                event_queue.put_nowait(ev)
                            except asyncio.QueueFull:
                                pass
                            cb['buf'] = ''
                    except Exception:
                        pass
                    agent_output_event = AgentCompletedEvent(
                        agent=agent or kwargs.get("source", "unknown"),
                        role="assistant",
                        execution_id=execution_id
                    ).dict()
                    # CRITICAL: Completion events MUST be delivered - use await
                    # This is a control event that signals agent done, never drop it
                    try:
                        # If queue is >80% full, make room by dropping some text chunks
                        # This keeps latency low by preventing congestion
                        queue_threshold = int(event_queue.maxsize * 0.8)  # 80% threshold
                        if event_queue.qsize() >= queue_threshold:
                            logger.warning(f"Queue full for agent_completed, making room...")
                            # Try to remove a text_generation event to make space
                            temp_items = []
                            made_room = False
                            for _ in range(min(10, event_queue.qsize())):
                                try:
                                    item = event_queue.get_nowait()
                                    if item.get('type') == 'text_generation' and not made_room:
                                        # Drop this text chunk to make room
                                        logger.debug("Dropped text chunk to make room for completion")
                                        made_room = True
                                    else:
                                        temp_items.append(item)
                                except asyncio.QueueEmpty:
                                    break
                            # Put back the items we're keeping
                            for item in temp_items:
                                event_queue.put_nowait(item)
                        
                        # Now queue the completion event
                        await event_queue.put(agent_output_event)
                        logger.info(f"✅ Queued agent_completed from {agent}")
                    except Exception as e:
                        logger.error(f"Failed to queue agent_completed from {agent}: {e}")
                    return  # IMPORTANT: Return here to avoid further processing
                
                elif "current_tool_use" in kwargs and kwargs["current_tool_use"]:
                    tool = kwargs["current_tool_use"]
                    event_type = "tool"
                    agent = tool.get("name", "unknown")
                    content = json.dumps(tool.get("input", {}))
                elif "message" in kwargs:
                    msg = kwargs["message"]
                    event_type = "message"
                    content = msg.get("content", "")
                    agent = msg.get("role", "assistant")
                elif "result" in kwargs:
                    event_type = "complete"
                    result = kwargs["result"]
                    if hasattr(result, "output"):
                        content = result.output
                    else:
                        content = str(result)
                else:
                    # No recognized event type, skip
                    return
                        
                # Get agent name from various sources
                if not agent:
                    agent = kwargs.get("agent", kwargs.get("source", "coordinator"))
                
                # Create event for non-delta types (delta already handled above)
                if event_type != "delta":
                    event = BusEvent(
                        type=event_type,
                        agent=agent,
                        content=content,
                        execution_id=execution_id
                    ).dict()
                    
                    # Queue the event (non-blocking)
                    try:
                        await event_queue.put(event)
                        logger.debug(f"Queued event type: {event_type} from {agent}")
                    except asyncio.QueueFull:
                        logger.warning(f"Queue full, dropping event: {event_type} from {agent}")
                        # Still append to pending_events for later flush
                        pending_events.append(event)

                # Persist select non-chunk events for audit (offload)
                if event_type in ("message", "tool", "complete"):
                    try:
                        _audit_queue.put_nowait({
                            'execution_id': execution_id,
                            'event_type': event_type,
                            'agent': agent,
                            'data': {'content': content} if content else {}
                        })
                    except asyncio.QueueFull:
                        pass
            
            # Track if streaming should continue
            streaming_active = True
            
            # Flush pending events periodically while streaming is active
            async def flush_pending_events():
                while streaming_active:
                    await asyncio.sleep(0.1)  # Check every 100ms
                    # Process up to 10 pending events at a time to avoid blocking
                    batch_size = min(10, len(pending_events))
                    for _ in range(batch_size):
                        if not pending_events:
                            break
                        event = pending_events.popleft()  # O(1) operation with deque
                        try:
                            # Use put_nowait to avoid blocking
                            event_queue.put_nowait(event)
                            logger.debug(f"Flushed pending event for agent: {event.get('agent')}")
                        except asyncio.QueueFull:
                            # Put it back if queue is full
                            pending_events.appendleft(event)  # O(1) operation with deque
                            break
                        except Exception as e:
                            logger.error(f"Failed to flush event: {e}")
            
            # Start the event flusher
            flusher_task = asyncio.create_task(flush_pending_events())
            # Background audit persister (batch DB commits)
            async def persist_audit_events():
                try:
                    while streaming_active:
                        batch = []
                        try:
                            item = await asyncio.wait_for(_audit_queue.get(), timeout=0.25)
                            batch.append(item)
                        except asyncio.TimeoutError:
                            pass
                        for _ in range(200):
                            try:
                                batch.append(_audit_queue.get_nowait())
                            except asyncio.QueueEmpty:
                                break
                        if not batch:
                            continue
                        try:
                            async with AsyncSessionLocal() as session:
                                for ev in batch:
                                    ee = ExecutionEvent(
                                        execution_id=ev['execution_id'],
                                        event_type=ev['event_type'],
                                        agent=ev.get('agent'),
                                        data=ev.get('data') or {}
                                    )
                                    session.add(ee)
                                await session.commit()
                        except Exception as e:
                            logger.debug(f"Audit persist batch failed: {e}")
                except Exception as e:
                    logger.debug(f"Audit persister exit: {e}")

            audit_task = asyncio.create_task(persist_audit_events())

            # Coalesced buffer periodic flusher
            async def flush_coalesced():
                try:
                    while streaming_active:
                        await asyncio.sleep(coalesce_interval_sec)
                        # Emit coalesced content for each agent
                        for a, cb in list(coalesce_buffers.items()):
                            buf = cb.get('buf')
                            if not buf:
                                continue
                            seq = cb.get('seq') or None
                            try:
                                ev = TextGenerationEvent(
                                    agent=a,
                                    data={"chunk": buf, "sequence": seq, "execution_id": execution_id},
                                    execution_id=execution_id
                                ).dict()
                                event_queue.put_nowait(ev)
                                cb['buf'] = ''
                            except asyncio.QueueFull:
                                # If queue full, keep buffer for next flush
                                pass
                except Exception as e:
                    logger.debug(f"Coalescer exit: {e}")

            coalescer_task = asyncio.create_task(flush_coalesced())
            
            # Start swarm execution in background
            async def run_swarm():
                try:
                    result = await event_swarm_service.execute_swarm_async(
                        request,
                        "test_user",  # Using test user for now
                        streaming_callback,
                        None  # conversation history
                    )
                    
                    # Queue completion event
                    final_ev = {
                        'type': 'complete',
                        'result': str(result.result if hasattr(result, 'result') else result),
                        'timestamp': datetime.now().isoformat(),
                        'execution_id': execution_id
                    }
                    await event_queue.put(final_ev)

                    # Mark execution as completed in DB
                    try:
                        async with AsyncSessionLocal() as session:
                            q = await session.execute(select(SwarmExecution).where(SwarmExecution.execution_id == execution_id))
                            rec = q.scalars().first()
                            if rec:
                                rec.status = DBExecStatus.COMPLETED
                                rec.completed_at = datetime.utcnow()
                                rec.result = final_ev.get('result')
                                await session.commit()
                    except Exception as de:
                        logger.debug(f"Persist completion failed: {de}")
                    
                    # Signal end of stream
                    await event_queue.put(None)
                    
                except Exception as e:
                    # Queue error event
                    await event_queue.put({
                        'type': 'error',
                        'message': str(e),
                        'timestamp': datetime.now().isoformat()
                    })
                    await event_queue.put(None)
            
            # Start swarm execution
            logger.info("Starting swarm execution task")
            swarm_task = asyncio.create_task(run_swarm())
            
            # Stream events from queue
            logger.info("Starting event streaming loop")
            event_count = 0
            last_keepalive = time.time()
            last_queue_log = time.time()

            # If client provided Last-Event-ID, replay any missed events from buffer
            try:
                last_event_id = http_request.headers.get('last-event-id') or http_request.headers.get('Last-Event-ID')
                if last_event_id:
                    last_event_id = int(last_event_id)
                    state = _get_replay_state(execution_id)
                    # Send buffered events with id > last_event_id
                    for eid, payload in list(state['buffer']):
                        if eid > last_event_id:
                            yield _format_sse_with_id(payload, eid)
                    logger.info(f"Replayed SSE events after Last-Event-ID={last_event_id}")
            except Exception as re:
                logger.debug(f"No replay or invalid Last-Event-ID: {re}")
            
            while True:
                # Log queue size periodically to monitor congestion
                current_time = time.time()
                if current_time - last_queue_log >= 5.0:  # Log every 5 seconds
                    queue_size = event_queue.qsize()
                    if queue_size > 100:
                        logger.warning(f"⚠️ Event queue congestion: {queue_size} events pending")
                    elif queue_size > 50:
                        logger.info(f"📊 Event queue size: {queue_size}")
                    last_queue_log = current_time
                
                # Process events efficiently - drain queue aggressively when events are available
                try:
                    # First, check if queue has events without waiting
                    if not event_queue.empty():
                        # Drain more aggressively for low latency
                        batch_size = min(100, event_queue.qsize())
                        for _ in range(batch_size):
                            try:
                                event = event_queue.get_nowait()
                                if event is None:
                                    logger.info("Received None event, ending stream")
                                    streaming_active = False
                                    return
                                
                                event_count += 1
                                event_type = event.get('type', 'unknown')
                                
                                # Log streaming events (less verbose for text chunks)
                                if event_type == 'text_generation':
                                    if event_count % 20 == 0:  # Log every 20th chunk
                                        agent_name = event.get('agent', 'unknown')
                                        logger.info(f"📡 SSE: Sending text chunks to client from {agent_name} ({event_count} total events sent)")
                                else:
                                    logger.info(f"📡 SSE: Sending {event_type} event to client (event #{event_count})")
                                
                                # Send event immediately (buffer + assign id)
                                yield _emit_and_buffer_sse(execution_id, event)
                                
                                # Add flush comment periodically for text chunks
                                if event_type == 'text_generation' and event_count % 10 == 0:
                                    yield f": flush\n\n"
                                    
                            except asyncio.QueueEmpty:
                                break
                    else:
                        # Queue is empty, wait with timeout
                        event = await asyncio.wait_for(event_queue.get(), timeout=0.1)  # Increased timeout
                        
                        if event is None:
                            logger.info("Received None event, ending stream")
                            streaming_active = False
                            return
                        
                        event_count += 1
                        event_type = event.get('type', 'unknown')
                        
                        # Log and send the event
                        if event_type == 'text_generation':
                            if event_count % 20 == 0:
                                agent_name = event.get('agent', 'unknown')
                                logger.info(f"📡 SSE: Sending text chunks to client from {agent_name} ({event_count} total events sent)")
                        else:
                            logger.info(f"📡 SSE: Sending {event_type} event to client (event #{event_count})")
                        
                        yield _emit_and_buffer_sse(execution_id, event)
                    
                except asyncio.TimeoutError:
                    # Send keepalive every second to maintain connection
                    current_time = time.time()
                    if current_time - last_keepalive >= 1.0:
                        hb = {'type': 'keepalive', 'timestamp': datetime.now().isoformat(), 'execution_id': execution_id}
                        yield _emit_and_buffer_sse(execution_id, hb)
                        last_keepalive = current_time
                    
                    # Check if swarm is done
                    if swarm_task.done():
                        # Give a bit more time for remaining events
                        await asyncio.sleep(0.5)
                        if event_queue.empty():
                            logger.info("Swarm task completed and queue empty, ending stream")
                            break
                        
        except Exception as e:
            logger.error(f"Streaming failed: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e), 'timestamp': datetime.now().isoformat()})}\n\n"
        finally:
            # Stop the flush loop
            streaming_active = False
            
            # Clean up
            try:
                flusher_task.cancel()
                await asyncio.sleep(0.1)  # Give time for task to cancel
            except:
                pass
            try:
                audit_task.cancel()
            except:
                pass
            # Stop the coalescer if running
            try:
                coalescer_task.cancel()
            except Exception:
                pass
            try:
                coalescer_task.cancel()
            except:
                pass
            try:
                global_event_bus.off("*", forward_bus_events)
            except:
                pass
            
            # Log final queue state
            remaining = event_queue.qsize()
            if remaining > 0:
                logger.warning(f"⚠️ Stream ending with {remaining} events still in queue")
            if pending_events:
                logger.warning(f"⚠️ Stream ending with {len(pending_events)} pending events")
            
            logger.info("Cleaned up event stream resources")
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering
            "X-Content-Type-Options": "nosniff",
            # Ensure CORS header for cross-origin dev setups (frontend on different port)
            "Access-Control-Allow-Origin": "*"
        }
    )


@router.get("/events")
async def stream_swarm_events(
    current_user: dict = Depends(get_current_user)
):
    """Stream real-time swarm events"""
    async def event_generator():
        """Generate events from event bus"""
        logger.info("Starting event stream for swarm events")
        
        # Send initial connection message
        yield f"data: {json.dumps({'type': 'connected', 'message': 'Event stream connected'})}\n\n"
        
        # Get initial recent events
        recent = global_event_bus.get_recent_events(10)
        for event in recent:
            event_data = {
                'id': event.id,
                'type': event.type,
                'data': event.data,
                'source': event.source,
                'timestamp': event.timestamp
            }
            yield f"data: {json.dumps(event_data)}\n\n"
        
        # Stream new events as they occur
        last_index = len(global_event_bus.event_history)
        keepalive_counter = 0
        
        while True:
            await asyncio.sleep(0.1)
            keepalive_counter += 1
            
            # Check for new events
            current_events = global_event_bus.event_history
            if len(current_events) > last_index:
                for event in current_events[last_index:]:
                    event_data = {
                        'id': event.id,
                        'type': event.type,
                        'data': event.data,
                        'source': event.source,
                        'timestamp': event.timestamp
                    }
                    yield f"data: {json.dumps(event_data)}\n\n"
                last_index = len(current_events)
                keepalive_counter = 0
            
            # Send keepalive every 30 seconds
            if keepalive_counter >= 300:  # 30 seconds
                yield f": keepalive\n\n"
                keepalive_counter = 0
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering
            "X-Content-Type-Options": "nosniff"
        }
    )


@router.post("/human/answer")
async def provide_human_answer(
    question_id: str,
    answer: str,
    current_user: dict = Depends(get_current_user)
):
    """Provide answer to a human question"""
    try:
        await event_swarm_service.provide_human_response(question_id, answer)
        
        # Emit event that answer was provided
        await global_event_bus.emit("human.answered", {
            "question_id": question_id,
            "answer": answer,
            "user": current_user["id"]
        }, source="human")
        
        return {"status": "success", "question_id": question_id}
    except Exception as e:
        logger.error(f"Failed to provide human answer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/human/approve")
async def provide_approval(
    approval_id: str,
    approved: bool,
    reason: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Provide approval decision"""
    try:
        await event_swarm_service.provide_human_approval(approval_id, approved)
        
        # Emit event about approval
        await global_event_bus.emit("human.approval_provided", {
            "approval_id": approval_id,
            "approved": approved,
            "reason": reason,
            "user": current_user["id"]
        }, source="human")
        
        return {"status": "success", "approval_id": approval_id, "approved": approved}
    except Exception as e:
        logger.error(f"Failed to provide approval: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class SpawnAgentRequest(BaseModel):
    role: str
    context: Optional[dict] = None

@router.post("/spawn-agent")
async def spawn_dynamic_agent(
    request: SpawnAgentRequest,
    current_user: dict = Depends(get_current_user)
):
    """Manually spawn a new agent"""
    try:
        # Emit event to spawn agent
        await global_event_bus.emit("agent.needed", {
            "role": request.role,
            "context": request.context or {},
            "requesting_agent": "user",
            "user_id": current_user["id"]
        }, source="user")
        
        return {"status": "success", "message": f"Agent spawn request for {request.role} submitted"}
    except Exception as e:
        logger.error(f"Failed to spawn agent: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/agent-status")
async def get_agent_status(
    current_user: dict = Depends(get_current_user)
):
    """Get status of all active agents"""
    try:
        # Get active agents from event bus
        active_agents = global_event_bus.active_agents
        
        # Get recent agent events
        agent_events = global_event_bus.get_recent_events(20, "agent.*")
        
        return {
            "active_agents": list(active_agents.keys()),
            "recent_events": [
                {
                    "type": e.type,
                    "source": e.source,
                    "timestamp": e.timestamp
                } for e in agent_events
            ]
        }
    except Exception as e:
        logger.error(f"Failed to get agent status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/emit-event")
async def emit_custom_event(
    event_type: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Emit a custom event to the swarm (for testing/debugging)"""
    try:
        await global_event_bus.emit(event_type, {
            **data,
            "emitted_by": current_user["id"],
            "custom": True
        }, source="user")
        
        return {"status": "success", "event_type": event_type}
    except Exception as e:
        logger.error(f"Failed to emit event: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/events-test")
async def stream_swarm_events_test():
    """Test endpoint for streaming events without authentication"""
    async def event_generator():
        """Generate events from event bus"""
        logger.info("[TEST] Starting event stream for swarm events")
        
        # Send initial connection message
        yield f"data: {json.dumps({'type': 'connected', 'message': 'Event stream connected (TEST)'})}\n\n"
        
        # Get initial recent events
        recent = global_event_bus.get_recent_events(10)
        for event in recent:
            event_data = {
                'id': event.id,
                'type': event.type,
                'data': event.data,
                'source': event.source,
                'timestamp': event.timestamp
            }
            yield f"data: {json.dumps(event_data)}\n\n"
        
        # Stream new events as they occur
        last_index = len(global_event_bus.event_history)
        keepalive_counter = 0
        
        while True:
            await asyncio.sleep(0.1)
            keepalive_counter += 1
            
            # Check for new events
            current_events = global_event_bus.event_history
            if len(current_events) > last_index:
                logger.info(f"[TEST] Sending {len(current_events) - last_index} new events")
                for event in current_events[last_index:]:
                    event_data = {
                        'id': event.id,
                        'type': event.type,
                        'data': event.data,
                        'source': event.source,
                        'timestamp': event.timestamp
                    }
                    yield f"data: {json.dumps(event_data)}\n\n"
                last_index = len(current_events)
                keepalive_counter = 0
            
            # Send keepalive every 10 seconds for testing
            if keepalive_counter >= 100:  # 10 seconds
                logger.debug("[TEST] Sending keepalive")
                yield f": keepalive\n\n"
                keepalive_counter = 0
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*"
        }
    )


@router.post("/execute-test")
async def execute_event_swarm_test(
    request: SwarmExecutionRequest
):
    """Test endpoint for event-driven swarm without authentication - returns execution ID for polling"""
    try:
        # Set execution mode to event_driven
        request.execution_mode = "event_driven"
        
        # Generate execution ID
        execution_id = request.execution_id or str(uuid.uuid4())
        request.execution_id = execution_id
        
        # Start execution in background (non-blocking)
        asyncio.create_task(
            event_swarm_service.execute_swarm_async(
                request,
                "test_user",  # Use test user
                None  # No streaming callback needed for polling
            )
        )
        
        # Return immediately with execution ID for polling
        return {
            "execution_id": execution_id,
            "status": "started",
            "message": "[TEST] Event-driven swarm execution started"
        }
        
    except Exception as e:
        logger.error(f"[TEST] Event swarm execution failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# 🚨 EMERGENCY STOP CONTROLS 🚨

class StopRequest(BaseModel):
    execution_id: str
    force: bool = True


@router.post("/stop")
async def stop_execution(
    request: StopRequest,
    current_user: dict = Depends(get_current_user)
):
    """🚨 EMERGENCY STOP - Force stop a specific execution"""
    try:
        logger.warning(f"🚨 EMERGENCY STOP requested for execution {request.execution_id} by user {current_user.get('id')}")
        
        # Stop the specific execution
        success = event_swarm_service.stop_execution(request.execution_id)
        
        # Emit stop event
        await global_event_bus.emit("execution.emergency_stop", {
            "execution_id": request.execution_id,
            "stopped_by": current_user.get("id"),
            "force": request.force,
            "timestamp": datetime.utcnow().isoformat()
        }, source="emergency_stop")
        
        return {
            "execution_id": request.execution_id,
            "status": "stopped",
            "success": success,
            "message": "🛑 Execution stopped successfully"
        }
        
    except Exception as e:
        logger.error(f"Failed to stop execution {request.execution_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to stop execution: {str(e)}")


@router.post("/emergency-stop-all")
async def emergency_stop_all(
    current_user: dict = Depends(get_current_user)
):
    """🚨 NUCLEAR OPTION - Force stop ALL running executions"""
    try:
        logger.error(f"🚨🚨🚨 EMERGENCY STOP ALL requested by user {current_user.get('id')} 🚨🚨🚨")
        
        # Get all active executions and stop them
        stopped_count = 0
        if hasattr(event_swarm_service, 'active_executions'):
            executions_to_stop = list(event_swarm_service.active_executions.keys())
            
            for execution_id in executions_to_stop:
                try:
                    event_swarm_service.stop_execution(execution_id)
                    stopped_count += 1
                    logger.warning(f"🛑 Force stopped execution: {execution_id}")
                except Exception as e:
                    logger.error(f"Failed to stop execution {execution_id}: {e}")
        
        # Emit emergency stop all event
        await global_event_bus.emit("execution.emergency_stop_all", {
            "stopped_count": stopped_count,
            "stopped_by": current_user.get("id"),
            "timestamp": datetime.utcnow().isoformat()
        }, source="emergency_stop_all")
        
        return {
            "status": "emergency_stopped",
            "stopped_executions": stopped_count,
            "message": f"🚨 Emergency stop completed - {stopped_count} executions stopped"
        }
        
    except Exception as e:
        logger.error(f"Emergency stop all failed: {e}")
        raise HTTPException(status_code=500, detail=f"Emergency stop failed: {str(e)}")


@router.get("/status/{execution_id}")
async def get_execution_status(
    execution_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get detailed status of a specific execution"""
    try:
        if hasattr(event_swarm_service, 'get_execution_status'):
            status = event_swarm_service.get_execution_status(execution_id)
        else:
            # Fallback status check
            status = {
                "execution_id": execution_id,
                "status": "unknown", 
                "message": "Status monitoring not available"
            }
            
        return status
        
    except Exception as e:
        logger.error(f"Failed to get status for execution {execution_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Status check failed: {str(e)}")


@router.get("/list-active")
async def list_active_executions(
    current_user: dict = Depends(get_current_user)
):
    """List all currently active executions"""
    try:
        active_executions = []
        
        if hasattr(event_swarm_service, 'active_executions'):
            for execution_id, details in event_swarm_service.active_executions.items():
                active_executions.append({
                    "execution_id": execution_id,
                    "status": details.get("status", "unknown"),
                    "start_time": details.get("start_time"),
                    "user_id": details.get("user_id")
                })
        
        return {
            "active_executions": active_executions,
            "total_count": len(active_executions)
        }
        
    except Exception as e:
        logger.error(f"Failed to list active executions: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list executions: {str(e)}")


# Sequential Execution Control Endpoints

class SequentialControlRequest(BaseModel):
    execution_id: str
    enabled: bool

@router.post("/sequential/control")
async def control_sequential_execution(request: SequentialControlRequest):
    """Enable or disable sequential hierarchical execution for specific execution"""
    try:
        if request.enabled:
            success = event_swarm_service.enable_sequential_execution(request.execution_id)
            message = f"Sequential execution enabled for {request.execution_id}"
        else:
            success = event_swarm_service.disable_sequential_execution(request.execution_id)
            message = f"Sequential execution disabled for {request.execution_id}"
            
        return {
            "success": success,
            "message": message,
            "execution_id": request.execution_id,
            "sequential_enabled": request.enabled
        }
        
    except Exception as e:
        logger.error(f"Failed to control sequential execution: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to control sequential execution: {str(e)}")

@router.get("/sequential/status/{execution_id}")
async def get_sequential_status(execution_id: str):
    """Get sequential execution status for specific execution"""
    try:
        status = event_swarm_service.get_sequential_status(execution_id)
        return {
            "execution_id": execution_id,
            "sequential_status": status
        }
        
    except Exception as e:
        logger.error(f"Failed to get sequential status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get sequential status: {str(e)}")
