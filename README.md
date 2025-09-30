# Thrivix - Multi-Agent Workflow Platform

<div align="center">

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/rajulubheem/thrivix)
[![Python](https://img.shields.io/badge/Python-3.11+-green.svg)](https://www.python.org/)
[![React](https://img.shields.io/badge/React-19.1.1-blue.svg)](https://reactjs.org/)
[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](LICENSE)

**A platform for building and visualizing agent-based workflows using natural language**

[Watch Demo](https://youtu.be/WDMEXh4r6-Q) • [GitHub](https://github.com/rajulubheem/thrivix)

</div>

---

## 🎬 Demo Videos

<div align="center">

<table>
<tr>
<td width="33%" align="center">
  <b>Flow Pro</b><br/>
  <a href="https://youtu.be/WDMEXh4r6-Q">
    <img src="https://img.youtube.com/vi/WDMEXh4r6-Q/0.jpg" alt="Flow Pro Demo" width="250"/>
  </a>
  <br/>State machine generation from text
</td>
<td width="33%" align="center">
  <b>Research Mode</b><br/>
  <a href="https://youtu.be/SHlG25Bw-w8">
    <img src="https://img.youtube.com/vi/SHlG25Bw-w8/0.jpg" alt="Research Demo" width="250"/>
  </a>
  <br/>Web search and analysis
</td>
<td width="33%" align="center">
  <b>Sequential Agents</b><br/>
  <a href="https://youtu.be/bzpWFTz18do">
    <img src="https://img.youtube.com/vi/bzpWFTz18do/0.jpg" alt="Swarm Demo" width="250"/>
  </a>
  <br/>Agent collaboration workflow
</td>
</tr>
</table>

</div>

## 🚀 Quick Start

### Option 1: Automated Setup (Recommended)

```bash
# Clone repository
git clone https://github.com/rajulubheem/thrivix.git
cd thrivix

# Install Redis (required for streaming workflows)
# macOS:
brew install redis
brew services start redis

# Linux (Ubuntu/Debian):
# sudo apt-get install redis-server
# sudo systemctl start redis

# Run setup script
./setup.sh

# Configure API keys
# Edit backend/.env and add your API keys:
# - OPENAI_API_KEY=your_key_here
# - TAVILY_API_KEY=your_key_here

# Start backend (Terminal 1)
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Start frontend (Terminal 2)
cd frontend
npm start
```

### Option 2: Manual Setup

```bash
# Install Redis first (required)
# macOS:
brew install redis && brew services start redis

# Linux (Ubuntu/Debian):
# sudo apt-get install redis-server && sudo systemctl start redis

# Backend setup (Python 3.11+ required)
cd backend
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.template .env
# Edit .env and add your OpenAI and Tavily API keys

# Start backend
uvicorn app.main:app --reload --port 8000

# Frontend setup (new terminal)
cd frontend
npm install
npm start
```

Open http://localhost:3000 to use the application.

## ✨ What It Does

Thrivix is a platform that helps you create and execute workflows using multiple AI agents. You describe what you want in plain language, and the system:

1. **Generates a workflow** - Creates a state machine with steps to accomplish your task
2. **Executes with agents** - Different agents handle different parts of the workflow
3. **Visualizes progress** - Shows the workflow execution in real-time
4. **Provides results** - Delivers the analysis, code, or documentation you requested

## 🛠️ Main Features

### Flow Pro (`/flow-pro`)
- Enter a task description (e.g., "Design a payment system architecture")
- System generates a state machine with research, planning, and execution phases
- Agents execute each state with appropriate tools (web search, analysis)
- Visual diagram shows progress through the workflow

### Research Assistant (`/conversation`)
- Three modes: Fast (quick answers), Deep (web research), Scholar (citations)
- Real-time streaming responses
- Web search using Tavily API
- Session history preserved

### Agent Swarm (`/swarm`)
- Multiple agents work on different aspects of a task
- Sequential handoffs between specialized agents
- Each agent has specific expertise (research, coding, review)
- Visual tracking of agent activity

### Additional Routes
- `/settings` - Basic configuration page (experimental)
- `/orchestrator` - Alternative orchestrator interface
- Various experimental swarm interfaces

## 🏗️ Technical Stack

### Backend
- **FastAPI** - Web framework
- **Strands Agents SDK** - Agent orchestration
- **OpenAI GPT-4** - Language model
- **Tavily API** - Web search
- **WebSocket/SSE** - Real-time updates
- **Redis** - Event pub/sub and streaming coordination (required)
- **SQLite** - Session storage

### Frontend
- **React 19** with TypeScript
- **React Flow** - Workflow visualization
- **Tailwind CSS** - Styling
- **Radix UI** - UI components

## 🔧 Configuration

### Required API Keys

Edit `backend/.env`:

```env
# Required
OPENAI_API_KEY=your_openai_key_here
TAVILY_API_KEY=your_tavily_key_here

# Optional
ANTHROPIC_API_KEY=your_anthropic_key_here
REDIS_URL=redis://localhost:6379/0
```

### Environment Requirements

- **Python 3.11 or higher**
- **Node.js 18 or higher**
- **Redis** (required for streaming workflows)
- 8GB RAM recommended
- 2GB disk space

## 📝 How It Works

### Example: "Create a REST API for user management"

1. **Input** - You type your request in the UI
2. **Planning** - GPT-4 generates a workflow with states like:
   - Research best practices
   - Design API endpoints
   - Create database schema
   - Implement authentication
   - Add validation
   - Write documentation
3. **Execution** - Agents work through each state:
   - Research agent searches for current best practices
   - Architect agent designs the system
   - Coder agent provides implementation
   - Reviewer agent checks the work
4. **Output** - You receive complete API specification, code samples, and documentation

## 🐛 Known Limitations

- Requires API keys (OpenAI, Tavily)
- Web search limited by Tavily API quota
- Large workflows may take 30-60 seconds
- Some experimental features may have bugs
- Session storage is local (not distributed)

## 🚦 Production Deployment

### Using Docker

```bash
docker-compose up -d
```

### Manual Deployment

1. Use production requirements: `pip install -r requirements-prod.txt`
2. Set environment to production: `export ENVIRONMENT=production`
3. Use proper database: PostgreSQL recommended
4. Enable Redis for better performance
5. Configure nginx for reverse proxy

## 🚧 Roadmap

### In Development
- **AWS Bedrock Integration** - Support for Claude and other Bedrock models
- **AgentCore Support** - Integration with AgentCore framework
- More agent specializations
- Improved error handling

## 🤝 Contributing

Contributions welcome! Areas to improve:

- Bug fixes and stability improvements
- Documentation and examples
- New agent types
- UI/UX enhancements
- Performance optimization
- Help with Bedrock/AgentCore integration

## 📄 License

Apache License 2.0 - See [LICENSE](LICENSE)

## 🙏 Credits

Built with:
- [Strands Agents SDK](https://github.com/strands-agents/sdk-python)
- [OpenAI API](https://openai.com)
- [Tavily Search](https://tavily.com)
- [React Flow](https://reactflow.dev)

---

<div align="center">
  <strong>Questions?</strong> Open an issue on <a href="https://github.com/rajulubheem/thrivix/issues">GitHub</a>
</div>