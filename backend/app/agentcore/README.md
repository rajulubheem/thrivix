# AgentCore Integration

Production-ready integration of **Strands Agents** with **AWS Bedrock AgentCore** services.

Built on real patterns from:
- [amazon-bedrock-agentcore-samples](https://github.com/awslabs/amazon-bedrock-agentcore-samples)
- [strands-agents/samples](https://github.com/strands-agents/samples)

## Features

✅ **Agent Management** - Create, update, and manage AI agents with personas/tasks
✅ **Memory Integration** - Short-term and long-term memory via AgentCore Memory
✅ **Gateway Support** - Tool integration via AgentCore Gateway (Lambda, OpenAPI, MCP)
✅ **Session Management** - LRU-cached sessions with expiry
✅ **Bedrock Models** - Claude Sonnet 4, Nova, and all Bedrock models
✅ **Knowledge Bases** - Integration with Bedrock Knowledge Bases
✅ **Code Interpreter** - Secure code execution (optional)
✅ **Observability** - CloudWatch, X-Ray, structured logging
✅ **Fargate Ready** - Docker container for AWS Fargate deployment

---

## Architecture

```
┌─────────────────┐
│   FastAPI App   │  ← REST API
└────────┬────────┘
         │
    ┌────┴────┐
    │ Agents  │
    └────┬────┘
         │
    ┌────┴────────────────────────────┐
    │                                  │
┌───┴──────┐  ┌──────────┐  ┌─────────┴──────┐
│  Memory  │  │ Gateway  │  │  Sessions      │
│ Service  │  │ Service  │  │  Manager       │
└────┬─────┘  └────┬─────┘  └────────┬───────┘
     │             │                  │
     └─────────────┴──────────────────┘
                   │
         ┌─────────┴─────────┐
         │  AWS AgentCore    │
         │  - Memory         │
         │  - Gateway        │
         │  - Runtime        │
         └───────────────────┘
```

---

## Quick Start

### 1. Environment Setup

```bash
# Set AWS region
export AGENTCORE_AWS_REGION=us-west-2

# Optional: Enable features
export AGENTCORE_ENABLE_MEMORY=true
export AGENTCORE_ENABLE_GATEWAY=true
export AGENTCORE_ENABLE_OBSERVABILITY=true
```

### 2. Run Locally

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.agentcore.app:app --reload --port 8080
```

Visit: http://localhost:8080/docs

### 3. Deploy to Fargate

```bash
# Build Docker image
docker build -f Dockerfile.agentcore -t agentcore-api:latest .

# Tag for ECR
docker tag agentcore-api:latest <account-id>.dkr.ecr.us-west-2.amazonaws.com/agentcore-api:latest

# Push to ECR
docker push <account-id>.dkr.ecr.us-west-2.amazonaws.com/agentcore-api:latest

# Deploy to Fargate (use your existing Fargate service)
```

---

## API Documentation

### Agent Management

#### Create Agent

```http
POST /api/v1/agents
Content-Type: application/json

{
  "name": "Customer Support Agent",
  "agent_type": "customer_support",
  "character": "Friendly and helpful assistant",
  "system_prompt": "You are a customer support agent helping users with their questions...",
  "model_config": {
    "model_id": "us.anthropic.claude-sonnet-4-20250514-v1:0",
    "temperature": 0.7,
    "max_tokens": 4096
  },
  "memory_type": "both",
  "session_expiry": 3600,
  "tools_enabled": true
}
```

**Response:**
```json
{
  "agent_id": "uuid",
  "name": "Customer Support Agent",
  "status": "active",
  "memory_id": "memory-uuid",
  "created_at": "2025-01-08T..."
}
```

#### List Agents

```http
GET /api/v1/agents?agent_type=customer_support&status=active
```

#### Get Agent

```http
GET /api/v1/agents/{agent_id}
```

#### Update Agent

```http
PUT /api/v1/agents/{agent_id}
Content-Type: application/json

{
  "system_prompt": "Updated prompt...",
  "model_config": {
    "temperature": 0.8
  }
}
```

#### Delete Agent

```http
DELETE /api/v1/agents/{agent_id}
```

---

### Agent Invocation

#### Invoke Agent

```http
POST /api/v1/agents/{agent_id}/invoke
Content-Type: application/json

{
  "prompt": "Help me with order #12345",
  "actor_id": "user-123",
  "session_id": "optional-session-id",
  "include_memory": true,
  "stream": false
}
```

**Response:**
```json
{
  "agent_id": "uuid",
  "session_id": "session-uuid",
  "response": "I'd be happy to help you with order #12345...",
  "model_id": "us.anthropic.claude-sonnet-4-20250514-v1:0",
  "memory_used": true,
  "tools_called": [],
  "metadata": {}
}
```

---

### Session Management

#### Create Session

```http
POST /api/v1/sessions
Content-Type: application/json

{
  "agent_id": "agent-uuid",
  "actor_id": "user-123",
  "session_metadata": {
    "user_tier": "premium"
  }
}
```

#### List Sessions

```http
GET /api/v1/sessions?agent_id=agent-uuid&actor_id=user-123
```

#### Get Session

```http
GET /api/v1/sessions/{session_id}
```

#### Delete Session

```http
DELETE /api/v1/sessions/{session_id}
```

#### Session Stats

```http
GET /api/v1/sessions/_stats
```

**Response:**
```json
{
  "total_sessions": 42,
  "cached_agents": 38,
  "max_sessions": 100
}
```

---

### Memory Management

#### Create Memory Resource

```http
POST /api/v1/memory
Content-Type: application/json

{
  "name": "User Memory",
  "description": "Memory for user interactions",
  "event_expiry_days": 7,
  "strategies": [
    {
      "strategy_type": "semantic",
      "name": "FactExtractor",
      "description": "Extract factual information",
      "namespaces": ["user/{actorId}/facts"]
    },
    {
      "strategy_type": "user_preference",
      "name": "UserPrefs",
      "description": "Track user preferences",
      "namespaces": ["user/{actorId}/preferences"]
    }
  ]
}
```

#### Get Memory

```http
GET /api/v1/memory/{memory_id}
```

#### Create Event (Store Conversation)

```http
POST /api/v1/memory/events
Content-Type: application/json

{
  "memory_id": "memory-uuid",
  "actor_id": "user-123",
  "session_id": "session-uuid",
  "events": [
    {
      "role": "USER",
      "content": "What's my order status?"
    },
    {
      "role": "ASSISTANT",
      "content": "Your order #12345 is being shipped."
    }
  ]
}
```

#### Delete Memory

```http
DELETE /api/v1/memory/{memory_id}
```

---

### Gateway Management

#### Create Gateway

```http
POST /api/v1/gateways
Content-Type: application/json

{
  "name": "Tools Gateway",
  "description": "Gateway for agent tools",
  "enable_semantic_search": true
}
```

#### Add Lambda Target

```http
POST /api/v1/gateways/{gateway_id}/targets/lambda
Content-Type: application/json

{
  "function_arn": "arn:aws:lambda:us-west-2:123456789012:function:my-tool",
  "tool_name": "get_weather",
  "tool_description": "Get weather information",
  "input_schema": {
    "type": "object",
    "properties": {
      "location": {"type": "string"}
    },
    "required": ["location"]
  }
}
```

#### Add OpenAPI Target

```http
POST /api/v1/gateways/{gateway_id}/targets/openapi
Content-Type: application/json

{
  "tools_spec": [
    {
      "name": "search_products",
      "description": "Search for products",
      "inputSchema": {...},
      "openapi": {...}
    }
  ]
}
```

#### List Gateway Targets

```http
GET /api/v1/gateways/{gateway_id}/targets
```

#### Delete Gateway

```http
DELETE /api/v1/gateways/{gateway_id}
```

---

## Code Examples

### Python Client Example

```python
import requests

BASE_URL = "http://localhost:8080/api/v1"

# Create an agent
agent_data = {
    "name": "Data Analyst Agent",
    "agent_type": "data_analyst",
    "system_prompt": "You are a data analyst...",
    "model_config": {
        "model_id": "us.anthropic.claude-sonnet-4-20250514-v1:0",
        "temperature": 0.5
    }
}

response = requests.post(f"{BASE_URL}/agents", json=agent_data)
agent = response.json()
agent_id = agent["agent_id"]

# Invoke the agent
invoke_data = {
    "prompt": "Analyze this dataset...",
    "actor_id": "analyst-001",
    "include_memory": True
}

response = requests.post(
    f"{BASE_URL}/agents/{agent_id}/invoke",
    json=invoke_data
)
result = response.json()
print(result["response"])
```

### JavaScript/TypeScript Client Example

```typescript
const BASE_URL = "http://localhost:8080/api/v1";

// Create agent
const agent = await fetch(`${BASE_URL}/agents`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Support Agent",
    agent_type: "customer_support",
    system_prompt: "You are a helpful support agent...",
    model_config: {
      model_id: "us.anthropic.claude-sonnet-4-20250514-v1:0"
    }
  })
}).then(r => r.json());

// Invoke agent
const result = await fetch(`${BASE_URL}/agents/${agent.agent_id}/invoke`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    prompt: "How do I reset my password?",
    actor_id: "user-123",
    include_memory: true
  })
}).then(r => r.json());

console.log(result.response);
```

---

## Agent Types

| Type | Use Case | Example |
|------|----------|---------|
| `automation` | Step-by-step task execution | Workflow automation, data processing |
| `persona` | Character-based interactions | Virtual assistant, role-playing |
| `task_specific` | Specialized tasks | Code review, text summarization |
| `research` | Information gathering | Market research, literature review |
| `customer_support` | User assistance | FAQ, troubleshooting |
| `data_analyst` | Data analysis | Report generation, insights |

---

## Model Configuration

### Supported Models

```python
# Claude Sonnet 4 (Recommended for complex reasoning)
"us.anthropic.claude-sonnet-4-20250514-v1:0"

# Claude 3.7 Sonnet (General purpose)
"anthropic.claude-3-5-sonnet-20241022-v2:0"

# Amazon Nova Lite (Fast & cost-effective)
"amazon.nova-lite-v1:0"

# Amazon Nova Micro (Ultra-fast)
"amazon.nova-micro-v1:0"
```

### Temperature Guide

- **0.0-0.3**: Deterministic, factual (data analysis, code generation)
- **0.4-0.7**: Balanced (general assistant, customer support)
- **0.8-1.0**: Creative (content generation, brainstorming)

---

## Configuration

### Environment Variables

```bash
# AWS Configuration
AGENTCORE_AWS_REGION=us-west-2
AGENTCORE_AWS_ACCOUNT_ID=123456789012

# Feature Flags
AGENTCORE_ENABLE_MEMORY=true
AGENTCORE_ENABLE_GATEWAY=true
AGENTCORE_ENABLE_CODE_INTERPRETER=false
AGENTCORE_ENABLE_OBSERVABILITY=true

# DynamoDB (Optional)
AGENTCORE_ENABLE_DYNAMODB_SESSION=false
AGENTCORE_DYNAMODB_SESSION_TABLE=agentcore-sessions

# Memory Configuration
AGENTCORE_MEMORY_EVENT_EXPIRY_DAYS=7
AGENTCORE_MEMORY_DEFAULT_STRATEGY=semantic

# Model Defaults
AGENTCORE_DEFAULT_MODEL_ID=us.anthropic.claude-sonnet-4-20250514-v1:0
AGENTCORE_DEFAULT_MODEL_TEMPERATURE=0.7
AGENTCORE_DEFAULT_MAX_TOKENS=4096

# Session Configuration
AGENTCORE_SESSION_EXPIRY_SECONDS=3600
AGENTCORE_MAX_CACHED_SESSIONS=100

# Observability
AGENTCORE_CLOUDWATCH_LOG_GROUP=/aws/agentcore/agents
AGENTCORE_ENABLE_XRAY=true
```

---

## IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock:*::foundation-model/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock-agentcore:*"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:DeleteItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/agentcore-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/agentcore/*"
    }
  ]
}
```

---

## Deployment

### Docker Build

```bash
# Build for ARM64 (Graviton)
docker build --platform linux/arm64 -f Dockerfile.agentcore -t agentcore-api:arm64 .

# Build for AMD64
docker build --platform linux/amd64 -f Dockerfile.agentcore -t agentcore-api:amd64 .

# Multi-architecture build
docker buildx build --platform linux/amd64,linux/arm64 -f Dockerfile.agentcore -t agentcore-api:latest .
```

### AWS Fargate Task Definition

```json
{
  "family": "agentcore-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "runtimePlatform": {
    "cpuArchitecture": "ARM64",
    "operatingSystemFamily": "LINUX"
  },
  "containerDefinitions": [
    {
      "name": "agentcore-api",
      "image": "<account-id>.dkr.ecr.us-west-2.amazonaws.com/agentcore-api:latest",
      "portMappings": [
        {
          "containerPort": 8080,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "AGENTCORE_AWS_REGION",
          "value": "us-west-2"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/agentcore-api",
          "awslogs-region": "us-west-2",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 10
      }
    }
  ]
}
```

---

## Monitoring & Observability

### Health Checks

- **/health** - Application health + session stats
- **/ready** - Readiness for traffic
- **/docs** - OpenAPI documentation

### Structured Logging

All logs use `structlog` with JSON output for CloudWatch Insights:

```python
logger.info(
    "Agent invoked",
    agent_id=agent_id,
    session_id=session_id,
    actor_id=actor_id,
    model_id=model_id
)
```

### Metrics

- Session count
- Agent invocation count
- Memory usage
- Gateway tool calls

---

## Troubleshooting

### Common Issues

**1. Agent invocation fails with "credentials not found"**
```bash
# Ensure IAM role is attached to Fargate task
# Or set AWS credentials:
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
```

**2. Memory creation fails**
```bash
# Check IAM permissions for bedrock-agentcore:CreateMemory
# Verify region supports AgentCore
```

**3. Session expired**
```bash
# Sessions expire after AGENTCORE_SESSION_EXPIRY_SECONDS
# Create new session or increase expiry
```

---

## License

Apache 2.0

---

## Support

- **Documentation**: `/docs` endpoint
- **GitHub Issues**: https://github.com/rajulubheem/thrivix/issues
- **AWS AgentCore Docs**: https://docs.aws.amazon.com/bedrock-agentcore/

---

**Built with ❤️ using AWS Bedrock AgentCore + Strands Agents**
