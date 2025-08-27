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

## 🤖 The Power of Swarm Intelligence

### What Makes Our Swarm Special?

Thrivix leverages **Strands SDK's multi-agent orchestration** to create truly collaborative AI teams. This isn't just multiple chatbots - it's a coordinated team of specialists that:

1. **Understand Context**: Each agent sees what others have done
2. **Hand Off Tasks**: Agents automatically delegate to specialists
3. **Share Knowledge**: Common memory across the swarm
4. **Work in Parallel**: Multiple agents can work simultaneously

### Our Specialized Agents

#### 🔍 **Research Agent**
```python
"Your role is to:
- Gather information from various sources
- Analyze requirements and context
- Use web search tools to find current information
- Share findings with the team"
```
**Tools**: Web search, Document analysis
**Handoff**: → Architect (when research complete)

#### 🏗️ **Architect Agent**
```python
"Your role is to:
- Design system architecture
- Create technical specifications
- Define interfaces and data models
- Plan implementation approach"
```
**Tools**: Diagramming, Schema design
**Handoff**: → Coder (when design ready)

#### 💻 **Coder Agent**
```python
"Your role is to:
- Implement solutions based on designs
- Write clean, efficient code
- Create necessary files and modules
- Follow best practices"
```
**Tools**: Code interpreter, File operations
**Handoff**: → Reviewer (when code complete)

#### ✅ **Reviewer Agent**
```python
"Your role is to:
- Review code for quality
- Suggest improvements
- Verify requirements are met
- Ensure best practices"
```
**Tools**: Code analysis, Testing tools
**Handoff**: → Analyst (for metrics) or Complete

#### 📊 **Analyst Agent**
```python
"Your role is to:
- Analyze data and patterns
- Create visualizations
- Perform statistical analysis
- Extract insights"
```
**Tools**: Data analysis, Visualization
**Handoff**: → Any agent needing analysis

### Real Example: "Build a Todo App"

When you ask the swarm to "Build a todo app", here's what happens:

1. **Research Agent** investigates best practices, UI patterns, frameworks
2. **Architect Agent** designs the component structure, data flow
3. **Coder Agent** implements the HTML/CSS/JavaScript
4. **Reviewer Agent** checks code quality, suggests improvements
5. **You receive**: Complete, working code with explanations

All of this happens with full visibility - you see each agent's work, decisions, and handoffs in real-time!

## 🎭 Orchestrator - Visual Workflow Builder

The Orchestrator (`/orchestrator`) lets you:
- **Define Complex Workflows**: Create multi-step processes with conditional logic
- **Visual DAG Execution**: See your workflow as a directed graph
- **Agent Coordination**: Assign different agents to different steps
- **Approval Gates**: Add human checkpoints in automated workflows

Example workflows:
- "Research → Analyze → Report → Review → Publish"
- "Code → Test → Deploy → Monitor"
- "Data Collection → Processing → ML Training → Evaluation"

## 🖥️ See It In Action

### Main Interfaces Available Now:

**1. Conversation Mode** (`/conversation`)
- Chat with AI using Fast, Deep, or Scholar modes
- Real-time thought streaming
- Source citations and screenshots
- Session persistence

**2. Swarm Chat** (`/swarm`)
- **Live Agent Collaboration**: Watch multiple agents work together
- **Visual Handoffs**: See when agents pass tasks to specialists
- **Tool Execution Monitoring**: Track what tools agents use
- **Shared Context**: All agents see the full conversation
- **Session Artifacts**: Download generated files and reports

**3. Orchestrator** (`/orchestrator`)
- **Workflow Designer**: Create complex multi-step processes
- **Visual Execution**: Watch your workflow run step-by-step
- **Agent Assignment**: Choose which agent handles each step
- **Conditional Logic**: Add decision points and branches

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

## 💡 How Strands Powers Thrivix

Thrivix leverages [Strands SDK 1.0](https://aws.amazon.com/blogs/opensource/introducing-strands-agents-1-0-production-ready-multi-agent-orchestration-made-simple/)'s production-ready features:

### Multi-Agent Primitives We Use:
- **Swarms**: Self-organizing teams with shared memory
- **Handoffs**: Automatic task delegation between specialists  
- **Graphs**: Explicit workflows with conditional routing
- **Tools as Agents**: Agents can spawn sub-agents dynamically

### The Strands Advantage:
```python
# Simple swarm creation with Strands
from strands.multiagent import Swarm

swarm = Swarm(
    agents=[researcher, architect, coder, reviewer],
    shared_memory=True,
    auto_handoff=True
)

result = await swarm.execute("Build a todo app")
# Agents automatically coordinate and hand off tasks!
```

## 🛠️ Technical Stack

### What We Actually Use:
- **Backend**: FastAPI + Strands SDK
- **Frontend**: React + TypeScript + Radix UI
- **AI Models**: OpenAI GPT-4, Claude (via API)
- **Search**: Tavily API
- **Streaming**: Server-Sent Events (SSE)
- **Sessions**: File-based persistence

## 📝 API Endpoints

```bash
# Start conversation
POST /api/v1/conversation/start
{
  "message": "Your question",
  "mode": "deep"  # or "fast", "scholar"
}

# Execute swarm task
POST /api/v1/swarm/execute
{
  "task": "Build a REST API for user management",
  "agents": ["researcher", "architect", "coder", "reviewer"]
}

# Create orchestrated workflow
POST /api/v1/orchestrator/create
{
  "workflow": "research_and_report",
  "steps": ["research", "analyze", "write", "review"]
}
```

## 🐛 Known Limitations

- Deep research can take 10-30 seconds
- Web search requires Tavily API key
- Some features require OpenAI GPT-4 access
- Session storage is file-based (not distributed)

## 🤝 Contributing

We welcome contributions! Areas we need help:

1. **New Agent Types** - Create specialized agents (Designer, QA, DevOps)
2. **Tool Development** - Add more agent capabilities
3. **UI Improvements** - Better visualization of agent collaboration
4. **Performance** - Optimize agent coordination
5. **Documentation** - More examples and tutorials

## 📄 License

Apache License 2.0 - See [LICENSE](LICENSE) file

## 🙏 Credits

- Built with [Strands SDK](https://github.com/strands-agents/sdk-python) - Production-ready multi-agent orchestration
- Strands is trusted by AWS teams including Amazon Q Developer
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
  <sub>Experience the Power of Multi-Agent AI | Built with Strands SDK</sub>
</div>