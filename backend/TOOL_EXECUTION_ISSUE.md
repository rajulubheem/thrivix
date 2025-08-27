# Tool Execution Issue Analysis

## Problem
When users ask to "Create a simple todo app", the agents say they will use tools but don't actually output the [TOOL: ...] commands. No code is visible in the chat.

## Root Cause
The agents are:
1. Configured with the right tools (file_write, file_read, etc.)
2. Given proper instructions on how to use tools
3. BUT not actually outputting the tool commands in their responses

## What's Happening
1. User asks: "Create me a simple todo app"
2. Agent responds: "I'm going to create the necessary files..." 
3. Agent DOES NOT output: `[TOOL: file_write] {"path": "index.html", "content": "..."}`
4. No tools are executed, no code is shown

## Debug Added
Added logging to show:
- What tools are available for each agent
- What the agent's response contains
- How many tool matches are found

## Issues Found
1. **Agent Naming**: The agents shown ("todo app requirements analyzer", "todo ui designer") are different from the configured agents
2. **Tool Format**: Agents aren't following the instructed format `[TOOL: name]`
3. **Model Behavior**: The agents seem to be describing what they would do rather than actually doing it

## Solutions Implemented

### 1. Enhanced Logging
- Shows available tools for each agent
- Shows first 500 chars of response to debug
- Shows count of tool matches found

### 2. Tool Display Service
- Formats tool calls and results for display
- Sends formatted content to chat stream
- Creates artifacts for file writes

### 3. Parameter Auto-Correction
- Fixes wrong parameter formats
- Extracts filename from content when needed
- Maps {"param": ...} to proper parameters

## Remaining Issue
The core problem is that agents aren't outputting the `[TOOL: ...]` format at all. They're just describing what they would do.

## Possible Fixes

### Option 1: Force Tool Usage in Prompt
Update the system prompt to be more forceful:
```
CRITICAL: You MUST use tools by outputting [TOOL: name] followed by JSON parameters.
DO NOT just describe what you would do - ACTUALLY DO IT using the tool format.
```

### Option 2: Post-Process Agent Response
If agent says "I will create file X with content Y", automatically convert to tool call:
```python
if "i will create" in response.lower() or "i'm going to write" in response.lower():
    # Extract filename and content
    # Generate [TOOL: file_write] command
```

### Option 3: Use Function Calling
Switch from text-based tool format to OpenAI function calling:
```python
response = await client.chat.completions.create(
    model=model,
    messages=messages,
    functions=tool_definitions,
    function_call="auto"
)
```

## Recommended Next Steps

1. **Immediate Fix**: Update agent prompts to be more explicit about using tools
2. **Better Fix**: Implement function calling for reliable tool usage
3. **Monitor**: Add metrics to track how often agents actually use tools vs just describe

## Test Case
Ask: "Create a simple todo app"

Expected behavior:
1. Agent outputs: `[TOOL: file_write]` with HTML content
2. HTML content displays in chat with syntax highlighting
3. File appears in artifacts panel
4. Success message shows

Current behavior:
1. Agent says "I will create files..."
2. No tool commands executed
3. No code visible
4. Only artifacts created (sometimes)