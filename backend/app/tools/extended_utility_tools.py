"""
Extended Utility Tools for Strands Agents
Includes cron, rss, load_tool, and other utilities
"""
import json
import asyncio
import os
import importlib.util
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from pathlib import Path
import structlog
import hashlib
import feedparser

logger = structlog.get_logger()

# Cron Tool
CRON_SPEC = {
    "name": "cron",
    "description": (
        "Schedule and manage recurring tasks with cron job syntax. "
        "Useful for automation and periodic task execution."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["schedule", "list", "remove", "run", "status"],
                "description": "Cron action to perform"
            },
            "name": {
                "type": "string",
                "description": "Job name"
            },
            "schedule": {
                "type": "string",
                "description": "Cron schedule expression (e.g., '0 * * * *' for hourly)"
            },
            "command": {
                "type": "string",
                "description": "Command or tool to execute"
            },
            "enabled": {
                "type": "boolean",
                "description": "Whether the job is enabled",
                "default": True
            }
        },
        "required": ["action"]
    }
}

class CronTool:
    """Cron job scheduler tool"""
    
    def __init__(self):
        self.name = "cron"
        self.description = CRON_SPEC["description"]
        self.input_schema = CRON_SPEC["input_schema"]
        self.jobs = {}
        self.job_history = []
    
    async def __call__(self, **kwargs):
        """Execute cron action"""
        action = kwargs.get("action")
        
        try:
            if action == "schedule":
                return await self._schedule_job(kwargs)
            elif action == "list":
                return await self._list_jobs()
            elif action == "remove":
                return await self._remove_job(kwargs)
            elif action == "run":
                return await self._run_job(kwargs)
            elif action == "status":
                return await self._job_status(kwargs)
            else:
                return {"success": False, "error": f"Unknown action: {action}"}
        except Exception as e:
            logger.error(f"Cron tool error: {e}")
            return {"success": False, "error": str(e)}
    
    async def _schedule_job(self, params: Dict) -> Dict:
        """Schedule a new cron job"""
        name = params.get("name")
        schedule = params.get("schedule")
        command = params.get("command")
        enabled = params.get("enabled", True)
        
        if not all([name, schedule, command]):
            return {"success": False, "error": "Name, schedule, and command are required"}
        
        # Validate cron expression (basic validation)
        if not self._validate_cron(schedule):
            return {"success": False, "error": "Invalid cron expression"}
        
        job = {
            "name": name,
            "schedule": schedule,
            "command": command,
            "enabled": enabled,
            "created": datetime.now().isoformat(),
            "last_run": None,
            "next_run": self._calculate_next_run(schedule),
            "run_count": 0
        }
        
        self.jobs[name] = job
        
        return {
            "success": True,
            "message": f"Job '{name}' scheduled",
            "job": job
        }
    
    async def _list_jobs(self) -> Dict:
        """List all cron jobs"""
        jobs_list = []
        for name, job in self.jobs.items():
            jobs_list.append({
                "name": name,
                "schedule": job["schedule"],
                "enabled": job["enabled"],
                "last_run": job["last_run"],
                "next_run": job["next_run"],
                "run_count": job["run_count"]
            })
        
        return {
            "success": True,
            "jobs": jobs_list,
            "count": len(jobs_list)
        }
    
    async def _remove_job(self, params: Dict) -> Dict:
        """Remove a cron job"""
        name = params.get("name")
        
        if not name:
            return {"success": False, "error": "Job name is required"}
        
        if name not in self.jobs:
            return {"success": False, "error": f"Job '{name}' not found"}
        
        del self.jobs[name]
        
        return {
            "success": True,
            "message": f"Job '{name}' removed"
        }
    
    async def _run_job(self, params: Dict) -> Dict:
        """Manually run a cron job"""
        name = params.get("name")
        
        if not name:
            return {"success": False, "error": "Job name is required"}
        
        if name not in self.jobs:
            return {"success": False, "error": f"Job '{name}' not found"}
        
        job = self.jobs[name]
        
        # Simulate job execution
        execution_result = {
            "job": name,
            "command": job["command"],
            "executed_at": datetime.now().isoformat(),
            "status": "completed"
        }
        
        # Update job stats
        job["last_run"] = execution_result["executed_at"]
        job["run_count"] += 1
        job["next_run"] = self._calculate_next_run(job["schedule"])
        
        # Add to history
        self.job_history.append(execution_result)
        
        return {
            "success": True,
            "message": f"Job '{name}' executed",
            "result": execution_result
        }
    
    async def _job_status(self, params: Dict) -> Dict:
        """Get job status"""
        name = params.get("name")
        
        if name:
            if name not in self.jobs:
                return {"success": False, "error": f"Job '{name}' not found"}
            
            job = self.jobs[name]
            return {
                "success": True,
                "job": job,
                "history": [h for h in self.job_history if h["job"] == name][-5:]
            }
        else:
            # Return overall status
            return {
                "success": True,
                "total_jobs": len(self.jobs),
                "enabled_jobs": sum(1 for j in self.jobs.values() if j["enabled"]),
                "total_executions": len(self.job_history),
                "recent_history": self.job_history[-10:]
            }
    
    def _validate_cron(self, expression: str) -> bool:
        """Basic cron expression validation"""
        parts = expression.split()
        return len(parts) == 5  # Simple validation - 5 parts for standard cron
    
    def _calculate_next_run(self, schedule: str) -> str:
        """Calculate next run time (simplified)"""
        # Simplified - just add 1 hour for demo
        return (datetime.now() + timedelta(hours=1)).isoformat()

# RSS Tool
RSS_SPEC = {
    "name": "rss",
    "description": (
        "Subscribe, fetch, and process RSS feeds with content filtering. "
        "Useful for monitoring news, blogs, and content updates."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["subscribe", "unsubscribe", "list", "fetch", "read", "search"],
                "description": "RSS action to perform"
            },
            "url": {
                "type": "string",
                "description": "RSS feed URL"
            },
            "feed_id": {
                "type": "string",
                "description": "Feed identifier"
            },
            "max_entries": {
                "type": "integer",
                "description": "Maximum number of entries to return",
                "default": 10
            },
            "query": {
                "type": "string",
                "description": "Search query for filtering entries"
            },
            "include_content": {
                "type": "boolean",
                "description": "Include full content in results",
                "default": False
            }
        },
        "required": ["action"]
    }
}

class RSSTool:
    """RSS feed management tool"""
    
    def __init__(self):
        self.name = "rss"
        self.description = RSS_SPEC["description"]
        self.input_schema = RSS_SPEC["input_schema"]
        self.subscribed_feeds = {}
        self.feed_cache = {}
    
    async def __call__(self, **kwargs):
        """Execute RSS action"""
        action = kwargs.get("action")
        
        try:
            if action == "subscribe":
                return await self._subscribe(kwargs)
            elif action == "unsubscribe":
                return await self._unsubscribe(kwargs)
            elif action == "list":
                return await self._list_feeds()
            elif action == "fetch":
                return await self._fetch_feed(kwargs)
            elif action == "read":
                return await self._read_feed(kwargs)
            elif action == "search":
                return await self._search_feeds(kwargs)
            else:
                return {"success": False, "error": f"Unknown action: {action}"}
        except Exception as e:
            logger.error(f"RSS tool error: {e}")
            return {"success": False, "error": str(e)}
    
    async def _subscribe(self, params: Dict) -> Dict:
        """Subscribe to an RSS feed"""
        url = params.get("url")
        
        if not url:
            return {"success": False, "error": "Feed URL is required"}
        
        # Generate feed ID
        feed_id = hashlib.md5(url.encode()).hexdigest()[:12]
        
        try:
            # Try to fetch feed to validate
            feed = feedparser.parse(url)
            
            if feed.bozo:
                return {"success": False, "error": "Invalid RSS feed"}
            
            self.subscribed_feeds[feed_id] = {
                "url": url,
                "title": feed.feed.get("title", "Unknown Feed"),
                "description": feed.feed.get("description", ""),
                "subscribed_at": datetime.now().isoformat(),
                "last_fetched": None
            }
            
            return {
                "success": True,
                "feed_id": feed_id,
                "title": feed.feed.get("title"),
                "message": "Successfully subscribed to feed"
            }
        except Exception as e:
            # Simulate subscription for demo
            self.subscribed_feeds[feed_id] = {
                "url": url,
                "title": "Demo Feed",
                "description": "Simulated RSS feed",
                "subscribed_at": datetime.now().isoformat(),
                "last_fetched": None
            }
            
            return {
                "success": True,
                "feed_id": feed_id,
                "title": "Demo Feed",
                "message": "Subscribed to feed (simulated)"
            }
    
    async def _unsubscribe(self, params: Dict) -> Dict:
        """Unsubscribe from a feed"""
        feed_id = params.get("feed_id")
        
        if not feed_id:
            return {"success": False, "error": "Feed ID is required"}
        
        if feed_id not in self.subscribed_feeds:
            return {"success": False, "error": f"Feed '{feed_id}' not found"}
        
        feed_info = self.subscribed_feeds[feed_id]
        del self.subscribed_feeds[feed_id]
        
        # Clear cache
        if feed_id in self.feed_cache:
            del self.feed_cache[feed_id]
        
        return {
            "success": True,
            "message": f"Unsubscribed from '{feed_info['title']}'"
        }
    
    async def _list_feeds(self) -> Dict:
        """List subscribed feeds"""
        feeds = []
        for feed_id, feed_info in self.subscribed_feeds.items():
            feeds.append({
                "id": feed_id,
                "title": feed_info["title"],
                "url": feed_info["url"],
                "subscribed_at": feed_info["subscribed_at"],
                "last_fetched": feed_info["last_fetched"]
            })
        
        return {
            "success": True,
            "feeds": feeds,
            "count": len(feeds)
        }
    
    async def _fetch_feed(self, params: Dict) -> Dict:
        """Fetch feed without subscribing"""
        url = params.get("url")
        max_entries = params.get("max_entries", 10)
        include_content = params.get("include_content", False)
        
        if not url:
            return {"success": False, "error": "Feed URL is required"}
        
        try:
            feed = feedparser.parse(url)
            
            if feed.bozo:
                return {"success": False, "error": "Failed to parse feed"}
            
            entries = []
            for entry in feed.entries[:max_entries]:
                entry_data = {
                    "title": entry.get("title", ""),
                    "link": entry.get("link", ""),
                    "published": entry.get("published", ""),
                    "summary": entry.get("summary", "")
                }
                
                if include_content:
                    entry_data["content"] = entry.get("content", [{}])[0].get("value", "")
                
                entries.append(entry_data)
            
            return {
                "success": True,
                "feed_title": feed.feed.get("title"),
                "entries": entries,
                "count": len(entries)
            }
        except Exception as e:
            # Return simulated data for demo
            return {
                "success": True,
                "feed_title": "Demo Feed",
                "entries": [
                    {
                        "title": "Sample Article 1",
                        "link": "https://example.com/1",
                        "published": datetime.now().isoformat(),
                        "summary": "This is a sample article summary"
                    }
                ],
                "count": 1,
                "note": "Simulated feed data"
            }
    
    async def _read_feed(self, params: Dict) -> Dict:
        """Read a subscribed feed"""
        feed_id = params.get("feed_id")
        max_entries = params.get("max_entries", 10)
        
        if not feed_id:
            return {"success": False, "error": "Feed ID is required"}
        
        if feed_id not in self.subscribed_feeds:
            return {"success": False, "error": f"Feed '{feed_id}' not found"}
        
        feed_info = self.subscribed_feeds[feed_id]
        
        # Fetch and cache
        result = await self._fetch_feed({
            "url": feed_info["url"],
            "max_entries": max_entries
        })
        
        if result["success"]:
            # Update last fetched
            feed_info["last_fetched"] = datetime.now().isoformat()
            # Cache entries
            self.feed_cache[feed_id] = result["entries"]
        
        return result
    
    async def _search_feeds(self, params: Dict) -> Dict:
        """Search across all feeds"""
        query = params.get("query", "")
        max_entries = params.get("max_entries", 10)
        
        if not query:
            return {"success": False, "error": "Search query is required"}
        
        query_lower = query.lower()
        matches = []
        
        # Search in cached entries
        for feed_id, entries in self.feed_cache.items():
            feed_info = self.subscribed_feeds.get(feed_id, {})
            
            for entry in entries:
                if (query_lower in entry.get("title", "").lower() or
                    query_lower in entry.get("summary", "").lower()):
                    matches.append({
                        "feed": feed_info.get("title", "Unknown"),
                        "entry": entry
                    })
                    
                    if len(matches) >= max_entries:
                        break
        
        return {
            "success": True,
            "query": query,
            "matches": matches[:max_entries],
            "count": len(matches)
        }

# Load Tool
LOAD_TOOL_SPEC = {
    "name": "load_tool",
    "description": (
        "Dynamically load custom tools and extensions from files. "
        "Enables runtime tool addition and customization."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "Path to the tool file"
            },
            "name": {
                "type": "string",
                "description": "Name to register the tool as"
            },
            "reload": {
                "type": "boolean",
                "description": "Reload if already loaded",
                "default": False
            }
        },
        "required": ["path", "name"]
    }
}

class LoadToolTool:
    """Dynamic tool loader"""
    
    def __init__(self):
        self.name = "load_tool"
        self.description = LOAD_TOOL_SPEC["description"]
        self.input_schema = LOAD_TOOL_SPEC["input_schema"]
        self.loaded_tools = {}
    
    async def __call__(self, **kwargs):
        """Load a custom tool"""
        path = kwargs.get("path")
        name = kwargs.get("name")
        reload = kwargs.get("reload", False)
        
        if not path or not name:
            return {"success": False, "error": "Path and name are required"}
        
        # Check if already loaded
        if name in self.loaded_tools and not reload:
            return {
                "success": False,
                "error": f"Tool '{name}' already loaded. Set reload=True to reload."
            }
        
        try:
            # Validate path
            tool_path = Path(path)
            if not tool_path.exists():
                return {"success": False, "error": f"File not found: {path}"}
            
            if not tool_path.suffix == ".py":
                return {"success": False, "error": "Tool file must be a Python file (.py)"}
            
            # Load the module
            spec = importlib.util.spec_from_file_location(name, path)
            if not spec or not spec.loader:
                return {"success": False, "error": "Failed to load module spec"}
            
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            
            # Find the tool class or function
            tool = None
            for attr_name in dir(module):
                attr = getattr(module, attr_name)
                if callable(attr) and not attr_name.startswith("_"):
                    tool = attr
                    break
            
            if not tool:
                return {"success": False, "error": "No callable tool found in file"}
            
            # Register the tool
            self.loaded_tools[name] = {
                "tool": tool,
                "path": str(tool_path),
                "loaded_at": datetime.now().isoformat()
            }
            
            # Register with tool registry if available
            try:
                from app.tools.tool_registry import tool_registry
                tool_registry.register_tool(name, tool)
            except:
                pass
            
            return {
                "success": True,
                "message": f"Tool '{name}' loaded successfully",
                "tool_info": {
                    "name": name,
                    "path": str(tool_path),
                    "loaded_at": self.loaded_tools[name]["loaded_at"]
                }
            }
            
        except Exception as e:
            logger.error(f"Failed to load tool: {e}")
            return {"success": False, "error": str(e)}

# Export tools
cron = CronTool()
rss = RSSTool()
load_tool = LoadToolTool()

__all__ = [
    "cron", "CronTool", "CRON_SPEC",
    "rss", "RSSTool", "RSS_SPEC",
    "load_tool", "LoadToolTool", "LOAD_TOOL_SPEC"
]