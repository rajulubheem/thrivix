"""
Agent Session Manager with FileSessionManager Integration

Properly handles Strands Agent sessions with conversation history.

Pattern from: strands-samples/02-samples/14-research-agent/
"""
import uuid
import structlog
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from pathlib import Path

from strands.session.file_session_manager import FileSessionManager

from app.agentcore.config import settings

logger = structlog.get_logger()


class AgentSessionManager:
    """
    Manages Strands Agent sessions with FileSessionManager.

    Key insight from Strands samples:
    - FileSessionManager stores conversation history per session
    - Agent uses session_manager to load/save messages automatically
    - session_id is THE key for conversation continuity
    """

    def __init__(self, storage_dir: Optional[Path] = None):
        self.storage_dir = storage_dir or Path.cwd() / "agent_sessions"
        self.storage_dir.mkdir(parents=True, exist_ok=True)

        # Track active sessions: {session_id: {metadata}}
        self._sessions: Dict[str, Dict[str, Any]] = {}

        logger.info(
            "Agent Session Manager initialized",
            storage_dir=str(self.storage_dir)
        )

    def create_session(
        self,
        agent_id: str,
        actor_id: str,
        session_expiry_seconds: int = 3600
    ) -> str:
        """
        Create a new session for an agent.

        Args:
            agent_id: Agent identifier
            actor_id: User/actor identifier
            session_expiry_seconds: Session TTL in seconds

        Returns:
            session_id: UUID for the new session
        """
        session_id = str(uuid.uuid4())
        now = datetime.now()

        self._sessions[session_id] = {
            "session_id": session_id,
            "agent_id": agent_id,
            "actor_id": actor_id,
            "created_at": now,
            "expires_at": now + timedelta(seconds=session_expiry_seconds),
            "last_active": now,
            "message_count": 0
        }

        logger.info(
            "Session created",
            session_id=session_id,
            agent_id=agent_id,
            actor_id=actor_id
        )

        return session_id

    def get_file_session_manager(self, session_id: str) -> FileSessionManager:
        """
        Get FileSessionManager for a session.

        This is what gets passed to Agent() for conversation history management.

        Pattern from research-agent:
        session_manager = FileSessionManager(
            session_id=session_id,
            storage_dir=Path.cwd() / "sessions"
        )

        Args:
            session_id: Session identifier

        Returns:
            FileSessionManager instance for this session
        """
        return FileSessionManager(
            session_id=session_id,
            storage_dir=self.storage_dir
        )

    def validate_session(self, session_id: str) -> bool:
        """
        Check if session exists and is not expired.

        Args:
            session_id: Session identifier

        Returns:
            True if session is valid, False otherwise
        """
        if session_id not in self._sessions:
            # Session might exist on disk but not in memory
            # Check if session directory exists
            session_dir = self.storage_dir / session_id
            if session_dir.exists():
                logger.info("Session found on disk, loading", session_id=session_id)
                return True
            logger.debug("Session not found", session_id=session_id)
            return False

        session = self._sessions[session_id]
        if datetime.now() > session["expires_at"]:
            logger.info("Session expired", session_id=session_id)
            return False

        return True

    def update_session_activity(self, session_id: str) -> None:
        """
        Update session last active time.

        Args:
            session_id: Session identifier
        """
        if session_id in self._sessions:
            self._sessions[session_id]["last_active"] = datetime.now()
            self._sessions[session_id]["message_count"] += 1

    def get_session_info(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get session metadata.

        Args:
            session_id: Session identifier

        Returns:
            Session metadata dict or None
        """
        return self._sessions.get(session_id)

    def list_sessions(
        self,
        agent_id: Optional[str] = None,
        actor_id: Optional[str] = None
    ) -> list[Dict[str, Any]]:
        """
        List active sessions with optional filtering.

        Args:
            agent_id: Filter by agent ID
            actor_id: Filter by actor ID

        Returns:
            List of session metadata
        """
        sessions = []
        now = datetime.now()

        for session_id, session in self._sessions.items():
            # Filter expired
            if now > session["expires_at"]:
                continue

            # Apply filters
            if agent_id and session["agent_id"] != agent_id:
                continue
            if actor_id and session["actor_id"] != actor_id:
                continue

            sessions.append(session)

        return sessions

    def delete_session(self, session_id: str) -> None:
        """
        Delete a session (metadata only, not conversation history).

        Args:
            session_id: Session identifier
        """
        if session_id in self._sessions:
            del self._sessions[session_id]
            logger.info("Session deleted from memory", session_id=session_id)

        # Note: FileSessionManager files remain on disk for history preservation
        # To delete conversation history, remove session_dir manually


# Global instance
_agent_session_manager: Optional[AgentSessionManager] = None


def get_agent_session_manager() -> AgentSessionManager:
    """
    Get or create the global agent session manager instance.

    Returns:
        AgentSessionManager instance
    """
    global _agent_session_manager
    if _agent_session_manager is None:
        _agent_session_manager = AgentSessionManager()
    return _agent_session_manager
