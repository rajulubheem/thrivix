"""
AgentCore Memory Service

Production-ready memory management using AWS Bedrock AgentCore Memory API.

Based on patterns from:
- amazon-bedrock-agentcore-samples/01-tutorials/04-AgentCore-memory/
"""
import uuid
import time
import structlog
from typing import List, Dict, Any, Optional
from datetime import datetime
from botocore.exceptions import ClientError

from app.agentcore.aws_clients import get_agentcore_client, get_agentcore_control
from app.agentcore.schemas import (
    MemoryCreate,
    MemoryResponse,
    MemoryStrategy,
    MemoryStrategyType,
    EventCreate,
    ConversationalEvent
)
from app.agentcore.config import settings

logger = structlog.get_logger()


class MemoryService:
    """
    Service for managing AgentCore Memory resources.

    Handles:
    - Memory resource creation with strategies
    - Event storage (conversations)
    - Memory record batch creation
    - Short-term and long-term memory
    """

    def __init__(self):
        self.control_client = get_agentcore_control()
        self.data_client = get_agentcore_client()
        logger.info("Memory Service initialized")

    def create_memory_resource(
        self,
        memory_request: MemoryCreate,
        role_arn: Optional[str] = None
    ) -> MemoryResponse:
        """
        Create a memory resource with configured strategies.

        Pattern from: aws_utils.py create_memory() method

        Args:
            memory_request: Memory configuration
            role_arn: IAM role ARN with permissions (optional)

        Returns:
            MemoryResponse with memory_id

        Raises:
            ClientError: If creation fails
        """
        try:
            # Build memory strategies
            strategies = self._build_strategies(memory_request.strategies)

            # Create memory resource
            create_params = {
                'clientToken': str(uuid.uuid4()),
                'name': memory_request.name,
                'eventExpiryDuration': memory_request.event_expiry_days,
                'memoryStrategies': strategies
            }

            if memory_request.description:
                create_params['description'] = memory_request.description

            if role_arn:
                create_params['memoryExecutionRoleArn'] = role_arn

            logger.info(
                "Creating memory resource",
                name=memory_request.name,
                strategies_count=len(strategies)
            )

            response = self.control_client.create_memory(**create_params)

            memory_data = response['memory']
            memory_id = memory_data['id']

            logger.info(
                "Memory resource created successfully",
                memory_id=memory_id,
                name=memory_request.name
            )

            return MemoryResponse(
                memory_id=memory_id,
                name=memory_data['name'],
                description=memory_data.get('description'),
                event_expiry_days=memory_data['eventExpiryDuration'],
                strategies=memory_request.strategies,
                created_at=datetime.now(),
                status="creating"
            )

        except ClientError as e:
            logger.error(
                "Failed to create memory resource",
                error=str(e),
                error_code=e.response['Error']['Code']
            )
            raise

    def _build_strategies(
        self,
        strategies: List[MemoryStrategy]
    ) -> List[Dict[str, Any]]:
        """
        Build strategy configurations for AgentCore API.

        Pattern from: amazon-bedrock-agentcore-samples memory strategies
        """
        built_strategies = []

        for strategy in strategies:
            if strategy.strategy_type == MemoryStrategyType.SEMANTIC:
                built_strategies.append({
                    'semanticMemoryStrategy': {
                        'name': strategy.name,
                        'description': strategy.description or 'Semantic memory strategy',
                        'namespaces': strategy.namespaces
                    }
                })

            elif strategy.strategy_type == MemoryStrategyType.SUMMARY:
                built_strategies.append({
                    'summaryMemoryStrategy': {
                        'name': strategy.name,
                        'description': strategy.description or 'Summary memory strategy',
                        'namespaces': strategy.namespaces
                    }
                })

            elif strategy.strategy_type == MemoryStrategyType.USER_PREFERENCE:
                built_strategies.append({
                    'userPreferenceMemoryStrategy': {
                        'name': strategy.name,
                        'description': strategy.description or 'User preference memory strategy',
                        'namespaces': strategy.namespaces
                    }
                })

            elif strategy.strategy_type == MemoryStrategyType.CUSTOM:
                # Custom strategy with semantic override
                custom_config = {
                    'customMemoryStrategy': {
                        'name': strategy.name,
                        'description': strategy.description or 'Custom memory strategy',
                        'namespaces': strategy.namespaces,
                        'configuration': {}
                    }
                }

                # Add custom prompts if provided
                if strategy.extraction_prompt or strategy.consolidation_prompt:
                    semantic_override = {}

                    if strategy.extraction_prompt:
                        semantic_override['extraction'] = {
                            'appendToPrompt': strategy.extraction_prompt
                        }
                        if strategy.extraction_model_id:
                            semantic_override['extraction']['modelId'] = strategy.extraction_model_id

                    if strategy.consolidation_prompt:
                        semantic_override['consolidation'] = {
                            'appendToPrompt': strategy.consolidation_prompt
                        }
                        if strategy.extraction_model_id:
                            semantic_override['consolidation']['modelId'] = strategy.extraction_model_id

                    custom_config['customMemoryStrategy']['configuration']['semanticOverride'] = semantic_override

                built_strategies.append(custom_config)

        return built_strategies

    def create_event(
        self,
        event_request: EventCreate
    ) -> Dict[str, Any]:
        """
        Store a conversation event in memory.

        Pattern from: create_event() API in samples

        Args:
            event_request: Event data with conversations

        Returns:
            Response from create_event API

        Raises:
            ClientError: If event creation fails
        """
        try:
            # Build event payload
            payload = []
            for event in event_request.events:
                payload.append({
                    'conversational': {
                        'content': {
                            'text': event.content
                        },
                        'role': event.role
                    }
                })

            # Create event
            event_timestamp = event_request.event_timestamp or int(time.time())

            logger.info(
                "Creating memory event",
                memory_id=event_request.memory_id,
                session_id=event_request.session_id,
                actor_id=event_request.actor_id,
                events_count=len(payload)
            )

            response = self.data_client.create_event(
                memoryId=event_request.memory_id,
                actorId=event_request.actor_id,
                sessionId=event_request.session_id,
                eventTimestamp=event_timestamp,
                payload=payload,
                clientToken=str(uuid.uuid4())
            )

            logger.info(
                "Memory event created successfully",
                memory_id=event_request.memory_id,
                session_id=event_request.session_id
            )

            return response

        except ClientError as e:
            logger.error(
                "Failed to create memory event",
                memory_id=event_request.memory_id,
                error=str(e),
                error_code=e.response['Error']['Code']
            )
            raise

    def batch_create_memory_records(
        self,
        memory_id: str,
        strategy_id: str,
        records: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Batch create memory records (for custom extraction pipelines).

        Pattern from: lambda_function.py MemoryIngestor class

        Args:
            memory_id: Memory resource ID
            strategy_id: Strategy ID to use
            records: List of memory records

        Returns:
            Response from batch_create_memory_records API

        Raises:
            ClientError: If batch creation fails
        """
        try:
            batch_records = []

            for record in records:
                batch_records.append({
                    'requestIdentifier': str(uuid.uuid4()),
                    'content': {'text': record['content']},
                    'namespaces': record['namespaces'],
                    'memoryStrategyId': strategy_id,
                    'timestamp': datetime.fromtimestamp(record.get('timestamp', time.time()))
                })

            logger.info(
                "Batch creating memory records",
                memory_id=memory_id,
                records_count=len(batch_records)
            )

            response = self.data_client.batch_create_memory_records(
                memoryId=memory_id,
                records=batch_records,
                clientToken=str(uuid.uuid4())
            )

            logger.info(
                "Memory records batch created successfully",
                memory_id=memory_id,
                records_count=len(batch_records)
            )

            return response

        except ClientError as e:
            logger.error(
                "Failed to batch create memory records",
                memory_id=memory_id,
                error=str(e),
                error_code=e.response['Error']['Code']
            )
            raise

    def get_memory(self, memory_id: str) -> Dict[str, Any]:
        """
        Get memory resource details.

        Args:
            memory_id: Memory resource ID

        Returns:
            Memory resource data

        Raises:
            ClientError: If retrieval fails
        """
        try:
            logger.info("Retrieving memory resource", memory_id=memory_id)

            response = self.control_client.get_memory(memoryId=memory_id)

            logger.info("Memory resource retrieved", memory_id=memory_id)
            return response['memory']

        except ClientError as e:
            logger.error(
                "Failed to get memory resource",
                memory_id=memory_id,
                error=str(e),
                error_code=e.response['Error']['Code']
            )
            raise

    def delete_memory(self, memory_id: str) -> None:
        """
        Delete a memory resource.

        Args:
            memory_id: Memory resource ID

        Raises:
            ClientError: If deletion fails
        """
        try:
            logger.info("Deleting memory resource", memory_id=memory_id)

            self.control_client.delete_memory(memoryId=memory_id)

            logger.info("Memory resource deleted", memory_id=memory_id)

        except ClientError as e:
            logger.error(
                "Failed to delete memory resource",
                memory_id=memory_id,
                error=str(e),
                error_code=e.response['Error']['Code']
            )
            raise

    def list_memories(self) -> List[Dict[str, Any]]:
        """
        List all memory resources.

        Returns:
            List of memory resources

        Raises:
            ClientError: If listing fails
        """
        try:
            logger.info("Listing memory resources")

            response = self.control_client.list_memories()

            memories = response.get('memories', [])
            logger.info("Memory resources listed", count=len(memories))

            return memories

        except ClientError as e:
            logger.error(
                "Failed to list memory resources",
                error=str(e),
                error_code=e.response['Error']['Code']
            )
            raise
