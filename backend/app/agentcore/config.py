"""
AgentCore Configuration

Settings for AWS services, regions, and feature flags.
"""
from pydantic_settings import BaseSettings
from typing import Optional


class AgentCoreSettings(BaseSettings):
    """Configuration for AWS AgentCore services"""

    # AWS Configuration
    AWS_REGION: str = "us-west-2"
    AWS_ACCOUNT_ID: Optional[str] = None

    # Feature Flags
    ENABLE_MEMORY: bool = True
    ENABLE_GATEWAY: bool = True
    ENABLE_CODE_INTERPRETER: bool = True
    ENABLE_OBSERVABILITY: bool = True
    ENABLE_DYNAMODB_SESSION: bool = False

    # DynamoDB Configuration (optional)
    DYNAMODB_SESSION_TABLE: str = "agentcore-sessions"
    DYNAMODB_AGENTS_TABLE: str = "agentcore-agents"

    # Memory Configuration
    MEMORY_EVENT_EXPIRY_DAYS: int = 7
    MEMORY_DEFAULT_STRATEGY: str = "semantic"

    # Model Configuration
    DEFAULT_MODEL_ID: str = "us.anthropic.claude-sonnet-4-20250514-v1:0"
    DEFAULT_MODEL_TEMPERATURE: float = 0.7
    DEFAULT_MAX_TOKENS: int = 4096

    # Session Configuration
    SESSION_EXPIRY_SECONDS: int = 3600  # 1 hour
    MAX_CACHED_SESSIONS: int = 100

    # Observability
    CLOUDWATCH_LOG_GROUP: str = "/aws/agentcore/agents"
    ENABLE_XRAY: bool = True

    class Config:
        env_file = ".env"
        env_prefix = "AGENTCORE_"


settings = AgentCoreSettings()
