"""
Session persistence service for conversation sessions
Stores sessions in JSON files to survive server restarts
"""
import json
import os
from pathlib import Path
from typing import Dict, Any, Optional
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

class SessionPersistence:
    def __init__(self, storage_dir: str = "./conversation_sessions"):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(exist_ok=True)
        self._in_memory_cache: Dict[str, Dict[str, Any]] = {}
        logger.info(f"SessionPersistence initialized with storage at {self.storage_dir}")
        
        # Load existing sessions on startup
        self._load_all_sessions()
    
    def _load_all_sessions(self):
        """Load all existing sessions from disk into memory cache"""
        try:
            for session_file in self.storage_dir.glob("*.json"):
                session_id = session_file.stem
                try:
                    with open(session_file, 'r') as f:
                        session_data = json.load(f)
                        # Don't reload agents or other non-serializable objects
                        if 'agent' in session_data:
                            session_data['agent'] = None
                        self._in_memory_cache[session_id] = session_data
                        logger.info(f"Loaded session {session_id} from disk")
                except Exception as e:
                    logger.error(f"Failed to load session {session_id}: {e}")
        except Exception as e:
            logger.error(f"Failed to load sessions: {e}")
    
    def _get_session_path(self, session_id: str) -> Path:
        return self.storage_dir / f"{session_id}.json"
    
    def save_session(self, session_id: str, session_data: Dict[str, Any]):
        """Save session to disk and memory"""
        try:
            # Create a serializable copy
            serializable_data = {}
            for key, value in session_data.items():
                # Skip non-serializable objects
                if key in ['agent', 'thread', 'lock']:
                    continue
                try:
                    # Test if serializable
                    json.dumps(value)
                    serializable_data[key] = value
                except (TypeError, ValueError):
                    # Skip non-serializable values
                    logger.debug(f"Skipping non-serializable field: {key}")
            
            # Add metadata
            serializable_data['last_updated'] = datetime.now().isoformat()
            
            # Save to disk
            session_path = self._get_session_path(session_id)
            with open(session_path, 'w') as f:
                json.dump(serializable_data, f, indent=2)
            
            # Update memory cache
            self._in_memory_cache[session_id] = session_data
            
            logger.debug(f"Saved session {session_id}")
        except Exception as e:
            logger.error(f"Failed to save session {session_id}: {e}")
    
    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session from memory or disk"""
        # Check memory first
        if session_id in self._in_memory_cache:
            return self._in_memory_cache[session_id]
        
        # Try loading from disk
        session_path = self._get_session_path(session_id)
        if session_path.exists():
            try:
                with open(session_path, 'r') as f:
                    session_data = json.load(f)
                    # Don't reload agents
                    if 'agent' in session_data:
                        session_data['agent'] = None
                    self._in_memory_cache[session_id] = session_data
                    return session_data
            except Exception as e:
                logger.error(f"Failed to load session {session_id}: {e}")
        
        return None
    
    def delete_session(self, session_id: str):
        """Delete session from disk and memory"""
        try:
            # Remove from memory
            if session_id in self._in_memory_cache:
                del self._in_memory_cache[session_id]
            
            # Remove from disk
            session_path = self._get_session_path(session_id)
            if session_path.exists():
                session_path.unlink()
            
            logger.info(f"Deleted session {session_id}")
        except Exception as e:
            logger.error(f"Failed to delete session {session_id}: {e}")
    
    def list_sessions(self) -> Dict[str, Dict[str, Any]]:
        """Get all sessions"""
        return dict(self._in_memory_cache)
    
    def update_session(self, session_id: str, updates: Dict[str, Any]):
        """Update specific fields in a session"""
        session = self.get_session(session_id)
        if session:
            session.update(updates)
            self.save_session(session_id, session)
            return True
        return False

# Global instance
_session_persistence = None

def get_session_persistence() -> SessionPersistence:
    global _session_persistence
    if _session_persistence is None:
        _session_persistence = SessionPersistence()
    return _session_persistence