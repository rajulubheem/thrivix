# Thrivix - AI-Powered Multi-Agent Intelligence Platform

<div align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" />
  <img src="https://img.shields.io/badge/license-Apache%202.0-green.svg" />
  <img src="https://img.shields.io/badge/python-3.9+-blue.svg" />
  <img src="https://img.shields.io/badge/node-18+-green.svg" />
</div>

## 🚀 Overview

Thrivix is an advanced AI platform that orchestrates multiple AI agents to deliver comprehensive research, analysis, and intelligent conversations. Built with modern web technologies and powered by state-of-the-art language models, it provides a seamless experience for complex AI-driven tasks.

## ✨ Key Features

### 🧠 Intelligent Conversation Modes
- **⚡ Fast Mode**: Quick, efficient responses for immediate queries
- **🔬 Deep Research**: Comprehensive analysis with progressive thinking streams
- **📚 Scholar Mode**: Academic-level research with citations and sources

### 🤖 Multi-Agent Systems
- **Swarm Intelligence**: Collaborative AI agents working together
- **Unified Orchestrator**: Centralized control for complex multi-step tasks
- **Custom Agent Creation**: Build and deploy specialized agents
- **MCP Integration**: Model Context Protocol support for enhanced tool usage

### 🔍 Advanced Research Capabilities
- Real-time web search and analysis
- Progressive thought streaming
- Source verification and citation
- Multi-perspective analysis
- Human-in-the-loop interactions

### 💾 Session Management
- Persistent conversation history
- Context-aware responses
- Session branching and merging
- Export and import capabilities

## 🛠️ Tech Stack

### Frontend
- **React 18** with TypeScript
- **Radix UI** for modern, accessible components
- **Tailwind CSS** for responsive design
- **React Router** for navigation
- **Server-Sent Events** for real-time streaming

### Backend
- **FastAPI** for high-performance APIs
- **Strands Framework** for AI agent orchestration
- **OpenAI GPT-4** & **Claude** integration
- **Tavily API** for web research
- **Async/await** for concurrent processing

## 📦 Installation

### Prerequisites
- Python 3.9+
- Node.js 18+
- npm or yarn
- Git

### Quick Setup

1. **Clone the repository:**
```bash
git clone https://github.com/rajulubheem/thrivix.git
cd thrivix
```

2. **Backend Setup:**
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.template .env
# Edit .env with your API keys:
# OPENAI_API_KEY=your_key_here
# TAVILY_API_KEY=your_key_here

# Start backend server
python main.py
```

3. **Frontend Setup:**
```bash
cd ../frontend

# Install dependencies
npm install

# Configure environment
cp .env.template .env
# Edit .env if needed (default: REACT_APP_API_URL=http://localhost:8000)

# Start development server
npm start
```

4. **Access the application:**
   - Frontend: http://localhost:3000
   - API Docs: http://localhost:8000/docs

## 🎯 Usage

### Main Interfaces

1. **Home** (`/`) - Overview and feature showcase
2. **Swarm Chat** (`/swarm`) - Multi-agent collaboration interface
3. **Orchestrator** (`/orchestrator`) - Complex task orchestration
4. **Conversation** (`/conversation`) - Research-focused chat with mode switching
5. **Settings** (`/settings`) - Configure tools and preferences

### Getting Started

1. Navigate to http://localhost:3000
2. Choose your interface based on your needs
3. Select the appropriate mode (Fast/Deep/Scholar)
4. Start interacting with the AI system

## 🔧 Configuration

### API Keys
Configure your API keys in `backend/.env`:
```env
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
ANTHROPIC_API_KEY=sk-ant-...  # Optional
```

### Model Selection
Modify `backend/app/config.py` to change default models:
```python
DEFAULT_MODEL = "gpt-4"
RESEARCH_MODEL = "gpt-4-turbo"
FAST_MODEL = "gpt-3.5-turbo"
```

### Tool Configuration
Enable/disable tools in `backend/app/tools/config.yaml`:
```yaml
tools:
  web_search:
    enabled: true
    requires_approval: false
  code_interpreter:
    enabled: true
    requires_approval: true
```

## 📚 API Documentation

### Core Endpoints

#### Conversation Management
- `POST /api/v1/conversation/start` - Initialize new conversation
- `POST /api/v1/conversation/continue` - Continue existing conversation
- `GET /api/v1/conversation/status/{session_id}` - Get status and updates
- `GET /api/v1/conversation/sessions` - List all sessions

#### Research Operations
- `POST /api/v1/research/start-strands-real` - Start deep research
- `GET /api/v1/research/status-strands-real/{session_id}` - Get research progress

#### Swarm Intelligence
- `POST /api/v1/swarm/chat` - Send message to agent swarm
- `GET /api/v1/swarm/stream/{session_id}` - Stream swarm responses

#### Orchestration
- `POST /api/v1/unified-orchestrator/start` - Start orchestrated workflow
- `GET /api/v1/unified-orchestrator/status/{session_id}` - Get workflow status

Full interactive API documentation available at http://localhost:8000/docs

## 🚢 Deployment

### Docker Deployment
```bash
docker-compose up --build
```

### Production Considerations
- Use environment variables for sensitive data
- Enable HTTPS with SSL certificates
- Configure CORS appropriately
- Implement rate limiting
- Set up monitoring and logging
- Use production WSGI server (Gunicorn/Uvicorn)

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

Please read our [Contributing Guidelines](CONTRIBUTING.md) for details on our code of conduct and development process.

## 🔒 Security

- Never commit API keys or sensitive data
- Use environment variables for configuration
- Keep dependencies up to date
- Follow security best practices for production

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Strands AI Framework](https://github.com/BrainBlend-AI/Strands)
- Powered by OpenAI and Anthropic language models
- Research capabilities via Tavily API
- UI components from Radix UI
- Icons from Lucide React

## 👤 Author

**Bheem Rajulu**
- GitHub: [@rajulubheem](https://github.com/rajulubheem)

## 📞 Support

- 🐛 [Report bugs](https://github.com/rajulubheem/thrivix/issues)
- 💡 [Request features](https://github.com/rajulubheem/thrivix/issues)
- 📖 [Documentation](https://github.com/rajulubheem/thrivix/wiki)
- 💬 [Discussions](https://github.com/rajulubheem/thrivix/discussions)

---

<div align="center">
  <strong>Built with ❤️ for the AI community</strong>
</div>