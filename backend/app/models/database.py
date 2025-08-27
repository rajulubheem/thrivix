from sqlalchemy import Column, Integer, String, Text, DateTime, Float, Enum, Boolean, JSON, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import enum
import uuid

Base = declarative_base()


class ExecutionStatus(enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class MessageRole(enum.Enum):
    user = "user"
    assistant = "assistant"
    system = "system"


class MessageType(enum.Enum):
    text = "text"
    tool_use = "tool_use"
    tool_result = "tool_result"
    agent_handoff = "agent_handoff"


class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True)
    username = Column(String, nullable=False, unique=True)
    email = Column(String, nullable=True)
    created_at = Column(DateTime, default=func.now())
    last_active = Column(DateTime, default=func.now())


class SwarmExecution(Base):
    __tablename__ = "swarm_executions"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    execution_id = Column(String, unique=True, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    
    # Request data
    task = Column(Text, nullable=False)
    agents_config = Column(JSON, nullable=False)  # Store agent configurations as JSON
    max_handoffs = Column(Integer, default=20)
    max_iterations = Column(Integer, default=20)
    execution_timeout = Column(Float, default=900.0)
    node_timeout = Column(Float, default=300.0)
    
    # Execution results
    status = Column(Enum(ExecutionStatus), default=ExecutionStatus.PENDING, nullable=False)
    result = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    
    # Metrics
    execution_time = Column(Float, nullable=True)
    handoffs = Column(Integer, default=0)
    tokens_used = Column(Integer, default=0)
    agent_sequence = Column(JSON, nullable=True)  # Array of agent names
    artifacts = Column(JSON, nullable=True)  # Array of artifacts
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)


class ExecutionEvent(Base):
    __tablename__ = "execution_events"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    execution_id = Column(String, nullable=False, index=True)
    
    event_type = Column(String, nullable=False)  # agent_started, tool_use, etc.
    agent = Column(String, nullable=True)
    data = Column(JSON, nullable=True)
    timestamp = Column(DateTime, default=func.now())


class AgentTemplate(Base):
    __tablename__ = "agent_templates"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(Text, nullable=True)
    system_prompt = Column(Text, nullable=False)
    tools = Column(JSON, nullable=False)  # Array of tool names
    category = Column(String, nullable=False)
    icon = Column(String, nullable=True)
    is_system = Column(Boolean, default=True)  # System vs user-created
    created_by = Column(String, nullable=True)  # User ID if user-created
    created_at = Column(DateTime, default=func.now())


class SSEConnection(Base):
    __tablename__ = "sse_connections"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    connection_id = Column(String, unique=True, nullable=False)
    execution_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=func.now())
    last_ping = Column(DateTime, default=func.now())


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, unique=True, nullable=False, default=lambda: str(uuid.uuid4()), index=True)
    user_id = Column(String, nullable=False, index=True)
    
    # Session metadata
    title = Column(String, nullable=True)  # Auto-generated or user-defined
    description = Column(Text, nullable=True)
    
    # Session configuration
    agents_config = Column(JSON, nullable=True)  # Last used agent configuration
    max_handoffs = Column(Integer, default=20)
    max_iterations = Column(Integer, default=20)
    
    # Session state
    is_active = Column(Boolean, default=True)
    is_archived = Column(Boolean, default=False)
    last_message_at = Column(DateTime, nullable=True)
    message_count = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    message_id = Column(String, unique=True, nullable=False, default=lambda: str(uuid.uuid4()), index=True)
    session_id = Column(String, ForeignKey("chat_sessions.session_id"), nullable=False, index=True)
    
    # Message content
    role = Column(Enum(MessageRole), nullable=False)
    message_type = Column(Enum(MessageType), default=MessageType.text, nullable=False)
    content = Column(Text, nullable=False)
    message_metadata = Column(JSON, nullable=True)  # Tool calls, agent info, etc.
    
    # Agent information
    agent_name = Column(String, nullable=True)
    agent_role = Column(String, nullable=True)
    
    # Execution context
    execution_id = Column(String, nullable=True, index=True)  # Link to SwarmExecution
    parent_message_id = Column(String, ForeignKey("chat_messages.message_id"), nullable=True)
    
    # Message state
    is_deleted = Column(Boolean, default=False)
    is_edited = Column(Boolean, default=False)
    edit_count = Column(Integer, default=0)
    
    # Search and filtering
    tokens_used = Column(Integer, default=0)
    processing_time = Column(Float, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    session = relationship("ChatSession", back_populates="messages")
    replies = relationship("ChatMessage", backref="parent", remote_side=[message_id])