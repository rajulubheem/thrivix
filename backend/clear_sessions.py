#!/usr/bin/env python3
"""Script to clear all chat sessions from the database."""

import sys
import os
import asyncio
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import delete
from app.core.database import get_db
from app.models.database import ChatSession, ChatMessage

async def clear_all_sessions():
    """Clear all sessions and messages from the database."""
    async for db in get_db():
        try:
            # Delete all messages first (due to foreign key constraints)
            result_messages = await db.execute(delete(ChatMessage))
            deleted_messages = result_messages.rowcount
            print(f'✓ Deleted {deleted_messages} chat messages')
            
            # Then delete all sessions
            result_sessions = await db.execute(delete(ChatSession))
            deleted_sessions = result_sessions.rowcount
            print(f'✓ Deleted {deleted_sessions} chat sessions')
            
            # Commit the changes
            await db.commit()
            print('✅ Successfully cleared all sessions from database')
            
        except Exception as e:
            await db.rollback()
            print(f'❌ Error: {e}')
            return False
        finally:
            await db.close()
        
        return True

if __name__ == "__main__":
    success = asyncio.run(clear_all_sessions())
    sys.exit(0 if success else 1)