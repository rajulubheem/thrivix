"""
Pydantic schemas for SSE event payloads used by the event-driven swarm.
"""
from typing import Optional, Dict, Any, Literal
from pydantic import BaseModel, Field
from datetime import datetime


class BaseSSEEvent(BaseModel):
    type: str
    agent: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    execution_id: Optional[str] = None
    # Free-form envelope fields
    data: Optional[Dict[str, Any]] = None
    content: Optional[str] = None
    role: Optional[str] = None


class TextGenerationEvent(BaseSSEEvent):
    type: Literal["text_generation"] = "text_generation"
    data: Dict[str, Any]


class AgentCompletedEvent(BaseSSEEvent):
    type: Literal["agent_completed"] = "agent_completed"
    complete: bool = True


class BusEvent(BaseSSEEvent):
    # Accepts arbitrary bus types but enforces standard envelope
    pass
