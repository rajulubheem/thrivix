# Thrivix Source Code Map

This document maps out the actively used source code in the Thrivix project, excluding test files and unused code.

## Backend Structure (`/backend`)

### Core Application Files
- `main.py` - Entry point for the backend server
- `app/main.py` - FastAPI application initialization
- `app/config.py` - Settings and configuration management

### API Endpoints (Active Routes)
Main API routes are under `app/api/v1/`:
- `app/api/v1/endpoints/chat.py` - Chat functionality endpoints
- `app/api/v1/endpoints/swarm.py` - Swarm agent orchestration
- `app/api/v1/endpoints/orchestrator.py` - Orchestrator workflow management
- `app/api/v1/endpoints/streaming.py` - Real-time streaming endpoints
- `app/api/v1/endpoints/settings.py` - Application settings management
- `app/api/v1/endpoints/tools.py` - Tool management and configuration

### Research & Conversation Features
- `app/api/research_strands_real.py` - Main research implementation
- `app/api/research_streaming_realtime.py` - Streaming research functionality
- `app/api/research_conversation.py` - Conversation mode implementation

### Core Services
- `app/services/enhanced_swarm_service.py` - Enhanced swarm agent coordination
- `app/services/true_swarm_service.py` - True swarm implementation
- `app/services/chat_service.py` - Chat service logic
- `app/services/tool_registry.py` - Tool registration and management
- `app/services/session_persistence.py` - Session management

### Agent Implementations
- `app/agents/deep_research_agent.py` - Deep research agent
- `app/agents/nova_research_agent.py` - Nova research capabilities
- `app/agents/planning_agent.py` - Planning and task decomposition

### Tool Implementations
- `app/tools/tavily_search_tool.py` - Web search via Tavily
- `app/tools/file_tools.py` - File operations
- `app/tools/browser_tool.py` - Browser automation
- `app/tools/python_repl_tool.py` - Python code execution

### Database & Models
- `app/models/database.py` - Database models
- `app/schemas/chat.py` - Chat data schemas
- `app/schemas/swarm.py` - Swarm data schemas

### Configuration Files
- `.env` - Environment variables (create from .env.template)
- `requirements.txt` - Python dependencies
- `app_settings.json` - Application settings
- `tool_config.json` - Tool configuration

## Frontend Structure (`/frontend`)

### Main Application
- `src/index.tsx` - React app entry point
- `src/App.tsx` - Main app component with routing

### Pages (Active Routes)
- `src/pages/HomePage.tsx` - Landing page
- `src/pages/ModernConversation.tsx` - Conversation interface
- `src/pages/EnhancedSwarmChat.tsx` - Swarm chat interface
- `src/pages/UnifiedOrchestratorV3.tsx` - Orchestrator interface
- `src/pages/SettingsPage.tsx` - Settings management
- `src/pages/ToolSettingsV2.tsx` - Tool configuration

### Core Components
- `src/components/research/ConversationResearch.tsx` - Research UI
- `src/components/research/StreamingResearch.tsx` - Streaming research display
- `src/components/SwarmSessionSidebar.tsx` - Session management sidebar
- `src/components/AgentPanel.tsx` - Agent display panel
- `src/components/OrchestratorPanel.tsx` - Orchestrator controls
- `src/components/ToolApprovalPanel.tsx` - Tool approval UI
- `src/components/FileViewer.tsx` - File viewing component

### Services & API Integration
- `src/services/api.ts` - Main API client
- `src/services/chatApi.ts` - Chat API integration
- `src/services/researchApi.ts` - Research API integration
- `src/services/toolRegistry.ts` - Tool registry client

### Hooks (Custom React Hooks)
- `src/hooks/useStreamingResearch.ts` - Streaming research hook
- `src/hooks/useSwarmExecution.ts` - Swarm execution management
- `src/hooks/useChatSessions.ts` - Session management
- `src/hooks/useSSE.ts` - Server-sent events handling

### UI Components (Radix UI)
- `src/components/ui/` - Reusable UI components based on Radix UI

### Types & Interfaces
- `src/types/swarm.ts` - Swarm-related types
- `src/types/artifacts.ts` - Artifact types
- `src/types/strands.ts` - Strands SDK types

### Styling
- `src/styles/global.css` - Global styles
- `src/styles/themes.css` - Theme definitions
- Various component-specific CSS files

### Configuration
- `package.json` - Node dependencies
- `tsconfig.json` - TypeScript configuration
- `tailwind.config.js` - Tailwind CSS configuration

## Unused/Legacy Code (Not Part of Active Application)

The following directories contain experimental or legacy code not actively used:
- `backend/app/api/` - Various experimental API endpoints (research_*.py files not listed above)
- `backend/app/services/` - Various experimental services (many *_swarm_service.py variants)
- `backend/app/tools/` - Many experimental tools not in active use
- `frontend/src/_backup/` - Backup components
- Session data in `backend/sessions/` - User session storage

## How to Run

1. **Backend**: 
   ```bash
   cd backend
   source .venv/bin/activate  # or use uv
   python main.py
   ```

2. **Frontend**:
   ```bash
   cd frontend
   npm start
   ```

## Active API Routes

The application exposes these main routes:
- `/api/v1/conversation/*` - Conversation mode
- `/api/v1/swarm/*` - Swarm agent execution
- `/api/v1/orchestrator/*` - Orchestrator workflows
- `/api/v1/chat/*` - Chat functionality
- `/api/v1/settings/*` - Settings management
- `/api/v1/tools/*` - Tool management

## Key Features in Use

1. **Conversation Mode** - AI-powered conversations with web search
2. **Swarm Mode** - Multi-agent collaboration
3. **Orchestrator** - Visual workflow builder
4. **Tool Management** - Configure and approve AI tools
5. **Session Persistence** - Continue conversations across sessions

## Notes

- The project uses Strands SDK concepts but doesn't directly import the SDK
- Many files are experimental implementations of similar functionality
- The active codebase is much smaller than the total file count suggests
- Focus on the files listed in this map for understanding the working application