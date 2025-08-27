"""
Utility Tools for Strands Agents
Includes journal, handoff_to_user, stop, and other utility functions
"""
import json
import os
from datetime import datetime
from typing import Dict, Any, Optional, List
from pathlib import Path
import structlog
import uuid

logger = structlog.get_logger()

# Journal Tool
JOURNAL_SPEC = {
    "name": "journal",
    "description": (
        "Create and manage structured logs and journal entries. "
        "Useful for maintaining documentation, notes, and agent memory."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["write", "read", "list", "search", "delete"],
                "description": "Journal action to perform"
            },
            "content": {
                "type": "string",
                "description": "Content to write (for write action)"
            },
            "entry_id": {
                "type": "string",
                "description": "Entry ID (for read/delete actions)"
            },
            "query": {
                "type": "string",
                "description": "Search query (for search action)"
            },
            "limit": {
                "type": "integer",
                "description": "Number of entries to return",
                "default": 10
            },
            "category": {
                "type": "string",
                "description": "Entry category/tag",
                "default": "general"
            }
        },
        "required": ["action"]
    }
}

class JournalTool:
    """Journal management tool"""
    
    def __init__(self):
        self.name = "journal"
        self.description = JOURNAL_SPEC["description"]
        self.input_schema = JOURNAL_SPEC["input_schema"]
        
        # Journal storage path
        self.journal_dir = Path("/tmp/agent_journal")
        self.journal_dir.mkdir(exist_ok=True)
        self.journal_file = self.journal_dir / "journal.json"
        
        # Initialize journal
        self._init_journal()
    
    def _init_journal(self):
        """Initialize journal file if it doesn't exist"""
        if not self.journal_file.exists():
            with open(self.journal_file, 'w') as f:
                json.dump({"entries": []}, f)
    
    def _load_journal(self) -> Dict[str, Any]:
        """Load journal from file"""
        try:
            with open(self.journal_file, 'r') as f:
                return json.load(f)
        except:
            return {"entries": []}
    
    def _save_journal(self, journal: Dict[str, Any]):
        """Save journal to file"""
        with open(self.journal_file, 'w') as f:
            json.dump(journal, f, indent=2)
    
    async def __call__(self, **kwargs):
        """Execute journal action"""
        action = kwargs.get("action")
        
        try:
            if action == "write":
                return await self._write_entry(kwargs)
            elif action == "read":
                return await self._read_entry(kwargs)
            elif action == "list":
                return await self._list_entries(kwargs)
            elif action == "search":
                return await self._search_entries(kwargs)
            elif action == "delete":
                return await self._delete_entry(kwargs)
            else:
                return {"success": False, "error": f"Unknown action: {action}"}
        except Exception as e:
            logger.error(f"Journal error: {e}")
            return {"success": False, "error": str(e)}
    
    async def _write_entry(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Write a new journal entry"""
        content = params.get("content")
        category = params.get("category", "general")
        
        if not content:
            return {"success": False, "error": "Content is required"}
        
        # Create entry
        entry = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now().isoformat(),
            "content": content,
            "category": category
        }
        
        # Load and update journal
        journal = self._load_journal()
        journal["entries"].append(entry)
        
        # Keep only last 1000 entries
        if len(journal["entries"]) > 1000:
            journal["entries"] = journal["entries"][-1000:]
        
        self._save_journal(journal)
        
        return {
            "success": True,
            "entry_id": entry["id"],
            "message": "Journal entry created",
            "timestamp": entry["timestamp"]
        }
    
    async def _read_entry(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Read a specific journal entry"""
        entry_id = params.get("entry_id")
        
        if not entry_id:
            return {"success": False, "error": "Entry ID is required"}
        
        journal = self._load_journal()
        
        for entry in journal["entries"]:
            if entry["id"] == entry_id:
                return {
                    "success": True,
                    "entry": entry
                }
        
        return {"success": False, "error": f"Entry not found: {entry_id}"}
    
    async def _list_entries(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """List recent journal entries"""
        limit = params.get("limit", 10)
        category = params.get("category")
        
        journal = self._load_journal()
        entries = journal["entries"]
        
        # Filter by category if specified
        if category:
            entries = [e for e in entries if e.get("category") == category]
        
        # Get recent entries
        recent_entries = entries[-limit:] if entries else []
        recent_entries.reverse()  # Most recent first
        
        return {
            "success": True,
            "entries": recent_entries,
            "count": len(recent_entries),
            "total": len(entries)
        }
    
    async def _search_entries(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Search journal entries"""
        query = params.get("query", "")
        limit = params.get("limit", 10)
        
        if not query:
            return {"success": False, "error": "Query is required"}
        
        journal = self._load_journal()
        query_lower = query.lower()
        
        # Search in content
        matches = []
        for entry in journal["entries"]:
            if query_lower in entry["content"].lower():
                matches.append(entry)
        
        # Limit results
        matches = matches[-limit:] if len(matches) > limit else matches
        matches.reverse()  # Most recent first
        
        return {
            "success": True,
            "entries": matches,
            "count": len(matches),
            "query": query
        }
    
    async def _delete_entry(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Delete a journal entry"""
        entry_id = params.get("entry_id")
        
        if not entry_id:
            return {"success": False, "error": "Entry ID is required"}
        
        journal = self._load_journal()
        original_count = len(journal["entries"])
        
        journal["entries"] = [e for e in journal["entries"] if e["id"] != entry_id]
        
        if len(journal["entries"]) == original_count:
            return {"success": False, "error": f"Entry not found: {entry_id}"}
        
        self._save_journal(journal)
        
        return {
            "success": True,
            "message": f"Entry deleted: {entry_id}"
        }

# Handoff to User Tool
HANDOFF_TO_USER_SPEC = {
    "name": "handoff_to_user",
    "description": (
        "Hand off control to the user for confirmation, input, or complete task handoff. "
        "Use when human intervention or approval is needed."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "message": {
                "type": "string",
                "description": "Message to display to the user"
            },
            "breakout_of_loop": {
                "type": "boolean",
                "description": "If true, stops agent execution completely",
                "default": False
            },
            "options": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional list of choices for the user"
            },
            "require_confirmation": {
                "type": "boolean",
                "description": "Whether to require explicit user confirmation",
                "default": True
            }
        },
        "required": ["message"]
    }
}

class HandoffToUserTool:
    """Hand off control to user"""
    
    def __init__(self):
        self.name = "handoff_to_user"
        self.description = HANDOFF_TO_USER_SPEC["description"]
        self.input_schema = HANDOFF_TO_USER_SPEC["input_schema"]
    
    async def __call__(self, **kwargs):
        """Execute handoff to user"""
        message = kwargs.get("message")
        breakout_of_loop = kwargs.get("breakout_of_loop", False)
        options = kwargs.get("options", [])
        require_confirmation = kwargs.get("require_confirmation", True)
        
        if not message:
            return {"success": False, "error": "Message is required"}
        
        result = {
            "success": True,
            "action": "handoff_to_user",
            "message": message,
            "breakout": breakout_of_loop,
            "timestamp": datetime.now().isoformat()
        }
        
        if options:
            result["options"] = options
        
        if require_confirmation:
            result["requires_confirmation"] = True
            result["confirmation_prompt"] = "Please confirm to proceed (yes/no)"
        
        # Log the handoff
        logger.info(f"Handoff to user: {message}")
        
        # In a real implementation, this would trigger UI interaction
        # For now, we simulate user response
        result["user_response"] = "confirmed"  # Simulated
        
        return result

# Stop Tool
STOP_SPEC = {
    "name": "stop",
    "description": (
        "Gracefully terminate agent execution with a custom message. "
        "Use to indicate task completion or errors."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "message": {
                "type": "string",
                "description": "Final message to display",
                "default": "Task completed"
            },
            "status": {
                "type": "string",
                "enum": ["success", "error", "cancelled", "timeout"],
                "description": "Final status of the task",
                "default": "success"
            },
            "result": {
                "type": ["object", "string", "null"],
                "description": "Optional final result to return"
            }
        }
    }
}

class StopTool:
    """Stop agent execution"""
    
    def __init__(self):
        self.name = "stop"
        self.description = STOP_SPEC["description"]
        self.input_schema = STOP_SPEC["input_schema"]
    
    async def __call__(self, **kwargs):
        """Execute stop command"""
        message = kwargs.get("message", "Task completed")
        status = kwargs.get("status", "success")
        result = kwargs.get("result")
        
        response = {
            "success": True,
            "action": "stop",
            "message": message,
            "status": status,
            "timestamp": datetime.now().isoformat(),
            "should_stop": True  # Signal to agent to stop
        }
        
        if result is not None:
            response["result"] = result
        
        # Log the stop
        logger.info(f"Agent stopping: {message} (status: {status})")
        
        return response

# Export tools
journal = JournalTool()
handoff_to_user = HandoffToUserTool()
stop = StopTool()

__all__ = [
    "journal", "JournalTool", "JOURNAL_SPEC",
    "handoff_to_user", "HandoffToUserTool", "HANDOFF_TO_USER_SPEC",
    "stop", "StopTool", "STOP_SPEC"
]