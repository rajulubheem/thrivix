"""
Basic File Operation Tools for Strands Agents
Simple file read and write operations
"""
import os
from pathlib import Path
from typing import Dict, Any, Optional
import structlog
import json

logger = structlog.get_logger()

# File Read Tool
FILE_READ_SPEC = {
    "name": "file_read",
    "description": "Read content from a file",
    "input_schema": {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "Path to the file to read"
            },
            "encoding": {
                "type": "string",
                "description": "File encoding",
                "default": "utf-8"
            }
        },
        "required": ["path"]
    }
}

class FileReadTool:
    """Simple file read tool"""
    
    def __init__(self):
        self.name = "file_read"
        self.description = FILE_READ_SPEC["description"]
        self.input_schema = FILE_READ_SPEC["input_schema"]
    
    async def __call__(self, **kwargs):
        """Read file content"""
        path = kwargs.get("path")
        encoding = kwargs.get("encoding", "utf-8")
        
        if not path:
            return {"success": False, "error": "Path is required"}
        
        file_path = Path(path)
        
        if not file_path.exists():
            return {"success": False, "error": f"File not found: {path}"}
        
        if not file_path.is_file():
            return {"success": False, "error": f"Path is not a file: {path}"}
        
        try:
            with open(file_path, 'r', encoding=encoding) as f:
                content = f.read()
            
            return {
                "success": True,
                "content": content,
                "path": str(file_path),
                "size": len(content),
                "lines": content.count('\n') + 1 if content else 0
            }
        except UnicodeDecodeError:
            return {
                "success": False,
                "error": f"Unable to decode file with {encoding} encoding"
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

# File Write Tool
FILE_WRITE_SPEC = {
    "name": "file_write",
    "description": "Write content to a file",
    "input_schema": {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "Path to the file to write"
            },
            "content": {
                "type": "string",
                "description": "Content to write to the file"
            },
            "mode": {
                "type": "string",
                "enum": ["write", "append"],
                "description": "Write mode",
                "default": "write"
            },
            "encoding": {
                "type": "string",
                "description": "File encoding",
                "default": "utf-8"
            },
            "create_dirs": {
                "type": "boolean",
                "description": "Create parent directories if they don't exist",
                "default": True
            }
        },
        "required": ["path", "content"]
    }
}

class FileWriteTool:
    """Simple file write tool"""
    
    def __init__(self):
        self.name = "file_write"
        self.description = FILE_WRITE_SPEC["description"]
        self.input_schema = FILE_WRITE_SPEC["input_schema"]
    
    async def __call__(self, **kwargs):
        """Write content to file"""
        path = kwargs.get("path")
        content = kwargs.get("content", "")
        mode = kwargs.get("mode", "write")
        encoding = kwargs.get("encoding", "utf-8")
        create_dirs = kwargs.get("create_dirs", True)
        
        if not path:
            return {"success": False, "error": "Path is required"}
        
        file_path = Path(path)
        
        try:
            # Create parent directories if needed
            if create_dirs and not file_path.parent.exists():
                file_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Determine file mode
            file_mode = 'w' if mode == 'write' else 'a'
            
            with open(file_path, file_mode, encoding=encoding) as f:
                f.write(content)
            
            return {
                "success": True,
                "message": f"File {'written' if mode == 'write' else 'appended'} successfully",
                "path": str(file_path),
                "size": len(content),
                "mode": mode
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

# Export tools
file_read = FileReadTool()
file_write = FileWriteTool()

__all__ = [
    "file_read", "FileReadTool", "FILE_READ_SPEC",
    "file_write", "FileWriteTool", "FILE_WRITE_SPEC"
]