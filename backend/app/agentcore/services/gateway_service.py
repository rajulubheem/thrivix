"""
AgentCore Gateway Service

Production-ready gateway management using AWS Bedrock AgentCore Gateway API.

Based on patterns from:
- amazon-bedrock-agentcore-samples/01-tutorials/02-AgentCore-gateway/
"""
import uuid
import structlog
from typing import List, Dict, Any, Optional
from datetime import datetime
from botocore.exceptions import ClientError

from app.agentcore.aws_clients import get_agentcore_control
from app.agentcore.schemas import (
    GatewayCreate,
    GatewayResponse,
    GatewayTargetCreate,
    GatewayTargetType
)

logger = structlog.get_logger()


class GatewayService:
    """
    Service for managing AgentCore Gateway resources.

    Handles:
    - Gateway creation with JWT authorization
    - Tool integration (Lambda, OpenAPI, Smithy, MCP)
    - OAuth2 credential providers
    - Semantic search configuration
    """

    def __init__(self):
        self.client = get_agentcore_control()
        logger.info("Gateway Service initialized")

    def create_gateway(
        self,
        gateway_request: GatewayCreate
    ) -> GatewayResponse:
        """
        Create a gateway resource.

        Pattern from: amazon-bedrock-agentcore-samples gateway tutorials

        Args:
            gateway_request: Gateway configuration

        Returns:
            GatewayResponse with gateway_id and endpoint

        Raises:
            ClientError: If creation fails
        """
        try:
            create_params = {
                'clientToken': str(uuid.uuid4()),
                'name': gateway_request.name
            }

            if gateway_request.description:
                create_params['description'] = gateway_request.description

            # Enable semantic search (pattern from samples)
            if gateway_request.enable_semantic_search:
                create_params['semanticSearchConfiguration'] = {
                    'enabled': True
                }

            # JWT authorizer configuration
            if gateway_request.jwt_authorizer_config:
                create_params['authorizerConfiguration'] = {
                    'jwtAuthorizer': gateway_request.jwt_authorizer_config
                }

            logger.info(
                "Creating gateway",
                name=gateway_request.name,
                semantic_search=gateway_request.enable_semantic_search
            )

            response = self.client.create_gateway(**create_params)

            gateway_data = response['gateway']
            gateway_id = gateway_data['id']

            logger.info(
                "Gateway created successfully",
                gateway_id=gateway_id,
                name=gateway_request.name
            )

            return GatewayResponse(
                gateway_id=gateway_id,
                name=gateway_data['name'],
                description=gateway_data.get('description'),
                endpoint_url=gateway_data.get('endpoint', ''),
                enable_semantic_search=gateway_request.enable_semantic_search,
                created_at=datetime.now(),
                status="creating"
            )

        except ClientError as e:
            logger.error(
                "Failed to create gateway",
                error=str(e),
                error_code=e.response['Error']['Code']
            )
            raise

    def create_lambda_target(
        self,
        gateway_id: str,
        function_arn: str,
        tool_name: str,
        tool_description: str,
        input_schema: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Add a Lambda function as a gateway target.

        Pattern from: samples 02-lambda-target/

        Args:
            gateway_id: Gateway ID
            function_arn: Lambda function ARN
            tool_name: Name of the tool
            tool_description: Description of the tool
            input_schema: JSON schema for tool input

        Returns:
            Target creation response

        Raises:
            ClientError: If target creation fails
        """
        try:
            # Build Lambda target configuration
            target_config = {
                'lambdaTarget': {
                    'functionArn': function_arn,
                    'toolMetadata': [
                        {
                            'name': tool_name,
                            'description': tool_description,
                            'inputSchema': input_schema
                        }
                    ]
                }
            }

            logger.info(
                "Creating Lambda target",
                gateway_id=gateway_id,
                function_arn=function_arn,
                tool_name=tool_name
            )

            response = self.client.create_gateway_target(
                gatewayId=gateway_id,
                clientToken=str(uuid.uuid4()),
                **target_config
            )

            logger.info(
                "Lambda target created",
                gateway_id=gateway_id,
                target_id=response.get('target', {}).get('id')
            )

            return response

        except ClientError as e:
            logger.error(
                "Failed to create Lambda target",
                gateway_id=gateway_id,
                error=str(e),
                error_code=e.response['Error']['Code']
            )
            raise

    def create_openapi_target(
        self,
        gateway_id: str,
        tools_spec: List[Dict[str, Any]],
        api_base_url: Optional[str] = None,
        auth_config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Add OpenAPI specification as a gateway target.

        Pattern from: samples 03-openapi-target/

        Args:
            gateway_id: Gateway ID
            tools_spec: Array of tool definitions with OpenAPI specs
            api_base_url: Base URL for API
            auth_config: Authentication configuration

        Returns:
            Target creation response

        Raises:
            ClientError: If target creation fails
        """
        try:
            # Build OpenAPI target configuration
            target_config = {
                'openApiTarget': {
                    'toolsSpec': tools_spec
                }
            }

            if api_base_url:
                target_config['openApiTarget']['apiBaseUrl'] = api_base_url

            if auth_config:
                target_config['openApiTarget']['authConfiguration'] = auth_config

            logger.info(
                "Creating OpenAPI target",
                gateway_id=gateway_id,
                tools_count=len(tools_spec)
            )

            response = self.client.create_gateway_target(
                gatewayId=gateway_id,
                clientToken=str(uuid.uuid4()),
                **target_config
            )

            logger.info(
                "OpenAPI target created",
                gateway_id=gateway_id,
                target_id=response.get('target', {}).get('id')
            )

            return response

        except ClientError as e:
            logger.error(
                "Failed to create OpenAPI target",
                gateway_id=gateway_id,
                error=str(e),
                error_code=e.response['Error']['Code']
            )
            raise

    def create_mcp_server_target(
        self,
        gateway_id: str,
        runtime_artifact_arn: str
    ) -> Dict[str, Any]:
        """
        Add MCP server (deployed to AgentCore Runtime) as target.

        Pattern from: samples 05-mcp-server-target/

        Args:
            gateway_id: Gateway ID
            runtime_artifact_arn: ARN of deployed MCP server in Runtime

        Returns:
            Target creation response

        Raises:
            ClientError: If target creation fails
        """
        try:
            target_config = {
                'mcpServerTarget': {
                    'runtimeArtifactArn': runtime_artifact_arn
                }
            }

            logger.info(
                "Creating MCP server target",
                gateway_id=gateway_id,
                runtime_artifact_arn=runtime_artifact_arn
            )

            response = self.client.create_gateway_target(
                gatewayId=gateway_id,
                clientToken=str(uuid.uuid4()),
                **target_config
            )

            logger.info(
                "MCP server target created",
                gateway_id=gateway_id,
                target_id=response.get('target', {}).get('id')
            )

            return response

        except ClientError as e:
            logger.error(
                "Failed to create MCP server target",
                gateway_id=gateway_id,
                error=str(e),
                error_code=e.response['Error']['Code']
            )
            raise

    def create_oauth2_credential_provider(
        self,
        name: str,
        token_endpoint: str,
        client_id: str,
        client_secret: str,
        scopes: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Create OAuth2 credential provider for outbound authentication.

        Pattern from: samples OAuth2 configurations

        Args:
            name: Provider name
            token_endpoint: OAuth2 token endpoint URL
            client_id: OAuth2 client ID
            client_secret: OAuth2 client secret
            scopes: Optional OAuth2 scopes

        Returns:
            Credential provider response

        Raises:
            ClientError: If creation fails
        """
        try:
            provider_config = {
                'clientToken': str(uuid.uuid4()),
                'name': name,
                'oauth2Credential': {
                    'tokenEndpoint': token_endpoint,
                    'clientId': client_id,
                    'clientSecret': client_secret
                }
            }

            if scopes:
                provider_config['oauth2Credential']['scopes'] = scopes

            logger.info(
                "Creating OAuth2 credential provider",
                name=name
            )

            response = self.client.create_oauth2_credential_provider(**provider_config)

            logger.info(
                "OAuth2 credential provider created",
                provider_id=response.get('credentialProvider', {}).get('id')
            )

            return response

        except ClientError as e:
            logger.error(
                "Failed to create OAuth2 credential provider",
                name=name,
                error=str(e),
                error_code=e.response['Error']['Code']
            )
            raise

    def list_gateway_targets(self, gateway_id: str) -> List[Dict[str, Any]]:
        """
        List all targets for a gateway.

        Args:
            gateway_id: Gateway ID

        Returns:
            List of targets

        Raises:
            ClientError: If listing fails
        """
        try:
            logger.info("Listing gateway targets", gateway_id=gateway_id)

            response = self.client.list_gateway_targets(gatewayId=gateway_id)

            targets = response.get('targets', [])
            logger.info(
                "Gateway targets listed",
                gateway_id=gateway_id,
                count=len(targets)
            )

            return targets

        except ClientError as e:
            logger.error(
                "Failed to list gateway targets",
                gateway_id=gateway_id,
                error=str(e),
                error_code=e.response['Error']['Code']
            )
            raise

    def delete_gateway_target(self, gateway_id: str, target_id: str) -> None:
        """
        Delete a gateway target.

        Args:
            gateway_id: Gateway ID
            target_id: Target ID

        Raises:
            ClientError: If deletion fails
        """
        try:
            logger.info(
                "Deleting gateway target",
                gateway_id=gateway_id,
                target_id=target_id
            )

            self.client.delete_gateway_target(
                gatewayId=gateway_id,
                targetId=target_id
            )

            logger.info(
                "Gateway target deleted",
                gateway_id=gateway_id,
                target_id=target_id
            )

        except ClientError as e:
            logger.error(
                "Failed to delete gateway target",
                gateway_id=gateway_id,
                target_id=target_id,
                error=str(e),
                error_code=e.response['Error']['Code']
            )
            raise

    def get_gateway(self, gateway_id: str) -> Dict[str, Any]:
        """
        Get gateway details.

        Args:
            gateway_id: Gateway ID

        Returns:
            Gateway data

        Raises:
            ClientError: If retrieval fails
        """
        try:
            logger.info("Retrieving gateway", gateway_id=gateway_id)

            response = self.client.get_gateway(gatewayId=gateway_id)

            logger.info("Gateway retrieved", gateway_id=gateway_id)
            return response['gateway']

        except ClientError as e:
            logger.error(
                "Failed to get gateway",
                gateway_id=gateway_id,
                error=str(e),
                error_code=e.response['Error']['Code']
            )
            raise

    def list_gateways(self) -> List[Dict[str, Any]]:
        """
        List all gateways.

        Returns:
            List of gateways

        Raises:
            ClientError: If listing fails
        """
        try:
            logger.info("Listing gateways")

            response = self.client.list_gateways()

            gateways = response.get('gateways', [])
            logger.info("Gateways listed", count=len(gateways))

            return gateways

        except ClientError as e:
            logger.error(
                "Failed to list gateways",
                error=str(e),
                error_code=e.response['Error']['Code']
            )
            raise

    def delete_gateway(self, gateway_id: str) -> None:
        """
        Delete a gateway.

        Args:
            gateway_id: Gateway ID

        Raises:
            ClientError: If deletion fails
        """
        try:
            logger.info("Deleting gateway", gateway_id=gateway_id)

            self.client.delete_gateway(gatewayId=gateway_id)

            logger.info("Gateway deleted", gateway_id=gateway_id)

        except ClientError as e:
            logger.error(
                "Failed to delete gateway",
                gateway_id=gateway_id,
                error=str(e),
                error_code=e.response['Error']['Code']
            )
            raise
