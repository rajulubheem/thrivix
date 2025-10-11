from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import structlog

from app.config import Settings
from app.core.config import settings as core_settings
from app.api.v1.api import api_router
from app.core.middleware import (
    LoggingMiddleware,
    RateLimitMiddleware,
    RequestIdMiddleware
)
from app.core.database import init_db, close_db
from app.utils.logging import setup_logging


# Setup structured logging
setup_logging()
logger = structlog.get_logger()

# Create settings instance
settings = Settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    # Startup
    logger.info("Starting up Strands Swarm API", version=settings.APP_VERSION)
    await init_db()
    
    # Initialize tool registries
    try:
        from app.services.tool_registry import setup_tool_registry
        await setup_tool_registry()
        logger.info("✅ Tool Registry initialized successfully")
    except Exception as e:
        logger.warning(f"Tool Registry initialization failed (non-critical): {e}")
    
    # Initialize Strands dynamic tool registry
    try:
        from app.tools.strands_tool_registry import get_dynamic_tools
        await get_dynamic_tools()
        logger.info("✅ Strands Dynamic Tool Registry initialized successfully")
    except Exception as e:
        logger.warning(f"Strands Tool Registry initialization failed (non-critical): {e}")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Strands Swarm API")
    await close_db()


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# Add middlewares - ORDER MATTERS! CORS must be last (processed first)
# Increase rate limit for development/testing
# TEMPORARILY DISABLED TO TEST SSE
# app.add_middleware(RateLimitMiddleware, requests_per_minute=200)
# app.add_middleware(LoggingMiddleware)
# app.add_middleware(RequestIdMiddleware)
# IMPORTANT: Disable GZip for compatibility with Server-Sent Events (SSE)
# Compressing SSE can introduce buffering and break real-time streaming.
# If compression is needed elsewhere, add conditional logic to skip SSE paths.
app.add_middleware(
    CORSMiddleware,
    allow_origins=core_settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Selective compression middleware (skip SSE)
from starlette.middleware.base import BaseHTTPMiddleware
import gzip
from starlette.responses import Response, StreamingResponse

class SelectiveGZipMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        
        # IMPORTANT: Don't process StreamingResponse at all - return immediately
        if isinstance(response, StreamingResponse):
            return response
            
        # Skip SSE or already encoded
        if getattr(response, 'media_type', None) == 'text/event-stream':
            return response
            
        # Skip if already encoded
        if response.headers.get('Content-Encoding'):
            return response
            
        # For non-streaming responses, try to compress
        try:
            # Only process regular responses with body_iterator
            if not hasattr(response, 'body_iterator'):
                return response
                
            body = b"".join([chunk async for chunk in response.body_iterator])
            # Only compress JSON/text larger than threshold
            ctype = response.headers.get('content-type', '')
            if ('application/json' in ctype or 'text/' in ctype) and body and len(body) > 1024:
                gz = gzip.compress(body)
                resp = Response(content=gz, status_code=response.status_code, headers=dict(response.headers), media_type=response.media_type)
                resp.headers['Content-Encoding'] = 'gzip'
                resp.headers['Content-Length'] = str(len(gz))
                return resp
            else:
                return Response(content=body, status_code=response.status_code, headers=dict(response.headers), media_type=response.media_type)
        except Exception:
            return response

# DISABLED: Breaking SSE streaming
# app.add_middleware(SelectiveGZipMiddleware)

# Include API router
app.include_router(api_router, prefix=settings.API_V1_STR)

# Add catch-all OPTIONS handler for CORS preflight - only for API routes
@app.options("/api/{full_path:path}")
async def options_handler(full_path: str):
    """Handle OPTIONS requests for CORS preflight on API routes"""
    return {"message": "OK"}

# Test SSE endpoint
@app.get("/test-sse-simple")
async def test_sse_simple():
    from fastapi.responses import StreamingResponse
    import asyncio
    import json
    from datetime import datetime
    
    async def generate():
        for i in range(5):
            yield f"data: {json.dumps({'count': i, 'time': datetime.now().isoformat()})}\n\n"
            await asyncio.sleep(1)
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

# Health check endpoints
@app.get("/health")
async def health_check():
    return {
        "status": "healthy", 
        "version": settings.APP_VERSION,
        "cors_origins": settings.get_cors_origins()
    }


@app.get("/ready")
async def readiness_check():
    # Check database, redis, etc.
    return {"status": "ready"}


# Serve static frontend files in production
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

# Check if frontend build exists
frontend_build_path = Path(__file__).parent.parent.parent / "frontend" / "build"

if frontend_build_path.exists() and os.getenv("ENVIRONMENT", "development") == "production":
    # Mount static files
    app.mount("/static", StaticFiles(directory=str(frontend_build_path / "static")), name="static")

    # Serve index.html for all non-API routes
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Don't intercept API routes
        if full_path.startswith("api/") or full_path.startswith("health") or full_path.startswith("ready") or full_path.startswith("test-sse"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Not found")

        # Check if file exists in build directory
        file_path = frontend_build_path / full_path
        if file_path.is_file():
            return FileResponse(file_path)

        # Default to index.html for SPA routing
        return FileResponse(frontend_build_path / "index.html")

    logger.info("✅ Serving frontend from build directory in production mode")
