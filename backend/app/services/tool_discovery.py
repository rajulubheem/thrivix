"""
Tool Discovery Service
Helps agents discover and understand available tools
"""
import inspect
import json
from typing import Dict, Any, List, Optional
import structlog

logger = structlog.get_logger()

class ToolDiscoveryService:
    """Service to help agents discover available tools"""
    
    @staticmethod
    def get_tool_catalog() -> Dict[str, Any]:
        """Get a comprehensive catalog of available tools"""
        
        catalog = {
            "file_operations": {
                "description": "Tools for reading and writing files",
                "tools": {
                    "file_read": {
                        "description": "Read content from a file",
                        "parameters": {
                            "path": "string - Path to the file to read"
                        },
                        "example": {"path": "document.txt"},
                        "returns": "File content as string"
                    },
                    "file_write": {
                        "description": "Write content to a file",
                        "parameters": {
                            "path": "string - Path to the file to write",
                            "content": "string - Content to write to the file"
                        },
                        "example": {"path": "output.txt", "content": "Hello World"},
                        "returns": "Success status"
                    },
                    "editor": {
                        "description": "Advanced file editor with multiple operations",
                        "parameters": {
                            "command": "string - Operation (view, create, edit, search)",
                            "path": "string - File path",
                            "content": "string - Content (for create/edit)",
                            "pattern": "string - Search pattern (for search)"
                        },
                        "example": {"command": "view", "path": "script.py"}
                    }
                }
            },
            "web_search": {
                "description": "Tools for web search and information retrieval",
                "tools": {
                    "tavily_search": {
                        "description": "Search the web for current information",
                        "parameters": {
                            "query": "string - Search query (required)",
                            "search_depth": "string - 'basic' or 'advanced' (optional, default: 'basic')",
                            "max_results": "integer - Number of results (optional, default: 5)"
                        },
                        "example": {"query": "latest Tesla news", "search_depth": "basic", "max_results": 5},
                        "returns": "Search results with URLs and summaries"
                    },
                    "http_request": {
                        "description": "Make HTTP requests to APIs and websites (GET/HEAD)",
                        "parameters": {
                            "method": "string - HTTP method (GET or HEAD)",
                            "url": "string - URL to request",
                            "headers": "dict - Optional headers"
                        },
                        "example": {"method": "GET", "url": "https://example.com"}
                    },
                    "fetch_webpage": {
                        "description": "Fetch a webpage and extract readable text",
                        "parameters": {"url": "string - Target http(s) URL (required)"},
                        "example": {"url": "https://example.com"}
                    },
                    "extract_links": {
                        "description": "Extract hyperlinks from a webpage",
                        "parameters": {"url": "string - Target http(s) URL (required)"},
                        "example": {"url": "https://example.com"}
                    },
                    "rss_fetch": {
                        "description": "Fetch and parse an RSS feed",
                        "parameters": {"url": "string - RSS/Atom feed URL (required)", "limit": "integer - Max items (optional)"},
                        "example": {"url": "https://hnrss.org/frontpage", "limit": 5}
                    },
                    "sitemap_fetch": {
                        "description": "Fetch and parse a sitemap.xml",
                        "parameters": {"url": "string - sitemap.xml URL (required)", "limit": "integer - Max URLs (optional)"},
                        "example": {"url": "https://example.com/sitemap.xml", "limit": 100}
                    },
                    "wikipedia_search": {
                        "description": "Search Wikipedia and get a summary",
                        "parameters": {"query": "string - Search query (required)", "lang": "string - Language code (optional, default: en)"},
                        "example": {"query": "Large language model", "lang": "en"}
                    }
                }
            },
            "code_execution": {
                "description": "Tools for executing code",
                "tools": {
                    "python_repl": {
                        "description": "Execute Python code in a sandboxed environment",
                        "parameters": {
                            "code": "string - Python code to execute (required)"
                        },
                        "example": {"code": "print(2 + 2)"},
                        "returns": "Execution output and results"
                    },
                    "calculator": {
                        "description": "Perform mathematical calculations",
                        "parameters": {
                            "expression": "string - Mathematical expression to evaluate"
                        },
                        "example": {"expression": "2 + 2 * 3"},
                        "returns": "Calculation result"
                    },
                    "code_interpreter": {
                        "description": "Execute code using the Python interpreter",
                        "parameters": {"code": "string - Python code to execute (required)"},
                        "example": {"code": "print('Hello')"}
                    }
                }
            },
            "analysis": {
                "description": "Tools for reasoning and analysis",
                "tools": {
                    "think": {
                        "description": "Advanced reasoning tool for complex problem solving",
                        "parameters": {
                            "problem": "string - Problem or question to analyze",
                            "context": "string - Additional context (optional)"
                        },
                        "example": {"problem": "How to optimize this algorithm?"},
                        "returns": "Detailed analysis and recommendations"
                    },
                    "task_planner": {
                        "description": "Create detailed task plans with steps",
                        "parameters": {
                            "task": "string - Task to plan",
                            "constraints": "list - Optional constraints"
                        },
                        "example": {"task": "Build a web scraper"},
                        "returns": "Step-by-step plan"
                    }
                }
            },
            "utilities": {
                "description": "Utility tools for various operations",
                "tools": {
                    "current_time": {
                        "description": "Get current time in any timezone",
                        "parameters": {
                            "timezone": "string - Timezone (optional, default: UTC)"
                        },
                        "example": {"timezone": "America/New_York"},
                        "returns": "Current time as ISO string"
                    },
                    "system_info": {
                        "description": "Get system information",
                        "parameters": {},
                        "example": {},
                        "returns": "System details (OS, CPU, memory, disk)"
                    },
                    "journal": {
                        "description": "Create and manage structured logs",
                        "parameters": {
                            "action": "string - Action (create, append, read)",
                            "entry": "string - Journal entry content",
                            "tags": "list - Optional tags"
                        },
                        "example": {"action": "create", "entry": "Task completed", "tags": ["success"]}
                    }
                }
            }
        }
        
        return catalog
    
    @staticmethod
    def get_tool_help(tool_name: str) -> Optional[Dict[str, Any]]:
        """Get detailed help for a specific tool"""
        
        catalog = ToolDiscoveryService.get_tool_catalog()
        
        for category in catalog.values():
            if "tools" in category and tool_name in category["tools"]:
                tool_info = category["tools"][tool_name]
                return {
                    "name": tool_name,
                    "category": category.get("description", "Unknown"),
                    **tool_info
                }
        
        return None
    
    @staticmethod
    def suggest_tools_for_task(task: str) -> List[Dict[str, Any]]:
        """Suggest appropriate tools based on task description"""
        
        suggestions = []
        task_lower = task.lower()
        
        # Keywords to tool mapping
        tool_keywords = {
            "file_read": ["read", "open", "load", "get content", "view file"],
            "file_write": ["write", "save", "create file", "output", "store", "generate report"],
            "tavily_search": ["search", "find", "news", "current", "latest", "web", "online"],
            "python_repl": ["calculate", "compute", "analyze", "data", "python", "code"],
            "http_request": ["api", "request", "fetch", "endpoint", "rest"],
            "think": ["analyze", "reason", "complex", "solve", "understand"],
            "task_planner": ["plan", "organize", "steps", "workflow", "breakdown"],
            "calculator": ["math", "calculate", "compute", "arithmetic"],
            "current_time": ["time", "date", "now", "timezone"],
            "system_info": ["system", "hardware", "os", "memory", "cpu"]
        }
        
        for tool_name, keywords in tool_keywords.items():
            if any(keyword in task_lower for keyword in keywords):
                tool_help = ToolDiscoveryService.get_tool_help(tool_name)
                if tool_help:
                    suggestions.append({
                        "tool": tool_name,
                        "reason": f"Detected keywords: {', '.join([k for k in keywords if k in task_lower])}",
                        **tool_help
                    })
        
        return suggestions
    
    @staticmethod
    def format_tool_usage_guide(agent_name: str, available_tools: List[str]) -> str:
        """Format a usage guide for an agent's available tools"""
        
        guide = f"## Available Tools for {agent_name}\n\n"
        catalog = ToolDiscoveryService.get_tool_catalog()
        
        tools_by_category = {}
        for category_name, category_info in catalog.items():
            if "tools" in category_info:
                for tool_name in available_tools:
                    if tool_name in category_info["tools"]:
                        if category_name not in tools_by_category:
                            tools_by_category[category_name] = []
                        tools_by_category[category_name].append(tool_name)

        for category, tools in tools_by_category.items():
            category_info = catalog[category]
            guide += f"### {category_info['description']}\n"
            
            for tool_name in tools:
                tool_info = category_info["tools"][tool_name]
                guide += f"\n**{tool_name}**\n"
                guide += f"- Purpose: {tool_info['description']}\n"
                
                if tool_info.get("parameters"):
                    guide += f"- Parameters:\n"
                    for param, desc in tool_info["parameters"].items():
                        guide += f"  - `{param}`: {desc}\n"
                
                if tool_info.get("example"):
                    example_str = json.dumps(tool_info['example'])
                    guide += f"- Example: `{example_str}`\n"

                # Add a reminder of correct call format for the agent
                guide += "- Call Format: [TOOL: {name}]\\n  {{parameters as JSON}}\\n  [/TOOL]\\n".format(name=tool_name)
        
        return guide


class ToolValidator:
    """Validate tool calls and parameters"""
    
    @staticmethod
    def validate_tool_call(tool_name: str, parameters: Dict[str, Any]) -> tuple[bool, str]:
        """Validate if a tool call has correct parameters"""
        
        tool_help = ToolDiscoveryService.get_tool_help(tool_name)
        if not tool_help:
            return False, f"Unknown tool: {tool_name}"
        
        required_params = []
        if "parameters" in tool_help:
            for param, desc in tool_help["parameters"].items():
                if "required" in desc.lower() or param in ["path", "query", "code", "expression"]:
                    required_params.append(param)
        
        # Check required parameters
        missing = [p for p in required_params if p not in parameters]
        if missing:
            # Provide example usage if available
            example = tool_help.get("example")
            example_str = f" Example: `{json.dumps(example)}`" if example else ""
            return False, f"Missing required parameters: {', '.join(missing)}.{example_str}"
        
        # Validate specific tools
        if tool_name == "file_write":
            if "content" not in parameters and "path" in parameters:
                # Agent might be confusing file_write with file_read
                return False, "file_write requires 'content' parameter. To read a file use file_read with {\"path\": \"...\"}. To save output, call file_write with {\"path\": \"...\", \"content\": \"...\"}."
        
        if tool_name == "file_read":
            if "content" in parameters:
                # Agent is trying to write with file_read
                return False, "file_read doesn't accept 'content'. Use file_write to save content, e.g. {\"path\": \"output.txt\", \"content\": \"...\"}."
            if "query" in parameters:
                return False, "file_read expects {\"path\": \"...\"}. To search the web use tavily_search with {\"query\": \"...\"}."

        if tool_name in ("tavily_search", "web_search"):
            if "url" in parameters and "query" not in parameters:
                return False, "For web_search supply {\"query\": \"...\"}. To fetch a specific page, use fetch_webpage with {\"url\": \"http(s)://...\"}."

        if tool_name == "http_request":
            method = str(parameters.get("method", "GET")).upper()
            if method not in ("GET", "HEAD"):
                return False, "http_request supports only GET or HEAD. Set {\"method\": \"GET\"}."
            if not parameters.get("url"):
                return False, "http_request requires {\"url\": \"http(s)://...\"}."

        if tool_name == "fetch_webpage" and "url" not in parameters:
            return False, "fetch_webpage requires {\"url\": \"http(s)://...\"}. To discover URLs first, use tavily_search with {\"query\": \"...\"}."

        if tool_name == "diagram" and "description" not in parameters:
            return False, "diagram requires {\"description\": \"...\"}."

        if tool_name in ("python_repl", "code_interpreter") and "code" not in parameters:
            return False, "Provide {\"code\": \"...\"} to execute. Save results with file_write if needed."
        
        return True, "Valid"
