"""
Tool Testing Endpoint
Allows testing tools directly without agents
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
import structlog
import time
import json
from app.tools.tool_registry import tool_registry
from app.api.v1.endpoints.settings import load_settings

router = APIRouter()
logger = structlog.get_logger()

class ToolTestRequest(BaseModel):
    tool_name: str
    parameters: Dict[str, Any]

class ToolTestResponse(BaseModel):
    success: bool
    result: Optional[Any] = None
    error: Optional[str] = None
    execution_time: float

@router.post("/test")
async def test_tool(request: ToolTestRequest) -> ToolTestResponse:
    """
    Test a specific tool with given parameters
    """
    start_time = time.time()
    
    try:
        # First check if tool exists in registry
        tool = tool_registry.get_tool(request.tool_name)
        if not tool:
            return ToolTestResponse(
                success=False,
                result=None,
                error=f"Tool '{request.tool_name}' not found",
                execution_time=time.time() - start_time
            )
        
        # Load settings to check if tool is explicitly disabled
        settings = load_settings()
        
        # Check if tool is in settings and explicitly disabled
        if request.tool_name in settings.tools:
            tool_config = settings.tools[request.tool_name]
            if not tool_config.enabled:
                return ToolTestResponse(
                    success=False,
                    result=None,
                    error=f"Tool '{request.tool_name}' is disabled. Enable it in settings first.",
                    execution_time=time.time() - start_time
                )
        
        logger.info(f"Testing tool: {request.tool_name} with params: {request.parameters}")
        
        # First try to execute through tool registry
        tool = tool_registry.get_tool(request.tool_name)
        if tool:
            try:
                result = await tool_registry.execute_tool(request.tool_name, request.parameters)
                
                if result and result.get('success') is not None:
                    return ToolTestResponse(
                        success=result.get('success', True),
                        result=result,
                        error=result.get('error'),
                        execution_time=time.time() - start_time
                    )
            except Exception as e:
                logger.debug(f"Tool registry execution failed, trying legacy method: {e}")
        
        # Fall back to legacy tool execution
        result = None
        
        if request.tool_name == "tavily_search":
            # Execute Tavily search
            try:
                from app.tools.tavily_tool import tavily_search
                result = await tavily_search(
                    query=request.parameters.get("query", ""),
                    max_results=request.parameters.get("max_results", 5),
                    search_depth=request.parameters.get("search_depth", "basic")
                )
            except ImportError as e:
                logger.error(f"Failed to import tavily_search: {e}")
                # If Tavily not available, try the tool service
                try:
                    result = await tool_service.execute_tool(
                        request.tool_name,
                        request.parameters,
                        agent_name="tool_tester"
                    )
                except Exception as service_err:
                    logger.error(f"Tool service also failed: {service_err}")
                    return ToolTestResponse(
                        success=False,
                        result=None,
                        error=f"Tavily search not available: {str(e)}",
                        execution_time=time.time() - start_time
                    )
            except Exception as e:
                logger.error(f"Tavily search failed: {e}")
                error_msg = str(e)
                if "API key" in error_msg or "401" in error_msg:
                    error_msg = "Tavily API key not configured. Please set TAVILY_API_KEY environment variable."
                return ToolTestResponse(
                    success=False,
                    result=None,
                    error=error_msg,
                    execution_time=time.time() - start_time
                )
                
        elif request.tool_name == "file_write":
            # Execute file write
            path = request.parameters.get("path", "/tmp/test.txt")
            content = request.parameters.get("content", "")
            
            try:
                # Security check - only allow /tmp for testing
                if not path.startswith("/tmp/"):
                    return ToolTestResponse(
                        success=False,
                        result=None,
                        error="For security, test file writes are only allowed in /tmp/ directory",
                        execution_time=time.time() - start_time
                    )
                
                with open(path, "w") as f:
                    f.write(content)
                
                result = {
                    "status": "success",
                    "message": f"File written successfully to {path}",
                    "bytes_written": len(content),
                    "path": path
                }
            except Exception as e:
                return ToolTestResponse(
                    success=False,
                    result=None,
                    error=f"File write failed: {str(e)}",
                    execution_time=time.time() - start_time
                )
                
        elif request.tool_name == "file_read":
            # Execute file read
            path = request.parameters.get("path", "/tmp/test.txt")
            
            try:
                with open(path, "r") as f:
                    content = f.read()
                
                result = {
                    "status": "success",
                    "content": content,
                    "path": path,
                    "size": len(content),
                    "lines": content.count('\n') + 1 if content else 0
                }
            except FileNotFoundError:
                return ToolTestResponse(
                    success=False,
                    result=None,
                    error=f"File not found: {path}",
                    execution_time=time.time() - start_time
                )
            except Exception as e:
                return ToolTestResponse(
                    success=False,
                    result=None,
                    error=f"File read failed: {str(e)}",
                    execution_time=time.time() - start_time
                )
                
        elif request.tool_name == "python_repl":
            # Execute Python code
            code = request.parameters.get("code", "")
            
            try:
                import io
                import sys
                from contextlib import redirect_stdout, redirect_stderr
                
                # Capture output
                stdout = io.StringIO()
                stderr = io.StringIO()
                
                # Create a limited globals dict for safety
                safe_globals = {
                    "__builtins__": __builtins__,
                    "print": print,
                }
                
                with redirect_stdout(stdout), redirect_stderr(stderr):
                    exec(code, safe_globals)
                
                result = {
                    "status": "success",
                    "stdout": stdout.getvalue(),
                    "stderr": stderr.getvalue(),
                    "code_executed": code
                }
            except Exception as e:
                return ToolTestResponse(
                    success=False,
                    result=None,
                    error=f"Python execution failed: {str(e)}",
                    execution_time=time.time() - start_time
                )
                
        elif request.tool_name == "shell_command":
            # Execute shell command (with restrictions)
            command = request.parameters.get("command", "")
            
            # Security: Only allow safe commands for testing
            safe_commands = ["echo", "date", "pwd", "ls", "cat /tmp/"]
            if not any(command.startswith(cmd) for cmd in safe_commands):
                return ToolTestResponse(
                    success=False,
                    result=None,
                    error=f"For security, only these commands are allowed in test: {safe_commands}",
                    execution_time=time.time() - start_time
                )
            
            try:
                import subprocess
                process = subprocess.run(
                    command,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                result = {
                    "status": "success",
                    "stdout": process.stdout,
                    "stderr": process.stderr,
                    "return_code": process.returncode,
                    "command": command
                }
            except subprocess.TimeoutExpired:
                return ToolTestResponse(
                    success=False,
                    result=None,
                    error="Command timed out after 5 seconds",
                    execution_time=time.time() - start_time
                )
            except Exception as e:
                return ToolTestResponse(
                    success=False,
                    result=None,
                    error=f"Shell command failed: {str(e)}",
                    execution_time=time.time() - start_time
                )
        else:
            # Tool not found in registry or legacy methods
            return ToolTestResponse(
                success=False,
                result=None,
                error=f"Tool '{request.tool_name}' not found or not implemented",
                execution_time=time.time() - start_time
            )
        
        execution_time = time.time() - start_time
        
        return ToolTestResponse(
            success=True,
            result=result,
            error=None,
            execution_time=execution_time
        )
        
    except Exception as e:
        logger.error(f"Tool test failed: {e}")
        return ToolTestResponse(
            success=False,
            result=None,
            error=str(e),
            execution_time=time.time() - start_time
        )