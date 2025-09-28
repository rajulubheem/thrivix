"""
Tools Configuration API for Strands Agents
Provides properly configured tools with correct parameter schemas
"""

from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import json

router = APIRouter(prefix="/api/v1/tools-config", tags=["tools-config"])


class ToolConfig(BaseModel):
    """Configuration for a tool"""
    name: str
    description: str
    parameters: Dict[str, Any]
    examples: Optional[List[Dict[str, Any]]] = None


# Correctly formatted tool configurations
TOOL_CONFIGS = {
    "python_repl": {
        "name": "python_repl",
        "description": "Execute Python code in a REPL environment",
        "parameters": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "Python code to execute"
                }
            },
            "required": ["code"]
        },
        "examples": [
            {"code": "print('Hello, World!')"},
            {"code": "import math\nresult = math.sqrt(16)\nprint(f'Square root of 16 is {result}')"},
            {"code": "data = [1, 2, 3, 4, 5]\nprint(f'Sum: {sum(data)}, Mean: {sum(data)/len(data)}')"}
        ]
    },
    "shell": {
        "name": "shell",
        "description": "Execute shell commands",
        "parameters": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Shell command to execute"
                }
            },
            "required": ["command"]
        },
        "examples": [
            {"command": "ls -la"},
            {"command": "pwd"},
            {"command": "echo 'Hello from shell'"}
        ]
    },
    "file_read": {
        "name": "file_read",
        "description": "Read contents of a file",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file to read"
                },
                "mode": {
                    "type": "string",
                    "description": "Read mode (text or binary)",
                    "default": "text",
                    "enum": ["text", "binary"]
                }
            },
            "required": ["path"]
        },
        "examples": [
            {"path": "/tmp/test.txt"},
            {"path": "./config.json", "mode": "text"}
        ]
    },
    "file_write": {
        "name": "file_write",
        "description": "Write content to a file",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file"
                },
                "content": {
                    "type": "string",
                    "description": "Content to write to the file"
                },
                "mode": {
                    "type": "string",
                    "description": "Write mode (overwrite or append)",
                    "default": "overwrite",
                    "enum": ["overwrite", "append"]
                }
            },
            "required": ["path", "content"]
        },
        "examples": [
            {"path": "/tmp/output.txt", "content": "Hello, World!"},
            {"path": "./data.json", "content": '{"key": "value"}', "mode": "overwrite"}
        ]
    },
    "http_request": {
        "name": "http_request",
        "description": "Make HTTP requests",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to request"
                },
                "method": {
                    "type": "string",
                    "description": "HTTP method",
                    "default": "GET",
                    "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"]
                },
                "headers": {
                    "type": "object",
                    "description": "Request headers",
                    "default": {}
                },
                "data": {
                    "type": "string",
                    "description": "Request body (for POST/PUT/PATCH)",
                    "default": ""
                },
                "params": {
                    "type": "object",
                    "description": "Query parameters",
                    "default": {}
                }
            },
            "required": ["url"]
        },
        "examples": [
            {"url": "https://api.github.com/users/octocat"},
            {
                "url": "https://jsonplaceholder.typicode.com/posts",
                "method": "POST",
                "headers": {"Content-Type": "application/json"},
                "data": '{"title": "Test", "body": "Test post", "userId": 1}'
            }
        ]
    },
    "calculator": {
        "name": "calculator",
        "description": "Perform mathematical calculations",
        "parameters": {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "Mathematical expression to evaluate"
                }
            },
            "required": ["expression"]
        },
        "examples": [
            {"expression": "2 + 2"},
            {"expression": "sqrt(16) * 3"},
            {"expression": "(10 + 5) / 3"}
        ]
    },
    "tavily_search": {
        "name": "tavily_search",
        "description": "Search the web using Tavily API",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query"
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results",
                    "default": 5
                },
                "include_domains": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Limit search to specific domains",
                    "default": []
                },
                "exclude_domains": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Exclude specific domains from search",
                    "default": []
                }
            },
            "required": ["query"]
        },
        "examples": [
            {"query": "latest AI developments 2024"},
            {"query": "python programming tutorials", "max_results": 10},
            {"query": "machine learning", "include_domains": ["arxiv.org", "papers.nips.cc"]}
        ]
    }
}


@router.get("/list")
async def list_tool_configs():
    """Get list of all available tool configurations"""
    return {
        "tools": list(TOOL_CONFIGS.keys()),
        "count": len(TOOL_CONFIGS)
    }


@router.get("/{tool_name}")
async def get_tool_config(tool_name: str):
    """Get configuration for a specific tool"""
    if tool_name not in TOOL_CONFIGS:
        raise HTTPException(status_code=404, detail=f"Tool configuration for '{tool_name}' not found")

    return TOOL_CONFIGS[tool_name]


@router.get("/{tool_name}/schema")
async def get_tool_schema(tool_name: str):
    """Get OpenAI function calling schema for a tool"""
    if tool_name not in TOOL_CONFIGS:
        raise HTTPException(status_code=404, detail=f"Tool configuration for '{tool_name}' not found")

    config = TOOL_CONFIGS[tool_name]

    # Format as OpenAI function schema
    return {
        "type": "function",
        "function": {
            "name": config["name"],
            "description": config["description"],
            "parameters": config["parameters"]
        }
    }


@router.get("/{tool_name}/examples")
async def get_tool_examples(tool_name: str):
    """Get usage examples for a tool"""
    if tool_name not in TOOL_CONFIGS:
        raise HTTPException(status_code=404, detail=f"Tool configuration for '{tool_name}' not found")

    config = TOOL_CONFIGS[tool_name]
    examples = config.get("examples", [])

    return {
        "tool": tool_name,
        "examples": examples,
        "formatted_examples": [
            {
                "description": f"Example {i+1}",
                "function_call": {
                    "name": tool_name,
                    "arguments": json.dumps(example)
                }
            }
            for i, example in enumerate(examples)
        ]
    }


@router.post("/validate-call")
async def validate_tool_call(tool_name: str, arguments: Dict[str, Any]):
    """Validate if a tool call has the correct parameters"""
    if tool_name not in TOOL_CONFIGS:
        return {
            "valid": False,
            "error": f"Unknown tool: {tool_name}"
        }

    config = TOOL_CONFIGS[tool_name]
    parameters = config["parameters"]
    required = parameters.get("required", [])
    properties = parameters.get("properties", {})

    errors = []

    # Check required parameters
    for param in required:
        if param not in arguments:
            errors.append(f"Missing required parameter: {param}")

    # Check parameter types
    for param, value in arguments.items():
        if param in properties:
            expected_type = properties[param].get("type")
            if expected_type:
                actual_type = type(value).__name__
                type_map = {
                    "string": "str",
                    "integer": "int",
                    "number": "float",
                    "boolean": "bool",
                    "object": "dict",
                    "array": "list"
                }
                expected_py_type = type_map.get(expected_type, expected_type)

                if expected_type == "number" and actual_type in ["int", "float"]:
                    continue  # Both int and float are acceptable for number
                elif expected_py_type != actual_type:
                    errors.append(f"Parameter '{param}' should be {expected_type}, got {actual_type}")

    if errors:
        return {
            "valid": False,
            "errors": errors,
            "suggestion": f"Expected format: {json.dumps(config.get('examples', [{}])[0], indent=2)}"
        }

    return {
        "valid": True,
        "message": "Tool call parameters are valid"
    }


@router.post("/fix-parameters")
async def fix_tool_parameters(tool_name: str, arguments: Dict[str, Any]):
    """Attempt to fix incorrect tool parameters"""

    # Common parameter name fixes
    param_fixes = {
        "python_repl": {
            "kwargs": "code",
            "script": "code",
            "python_code": "code"
        },
        "shell": {
            "kwargs": "command",
            "cmd": "command",
            "shell_command": "command"
        },
        "file_read": {
            "kwargs": "path",
            "file": "path",
            "filename": "path",
            "file_path": "path"
        },
        "file_write": {
            "kwargs": lambda v: {"path": "/tmp/output.txt", "content": v} if isinstance(v, str) else v,
            "data": "content",
            "text": "content"
        }
    }

    if tool_name not in TOOL_CONFIGS:
        return {
            "fixed": False,
            "error": f"Unknown tool: {tool_name}"
        }

    fixes = param_fixes.get(tool_name, {})
    fixed_args = {}
    applied_fixes = []

    for key, value in arguments.items():
        if key in fixes:
            fix = fixes[key]
            if callable(fix):
                fixed_value = fix(value)
                if isinstance(fixed_value, dict):
                    fixed_args.update(fixed_value)
                    applied_fixes.append(f"Expanded '{key}' to multiple parameters")
            else:
                fixed_args[fix] = value
                applied_fixes.append(f"Renamed '{key}' to '{fix}'")
        else:
            fixed_args[key] = value

    # Handle special case for kwargs containing escaped code
    if "kwargs" in arguments and tool_name == "python_repl":
        kwargs_value = arguments["kwargs"]
        if isinstance(kwargs_value, str):
            # Remove escaping
            code = kwargs_value.replace('\\"', '"').replace('\\n', '\n')
            # Remove outer quotes if present
            if code.startswith('"') and code.endswith('"'):
                code = code[1:-1]
            fixed_args = {"code": code}
            applied_fixes.append("Extracted code from kwargs string")

    if applied_fixes:
        return {
            "fixed": True,
            "original": arguments,
            "fixed_arguments": fixed_args,
            "applied_fixes": applied_fixes
        }

    return {
        "fixed": False,
        "message": "No fixes needed or available",
        "arguments": arguments
    }