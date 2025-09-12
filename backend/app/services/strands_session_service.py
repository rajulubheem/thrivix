"""
Strands SDK Session Management Service
Properly uses FileSessionManager for persistent sessions with virtual filesystem support
"""
import os
import json
import asyncio
import shutil
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
    """Service for managing Strands agent sessions with PROPER persistence according to Strands docs"""
    
    def __init__(self, storage_dir: str = "./strands_sessions"):
        """Initialize the session service with storage directory"""
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(exist_ok=True, parents=True)
        # Store session managers that are SHARED across agents
        self.session_managers: Dict[str, FileSessionManager] = {}
        # Store agents by session_id -> agent_name -> agent
        self.active_agents: Dict[str, Dict[str, Agent]] = {}
        # Store shared conversation managers
        self.conversation_managers: Dict[str, SlidingWindowConversationManager] = {}
        logger.info(f"StrandsSessionService initialized with storage at {self.storage_dir}")
    
    def get_or_create_session(self, session_id: str) -> FileSessionManager:
        """Get existing SHARED session manager or create new one - ONE per session_id"""
        try:
            # CRITICAL: Return existing session manager if it exists in memory
            # This ensures ALL agents in a session share the SAME session manager
            if session_id in self.session_managers:
                logger.info(f"♻️ Returning EXISTING shared session manager for {session_id}")
                return self.session_managers[session_id]
            
            # Check if we have a valid Strands session directory
            session_path = self.storage_dir / f"session_{session_id}"
            session_manager = None
            
            if session_path.exists():
                # Check if it's a valid Strands session (has session.json)
                session_json_path = session_path / "session.json"
                if session_json_path.exists():
                    # Valid Strands session exists, load it
                    logger.info(f"📂 Found valid Strands session on disk for {session_id}")
                    session_manager = FileSessionManager(
                        session_id=session_id,
                        storage_dir=str(self.storage_dir)
                    )
                    logger.info(f"✅ Loaded existing Strands session for {session_id}")
                else:
                    # We have our custom metadata but not a Strands session
                    # Clean it up to let Strands create properly
                    logger.info(f"🧹 Cleaning up non-Strands session directory for {session_id}")
                    # Save metadata first if it exists
                    metadata_path = session_path / "metadata.json"
                    saved_metadata = None
                    if metadata_path.exists():
                        with open(metadata_path, 'r') as f:
                            saved_metadata = json.load(f)
                    
                    # Remove the directory
                    shutil.rmtree(session_path)
                    
                    # Create fresh Strands session
                    session_manager = FileSessionManager(
                        session_id=session_id,
                        storage_dir=str(self.storage_dir)
                    )
                    
                    # Restore metadata if we had it
                    if saved_metadata:
                        metadata_path = session_path / "metadata.json"
                        with open(metadata_path, 'w') as f:
                            json.dump(saved_metadata, f, indent=2)
                    
                    logger.info(f"✅ Created new Strands session for {session_id}")
            else:
                # No session exists, create new one
                session_manager = FileSessionManager(
                    session_id=session_id,
                    storage_dir=str(self.storage_dir)
                )
                logger.info(f"✅ Created new Strands session for {session_id}")
            
            # Store it for reuse by other agents
            self.session_managers[session_id] = session_manager
            logger.info(f"💾 Cached session manager for {session_id}")
            return session_manager
        except Exception as e:
            logger.error(f"Failed to create/load session manager: {e}")
            raise
    
    def get_or_create_conversation_manager(self, session_id: str) -> SlidingWindowConversationManager:
        """Get or create SHARED conversation manager for a session"""
        if session_id in self.conversation_managers:
            logger.info(f"♻️ Returning EXISTING conversation manager for {session_id}")
            return self.conversation_managers[session_id]
        
        # Create shared conversation manager with proper window size
        conversation_manager = SlidingWindowConversationManager(
            window_size=150,  # Keep a larger rolling window to avoid losing user intent
            should_truncate_results=True
        )
        self.conversation_managers[session_id] = conversation_manager
        logger.info(f"✅ Created NEW shared conversation manager for {session_id}")
        return conversation_manager
    
    def get_or_create_agent(
        self, 
        session_id: str,
        agent_name: str = "default",
        system_prompt: str = None,
        tools: List = None,
        model_config: Dict[str, Any] = None,
        callback_handler: Any = None,
        force_new: bool = False
    ) -> Agent:
        """Get existing agent or create new one - PROPERLY sharing session and conversation managers"""
        try:
            # Check if agent already exists and return it unless force_new
            if not force_new:
                if session_id in self.active_agents and agent_name in self.active_agents[session_id]:
                    logger.info(f"♻️ Returning EXISTING agent '{agent_name}' for session {session_id}")
                    return self.active_agents[session_id][agent_name]
            
            # CRITICAL: Get SHARED session manager for this session_id
            # ALL agents in the same session MUST share this SAME session manager
            session_manager = self.get_or_create_session(session_id)
            
            # CRITICAL: Get SHARED conversation manager
            # ALL agents in the same session MUST share this SAME conversation manager
            conversation_manager = self.get_or_create_conversation_manager(session_id)
            
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
            
            # COORDINATOR PATTERN: Use session_id as agent_id for coordinator
            if agent_name == "coordinator":
                # Coordinator uses session_id as agent_id for persistence
                agent_id = session_id
                logger.info(f"🎯 Creating COORDINATOR with agent_id={session_id} for persistence")
            else:
                # Other agents use unique IDs
                agent_id = f"{session_id}_{agent_name}"
            
            # Create agent with SHARED session and conversation managers
            # According to Strands docs: Agent automatically loads conversation history from session manager
            agent = Agent(
                agent_id=agent_id,  # Coordinator uses session_id for persistence
                session_manager=session_manager,  # SHARED session manager
                conversation_manager=conversation_manager,  # SHARED conversation manager
                system_prompt=system_prompt or f"You are {agent_name}, a helpful AI assistant.",
                tools=tools or [],
                model=model,
                callback_handler=callback_handler
                # DO NOT pass messages - session manager handles this automatically
            )
            
            # Store agent for reuse
            if session_id not in self.active_agents:
                self.active_agents[session_id] = {}
            
            self.active_agents[session_id][agent_name] = agent
            
            logger.info(f"✅ Agent '{agent_name}' created for session {session_id} with SHARED managers")
            return agent
            
        except Exception as e:
            logger.error(f"Failed to create agent with session: {e}")
            raise

    # Backwards-compatible alias used by some endpoints
    def create_agent_with_session(
        self,
        session_id: str,
        agent_name: str = "default",
        system_prompt: str = None,
        tools: List = None,
        model_config: Dict[str, Any] = None,
        callback_handler: Any = None,
        force_new: bool = False,
    ) -> Agent:
        return self.get_or_create_agent(
            session_id=session_id,
            agent_name=agent_name,
            system_prompt=system_prompt,
            tools=tools,
            model_config=model_config,
            callback_handler=callback_handler,
            force_new=force_new,
        )
    
    def get_all_agents(self, session_id: str) -> Dict[str, Agent]:
        """Get all agents for a session"""
        return self.active_agents.get(session_id, {})
    
    def clear_session_agents(self, session_id: str):
        """Clear all agents for a session but keep session manager"""
        if session_id in self.active_agents:
            logger.info(f"🧹 Clearing {len(self.active_agents[session_id])} agents for session {session_id}")
            del self.active_agents[session_id]
    
    def save_virtual_filesystem(self, session_id: str, filesystem: Dict[str, str]):
        """Save virtual filesystem to agent state"""
        try:
            # Get any agent for this session to access shared state
            agents = self.get_all_agents(session_id)
            if agents:
                # Use first agent to save to shared state
                agent = next(iter(agents.values()))
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
            # Try to get from any active agent first
            agents = self.get_all_agents(session_id)
            if agents:
                # Use first agent to get from shared state
                agent = next(iter(agents.values()))
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
        """Save additional context to session - MERGES with existing context"""
        try:
            # Get or create metadata file
            metadata_path = self.storage_dir / f"session_{session_id}" / "metadata.json"
            metadata_path.parent.mkdir(exist_ok=True, parents=True)
            
            metadata = {}
            if metadata_path.exists():
                with open(metadata_path, 'r') as f:
                    metadata = json.load(f)
            
            # CRITICAL FIX: Merge context instead of replacing it
            # This is especially important for messages array
            if "context" not in metadata:
                metadata["context"] = {}
            
            # Merge each field intelligently
            for key, value in context.items():
                if key == "messages" and "messages" in metadata["context"]:
                    # For messages, we want to preserve ALL messages
                    # The new context should contain the complete history
                    # So we just use the new messages array as it should be complete
                    metadata["context"][key] = value
                elif key == "task_history" and "task_history" in metadata["context"]:
                    # For task history, append new tasks if not already present
                    existing_tasks = metadata["context"][key]
                    for task in value:
                        if task not in existing_tasks:
                            existing_tasks.append(task)
                    metadata["context"][key] = existing_tasks
                else:
                    # For other fields, just update with new value
                    metadata["context"][key] = value
            
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
            # Remove agents
            if session_id in self.active_agents:
                del self.active_agents[session_id]
            
            # Remove session manager
            if session_id in self.session_managers:
                del self.session_managers[session_id]
            
            # Remove conversation manager
            if session_id in self.conversation_managers:
                del self.conversation_managers[session_id]
            
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

    def get_session_messages(self, session_id: str) -> List[Dict[str, Any]]:
        """Get message history from session"""
        try:
            # Try multiple approaches to get messages
            
            # 1. Check context in metadata
            context = self.get_context(session_id)
            if context and 'messages' in context:
                logger.info(f"Retrieved {len(context['messages'])} messages from context for session {session_id}")
                return context['messages']
            
            # 2. Check agent conversation logs
            agents_dir = self.storage_dir / f"session_{session_id}" / "agents"
            if agents_dir.exists():
                # Look for coordinator agent first
                coordinator_log = agents_dir / "coordinator" / "conversation.json"
                if coordinator_log.exists():
                    with open(coordinator_log, 'r') as f:
                        conversation = json.load(f)
                        messages = []
                        for msg in conversation.get('messages', []):
                            messages.append({
                                'role': msg.get('role', 'user'),
                                'content': msg.get('content', ''),
                                'timestamp': msg.get('timestamp', datetime.now().isoformat()),
                                'sources': msg.get('sources', []),
                                'thoughts': msg.get('thoughts', [])
                            })
                        if messages:
                            logger.info(f"Retrieved {len(messages)} messages from coordinator log for session {session_id}")
                            return messages
                
                # Try any agent's conversation log
                for agent_dir in agents_dir.iterdir():
                    if agent_dir.is_dir():
                        conv_log = agent_dir / "conversation.json"
                        if conv_log.exists():
                            with open(conv_log, 'r') as f:
                                conversation = json.load(f)
                                messages = []
                                for msg in conversation.get('messages', []):
                                    messages.append({
                                        'role': msg.get('role', 'user'),
                                        'content': msg.get('content', ''),
                                        'timestamp': msg.get('timestamp', datetime.now().isoformat()),
                                        'sources': msg.get('sources', []),
                                        'thoughts': msg.get('thoughts', [])
                                    })
                                if messages:
                                    logger.info(f"Retrieved {len(messages)} messages from {agent_dir.name} log for session {session_id}")
                                    return messages
            
            logger.info(f"No messages found for session {session_id}")
            return []
            
        except Exception as e:
            logger.error(f"Failed to get session messages: {e}")
            return []
    
    async def load_session_data(self, session_id: str) -> Dict[str, Any]:
        """Load complete session data from storage"""
        try:
            session_data = {
                'session_id': session_id,
                'status': 'completed',
                'progress': 100,
                'steps': [],
                'content': '',
                'sources': [],
                'thoughts': [],
                'timestamp': datetime.now().isoformat(),
                'messages': []
            }
            
            # Load messages
            messages = self.get_session_messages(session_id)
            if messages:
                session_data['messages'] = messages
                # Extract content from last assistant message
                for msg in reversed(messages):
                    if msg.get('role') == 'assistant':
                        session_data['content'] = msg.get('content', '')
                        session_data['sources'] = msg.get('sources', [])
                        session_data['thoughts'] = msg.get('thoughts', [])
                        break
            
            # Load context
            context = self.get_context(session_id)
            if context:
                session_data.update(context)
            
            logger.info(f"Loaded session data for {session_id}")
            return session_data
            
        except Exception as e:
            logger.error(f"Failed to load session data: {e}")
            return None

# Global instance
_strands_session_service = None

def get_strands_session_service() -> StrandsSessionService:
    """Get or create the global Strands session service"""
    global _strands_session_service
    if _strands_session_service is None:
        _strands_session_service = StrandsSessionService()
    return _strands_session_service
