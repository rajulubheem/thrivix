"""
Strands Tools Definitions with Correct Parameters
Based on the official strands-agents-tools documentation
"""

# Correct tool schemas based on documentation
STRANDS_TOOL_SCHEMAS = {
    "python_repl": {
        "name": "python_repl",
        "description": "Execute Python code in a REPL environment with persistent state",
        "parameters": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "Python code to execute. Can include imports, function definitions, and multi-line scripts."
                }
            },
            "required": ["code"]
        },
        "examples": [
            {"code": "import pandas as pd\ndf = pd.read_csv('data.csv')\nprint(df.head())"},
            {"code": "2 + 2"},
            {"code": "import math\nprint(math.sqrt(16))"}
        ]
    },

    "shell": {
        "name": "shell",
        "description": "Execute shell commands on the system (not available on Windows)",
        "parameters": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Shell command to execute. Can be a single command or array of commands."
                },
                "ignore_errors": {
                    "type": "boolean",
                    "description": "Whether to continue execution if command fails",
                    "default": False
                }
            },
            "required": ["command"]
        },
        "examples": [
            {"command": "ls -la"},
            {"command": ["mkdir -p test_dir", "cd test_dir", "touch test.txt"]},
            {"command": "pwd"}
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
                }
            },
            "required": ["path"]
        },
        "examples": [
            {"path": "config.json"},
            {"path": "/etc/hosts"},
            {"path": "./src/main.py"}
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
                    "description": "Path to the file to write"
                },
                "content": {
                    "type": "string",
                    "description": "Content to write to the file"
                }
            },
            "required": ["path", "content"]
        },
        "examples": [
            {"path": "output.txt", "content": "Hello, world!"},
            {"path": "/tmp/data.json", "content": '{"key": "value"}'}
        ]
    },

    "http_request": {
        "name": "http_request",
        "description": "Make HTTP requests to external services",
        "parameters": {
            "type": "object",
            "properties": {
                "method": {
                    "type": "string",
                    "description": "HTTP method",
                    "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"],
                    "default": "GET"
                },
                "url": {
                    "type": "string",
                    "description": "URL to request"
                },
                "headers": {
                    "type": "object",
                    "description": "Request headers",
                    "default": {}
                },
                "body": {
                    "type": "string",
                    "description": "Request body for POST/PUT/PATCH"
                },
                "auth_type": {
                    "type": "string",
                    "description": "Authentication type",
                    "enum": ["Bearer", "Basic"]
                },
                "auth_token": {
                    "type": "string",
                    "description": "Authentication token"
                },
                "convert_to_markdown": {
                    "type": "boolean",
                    "description": "Convert HTML to markdown",
                    "default": False
                }
            },
            "required": ["url"]
        },
        "examples": [
            {"method": "GET", "url": "https://api.example.com/data"},
            {
                "method": "POST",
                "url": "https://api.example.com/resource",
                "headers": {"Content-Type": "application/json"},
                "body": '{"key": "value"}'
            }
        ]
    },

    "tavily_search": {
        "name": "tavily_search",
        "description": "Real-time web search optimized for AI agents",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query"
                },
                "search_depth": {
                    "type": "string",
                    "description": "Search depth",
                    "enum": ["basic", "advanced"],
                    "default": "basic"
                },
                "topic": {
                    "type": "string",
                    "description": "Search topic filter",
                    "enum": ["general", "news"]
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results",
                    "default": 5
                },
                "include_raw_content": {
                    "type": "boolean",
                    "description": "Include raw content in results",
                    "default": False
                }
            },
            "required": ["query"]
        },
        "examples": [
            {"query": "What is artificial intelligence?", "search_depth": "advanced"},
            {"query": "Latest AI developments", "topic": "news", "max_results": 10}
        ]
    },

    "calculator": {
        "name": "calculator",
        "description": "Perform mathematical calculations and symbolic math",
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
            {"expression": "2 * sin(pi/4) + log(e**2)"},
            {"expression": "sqrt(144) + 5**2"},
            {"expression": "(10 + 5) / 3"}
        ]
    },

    "current_time": {
        "name": "current_time",
        "description": "Get the current time in ISO 8601 format",
        "parameters": {
            "type": "object",
            "properties": {
                "timezone": {
                    "type": "string",
                    "description": "Timezone (e.g., 'US/Pacific', 'Europe/London')",
                    "default": "UTC"
                }
            },
            "required": []
        },
        "examples": [
            {"timezone": "US/Pacific"},
            {"timezone": "Europe/London"},
            {}
        ]
    },

    "sleep": {
        "name": "sleep",
        "description": "Pause execution for specified seconds",
        "parameters": {
            "type": "object",
            "properties": {
                "seconds": {
                    "type": "number",
                    "description": "Number of seconds to sleep"
                }
            },
            "required": ["seconds"]
        },
        "examples": [
            {"seconds": 5},
            {"seconds": 1.5}
        ]
    },

    "use_aws": {
        "name": "use_aws",
        "description": "Interact with AWS services",
        "parameters": {
            "type": "object",
            "properties": {
                "service_name": {
                    "type": "string",
                    "description": "AWS service name (e.g., 's3', 'ec2', 'lambda')"
                },
                "operation_name": {
                    "type": "string",
                    "description": "Operation to perform (e.g., 'list_buckets', 'describe_instances')"
                },
                "parameters": {
                    "type": "object",
                    "description": "Parameters for the operation",
                    "default": {}
                },
                "region": {
                    "type": "string",
                    "description": "AWS region",
                    "default": "us-west-2"
                },
                "label": {
                    "type": "string",
                    "description": "Human-readable label for the operation"
                }
            },
            "required": ["service_name", "operation_name"]
        },
        "examples": [
            {
                "service_name": "s3",
                "operation_name": "list_buckets",
                "parameters": {},
                "region": "us-east-1",
                "label": "List all S3 buckets"
            },
            {
                "service_name": "ec2",
                "operation_name": "describe_instances",
                "parameters": {},
                "region": "us-west-2"
            }
        ]
    },

    "editor": {
        "name": "editor",
        "description": "Advanced file editing operations",
        "parameters": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Editor command",
                    "enum": ["view", "create", "str_replace", "undo"]
                },
                "path": {
                    "type": "string",
                    "description": "File path"
                },
                "old_str": {
                    "type": "string",
                    "description": "String to replace (for str_replace command)"
                },
                "new_str": {
                    "type": "string",
                    "description": "Replacement string (for str_replace command)"
                },
                "file_text": {
                    "type": "string",
                    "description": "Content for new file (for create command)"
                }
            },
            "required": ["command", "path"]
        },
        "examples": [
            {"command": "view", "path": "script.py"},
            {"command": "create", "path": "new_file.txt", "file_text": "Hello, world!"},
            {"command": "str_replace", "path": "config.json", "old_str": "old_value", "new_str": "new_value"}
        ]
    },

    "environment": {
        "name": "environment",
        "description": "Manage environment variables",
        "parameters": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "description": "Action to perform",
                    "enum": ["list", "get", "set", "delete"]
                },
                "key": {
                    "type": "string",
                    "description": "Environment variable name"
                },
                "value": {
                    "type": "string",
                    "description": "Environment variable value (for set action)"
                },
                "prefix": {
                    "type": "string",
                    "description": "Filter variables by prefix (for list action)"
                }
            },
            "required": ["action"]
        },
        "examples": [
            {"action": "list", "prefix": "AWS_"},
            {"action": "get", "key": "PATH"},
            {"action": "set", "key": "MY_VAR", "value": "my_value"}
        ]
    },

    "memory": {
        "name": "memory",
        "description": "Store and retrieve memories in knowledge base",
        "parameters": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "description": "Action to perform",
                    "enum": ["retrieve", "store", "list", "delete"]
                },
                "query": {
                    "type": "string",
                    "description": "Query text for retrieval"
                },
                "content": {
                    "type": "string",
                    "description": "Content to store"
                },
                "metadata": {
                    "type": "object",
                    "description": "Metadata for stored content"
                }
            },
            "required": ["action"]
        },
        "examples": [
            {"action": "retrieve", "query": "product features"},
            {"action": "store", "content": "The product has three main features...", "metadata": {"type": "features"}}
        ]
    }
}


def get_tool_schema(tool_name: str) -> dict:
    """Get the correct schema for a strands tool"""
    return STRANDS_TOOL_SCHEMAS.get(tool_name, None)


def get_tool_instruction(tool_name: str) -> str:
    """Get usage instruction for a tool to provide to the AI"""
    schema = get_tool_schema(tool_name)
    if not schema:
        return f"Tool {tool_name} not found in definitions"

    params = schema["parameters"]["properties"]
    required = schema["parameters"].get("required", [])
    examples = schema.get("examples", [])

    instruction = f"""
Tool: {tool_name}
Description: {schema['description']}

Parameters:
"""
    for param_name, param_info in params.items():
        req_text = " (REQUIRED)" if param_name in required else " (optional)"
        instruction += f"- {param_name}{req_text}: {param_info['description']}"
        if 'default' in param_info:
            instruction += f" [default: {param_info['default']}]"
        if 'enum' in param_info:
            instruction += f" [options: {', '.join(param_info['enum'])}]"
        instruction += "\n"

    if examples:
        instruction += "\nExamples:\n"
        for i, example in enumerate(examples, 1):
            instruction += f"{i}. {example}\n"

    return instruction


def create_system_prompt_for_tools(tools: list) -> str:
    """Create a system prompt that instructs the AI how to use tools correctly"""
    prompt = """You are an AI agent with access to various tools. When using tools, you MUST use the exact parameter names as specified.

IMPORTANT: Each tool expects specific parameter names. Do NOT use 'kwargs' as a parameter name. Use the actual parameter names like 'code', 'command', 'path', etc.

Here are your available tools and their correct usage:

"""

    for tool_name in tools:
        prompt += get_tool_instruction(tool_name) + "\n"

    prompt += """
When calling tools:
1. Use the EXACT parameter names as shown above
2. Do not wrap parameters in 'kwargs'
3. For python_repl, use: {"code": "your python code"}
4. For shell, use: {"command": "your shell command"}
5. For file_read, use: {"path": "file path"}
6. For file_write, use: {"path": "file path", "content": "file content"}

If you receive an error about missing parameters, check that you're using the correct parameter names, not 'kwargs'.

IMPORTANT ERROR HANDLING:
- If a tool call fails 2-3 times with the same error, try a different approach instead of repeating the same call
- For python_repl errors, consider simplifying your code or breaking it into smaller parts
- If you can't resolve a tool error, proceed with alternative methods or acknowledge the limitation
"""

    return prompt