"""Admin endpoints for system management."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete
import os
import sys
import signal
import shutil
import glob
import asyncio
from typing import Dict
import logging

from app.core.database import get_db
from app.models.database import ChatSession, ChatMessage
# Storage import removed - will handle in-memory sessions differently

router = APIRouter()
logger = logging.getLogger(__name__)

@router.delete("/admin/clear-all-sessions")
async def clear_all_sessions(db: AsyncSession = Depends(get_db)) -> Dict:
    """
    Clear all sessions from database, filesystem, and memory.
    This is a destructive operation that removes all data.
    """
    results = {
        "database": {"messages": 0, "sessions": 0},
        "strands_sessions": 0,
        "memory_sessions": 0,
        "status": "success"
    }
    
    try:
        # 1. Clear database sessions
        result_messages = await db.execute(delete(ChatMessage))
        results["database"]["messages"] = result_messages.rowcount
        
        result_sessions = await db.execute(delete(ChatSession))
        results["database"]["sessions"] = result_sessions.rowcount
        
        await db.commit()
        
        # 2. Clear Strands filesystem sessions
        strands_dir = "strands_sessions"
        if os.path.exists(strands_dir):
            session_dirs = glob.glob(os.path.join(strands_dir, "session_*"))
            for session_dir in session_dirs:
                shutil.rmtree(session_dir)
            results["strands_sessions"] = len(session_dirs)
        
        # 3. Clear in-memory streaming sessions
        # Note: In-memory sessions are handled by the streaming module
        # They will be cleared when the server restarts
        results["memory_sessions"] = 0
        
        return results
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to clear sessions: {str(e)}")

@router.get("/admin/session-stats")
async def get_session_stats(db: AsyncSession = Depends(get_db)) -> Dict:
    """
    Get statistics about current sessions.
    """
    from sqlalchemy import select, func
    
    stats = {}
    
    # Database stats
    message_count = await db.scalar(select(func.count()).select_from(ChatMessage))
    session_count = await db.scalar(select(func.count()).select_from(ChatSession))
    
    stats["database"] = {
        "messages": message_count or 0,
        "sessions": session_count or 0
    }
    
    # Strands filesystem sessions
    strands_dir = "strands_sessions"
    if os.path.exists(strands_dir):
        session_dirs = glob.glob(os.path.join(strands_dir, "session_*"))
        stats["strands_sessions"] = len(session_dirs)
    else:
        stats["strands_sessions"] = 0
    
    # In-memory sessions (handled by streaming module)
    stats["memory_sessions"] = 0

    return stats

@router.post("/admin/force-restart")
async def force_restart() -> Dict:
    """
    Force restart the backend server by sending SIGTERM signal.
    In AWS Fargate/ECS, this will cause the container to restart.

    WARNING: This will terminate all active connections and sessions!
    """
    logger.warning("🔄 Force restart requested - shutting down server...")

    # Schedule the restart after response is sent
    async def shutdown():
        await asyncio.sleep(1)  # Give time for response to be sent
        logger.critical("💥 Initiating forced restart NOW")
        os.kill(os.getpid(), signal.SIGTERM)

    asyncio.create_task(shutdown())

    return {
        "message": "Server restart initiated",
        "status": "restarting",
        "note": "All active sessions will be terminated. Server will restart in 1 second."
    }

@router.post("/admin/cancel-all-tasks")
async def cancel_all_async_tasks() -> Dict:
    """
    Cancel all running async tasks (WebSocket connections, streaming sessions, etc.)
    This is a gentler alternative to force restart.
    """
    logger.warning("🛑 Cancelling all async tasks...")

    try:
        # Get all running tasks except the current one
        current_task = asyncio.current_task()
        all_tasks = [task for task in asyncio.all_tasks() if task is not current_task]

        cancelled_count = 0
        for task in all_tasks:
            if not task.done():
                task.cancel()
                cancelled_count += 1

        logger.info(f"✅ Cancelled {cancelled_count} async tasks")

        return {
            "message": "All async tasks cancelled",
            "cancelled_count": cancelled_count,
            "status": "success",
            "note": "All WebSocket connections and streaming sessions have been terminated"
        }
    except Exception as e:
        logger.error(f"❌ Error cancelling tasks: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to cancel tasks: {str(e)}")