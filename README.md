# Thrivix - Multi-Agent AI Research Platform

<div align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" />
  <img src="https://img.shields.io/badge/license-Apache%202.0-green.svg" />
  <img src="https://img.shields.io/badge/Built%20with-Strands%20SDK-purple.svg" />
</div>

## What is Thrivix?

Thrivix is a powerful AI platform that lets you have intelligent conversations with multiple AI agents working together. Built using [Strands SDK](https://github.com/strands-agents/sdk-python), it provides real-time research capabilities, multi-agent collaboration, and a beautiful interface for complex AI interactions.

## 🎯 What Can Thrivix Actually Do?

### 1. **Multi-Mode AI Conversations**
- **Fast Mode**: Quick responses for simple questions
- **Deep Research**: Comprehensive analysis with web search, multiple sources, and progressive thinking
- **Scholar Mode**: Academic-style research with citations

### 2. **Real Features That Work Today**
- ✅ **Live Streaming Responses**: See AI thoughts and research progress in real-time
- ✅ **Web Search Integration**: Searches the internet for current information (Tavily API)
- ✅ **Session History**: Continue conversations where you left off
- ✅ **Multi-Agent Swarm**: Multiple AI agents collaborate on complex tasks
- ✅ **Tool Approval System**: Control which tools AI can use (file access, web search, etc.)
- ✅ **Visual Orchestrator**: See how agents hand off tasks to each other
- ✅ **Human-in-the-Loop**: AI asks for clarification when needed

### 3. **Actual Use Cases**
- Research any topic with real-time web data
- Analyze and compare multiple perspectives
- Generate comprehensive reports with sources
- Code analysis and development assistance
- Market research and competitive analysis
- Academic research with proper citations

## 🖥️ See It In Action

### Main Interfaces Available Now:

**1. Conversation Mode** (`/conversation`)
- Chat with AI using Fast, Deep, or Scholar modes
- Real-time thought streaming
- Source citations and screenshots
- Session persistence

**2. Swarm Chat** (`/swarm`)
- Multiple specialized agents working together
- Visual agent handoffs
- Tool execution monitoring
- Session artifacts

**3. Orchestrator** (`/orchestrator`)
- Define complex multi-step workflows
- Visual task execution
- Agent coordination

**4. Settings** (`/settings`)
- Configure available tools
- Set approval requirements
- Manage API keys

## 🚀 Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- OpenAI API key (required)
- Tavily API key (for web search)

### Installation

```bash
# Clone repository
git clone https://github.com/rajulubheem/thrivix.git
cd thrivix

# Backend setup
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create .env file
cp .env.template .env
# Edit .env and add your API keys:
# OPENAI_API_KEY=your_key_here
# TAVILY_API_KEY=your_key_here

# Start backend
python main.py

# Frontend setup (new terminal)
cd frontend
npm install
npm start
```

Open http://localhost:3000 and start using Thrivix!

## 💡 How It Works

Thrivix uses **Strands SDK** to orchestrate AI agents. Here's the actual flow:

1. **You ask a question** → Choose mode (Fast/Deep/Scholar)
2. **Strands creates agents** → Based on the task complexity
3. **Agents use tools** → Web search, analysis, synthesis
4. **Real-time updates** → See thinking process and results
5. **Get comprehensive answer** → With sources and citations

## 🛠️ Technical Stack

### What We Actually Use:
- **Backend**: FastAPI + Strands SDK
- **Frontend**: React + TypeScript + Radix UI
- **AI Models**: OpenAI GPT-4, Claude (via API)
- **Search**: Tavily API
- **Streaming**: Server-Sent Events (SSE)
- **Sessions**: File-based persistence

## 📂 Project Structure

```
thrivix/
├── frontend/
│   ├── src/
│   │   ├── pages/           # Main app pages
│   │   ├── components/      # UI components
│   │   └── hooks/          # Custom React hooks
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── agents/         # AI agent definitions
│   │   ├── api/           # API endpoints
│   │   ├── services/      # Business logic
│   │   └── tools/         # Agent tools (search, etc.)
│   ├── main.py            # FastAPI server
│   └── requirements.txt
└── README.md
```

## 🔑 Key Features Explained

### Deep Research Mode
When you select "Deep Research", Thrivix:
1. Searches multiple sources
2. Analyzes findings
3. Cross-references information
4. Provides citations
5. Shows thinking process

### Swarm Intelligence
Multiple agents with different expertise:
- Research Agent: Gathers information
- Analysis Agent: Processes data
- Synthesis Agent: Creates comprehensive response

### Tool Approval
Control what AI can do:
- Web search: Auto-approved
- File operations: Requires approval
- System commands: Requires approval

## 📝 API Endpoints

```bash
# Start conversation
POST /api/v1/conversation/start
{
  "message": "Your question",
  "mode": "deep"  # or "fast", "scholar"
}

# Continue conversation
POST /api/v1/conversation/continue
{
  "session_id": "xxx",
  "message": "Follow-up question"
}

# Swarm execution
POST /api/v1/swarm/chat
{
  "message": "Complex task",
  "session_id": "xxx"
}
```

## 🐛 Known Limitations

- Deep research can take 10-30 seconds
- Web search requires Tavily API key
- Some features require OpenAI GPT-4 access
- Session storage is file-based (not distributed)

## 🤝 Contributing

We welcome contributions! Areas we need help:

1. **UI/UX improvements** - Make it more beautiful
2. **New agent tools** - Add more capabilities
3. **Performance optimization** - Make it faster
4. **Bug fixes** - Help us squash bugs
5. **Documentation** - Improve guides and examples

## 📄 License

Apache License 2.0 - See [LICENSE](LICENSE) file

## 🙏 Credits

- Built with [Strands SDK](https://github.com/strands-agents/sdk-python) - The powerful agent framework
- UI components from [Radix UI](https://www.radix-ui.com/)
- Web search by [Tavily](https://tavily.com/)
- AI models by OpenAI and Anthropic

## 💬 Support

- **Issues**: [GitHub Issues](https://github.com/rajulubheem/thrivix/issues)
- **Discussions**: [GitHub Discussions](https://github.com/rajulubheem/thrivix/discussions)

---

<div align="center">
  <strong>Thrivix - Where AI Agents Collaborate</strong>
  <br>
  <sub>Built with Strands SDK | Real Features | No Hype</sub>
</div>