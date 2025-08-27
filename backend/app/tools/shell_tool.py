"""
Shell Command Tool for Strands Agents
Execute shell commands with safety restrictions
"""
import subprocess
import asyncio
import os
from typing import Dict, Any, Optional, List, Union
import structlog
import shlex
from pathlib import Path

logger = structlog.get_logger()

SHELL_COMMAND_SPEC = {
    "name": "shell_command",
    "description": (
        "Execute shell commands with safety restrictions. "
        "Supports command execution with output capture and timeout control."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "command": {
                "type": ["string", "array"],
                "description": "Shell command to execute (string) or list of commands"
            },
            "cwd": {
                "type": "string",
                "description": "Working directory for command execution"
            },
            "timeout": {
                "type": "integer",
                "description": "Command timeout in seconds",
                "default": 30,
                "maximum": 300
            },
            "ignore_errors": {
                "type": "boolean",
                "description": "Continue execution even if command fails",
                "default": False
            },
            "capture_output": {
                "type": "boolean",
                "description": "Capture command output",
                "default": True
            }
        },
        "required": ["command"]
    }
}

class ShellCommandTool:
    """Shell command execution tool with safety features"""
    
    def __init__(self):
        self.name = "shell_command"
        self.description = SHELL_COMMAND_SPEC["description"]
        self.input_schema = SHELL_COMMAND_SPEC["input_schema"]
        
        # Allowed commands for safety (can be configured)
        self.allowed_commands = [
            'ls', 'cat', 'echo', 'pwd', 'date', 'whoami', 'env',
            'grep', 'find', 'head', 'tail', 'wc', 'sort', 'uniq',
            'curl', 'wget', 'git', 'npm', 'pip', 'python', 'node',
            'mkdir', 'touch', 'cp', 'mv', 'chmod', 'df', 'du'
        ]
        
        # Dangerous patterns to block
        self.dangerous_patterns = [
            'rm -rf', 'rm -fr', 'dd if=', 'mkfs', 'format',
            '> /dev/', 'sudo', 'su -', 'passwd', 'useradd',
            'systemctl', 'service', 'kill -9', 'pkill',
            'nc -l', 'netcat', '/etc/passwd', '/etc/shadow'
        ]
    
    async def __call__(self, **kwargs):
        """Execute shell command(s)"""
        command = kwargs.get("command")
        cwd = kwargs.get("cwd")
        timeout = kwargs.get("timeout", 30)
        ignore_errors = kwargs.get("ignore_errors", False)
        capture_output = kwargs.get("capture_output", True)
        
        if not command:
            return {"success": False, "error": "Command is required"}
        
        # Handle list of commands
        if isinstance(command, list):
            results = []
            for cmd in command:
                result = await self._execute_single_command(
                    cmd, cwd, timeout, ignore_errors, capture_output
                )
                results.append(result)
                if not result["success"] and not ignore_errors:
                    return {
                        "success": False,
                        "error": f"Command failed: {cmd}",
                        "results": results
                    }
            return {
                "success": all(r["success"] for r in results),
                "results": results,
                "command_count": len(results)
            }
        else:
            return await self._execute_single_command(
                command, cwd, timeout, ignore_errors, capture_output
            )
    
    async def _execute_single_command(
        self, 
        command: str, 
        cwd: Optional[str],
        timeout: int,
        ignore_errors: bool,
        capture_output: bool
    ) -> Dict[str, Any]:
        """Execute a single shell command"""
        
        # Safety check
        if not self._is_safe_command(command):
            return {
                "success": False,
                "error": f"Command blocked for safety: {command}",
                "hint": "This command contains potentially dangerous operations"
            }
        
        # Validate timeout
        if timeout > 300:
            timeout = 300  # Max 5 minutes
        
        # Validate working directory
        if cwd:
            cwd_path = Path(cwd)
            if not cwd_path.exists():
                return {
                    "success": False,
                    "error": f"Working directory does not exist: {cwd}"
                }
            if not cwd_path.is_dir():
                return {
                    "success": False,
                    "error": f"Path is not a directory: {cwd}"
                }
        
        try:
            logger.info(f"Executing shell command: {command}")
            
            # Run the command
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE if capture_output else None,
                stderr=asyncio.subprocess.PIPE if capture_output else None,
                cwd=cwd,
                env=os.environ.copy()
            )
            
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=timeout
                )
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
                return {
                    "success": False,
                    "error": f"Command timed out after {timeout} seconds",
                    "command": command
                }
            
            # Process output
            stdout_text = stdout.decode('utf-8', errors='replace') if stdout else ""
            stderr_text = stderr.decode('utf-8', errors='replace') if stderr else ""
            
            # Check success
            success = process.returncode == 0 or ignore_errors
            
            result = {
                "success": success,
                "command": command,
                "return_code": process.returncode,
                "stdout": stdout_text[:10000],  # Limit output size
                "stderr": stderr_text[:5000],    # Limit error size
                "cwd": cwd or os.getcwd()
            }
            
            if not success and not ignore_errors:
                result["error"] = f"Command failed with return code {process.returncode}"
            
            return result
            
        except Exception as e:
            logger.error(f"Shell command error: {e}")
            return {
                "success": False,
                "error": str(e),
                "command": command
            }
    
    def _is_safe_command(self, command: str) -> bool:
        """Check if command is safe to execute"""
        
        # Check for dangerous patterns
        command_lower = command.lower()
        for pattern in self.dangerous_patterns:
            if pattern.lower() in command_lower:
                logger.warning(f"Blocked dangerous command pattern: {pattern}")
                return False
        
        # Parse command to get the base command
        try:
            parts = shlex.split(command)
            if not parts:
                return False
            
            base_command = parts[0]
            
            # Allow full paths to allowed commands
            if '/' in base_command:
                base_command = os.path.basename(base_command)
            
            # Check if base command is in allowed list
            # For now, allow all commands except explicitly dangerous ones
            # In production, you might want to restrict to allowed_commands only
            # return base_command in self.allowed_commands
            
            return True  # Allow all non-dangerous commands
            
        except Exception as e:
            logger.warning(f"Could not parse command for safety check: {e}")
            return False

# Export for use
shell_command = ShellCommandTool()

__all__ = ["shell_command", "ShellCommandTool", "SHELL_COMMAND_SPEC"]