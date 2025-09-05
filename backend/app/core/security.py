from fastapi import Depends, HTTPException, status, WebSocket, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
import structlog

logger = structlog.get_logger()

security = HTTPBearer(auto_error=False)

async def get_current_user(request: Request, credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    """Get current user from token - simplified for demo, supports query params for EventSource"""
    # Check query parameter token first (for EventSource compatibility)
    token = request.query_params.get("token")
    if token == "demo-token":
        return {"id": "demo-user", "username": "demo"}
    
    # In production, you'd validate the JWT token here
    if not credentials:
        # For demo purposes, return a mock user
        return {"id": "demo-user", "username": "demo"}
    
    # Mock token validation
    if credentials.credentials == "demo-token":
        return {"id": "demo-user", "username": "demo"}
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

async def get_current_user_ws(token: Optional[str] = None) -> str:
    """Get current user for WebSocket connections - simplified for demo"""
    # In production, you'd validate the token from query params or headers
    return "demo-user"