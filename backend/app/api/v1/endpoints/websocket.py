from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, status
from typing import Dict, Set
import json
import asyncio
import structlog
from datetime import datetime
import uuid

from app.services.swarm_service import SwarmService
from app.schemas.swarm import SwarmExecutionRequest, SwarmEvent
from app.core.security import get_current_user_ws

logger = structlog.get_logger()
router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.user_sessions: Dict[str, Set[str]] = {}
    
    async def connect(self, websocket: WebSocket, client_id: str, user_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        
        if user_id not in self.user_sessions:
            self.user_sessions[user_id] = set()
        self.user_sessions[user_id].add(client_id)
        
        logger.info("WebSocket connected", client_id=client_id, user_id=user_id)
    
    def disconnect(self, client_id: str, user_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
        
        if user_id in self.user_sessions:
            self.user_sessions[user_id].discard(client_id)
            if not self.user_sessions[user_id]:
                del self.user_sessions[user_id]
        
        logger.info("WebSocket disconnected", client_id=client_id)
    
    async def send_personal_message(self, message: str, client_id: str):
        if client_id in self.active_connections:
            websocket = self.active_connections[client_id]
            await websocket.send_text(message)
    
    async def send_user_message(self, message: str, user_id: str):
        if user_id in self.user_sessions:
            for client_id in self.user_sessions[user_id]:
                await self.send_personal_message(message, client_id)
    
    async def broadcast(self, message: str):
        for client_id, websocket in self.active_connections.items():
            await websocket.send_text(message)


manager = ConnectionManager()


@router.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    # For demo, we'll skip user authentication on WebSocket
    user_id = "demo-user"
    await manager.connect(websocket, client_id, user_id)
    swarm_service = SwarmService()
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Handle different message types
            if message["type"] == "execute_swarm":
                await handle_swarm_execution(
                    websocket, 
                    client_id, 
                    user_id,
                    message["payload"],
                    swarm_service
                )
            
            elif message["type"] == "stop_swarm":
                await swarm_service.stop_execution(message["execution_id"])
                await websocket.send_text(json.dumps({
                    "type": "execution_stopped",
                    "execution_id": message["execution_id"]
                }))
            
            elif message["type"] == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
            
    except WebSocketDisconnect:
        manager.disconnect(client_id, user_id)
    except Exception as e:
        logger.error("WebSocket error", error=str(e), client_id=client_id)
        manager.disconnect(client_id, user_id)


async def handle_swarm_execution(
    websocket: WebSocket,
    client_id: str,
    user_id: str,
    payload: dict,
    swarm_service: SwarmService
):
    """Handle swarm execution with real-time updates"""
    execution_id = str(uuid.uuid4())
    
    # Send execution started event
    await websocket.send_text(json.dumps({
        "type": "execution_started",
        "execution_id": execution_id,
        "timestamp": datetime.utcnow().isoformat()
    }))
    
    # Create callback handler for real-time updates
    async def stream_callback(**kwargs):
        event_data = {
            "type": kwargs.get("type", "unknown"),
            "agent": kwargs.get("agent"),
            "data": kwargs.get("data", {})
        }
        await websocket.send_text(json.dumps({
            "type": "swarm_event",
            "execution_id": execution_id,
            "event": event_data
        }))
    
    try:
        # Execute swarm with streaming
        request = SwarmExecutionRequest(**payload)
        request.execution_id = execution_id
        
        result = await swarm_service.execute_swarm_async(
            request=request,
            user_id=user_id,
            callback_handler=stream_callback
        )
        
        # Send completion event
        await websocket.send_text(json.dumps({
            "type": "execution_completed",
            "execution_id": execution_id,
            "result": result.model_dump(),
            "timestamp": datetime.utcnow().isoformat()
        }))
        
    except Exception as e:
        logger.error("Swarm execution failed", 
                    error=str(e), 
                    execution_id=execution_id)
        
        await websocket.send_text(json.dumps({
            "type": "execution_failed",
            "execution_id": execution_id,
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }))