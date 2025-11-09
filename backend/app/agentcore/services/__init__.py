"""AgentCore Services"""

from app.agentcore.services.memory_service import MemoryService
from app.agentcore.services.gateway_service import GatewayService
from app.agentcore.services.agent_session_manager import AgentSessionManager, get_agent_session_manager
from app.agentcore.services.agent_manager_v2 import AgentManagerV2, get_agent_manager_v2

# For backwards compatibility, export v2 as default
get_agent_manager = get_agent_manager_v2

__all__ = [
    "MemoryService",
    "GatewayService",
    "AgentSessionManager",
    "get_agent_session_manager",
    "AgentManagerV2",
    "get_agent_manager_v2",
    "get_agent_manager",
]
