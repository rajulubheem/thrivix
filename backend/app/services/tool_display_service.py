"""
Tool Display Service
Enhances tool usage visibility by formatting tool calls and results for display in the UI
"""
import json
from typing import Dict, Any, Optional, Callable
import structlog

logger = structlog.get_logger()

class ToolDisplayService:
    """Service to format tool usage for clear display in the chat UI"""

    @staticmethod
    def format_tool_call(tool_name: str, parameters: Dict[str, Any]) -> str:
        """Format a tool call for display in the chat"""

        # IMPORTANT: Use [EXECUTING: name] instead of [TOOL: name] to avoid re-detection
        # Special formatting for common tools
        if tool_name == "file_write":
            path = parameters.get('path', 'unknown')
            content = parameters.get('content', '')

            # Detect language from file extension
            lang = ToolDisplayService._detect_language(path)

            # If content is empty, check if there's a param field (legacy format)
            if not content and 'param' in parameters:
                param = parameters['param']
                if isinstance(param, str):
                    content = param

            formatted = f"""[EXECUTING: file_write]
### 📝 Writing File: `{path}`

**Parameters:**
- Path: `{path}`
- Size: {len(content)} characters

```{lang}
{content}
```
[/EXECUTING]"""
            return formatted

        elif tool_name == "file_read":
            path = parameters.get('path', 'unknown')
            return f"""[EXECUTING: file_read]
### 📖 Reading File: `{path}`

**Parameters:**
- Path: `{path}`
[/EXECUTING]"""

        elif tool_name == "http_request":
            method = parameters.get('method', 'GET')
            url = parameters.get('url', 'unknown')
            return f"""[EXECUTING: http_request]
### 🌐 HTTP Request

**Method:** `{method}`
**URL:** `{url}`
[/EXECUTING]"""

        elif tool_name == "python_repl":
            code = parameters.get('code', '')
            return f"""[EXECUTING: python_repl]
### 🐍 Executing Python Code

```python
{code}
```
[/EXECUTING]"""

        elif tool_name == "shell_command":
            command = parameters.get('command', '')
            return f"""[EXECUTING: shell_command]
### 💻 Executing Shell Command

```bash
{command}
```
[/EXECUTING]"""

        elif tool_name == "tavily_search":
            query = parameters.get('query', '')
            return f"""[EXECUTING: tavily_search]
### 🔍 Web Search

**Query:** "{query}"
[/EXECUTING]"""

        else:
            # Generic formatting for other tools
            params_str = json.dumps(parameters, indent=2)
            return f"""[EXECUTING: {tool_name}]
### 🔧 Using Tool: `{tool_name}`

**Parameters:**
```json
{params_str}
```
[/EXECUTING]"""

    @staticmethod
    def format_tool_result(tool_name: str, result: Dict[str, Any], parameters: Dict[str, Any]) -> str:
        """Format a tool result for display in the chat"""

        # Check if it's a simulated response
        is_simulated = (
            result.get('mode') == 'simulated' or
            result.get('status') == 'simulated' or
            'simulated' in str(result.get('note', '')).lower()
        )

        simulation_badge = " 🎭 *(Simulated)*" if is_simulated else ""

        # Special formatting for common tools
        if tool_name == "file_write":
            success = result.get('status') == 'success' or result.get('success', False)
            path = parameters.get('path', 'unknown')

            if success:
                return f"""[TOOL RESULT: file_write]
### ✅ File Written Successfully{simulation_badge}

**File:** `{path}`
**Status:** Created/Updated
[/TOOL RESULT]"""
            else:
                error = result.get('error', 'Unknown error')
                return f"""[TOOL RESULT: file_write]
### ❌ File Write Failed

**File:** `{path}`
**Error:** {error}
[/TOOL RESULT]"""

        elif tool_name == "file_read":
            if result.get('success', False):
                content = result.get('content', '')
                path = parameters.get('path', 'unknown')
                lang = ToolDisplayService._detect_language(path)

                # Truncate if too long
                if len(content) > 2000:
                    content = content[:2000] + f"\n... [{len(content) - 2000} more characters] ..."

                return f"""[TOOL RESULT: file_read]
### ✅ File Read Successfully{simulation_badge}

**File:** `{path}`

```{lang}
{content}
```
[/TOOL RESULT]"""
            else:
                error = result.get('error', 'File not found')
                return f"""[TOOL RESULT: file_read]
### ❌ File Read Failed

**Error:** {error}
[/TOOL RESULT]"""

        elif tool_name == "python_repl":
            stdout = result.get('stdout', '')
            stderr = result.get('stderr', '')
            result_value = result.get('result', '')

            output = f"""[TOOL RESULT: python_repl]
### 🐍 Python Execution Result{simulation_badge}

"""
            if stdout:
                output += f"**Output:**\n```\n{stdout}\n```\n\n"
            if result_value:
                output += f"**Result:**\n```\n{result_value}\n```\n\n"
            if stderr:
                output += f"**Errors:**\n```\n{stderr}\n```\n"

            return output + "\n[/TOOL RESULT]"

        elif tool_name == "shell_command":
            output = result.get('output', '')
            error = result.get('error', '')

            if output:
                return f"""[TOOL RESULT: shell_command]
### 💻 Command Output{simulation_badge}

```
{output}
```
[/TOOL RESULT]"""
            elif error:
                return f"""[TOOL RESULT: shell_command]
### ❌ Command Failed

```
{error}
```
[/TOOL RESULT]"""

        elif tool_name == "tavily_search":
            # Check if this is the full result from unified_tool_service
            if 'result' in result and isinstance(result['result'], dict):
                # Extract the actual result data
                actual_result = result['result']
                answer = actual_result.get('answer', '')
                results_list = actual_result.get('results', [])
                result_count = actual_result.get('result_count', len(results_list))

                output = f"""[TOOL RESULT: tavily_search]
### 🔍 Search Results{simulation_badge}

**Summary:** {answer}

**Results Found:** {result_count}

"""
                for i, item in enumerate(results_list[:5], 1):
                    title = item.get('title', 'No title')
                    url = item.get('url', '')
                    content = item.get('content', '')[:200]

                    output += f"""
**{i}. {title}**
{content}...
[Link]({url})

"""
                output += "[/TOOL RESULT]"
                return output
            else:
                # Fallback for simpler result format
                results = result.get('results', [])
                if results:
                    output = f"""[TOOL RESULT: tavily_search]
### 🔍 Search Results{simulation_badge}

"""
                    for i, item in enumerate(results[:5], 1):
                        title = item.get('title', 'No title')
                        url = item.get('url', '')
                        snippet = item.get('snippet', item.get('content', ''))[:200]

                        output += f"""
**{i}. {title}**
{snippet}...
[Link]({url})

"""
                    output += "[/TOOL RESULT]"
                    return output
                else:
                    return "[TOOL RESULT: tavily_search]\n### 🔍 No search results found\n[/TOOL RESULT]"

        else:
            # Generic result formatting
            success = result.get('success', False)
            status_icon = "✅" if success else "❌"

            # Format result nicely
            if isinstance(result, dict):
                # Remove internal fields
                display_result = {k: v for k, v in result.items()
                                if not k.startswith('_') and k not in ['success']}
                result_str = json.dumps(display_result, indent=2)
            else:
                result_str = str(result)

            # Truncate if too long
            if len(result_str) > 1000:
                result_str = result_str[:1000] + "\n... [truncated] ..."

            return f"""[TOOL RESULT: {tool_name}]
### {status_icon} Tool Result: `{tool_name}`{simulation_badge}

```json
{result_str}
```
[/TOOL RESULT]"""

    @staticmethod
    def _detect_language(filepath: str) -> str:
        """Detect programming language from file extension"""
        if not filepath:
            return "text"

        filepath = filepath.lower()

        extensions = {
            '.py': 'python',
            '.js': 'javascript',
            '.jsx': 'jsx',
            '.ts': 'typescript',
            '.tsx': 'tsx',
            '.html': 'html',
            '.css': 'css',
            '.json': 'json',
            '.md': 'markdown',
            '.yml': 'yaml',
            '.yaml': 'yaml',
            '.sh': 'bash',
            '.sql': 'sql',
            '.cpp': 'cpp',
            '.c': 'c',
            '.java': 'java',
            '.go': 'go',
            '.rs': 'rust',
            '.rb': 'ruby',
            '.php': 'php',
            '.swift': 'swift',
            '.kt': 'kotlin',
            '.r': 'r',
            '.m': 'matlab',
        }

        for ext, lang in extensions.items():
            if filepath.endswith(ext):
                return lang

        return "text"

    @staticmethod
    async def send_tool_display(
        tool_name: str,
        parameters: Dict[str, Any],
        result: Optional[Dict[str, Any]],
        callback_handler: Callable,
        phase: str = "call",  # "call" or "result"
        agent_name: str = "system"  # Allow passing agent name
    ):
        """Send formatted tool display to the UI"""

        if phase == "call":
            # Show what tool is being called with what parameters
            formatted = ToolDisplayService.format_tool_call(tool_name, parameters)

            await callback_handler(
                type="tool_call",
                agent=agent_name,
                data={
                    "tool": tool_name,
                    "parameters": parameters,
                    "formatted": formatted
                }
            )

            # Also send as text for display
            await callback_handler(
                type="text_generation",
                agent=agent_name,
                data={
                    "chunk": formatted,  # Send as chunk for streaming
                    "text": formatted,
                    "is_tool_display": True
                }
            )

        elif phase == "result" and result:
            # Show the result of the tool call
            formatted = ToolDisplayService.format_tool_result(tool_name, result, parameters)

            await callback_handler(
                type="tool_result",
                agent=agent_name,
                data={
                    "tool": tool_name,
                    "result": result,
                    "formatted": formatted
                }
            )

            # Also send as text for display
            await callback_handler(
                type="text_generation",
                agent=agent_name,
                data={
                    "chunk": formatted,  # Send as chunk for streaming
                    "text": formatted,
                    "is_tool_display": True
                }
            )

            # If file_write, also send as artifact
            if tool_name == "file_write" and result.get('success', False):
                path = parameters.get('path', 'unknown')
                content = parameters.get('content', '')
                lang = ToolDisplayService._detect_language(path)

                await callback_handler(
                    type="artifact",
                    agent=agent_name,
                    data={
                        "title": path,
                        "content": content,
                        "type": "code",
                        "language": lang
                    }
                )

# Create singleton instance
tool_display_service = ToolDisplayService()

__all__ = ['ToolDisplayService', 'tool_display_service']