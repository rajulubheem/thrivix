"""
Tool Parameter Fixer for Strands Agents
Ensures tools have the correct parameter format that agents expect
"""

import json
from typing import Dict, Any, List
from strands import tool

class ToolParameterFixer:
    """Fixes tool parameter mismatches between agent expectations and tool definitions"""

    @staticmethod
    def fix_tool_schema(tool_name: str, original_schema: Dict[str, Any]) -> Dict[str, Any]:
        """Fix tool schema to match agent expectations"""

        # Common parameter mappings for different tools
        parameter_mappings = {
            'python_repl': {
                'expected_param': 'code',
                'param_type': 'string',
                'description': 'Python code to execute'
            },
            'shell': {
                'expected_param': 'command',
                'param_type': 'string',
                'description': 'Shell command to execute'
            },
            'file_read': {
                'expected_param': 'path',
                'param_type': 'string',
                'description': 'Path to the file to read'
            },
            'file_write': {
                'expected_params': {
                    'path': {'type': 'string', 'description': 'Path to the file'},
                    'content': {'type': 'string', 'description': 'Content to write'}
                }
            },
            'http_request': {
                'expected_params': {
                    'url': {'type': 'string', 'description': 'URL to request'},
                    'method': {'type': 'string', 'description': 'HTTP method', 'default': 'GET'},
                    'headers': {'type': 'object', 'description': 'Request headers', 'default': {}},
                    'data': {'type': 'string', 'description': 'Request body', 'default': ''}
                }
            }
        }

        # Check if we have a mapping for this tool
        if tool_name in parameter_mappings:
            mapping = parameter_mappings[tool_name]

            if 'expected_param' in mapping:
                # Single parameter tool
                return {
                    'type': 'object',
                    'properties': {
                        mapping['expected_param']: {
                            'type': mapping['param_type'],
                            'description': mapping['description']
                        }
                    },
                    'required': [mapping['expected_param']]
                }
            elif 'expected_params' in mapping:
                # Multiple parameter tool
                properties = {}
                required = []

                for param_name, param_info in mapping['expected_params'].items():
                    properties[param_name] = {
                        'type': param_info['type'],
                        'description': param_info['description']
                    }
                    if 'default' not in param_info:
                        required.append(param_name)

                return {
                    'type': 'object',
                    'properties': properties,
                    'required': required
                }

        # Return original schema if no mapping found
        return original_schema

    @staticmethod
    def create_tool_wrapper(tool_name: str, tool_func):
        """Create a wrapper that handles parameter transformation"""

        def wrapper(**kwargs):
            # Transform kwargs based on tool requirements
            if tool_name == 'python_repl':
                # Agent might send 'kwargs' but tool expects 'code'
                if 'kwargs' in kwargs:
                    # Extract code from kwargs string
                    code = kwargs['kwargs']
                    # Clean up escaped quotes if present
                    if isinstance(code, str):
                        code = code.replace('\\"', '"').replace('\\n', '\n')
                        if code.startswith('"') and code.endswith('"'):
                            code = code[1:-1]
                    return tool_func(code=code)
                elif 'code' in kwargs:
                    return tool_func(code=kwargs['code'])

            elif tool_name == 'shell':
                if 'kwargs' in kwargs:
                    command = kwargs['kwargs']
                    if isinstance(command, str):
                        command = command.replace('\\"', '"')
                        if command.startswith('"') and command.endswith('"'):
                            command = command[1:-1]
                    return tool_func(command=command)
                elif 'command' in kwargs:
                    return tool_func(command=kwargs['command'])

            elif tool_name == 'file_read':
                if 'kwargs' in kwargs:
                    path = kwargs['kwargs']
                    if isinstance(path, str):
                        path = path.replace('\\"', '"')
                        if path.startswith('"') and path.endswith('"'):
                            path = path[1:-1]
                    return tool_func(path=path)
                elif 'path' in kwargs:
                    return tool_func(path=kwargs['path'])

            # Default: pass through
            return tool_func(**kwargs)

        return wrapper

    @staticmethod
    def fix_tool_for_agent(tool_obj, tool_name: str = None):
        """Fix a tool object to work properly with agents"""

        if hasattr(tool_obj, '__name__'):
            tool_name = tool_name or tool_obj.__name__

        # Create wrapper
        wrapped_func = ToolParameterFixer.create_tool_wrapper(tool_name, tool_obj)

        # Copy attributes
        wrapped_func.__name__ = tool_obj.__name__ if hasattr(tool_obj, '__name__') else tool_name
        wrapped_func.__doc__ = tool_obj.__doc__ if hasattr(tool_obj, '__doc__') else f"Wrapped {tool_name} tool"

        return wrapped_func


# Example tool definitions with proper schemas
def create_python_repl_tool():
    """Create a properly formatted python_repl tool"""

    @tool
    def python_repl(code: str) -> str:
        """Execute Python code in a REPL environment.

        Args:
            code: Python code to execute
        """
        try:
            # Create a safe execution environment
            exec_globals = {}
            exec_locals = {}

            # Execute the code
            exec(code, exec_globals, exec_locals)

            # Try to return a result
            if '_' in exec_locals:
                return str(exec_locals['_'])
            elif 'result' in exec_locals:
                return str(exec_locals['result'])
            else:
                # Return string representation of all local variables
                return str({k: v for k, v in exec_locals.items() if not k.startswith('__')})
        except Exception as e:
            return f"Error executing code: {str(e)}"

    return python_repl


def create_shell_tool():
    """Create a properly formatted shell tool"""

    @tool
    def shell(command: str) -> str:
        """Execute a shell command.

        Args:
            command: Shell command to execute
        """
        import subprocess
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0:
                return result.stdout
            else:
                return f"Error: {result.stderr}"
        except subprocess.TimeoutExpired:
            return "Command timed out after 30 seconds"
        except Exception as e:
            return f"Error executing command: {str(e)}"

    return shell


def create_file_read_tool():
    """Create a properly formatted file_read tool"""

    @tool
    def file_read(path: str) -> str:
        """Read contents of a file.

        Args:
            path: Path to the file to read
        """
        try:
            with open(path, 'r') as f:
                return f.read()
        except FileNotFoundError:
            return f"File not found: {path}"
        except Exception as e:
            return f"Error reading file: {str(e)}"

    return file_read


def create_file_write_tool():
    """Create a properly formatted file_write tool"""

    @tool
    def file_write(path: str, content: str) -> str:
        """Write content to a file.

        Args:
            path: Path to the file
            content: Content to write
        """
        try:
            with open(path, 'w') as f:
                f.write(content)
            return f"Successfully wrote to {path}"
        except Exception as e:
            return f"Error writing file: {str(e)}"

    return file_write


# Registry of fixed tools
FIXED_TOOLS = {
    'python_repl': create_python_repl_tool,
    'shell': create_shell_tool,
    'file_read': create_file_read_tool,
    'file_write': create_file_write_tool
}


def get_fixed_tool(tool_name: str):
    """Get a fixed version of a tool"""
    if tool_name in FIXED_TOOLS:
        return FIXED_TOOLS[tool_name]()
    return None