"""
Pydantic Schemas for AgentCore

Data models for agents, sessions, memory, and gateways based on real
AWS AgentCore API structures.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime
from enum import Enum


# ============================================================================
# Agent Schemas
# ============================================================================

class ModelConfig(BaseModel):
    """Model configuration for Bedrock models"""
    model_id: str = Field(
        default="us.anthropic.claude-sonnet-4-20250514-v1:0",
        description="Bedrock model ID"
    )
    temperature: float = Field(default=0.7, ge=0.0, le=1.0)
    max_tokens: int = Field(default=4096, ge=1, le=200000)
    top_p: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    top_k: Optional[int] = Field(default=None, ge=0)
    stop_sequences: Optional[List[str]] = None


class AgentType(str, Enum):
    """Agent types/personas"""
    AUTOMATION = "automation"
    PERSONA = "persona"
    TASK_SPECIFIC = "task_specific"
    RESEARCH = "research"
    CUSTOMER_SUPPORT = "customer_support"
    DATA_ANALYST = "data_analyst"


class AgentCreate(BaseModel):
    """Request schema for creating an agent"""
    name: str = Field(..., description="Agent name")
    agent_type: AgentType = Field(default=AgentType.PERSONA)
    character: Optional[str] = Field(
        None,
        description="Character description for persona agents"
    )
    system_prompt: str = Field(..., description="System prompt for the agent")
    user_prompt: Optional[str] = Field(
        None,
        description="Default user prompt/instructions"
    )
    model_config: ModelConfig = Field(default_factory=ModelConfig)

    # Memory configuration
    memory_id: Optional[str] = Field(None, description="Existing memory resource ID")
    memory_type: Literal["short_term", "long_term", "both"] = "both"
    create_memory: bool = Field(
        default=True,
        description="Auto-create memory resource if memory_id not provided"
    )

    # Session configuration
    session_expiry: int = Field(
        default=3600,
        description="Session expiry in seconds",
        ge=60,
        le=86400
    )

    # Tools configuration
    tools_enabled: bool = True
    tools: Optional[List[str]] = Field(
        None,
        description="List of tool names to enable (e.g., ['web_search', 'calculator'])"
    )
    gateway_id: Optional[str] = Field(None, description="Gateway ID for additional tools")

    # Knowledge Base
    knowledge_base_id: Optional[str] = Field(
        None,
        description="Bedrock Knowledge Base ID"
    )

    # Code Interpreter
    code_interpreter_enabled: bool = False

    # Skills (Claude-specific)
    skills: Optional[List[str]] = Field(None, description="Enabled skills")

    # Metadata
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AgentResponse(BaseModel):
    """Response schema for agent"""
    agent_id: str
    name: str
    agent_type: AgentType
    character: Optional[str] = None
    system_prompt: str
    model_config: ModelConfig
    memory_id: Optional[str] = None
    memory_type: str
    session_expiry: int
    tools_enabled: bool
    tools: Optional[List[str]] = None
    gateway_id: Optional[str] = None
    knowledge_base_id: Optional[str] = None
    code_interpreter_enabled: bool
    skills: Optional[List[str]] = None
    metadata: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    status: Literal["active", "inactive", "error"] = "active"


class AgentUpdate(BaseModel):
    """Schema for updating an agent"""
    name: Optional[str] = None
    character: Optional[str] = None
    system_prompt: Optional[str] = None
    model_config: Optional[ModelConfig] = None
    tools_enabled: Optional[bool] = None
    tools: Optional[List[str]] = None
    gateway_id: Optional[str] = None
    knowledge_base_id: Optional[str] = None
    code_interpreter_enabled: Optional[bool] = None
    skills: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None
    status: Optional[Literal["active", "inactive", "error"]] = None


# ============================================================================
# Session Schemas
# ============================================================================

class SessionCreate(BaseModel):
    """Create a new session"""
    agent_id: str
    actor_id: str = Field(..., description="User/actor identifier")
    session_metadata: Dict[str, Any] = Field(default_factory=dict)


class SessionResponse(BaseModel):
    """Session response"""
    session_id: str
    agent_id: str
    actor_id: str
    created_at: datetime
    expires_at: datetime
    last_active: datetime
    message_count: int = 0
    session_metadata: Dict[str, Any] = Field(default_factory=dict)
    status: Literal["active", "expired", "closed"] = "active"


# ============================================================================
# Memory Schemas
# ============================================================================

class MemoryStrategyType(str, Enum):
    """Memory strategy types from AgentCore"""
    SEMANTIC = "semantic"
    SUMMARY = "summary"
    USER_PREFERENCE = "user_preference"
    CUSTOM = "custom"


class MemoryStrategy(BaseModel):
    """Memory strategy configuration"""
    strategy_type: MemoryStrategyType
    name: str
    description: Optional[str] = None
    namespaces: List[str] = Field(
        default_factory=lambda: ["agent/{agentId}/memory/{actorId}"]
    )
    # Custom strategy configuration
    extraction_prompt: Optional[str] = None
    consolidation_prompt: Optional[str] = None
    extraction_model_id: Optional[str] = None


class MemoryCreate(BaseModel):
    """Create memory resource"""
    name: str
    description: Optional[str] = None
    event_expiry_days: int = Field(default=7, ge=1, le=365)
    strategies: List[MemoryStrategy] = Field(
        default_factory=lambda: [
            MemoryStrategy(
                strategy_type=MemoryStrategyType.SEMANTIC,
                name="FactExtractor",
                description="Extract factual information"
            )
        ]
    )


class MemoryResponse(BaseModel):
    """Memory resource response"""
    memory_id: str
    name: str
    description: Optional[str] = None
    event_expiry_days: int
    strategies: List[MemoryStrategy]
    created_at: datetime
    status: Literal["active", "creating", "error"] = "active"


class ConversationalEvent(BaseModel):
    """Conversational event for memory"""
    role: Literal["USER", "ASSISTANT"]
    content: str


class EventCreate(BaseModel):
    """Create memory event (conversation)"""
    memory_id: str
    actor_id: str
    session_id: str
    events: List[ConversationalEvent]
    event_timestamp: Optional[int] = None  # Unix timestamp


# ============================================================================
# Gateway Schemas
# ============================================================================

class GatewayTargetType(str, Enum):
    """Gateway target types"""
    LAMBDA = "lambda"
    OPENAPI = "openapi"
    SMITHY = "smithy"
    MCP_SERVER = "mcp_server"


class LambdaTarget(BaseModel):
    """Lambda function target"""
    function_arn: str
    tool_name: str
    tool_description: str
    input_schema: Dict[str, Any]


class OpenAPITarget(BaseModel):
    """OpenAPI specification target"""
    spec: List[Dict[str, Any]]  # Array of tool definitions


class GatewayCreate(BaseModel):
    """Create gateway"""
    name: str
    description: Optional[str] = None
    enable_semantic_search: bool = True
    jwt_authorizer_config: Optional[Dict[str, Any]] = None


class GatewayTargetCreate(BaseModel):
    """Add target to gateway"""
    gateway_id: str
    target_type: GatewayTargetType
    target_config: Dict[str, Any]


class GatewayResponse(BaseModel):
    """Gateway response"""
    gateway_id: str
    name: str
    description: Optional[str] = None
    endpoint_url: str
    enable_semantic_search: bool
    created_at: datetime
    status: Literal["active", "creating", "error"] = "active"


# ============================================================================
# Agent Invocation Schemas
# ============================================================================

class AgentInvokeRequest(BaseModel):
    """Request to invoke an agent"""
    prompt: str
    session_id: Optional[str] = None
    actor_id: str = Field(..., description="User/actor identifier")
    stream: bool = False
    include_memory: bool = True
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None


class AgentInvokeResponse(BaseModel):
    """Response from agent invocation"""
    agent_id: str
    session_id: str
    response: str
    model_id: str
    tokens_used: Optional[int] = None
    memory_used: bool = False
    tools_called: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
