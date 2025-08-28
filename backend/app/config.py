from typing import Optional, List
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
import os


class Settings(BaseSettings):
    # App Settings
    APP_NAME: str = "Strands Swarm API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    API_V1_STR: str = "/api/v1"
    
    # Server Settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 4
    
    # CORS Settings
    BACKEND_CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3001,http://localhost:5173,http://localhost:3002"
    
    def get_cors_origins(self) -> List[str]:
        """Parse CORS origins from comma-separated string"""
        return [origin.strip() for origin in self.BACKEND_CORS_ORIGINS.split(",")]
    
    # Database (SQLite)
    DATABASE_URL: str = "sqlite+aiosqlite:///./strands_swarm.db"
    
    # Security
    SECRET_KEY: str = "your-secret-key-change-this"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # OpenAI Settings
    OPENAI_API_KEY: str = "your-openai-api-key-here"
    
    # Tavily Settings
    TAVILY_API_KEY: Optional[str] = None
    
    # Additional API Keys
    ANTHROPIC_API_KEY: Optional[str] = None
    GOOGLE_API_KEY: Optional[str] = None
    GOOGLE_CX: Optional[str] = None
    SERP_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    
    # AWS Settings for Bedrock
    AWS_REGION: str = "us-west-2"
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_SESSION_TOKEN: Optional[str] = None
    
    # Strands Agent Settings
    DEFAULT_MODEL_ID: str = "gpt-4o"
    DEFAULT_MAX_TOKENS: int = 16000
    STRANDS_MAX_TOKENS: int = 16000
    MAX_HANDOFFS: int = 20
    MAX_ITERATIONS: int = 20
    EXECUTION_TIMEOUT: float = 900.0
    NODE_TIMEOUT: float = 300.0
    
    # Enhanced Swarm Service
    USE_ENHANCED_SWARM: bool = True
    
    # WebSocket Settings
    WS_MESSAGE_QUEUE_SIZE: int = 100
    WS_HEARTBEAT_INTERVAL: int = 30
    
    # Rate Limiting
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_PERIOD: int = 60
    
    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    
    # Redis Settings
    REDIS_URL: Optional[str] = "redis://localhost:6379/0"
    REDIS_CACHE_TTL: int = 3600  # 1 hour default TTL
    REDIS_MAX_CONNECTIONS: int = 50
    
    # Task Queue (Can be enabled with Redis)
    CELERY_BROKER_URL: Optional[str] = None
    CELERY_RESULT_BACKEND: Optional[str] = None
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True
    )


def get_settings() -> Settings:
    return Settings()


settings = get_settings()