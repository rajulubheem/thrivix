"""
Strands SDK Session Management Service
Properly uses FileSessionManager for persistent sessions with virtual filesystem support
"""
import os
import json
import asyncio
from typing import Dict, Any, Optional, List
from pathlib import Path
from datetime import datetime
import structlog
from strands import Agent
from strands.session.file_session_manager import FileSessionManager
from strands.agent.conversation_manager import SlidingWindowConversationManager
from strands.models.openai import OpenAIModel

logger = structlog.get_logger()

class StrandsSessionService:
    """Service for managing Strands agent sessions with proper persistence"""
    
    def __init__(self, storage_dir: str = "./strands_sessions"):
        """Initialize the session service with storage directory"""
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(exist_ok=True, parents=True)
        self.active_sessions: Dict[str, Dict[str, Any]] = {}
        logger.info(f"StrandsSessionService initialized with storage at {self.storage_dir}")
    
    def get_or_create_session(self, session_id: str) -> FileSessionManager:
        """Get existing session or create new one"""
        try:
            # Create FileSessionManager for this session
            session_manager = FileSessionManager(
                session_id=session_id,
                storage_dir=str(self.storage_dir)
            )
            logger.info(f"Session manager created/loaded for session {session_id}")
            return session_manager
        except Exception as e:
            logger.error(f"Failed to create/load session manager: {e}")
            raise
    
    def create_agent_with_session(
        self, 
        session_id: str,
        agent_name: str = "default",
        system_prompt: str = None,
        tools: List = None,
        model_config: Dict[str, Any] = None
    ) -> Agent:
        """Create or restore an agent with session persistence"""
        try:
            # Get or create session manager
            session_manager = self.get_or_create_session(session_id)
            
            # Configure conversation manager
            conversation_manager = SlidingWindowConversationManager(
                window_size=20,  # Keep last 20 messages
                should_truncate_results=True
            )
            
            # Configure model
            if model_config:
                model = OpenAIModel(
                    model_id=model_config.get("model_id", "gpt-4o-mini"),
                    max_tokens=model_config.get("max_tokens", 4000),
                    params={
                        "temperature": model_config.get("temperature", 0.7)
                    }
                )
            else:
                model = OpenAIModel(model_id="gpt-4o-mini")
            
            # Create agent with session persistence
            agent = Agent(
                agent_id=agent_name,  # Use agent name as ID
                session_manager=session_manager,
                conversation_manager=conversation_manager,
                system_prompt=system_prompt or f"You are {agent_name}, a helpful AI assistant.",
                tools=tools or [],
                model=model
            )
            
            # Store in active sessions
            if session_id not in self.active_sessions:
                self.active_sessions[session_id] = {}
            
            self.active_sessions[session_id][agent_name] = {
                "agent": agent,
                "created_at": datetime.utcnow().isoformat(),
                "session_manager": session_manager
            }
            
            logger.info(f"Agent '{agent_name}' created/restored for session {session_id}")
            return agent
            
        except Exception as e:
            logger.error(f"Failed to create agent with session: {e}")
            raise
    
    def get_agent(self, session_id: str, agent_name: str = "default") -> Optional[Agent]:
        """Get an existing agent from session"""
        if session_id in self.active_sessions:
            if agent_name in self.active_sessions[session_id]:
                return self.active_sessions[session_id][agent_name]["agent"]
        return None
    
    def save_virtual_filesystem(self, session_id: str, filesystem: Dict[str, str]):
        """Save virtual filesystem to agent state"""
        try:
            # Get the default agent for this session
            agent = self.get_agent(session_id, "default")
            if agent:
                # Store filesystem in agent state
                agent.state.set("virtual_filesystem", filesystem)
                logger.info(f"Saved virtual filesystem for session {session_id}")
            else:
                # If no agent exists, store in a session metadata file
                metadata_path = self.storage_dir / f"session_{session_id}" / "metadata.json"
                metadata_path.parent.mkdir(exist_ok=True, parents=True)
                
                metadata = {}
                if metadata_path.exists():
                    with open(metadata_path, 'r') as f:
                        metadata = json.load(f)
                
                metadata["virtual_filesystem"] = filesystem
                metadata["updated_at"] = datetime.utcnow().isoformat()
                
                with open(metadata_path, 'w') as f:
                    json.dump(metadata, f, indent=2)
                
                logger.info(f"Saved virtual filesystem to metadata for session {session_id}")
                
        except Exception as e:
            logger.error(f"Failed to save virtual filesystem: {e}")
    
    def get_virtual_filesystem(self, session_id: str) -> Dict[str, str]:
        """Get virtual filesystem from agent state"""
        try:
            # Try to get from active agent first
            agent = self.get_agent(session_id, "default")
            if agent:
                filesystem = agent.state.get("virtual_filesystem")
                if filesystem:
                    logger.info(f"Retrieved virtual filesystem from agent state for session {session_id}")
                    return filesystem
            
            # Try to load from metadata file
            metadata_path = self.storage_dir / f"session_{session_id}" / "metadata.json"
            if metadata_path.exists():
                with open(metadata_path, 'r') as f:
                    metadata = json.load(f)
                    filesystem = metadata.get("virtual_filesystem", {})
                    logger.info(f"Retrieved virtual filesystem from metadata for session {session_id}")
                    return filesystem
            
            logger.info(f"No virtual filesystem found for session {session_id}")
            return {}
            
        except Exception as e:
            logger.error(f"Failed to get virtual filesystem: {e}")
            return {}
    
    def save_context(self, session_id: str, context: Dict[str, Any]):
        """Save additional context to session"""
        try:
            # Get or create metadata file
            metadata_path = self.storage_dir / f"session_{session_id}" / "metadata.json"
            metadata_path.parent.mkdir(exist_ok=True, parents=True)
            
            metadata = {}
            if metadata_path.exists():
                with open(metadata_path, 'r') as f:
                    metadata = json.load(f)
            
            # Update context
            metadata["context"] = context
            metadata["updated_at"] = datetime.utcnow().isoformat()
            
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f, indent=2)
            
            logger.info(f"Saved context for session {session_id}")
            
        except Exception as e:
            logger.error(f"Failed to save context: {e}")
    
    def get_context(self, session_id: str) -> Dict[str, Any]:
        """Get context from session"""
        try:
            metadata_path = self.storage_dir / f"session_{session_id}" / "metadata.json"
            if metadata_path.exists():
                with open(metadata_path, 'r') as f:
                    metadata = json.load(f)
                    return metadata.get("context", {})
            return {}
        except Exception as e:
            logger.error(f"Failed to get context: {e}")
            return {}
    
    def save_agents(self, session_id: str, agents: List[Dict[str, Any]]):
        """Save agent configurations to session metadata"""
        try:
            metadata_path = self.storage_dir / f"session_{session_id}" / "metadata.json"
            metadata_path.parent.mkdir(exist_ok=True, parents=True)
            
            metadata = {}
            if metadata_path.exists():
                with open(metadata_path, 'r') as f:
                    metadata = json.load(f)
            
            # Save agents configuration
            metadata["agents_config"] = agents
            metadata["updated_at"] = datetime.utcnow().isoformat()
            
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f, indent=2)
            
            logger.info(f"💾 Saved {len(agents)} agents configuration for session {session_id}")
            
        except Exception as e:
            logger.error(f"Failed to save agents: {e}")
    
    def get_agents(self, session_id: str) -> List[Dict[str, Any]]:
        """Get agent configurations from session metadata"""
        try:
            metadata_path = self.storage_dir / f"session_{session_id}" / "metadata.json"
            if metadata_path.exists():
                with open(metadata_path, 'r') as f:
                    metadata = json.load(f)
                    agents = metadata.get("agents_config", [])
                    if agents:
                        logger.info(f"📋 Retrieved {len(agents)} agents from persistent storage for session {session_id}")
                    return agents
            return []
        except Exception as e:
            logger.error(f"Failed to get agents: {e}")
            return []
    
    def list_sessions(self) -> List[str]:
        """List all available sessions"""
        sessions = []
        try:
            for session_dir in self.storage_dir.glob("session_*"):
                if session_dir.is_dir():
                    session_id = session_dir.name.replace("session_", "")
                    sessions.append(session_id)
        except Exception as e:
            logger.error(f"Failed to list sessions: {e}")
        return sessions
    
    def delete_session(self, session_id: str):
        """Delete a session and its data"""
        try:
            # Remove from active sessions
            if session_id in self.active_sessions:
                del self.active_sessions[session_id]
            
            # Remove from disk
            session_path = self.storage_dir / f"session_{session_id}"
            if session_path.exists():
                import shutil
                shutil.rmtree(session_path)
                logger.info(f"Deleted session {session_id}")
        except Exception as e:
            logger.error(f"Failed to delete session: {e}")
    
    def analyze_session_context(self, session_id: str) -> Dict[str, Any]:
        """
        Simple session context analysis for agent selection decisions
        """
        try:
            context = self.get_context(session_id)
            agents = self.get_agents(session_id)
            
            return {
                "session_id": session_id,
                "total_messages": len(context.get("messages", [])),
                "agents_used": len(agents) if agents else 0,
                "has_context": len(context.get("messages", [])) > 0
            }
            
        except Exception as e:
            logger.error(f"Failed to analyze session context: {e}")
            return {
                "session_id": session_id,
                "agents_used": 0,
                "has_context": False
            }

# Global instance
_strands_session_service = None

def get_strands_session_service() -> StrandsSessionService:
    """Get or create the global Strands session service"""
    global _strands_session_service
    if _strands_session_service is None:
        _strands_session_service = StrandsSessionService()
    return _strands_session_service