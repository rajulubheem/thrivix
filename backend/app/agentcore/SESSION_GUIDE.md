# Session Management - The Correct Way

## Critical Understanding

**Session ID is the KEY to agent memory and conversation continuity.**

Without proper session handling, agents can't remember previous conversations.

---

## How It Actually Works

### Pattern from Strands Samples

```python
# 1. Create FileSessionManager with session_id
from strands.session.file_session_manager import FileSessionManager

session_manager = FileSessionManager(
    session_id="user-123-conversation-1",
    storage_dir=Path.cwd() / "sessions"
)

# 2. Create Agent with session_manager
from strands import Agent
from strands.models import BedrockModel

agent = Agent(
    model=BedrockModel(model_id="us.anthropic.claude-sonnet-4-20250514-v1:0"),
    tools=[...],
    session_manager=session_manager  # ← THIS IS CRITICAL
)

# 3. Invoke agent - session_manager handles EVERYTHING
response = agent("What's the weather?")
# FileSessionManager automatically:
# - Loads conversation history
# - Adds user message
# - Sends full context to LLM
# - Stores assistant response

# 4. Continue conversation in same session
response = agent("What about tomorrow?")
# FileSessionManager retrieves previous messages
# Agent knows context: "the weather" refers to previous question
```

---

## Two Types of Memory

### 1. **FileSessionManager** = Short-Term Conversation History
- **Scope**: This session's messages only
- **Purpose**: Multi-turn conversation context
- **Storage**: Local files in `sessions/{session_id}/`
- **Automatic**: Agent handles load/save
- **Lifetime**: Until session expires or is deleted

### 2. **AgentCore Memory** = Long-Term Learning
- **Scope**: Cross-session user preferences, facts
- **Purpose**: Remember user across conversations
- **Storage**: AWS DynamoDB (AgentCore service)
- **Manual**: Explicitly store via API
- **Lifetime**: Permanent (until explicitly deleted)

**They work TOGETHER but are different!**

---

## API Flow Example

### Step 1: Create Agent
```bash
curl -X POST http://localhost:8080/api/v1/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Support Agent",
    "system_prompt": "You are a helpful support agent.",
    "model_config": {
      "model_id": "us.anthropic.claude-sonnet-4-20250514-v1:0"
    },
    "tools": ["web_search"]
  }'
```

**Response:**
```json
{
  "agent_id": "agent-uuid-here",
  ...
}
```

### Step 2: Create Session (Optional - auto-created if not provided)
```bash
curl -X POST "http://localhost:8080/api/v1/sessions?agent_id=agent-uuid&actor_id=user-123"
```

**Response:**
```json
{
  "session_id": "session-uuid-here",
  "agent_id": "agent-uuid",
  "actor_id": "user-123"
}
```

### Step 3: First Message
```bash
curl -X POST http://localhost:8080/api/v1/agents/agent-uuid/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is AWS Bedrock?",
    "actor_id": "user-123",
    "session_id": "session-uuid-here"  ← USE SAME SESSION_ID
  }'
```

**Response:**
```json
{
  "session_id": "session-uuid-here",
  "response": "AWS Bedrock is a fully managed service..."
}
```

### Step 4: Follow-up Message (Same Session!)
```bash
curl -X POST http://localhost:8080/api/v1/agents/agent-uuid/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What are the pricing models?",  ← Refers to "AWS Bedrock" from before
    "actor_id": "user-123",
    "session_id": "session-uuid-here"  ← SAME session_id = agent remembers!
  }'
```

**Response:**
```json
{
  "session_id": "session-uuid-here",
  "response": "AWS Bedrock offers several pricing models..."
}
```

**Agent knows "pricing models" refers to "AWS Bedrock" because session_id is the same!**

---

## What Happens Under the Hood

### When You Call `agent(prompt)`:

1. **FileSessionManager retrieves** conversation history for this session_id
2. **Agent constructs** full prompt:
   ```
   System: You are a helpful support agent.

   User: What is AWS Bedrock?
   Assistant: AWS Bedrock is a fully managed service...

   User: What are the pricing models?  ← New message
   ```
3. **LLM sees full context** and understands "pricing models" = "AWS Bedrock pricing"
4. **FileSessionManager stores** assistant response with session_id
5. **Next invocation** with same session_id includes this message too

---

## Common Mistakes (What I Fixed)

### ❌ WRONG (My Previous Code)
```python
# Trying to manually manage messages
def invoke_agent(prompt):
    # Manually store conversation in memory
    create_event(memory_id, [USER message, ASSISTANT message])

    # Create agent without session_manager
    agent = Agent(model=model, tools=tools)  # NO session_manager!

    # Call agent - it has NO conversation history!
    response = agent(prompt)
```

**Problem**: Agent doesn't know previous messages. Every call is like talking to a goldfish.

### ✅ CORRECT (New Code)
```python
def invoke_agent(prompt, session_id):
    # Create FileSessionManager with session_id
    session_manager = FileSessionManager(session_id=session_id, storage_dir=...)

    # Create agent WITH session_manager
    agent = Agent(model=model, tools=tools, session_manager=session_manager)

    # Call agent - session_manager handles history automatically!
    response = agent(prompt)

    # Optional: Store in AgentCore Memory for long-term learning
    create_event(memory_id, ...)
```

**Result**: Agent remembers entire conversation. Real continuity!

---

## Best Practices

### 1. **Always Use Same session_id for Conversation**
```python
# ✅ Good
session_id = "user-123-support-2025-01-08"
response1 = invoke(agent_id, "Help with order #12345", session_id)
response2 = invoke(agent_id, "What's the status?", session_id)  # Knows context!

# ❌ Bad
response1 = invoke(agent_id, "Help with order #12345", session_id="random-1")
response2 = invoke(agent_id, "What's the status?", session_id="random-2")  # No context!
```

### 2. **Let API Auto-Create Sessions**
```python
# First message without session_id
response = invoke(agent_id, "Hello", session_id=None)
# API creates new session and returns session_id

session_id = response["session_id"]

# Use that session_id for all follow-up messages
response2 = invoke(agent_id, "How are you?", session_id=session_id)
```

### 3. **Use AgentCore Memory for Long-Term**
```python
# Conversation history (FileSessionManager): "What's the weather?"
# Long-term memory (AgentCore): "User prefers Celsius, lives in San Francisco"

# Next session (new session_id):
# - Conversation history is empty (new session)
# - Long-term memory remembered: user location + preferences
```

### 4. **Session Expiry**
```python
# Sessions expire after configured time (default 3600s = 1 hour)
# After expiry, session_id is invalid
# Create new session for new conversation
```

---

## File Structure

```
agent_sessions/
├── session-uuid-1/
│   ├── messages.json          # Conversation history
│   └── metadata.json          # Session metadata
├── session-uuid-2/
│   ├── messages.json
│   └── metadata.json
...
```

Each session_id gets its own directory with conversation history.

---

## Testing Session Continuity

```bash
# 1. Create agent
AGENT_ID=$(curl -X POST http://localhost:8080/api/v1/agents/examples/customer_support | jq -r '.agent_id')

# 2. First message (no session_id - will auto-create)
RESPONSE=$(curl -X POST http://localhost:8080/api/v1/agents/$AGENT_ID/invoke \
  -H "Content-Type: application/json" \
  -d '{"prompt": "My name is John", "actor_id": "user-123"}')

SESSION_ID=$(echo $RESPONSE | jq -r '.session_id')

# 3. Second message - agent should remember your name!
curl -X POST http://localhost:8080/api/v1/agents/$AGENT_ID/invoke \
  -H "Content-Type: application/json" \
  -d "{\"prompt\": \"What's my name?\", \"actor_id\": \"user-123\", \"session_id\": \"$SESSION_ID\"}"

# Response should say "John"!
```

---

## Summary

**THE KEY INSIGHT:**
- `session_id` = conversation continuity
- Same `session_id` = agent remembers
- Different `session_id` = fresh start
- `FileSessionManager` handles everything automatically
- Just call `agent(prompt)` - don't manually manage messages!

**CORRECT FLOW:**
1. Create agent config once
2. Create session (or let first invocation create it)
3. Use same session_id for entire conversation
4. Agent automatically loads history, adds message, stores response
5. Optionally store in AgentCore Memory for long-term learning

That's it!
