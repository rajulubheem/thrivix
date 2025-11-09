"""
Session Manager

Production session management with caching and expiry handling.

Based on patterns from:
- strands-samples/04-UX-demos/04-triage-agent/ (session caching)
- amazon-bedrock-agentcore-samples (session with memory)
"""
import time
import uuid
import structlog
from typing import Dict, Optional, Any
from datetime import datetime, timedelta
from collections import OrderedDict

from app.agentcore.schemas import SessionCreate, SessionResponse
from app.agentcore.config import settings

logger = structlog.get_logger()


class SessionManager:
    """
    Manages agent sessions with LRU caching and expiry.

    Pattern from: Triage Agent - {session_id:model_id -> Agent} caching
    """

    def __init__(
        self,
        max_sessions: int = None,
        default_expiry_seconds: int = None
    ):
        self.max_sessions = max_sessions or settings.MAX_CACHED_SESSIONS
        self.default_expiry = default_expiry_seconds or settings.SESSION_EXPIRY_SECONDS

        # Session storage: {session_id: session_data}
        self._sessions: OrderedDict[str, Dict[str, Any]] = OrderedDict()

        # Agent cache: {(session_id, agent_id): agent_instance}
        self._agent_cache: Dict[tuple, Any] = {}

        logger.info(
            "Session Manager initialized",
            max_sessions=self.max_sessions,
            default_expiry=self.default_expiry
        )

    def create_session(
        self,
        session_request: SessionCreate,
        expiry_seconds: Optional[int] = None
    ) -> SessionResponse:
        """
        Create a new session.

        Args:
            session_request: Session creation data
            expiry_seconds: Custom expiry (defaults to default_expiry)

        Returns:
            SessionResponse with session details
        """
        session_id = str(uuid.uuid4())
        now = datetime.now()
        expiry = expiry_seconds or self.default_expiry

        session_data = {
            'session_id': session_id,
            'agent_id': session_request.agent_id,
            'actor_id': session_request.actor_id,
            'created_at': now,
            'expires_at': now + timedelta(seconds=expiry),
            'last_active': now,
            'message_count': 0,
            'metadata': session_request.session_metadata,
            'status': 'active'
        }

        # Add to session storage (LRU)
        self._add_session(session_id, session_data)

        logger.info(
            "Session created",
            session_id=session_id,
            agent_id=session_request.agent_id,
            actor_id=session_request.actor_id
        )

        return SessionResponse(**session_data)

    def get_session(self, session_id: str) -> Optional[SessionResponse]:
        """
        Get session by ID, checking expiry.

        Args:
            session_id: Session ID

        Returns:
            SessionResponse if session exists and is active, None otherwise
        """
        # Clean expired sessions first
        self._clean_expired_sessions()

        session_data = self._sessions.get(session_id)
        if not session_data:
            logger.debug("Session not found", session_id=session_id)
            return None

        # Check if expired
        if datetime.now() > session_data['expires_at']:
            logger.info("Session expired", session_id=session_id)
            self.delete_session(session_id)
            return None

        # Move to end (LRU)
        self._sessions.move_to_end(session_id)

        # Update last active
        session_data['last_active'] = datetime.now()

        return SessionResponse(**session_data)

    def update_session_activity(
        self,
        session_id: str,
        increment_message_count: bool = True
    ) -> None:
        """
        Update session last active time and optionally message count.

        Args:
            session_id: Session ID
            increment_message_count: Whether to increment message counter
        """
        session_data = self._sessions.get(session_id)
        if session_data:
            session_data['last_active'] = datetime.now()
            if increment_message_count:
                session_data['message_count'] += 1

            logger.debug(
                "Session activity updated",
                session_id=session_id,
                message_count=session_data['message_count']
            )

    def delete_session(self, session_id: str) -> None:
        """
        Delete a session and its cached agent.

        Args:
            session_id: Session ID
        """
        if session_id in self._sessions:
            session_data = self._sessions[session_id]

            # Remove from agent cache
            cache_key = (session_id, session_data['agent_id'])
            if cache_key in self._agent_cache:
                del self._agent_cache[cache_key]

            # Remove session
            del self._sessions[session_id]

            logger.info("Session deleted", session_id=session_id)

    def list_active_sessions(
        self,
        agent_id: Optional[str] = None,
        actor_id: Optional[str] = None
    ) -> list[SessionResponse]:
        """
        List active sessions, optionally filtered.

        Args:
            agent_id: Filter by agent ID
            actor_id: Filter by actor ID

        Returns:
            List of active sessions
        """
        # Clean expired first
        self._clean_expired_sessions()

        sessions = []
        for session_data in self._sessions.values():
            # Apply filters
            if agent_id and session_data['agent_id'] != agent_id:
                continue
            if actor_id and session_data['actor_id'] != actor_id:
                continue

            # Check not expired
            if datetime.now() <= session_data['expires_at']:
                sessions.append(SessionResponse(**session_data))

        return sessions

    def cache_agent(
        self,
        session_id: str,
        agent_id: str,
        agent_instance: Any
    ) -> None:
        """
        Cache an agent instance for a session.

        Pattern from: Triage Agent - session_agents cache

        Args:
            session_id: Session ID
            agent_id: Agent ID
            agent_instance: Strands Agent instance
        """
        cache_key = (session_id, agent_id)
        self._agent_cache[cache_key] = agent_instance

        logger.debug(
            "Agent cached for session",
            session_id=session_id,
            agent_id=agent_id
        )

    def get_cached_agent(
        self,
        session_id: str,
        agent_id: str
    ) -> Optional[Any]:
        """
        Retrieve cached agent instance.

        Args:
            session_id: Session ID
            agent_id: Agent ID

        Returns:
            Cached agent instance or None
        """
        cache_key = (session_id, agent_id)
        agent = self._agent_cache.get(cache_key)

        if agent:
            logger.debug(
                "Agent cache hit",
                session_id=session_id,
                agent_id=agent_id
            )
        else:
            logger.debug(
                "Agent cache miss",
                session_id=session_id,
                agent_id=agent_id
            )

        return agent

    def _add_session(self, session_id: str, session_data: Dict[str, Any]) -> None:
        """
        Add session with LRU eviction if needed.

        Args:
            session_id: Session ID
            session_data: Session data
        """
        # Check if we need to evict
        if len(self._sessions) >= self.max_sessions:
            # Remove oldest (first item)
            oldest_session_id = next(iter(self._sessions))
            logger.info(
                "Evicting oldest session",
                evicted_session_id=oldest_session_id,
                reason="max_sessions_reached"
            )
            self.delete_session(oldest_session_id)

        # Add new session
        self._sessions[session_id] = session_data

    def _clean_expired_sessions(self) -> None:
        """Clean up expired sessions."""
        now = datetime.now()
        expired = [
            session_id
            for session_id, session_data in self._sessions.items()
            if now > session_data['expires_at']
        ]

        for session_id in expired:
            logger.info("Cleaning expired session", session_id=session_id)
            self.delete_session(session_id)

        if expired:
            logger.info("Expired sessions cleaned", count=len(expired))

    def get_session_count(self) -> int:
        """Get total number of active sessions."""
        self._clean_expired_sessions()
        return len(self._sessions)

    def get_cache_stats(self) -> Dict[str, int]:
        """Get cache statistics."""
        return {
            'total_sessions': len(self._sessions),
            'cached_agents': len(self._agent_cache),
            'max_sessions': self.max_sessions
        }


# Global session manager instance
_session_manager: Optional[SessionManager] = None


def get_session_manager() -> SessionManager:
    """
    Get or create the global session manager instance.

    Returns:
        SessionManager instance
    """
    global _session_manager
    if _session_manager is None:
        _session_manager = SessionManager()
    return _session_manager
