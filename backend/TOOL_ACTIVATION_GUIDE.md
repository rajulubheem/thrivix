# Tool Activation Guide

This guide explains how to activate the simulated tools to perform real operations.

## Environment Variables Required

### 1. Tavily Search (Web Search)
```bash
export TAVILY_API_KEY="your-tavily-api-key"
```
Get your API key from: https://tavily.com/

### 2. AWS Tools (use_aws, retrieve)
```bash
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="us-east-1"
```

### 3. OpenAI Tools (generate_image, use_llm)
```bash
export OPENAI_API_KEY="your-openai-api-key"
```

### 4. Image Generation (Alternative to OpenAI)
```bash
# For Stability AI
export STABILITY_API_KEY="your-stability-api-key"

# For Replicate
export REPLICATE_API_TOKEN="your-replicate-token"
```

### 5. Memory Tools (Advanced)
```bash
# For Mem0 Platform
export MEM0_API_KEY="your-mem0-api-key"

# For OpenSearch backend
export OPENSEARCH_HOST="https://your-opensearch-domain.amazonaws.com"
```

### 6. Text-to-Speech (speak)
```bash
# For AWS Polly
export AWS_ACCESS_KEY_ID="your-key"
export AWS_SECRET_ACCESS_KEY="your-secret"

# For OpenAI TTS
export OPENAI_API_KEY="your-openai-api-key"
```

## Making Tools Real - Code Changes

### 1. HTTP Request Tool
Already works for real URLs! Just needs auth tokens for protected APIs:
```python
result = agent.tool.http_request(
    method="GET",
    url="https://api.github.com/user",
    auth_type="Bearer",
    auth_token="ghp_your_github_token"
)
```

### 2. Tavily Search
```python
# In app/tools/tavily_tool.py
import os
from tavily import TavilyClient

class TavilySearchTool:
    def __init__(self):
        self.api_key = os.getenv("TAVILY_API_KEY")
        if self.api_key:
            self.client = TavilyClient(api_key=self.api_key)
    
    async def __call__(self, **kwargs):
        if not self.api_key:
            return {"success": False, "error": "TAVILY_API_KEY not set"}
        
        # Use real Tavily API
        results = self.client.search(
            query=kwargs.get("query"),
            search_depth=kwargs.get("search_depth", "basic"),
            max_results=kwargs.get("max_results", 5)
        )
        return {"success": True, "results": results}
```

### 3. AWS Tools
```python
# In app/tools/aws_tools.py
import boto3
import os

class UseAWSTool:
    def __init__(self):
        self.aws_configured = bool(os.getenv("AWS_ACCESS_KEY_ID"))
    
    async def _handle_s3(self, action: str, params: Dict) -> Dict:
        if not self.aws_configured:
            # Return simulated data
            return self._simulated_s3_response(action, params)
        
        # Use real AWS
        s3 = boto3.client('s3')
        
        if action == "list_buckets":
            response = s3.list_buckets()
            return {
                "success": True,
                "buckets": response['Buckets']
            }
        # ... other real AWS operations
```

### 4. Image Generation
```python
# In app/tools/media_tools.py
import openai
import os

class GenerateImageTool:
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        if self.api_key:
            openai.api_key = self.api_key
    
    async def __call__(self, **kwargs):
        if not self.api_key:
            # Return simulated response
            return self._simulated_response(kwargs)
        
        # Use real OpenAI DALL-E
        response = openai.Image.create(
            prompt=kwargs.get("prompt"),
            size=kwargs.get("size", "1024x1024"),
            quality=kwargs.get("quality", "standard"),
            n=kwargs.get("n", 1)
        )
        
        return {
            "success": True,
            "images": response['data']
        }
```

### 5. A2A Client (Agent Communication)
For real agent-to-agent communication, you need actual agents running:

```python
# Start another agent server
python -m strands.agent.server --port 9000

# Then the a2a_client will actually connect
result = agent.tool.a2a_client(
    action="discover",
    agent_url="http://localhost:9000"
)
```

## Quick Activation Steps

1. **Install required packages:**
```bash
pip install boto3 openai tavily-python stability-sdk
```

2. **Create `.env` file:**
```bash
# .env
TAVILY_API_KEY=tvly-xxxxx
OPENAI_API_KEY=sk-xxxxx
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=xxxxx
AWS_REGION=us-east-1
```

3. **Load environment variables:**
```python
# In app/main.py
from dotenv import load_dotenv
load_dotenv()
```

4. **Update tool implementations:**
Each tool checks for its required API keys and falls back to simulation if not found.

## Testing Real vs Simulated

You can check if a tool is using real or simulated mode:

```python
# Check tool status
result = agent.tool.use_aws(
    service="s3",
    action="list_buckets"
)

# Real response will have actual AWS data
# Simulated response will have "note": "Simulated" or similar indicators
```

## Priority Tools to Activate

1. **tavily_search** - Easy, just needs API key
2. **http_request** - Already works for public APIs
3. **memory/mem0_memory** - Works locally, upgrade to Mem0 platform for persistence
4. **python_repl** - Already real, just sandboxed
5. **file operations** - Already real

## Notes

- Simulated mode is useful for development and testing
- Real mode requires API keys and credentials
- Some tools (like file operations) are always real
- Tools gracefully fall back to simulation when services are unavailable