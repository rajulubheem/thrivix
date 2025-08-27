"""
Application configuration settings
"""
import os
from typing import Optional, List, Union
from pydantic_settings import BaseSettings
from pydantic import Field, field_validator


class Settings(BaseSettings):
    """Application settings with environment variable support"""
    
    # API Settings
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Strands AI Agent"
    VERSION: str = "1.0.0"
    
    # Database
    DATABASE_URL: str = "sqlite:///./strands_swarm.db"
    
    # Redis (optional, for distributed deployments)
    REDIS_URL: Optional[str] = Field(default=None)
    
    # Streaming Configuration
    STREAMING_SESSION_TTL: int = 300  # 5 minutes
    STREAMING_MAX_POLL_TIMEOUT: int = 30  # seconds
    STREAMING_CLEANUP_INTERVAL: int = 60  # seconds
    
    # Rate Limiting
    RATE_LIMIT_REQUESTS_PER_MINUTE: int = 60
    RATE_LIMIT_EXCLUDE_PATHS: List[str] = Field(default=["/streaming/poll/", "/health"])
    
    # CORS - will be parsed from comma-separated string if set in env
    BACKEND_CORS_ORIGINS: Union[List[str], str] = Field(
        default=[
            "http://localhost:3000",
            "http://localhost:8000", 
            "http://127.0.0.1:3000",
            "http://127.0.0.1:8000",
        ]
    )
    
    @field_validator('BACKEND_CORS_ORIGINS', mode='before')
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            # Parse comma-separated string
            return [origin.strip() for origin in v.split(',')]
        return v
    
    # OpenAI Configuration
    OPENAI_API_KEY: str = Field(default="")
    DEFAULT_MODEL: str = "gpt-4o"
    DEFAULT_TEMPERATURE: float = 0.7
    DEFAULT_MAX_TOKENS: int = 16000
    
    # Execution Limits
    MAX_HANDOFFS: int = 20
    MAX_ITERATIONS: int = 20
    EXECUTION_TIMEOUT: int = 900  # 15 minutes
    NODE_TIMEOUT: int = 300  # 5 minutes
    
    # Logging
    LOG_LEVEL: str = Field(default="INFO")
    LOG_FORMAT: str = "json"  # or "console"
    
    # Development
    DEBUG: bool = Field(default=False)
    RELOAD: bool = Field(default=False)
    
    # Feature Flags
    USE_REALTIME_STREAMING: bool = Field(default=False)  # Disable for now until fixed
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"  # Ignore extra fields in .env file


# Create global settings instance
settings = Settings()