"""
Agent Manager - CORRECT Implementation

Properly integrates Strands Agents with FileSessionManager and AgentCore Memory.

Key Pattern from Strands Samples:
1. FileSessionManager = conversation history (this session's messages)
2. AgentCore Memory = long-term memory (cross-session preferences, facts)
3. Agent(model, tools, session_manager=session_manager) - session_manager handles history
4. agent(prompt) - that's it! No manual message management needed
"""
import uuid
import structlog
from typing import Dict, Any, Optional, List
from datetime import datetime

from strands import Agent
from strands.models import BedrockModel

from app.agentcore.schemas import (
    AgentCreate,
    AgentResponse,
    AgentUpdate,
    AgentInvokeRequest,
    AgentInvokeResponse
)
from app.agentcore.services.memory_service import MemoryService
from app.agentcore.services.agent_session_manager import get_agent_session_manager
from app.agentcore.config import settings
from app.agentcore.tools import get_tools_by_names

logger = structlog.get_logger()


class AgentManagerV2:
    """
    Manages agent lifecycle with proper Strands session integration.

    CRITICAL INSIGHT:
    - Don't manually manage conversation history
    - FileSessionManager does this automatically
    - Just call agent(prompt) - it retrieves history, adds message, returns response
    """

    def __init__(self, memory_service: Optional[MemoryService] = None):
        self.memory_service = memory_service or MemoryService()
        self.session_mgr = get_agent_session_manager()

        # Agent registry: {agent_id: agent_config}
        self._agents: Dict[str, Dict[str, Any]] = {}

        logger.info("Agent Manager V2 initialized")

    def create_agent(self, agent_request: AgentCreate) -> AgentResponse:
        """
        Create a new agent configuration.

        Note: We store config, but Agent instances are created per-session.

        Args:
            agent_request: Agent configuration

        Returns:
            AgentResponse with agent details
        """
        try:
            agent_id = str(uuid.uuid4())
            now = datetime.now()

            logger.info(
                "Creating agent",
                agent_id=agent_id,
                name=agent_request.name
            )

            # Create memory resource if needed
            memory_id = agent_request.memory_id
            if agent_request.create_memory and not memory_id:
                from app.agentcore.schemas import MemoryCreate, MemoryStrategy, MemoryStrategyType

                memory_strategies = [
                    MemoryStrategy(
                        strategy_type=MemoryStrategyType.SEMANTIC,
                        name="FactExtractor",
                        namespaces=[f"agent/{agent_id}/{{actorId}}/facts"]
                    ),
                    MemoryStrategy(
                        strategy_type=MemoryStrategyType.USER_PREFERENCE,
                        name="UserPreferences",
                        namespaces=[f"agent/{agent_id}/{{actorId}}/preferences"]
                    )
                ]

                memory_create = MemoryCreate(
                    name=f"{agent_request.name}-memory",
                    event_expiry_days=settings.MEMORY_EVENT_EXPIRY_DAYS,
                    strategies=memory_strategies
                )

                memory_response = self.memory_service.create_memory_resource(memory_create)
                memory_id = memory_response.memory_id

                logger.info("Memory resource created", memory_id=memory_id)

            # Store agent configuration
            agent_config = {
                'agent_id': agent_id,
                'name': agent_request.name,
                'agent_type': agent_request.agent_type.value,
                'character': agent_request.character,
                'system_prompt': agent_request.system_prompt,
                'user_prompt': agent_request.user_prompt,
                'model_config': agent_request.model_config.dict(),
                'memory_id': memory_id,
                'memory_type': agent_request.memory_type,
                'session_expiry': agent_request.session_expiry,
                'tools_enabled': agent_request.tools_enabled,
                'tools': agent_request.tools or [],
                'gateway_id': agent_request.gateway_id,
                'knowledge_base_id': agent_request.knowledge_base_id,
                'code_interpreter_enabled': agent_request.code_interpreter_enabled,
                'skills': agent_request.skills or [],
                'metadata': agent_request.metadata,
                'created_at': now,
                'updated_at': now,
                'status': 'active'
            }

            self._agents[agent_id] = agent_config

            logger.info("Agent created successfully", agent_id=agent_id)

            return AgentResponse(**agent_config)

        except Exception as e:
            logger.error("Failed to create agent", error=str(e))
            raise

    def get_agent(self, agent_id: str) -> Optional[AgentResponse]:
        """Get agent configuration by ID."""
        agent_config = self._agents.get(agent_id)
        if not agent_config:
            return None
        return AgentResponse(**agent_config)

    def list_agents(
        self,
        agent_type: Optional[str] = None,
        status: Optional[str] = None
    ) -> List[AgentResponse]:
        """List agents with optional filtering."""
        agents = []
        for agent_config in self._agents.values():
            if agent_type and agent_config['agent_type'] != agent_type:
                continue
            if status and agent_config['status'] != status:
                continue
            agents.append(AgentResponse(**agent_config))
        return agents

    def update_agent(self, agent_id: str, agent_update: AgentUpdate) -> AgentResponse:
        """Update agent configuration."""
        agent_config = self._agents.get(agent_id)
        if not agent_config:
            raise ValueError(f"Agent not found: {agent_id}")

        update_data = agent_update.dict(exclude_unset=True)
        for key, value in update_data.items():
            if key == 'model_config' and value:
                agent_config['model_config'].update(value.dict())
            elif value is not None:
                agent_config[key] = value

        agent_config['updated_at'] = datetime.now()

        logger.info("Agent updated", agent_id=agent_id)
        return AgentResponse(**agent_config)

    def delete_agent(self, agent_id: str) -> None:
        """Delete an agent."""
        if agent_id not in self._agents:
            raise ValueError(f"Agent not found: {agent_id}")
        del self._agents[agent_id]
        logger.info("Agent deleted", agent_id=agent_id)

    def _create_strands_agent(
        self,
        agent_config: Dict[str, Any],
        session_id: str
    ) -> Agent:
        """
        Create Strands Agent instance with FileSessionManager.

        CRITICAL PATTERN from research-agent:
        ```python
        session_manager = FileSessionManager(session_id=session_id, storage_dir=...)
        agent = Agent(model=model, tools=tools, session_manager=session_manager)
        ```

        Args:
            agent_config: Agent configuration
            session_id: Session ID for FileSessionManager

        Returns:
            Configured Strands Agent instance
        """
        model_config = agent_config['model_config']

        # Create Bedrock model
        model = BedrockModel(
            model_id=model_config['model_id'],
            temperature=model_config.get('temperature', 0.7),
            max_tokens=model_config.get('max_tokens', 4096),
            top_p=model_config.get('top_p'),
            stop_sequences=model_config.get('stop_sequences')
        )

        # Load tools
        tools = []
        if agent_config.get('tools_enabled') and agent_config.get('tools'):
            tools = get_tools_by_names(agent_config['tools'])

        # Get FileSessionManager for this session
        session_manager = self.session_mgr.get_file_session_manager(session_id)

        # Create agent with session manager (THIS IS THE KEY!)
        agent = Agent(
            model=model,
            tools=tools,
            session_manager=session_manager,  # ← Handles all conversation history
            system_prompt=agent_config['system_prompt']
        )

        logger.info(
            "Strands agent created with session manager",
            agent_id=agent_config['agent_id'],
            session_id=session_id,
            tools_count=len(tools)
        )

        return agent

    def invoke_agent(
        self,
        agent_id: str,
        invoke_request: AgentInvokeRequest
    ) -> AgentInvokeResponse:
        """
        Invoke an agent with a prompt.

        CORRECT FLOW:
        1. Get or create session_id
        2. Validate session exists
        3. Create/get Agent with FileSessionManager(session_id)
        4. Call agent(prompt) - that's it! Session manager handles history
        5. Optionally store in AgentCore Memory for long-term learning

        Args:
            agent_id: Agent ID
            invoke_request: Invocation request with prompt, session_id, actor_id

        Returns:
            Agent response with session_id
        """
        try:
            agent_config = self._agents.get(agent_id)
            if not agent_config:
                raise ValueError(f"Agent not found: {agent_id}")

            logger.info(
                "Invoking agent",
                agent_id=agent_id,
                actor_id=invoke_request.actor_id,
                session_id=invoke_request.session_id
            )

            # Get or create session
            session_id = invoke_request.session_id
            if not session_id:
                # Create new session
                session_id = self.session_mgr.create_session(
                    agent_id=agent_id,
                    actor_id=invoke_request.actor_id,
                    session_expiry_seconds=agent_config['session_expiry']
                )
                logger.info("New session created", session_id=session_id)
            else:
                # Validate existing session
                if not self.session_mgr.validate_session(session_id):
                    raise ValueError(f"Session not found or expired: {session_id}")

            # Create Strands Agent with FileSessionManager for this session
            # The FileSessionManager will automatically load conversation history
            strands_agent = self._create_strands_agent(agent_config, session_id)

            # Invoke agent - FileSessionManager handles:
            # 1. Loading conversation history
            # 2. Adding user message
            # 3. Calling LLM with full context
            # 4. Storing assistant response
            response_text = strands_agent(invoke_request.prompt)

            # Update session activity
            self.session_mgr.update_session_activity(session_id)

            # Optional: Store in AgentCore Memory for long-term learning
            if invoke_request.include_memory and agent_config['memory_id']:
                try:
                    from app.agentcore.schemas import EventCreate, ConversationalEvent

                    events = [
                        ConversationalEvent(role="USER", content=invoke_request.prompt),
                        ConversationalEvent(role="ASSISTANT", content=response_text)
                    ]

                    event_create = EventCreate(
                        memory_id=agent_config['memory_id'],
                        actor_id=invoke_request.actor_id,
                        session_id=session_id,
                        events=events
                    )

                    self.memory_service.create_event(event_create)
                    logger.debug("Stored in AgentCore Memory", memory_id=agent_config['memory_id'])
                except Exception as e:
                    logger.warning("Failed to store in AgentCore Memory", error=str(e))

            logger.info(
                "Agent invoked successfully",
                agent_id=agent_id,
                session_id=session_id
            )

            return AgentInvokeResponse(
                agent_id=agent_id,
                session_id=session_id,
                response=response_text,
                model_id=agent_config['model_config']['model_id'],
                memory_used=invoke_request.include_memory and bool(agent_config['memory_id']),
                tools_called=[],  # TODO: Extract from agent response
                metadata={}
            )

        except Exception as e:
            logger.error(
                "Failed to invoke agent",
                agent_id=agent_id,
                error=str(e)
            )
            raise


# Global instance
_agent_manager_v2: Optional[AgentManagerV2] = None


def get_agent_manager_v2() -> AgentManagerV2:
    """
    Get or create the global agent manager instance.

    Returns:
        AgentManagerV2 instance
    """
    global _agent_manager_v2
    if _agent_manager_v2 is None:
        _agent_manager_v2 = AgentManagerV2()
    return _agent_manager_v2
