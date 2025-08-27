from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
import time
import uuid
import structlog
from typing import Callable
from collections import defaultdict
from datetime import datetime, timedelta

logger = structlog.get_logger()


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Add request ID to all requests"""
    
    def __init__(self, app: ASGIApp):
        super().__init__(app)
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        
        return response


class LoggingMiddleware(BaseHTTPMiddleware):
    """Log all requests and responses"""
    
    def __init__(self, app: ASGIApp):
        super().__init__(app)
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()
        
        # Skip logging for OPTIONS requests to reduce noise
        if request.method != "OPTIONS":
            logger.info(
                "Request started",
                method=request.method,
                url=str(request.url),
                request_id=getattr(request.state, 'request_id', None)
            )
        
        response = await call_next(request)
        
        # Calculate processing time
        process_time = time.time() - start_time
        
        # Log response
        logger.info(
            "Request completed",
            method=request.method,
            url=str(request.url),
            status_code=response.status_code,
            process_time=process_time,
            request_id=getattr(request.state, 'request_id', None)
        )
        
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple rate limiting middleware"""
    
    def __init__(self, app: ASGIApp, requests_per_minute: int = 60):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.requests = defaultdict(list)
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip rate limiting for OPTIONS requests
        if request.method == "OPTIONS":
            return await call_next(request)
        
        # Skip rate limiting for WebSocket connections
        if request.url.path == "/ws" or "websocket" in request.headers.get("upgrade", "").lower():
            return await call_next(request)
        
        # Skip rate limiting for polling endpoints (they need high frequency)
        url_str = str(request.url)
        if "/streaming/poll/" in url_str or "/polling/poll/" in url_str or "/streaming/" in url_str:
            logger.debug(f"Skipping rate limit for streaming endpoint: {url_str}")
            return await call_next(request)
            
        client_ip = request.client.host if request.client else "unknown"
        now = datetime.now()
        
        # Clean old requests
        cutoff = now - timedelta(minutes=1)
        self.requests[client_ip] = [
            req_time for req_time in self.requests[client_ip] 
            if req_time > cutoff
        ]
        
        # Check rate limit
        if len(self.requests[client_ip]) >= self.requests_per_minute:
            from fastapi import HTTPException
            logger.warning(f"Rate limit exceeded for {client_ip}: {len(self.requests[client_ip])} requests in last minute")
            raise HTTPException(status_code=429, detail="Rate limit exceeded")
        
        # Add current request
        self.requests[client_ip].append(now)
        
        return await call_next(request)