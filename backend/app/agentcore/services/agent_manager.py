"""
Agent Manager

Manages Strands agents with Bedrock integration and AgentCore features.

Based on patterns from:
- strands-samples/ (Strands Agent creation and usage)
- amazon-bedrock-agentcore-samples (Bedrock + AgentCore integration)
"""
import uuid
import structlog
from typing import Dict, Any, Optional, List
from datetime import datetime

from strands import Agent, tool
from strands.models import BedrockModel

from app.agentcore.schemas import (
    AgentCreate,
    AgentResponse,
    AgentUpdate,
    AgentInvokeRequest,
    AgentInvokeResponse,
    ModelConfig
)
from app.agentcore.services.memory_service import MemoryService
from app.agentcore.services.gateway_service import GatewayService
from app.agentcore.services.session_manager import SessionManager
from app.agentcore.config import settings
from app.agentcore.tools import get_tools_by_names

logger = structlog.get_logger()


class AgentManager:
    """
    Manages agent lifecycle and integration with AgentCore services.

    Handles:
    - Agent creation with Bedrock models
    - Memory integration
    - Gateway/tools integration
    - Session management
    - Agent invocation
    """

    def __init__(
        self,
        memory_service: Optional[MemoryService] = None,
        gateway_service: Optional[GatewayService] = None,
        session_manager: Optional[SessionManager] = None
    ):
        self.memory_service = memory_service or MemoryService()
        self.gateway_service = gateway_service or GatewayService()
        self.session_manager = session_manager or SessionManager()

        # Agent registry: {agent_id: agent_config}
        self._agents: Dict[str, Dict[str, Any]] = {}

        logger.info("Agent Manager initialized")

    def create_agent(self, agent_request: AgentCreate) -> AgentResponse:
        """
        Create a new agent with Bedrock model and AgentCore integration.

        Pattern from: Strands samples - BedrockModel initialization

        Args:
            agent_request: Agent configuration

        Returns:
            AgentResponse with agent details

        Raises:
            Exception: If creation fails
        """
        try:
            agent_id = str(uuid.uuid4())
            now = datetime.now()

            logger.info(
                "Creating agent",
                agent_id=agent_id,
                name=agent_request.name,
                agent_type=agent_request.agent_type
            )

            # Create memory resource if needed
            memory_id = agent_request.memory_id
            if agent_request.create_memory and not memory_id:
                from app.agentcore.schemas import MemoryCreate, MemoryStrategy, MemoryStrategyType

                memory_name = f"{agent_request.name}-memory"
                memory_strategies = [
                    MemoryStrategy(
                        strategy_type=MemoryStrategyType.SEMANTIC,
                        name="FactExtractor",
                        description="Extract factual information",
                        namespaces=[f"agent/{agent_id}/{{actorId}}/facts"]
                    )
                ]

                if agent_request.memory_type in ["long_term", "both"]:
                    memory_strategies.append(
                        MemoryStrategy(
                            strategy_type=MemoryStrategyType.USER_PREFERENCE,
                            name="UserPreferences",
                            description="Track user preferences",
                            namespaces=[f"agent/{agent_id}/{{actorId}}/preferences"]
                        )
                    )

                memory_create = MemoryCreate(
                    name=memory_name,
                    description=f"Memory for {agent_request.name}",
                    event_expiry_days=settings.MEMORY_EVENT_EXPIRY_DAYS,
                    strategies=memory_strategies
                )

                memory_response = self.memory_service.create_memory_resource(memory_create)
                memory_id = memory_response.memory_id

                logger.info(
                    "Memory resource created for agent",
                    agent_id=agent_id,
                    memory_id=memory_id
                )

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

            logger.info(
                "Agent created successfully",
                agent_id=agent_id,
                name=agent_request.name
            )

            return AgentResponse(**agent_config)

        except Exception as e:
            logger.error(
                "Failed to create agent",
                name=agent_request.name,
                error=str(e)
            )
            raise

    def get_agent(self, agent_id: str) -> Optional[AgentResponse]:
        """
        Get agent by ID.

        Args:
            agent_id: Agent ID

        Returns:
            AgentResponse if found, None otherwise
        """
        agent_config = self._agents.get(agent_id)
        if not agent_config:
            logger.debug("Agent not found", agent_id=agent_id)
            return None

        return AgentResponse(**agent_config)

    def list_agents(
        self,
        agent_type: Optional[str] = None,
        status: Optional[str] = None
    ) -> List[AgentResponse]:
        """
        List agents with optional filtering.

        Args:
            agent_type: Filter by agent type
            status: Filter by status

        Returns:
            List of agents
        """
        agents = []
        for agent_config in self._agents.values():
            # Apply filters
            if agent_type and agent_config['agent_type'] != agent_type:
                continue
            if status and agent_config['status'] != status:
                continue

            agents.append(AgentResponse(**agent_config))

        return agents

    def update_agent(
        self,
        agent_id: str,
        agent_update: AgentUpdate
    ) -> AgentResponse:
        """
        Update agent configuration.

        Args:
            agent_id: Agent ID
            agent_update: Update data

        Returns:
            Updated AgentResponse

        Raises:
            ValueError: If agent not found
        """
        agent_config = self._agents.get(agent_id)
        if not agent_config:
            raise ValueError(f"Agent not found: {agent_id}")

        # Update fields
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
        """
        Delete an agent.

        Args:
            agent_id: Agent ID

        Raises:
            ValueError: If agent not found
        """
        if agent_id not in self._agents:
            raise ValueError(f"Agent not found: {agent_id}")

        del self._agents[agent_id]
        logger.info("Agent deleted", agent_id=agent_id)

    def _create_strands_agent(
        self,
        agent_config: Dict[str, Any],
        tools: Optional[List] = None
    ) -> Agent:
        """
        Create Strands Agent instance with Bedrock model.

        Pattern from: Strands samples - Agent creation

        Args:
            agent_config: Agent configuration
            tools: Optional list of tools

        Returns:
            Strands Agent instance
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

        # Create agent with system prompt
        agent = Agent(
            model=model,
            name=agent_config['name'],
            tools=tools or [],
            system_prompt=agent_config['system_prompt']
        )

        logger.debug(
            "Strands agent created",
            agent_id=agent_config['agent_id'],
            model_id=model_config['model_id']
        )

        return agent

    def _load_tools(self, agent_config: Dict[str, Any]) -> List:
        """
        Load tools for an agent based on configuration.

        Pattern from: Strands samples - tools are loaded and passed to Agent

        Args:
            agent_config: Agent configuration

        Returns:
            List of tool functions
        """
        tools = []

        # Load built-in tools by name
        if agent_config.get('tools_enabled') and agent_config.get('tools'):
            tool_names = agent_config['tools']
            tools.extend(get_tools_by_names(tool_names))

            logger.debug(
                "Loaded built-in tools",
                agent_id=agent_config['agent_id'],
                tools=tool_names,
                count=len(tools)
            )

        # TODO: Load tools from gateway if gateway_id is provided
        # This would involve:
        # 1. Get gateway details
        # 2. Get gateway targets
        # 3. Create MCP client for MCP targets
        # 4. Wrap Lambda/OpenAPI targets as tools

        return tools

    def invoke_agent(
        self,
        agent_id: str,
        invoke_request: AgentInvokeRequest
    ) -> AgentInvokeResponse:
        """
        Invoke an agent with prompt.

        Pattern from: Strands samples + Triage agent session handling

        Args:
            agent_id: Agent ID
            invoke_request: Invocation request

        Returns:
            Agent response

        Raises:
            ValueError: If agent not found
            Exception: If invocation fails
        """
        try:
            agent_config = self._agents.get(agent_id)
            if not agent_config:
                raise ValueError(f"Agent not found: {agent_id}")

            logger.info(
                "Invoking agent",
                agent_id=agent_id,
                actor_id=invoke_request.actor_id
            )

            # Get or create session
            session_id = invoke_request.session_id
            if not session_id:
                from app.agentcore.schemas import SessionCreate

                session_create = SessionCreate(
                    agent_id=agent_id,
                    actor_id=invoke_request.actor_id,
                    session_metadata={}
                )
                session_response = self.session_manager.create_session(
                    session_create,
                    expiry_seconds=agent_config['session_expiry']
                )
                session_id = session_response.session_id
            else:
                # Validate session exists
                session = self.session_manager.get_session(session_id)
                if not session:
                    raise ValueError(f"Session not found or expired: {session_id}")

            # Get or create cached agent instance
            strands_agent = self.session_manager.get_cached_agent(session_id, agent_id)
            if not strands_agent:
                # Load tools
                tools = self._load_tools(agent_config)
                strands_agent = self._create_strands_agent(agent_config, tools)
                self.session_manager.cache_agent(session_id, agent_id, strands_agent)

            # Store conversation in memory (if enabled)
            if invoke_request.include_memory and agent_config['memory_id']:
                from app.agentcore.schemas import EventCreate, ConversationalEvent

                events = [
                    ConversationalEvent(role="USER", content=invoke_request.prompt)
                ]

                event_create = EventCreate(
                    memory_id=agent_config['memory_id'],
                    actor_id=invoke_request.actor_id,
                    session_id=session_id,
                    events=events
                )

                self.memory_service.create_event(event_create)

            # Invoke agent
            response_text = strands_agent(invoke_request.prompt)

            # Store assistant response in memory
            if invoke_request.include_memory and agent_config['memory_id']:
                from app.agentcore.schemas import EventCreate, ConversationalEvent

                events = [
                    ConversationalEvent(role="ASSISTANT", content=response_text)
                ]

                event_create = EventCreate(
                    memory_id=agent_config['memory_id'],
                    actor_id=invoke_request.actor_id,
                    session_id=session_id,
                    events=events
                )

                self.memory_service.create_event(event_create)

            # Update session activity
            self.session_manager.update_session_activity(session_id, increment_message_count=True)

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
                memory_used=invoke_request.include_memory,
                tools_called=[],
                metadata={}
            )

        except Exception as e:
            logger.error(
                "Failed to invoke agent",
                agent_id=agent_id,
                error=str(e)
            )
            raise


# Global agent manager instance
_agent_manager: Optional[AgentManager] = None


def get_agent_manager() -> AgentManager:
    """
    Get or create the global agent manager instance.

    Returns:
        AgentManager instance
    """
    global _agent_manager
    if _agent_manager is None:
        _agent_manager = AgentManager()
    return _agent_manager
