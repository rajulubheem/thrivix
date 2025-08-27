from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class MessageType(str, Enum):
    TEXT = "text"
    TOOL_USE = "tool_use"
    TOOL_RESULT = "tool_result"
    AGENT_HANDOFF = "agent_handoff"


class ChatMessageCreate(BaseModel):
    content: str
    role: MessageRole
    message_type: MessageType = MessageType.TEXT
    message_metadata: Optional[Dict[str, Any]] = None
    agent_name: Optional[str] = None
    agent_role: Optional[str] = None
    execution_id: Optional[str] = None
    parent_message_id: Optional[str] = None


class ChatMessageUpdate(BaseModel):
    content: Optional[str] = None
    message_metadata: Optional[Dict[str, Any]] = None
    is_deleted: Optional[bool] = None


class ChatMessageResponse(BaseModel):
    id: int
    message_id: str
    session_id: str
    role: MessageRole
    message_type: MessageType
    content: str
    message_metadata: Optional[Dict[str, Any]] = None
    agent_name: Optional[str] = None
    agent_role: Optional[str] = None
    execution_id: Optional[str] = None
    parent_message_id: Optional[str] = None
    is_deleted: bool
    is_edited: bool
    edit_count: int
    tokens_used: int
    processing_time: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChatSessionCreate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    agents_config: Optional[Dict[str, Any]] = None
    max_handoffs: int = 20
    max_iterations: int = 20


class ChatSessionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    agents_config: Optional[Dict[str, Any]] = None
    max_handoffs: Optional[int] = None
    max_iterations: Optional[int] = None
    is_active: Optional[bool] = None
    is_archived: Optional[bool] = None


class ChatSessionResponse(BaseModel):
    id: int
    session_id: str
    user_id: str
    title: Optional[str] = None
    description: Optional[str] = None
    agents_config: Optional[Dict[str, Any]] = None
    max_handoffs: int
    max_iterations: int
    is_active: bool
    is_archived: bool
    last_message_at: Optional[datetime] = None
    message_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChatSessionWithMessages(ChatSessionResponse):
    messages: List[ChatMessageResponse] = []


class ChatSessionSummary(BaseModel):
    id: int
    session_id: str
    title: Optional[str] = None
    last_message_at: Optional[datetime] = None
    message_count: int
    is_active: bool
    is_archived: bool
    created_at: datetime


class MessageSearchRequest(BaseModel):
    query: str
    session_id: Optional[str] = None
    role: Optional[MessageRole] = None
    message_type: Optional[MessageType] = None
    agent_name: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    limit: int = Field(default=50, le=500)
    offset: int = Field(default=0, ge=0)


class SessionSearchRequest(BaseModel):
    query: Optional[str] = None
    is_active: Optional[bool] = None
    is_archived: Optional[bool] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    limit: int = Field(default=20, le=100)
    offset: int = Field(default=0, ge=0)


class MessageSearchResponse(BaseModel):
    messages: List[ChatMessageResponse]
    total: int
    limit: int
    offset: int


class SessionSearchResponse(BaseModel):
    sessions: List[ChatSessionSummary]
    total: int
    limit: int
    offset: int


class ChatExecuteRequest(BaseModel):
    message: str
    agents_config: Optional[Dict[str, Any]] = None
    execution_mode: str = "sequential"
    max_handoffs: Optional[int] = None
    max_iterations: Optional[int] = None