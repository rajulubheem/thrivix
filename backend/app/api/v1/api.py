from fastapi import APIRouter

from app.api.v1.endpoints import swarm, swarm_dag, sse, agents, orchestrator, tools, streaming, virtual_files, tool_config, mcp, chat, settings, true_swarm, orchestrator_api, unified_orchestrator_api, admin
from app.api.v1 import tool_approval, dynamic_tools, simple_approval, dynamic_tool_registry, tool_help, tool_debug, file_viewer
from app.api import graph_endpoints, graph_demo

# Import event endpoints separately to handle import errors
try:
    from app.api.v1.endpoints import event_swarm, event_test
    EVENT_ENDPOINTS_AVAILABLE = True
except ImportError as e:
    print(f"Warning: Could not import event endpoints: {e}")
    EVENT_ENDPOINTS_AVAILABLE = False

api_router = APIRouter()
api_router.include_router(swarm.router, prefix="/swarm", tags=["swarm"])

# Include event endpoints if available
if EVENT_ENDPOINTS_AVAILABLE:
    api_router.include_router(event_swarm.router, prefix="/event-swarm", tags=["event-swarm"])
    api_router.include_router(event_test.router, prefix="/event-test", tags=["event-test"])
api_router.include_router(swarm_dag.router, prefix="/swarm-dag", tags=["swarm-dag"])
api_router.include_router(sse.router, prefix="/sse", tags=["sse"])
api_router.include_router(streaming.router, tags=["streaming"])
api_router.include_router(agents.router, prefix="/agents", tags=["agents"])
api_router.include_router(orchestrator.router, prefix="/orchestrator", tags=["orchestrator"])
api_router.include_router(orchestrator_api.router, prefix="/orchestrator-enhanced", tags=["orchestrator-enhanced"])
api_router.include_router(unified_orchestrator_api.router, prefix="/unified", tags=["unified-orchestrator"])
api_router.include_router(tools.router, prefix="/tools", tags=["tools"])
api_router.include_router(tool_config.router, prefix="/tool-config", tags=["tool-config"])
api_router.include_router(dynamic_tools.router, prefix="/dynamic-tools", tags=["dynamic-tools"])
api_router.include_router(tool_approval.router, prefix="/approval", tags=["approval"])
api_router.include_router(simple_approval.router, prefix="/simple-approval", tags=["simple-approval"])
api_router.include_router(virtual_files.router, prefix="/files", tags=["files"])
api_router.include_router(mcp.router, prefix="/mcp", tags=["mcp"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(true_swarm.router, prefix="/true-swarm", tags=["true-swarm"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
api_router.include_router(dynamic_tool_registry.router, prefix="/tool-registry", tags=["tool-registry"])
api_router.include_router(tool_help.router, prefix="/tool-help", tags=["tool-help"])
api_router.include_router(tool_debug.router, prefix="/tool-debug", tags=["tool-debug"])
api_router.include_router(file_viewer.router, prefix="/file-viewer", tags=["file-viewer"])
api_router.include_router(admin.router, tags=["admin"])
api_router.include_router(graph_endpoints.router, tags=["graph"])
api_router.include_router(graph_demo.router, prefix="/graph-demo", tags=["graph-demo"])

# Include simple fast research endpoint
from app.api import research_fast
api_router.include_router(research_fast.router, tags=["fast-research"])

# Keep conversation endpoint for other modes if needed
from app.api import research_conversation
api_router.include_router(research_conversation.router, tags=["research-conversation"])

# Include other research routes (may fail due to import errors)
try:
    # Include Strands-based research with real tools
    from app.api import research_strands_real
    api_router.include_router(research_strands_real.router, tags=["research-strands-real"])
except ImportError:
    pass

try:
    # Include Strands-based research
    from app.api import research_strands
    api_router.include_router(research_strands.router, tags=["research-strands"])
except ImportError:
    pass

try:
    # Include Polling-based research (may fail due to OPENAI_API_KEY)
    from app.api import research_polling_real
    api_router.include_router(research_polling_real.router, tags=["research-polling-real"])
except ImportError:
    pass

try:
    from app.api import research_routes_real
    api_router.include_router(research_routes_real.router, tags=["research"])
except ImportError:
    pass

try:
    # Also include streaming research routes
    from app.api import research_streaming
    api_router.include_router(research_streaming.router, tags=["research-streaming"])
except ImportError:
    pass

try:
    # Include enhanced v2 streaming
    from app.api import research_streaming_v2
    api_router.include_router(research_streaming_v2.router, tags=["research-streaming-v2"])
except ImportError:
    pass

try:
    # Include real-time streaming
    from app.api import research_streaming_realtime
    api_router.include_router(research_streaming_realtime.router, tags=["research-streaming-realtime"])
except ImportError:
    pass

try:
    # Include enhanced polling with better prompts
    from app.api import research_polling_enhanced
    api_router.include_router(research_polling_enhanced.router, tags=["research-polling-enhanced"])
except ImportError:
    pass

try:
    # Include REAL AI research (authentic reasoning)
    from app.api import research_real_ai
    api_router.include_router(research_real_ai.router, tags=["research-real-ai"])
except ImportError:
    pass

try:
    # Include Clean research with citations
    from app.api import research_clean
    api_router.include_router(research_clean.router, tags=["research-clean"])
except ImportError:
    pass