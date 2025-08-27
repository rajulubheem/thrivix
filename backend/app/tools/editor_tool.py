"""
Advanced Editor Tool for Strands Agents
Provides advanced file operations like syntax highlighting, pattern replacement, and multi-file edits
"""
import os
import re
from typing import Dict, Any, Optional, List, Union
from pathlib import Path
import structlog

logger = structlog.get_logger()

TOOL_SPEC = {
    "name": "editor",
    "description": (
        "Advanced file editor with syntax highlighting, pattern replacement, and multi-file operations. "
        "Supports viewing, creating, editing, and searching files with context awareness."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "command": {
                "type": "string",
                "enum": ["view", "create", "edit", "replace", "search", "append", "insert"],
                "description": "The editor command to execute"
            },
            "path": {
                "type": "string",
                "description": "File path to operate on"
            },
            "content": {
                "type": "string",
                "description": "Content for create/append operations"
            },
            "old_str": {
                "type": "string",
                "description": "String to find for replace operations"
            },
            "new_str": {
                "type": "string",
                "description": "String to replace with"
            },
            "pattern": {
                "type": "string",
                "description": "Regex pattern for search operations"
            },
            "line_number": {
                "type": "integer",
                "description": "Line number for insert operations"
            },
            "view_range": {
                "type": "array",
                "items": {"type": "integer"},
                "description": "Start and end line numbers for viewing [start, end]"
            }
        },
        "required": ["command", "path"]
    }
}

class EditorTool:
    """Advanced editor tool for file operations"""
    
    def __init__(self):
        self.name = "editor"
        self.description = TOOL_SPEC["description"]
        self.input_schema = TOOL_SPEC["input_schema"]
    
    async def __call__(self, **kwargs):
        """Execute the editor command"""
        command = kwargs.get("command")
        path = kwargs.get("path")
        
        if not path:
            return {"success": False, "error": "Path is required"}
        
        # Convert to Path object
        file_path = Path(path)
        
        try:
            if command == "view":
                return await self.view_file(file_path, kwargs.get("view_range"))
            elif command == "create":
                return await self.create_file(file_path, kwargs.get("content", ""))
            elif command == "edit":
                return await self.edit_file(file_path, kwargs.get("content", ""))
            elif command == "replace":
                return await self.replace_in_file(
                    file_path, 
                    kwargs.get("old_str", ""),
                    kwargs.get("new_str", "")
                )
            elif command == "search":
                return await self.search_in_file(file_path, kwargs.get("pattern", ""))
            elif command == "append":
                return await self.append_to_file(file_path, kwargs.get("content", ""))
            elif command == "insert":
                return await self.insert_at_line(
                    file_path,
                    kwargs.get("line_number", 1),
                    kwargs.get("content", "")
                )
            else:
                return {"success": False, "error": f"Unknown command: {command}"}
        except Exception as e:
            logger.error(f"Editor operation failed: {e}")
            return {"success": False, "error": str(e)}
    
    async def view_file(self, path: Path, view_range: Optional[List[int]] = None) -> Dict[str, Any]:
        """View file contents with optional line range"""
        if not path.exists():
            return {"success": False, "error": f"File not found: {path}"}
        
        try:
            with open(path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            if view_range and len(view_range) == 2:
                start, end = view_range
                start = max(1, start) - 1  # Convert to 0-indexed
                end = min(len(lines), end)
                lines = lines[start:end]
                line_numbers = range(start + 1, end + 1)
            else:
                line_numbers = range(1, len(lines) + 1)
            
            # Format with line numbers
            formatted_lines = []
            for i, line in zip(line_numbers, lines):
                formatted_lines.append(f"{i:4d} | {line.rstrip()}")
            
            return {
                "success": True,
                "content": "\n".join(formatted_lines),
                "total_lines": len(lines),
                "file_path": str(path),
                "file_extension": path.suffix
            }
        except Exception as e:
            return {"success": False, "error": f"Failed to read file: {str(e)}"}
    
    async def create_file(self, path: Path, content: str) -> Dict[str, Any]:
        """Create a new file with content"""
        if path.exists():
            return {"success": False, "error": f"File already exists: {path}"}
        
        try:
            # Create parent directories if needed
            path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            return {
                "success": True,
                "message": f"File created: {path}",
                "file_path": str(path),
                "size": len(content)
            }
        except Exception as e:
            return {"success": False, "error": f"Failed to create file: {str(e)}"}
    
    async def edit_file(self, path: Path, content: str) -> Dict[str, Any]:
        """Overwrite file with new content"""
        if not path.exists():
            return {"success": False, "error": f"File not found: {path}"}
        
        try:
            # Backup original content
            with open(path, 'r', encoding='utf-8') as f:
                original = f.read()
            
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            return {
                "success": True,
                "message": f"File edited: {path}",
                "file_path": str(path),
                "original_size": len(original),
                "new_size": len(content)
            }
        except Exception as e:
            return {"success": False, "error": f"Failed to edit file: {str(e)}"}
    
    async def replace_in_file(self, path: Path, old_str: str, new_str: str) -> Dict[str, Any]:
        """Replace string in file"""
        if not path.exists():
            return {"success": False, "error": f"File not found: {path}"}
        
        if not old_str:
            return {"success": False, "error": "old_str is required for replace operation"}
        
        try:
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Count replacements
            count = content.count(old_str)
            if count == 0:
                return {
                    "success": False,
                    "error": f"String '{old_str}' not found in file"
                }
            
            # Perform replacement
            new_content = content.replace(old_str, new_str)
            
            with open(path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            
            return {
                "success": True,
                "message": f"Replaced {count} occurrences",
                "file_path": str(path),
                "replacements": count
            }
        except Exception as e:
            return {"success": False, "error": f"Failed to replace in file: {str(e)}"}
    
    async def search_in_file(self, path: Path, pattern: str) -> Dict[str, Any]:
        """Search for pattern in file"""
        if not path.exists():
            return {"success": False, "error": f"File not found: {path}"}
        
        if not pattern:
            return {"success": False, "error": "Pattern is required for search operation"}
        
        try:
            with open(path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            matches = []
            regex = re.compile(pattern, re.IGNORECASE)
            
            for i, line in enumerate(lines, 1):
                if regex.search(line):
                    matches.append({
                        "line_number": i,
                        "content": line.rstrip(),
                        "matches": regex.findall(line)
                    })
            
            return {
                "success": True,
                "file_path": str(path),
                "pattern": pattern,
                "match_count": len(matches),
                "matches": matches[:20]  # Limit to first 20 matches
            }
        except re.error as e:
            return {"success": False, "error": f"Invalid regex pattern: {str(e)}"}
        except Exception as e:
            return {"success": False, "error": f"Search failed: {str(e)}"}
    
    async def append_to_file(self, path: Path, content: str) -> Dict[str, Any]:
        """Append content to end of file"""
        if not path.exists():
            return await self.create_file(path, content)
        
        try:
            with open(path, 'a', encoding='utf-8') as f:
                f.write(content)
            
            return {
                "success": True,
                "message": f"Content appended to {path}",
                "file_path": str(path),
                "appended_size": len(content)
            }
        except Exception as e:
            return {"success": False, "error": f"Failed to append to file: {str(e)}"}
    
    async def insert_at_line(self, path: Path, line_number: int, content: str) -> Dict[str, Any]:
        """Insert content at specific line number"""
        if not path.exists():
            return {"success": False, "error": f"File not found: {path}"}
        
        try:
            with open(path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            # Validate line number
            if line_number < 1 or line_number > len(lines) + 1:
                return {
                    "success": False,
                    "error": f"Invalid line number: {line_number} (file has {len(lines)} lines)"
                }
            
            # Insert content
            lines.insert(line_number - 1, content + '\n')
            
            with open(path, 'w', encoding='utf-8') as f:
                f.writelines(lines)
            
            return {
                "success": True,
                "message": f"Content inserted at line {line_number}",
                "file_path": str(path),
                "total_lines": len(lines)
            }
        except Exception as e:
            return {"success": False, "error": f"Failed to insert content: {str(e)}"}

# Export for use
editor = EditorTool()

__all__ = ["editor", "EditorTool", "TOOL_SPEC"]