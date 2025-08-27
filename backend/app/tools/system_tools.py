"""
System Tools for Strands Agents
Includes current_time, sleep, environment, and other system utilities
"""
import os
import time
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
import pytz
import structlog
import platform
import psutil

logger = structlog.get_logger()

# Current Time Tool
CURRENT_TIME_SPEC = {
    "name": "current_time",
    "description": "Get the current time in ISO 8601 format for a specified timezone",
    "input_schema": {
        "type": "object",
        "properties": {
            "timezone": {
                "type": "string",
                "description": "Timezone (e.g., 'UTC', 'US/Pacific', 'Europe/London')",
                "default": "UTC"
            },
            "format": {
                "type": "string",
                "enum": ["iso", "unix", "human"],
                "description": "Output format",
                "default": "iso"
            }
        }
    }
}

class CurrentTimeTool:
    """Get current time in various formats and timezones"""
    
    def __init__(self):
        self.name = "current_time"
        self.description = CURRENT_TIME_SPEC["description"]
        self.input_schema = CURRENT_TIME_SPEC["input_schema"]
    
    async def __call__(self, **kwargs):
        """Get current time"""
        tz_name = kwargs.get("timezone", "UTC")
        format_type = kwargs.get("format", "iso")
        
        try:
            # Get timezone
            if tz_name == "UTC":
                tz = timezone.utc
                now = datetime.now(tz)
            else:
                tz = pytz.timezone(tz_name)
                now = datetime.now(tz)
            
            # Format based on type
            if format_type == "iso":
                time_str = now.isoformat()
            elif format_type == "unix":
                time_str = str(int(now.timestamp()))
            elif format_type == "human":
                time_str = now.strftime("%Y-%m-%d %H:%M:%S %Z")
            else:
                time_str = now.isoformat()
            
            return {
                "success": True,
                "time": time_str,
                "timezone": tz_name,
                "format": format_type,
                "unix_timestamp": int(now.timestamp()),
                "iso_time": now.isoformat()
            }
        except pytz.exceptions.UnknownTimeZoneError:
            return {
                "success": False,
                "error": f"Unknown timezone: {tz_name}",
                "available_timezones": pytz.common_timezones[:20]  # Show first 20
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

# Sleep Tool
SLEEP_SPEC = {
    "name": "sleep",
    "description": "Pause execution for specified number of seconds",
    "input_schema": {
        "type": "object",
        "properties": {
            "seconds": {
                "type": "number",
                "description": "Number of seconds to sleep",
                "minimum": 0,
                "maximum": 300
            }
        },
        "required": ["seconds"]
    }
}

class SleepTool:
    """Sleep/pause execution tool"""
    
    def __init__(self):
        self.name = "sleep"
        self.description = SLEEP_SPEC["description"]
        self.input_schema = SLEEP_SPEC["input_schema"]
    
    async def __call__(self, **kwargs):
        """Sleep for specified seconds"""
        seconds = kwargs.get("seconds", 0)
        
        if seconds < 0:
            return {"success": False, "error": "Sleep duration must be positive"}
        
        if seconds > 300:
            return {"success": False, "error": "Sleep duration cannot exceed 300 seconds"}
        
        try:
            start_time = time.time()
            await asyncio.sleep(seconds)
            actual_duration = time.time() - start_time
            
            return {
                "success": True,
                "requested_seconds": seconds,
                "actual_seconds": round(actual_duration, 3),
                "message": f"Slept for {actual_duration:.3f} seconds"
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

# Environment Tool
ENVIRONMENT_SPEC = {
    "name": "environment",
    "description": "Manage and inspect environment variables",
    "input_schema": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["get", "set", "list", "delete"],
                "description": "Action to perform"
            },
            "name": {
                "type": "string",
                "description": "Environment variable name"
            },
            "value": {
                "type": "string",
                "description": "Value to set (for set action)"
            },
            "prefix": {
                "type": "string",
                "description": "Filter variables by prefix (for list action)"
            },
            "mask_sensitive": {
                "type": "boolean",
                "description": "Mask sensitive values in output",
                "default": True
            }
        },
        "required": ["action"]
    }
}

class EnvironmentTool:
    """Environment variable management tool"""
    
    def __init__(self):
        self.name = "environment"
        self.description = ENVIRONMENT_SPEC["description"]
        self.input_schema = ENVIRONMENT_SPEC["input_schema"]
        
        # Sensitive variable patterns
        self.sensitive_patterns = [
            'KEY', 'TOKEN', 'SECRET', 'PASSWORD', 'PASS', 'AUTH',
            'CREDENTIAL', 'PRIVATE', 'API', 'ACCESS'
        ]
    
    async def __call__(self, **kwargs):
        """Execute environment action"""
        action = kwargs.get("action")
        name = kwargs.get("name")
        value = kwargs.get("value")
        prefix = kwargs.get("prefix", "")
        mask_sensitive = kwargs.get("mask_sensitive", True)
        
        try:
            if action == "get":
                return await self.get_env(name, mask_sensitive)
            elif action == "set":
                return await self.set_env(name, value)
            elif action == "list":
                return await self.list_env(prefix, mask_sensitive)
            elif action == "delete":
                return await self.delete_env(name)
            else:
                return {"success": False, "error": f"Unknown action: {action}"}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def get_env(self, name: str, mask_sensitive: bool) -> Dict[str, Any]:
        """Get environment variable value"""
        if not name:
            return {"success": False, "error": "Variable name is required"}
        
        value = os.environ.get(name)
        if value is None:
            return {
                "success": False,
                "error": f"Environment variable '{name}' not found"
            }
        
        # Mask if sensitive
        if mask_sensitive and self._is_sensitive(name):
            masked_value = value[:3] + "*" * (len(value) - 6) + value[-3:] if len(value) > 6 else "*" * len(value)
        else:
            masked_value = value
        
        return {
            "success": True,
            "name": name,
            "value": masked_value,
            "is_masked": mask_sensitive and self._is_sensitive(name),
            "exists": True
        }
    
    async def set_env(self, name: str, value: str) -> Dict[str, Any]:
        """Set environment variable"""
        if not name:
            return {"success": False, "error": "Variable name is required"}
        
        if value is None:
            return {"success": False, "error": "Value is required"}
        
        # Warning for sensitive variables
        is_sensitive = self._is_sensitive(name)
        
        os.environ[name] = value
        
        return {
            "success": True,
            "name": name,
            "action": "set",
            "is_sensitive": is_sensitive,
            "warning": "Setting sensitive variable" if is_sensitive else None
        }
    
    async def list_env(self, prefix: str, mask_sensitive: bool) -> Dict[str, Any]:
        """List environment variables"""
        env_vars = {}
        count = 0
        
        for key, value in os.environ.items():
            if prefix and not key.startswith(prefix):
                continue
            
            count += 1
            if count > 100:  # Limit output
                break
            
            # Mask sensitive values
            if mask_sensitive and self._is_sensitive(key):
                value = value[:3] + "*" * (len(value) - 6) + value[-3:] if len(value) > 6 else "*" * len(value)
            
            env_vars[key] = value
        
        return {
            "success": True,
            "variables": env_vars,
            "count": len(env_vars),
            "prefix": prefix if prefix else None,
            "masked": mask_sensitive
        }
    
    async def delete_env(self, name: str) -> Dict[str, Any]:
        """Delete environment variable"""
        if not name:
            return {"success": False, "error": "Variable name is required"}
        
        if name not in os.environ:
            return {
                "success": False,
                "error": f"Environment variable '{name}' not found"
            }
        
        del os.environ[name]
        
        return {
            "success": True,
            "name": name,
            "action": "deleted"
        }
    
    def _is_sensitive(self, name: str) -> bool:
        """Check if variable name indicates sensitive data"""
        name_upper = name.upper()
        return any(pattern in name_upper for pattern in self.sensitive_patterns)

# System Info Tool
SYSTEM_INFO_SPEC = {
    "name": "system_info",
    "description": "Get system information including OS, CPU, memory, and disk usage",
    "input_schema": {
        "type": "object",
        "properties": {
            "category": {
                "type": "string",
                "enum": ["all", "os", "cpu", "memory", "disk", "network"],
                "description": "Information category to retrieve",
                "default": "all"
            }
        }
    }
}

class SystemInfoTool:
    """System information tool"""
    
    def __init__(self):
        self.name = "system_info"
        self.description = SYSTEM_INFO_SPEC["description"]
        self.input_schema = SYSTEM_INFO_SPEC["input_schema"]
    
    async def __call__(self, **kwargs):
        """Get system information"""
        category = kwargs.get("category", "all")
        
        try:
            info = {}
            
            if category in ["all", "os"]:
                info["os"] = {
                    "system": platform.system(),
                    "release": platform.release(),
                    "version": platform.version(),
                    "machine": platform.machine(),
                    "processor": platform.processor(),
                    "python_version": platform.python_version()
                }
            
            if category in ["all", "cpu"]:
                info["cpu"] = {
                    "physical_cores": psutil.cpu_count(logical=False),
                    "logical_cores": psutil.cpu_count(logical=True),
                    "usage_percent": psutil.cpu_percent(interval=1),
                    "frequency": psutil.cpu_freq().current if psutil.cpu_freq() else None
                }
            
            if category in ["all", "memory"]:
                mem = psutil.virtual_memory()
                info["memory"] = {
                    "total": f"{mem.total / (1024**3):.2f} GB",
                    "available": f"{mem.available / (1024**3):.2f} GB",
                    "used": f"{mem.used / (1024**3):.2f} GB",
                    "percent": mem.percent
                }
            
            if category in ["all", "disk"]:
                disk = psutil.disk_usage('/')
                info["disk"] = {
                    "total": f"{disk.total / (1024**3):.2f} GB",
                    "used": f"{disk.used / (1024**3):.2f} GB",
                    "free": f"{disk.free / (1024**3):.2f} GB",
                    "percent": disk.percent
                }
            
            if category in ["all", "network"]:
                net = psutil.net_io_counters()
                info["network"] = {
                    "bytes_sent": f"{net.bytes_sent / (1024**2):.2f} MB",
                    "bytes_received": f"{net.bytes_recv / (1024**2):.2f} MB",
                    "packets_sent": net.packets_sent,
                    "packets_received": net.packets_recv
                }
            
            return {
                "success": True,
                "category": category,
                "info": info,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}

# Export tools
current_time = CurrentTimeTool()
sleep = SleepTool()
environment = EnvironmentTool()
system_info = SystemInfoTool()

__all__ = [
    "current_time", "CurrentTimeTool", "CURRENT_TIME_SPEC",
    "sleep", "SleepTool", "SLEEP_SPEC",
    "environment", "EnvironmentTool", "ENVIRONMENT_SPEC",
    "system_info", "SystemInfoTool", "SYSTEM_INFO_SPEC"
]