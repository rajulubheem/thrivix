"""
AgentCore FastAPI Application

Production-ready FastAPI app for AWS Fargate deployment.
Integrates Strands Agents with AWS Bedrock AgentCore services.

Based on patterns from:
- amazon-bedrock-agentcore-samples
- strands-agents/samples
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import structlog

from app.agentcore.config import settings
from app.agentcore.api import agents, sessions, memory, gateways
from app.utils.logging import setup_logging

# Setup logging
setup_logging()
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle management"""
    logger.info(
        "Starting AgentCore Application",
        region=settings.AWS_REGION,
        features={
            "memory": settings.ENABLE_MEMORY,
            "gateway": settings.ENABLE_GATEWAY,
            "code_interpreter": settings.ENABLE_CODE_INTERPRETER,
            "observability": settings.ENABLE_OBSERVABILITY
        }
    )

    yield

    logger.info("Shutting down AgentCore Application")


# Create FastAPI app
app = FastAPI(
    title="AgentCore API",
    description="AWS Bedrock AgentCore + Strands Agents Integration",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(agents.router, prefix="/api/v1")
app.include_router(sessions.router, prefix="/api/v1")
app.include_router(memory.router, prefix="/api/v1")
app.include_router(gateways.router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    """Health check endpoint for ALB/Fargate"""
    from app.agentcore.services import get_session_manager

    session_manager = get_session_manager()
    stats = session_manager.get_cache_stats()

    return {
        "status": "healthy",
        "region": settings.AWS_REGION,
        "features": {
            "memory": settings.ENABLE_MEMORY,
            "gateway": settings.ENABLE_GATEWAY,
            "code_interpreter": settings.ENABLE_CODE_INTERPRETER,
            "observability": settings.ENABLE_OBSERVABILITY
        },
        "sessions": stats
    }


@app.get("/ready")
async def readiness_check():
    """Readiness check endpoint"""
    return {"status": "ready"}


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "AgentCore API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.agentcore.app:app",
        host="0.0.0.0",
        port=8080,
        reload=False,
        log_level="info"
    )
