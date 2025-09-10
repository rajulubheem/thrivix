"""
Python REPL Tool for Strands Agents
Execute Python code in a sandboxed environment
"""
import sys
import io
import traceback
from typing import Dict, Any, Optional
import structlog
import ast
import contextlib
import time

logger = structlog.get_logger()

PYTHON_REPL_SPEC = {
    "name": "python_repl",
    "description": (
        "Execute Python code snippets in a sandboxed environment. "
        "Supports standard library and basic operations with state persistence."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "code": {
                "type": "string",
                "description": "Python code to execute"
            },
            "timeout": {
                "type": "integer",
                "description": "Execution timeout in seconds",
                "default": 10,
                "maximum": 60
            },
            "persist_state": {
                "type": "boolean",
                "description": "Persist variables between executions",
                "default": True
            }
        },
        "required": ["code"]
    }
}

class PythonReplTool:
    """Python REPL execution tool"""
    
    def __init__(self):
        self.name = "python_repl"
        self.description = PYTHON_REPL_SPEC["description"]
        self.input_schema = PYTHON_REPL_SPEC["input_schema"]
        
        # Persistent state between executions
        self.global_state = {}
        
        # Safe built-ins
        self.safe_builtins = {
            # Basic functions
            'print': print,
            'len': len,
            'range': range,
            'enumerate': enumerate,
            'zip': zip,
            'map': map,
            'filter': filter,
            'sorted': sorted,
            'reversed': reversed,
            'sum': sum,
            'min': min,
            'max': max,
            'abs': abs,
            'round': round,
            'all': all,
            'any': any,
            
            # Type functions
            'int': int,
            'float': float,
            'str': str,
            'bool': bool,
            'list': list,
            'dict': dict,
            'set': set,
            'tuple': tuple,
            'type': type,
            'isinstance': isinstance,
            
            # Math functions
            'pow': pow,
            'divmod': divmod,
            
            # Other safe functions
            'help': help,
            'dir': dir,
            'id': id,
            'hash': hash,
            'hex': hex,
            'bin': bin,
            'oct': oct,
            'chr': chr,
            'ord': ord,
            
            # Constants
            'True': True,
            'False': False,
            'None': None,
            
            # Allow safe imports
            '__import__': self._safe_import,
        }

    def _safe_import(self, name, *args, **kwargs):
        """Safe import function that only allows certain modules"""
        # Whitelist of safe modules
        safe_modules = [
            'math', 'random', 'datetime', 'time', 'json', 're',
            'collections', 'itertools', 'functools', 'operator',
            'string', 'textwrap', 'unicodedata', 'decimal',
            'fractions', 'statistics', 'copy', 'pprint',
            'enum', 'typing', 'dataclasses', 'abc',
            'heapq', 'bisect', 'array', 'weakref',
            'types', 'copyreg', 'hashlib', 'hmac',
            'secrets', 'uuid', 'html', 'xml',
            'urllib.parse', 'base64', 'binascii',
            'zlib', 'gzip', 'bz2', 'lzma'
        ]
        
        # Check if module is in whitelist
        module_name = name.split('.')[0]
        if module_name in safe_modules:
            return __import__(name, *args, **kwargs)
        else:
            raise ImportError(f"Import of '{name}' is not allowed for safety reasons")

    def _is_safe_code(self, code: str) -> bool:
        """Check if code is safe to execute"""
        
        # Dangerous keywords and functions
        dangerous = [
            'exec', 'eval', 'compile',
            'open', 'file', 'input', 'raw_input',
            '__loader__', '__file__',
            'globals', 'locals', 'vars',
            'getattr', 'setattr', 'delattr', 'hasattr',
            '__dict__', '__class__', '__bases__',
            'subprocess', 'os.system', 'sys.exit',
            'exit', 'quit'
        ]
        
        code_lower = code.lower()
        for keyword in dangerous:
            if keyword.lower() in code_lower:
                logger.warning(f"Blocked dangerous code pattern: {keyword}")
                return False
        
        # Try to parse the code
        try:
            ast.parse(code)
            return True
        except SyntaxError:
            # Let it fail during execution with proper error
            return True
        except Exception as e:
            logger.warning(f"Code parsing failed: {e}")
            return False
    
    async def __call__(self, **kwargs):
        """Execute Python code"""
        code = kwargs.get("code")
        timeout = kwargs.get("timeout", 10)
        persist_state = kwargs.get("persist_state", True)
        
        if not code:
            return {"success": False, "error": "Code is required"}
        
        # Validate timeout
        if timeout > 60:
            timeout = 60
        
        try:
            # Safety check
            if not self._is_safe_code(code):
                return {
                    "success": False,
                    "error": "Code contains potentially unsafe operations",
                    "hint": "Avoid using __import__, exec, eval, open, file operations, or system calls"
                }
            
            # Prepare execution environment
            if persist_state:
                exec_globals = self.global_state.copy()
            else:
                exec_globals = {}
            
            # Add safe builtins
            exec_globals['__builtins__'] = self.safe_builtins
            
            # Capture output
            stdout_buffer = io.StringIO()
            stderr_buffer = io.StringIO()
            
            # Execute code with output capture
            start_time = time.time()
            result_value = None
            
            with contextlib.redirect_stdout(stdout_buffer), \
                 contextlib.redirect_stderr(stderr_buffer):
                try:
                    # Try to compile and execute
                    compiled = compile(code, '<repl>', 'exec')
                    exec(compiled, exec_globals)
                    
                    # Try to get the last expression value
                    try:
                        # Check if last line is an expression
                        lines = code.strip().split('\n')
                        if lines:
                            last_line = lines[-1].strip()
                            if last_line and not last_line.startswith(('print', 'return', 'raise')):
                                try:
                                    ast_node = ast.parse(last_line, mode='eval')
                                    result_value = eval(last_line, exec_globals)
                                except:
                                    pass
                    except:
                        pass
                    
                except SyntaxError as e:
                    stderr_buffer.write(f"SyntaxError: {e}\n")
                except Exception as e:
                    stderr_buffer.write(f"{type(e).__name__}: {e}\n")
                    stderr_buffer.write(traceback.format_exc())
            
            execution_time = time.time() - start_time
            
            # Get output
            stdout = stdout_buffer.getvalue()
            stderr = stderr_buffer.getvalue()
            
            # Update persistent state if enabled
            if persist_state:
                # Remove builtins before saving
                exec_globals.pop('__builtins__', None)
                self.global_state.update(exec_globals)
            
            # Prepare result
            result = {
                "success": not stderr,
                "stdout": stdout[:10000],  # Limit output
                "stderr": stderr[:5000],   # Limit errors
                "execution_time": round(execution_time, 4),
                "code": code
            }
            
            # Add result value if exists
            if result_value is not None:
                try:
                    result["result"] = str(result_value)[:1000]
                except:
                    result["result"] = repr(result_value)[:1000]
            
            # Add variables in state
            if persist_state:
                variables = {k: type(v).__name__ for k, v in self.global_state.items() 
                           if not k.startswith('_')}
                if variables:
                    result["variables"] = variables
            
            return result
            
        except Exception as e:
            logger.error(f"Python REPL error: {e}")
            return {
                "success": False,
                "error": str(e),
                "code": code
            }

# Export for use
python_repl = PythonReplTool()

__all__ = ["python_repl", "PythonReplTool", "PYTHON_REPL_SPEC"]
