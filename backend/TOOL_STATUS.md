# Tool Status: Real vs Simulated

## Tool Status Overview

| Tool | Status | Requirements to Activate | Notes |
|------|--------|-------------------------|-------|
| **file_read** | ✅ REAL | None | Fully functional |
| **file_write** | ✅ REAL | None | Fully functional |
| **editor** | ✅ REAL | None | Fully functional |
| **http_request** | ✅ REAL | API tokens for protected endpoints | Works for public APIs |
| **tavily_search** | 🟡 SIMULATED | `TAVILY_API_KEY` | Returns mock search results |
| **current_time** | ✅ REAL | None | Returns actual time |
| **sleep** | ✅ REAL | None | Actually pauses execution |
| **environment** | ✅ REAL | None | Reads real env vars |
| **system_info** | ✅ REAL | None | Returns real system info |
| **calculator** | ✅ REAL | None | Performs real calculations |
| **python_repl** | ✅ REAL | None | Executes real Python (sandboxed) |
| **shell_command** | ✅ REAL | None | Executes real commands |
| **journal** | ✅ REAL | None | Stores real entries (in-memory) |
| **handoff_to_user** | ✅ REAL | None | Actually stops for user input |
| **stop** | ✅ REAL | None | Actually terminates |
| **think** | ✅ REAL | None | Performs reasoning cycles |
| **batch** | ✅ REAL | None | Executes tools in parallel |
| **workflow** | ✅ REAL | None | Orchestrates real workflows |
| **use_llm** | 🟡 SIMULATED | `OPENAI_API_KEY` or LLM config | Returns mock LLM responses |
| **a2a_client** | 🟡 SIMULATED | Running agent servers | Returns mock agent data |
| **cron** | ✅ REAL | None | Manages schedules (in-memory) |
| **rss** | 🟡 PARTIAL | None | Falls back to demo feeds |
| **load_tool** | ✅ REAL | Tool files | Actually loads tools |
| **memory** | ✅ REAL | None | In-memory storage (works) |
| **mem0_memory** | ✅ REAL | Optional: `MEM0_API_KEY` | In-memory with embeddings |
| **generate_image** | 🟡 SIMULATED | `OPENAI_API_KEY` | Returns mock image URLs |
| **image_reader** | 🟡 SIMULATED | Vision API | Returns mock analysis |
| **speak** | 🟡 SIMULATED | TTS API | Returns mock audio data |
| **diagram** | 🟡 SIMULATED | None | Returns mock diagram URLs |
| **use_aws** | 🟡 SIMULATED | AWS credentials | Returns mock AWS responses |
| **retrieve** | 🟡 SIMULATED | Vector DB/Knowledge base | Returns mock search results |
| **task_planner** | ✅ REAL | None | Creates real plans |
| **agent_todo** | ✅ REAL | None | Manages real todos |
| **recursive_executor** | ✅ REAL | None | Executes real tool chains |

## Legend
- ✅ **REAL** - Fully functional, performs actual operations
- 🟡 **SIMULATED** - Returns mock data, needs configuration for real operation
- 🟡 **PARTIAL** - Works partially, falls back to simulation when needed

## How to Identify Simulated Responses

Simulated responses typically include one or more of these indicators:
```json
{
  "mode": "simulated",
  "status": "simulated", 
  "note": "Simulated response",
  "url": "https://example.com/simulated"
}
```

## Quick Setup for Real Operations

### 1. Essential API Keys
```bash
# Create .env file
cat > .env << EOF
# Web Search
TAVILY_API_KEY=tvly-xxxxx

# AI/LLM
OPENAI_API_KEY=sk-xxxxx

# AWS (optional)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=xxxxx
AWS_REGION=us-east-1

# Memory (optional)
MEM0_API_KEY=mem0-xxxxx
EOF
```

### 2. Install Dependencies
```bash
pip install python-dotenv boto3 openai tavily-python
```

### 3. Load Environment
```python
# In app/main.py
from dotenv import load_dotenv
load_dotenv()
```

## Priority Activation Order

### Phase 1: Easy Wins (Just need API keys)
1. **tavily_search** - Get key from https://tavily.com
2. **use_llm** - Use OpenAI or local LLM
3. **mem0_memory** - Upgrade to Mem0 platform

### Phase 2: Cloud Services
1. **use_aws** - Add AWS credentials
2. **generate_image** - OpenAI DALL-E API
3. **speak** - AWS Polly or OpenAI TTS

### Phase 3: Infrastructure
1. **a2a_client** - Run actual agent servers
2. **retrieve** - Set up vector database
3. **image_reader** - Configure vision API

## Benefits of Simulation Mode

- **Development** - Test workflows without API costs
- **Testing** - Predictable responses for unit tests
- **Demo** - Show functionality without credentials
- **Fallback** - Graceful degradation when services unavailable

## Checking Tool Mode

```python
# Example: Check if tool is simulated
result = await tool.execute()
is_simulated = (
    result.get("mode") == "simulated" or
    result.get("status") == "simulated" or
    "simulated" in str(result.get("note", "")).lower()
)
print(f"Tool running in {'simulated' if is_simulated else 'real'} mode")
```