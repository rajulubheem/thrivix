"""
AWS Client Factory

Manages boto3 clients for AgentCore services with proper configuration
and error handling.

Based on patterns from amazon-bedrock-agentcore-samples.
"""
import boto3
from typing import Optional
from functools import lru_cache
import structlog

from app.agentcore.config import settings

logger = structlog.get_logger()


class AWSClientFactory:
    """
    Factory for creating and caching AWS service clients.

    Pattern from: amazon-bedrock-agentcore-samples/01-tutorials/04-AgentCore-memory/aws_utils.py
    """

    def __init__(self, region_name: Optional[str] = None):
        self.region_name = region_name or settings.AWS_REGION
        logger.info("AWS Client Factory initialized", region=self.region_name)

    @lru_cache(maxsize=10)
    def get_bedrock_runtime(self) -> boto3.client:
        """Get Bedrock Runtime client for model invocation"""
        return boto3.client(
            'bedrock-runtime',
            region_name=self.region_name
        )

    @lru_cache(maxsize=10)
    def get_agentcore_client(self) -> boto3.client:
        """
        Get AgentCore data plane client for runtime operations.

        Used for:
        - create_event (store conversations)
        - batch_create_memory_records (ingest memories)
        - invoke_agent (runtime invocation)
        """
        return boto3.client(
            'bedrock-agentcore',
            region_name=self.region_name
        )

    @lru_cache(maxsize=10)
    def get_agentcore_control(self) -> boto3.client:
        """
        Get AgentCore control plane client for setup/configuration.

        Used for:
        - create_memory (setup memory resources)
        - create_gateway (setup gateways)
        - create_gateway_target (add tools)
        - list/get/delete operations
        """
        return boto3.client(
            'bedrock-agentcore-control',
            region_name=self.region_name
        )

    @lru_cache(maxsize=10)
    def get_dynamodb(self) -> boto3.client:
        """Get DynamoDB client for session metadata (optional)"""
        return boto3.client(
            'dynamodb',
            region_name=self.region_name
        )

    @lru_cache(maxsize=10)
    def get_dynamodb_resource(self):
        """Get DynamoDB resource for higher-level operations"""
        return boto3.resource(
            'dynamodb',
            region_name=self.region_name
        )

    @lru_cache(maxsize=10)
    def get_s3(self) -> boto3.client:
        """Get S3 client (for custom memory extraction pipelines)"""
        return boto3.client(
            's3',
            region_name=self.region_name
        )

    @lru_cache(maxsize=10)
    def get_sns(self) -> boto3.client:
        """Get SNS client (for custom memory extraction pipelines)"""
        return boto3.client(
            'sns',
            region_name=self.region_name
        )

    @lru_cache(maxsize=10)
    def get_sqs(self) -> boto3.client:
        """Get SQS client (for custom memory extraction pipelines)"""
        return boto3.client(
            'sqs',
            region_name=self.region_name
        )

    @lru_cache(maxsize=10)
    def get_iam(self) -> boto3.client:
        """Get IAM client for role management"""
        return boto3.client(
            'iam',
            region_name=self.region_name
        )

    @lru_cache(maxsize=10)
    def get_cloudwatch_logs(self) -> boto3.client:
        """Get CloudWatch Logs client for observability"""
        return boto3.client(
            'logs',
            region_name=self.region_name
        )


# Global client factory instance
_client_factory: Optional[AWSClientFactory] = None


def get_client_factory(region_name: Optional[str] = None) -> AWSClientFactory:
    """
    Get or create the global AWS client factory instance.

    Args:
        region_name: AWS region (defaults to settings.AWS_REGION)

    Returns:
        AWSClientFactory instance
    """
    global _client_factory
    if _client_factory is None:
        _client_factory = AWSClientFactory(region_name)
    return _client_factory


# Convenience functions for direct client access
def get_bedrock_runtime():
    """Get Bedrock Runtime client"""
    return get_client_factory().get_bedrock_runtime()


def get_agentcore_client():
    """Get AgentCore data plane client"""
    return get_client_factory().get_agentcore_client()


def get_agentcore_control():
    """Get AgentCore control plane client"""
    return get_client_factory().get_agentcore_control()


def get_dynamodb():
    """Get DynamoDB client"""
    return get_client_factory().get_dynamodb()


def get_dynamodb_resource():
    """Get DynamoDB resource"""
    return get_client_factory().get_dynamodb_resource()
