"""
Human-in-the-Loop API Endpoints
"""
import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from datetime import datetime

from app.services.event_bus import event_bus
from app.services.agent_memory_store import get_memory_store

logger = logging.getLogger(__name__)
router = APIRouter()

# Global tracking of human interactions
_pending_interactions: Dict[str, Dict] = {}
_interaction_responses: Dict[str, Dict] = {}

class HumanInteractionModel(BaseModel):
    id: str
    type: str  # 'question', 'approval', 'handoff'
    agent: str
    execution_id: str
    message: str
    task: Optional[str] = None
    context: Optional[Dict[str, Any]] = None
    timestamp: str
    status: str = "pending"

class HumanResponseModel(BaseModel):
    interaction_id: str
    response_type: str  # 'approve', 'deny', 'respond'
    response_text: Optional[str] = None
    timestamp: str

# Event listeners for human interactions
async def handle_human_question(event):
    """Handle human question events"""
    interaction = {
        "id": event.data["id"],
        "type": "question",
        "agent": event.data["agent"],
        "execution_id": event.data.get("execution_id", "unknown"),
        "message": event.data["question"],
        "context": event.data.get("context", {}),
        "timestamp": datetime.utcnow().isoformat(),
        "status": "pending"
    }
    _pending_interactions[event.data["id"]] = interaction
    logger.info(f"Human question registered: {event.data['id']} from {event.data['agent']}")

async def handle_approval_request(event):
    """Handle human approval requests"""
    logger.info(f"🚨 HANDLER CALLED: handle_approval_request triggered with event: {event.type}")
    logger.info(f"🚨 EVENT DATA: {event.data}")
    
    try:
        interaction = {
            "id": event.data["id"],
            "type": "approval",
            "agent": event.data["agent"],
            "execution_id": event.data["execution_id"],
            "message": event.data["message"],
            "task": event.data.get("task"),
            "context": event.data.get("context", {}),
            "timestamp": datetime.utcnow().isoformat(),
            "status": "pending"
        }
        _pending_interactions[event.data["id"]] = interaction
        logger.info(f"✅ Human approval request registered: {event.data['id']} from {event.data['agent']}")
        logger.info(f"✅ Total pending interactions now: {len(_pending_interactions)}")
    except Exception as e:
        logger.error(f"❌ Failed to register human approval request: {e}")
        logger.error(f"❌ Event data: {event.data}")

async def handle_handoff_request(event):
    """Handle human handoff requests"""
    interaction = {
        "id": event.data["id"],
        "type": "handoff",
        "agent": event.data["agent"],
        "execution_id": event.data["execution_id"],
        "message": event.data["message"],
        "reason": event.data["reason"],
        "complete_handoff": event.data.get("complete_handoff", False),
        "timestamp": datetime.utcnow().isoformat(),
        "status": "pending"
    }
    _pending_interactions[event.data["id"]] = interaction
    logger.info(f"Human handoff request registered: {event.data['id']} from {event.data['agent']}")

# Register event listeners
logger.info("🔧 Registering human-in-the-loop event handlers...")
event_bus.on("human.question", handle_human_question)
event_bus.on("human.approval.needed", handle_approval_request)
event_bus.on("human.handoff.requested", handle_handoff_request)
logger.info("✅ Human-in-the-loop event handlers registered successfully!")

@router.get("/human-interactions/{execution_id}")
async def get_human_interactions(execution_id: str) -> List[HumanInteractionModel]:
    """Get all human interactions for an execution"""
    try:
        logger.info(f"🔍 GET human-interactions called for execution: {execution_id}")
        logger.info(f"🔍 Total pending interactions: {len(_pending_interactions)}")
        logger.info(f"🔍 Pending interaction IDs: {list(_pending_interactions.keys())}")
        
        # Filter interactions by execution ID
        matching_interactions = []
        for interaction in _pending_interactions.values():
            if interaction.get("execution_id") == execution_id:
                logger.info(f"✅ Found matching interaction: {interaction['id']}")
                matching_interactions.append(interaction)
        
        logger.info(f"🔍 Found {len(matching_interactions)} matching interactions")
        
        # Convert to models
        interactions = []
        for interaction in matching_interactions:
            try:
                model = HumanInteractionModel(**interaction)
                interactions.append(model)
                logger.info(f"✅ Successfully converted interaction {interaction['id']} to model")
            except Exception as model_error:
                logger.error(f"❌ Failed to convert interaction {interaction['id']} to model: {model_error}")
                logger.error(f"❌ Interaction data: {interaction}")
        
        logger.info(f"📤 Returning {len(interactions)} interactions for execution {execution_id}")
        return interactions
        
    except Exception as e:
        logger.error(f"❌ Failed to get human interactions: {e}")
        logger.error(f"❌ Exception type: {type(e)}")
        import traceback
        logger.error(f"❌ Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/human-response")
async def submit_human_response(response: HumanResponseModel, background_tasks: BackgroundTasks):
    """Submit human response to an interaction"""
    try:
        interaction_id = response.interaction_id
        
        if interaction_id not in _pending_interactions:
            raise HTTPException(status_code=404, detail="Interaction not found")
        
        interaction = _pending_interactions[interaction_id]
        
        # Store response
        _interaction_responses[interaction_id] = {
            "response_type": response.response_type,
            "response_text": response.response_text,
            "timestamp": response.timestamp
        }
        
        # Mark interaction as responded
        interaction["status"] = "responded"
        
        # Emit appropriate response event based on interaction type
        if interaction["type"] == "question":
            await event_bus.emit(
                f"human.response.{interaction_id}",
                {
                    "answer": response.response_text or "",
                    "timestamp": response.timestamp
                },
                source="human"
            )
            
        elif interaction["type"] == "approval":
            await event_bus.emit(
                f"human.approval.response.{interaction_id}",
                {
                    "response": response.response_type,
                    "instructions": response.response_text,
                    "approved": response.response_type == "approve",
                    "timestamp": response.timestamp
                },
                source="human"
            )
            
        elif interaction["type"] == "handoff":
            if response.response_type == "approve":
                # Continue with instructions
                await event_bus.emit(
                    f"human.handoff.continue.{interaction_id}",
                    {
                        "instructions": response.response_text or "",
                        "timestamp": response.timestamp
                    },
                    source="human"
                )
            else:
                # Complete handoff
                await event_bus.emit(
                    f"human.handoff.complete.{interaction_id}",
                    {
                        "reason": "Human took complete control",
                        "timestamp": response.timestamp
                    },
                    source="human"
                )
        
        # Clean up after successful response
        background_tasks.add_task(cleanup_interaction, interaction_id)
        
        logger.info(f"Human response submitted for interaction {interaction_id}: {response.response_type}")
        
        return {"status": "success", "message": "Response submitted"}
        
    except Exception as e:
        logger.error(f"Failed to submit human response: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def cleanup_interaction(interaction_id: str):
    """Clean up interaction after response"""
    try:
        # Wait a bit for events to be processed
        import asyncio
        await asyncio.sleep(2)
        
        # Remove from pending interactions
        if interaction_id in _pending_interactions:
            del _pending_interactions[interaction_id]
        
        # Clean up old responses (keep for 1 hour)
        # This would be better with a proper database
        
    except Exception as e:
        logger.error(f"Failed to cleanup interaction {interaction_id}: {e}")

@router.get("/execution-memory/{execution_id}")
async def get_execution_memory(execution_id: str):
    """Get memory summary for all agents in an execution"""
    try:
        memory_store = get_memory_store()
        summary = memory_store.get_execution_summary(execution_id)
        
        # Add detailed memory for each agent
        for agent_id in summary.get("agents", {}):
            memory = memory_store.get_agent_memory(agent_id, execution_id)
            if memory:
                summary["agents"][agent_id]["full_memory"] = memory
        
        logger.info(f"Retrieved execution memory for {execution_id}: {len(summary.get('agents', {}))} agents")
        return summary
        
    except Exception as e:
        logger.error(f"Failed to get execution memory: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/agent-memory/{execution_id}/{agent_id}")
async def get_agent_memory(execution_id: str, agent_id: str):
    """Get detailed memory for a specific agent"""
    try:
        memory_store = get_memory_store()
        memory = memory_store.get_agent_memory(agent_id, execution_id)
        
        if not memory:
            raise HTTPException(status_code=404, detail="Agent memory not found")
        
        logger.info(f"Retrieved memory for agent {agent_id} in execution {execution_id}")
        return memory
        
    except Exception as e:
        logger.error(f"Failed to get agent memory: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/export-execution/{execution_id}")
async def export_execution_memory(execution_id: str, background_tasks: BackgroundTasks):
    """Export execution memory to file"""
    try:
        memory_store = get_memory_store()
        output_file = f"execution_{execution_id}_memory.json"
        
        background_tasks.add_task(memory_store.export_execution_memory, execution_id, output_file)
        
        return {
            "status": "success",
            "message": f"Export started for execution {execution_id}",
            "output_file": output_file
        }
        
    except Exception as e:
        logger.error(f"Failed to export execution memory: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/cleanup-old-memories")
async def cleanup_old_memories(background_tasks: BackgroundTasks, days_old: int = 30):
    """Clean up old agent memories"""
    try:
        memory_store = get_memory_store()
        background_tasks.add_task(memory_store.cleanup_old_memories, days_old)
        
        return {
            "status": "success",
            "message": f"Started cleanup of memories older than {days_old} days"
        }
        
    except Exception as e:
        logger.error(f"Failed to start memory cleanup: {e}")
        raise HTTPException(status_code=500, detail=str(e))