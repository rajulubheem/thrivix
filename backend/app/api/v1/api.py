from fastapi import APIRouter

from app.api.v1.endpoints import swarm, swarm_dag, sse, agents, orchestrator, tools, streaming, virtual_files, tool_config, mcp, chat, settings, tool_test, true_swarm, orchestrator_api, unified_orchestrator_api, admin
from app.api.v1 import tool_approval, test_tools, dynamic_tools, simple_approval, dynamic_tool_registry, tool_help, tool_debug, file_viewer
from app.api import graph_endpoints, graph_demo

api_router = APIRouter()
api_router.include_router(swarm.router, prefix="/swarm", tags=["swarm"])
api_router.include_router(swarm_dag.router, prefix="/swarm-dag", tags=["swarm-dag"])
api_router.include_router(sse.router, prefix="/sse", tags=["sse"])
api_router.include_router(streaming.router, tags=["streaming"])
api_router.include_router(agents.router, prefix="/agents", tags=["agents"])
api_router.include_router(orchestrator.router, prefix="/orchestrator", tags=["orchestrator"])
api_router.include_router(orchestrator_api.router, prefix="/orchestrator-enhanced", tags=["orchestrator-enhanced"])
api_router.include_router(unified_orchestrator_api.router, prefix="/unified", tags=["unified-orchestrator"])
api_router.include_router(tools.router, prefix="/tools", tags=["tools"])
api_router.include_router(tool_test.router, prefix="/tools", tags=["tool-test"])
api_router.include_router(tool_config.router, prefix="/tool-config", tags=["tool-config"])
api_router.include_router(dynamic_tools.router, prefix="/dynamic-tools", tags=["dynamic-tools"])
api_router.include_router(test_tools.router, prefix="/test-tools", tags=["test-tools"])
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

# Include research routes (real version with Strands agents)
try:
    # Include Strands-based research with real tools
    from app.api import research_strands_real
    api_router.include_router(research_strands_real.router, tags=["research-strands-real"])
    # Include Strands-based research
    from app.api import research_strands
    api_router.include_router(research_strands.router, tags=["research-strands"])
    # Include REAL research with LLM integration
    from app.api import research_real
    api_router.include_router(research_real.router, tags=["research-real"])
    # Include Polling-based research (NEW)
    from app.api import research_polling_real
    api_router.include_router(research_polling_real.router, tags=["research-polling-real"])
    from app.api import research_routes_real
    api_router.include_router(research_routes_real.router, tags=["research"])
    # Also include streaming research routes
    from app.api import research_streaming
    api_router.include_router(research_streaming.router, tags=["research-streaming"])
    # Include enhanced v2 streaming
    from app.api import research_streaming_v2
    api_router.include_router(research_streaming_v2.router, tags=["research-streaming-v2"])
    # Include real-time streaming
    from app.api import research_streaming_realtime
    api_router.include_router(research_streaming_realtime.router, tags=["research-streaming-realtime"])
    # Include polling-based research (like SwarmChat)
    from app.api import research_polling
    api_router.include_router(research_polling.router, tags=["research-polling"])
    # Include enhanced polling with better prompts
    from app.api import research_polling_enhanced
    api_router.include_router(research_polling_enhanced.router, tags=["research-polling-enhanced"])
    # Include REAL AI research (authentic reasoning)
    from app.api import research_real_ai
    api_router.include_router(research_real_ai.router, tags=["research-real-ai"])
    # Include Clean research with citations
    from app.api import research_clean
    api_router.include_router(research_clean.router, tags=["research-clean"])
    # Include Conversation-based research with session management
    from app.api import research_conversation
    api_router.include_router(research_conversation.router, tags=["research-conversation"])
except ImportError:
    try:
        from app.api import research_routes_simple
        api_router.include_router(research_routes_simple.router, tags=["research"])
    except ImportError:
        try:
            from app.api import research_routes
            api_router.include_router(research_routes.router, tags=["research"])
        except ImportError:
            pass  # Research routes not available