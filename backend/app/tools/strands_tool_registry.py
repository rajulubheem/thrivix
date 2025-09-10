"""
Strands-compatible Tool Registry
Following the Strands tools pattern for dynamic tool discovery
"""
from typing import Dict, Any, List, Optional, Callable
import os
import json
import structlog
from dataclasses import dataclass
from enum import Enum
from datetime import datetime

logger = structlog.get_logger()


class ToolCapability(Enum):
    """Tool capability categories following Strands pattern"""
    WEB_SEARCH = "web_search"
    FILE_OPERATIONS = "file_operations"
    CODE_GENERATION = "code_generation"
    CODE_EXECUTION = "code_execution"  # Added for python_repl and shell
    DATA_ANALYSIS = "data_analysis"
    API_INTERACTION = "api_interaction"
    DOCUMENTATION = "documentation"
    TESTING = "testing"
    DATABASE = "database"
    DEPLOYMENT = "deployment"
    MONITORING = "monitoring"
    COMMUNICATION = "communication"
    AI_TOOLS = "ai_tools"
    PROJECT_MANAGEMENT = "project_management"


@dataclass
class StrandsTool:
    """Strands-compatible tool definition"""
    name: str
    description: str
    handler: Callable
    input_schema: Dict[str, Any]
    capabilities: List[ToolCapability]
    requires_approval: bool = False
    is_async: bool = False
    enabled: bool = True

    def to_dict(self) -> Dict[str, Any]:
        """Convert tool to dictionary format"""
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
            "capabilities": [cap.value for cap in self.capabilities],
            "requires_approval": self.requires_approval,
            "enabled": self.enabled
        }


class StrandsToolRegistry:
    """
    Dynamic tool registry following Strands patterns
    Provides tool discovery, capability mapping, and execution
    """

    def __init__(self):
        self.tools: Dict[str, StrandsTool] = {}
        self.capability_map: Dict[ToolCapability, List[str]] = {}
        self._initialized = False
        self.tool_config_service = None

    async def initialize(self):
        """Initialize and discover all available tools"""
        if self._initialized:
            return

        # Import tool config service
        try:
            from app.services.tool_config_service import tool_config_service
            self.tool_config_service = tool_config_service
        except ImportError:
            logger.warning("Tool config service not available")

        # Register built-in tools
        await self._register_builtin_tools()

        # Discover MCP tools if available
        await self._discover_mcp_tools()

        # Load configuration-based tools
        await self._load_configured_tools()

        self._initialized = True
        logger.info(f"✅ Strands Tool Registry initialized with {len(self.tools)} tools")

    async def _register_builtin_tools(self):
        """Register built-in Strands-compatible tools"""

        # Tavily Search Tool (and aliases)
        from app.tools import strands_tavily_search as _tav
        def _tavily_available() -> bool:
            return bool(os.getenv("TAVILY_API_KEY"))

        # Always register, but the handler itself will return a helpful error if no API key
        tavily_tool = StrandsTool(
            name="tavily_search",
            description="Search the web for current information using Tavily API",
            handler=_tav.tavily_search,
            input_schema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search query"},
                    "search_depth": {"type": "string", "enum": ["basic", "advanced"], "default": "basic"},
                    "max_results": {"type": "integer", "default": 5}
                },
                "required": ["query"]
            },
            capabilities=[ToolCapability.WEB_SEARCH],
            requires_approval=True,
            enabled=True
        )
        self._register_tool(tavily_tool)

        # Aliases: web_search, tavily_web_search
        for alias in ("web_search", "tavily_web_search"):
            alias_tool = StrandsTool(
                name=alias,
                description="Web search via Tavily (alias)",
                handler=_tav.tavily_search,
                input_schema=tavily_tool.input_schema,
                capabilities=[ToolCapability.WEB_SEARCH],
                requires_approval=True,
                enabled=True
            )
            self._register_tool(alias_tool)

        # File Operations Tools
        from app.services.enhanced_swarm_service import GLOBAL_VIRTUAL_FILES

        def file_write(path: str, content: str) -> Dict[str, Any]:
            """Write content to a virtual file"""
            GLOBAL_VIRTUAL_FILES[path] = content
            return {
                "success": True,
                "message": f"File written: {path}",
                "size": len(content)
            }

        file_write_tool = StrandsTool(
            name="file_write",
            description="Write content to a file",
            handler=file_write,
            input_schema={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path"},
                    "content": {"type": "string", "description": "File content"}
                },
                "required": ["path", "content"]
            },
            capabilities=[ToolCapability.FILE_OPERATIONS, ToolCapability.CODE_GENERATION],
            requires_approval=True
        )

        self._register_tool(file_write_tool)

        def file_read(path: str) -> Dict[str, Any]:
            """Read content from a virtual file"""
            if path in GLOBAL_VIRTUAL_FILES:
                return {
                    "success": True,
                    "content": GLOBAL_VIRTUAL_FILES[path]
                }
            return {
                "success": False,
                "error": f"File not found: {path}"
            }

        file_read_tool = StrandsTool(
            name="file_read",
            description="Read content from a file",
            handler=file_read,
            input_schema={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path"}
                },
                "required": ["path"]
            },
            capabilities=[ToolCapability.FILE_OPERATIONS],
            requires_approval=False
        )

        self._register_tool(file_read_tool)

        # Python REPL Tool
        import subprocess
        import tempfile
        
        def python_repl(code: str) -> Dict[str, Any]:
            """Execute Python code in a sandboxed environment"""
            try:
                # Create a temporary file for the code
                with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                    f.write(code)
                    temp_file = f.name
                
                # Execute the code with timeout
                result = subprocess.run(
                    ['python3', temp_file],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                # Clean up
                os.unlink(temp_file)
                
                return {
                    "success": True,
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "return_code": result.returncode
                }
            except subprocess.TimeoutExpired:
                return {
                    "success": False,
                    "error": "Code execution timed out after 30 seconds"
                }
            except Exception as e:
                return {
                    "success": False,
                    "error": str(e)
                }
        
        python_repl_tool = StrandsTool(
            name="python_repl",
            description="Execute Python code in a sandboxed environment",
            handler=python_repl,
            input_schema={
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "Python code to execute"}
                },
                "required": ["code"]
            },
            capabilities=[ToolCapability.CODE_EXECUTION],
            requires_approval=True
        )
        
        self._register_tool(python_repl_tool)
        
        # Calculator Tool
        def calculator(expression: str) -> Dict[str, Any]:
            """Evaluate mathematical expressions"""
            try:
                # Use eval safely for mathematical expressions only
                import ast
                import operator as op
                
                # Supported operators
                ops = {
                    ast.Add: op.add, ast.Sub: op.sub, ast.Mult: op.mul,
                    ast.Div: op.truediv, ast.Pow: op.pow, ast.BitXor: op.xor,
                    ast.USub: op.neg, ast.Mod: op.mod
                }
                
                def eval_expr(expr):
                    return eval(expr, {"__builtins__": {}}, {})
                
                result = eval_expr(expression)
                return {
                    "success": True,
                    "result": result,
                    "expression": expression
                }
            except Exception as e:
                return {
                    "success": False,
                    "error": f"Invalid expression: {str(e)}"
                }
        
        calculator_tool = StrandsTool(
            name="calculator",
            description="Perform mathematical calculations",
            handler=calculator,
            input_schema={
                "type": "object",
                "properties": {
                    "expression": {"type": "string", "description": "Mathematical expression to evaluate"}
                },
                "required": ["expression"]
            },
            capabilities=[ToolCapability.DATA_ANALYSIS],
            requires_approval=False
        )
        
        self._register_tool(calculator_tool)

        # -------- Additional Safe, Local Tools --------
        # Current Time Tool
        def current_time(timezone: str = "UTC") -> Dict[str, Any]:
            """Get the current time. Timezone supports 'UTC' or 'local'."""
            now = datetime.utcnow() if (timezone or '').upper() == 'UTC' else datetime.now()
            return {
                "success": True,
                "timezone": (timezone or 'UTC').upper(),
                "iso": now.isoformat() + ("Z" if (timezone or '').upper() == 'UTC' else "")
            }

        current_time_tool = StrandsTool(
            name="current_time",
            description="Get the current time in UTC or local timezone",
            handler=current_time,
            input_schema={
                "type": "object",
                "properties": {
                    "timezone": {"type": "string", "enum": ["UTC", "local"], "default": "UTC"}
                }
            },
            capabilities=[ToolCapability.TESTING],
            requires_approval=False
        )
        self._register_tool(current_time_tool)

        # Sleep Tool
        def sleep(seconds: int = 1) -> Dict[str, Any]:
            """Pause execution for a few seconds (blocking)."""
            import time as _time
            s = max(0, int(seconds or 0))
            s = min(s, 5)  # cap to 5 seconds for safety
            _time.sleep(s)
            return {"success": True, "slept": s}

        sleep_tool = StrandsTool(
            name="sleep",
            description="Pause execution for a limited number of seconds",
            handler=sleep,
            input_schema={
                "type": "object",
                "properties": {
                    "seconds": {"type": "integer", "default": 1}
                }
            },
            capabilities=[ToolCapability.TESTING],
            requires_approval=False
        )
        self._register_tool(sleep_tool)

        # Environment Tool (read-only)
        def environment(key: str, default: str = "") -> Dict[str, Any]:
            """Read an environment variable (read-only)."""
            return {"success": True, "key": key, "value": os.getenv(key, default)}

        environment_tool = StrandsTool(
            name="environment",
            description="Read environment variables (read-only)",
            handler=environment,
            input_schema={
                "type": "object",
                "properties": {
                    "key": {"type": "string", "description": "Environment variable name"},
                    "default": {"type": "string", "description": "Default value if not set", "default": ""}
                },
                "required": ["key"]
            },
            capabilities=[ToolCapability.TESTING],
            requires_approval=False
        )
        self._register_tool(environment_tool)

        # System Info Tool
        def system_info() -> Dict[str, Any]:
            """Get basic system information."""
            import platform, sys
            return {
                "success": True,
                "platform": platform.system(),
                "platform_release": platform.release(),
                "machine": platform.machine(),
                "python_version": platform.python_version(),
                "implementation": platform.python_implementation(),
                "executable": sys.executable
            }

        system_info_tool = StrandsTool(
            name="system_info",
            description="Get basic system information",
            handler=system_info,
            input_schema={"type": "object", "properties": {}},
            capabilities=[ToolCapability.TESTING],
            requires_approval=False
        )
        self._register_tool(system_info_tool)

        # In-memory Journal
        GLOBAL_JOURNAL: List[Dict[str, Any]] = []

        def journal(entry: str, tags: List[str] = None) -> Dict[str, Any]:
            """Append a journal entry to an in-memory log."""
            item = {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "entry": entry,
                "tags": tags or []
            }
            GLOBAL_JOURNAL.append(item)
            return {"success": True, "count": len(GLOBAL_JOURNAL), "last": item}

        journal_tool = StrandsTool(
            name="journal",
            description="Write a journal entry to in-memory log",
            handler=journal,
            input_schema={
                "type": "object",
                "properties": {
                    "entry": {"type": "string"},
                    "tags": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["entry"]
            },
            capabilities=[ToolCapability.DOCUMENTATION],
            requires_approval=False
        )
        self._register_tool(journal_tool)

        # In-memory Key-Value Memory
        GLOBAL_MEMORY: Dict[str, str] = {}

        def memory(op: str, key: str = "", value: str = "") -> Dict[str, Any]:
            """In-memory key-value store. Ops: get, set, delete, list."""
            operation = (op or '').lower()
            if operation == 'set' and key:
                GLOBAL_MEMORY[key] = value
                return {"success": True, "op": "set", "key": key}
            elif operation == 'get' and key:
                return {"success": True, "op": "get", "key": key, "value": GLOBAL_MEMORY.get(key)}
            elif operation == 'delete' and key:
                existed = key in GLOBAL_MEMORY
                GLOBAL_MEMORY.pop(key, None)
                return {"success": True, "op": "delete", "key": key, "existed": existed}
            elif operation == 'list':
                return {"success": True, "op": "list", "keys": list(GLOBAL_MEMORY.keys())}
            return {"success": False, "error": "Invalid operation or key"}

        memory_tool = StrandsTool(
            name="memory",
            description="Simple in-memory key-value store",
            handler=memory,
            input_schema={
                "type": "object",
                "properties": {
                    "op": {"type": "string", "enum": ["get", "set", "delete", "list"]},
                    "key": {"type": "string"},
                    "value": {"type": "string"}
                },
                "required": ["op"]
            },
            capabilities=[ToolCapability.AI_TOOLS],
            requires_approval=False
        )
        self._register_tool(memory_tool)

        # Task Planner (deterministic)
        def task_planner(goal: str) -> Dict[str, Any]:
            """Create a simple step-by-step plan for a goal (heuristic)."""
            goal_clean = (goal or '').strip()
            steps = [
                "Clarify requirements",
                "Identify resources and constraints",
                "Break down into tasks",
                "Execute tasks in order",
                "Validate output and iterate"
            ]
            return {"success": True, "goal": goal_clean, "steps": steps}

        task_planner_tool = StrandsTool(
            name="task_planner",
            description="Create a simple task plan for a goal",
            handler=task_planner,
            input_schema={
                "type": "object",
                "properties": {
                    "goal": {"type": "string"}
                },
                "required": ["goal"]
            },
            capabilities=[ToolCapability.PROJECT_MANAGEMENT],
            requires_approval=False
        )
        self._register_tool(task_planner_tool)

        # Agent TODO list (in-memory)
        GLOBAL_TODO: List[str] = []

        def agent_todo(action: str, item: str = "") -> Dict[str, Any]:
            """Manage a simple in-memory TODO list: add, list, clear."""
            a = (action or '').lower()
            if a == 'add' and item:
                GLOBAL_TODO.append(item)
                return {"success": True, "action": "add", "count": len(GLOBAL_TODO)}
            if a == 'list':
                return {"success": True, "action": "list", "items": list(GLOBAL_TODO)}
            if a == 'clear':
                GLOBAL_TODO.clear()
                return {"success": True, "action": "clear", "count": 0}
            return {"success": False, "error": "Invalid action or item"}

        agent_todo_tool = StrandsTool(
            name="agent_todo",
            description="Manage a simple in-memory TODO list",
            handler=agent_todo,
            input_schema={
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["add", "list", "clear"]},
                    "item": {"type": "string"}
                },
                "required": ["action"]
            },
            capabilities=[ToolCapability.PROJECT_MANAGEMENT],
            requires_approval=False
        )
        self._register_tool(agent_todo_tool)

        # Diagram tool (mermaid text output)
        def diagram(description: str) -> Dict[str, Any]:
            """Generate a simple Mermaid flowchart from a description (placeholder)."""
            desc = (description or 'process').replace('\n', ' ')
            mermaid = f"flowchart TD\n  A[Start] --> B[{desc}]\n  B --> C[End]"
            return {"success": True, "format": "mermaid", "diagram": mermaid}

        diagram_tool = StrandsTool(
            name="diagram",
            description="Generate a simple Mermaid diagram string",
            handler=diagram,
            input_schema={
                "type": "object",
                "properties": {
                    "description": {"type": "string"}
                },
                "required": ["description"]
            },
            capabilities=[ToolCapability.DOCUMENTATION],
            requires_approval=False
        )
        self._register_tool(diagram_tool)
        
        # Code Generator Tool (placeholder that uses file_write)
        def code_generator(language: str, description: str, filename: str) -> Dict[str, Any]:
            """Generate code based on description"""
            code_templates = {
                "python": f"# {description}\n\ndef main():\n    # TODO: Implement {description}\n    pass\n\nif __name__ == '__main__':\n    main()",
                "javascript": f"// {description}\n\nfunction main() {{\n    // TODO: Implement {description}\n}}\n\nmain();",
                "html": f"<!DOCTYPE html>\n<html>\n<head>\n    <title>{description}</title>\n</head>\n<body>\n    <h1>{description}</h1>\n    <!-- TODO: Implement -->\n</body>\n</html>"
            }
            
            code = code_templates.get(language.lower(), f"// {description}\n// TODO: Implement")
            
            # Use file_write to save the code
            GLOBAL_VIRTUAL_FILES[filename] = code
            
            return {
                "success": True,
                "message": f"Generated {language} code for: {description}",
                "filename": filename,
                "code": code
            }
        
        code_generator_tool = StrandsTool(
            name="code_generator",
            description="Generate code templates and boilerplate",
            handler=code_generator,
            input_schema={
                "type": "object",
                "properties": {
                    "language": {"type": "string", "description": "Programming language"},
                    "description": {"type": "string", "description": "What the code should do"},
                    "filename": {"type": "string", "description": "Output filename"}
                },
                "required": ["language", "description", "filename"]
            },
            capabilities=[ToolCapability.CODE_GENERATION],
            requires_approval=False
        )
        
        self._register_tool(code_generator_tool)
        
        # HTTP Request Tool (GET only, safe)
        import requests
        def http_request(method: str, url: str, headers: Dict[str, Any] = None) -> Dict[str, Any]:
            """Make a simple HTTP GET/HEAD request with timeout. Only https/http allowed."""
            try:
                m = (method or 'GET').upper()
                if m not in ('GET', 'HEAD'):
                    return {"success": False, "error": f"Method {m} not allowed"}
                if not isinstance(url, str) or not url.startswith(('http://', 'https://')):
                    return {"success": False, "error": "Only http(s) URLs are supported"}
                resp = requests.request(m, url, headers=headers or {}, timeout=10)
                limited_text = resp.text if len(resp.text) <= 20000 else resp.text[:20000] + "..."
                return {
                    "success": True,
                    "status": resp.status_code,
                    "headers": dict(resp.headers),
                    "text": limited_text
                }
            except Exception as e:
                return {"success": False, "error": str(e)}

        http_request_tool = StrandsTool(
            name="http_request",
            description="Make a simple HTTP GET/HEAD request",
            handler=http_request,
            input_schema={
                "type": "object",
                "properties": {
                    "method": {"type": "string", "enum": ["GET", "HEAD"], "default": "GET"},
                    "url": {"type": "string"},
                    "headers": {"type": "object"}
                },
                "required": ["url"]
            },
            capabilities=[ToolCapability.WEB_SEARCH],
            requires_approval=False
        )
        self._register_tool(http_request_tool)

        # Shell Command Tool (safer version)
        def shell_command(command: str) -> Dict[str, Any]:
            """Execute shell commands (limited to safe commands)"""
            # Whitelist of safe commands
            safe_commands = ['ls', 'pwd', 'date', 'echo', 'cat', 'grep', 'find', 'which']
            
            cmd_parts = command.split()
            if not cmd_parts or cmd_parts[0] not in safe_commands:
                return {
                    "success": False,
                    "error": f"Command '{cmd_parts[0] if cmd_parts else ''}' is not in the safe command list"
                }
            
            try:
                result = subprocess.run(
                    command,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                return {
                    "success": True,
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "return_code": result.returncode
                }
            except subprocess.TimeoutExpired:
                return {
                    "success": False,
                    "error": "Command timed out after 10 seconds"
                }
            except Exception as e:
                return {
                    "success": False,
                    "error": str(e)
                }
        
        shell_tool = StrandsTool(
            name="shell",
            description="Execute safe shell commands",
            handler=shell_command,
            input_schema={
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Shell command to execute"}
                },
                "required": ["command"]
            },
            capabilities=[ToolCapability.CODE_EXECUTION],
            requires_approval=True
        )
        
        self._register_tool(shell_tool)

        # Wikipedia Search Tool
        def wikipedia_search(query: str, lang: str = "en") -> Dict[str, Any]:
            """Search Wikipedia and return summary + top matches (no API key)."""
            try:
                if not query:
                    return {"success": False, "error": "query is required"}
                api = f"https://{lang}.wikipedia.org/w/api.php"
                params = {
                    "action": "opensearch",
                    "search": query,
                    "limit": 5,
                    "namespace": 0,
                    "format": "json"
                }
                r = requests.get(api, params=params, timeout=10)
                r.raise_for_status()
                data = r.json()
                titles = data[1] if isinstance(data, list) and len(data) > 1 else []
                urls = data[3] if isinstance(data, list) and len(data) > 3 else []
                summary = None
                if titles:
                    summ_api = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{titles[0]}"
                    sr = requests.get(summ_api, timeout=10)
                    if sr.ok:
                        sj = sr.json()
                        summary = sj.get("extract")
                results = [{"title": t, "url": urls[i] if i < len(urls) else None} for i, t in enumerate(titles)]
                return {"success": True, "query": query, "summary": summary, "results": results}
            except Exception as e:
                return {"success": False, "error": str(e)}

        wikipedia_tool = StrandsTool(
            name="wikipedia_search",
            description="Search Wikipedia and get a summary",
            handler=wikipedia_search,
            input_schema={
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "lang": {"type": "string", "default": "en"}
                },
                "required": ["query"]
            },
            capabilities=[ToolCapability.WEB_SEARCH],
            requires_approval=False
        )
        self._register_tool(wikipedia_tool)

        # Fetch webpage and extract simple text
        from html.parser import HTMLParser
        class _TextExtractor(HTMLParser):
            def __init__(self):
                super().__init__()
                self.in_script = False
                self.in_style = False
                self.text: List[str] = []
            def handle_starttag(self, tag, attrs):
                if tag in ("script", "style"):
                    if tag == "script":
                        self.in_script = True
                    else:
                        self.in_style = True
            def handle_endtag(self, tag):
                if tag == "script":
                    self.in_script = False
                if tag == "style":
                    self.in_style = False
            def handle_data(self, data):
                if not (self.in_script or self.in_style):
                    s = data.strip()
                    if s:
                        self.text.append(s)

        def fetch_webpage(url: str) -> Dict[str, Any]:
            """Fetch a webpage and return title + extracted text (best-effort)."""
            try:
                if not url or not url.startswith(("http://", "https://")):
                    return {"success": False, "error": "Provide a valid http(s) URL"}
                resp = requests.get(url, timeout=15, headers={"User-Agent": "ThrivixBot/1.0"})
                resp.raise_for_status()
                html = resp.text
                # Get title
                title = None
                try:
                    start = html.lower().find("<title>")
                    end = html.lower().find("</title>")
                    if start != -1 and end != -1:
                        title = html[start+7:end].strip()
                except Exception:
                    title = None
                # Extract text
                parser = _TextExtractor()
                parser.feed(html)
                text = "\n".join(parser.text)
                if len(text) > 20000:
                    text = text[:20000] + "..."
                return {"success": True, "url": url, "title": title, "text": text}
            except Exception as e:
                return {"success": False, "error": str(e)}

        fetch_webpage_tool = StrandsTool(
            name="fetch_webpage",
            description="Fetch a webpage and extract readable text",
            handler=fetch_webpage,
            input_schema={
                "type": "object",
                "properties": {"url": {"type": "string"}},
                "required": ["url"]
            },
            capabilities=[ToolCapability.WEB_SEARCH],
            requires_approval=False
        )
        self._register_tool(fetch_webpage_tool)

        # Extract links from a URL
        class _LinkParser(HTMLParser):
            def __init__(self):
                super().__init__()
                self.links: List[str] = []
            def handle_starttag(self, tag, attrs):
                if tag == 'a':
                    for k, v in attrs:
                        if k == 'href' and isinstance(v, str):
                            self.links.append(v)

        def extract_links(url: str) -> Dict[str, Any]:
            try:
                if not url or not url.startswith(("http://", "https://")):
                    return {"success": False, "error": "Provide a valid http(s) URL"}
                resp = requests.get(url, timeout=15, headers={"User-Agent": "ThrivixBot/1.0"})
                resp.raise_for_status()
                parser = _LinkParser()
                parser.feed(resp.text)
                return {"success": True, "url": url, "count": len(parser.links), "links": parser.links[:200]}
            except Exception as e:
                return {"success": False, "error": str(e)}

        extract_links_tool = StrandsTool(
            name="extract_links",
            description="Extract hyperlinks from a webpage",
            handler=extract_links,
            input_schema={
                "type": "object",
                "properties": {"url": {"type": "string"}},
                "required": ["url"]
            },
            capabilities=[ToolCapability.WEB_SEARCH],
            requires_approval=False
        )
        self._register_tool(extract_links_tool)

        # RSS Fetch
        import xml.etree.ElementTree as ET
        def rss_fetch(url: str, limit: int = 10) -> Dict[str, Any]:
            try:
                if not url or not url.startswith(("http://", "https://")):
                    return {"success": False, "error": "Provide a valid http(s) URL"}
                resp = requests.get(url, timeout=15, headers={"User-Agent": "ThrivixBot/1.0"})
                resp.raise_for_status()
                items = []
                try:
                    root = ET.fromstring(resp.text)
                    for item in root.iterfind('.//item'):
                        title = (item.findtext('title') or '').strip()
                        link = (item.findtext('link') or '').strip()
                        pub = (item.findtext('pubDate') or '').strip()
                        items.append({"title": title, "link": link, "pubDate": pub})
                        if len(items) >= max(1, min(limit, 50)):
                            break
                except Exception:
                    return {"success": False, "error": "Invalid or unsupported RSS/Atom feed"}
                return {"success": True, "count": len(items), "items": items}
            except Exception as e:
                return {"success": False, "error": str(e)}

        rss_tool = StrandsTool(
            name="rss_fetch",
            description="Fetch and parse an RSS feed",
            handler=rss_fetch,
            input_schema={
                "type": "object",
                "properties": {"url": {"type": "string"}, "limit": {"type": "integer", "default": 10}},
                "required": ["url"]
            },
            capabilities=[ToolCapability.WEB_SEARCH],
            requires_approval=False
        )
        self._register_tool(rss_tool)

        # Sitemap Fetch
        def sitemap_fetch(url: str, limit: int = 100) -> Dict[str, Any]:
            try:
                if not url:
                    return {"success": False, "error": "url is required"}
                if not url.endswith(('sitemap.xml', '.xml')):
                    return {"success": False, "error": "Provide a sitemap.xml URL"}
                resp = requests.get(url, timeout=15)
                resp.raise_for_status()
                root = ET.fromstring(resp.text)
                ns = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
                urls = [loc.text for loc in root.findall('.//sm:url/sm:loc', ns) if loc is not None]
                return {"success": True, "count": len(urls), "urls": urls[:max(1, min(limit, 1000))]}
            except Exception as e:
                return {"success": False, "error": str(e)}

        sitemap_tool = StrandsTool(
            name="sitemap_fetch",
            description="Fetch and parse a sitemap.xml",
            handler=sitemap_fetch,
            input_schema={
                "type": "object",
                "properties": {"url": {"type": "string"}, "limit": {"type": "integer", "default": 100}},
                "required": ["url"]
            },
            capabilities=[ToolCapability.WEB_SEARCH],
            requires_approval=False
        )
        self._register_tool(sitemap_tool)

        # JSON Parse
        def json_parse(text: str) -> Dict[str, Any]:
            try:
                obj = json.loads(text)
                return {"success": True, "type": type(obj).__name__, "keys": list(obj.keys()) if isinstance(obj, dict) else None}
            except Exception as e:
                return {"success": False, "error": str(e)}

        json_parse_tool = StrandsTool(
            name="json_parse",
            description="Parse JSON and return basic info",
            handler=json_parse,
            input_schema={"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]},
            capabilities=[ToolCapability.DATA_ANALYSIS],
            requires_approval=False
        )
        self._register_tool(json_parse_tool)

        # CSV Preview
        import csv
        from io import StringIO
        def csv_preview(text: str, limit: int = 5) -> Dict[str, Any]:
            try:
                reader = csv.reader(StringIO(text))
                rows = []
                for i, row in enumerate(reader):
                    rows.append(row)
                    if i + 1 >= max(1, min(limit, 100)):
                        break
                return {"success": True, "rows": rows, "columns": len(rows[0]) if rows else 0}
            except Exception as e:
                return {"success": False, "error": str(e)}

        csv_preview_tool = StrandsTool(
            name="csv_preview",
            description="Parse CSV text and return first rows",
            handler=csv_preview,
            input_schema={
                "type": "object",
                "properties": {"text": {"type": "string"}, "limit": {"type": "integer", "default": 5}},
                "required": ["text"]
            },
            capabilities=[ToolCapability.DATA_ANALYSIS],
            requires_approval=False
        )
        self._register_tool(csv_preview_tool)

        # Virtual file utilities: list_files, delete_file
        def list_files(prefix: str = "") -> Dict[str, Any]:
            try:
                from app.services.enhanced_swarm_service import GLOBAL_VIRTUAL_FILES
                items = sorted([p for p in GLOBAL_VIRTUAL_FILES.keys() if p.startswith(prefix or "")])
                return {"success": True, "count": len(items), "paths": items}
            except Exception as e:
                return {"success": False, "error": str(e)}

        list_files_tool = StrandsTool(
            name="list_files",
            description="List virtual files by prefix",
            handler=list_files,
            input_schema={"type": "object", "properties": {"prefix": {"type": "string"}}},
            capabilities=[ToolCapability.FILE_OPERATIONS],
            requires_approval=False
        )
        self._register_tool(list_files_tool)

        def delete_file(path: str) -> Dict[str, Any]:
            try:
                from app.services.enhanced_swarm_service import GLOBAL_VIRTUAL_FILES
                existed = path in GLOBAL_VIRTUAL_FILES
                GLOBAL_VIRTUAL_FILES.pop(path, None)
                return {"success": True, "deleted": existed, "path": path}
            except Exception as e:
                return {"success": False, "error": str(e)}

        delete_file_tool = StrandsTool(
            name="delete_file",
            description="Delete a virtual file",
            handler=delete_file,
            input_schema={"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]},
            capabilities=[ToolCapability.FILE_OPERATIONS],
            requires_approval=True
        )
        self._register_tool(delete_file_tool)

        # -------- Strands Agents Category Tools --------
        # Simple, testable implementations to support Agents workflows

        # Think tool
        def think(thought: str, cycle_count: int = 1, approach: str = "analytical") -> Dict[str, Any]:
            summary = (thought or '').strip()
            return {"success": True, "approach": approach, "cycles": max(1, int(cycle_count or 1)), "summary": summary[:500]}

        self._register_tool(StrandsTool(
            name="think",
            description="Internal reasoning helper that structures thoughts",
            handler=think,
            input_schema={
                "type": "object",
                "properties": {
                    "thought": {"type": "string"},
                    "cycle_count": {"type": "integer", "default": 1},
                    "approach": {"type": "string", "default": "analytical"}
                },
                "required": ["thought"]
            },
            capabilities=[ToolCapability.AI_TOOLS],
            requires_approval=False
        ))

        # use_llm (simulated)
        def use_llm(prompt: str, system_prompt: str = "", model: str = "gpt-4o-mini", temperature: float = 0.7) -> Dict[str, Any]:
            if not prompt:
                return {"success": False, "error": "prompt is required"}
            return {"success": True, "model": model, "temperature": temperature, "completion": f"[Simulated completion] {prompt[:200]}"}

        self._register_tool(StrandsTool(
            name="use_llm",
            description="Call an LLM with a prompt (simulated)",
            handler=use_llm,
            input_schema={
                "type": "object",
                "properties": {
                    "prompt": {"type": "string"},
                    "system_prompt": {"type": "string"},
                    "model": {"type": "string", "default": "gpt-4o-mini"},
                    "temperature": {"type": "number", "default": 0.7}
                },
                "required": ["prompt"]
            },
            capabilities=[ToolCapability.AI_TOOLS],
            requires_approval=False
        ))

        # agent_as_tool (stub)
        def agent_as_tool(agent_name: str, input: Any) -> Dict[str, Any]:
            return {"success": True, "agent": agent_name, "processed": True, "input_preview": str(input)[:300]}

        self._register_tool(StrandsTool(
            name="agent_as_tool",
            description="Use an agent as a callable tool (stub)",
            handler=agent_as_tool,
            input_schema={
                "type": "object",
                "properties": {
                    "agent_name": {"type": "string"},
                    "input": {}
                },
                "required": ["agent_name", "input"]
            },
            capabilities=[ToolCapability.PROJECT_MANAGEMENT],
            requires_approval=False
        ))

        # agent (stub)
        def agent(name: str, role: str, goal: str, tools: List[str] = None) -> Dict[str, Any]:
            plan = ["Clarify goal", "Identify tools", "Execute", "Validate"]
            return {"success": True, "name": name, "role": role, "goal": goal, "tools": tools or [], "plan": plan}

        self._register_tool(StrandsTool(
            name="agent",
            description="Create a simple agent plan (stub)",
            handler=agent,
            input_schema={
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "role": {"type": "string"},
                    "goal": {"type": "string"},
                    "tools": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["name", "role", "goal"]
            },
            capabilities=[ToolCapability.PROJECT_MANAGEMENT],
            requires_approval=False
        ))

        # swarm (stub)
        def swarm(agents: List[Dict[str, Any]], task: str) -> Dict[str, Any]:
            assignments = [{"agent": a.get("name"), "task": task} for a in (agents or [])]
            return {"success": True, "task": task, "agents": [a.get("name") for a in agents or []], "assignments": assignments}

        self._register_tool(StrandsTool(
            name="swarm",
            description="Coordinate multiple agents (stub)",
            handler=swarm,
            input_schema={
                "type": "object",
                "properties": {
                    "agents": {"type": "array", "items": {"type": "object"}},
                    "task": {"type": "string"}
                },
                "required": ["agents", "task"]
            },
            capabilities=[ToolCapability.PROJECT_MANAGEMENT],
            requires_approval=False
        ))

        # load_tool (query registry)
        def load_tool(name: str) -> Dict[str, Any]:
            t = self.tools.get(name)
            if not t:
                return {"success": False, "error": f"Tool '{name}' not found"}
            return {"success": True, "name": name, "schema": t.input_schema, "requires_approval": t.requires_approval}

        self._register_tool(StrandsTool(
            name="load_tool",
            description="Load tool metadata from registry",
            handler=load_tool,
            input_schema={"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]},
            capabilities=[ToolCapability.TESTING],
            requires_approval=False
        ))

        # agent_graph (generate mermaid)
        def agent_graph(description: str) -> Dict[str, Any]:
            desc = (description or 'process').replace('\n', ' ')
            mermaid = f"flowchart TD\n  A[Agent] --> B[{desc}]\n  B --> C[Decision]\n  C -->|Yes| D[Action]\n  C -->|No| E[Handoff]"
            return {"success": True, "format": "mermaid", "diagram": mermaid}

        self._register_tool(StrandsTool(
            name="agent_graph",
            description="Generate a simple agent graph diagram",
            handler=agent_graph,
            input_schema={"type": "object", "properties": {"description": {"type": "string"}}, "required": ["description"]},
            capabilities=[ToolCapability.DOCUMENTATION],
            requires_approval=False
        ))

        # handoff_to_user
        def handoff_to_user(message: str, breakout_of_loop: bool = False) -> Dict[str, Any]:
            return {"success": True, "message": message, "breakout_of_loop": bool(breakout_of_loop)}

        self._register_tool(StrandsTool(
            name="handoff_to_user",
            description="Request user input or hand off control",
            handler=handoff_to_user,
            input_schema={
                "type": "object",
                "properties": {"message": {"type": "string"}, "breakout_of_loop": {"type": "boolean", "default": False}},
                "required": ["message"]
            },
            capabilities=[ToolCapability.COMMUNICATION],
            requires_approval=False
        ))

        # agent_core_memory (separate namespace)
        CORE_MEMORY: Dict[str, str] = {}
        def agent_core_memory(action: str, key: str = "", value: str = "") -> Dict[str, Any]:
            a = (action or '').lower()
            if a == 'set' and key:
                CORE_MEMORY[key] = value
                return {"success": True, "action": "set", "key": key}
            if a == 'get' and key:
                return {"success": True, "action": "get", "key": key, "value": CORE_MEMORY.get(key)}
            if a == 'list':
                return {"success": True, "action": "list", "keys": list(CORE_MEMORY.keys())}
            if a == 'delete' and key:
                existed = key in CORE_MEMORY
                CORE_MEMORY.pop(key, None)
                return {"success": True, "action": "delete", "key": key, "existed": existed}
            return {"success": False, "error": "Invalid action or key"}

        self._register_tool(StrandsTool(
            name="agent_core_memory",
            description="Core memory store for agents (in-memory)",
            handler=agent_core_memory,
            input_schema={
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["get", "set", "delete", "list"]},
                    "key": {"type": "string"},
                    "value": {"type": "string"}
                },
                "required": ["action"]
            },
            capabilities=[ToolCapability.AI_TOOLS],
            requires_approval=False
        ))

        # code_interpreter (alias to python_repl)
        def code_interpreter(code: str) -> Dict[str, Any]:
            py = self.tools.get("python_repl")
            if not py:
                return {"success": False, "error": "python_repl not available"}
            return py.handler(code=code)

        self._register_tool(StrandsTool(
            name="code_interpreter",
            description="Execute code using the Python interpreter",
            handler=code_interpreter,
            input_schema={"type": "object", "properties": {"code": {"type": "string"}}, "required": ["code"]},
            capabilities=[ToolCapability.CODE_EXECUTION],
            requires_approval=True
        ))

        # tavily_map (search wrapper)
        def tavily_map(query: str, max_results: int = 5) -> Dict[str, Any]:
            try:
                from app.tools.strands_tavily_search import tavily_search
                return tavily_search(query=query, search_depth="basic", max_results=max_results)
            except Exception as e:
                return {"success": False, "error": str(e)}

        self._register_tool(StrandsTool(
            name="tavily_map",
            description="Tavily quick search (basic depth)",
            handler=tavily_map,
            input_schema={"type": "object", "properties": {"query": {"type": "string"}, "max_results": {"type": "integer", "default": 5}}, "required": ["query"]},
            capabilities=[ToolCapability.WEB_SEARCH],
            requires_approval=True
        ))

        # tavily_extract (by URL via fetch_webpage)
        def tavily_extract(url: str) -> Dict[str, Any]:
            return fetch_webpage(url)

        self._register_tool(StrandsTool(
            name="tavily_extract",
            description="Extract readable text from a URL",
            handler=tavily_extract,
            input_schema={"type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"]},
            capabilities=[ToolCapability.WEB_SEARCH],
            requires_approval=False
        ))

        # tavily_crawl (limited breadth-first)
        def tavily_crawl(start_url: str, max_pages: int = 3) -> Dict[str, Any]:
            try:
                visited = []
                queue = [start_url]
                pages = []
                count = 0
                while queue and count < max(1, min(max_pages, 5)):
                    url = queue.pop(0)
                    if url in visited:
                        continue
                    visited.append(url)
                    page = fetch_webpage(url)
                    if page.get("success"):
                        pages.append({
                            "url": url,
                            "title": page.get("title"),
                            "text_preview": (page.get("text") or "")[:500]
                        })
                        # enqueue links from this page (same host only best-effort)
                        links = extract_links(url)
                        if links.get("success"):
                            for link in links.get("links", [])[:10]:
                                if link.startswith("http") and link not in visited and link not in queue:
                                    queue.append(link)
                    count += 1
                return {"success": True, "pages": pages, "count": len(pages)}
            except Exception as e:
                return {"success": False, "error": str(e)}

        self._register_tool(StrandsTool(
            name="tavily_crawl",
            description="Crawl a site starting at a URL (limited)",
            handler=tavily_crawl,
            input_schema={"type": "object", "properties": {"start_url": {"type": "string"}, "max_pages": {"type": "integer", "default": 3}}, "required": ["start_url"]},
            capabilities=[ToolCapability.WEB_SEARCH],
            requires_approval=False
        ))

        # AWS Tools integration (use_aws, retrieve)
        try:
            from app.tools.aws_tools import use_aws as use_aws_handler, retrieve as retrieve_handler, USE_AWS_SPEC, RETRIEVE_SPEC

            use_aws_tool = StrandsTool(
                name="use_aws",
                description=USE_AWS_SPEC.get("description", "Interact with AWS services"),
                handler=use_aws_handler,
                input_schema=USE_AWS_SPEC.get("input_schema", {}),
                capabilities=[ToolCapability.DEPLOYMENT, ToolCapability.API_INTERACTION],
                requires_approval=True,
                is_async=True
            )
            self._register_tool(use_aws_tool)

            retrieve_tool = StrandsTool(
                name="retrieve",
                description=RETRIEVE_SPEC.get("description", "Advanced retrieval"),
                handler=retrieve_handler,
                input_schema=RETRIEVE_SPEC.get("input_schema", {}),
                capabilities=[ToolCapability.DATA_ANALYSIS, ToolCapability.AI_TOOLS],
                requires_approval=False,
                is_async=True
            )
            self._register_tool(retrieve_tool)
        except Exception as e:
            logger.warning(f"AWS tools not available: {e}")

    async def _discover_mcp_tools(self):
        """Discover and register MCP tools from configured servers"""
        # This will connect to MCP servers and discover their tools
        # For now, we'll skip this as it requires MCP server setup
        pass

    async def _load_configured_tools(self):
        """Load tools from configuration file or database"""
        # This would load tools from a configuration source
        # For now, we'll use the built-in tools
        pass

    def _register_tool(self, tool: StrandsTool):
        """Register a tool and update capability mappings"""
        self.tools[tool.name] = tool

        # Update capability mappings
        for capability in tool.capabilities:
            if capability not in self.capability_map:
                self.capability_map[capability] = []
            if tool.name not in self.capability_map[capability]:
                self.capability_map[capability].append(tool.name)

        logger.info(f"Registered tool: {tool.name} with capabilities: {[c.value for c in tool.capabilities]}")

    def get_available_tools(self,
                           capabilities: Optional[List[ToolCapability]] = None,
                           enabled_only: bool = True) -> Dict[str, StrandsTool]:
        """
        Get available tools, optionally filtered by capabilities

        Args:
            capabilities: List of required capabilities
            enabled_only: Only return enabled tools

        Returns:
            Dictionary of tool name to StrandsTool
        """
        result = {}

        if capabilities:
            # Get tools that match ANY of the required capabilities
            tool_names = set()
            for capability in capabilities:
                if capability in self.capability_map:
                    tool_names.update(self.capability_map[capability])

            for name in tool_names:
                tool = self.tools.get(name)
                if tool and (not enabled_only or tool.enabled):
                    result[name] = tool
        else:
            # Return all tools
            for name, tool in self.tools.items():
                if not enabled_only or tool.enabled:
                    result[name] = tool

        return result

    def get_tools_for_capabilities(self, capabilities: List[str]) -> List[Dict[str, Any]]:
        """
        Get tools that match the given capability strings

        Args:
            capabilities: List of capability strings (from orchestrator)

        Returns:
            List of tool information dictionaries
        """
        # Convert string capabilities to enum
        enum_capabilities = []
        for cap_str in capabilities:
            try:
                # Map orchestrator capability strings to our enums
                capability_mapping = {
                    "file_operations": ToolCapability.FILE_OPERATIONS,
                    "code_generation": ToolCapability.CODE_GENERATION,
                    "web_search": ToolCapability.WEB_SEARCH,
                    "data_analysis": ToolCapability.DATA_ANALYSIS,
                    "api_interaction": ToolCapability.API_INTERACTION,
                    "documentation": ToolCapability.DOCUMENTATION,
                    "testing": ToolCapability.TESTING,
                    "database": ToolCapability.DATABASE,
                    "deployment": ToolCapability.DEPLOYMENT,
                    "monitoring": ToolCapability.MONITORING,
                    "communication": ToolCapability.COMMUNICATION,
                    "ai_tools": ToolCapability.AI_TOOLS,
                    "project_management": ToolCapability.PROJECT_MANAGEMENT
                }

                if cap_str in capability_mapping:
                    enum_capabilities.append(capability_mapping[cap_str])
            except Exception:
                logger.warning(f"Unknown capability: {cap_str}")

        # Get matching tools
        tools = self.get_available_tools(capabilities=enum_capabilities)

        # Convert to list of tool info
        return [tool.to_dict() for tool in tools.values()]

    def get_tool_names_for_capabilities(self, capabilities: List[str]) -> List[str]:
        """Get just the tool names for given capabilities"""
        tools = self.get_tools_for_capabilities(capabilities)
        return [tool["name"] for tool in tools]

    async def execute_tool(self, name: str, parameters: Dict[str, Any], agent_name: Optional[str] = None) -> Dict[str, Any]:
        """Execute a tool by name with configuration checks"""
        tool = self.tools.get(name)
        if not tool:
            return {
                "success": False,
                "error": f"Tool '{name}' not found",
                "available_tools": list(self.tools.keys())
            }

        # Check with tool config service if available
        if self.tool_config_service:
            tool_config = await self.tool_config_service.get_tool(name)
            if tool_config:
                # Check if tool is enabled
                if not tool_config.enabled:
                    return {
                        "success": False,
                        "error": f"Tool '{name}' is disabled in configuration"
                    }

                # Check agent permissions if agent_name provided
                if agent_name and not self.tool_config_service.is_tool_allowed_for_agent(name, agent_name):
                    return {
                        "success": False,
                        "error": f"Tool '{name}' is not allowed for agent '{agent_name}'"
                    }

                # Update tool usage count
                tool_config.usage_count += 1
                tool_config.last_used = datetime.utcnow()
        else:
            # Fallback to tool's own enabled state
            if not tool.enabled:
                return {
                    "success": False,
                    "error": f"Tool '{name}' is disabled"
                }

        try:
            if tool.is_async:
                result = await tool.handler(**parameters)
            else:
                result = tool.handler(**parameters)
            return result
        except Exception as e:
            logger.error(f"Tool execution error for {name}: {e}")

            # Update error count if config service available
            if self.tool_config_service:
                tool_config = await self.tool_config_service.get_tool(name)
                if tool_config:
                    tool_config.error_count += 1
                    tool_config.last_error = str(e)

            return {
                "success": False,
                "error": str(e)
            }

    def get_all_capabilities(self) -> List[str]:
        """Get all available capability strings"""
        return [cap.value for cap in ToolCapability]

    def get_tool_info(self) -> List[Dict[str, Any]]:
        """Get information about all available tools"""
        return [tool.to_dict() for tool in self.tools.values()]

    async def get_enabled_tools_for_agent(self, agent_name: str) -> List[Dict[str, Any]]:
        """Get only enabled tools allowed for a specific agent"""
        if not self.tool_config_service:
            # Fallback to all enabled tools
            return [tool.to_dict() for tool in self.tools.values() if tool.enabled]

        # Get allowed tool IDs from config service
        allowed_tool_ids = self.tool_config_service.get_tools_for_agent(agent_name)

        # Return tool info for allowed tools
        result = []
        for tool_id in allowed_tool_ids:
            if tool_id in self.tools:
                result.append(self.tools[tool_id].to_dict())

        return result


# Global instance
strands_tool_registry = StrandsToolRegistry()


async def get_dynamic_tools() -> StrandsToolRegistry:
    """Get the initialized tool registry"""
    if not strands_tool_registry._initialized:
        await strands_tool_registry.initialize()
    return strands_tool_registry
