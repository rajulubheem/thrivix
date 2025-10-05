# Thrivix

<div align="center">

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/rajulubheem/thrivix)
[![Python](https://img.shields.io/badge/Python-3.11+-green.svg)](https://www.python.org/)
[![React](https://img.shields.io/badge/React-19.1.1-blue.svg)](https://reactjs.org/)
[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](LICENSE)

### **Visual AI Workflow Builder**

Transform complex tasks into intelligent workflows. Watch AI agents collaborate in real-time.

[Watch Demo](https://youtu.be/WDMEXh4r6-Q) • [GitHub](https://github.com/rajulubheem/thrivix)

</div>

---

## 💡 What is Thrivix?

Thrivix is a **visual AI orchestration platform** that turns your natural language descriptions into executable multi-agent workflows. Instead of managing prompts and context windows, you design workflows where specialized AI agents handle different tasks—research, coding, analysis, decision-making—and collaborate to deliver complete solutions.

### The Problem We Solve

Working with AI tools today means:
- ⚠️ Managing long conversation threads that lose context
- ⚠️ Repeatedly copying outputs between different AI tools
- ⚠️ Manually coordinating research, coding, and validation steps
- ⚠️ No visibility into what the AI is actually doing
- ⚠️ Starting over when something breaks mid-task

### How Thrivix Helps

✅ **See Your Workflow** - Visual diagrams show exactly how agents collaborate
✅ **Reusable Pipelines** - Save workflows and run them with different inputs
✅ **Real-Time Transparency** - Watch agents work, see which tools they're using
✅ **Resume Anywhere** - Execution failed? Resume from any step
✅ **Specialized Agents** - Each agent has specific tools and expertise
✅ **No Code Required** - Describe what you want, Thrivix builds the workflow

---

## 🎯 Core Features

### 1. **Flow Pro** - AI-Generated Workflows
```
You: "Design a payment processing system with security analysis"

Thrivix:
├── 🔍 Research Agent → Analyzes payment standards (PCI-DSS, OAuth)
├── 🏗️  Architect Agent → Designs system with security layers
├── 💻 Code Agent → Generates implementation examples
├── 🔐 Security Agent → Reviews for vulnerabilities
└── 📝 Documentation Agent → Creates API docs and guides
```

**What makes it unique:**
- Automatically generates state machines from task descriptions
- Each agent gets context from previous steps
- Visual execution tracking with real-time updates
- Rerun from any failed step without starting over

### 2. **Visual Workflow Builder** - Drag & Drop Interface

Build custom workflows with:
- **100+ integrated tools** (web search, code execution, file operations, API calls)
- **Tool blocks** - Individual operations you can chain together
- **Agent blocks** - AI-powered decision makers with specific expertise
- **Parallel execution** - Run multiple agents simultaneously
- **Conditional routing** - Different paths based on results

**Example Use Case:** Competitive Analysis Pipeline
```
Start → Web Search → Data Extraction → Python Analysis → Chart Generation → Report Writing → End
```

### 3. **Research Assistant** - Three Intelligence Modes

- **Fast Mode** - Quick answers from GPT-4 (< 5 seconds)
- **Deep Mode** - Web research + synthesis (10-30 seconds)
- **Scholar Mode** - Academic rigor with citations (30-60 seconds)

All with streaming responses and conversation memory.

### 4. **Agent Swarm** - Specialized Collaboration

Watch multiple agents tackle different aspects of your task:
- Research agents gather information
- Coding agents write and test code
- Review agents check quality
- Documentation agents explain everything

Real-time visualization shows who's working and what they're producing.

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

---

## 🚀 Quick Start

### Prerequisites
- **Python 3.11+**
- **Node.js 18+**
- **Redis** (required for streaming)

### Automated Setup (Recommended)

```bash
# Clone repository
git clone https://github.com/rajulubheem/thrivix.git
cd thrivix

# Install Redis (required for streaming workflows)
# macOS:
brew install redis && brew services start redis

# Linux (Ubuntu/Debian):
# sudo apt-get install redis-server && sudo systemctl start redis

# Run setup script
./setup.sh

# Configure API keys
# Edit backend/.env and add your API keys:
# - OPENAI_API_KEY=your_key_here
# - TAVILY_API_KEY=your_key_here (for web search)

# Start backend (Terminal 1)
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Start frontend (Terminal 2)
cd frontend
npm start
```

Open **http://localhost:3000** and start building workflows!

### Manual Setup

<details>
<summary>Click to expand manual installation steps</summary>

```bash
# Install Redis first (required)
# macOS:
brew install redis && brew services start redis

# Linux (Ubuntu/Debian):
# sudo apt-get install redis-server && sudo systemctl start redis

# Backend setup
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
</details>

---

## 🎓 Real-World Use Cases

### Software Development
**"Build a REST API for user authentication"**
- Research agent: Current security best practices
- Architect: Design endpoints and database schema
- Coder: Generate implementation code
- Reviewer: Security audit
- Documentation: API docs with examples

### Business Analysis
**"Analyze market trends for electric vehicles"**
- Web search: Gather latest industry reports
- Data extraction: Pull key metrics
- Python analysis: Statistical trends
- Visualization: Generate charts
- Report: Executive summary

### Content Creation
**"Create a technical blog post about microservices"**
- Research: Latest patterns and tools
- Outline: Structure the article
- Writing: Draft sections
- Code examples: Working demos
- Review: Technical accuracy check

### System Design
**"Design a scalable video streaming platform"**
- Requirements: Gather constraints
- Architecture: High-level design
- Component design: Detailed specs
- Cost analysis: AWS/GCP pricing
- Documentation: Architecture diagrams

---

## 🏗️ Technical Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     React Frontend                       │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Flow Builder│  │ Agent Viewer │  │ Chat Interface│  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ WebSocket / REST
┌────────────────────────▼────────────────────────────────┐
│                   FastAPI Backend                        │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────┐ │
│  │ State Machine│  │ Agent Engine│  │  Tool Registry │ │
│  │   Generator  │  │             │  │   (100+ tools) │ │
│  └──────────────┘  └─────────────┘  └────────────────┘ │
│  ┌──────────────────────────────────────────────────┐  │
│  │        Strands Agents SDK (Orchestration)        │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
    ┌─────▼─────┐  ┌────▼────┐  ┌─────▼─────┐
    │  OpenAI   │  │  Redis  │  │  Tavily   │
    │  GPT-4    │  │ Pub/Sub │  │  Search   │
    └───────────┘  └─────────┘  └───────────┘
```

### Tech Stack

**Backend:**
- **FastAPI** - High-performance async web framework
- **Strands Agents SDK** - Multi-agent orchestration
- **Redis** - Real-time event streaming and pub/sub
- **WebSocket/SSE** - Live execution updates
- **SQLite** - Session persistence

**Frontend:**
- **React 19** - Modern UI with hooks
- **ReactFlow** - Interactive workflow diagrams
- **Tailwind CSS** - Utility-first styling
- **Radix UI** - Accessible component primitives

**AI & Tools:**
- **OpenAI GPT-4** - Primary language model
- **Tavily API** - Advanced web search
- **100+ Dynamic Tools** - Web scraping, code execution, file operations, APIs

---

## 📝 Configuration

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

Get your API keys:
- **OpenAI:** https://platform.openai.com/api-keys
- **Tavily:** https://tavily.com (free tier: 1000 searches/month)

### System Requirements

- **Python 3.11+** (required for modern async features)
- **Node.js 18+** (required for React 19)
- **Redis** (required - handles streaming coordination)
- **8GB RAM** (recommended for smooth multi-agent execution)
- **2GB disk space** (dependencies + cache)

---

## 🎯 Key Differentiators

### What Makes Thrivix Different?

| Feature | Thrivix | Traditional AI Chat | Other Workflow Tools |
|---------|---------|---------------------|---------------------|
| **Visual Workflows** | ✅ Real-time diagrams | ❌ Linear chat | ✅ Static diagrams |
| **Auto-Generated Flows** | ✅ From natural language | ❌ Manual prompts | ❌ Manual building |
| **Resume Execution** | ✅ From any step | ❌ Start over | ⚠️ Limited |
| **Multi-Agent Collaboration** | ✅ Specialized agents | ❌ Single context | ⚠️ Sequential only |
| **Real-Time Visualization** | ✅ Live agent activity | ❌ No visibility | ⚠️ Post-execution |
| **Tool Transparency** | ✅ See exactly what runs | ❌ Black box | ⚠️ Logs only |
| **Reusable Pipelines** | ✅ Save & replay | ❌ Copy-paste prompts | ✅ Templates |
| **Parallel Execution** | ✅ Multiple agents | ❌ Sequential | ⚠️ Complex setup |

### Design Philosophy

**Transparency Over Magic** - See exactly what each agent does
**Workflows Over Conversations** - Structure beats context juggling
**Collaboration Over Isolation** - Agents work together
**Visual Over Hidden** - Watch your AI work in real-time

---

## 🚧 Roadmap

### In Active Development
- [ ] **AWS Bedrock Integration** - Support for Claude, Llama, and other Bedrock models
- [ ] **AgentCore Support** - Integration with AgentCore framework
- [ ] **Workflow Templates Library** - Pre-built workflows for common tasks
- [ ] **Advanced Error Recovery** - Better handling of agent failures
- [ ] **Collaboration Features** - Share workflows with teams

### Future Considerations
- [ ] **Local LLM Support** - Run with Ollama, LM Studio
- [ ] **Custom Tool Builder** - Create your own tool integrations
- [ ] **Workflow Marketplace** - Share and discover workflows
- [ ] **Enterprise Features** - RBAC, audit logs, SSO
- [ ] **Cloud Deployment** - Managed hosting option

---

## 🐛 Known Limitations

- **API Dependencies** - Requires OpenAI and Tavily API keys (costs apply)
- **Performance** - Complex workflows may take 30-60 seconds
- **Redis Required** - Must run Redis for streaming features
- **Single User** - Currently designed for individual use
- **Beta Features** - Some experimental interfaces may have bugs

---

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### Priority Areas
1. **Bug Fixes** - Stability and reliability improvements
2. **Documentation** - Examples, tutorials, use cases
3. **Tool Integrations** - New tool blocks and capabilities
4. **UI/UX Improvements** - Better visualization and interactions
5. **Performance** - Optimization for large workflows
6. **AWS Bedrock & AgentCore** - Help with integrations

### Getting Started
```bash
# Fork the repository
# Create a feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git commit -m "Add: your feature description"

# Push and create a pull request
git push origin feature/your-feature-name
```

---

## 📄 License

Apache License 2.0 - See [LICENSE](LICENSE)

You are free to:
- ✅ Use commercially
- ✅ Modify and distribute
- ✅ Use privately
- ✅ Use for patent grants

---

## 🙏 Acknowledgments

Built with amazing open-source technologies:

- **[Strands Agents SDK](https://github.com/strands-agents/sdk-python)** - Multi-agent orchestration framework
- **[OpenAI API](https://openai.com)** - GPT-4 language models
- **[Tavily Search](https://tavily.com)** - Advanced web search API
- **[React Flow](https://reactflow.dev)** - Interactive node-based diagrams
- **[FastAPI](https://fastapi.tiangolo.com)** - Modern Python web framework

---

## 📞 Support & Community

- **GitHub Issues:** [Report bugs or request features](https://github.com/rajulubheem/thrivix/issues)
- **Discussions:** [Ask questions and share ideas](https://github.com/rajulubheem/thrivix/discussions)
- **Email:** For private inquiries

---

<div align="center">

**Made with ❤️ for developers who want AI that shows its work**

[⭐ Star this repo](https://github.com/rajulubheem/thrivix) if Thrivix helps you build better workflows!

</div>
