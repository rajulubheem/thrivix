"""
Gateway API Endpoints

RESTful API for managing AgentCore Gateways and tools.
"""
from fastapi import APIRouter, HTTPException, status
from typing import List, Dict, Any
import structlog

from app.agentcore.schemas import GatewayCreate, GatewayResponse
from app.agentcore.services import GatewayService

logger = structlog.get_logger()
router = APIRouter(prefix="/gateways", tags=["Gateways"])


@router.post("", response_model=GatewayResponse, status_code=status.HTTP_201_CREATED)
async def create_gateway(gateway: GatewayCreate):
    """
    Create a new gateway for tools.

    Features:
    - JWT authorization
    - Semantic search for tool discovery
    - Multiple target types (Lambda, OpenAPI, MCP)
    """
    try:
        gateway_service = GatewayService()
        return gateway_service.create_gateway(gateway)
    except Exception as e:
        logger.error("Failed to create gateway", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create gateway: {str(e)}"
        )


@router.get("", response_model=List[Dict[str, Any]])
async def list_gateways():
    """List all gateways."""
    try:
        gateway_service = GatewayService()
        return gateway_service.list_gateways()
    except Exception as e:
        logger.error("Failed to list gateways", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list gateways: {str(e)}"
        )


@router.get("/{gateway_id}")
async def get_gateway(gateway_id: str):
    """Get gateway details."""
    try:
        gateway_service = GatewayService()
        return gateway_service.get_gateway(gateway_id)
    except Exception as e:
        logger.error("Failed to get gateway", gateway_id=gateway_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get gateway: {str(e)}"
        )


@router.post("/{gateway_id}/targets/lambda")
async def add_lambda_target(
    gateway_id: str,
    function_arn: str,
    tool_name: str,
    tool_description: str,
    input_schema: Dict[str, Any]
):
    """Add a Lambda function as a gateway target."""
    try:
        gateway_service = GatewayService()
        return gateway_service.create_lambda_target(
            gateway_id=gateway_id,
            function_arn=function_arn,
            tool_name=tool_name,
            tool_description=tool_description,
            input_schema=input_schema
        )
    except Exception as e:
        logger.error("Failed to add Lambda target", gateway_id=gateway_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add Lambda target: {str(e)}"
        )


@router.post("/{gateway_id}/targets/openapi")
async def add_openapi_target(
    gateway_id: str,
    tools_spec: List[Dict[str, Any]]
):
    """Add OpenAPI specification as a gateway target."""
    try:
        gateway_service = GatewayService()
        return gateway_service.create_openapi_target(
            gateway_id=gateway_id,
            tools_spec=tools_spec
        )
    except Exception as e:
        logger.error("Failed to add OpenAPI target", gateway_id=gateway_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add OpenAPI target: {str(e)}"
        )


@router.get("/{gateway_id}/targets")
async def list_gateway_targets(gateway_id: str):
    """List all targets for a gateway."""
    try:
        gateway_service = GatewayService()
        return gateway_service.list_gateway_targets(gateway_id)
    except Exception as e:
        logger.error("Failed to list targets", gateway_id=gateway_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list targets: {str(e)}"
        )


@router.delete("/{gateway_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_gateway(gateway_id: str):
    """Delete a gateway."""
    try:
        gateway_service = GatewayService()
        gateway_service.delete_gateway(gateway_id)
    except Exception as e:
        logger.error("Failed to delete gateway", gateway_id=gateway_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete gateway: {str(e)}"
        )
