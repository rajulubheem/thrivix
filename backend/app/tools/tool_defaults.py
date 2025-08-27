"""
Default parameter examples for all tools based on Strands documentation
This provides helpful examples for users and agents to understand how to use each tool
"""

TOOL_DEFAULT_PARAMETERS = {
    # File Operations
    "file_read": {
        "path": "config.json",
        "_example_usage": "Read configuration files, parse code files, load datasets",
        "_variations": [
            {"path": "data.csv"},
            {"path": "src/main.py"},
            {"path": "/etc/hosts"}
        ]
    },
    
    "file_write": {
        "path": "output.txt",
        "content": "Hello, world!",
        "_example_usage": "Write results to files, create new files, save output data",
        "_variations": [
            {"path": "results.json", "content": '{"status": "success"}'},
            {"path": "log.txt", "content": "Operation completed at 2024-01-01 12:00:00"}
        ]
    },
    
    "editor": {
        "command": "view",
        "path": "script.py",
        "line_start": 1,
        "line_end": 50,
        "_example_usage": "Advanced file operations like syntax highlighting, pattern replacement",
        "_variations": [
            {"command": "edit", "path": "main.py", "old_string": "def old_func", "new_string": "def new_func"},
            {"command": "search", "path": ".", "pattern": "TODO"},
            {"command": "create", "path": "new_file.py", "content": "#!/usr/bin/env python3\n"}
        ]
    },
    
    # Web/HTTP
    "http_request": {
        "method": "GET",
        "url": "https://api.example.com/data",
        "headers": {"Content-Type": "application/json"},
        "_example_usage": "Make API calls, fetch web data, send data to external services",
        "_variations": [
            {
                "method": "POST",
                "url": "https://api.example.com/resource",
                "body": '{"key": "value"}',
                "auth_type": "Bearer",
                "auth_token": "your_token_here"
            },
            {
                "method": "GET",
                "url": "https://example.com/article",
                "convert_to_markdown": True
            }
        ]
    },
    
    "tavily_search": {
        "query": "latest AI developments 2024",
        "search_depth": "advanced",
        "include_domains": ["arxiv.org", "openai.com"],
        "max_results": 5,
        "_example_usage": "Search the web for current information and research",
        "_variations": [
            {"query": "Python best practices", "search_depth": "basic"},
            {"query": "climate change statistics", "exclude_domains": ["wikipedia.org"]}
        ]
    },
    
    # System Tools
    "shell_command": {
        "command": "ls -la",
        "working_dir": ".",
        "timeout": 30,
        "_example_usage": "Execute shell commands, run scripts, interact with OS",
        "_variations": [
            {"command": "git status"},
            {"command": "python script.py --arg value"},
            {"command": ["mkdir -p test_dir", "cd test_dir", "touch test.txt"]}
        ]
    },
    
    "current_time": {
        "timezone": "UTC",
        "_example_usage": "Get current time in any timezone",
        "_variations": [
            {"timezone": "US/Pacific"},
            {"timezone": "Europe/London"},
            {"timezone": "Asia/Tokyo"}
        ]
    },
    
    "sleep": {
        "seconds": 5,
        "_example_usage": "Pause execution for specified duration",
        "_variations": [
            {"seconds": 1},
            {"seconds": 10},
            {"seconds": 0.5}
        ]
    },
    
    "environment": {
        "action": "get",
        "key": "PATH",
        "_example_usage": "Manage environment variables",
        "_variations": [
            {"action": "list", "prefix": "AWS_"},
            {"action": "set", "key": "API_KEY", "value": "secret123"},
            {"action": "delete", "key": "TEMP_VAR"}
        ]
    },
    
    "system_info": {
        "include_details": True,
        "_example_usage": "Get system information and resource usage",
        "_variations": [
            {"include_details": False},
            {"categories": ["cpu", "memory", "disk"]}
        ]
    },
    
    # Code Execution
    "python_repl": {
        "code": "import pandas as pd\ndf = pd.read_csv('data.csv')\nprint(df.head())",
        "persist_state": True,
        "timeout": 10,
        "_example_usage": "Run Python code with state persistence",
        "_variations": [
            {"code": "print('Hello, World!')"},
            {"code": "import numpy as np\narray = np.array([1,2,3])\nprint(array * 2)"},
            {"code": "result = sum(range(100))\nprint(f'Sum: {result}')"}
        ]
    },
    
    "calculator": {
        "expression": "2 * sin(pi/4) + log(e**2)",
        "mode": "evaluate",
        "_example_usage": "Perform mathematical operations and symbolic math",
        "_variations": [
            {"expression": "sqrt(16) + 3**2"},
            {"expression": "integrate(x**2, x)", "mode": "symbolic"},
            {"expression": "solve(x**2 - 4, x)", "mode": "solve"}
        ]
    },
    
    # Memory Tools
    "memory": {
        "action": "store",
        "key": "user_preference",
        "value": "prefers dark mode",
        "namespace": "settings",
        "_example_usage": "Store and retrieve structured information",
        "_variations": [
            {"action": "retrieve", "key": "user_preference", "namespace": "settings"},
            {"action": "search", "query": "preferences", "limit": 10},
            {"action": "list", "namespace": "settings"}
        ]
    },
    
    "mem0_memory": {
        "action": "add",
        "messages": [{"role": "user", "content": "I prefer vegetarian food"}],
        "user_id": "user123",
        "_example_usage": "Advanced memory with vector embeddings",
        "_variations": [
            {"action": "search", "query": "food preferences", "user_id": "user123"},
            {"action": "get_all", "user_id": "user123", "limit": 20},
            {"action": "reset", "user_id": "user123"}
        ]
    },
    
    # Media Tools
    "generate_image": {
        "prompt": "A serene mountain landscape at sunset",
        "style": "realistic",
        "size": "1024x1024",
        "quality": "hd",
        "_example_usage": "Generate AI images with customizable styles",
        "_variations": [
            {"prompt": "Abstract art with vibrant colors", "style": "abstract"},
            {"prompt": "Cartoon character smiling", "style": "cartoon", "size": "512x512"},
            {"prompt": "Futuristic city skyline", "style": "3d", "n": 2}
        ]
    },
    
    "image_reader": {
        "image_path": "path/to/image.jpg",
        "analysis_type": "all",
        "_example_usage": "Analyze images for OCR, objects, and scenes",
        "_variations": [
            {"image_url": "https://example.com/image.png", "analysis_type": "ocr"},
            {"image_path": "photo.jpg", "analysis_type": "objects"},
            {"image_path": "document.png", "prompt": "What text is in this image?"}
        ]
    },
    
    "speak": {
        "text": "Operation completed successfully",
        "voice": "alloy",
        "language": "en-US",
        "speed": 1.0,
        "_example_usage": "Convert text to speech with various voices",
        "_variations": [
            {"text": "Welcome to the system", "voice": "nova"},
            {"text": "Error detected", "voice": "echo", "speed": 0.8},
            {"text": "Proceso completado", "language": "es-ES"}
        ]
    },
    
    "diagram": {
        "type": "flowchart",
        "description": "User login process with authentication",
        "format": "svg",
        "_example_usage": "Create diagrams and visualizations",
        "_variations": [
            {"type": "sequence", "description": "API request flow"},
            {"type": "class", "description": "User and Order classes"},
            {"type": "gantt", "description": "Project timeline"}
        ]
    },
    
    # AWS Tools
    "use_aws": {
        "service": "s3",
        "action": "list_buckets",
        "parameters": {},
        "region": "us-east-1",
        "_example_usage": "Interact with AWS services",
        "_variations": [
            {"service": "s3", "action": "get_object", "parameters": {"Bucket": "my-bucket", "Key": "file.txt"}},
            {"service": "lambda", "action": "invoke", "parameters": {"FunctionName": "my-function"}},
            {"service": "dynamodb", "action": "get_item", "parameters": {"TableName": "users", "Key": {"id": {"S": "123"}}}}
        ]
    },
    
    "retrieve": {
        "source": "vector_db",
        "query": "machine learning best practices",
        "limit": 10,
        "similarity_threshold": 0.7,
        "_example_usage": "Advanced retrieval from various data sources",
        "_variations": [
            {"source": "knowledge_base", "query": "product features"},
            {"source": "documents", "query": "installation guide", "filters": {"tags": ["manual"]}},
            {"source": "cache", "query": "recent_search"}
        ]
    },
    
    # Communication Tools
    "use_llm": {
        "prompt": "Analyze this data and provide insights",
        "system_prompt": "You are a data analyst expert",
        "model": "gpt-4o-mini",
        "temperature": 0.7,
        "_example_usage": "Create nested AI loops with custom prompts",
        "_variations": [
            {"prompt": "Summarize this text", "system_prompt": "You are a concise summarizer"},
            {"prompt": "Generate creative ideas", "temperature": 0.9},
            {"prompt": "Review this code", "system_prompt": "You are a code reviewer"}
        ]
    },
    
    "a2a_client": {
        "action": "discover",
        "agent_url": "http://localhost:9000",
        "_example_usage": "Agent-to-agent communication",
        "_variations": [
            {"action": "list"},
            {"action": "send_message", "agent_url": "http://agent.example.com", "message": "Hello"},
            {"action": "ping", "agent_url": "http://localhost:9000"}
        ]
    },
    
    # Utility Tools
    "journal": {
        "action": "write",
        "content": "Task completed: Data processing pipeline implemented",
        "category": "progress",
        "_example_usage": "Create structured logs and documentation",
        "_variations": [
            {"action": "read", "category": "errors", "limit": 10},
            {"action": "search", "query": "pipeline", "date_range": "today"},
            {"action": "list_categories"}
        ]
    },
    
    "handoff_to_user": {
        "message": "Please confirm before proceeding with deletion",
        "breakout_of_loop": False,
        "_example_usage": "Request user input or hand off control",
        "_variations": [
            {"message": "Task complete. Please review.", "breakout_of_loop": True},
            {"message": "Enter the API key:", "breakout_of_loop": False}
        ]
    },
    
    "stop": {
        "message": "Process completed successfully",
        "exit_code": 0,
        "_example_usage": "Gracefully terminate execution",
        "_variations": [
            {"message": "Error: Invalid configuration", "exit_code": 1},
            {"message": "User requested termination", "exit_code": 0}
        ]
    },
    
    # Advanced Tools
    "think": {
        "thought": "How to optimize database queries for better performance",
        "cycle_count": 3,
        "approach": "analytical",
        "_example_usage": "Multi-step reasoning and analysis",
        "_variations": [
            {"thought": "Design patterns for microservices", "approach": "systematic"},
            {"thought": "Creative marketing strategies", "approach": "creative"},
            {"thought": "Debug memory leak issue", "approach": "exploratory"}
        ]
    },
    
    "batch": {
        "invocations": [
            {"name": "current_time", "arguments": {"timezone": "UTC"}},
            {"name": "system_info", "arguments": {"include_details": False}}
        ],
        "continue_on_error": True,
        "_example_usage": "Execute multiple tools in parallel",
        "_variations": [
            {
                "invocations": [
                    {"name": "file_read", "arguments": {"path": "data1.csv"}},
                    {"name": "file_read", "arguments": {"path": "data2.csv"}}
                ]
            }
        ]
    },
    
    "workflow": {
        "action": "execute",
        "name": "data_pipeline",
        "steps": [
            {"tool": "file_read", "arguments": {"path": "input.csv"}},
            {"tool": "python_repl", "arguments": {"code": "# Process data"}}
        ],
        "_example_usage": "Define and execute multi-step workflows",
        "_variations": [
            {"action": "create", "name": "backup_workflow"},
            {"action": "list"},
            {"action": "get", "name": "data_pipeline"}
        ]
    },
    
    # Extended Utilities
    "cron": {
        "action": "schedule",
        "name": "daily_backup",
        "schedule": "0 2 * * *",
        "command": "backup.sh",
        "_example_usage": "Schedule recurring tasks with cron syntax",
        "_variations": [
            {"action": "list"},
            {"action": "remove", "name": "daily_backup"},
            {"action": "run", "name": "daily_backup"}
        ]
    },
    
    "rss": {
        "action": "subscribe",
        "url": "https://news.ycombinator.com/rss",
        "_example_usage": "Manage and read RSS feeds",
        "_variations": [
            {"action": "list"},
            {"action": "fetch", "url": "https://blog.example.com/feed", "max_entries": 5},
            {"action": "search", "query": "AI", "max_entries": 10}
        ]
    },
    
    "load_tool": {
        "path": "/path/to/custom_tool.py",
        "name": "my_custom_tool",
        "_example_usage": "Dynamically load custom tools",
        "_variations": [
            {"path": "tools/analyzer.py", "name": "analyzer", "reload": True}
        ]
    },
    
    # Planning Tools
    "task_planner": {
        "task": "Build a REST API with authentication",
        "decompose_depth": 2,
        "include_tools": True,
        "estimate_time": True,
        "_example_usage": "Create detailed task plans with decomposition",
        "_variations": [
            {"task": "Analyze customer feedback data", "decompose_depth": 3},
            {"task": "Debug performance issue", "context": {"urgency": "high"}}
        ]
    },
    
    "agent_todo": {
        "action": "add",
        "todos": [
            {"content": "Review code changes", "priority": 4, "tags": ["review"]},
            {"content": "Update documentation", "priority": 3, "tags": ["docs"]}
        ],
        "_example_usage": "Manage agent task lists",
        "_variations": [
            {"action": "list", "filter": {"status": "pending"}},
            {"action": "complete", "todo_id": "todo-123"},
            {"action": "update", "todo_id": "todo-456", "status": "in_progress"}
        ]
    },
    
    "recursive_executor": {
        "steps": [
            {"tool": "think", "parameters": {"thought": "Analyze problem"}},
            {"tool": "file_write", "parameters": {"path": "analysis.txt", "content": "Results"}}
        ],
        "max_depth": 3,
        "continue_on_error": False,
        "_example_usage": "Execute complex tool chains recursively",
        "_variations": [
            {"plan_id": "plan-123", "parallel": True},
            {
                "steps": [
                    {"tool": "http_request", "parameters": {"method": "GET", "url": "https://api.example.com"}},
                    {"tool": "python_repl", "parameters": {"code": "# Process response"}}
                ]
            }
        ]
    }
}

def get_tool_defaults(tool_name: str) -> dict:
    """Get default parameters for a tool"""
    defaults = TOOL_DEFAULT_PARAMETERS.get(tool_name, {})
    # Remove metadata fields
    clean_defaults = {k: v for k, v in defaults.items() if not k.startswith("_")}
    return clean_defaults

def get_tool_variations(tool_name: str) -> list:
    """Get parameter variations for a tool"""
    tool_data = TOOL_DEFAULT_PARAMETERS.get(tool_name, {})
    return tool_data.get("_variations", [])

def get_tool_usage(tool_name: str) -> str:
    """Get usage description for a tool"""
    tool_data = TOOL_DEFAULT_PARAMETERS.get(tool_name, {})
    return tool_data.get("_example_usage", "")

# Export all defaults for easy access
__all__ = [
    "TOOL_DEFAULT_PARAMETERS",
    "get_tool_defaults",
    "get_tool_variations",
    "get_tool_usage"
]