# schemas/swarm.py
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class ExecutionStatus(str, Enum):
    QUEUED = "queued"
    STARTED = "started"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"


class AgentConfig(BaseModel):
    name: str
    system_prompt: str
    tools: List[str] = []
    description: Optional[str] = None
    icon: Optional[str] = None
    model: Optional[str] = "gpt-4o-mini"  # Default model
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = 16000
    
    class Config:
        # Fix the model_id field warning
        protected_namespaces = ()


class AddAgentRequest(BaseModel):
    session_id: Optional[str] = None
    agent_name: str = Field(..., min_length=1, max_length=100)
    agent_role: str = Field(..., min_length=1, max_length=200)
    agent_description: Optional[str] = Field(None, max_length=500)
    tools: List[str] = []
    model: Optional[str] = "gpt-4o-mini"
    temperature: Optional[float] = 0.7


class AddAgentResponse(BaseModel):
    success: bool
    agent_id: str
    message: str


class SwarmExecutionRequest(BaseModel):
    task: str
    agents: Optional[List[AgentConfig]] = None
    max_handoffs: Optional[int] = 10
    max_iterations: Optional[int] = 50
    execution_timeout: Optional[int] = 300
    node_timeout: Optional[int] = 60
    execution_id: Optional[str] = None
    session_id: Optional[str] = None  # For human-loop compatibility
    background: bool = False
    use_orchestrator: Optional[bool] = True
    context: Optional[Dict[str, Any]] = None  # For preserving session context
    execution_mode: Optional[str] = "auto"  # "sequential", "parallel", or "auto"


class Artifact(BaseModel):
    type: str
    name: str
    content: str
    metadata: Optional[Dict[str, Any]] = None


class SwarmExecutionResponse(BaseModel):
    execution_id: str
    status: ExecutionStatus
    result: Optional[str] = None
    error: Optional[str] = None
    execution_time: Optional[float] = None
    handoffs: int = 0
    tokens_used: int = 0
    agent_sequence: List[str] = []
    artifacts: List[Artifact] = []
    message: Optional[str] = None
    execution_mode: Optional[str] = None  # "sequential" or "parallel"
    execution_details: Optional[Dict[str, Any]] = None  # Mode-specific details


class SwarmEvent(BaseModel):
    type: str
    timestamp: str
    agent: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


class SwarmListResponse(BaseModel):
    executions: List[SwarmExecutionResponse]


class AgentTemplateResponse(BaseModel):
    name: str
    description: str
    tools: List[str]
    system_prompt: str