#!/usr/bin/env python3
"""
Filesystem MCP Server for Swarm Collaboration
Provides secure file operations for agents
"""
from mcp.server import FastMCP
from typing import Dict, Any, List
import os
import json
import structlog

logger = structlog.get_logger()

# Create MCP server
mcp = FastMCP("Filesystem Server")

# Configure allowed directories (for security)
ALLOWED_DIRS = [
    "/tmp/swarm_workspace",
    "./workspace"
]

def is_path_allowed(path: str) -> bool:
    """Check if path is within allowed directories"""
    abs_path = os.path.abspath(path)
    for allowed_dir in ALLOWED_DIRS:
        allowed_abs = os.path.abspath(allowed_dir)
        if abs_path.startswith(allowed_abs):
            return True
    return False

@mcp.tool(description="List files in a directory")
def list_files(directory: str = "./workspace") -> Dict[str, Any]:
    """List all files in the specified directory"""
    if not is_path_allowed(directory):
        return {"error": "Access denied: Directory not in allowed paths"}
    
    try:
        os.makedirs(directory, exist_ok=True)
        files = os.listdir(directory)
        return {
            "directory": directory,
            "files": files,
            "count": len(files)
        }
    except Exception as e:
        return {"error": str(e)}

@mcp.tool(description="Read a file's contents")
def read_file(filepath: str) -> Dict[str, Any]:
    """Read and return the contents of a file"""
    if not is_path_allowed(filepath):
        return {"error": "Access denied: File not in allowed paths"}
    
    try:
        with open(filepath, 'r') as f:
            content = f.read()
        return {
            "filepath": filepath,
            "content": content,
            "size": len(content)
        }
    except Exception as e:
        return {"error": str(e)}

@mcp.tool(description="Write content to a file")
def write_file(filepath: str, content: str) -> Dict[str, Any]:
    """Write content to a file (creates if doesn't exist)"""
    if not is_path_allowed(filepath):
        return {"error": "Access denied: File not in allowed paths"}
    
    try:
        # Ensure directory exists
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        
        with open(filepath, 'w') as f:
            f.write(content)
        return {
            "filepath": filepath,
            "success": True,
            "size": len(content)
        }
    except Exception as e:
        return {"error": str(e)}

@mcp.tool(description="Delete a file")
def delete_file(filepath: str) -> Dict[str, Any]:
    """Delete a file"""
    if not is_path_allowed(filepath):
        return {"error": "Access denied: File not in allowed paths"}
    
    try:
        os.remove(filepath)
        return {
            "filepath": filepath,
            "success": True,
            "message": "File deleted successfully"
        }
    except Exception as e:
        return {"error": str(e)}

@mcp.tool(description="Create a directory")
def create_directory(directory: str) -> Dict[str, Any]:
    """Create a new directory"""
    if not is_path_allowed(directory):
        return {"error": "Access denied: Directory not in allowed paths"}
    
    try:
        os.makedirs(directory, exist_ok=True)
        return {
            "directory": directory,
            "success": True,
            "message": "Directory created successfully"
        }
    except Exception as e:
        return {"error": str(e)}

@mcp.tool(description="Get file information")
def file_info(filepath: str) -> Dict[str, Any]:
    """Get detailed information about a file"""
    if not is_path_allowed(filepath):
        return {"error": "Access denied: File not in allowed paths"}
    
    try:
        stat = os.stat(filepath)
        return {
            "filepath": filepath,
            "size": stat.st_size,
            "modified": stat.st_mtime,
            "created": stat.st_ctime,
            "is_file": os.path.isfile(filepath),
            "is_directory": os.path.isdir(filepath),
            "exists": os.path.exists(filepath)
        }
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    print("📁 Filesystem MCP Server")
    print("=" * 50)
    print("Provides secure file operations for swarm agents")
    print("Available tools:")
    print("  - list_files: List directory contents")
    print("  - read_file: Read file contents")
    print("  - write_file: Write to files")
    print("  - delete_file: Delete files")
    print("  - create_directory: Create directories")
    print("  - file_info: Get file metadata")
    print("=" * 50)
    print("Server will run on default port 8000")
    
    # Ensure workspace exists
    os.makedirs("./workspace", exist_ok=True)
    
    mcp.run(transport="streamable-http")