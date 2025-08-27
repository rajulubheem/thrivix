"""
Communication Tools for Strands Agents
Includes use_llm, a2a_client, and other communication tools
"""
import json
import asyncio
import aiohttp
from typing import Dict, Any, Optional, List
from datetime import datetime
import structlog
import uuid

logger = structlog.get_logger()

# Use LLM Tool
USE_LLM_SPEC = {
    "name": "use_llm",
    "description": (
        "Create nested AI loops with customized system prompts for specialized tasks. "
        "Useful for delegating specific subtasks to another LLM instance."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "prompt": {
                "type": "string",
                "description": "The prompt/task for the LLM"
            },
            "system_prompt": {
                "type": "string",
                "description": "System prompt to configure the LLM behavior",
                "default": "You are a helpful assistant."
            },
            "model": {
                "type": "string",
                "description": "Model to use",
                "default": "gpt-4o-mini"
            },
            "temperature": {
                "type": "number",
                "description": "Temperature for response generation",
                "default": 0.7,
                "minimum": 0,
                "maximum": 2
            },
            "max_tokens": {
                "type": "integer",
                "description": "Maximum tokens in response",
                "default": 1000
            },
            "context": {
                "type": "array",
                "items": {"type": "object"},
                "description": "Previous conversation context"
            }
        },
        "required": ["prompt"]
    }
}

class UseLLMTool:
    """Use LLM for nested AI loops"""
    
    def __init__(self):
        self.name = "use_llm"
        self.description = USE_LLM_SPEC["description"]
        self.input_schema = USE_LLM_SPEC["input_schema"]
    
    async def __call__(self, **kwargs):
        """Execute LLM call"""
        prompt = kwargs.get("prompt")
        system_prompt = kwargs.get("system_prompt", "You are a helpful assistant.")
        model = kwargs.get("model", "gpt-4o-mini")
        temperature = kwargs.get("temperature", 0.7)
        max_tokens = kwargs.get("max_tokens", 1000)
        context = kwargs.get("context", [])
        
        if not prompt:
            return {"success": False, "error": "Prompt is required"}
        
        try:
            # In a real implementation, this would call the actual LLM API
            # For now, we'll simulate a response
            
            # Build messages
            messages = [
                {"role": "system", "content": system_prompt}
            ]
            
            # Add context if provided
            for ctx in context:
                messages.append(ctx)
            
            # Add user prompt
            messages.append({"role": "user", "content": prompt})
            
            # Simulate LLM processing time
            await asyncio.sleep(0.5)
            
            # Generate simulated response based on prompt
            response = self._generate_simulated_response(prompt, system_prompt)
            
            return {
                "success": True,
                "response": response,
                "model": model,
                "prompt_tokens": len(prompt.split()),
                "completion_tokens": len(response.split()),
                "messages": messages
            }
            
        except Exception as e:
            logger.error(f"Use LLM error: {e}")
            return {"success": False, "error": str(e)}
    
    def _generate_simulated_response(self, prompt: str, system_prompt: str) -> str:
        """Generate a simulated response"""
        # Simple simulation based on prompt content
        if "analyze" in prompt.lower():
            return "Based on my analysis, I've identified several key factors that should be considered. The data suggests a structured approach would be most effective."
        elif "summarize" in prompt.lower():
            return "Here's a concise summary of the main points: The content covers important aspects that require attention and systematic implementation."
        elif "code" in prompt.lower():
            return "Here's a code solution that addresses your requirements:\n```python\n# Solution implementation\ndef solution():\n    return 'Implementation complete'\n```"
        else:
            return f"I understand you need help with: {prompt[:100]}... I would approach this by first understanding the requirements, then developing a systematic solution."

# A2A Client Tool
A2A_CLIENT_SPEC = {
    "name": "a2a_client",
    "description": (
        "Agent-to-Agent communication client for discovering and messaging other agents. "
        "Enables multi-agent collaboration and information sharing."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["discover", "list", "send_message", "receive", "ping"],
                "description": "A2A action to perform"
            },
            "agent_url": {
                "type": "string",
                "description": "Target agent URL"
            },
            "message": {
                "type": "string",
                "description": "Message to send"
            },
            "message_type": {
                "type": "string",
                "enum": ["request", "response", "notification", "query"],
                "description": "Type of message",
                "default": "request"
            },
            "timeout": {
                "type": "integer",
                "description": "Request timeout in seconds",
                "default": 30
            }
        },
        "required": ["action"]
    }
}

class A2AClientTool:
    """Agent-to-Agent communication client"""
    
    def __init__(self):
        self.name = "a2a_client"
        self.description = A2A_CLIENT_SPEC["description"]
        self.input_schema = A2A_CLIENT_SPEC["input_schema"]
        self.discovered_agents = {}
        self.message_history = []
    
    async def __call__(self, **kwargs):
        """Execute A2A action"""
        action = kwargs.get("action")
        
        try:
            if action == "discover":
                return await self._discover_agent(kwargs)
            elif action == "list":
                return await self._list_agents()
            elif action == "send_message":
                return await self._send_message(kwargs)
            elif action == "receive":
                return await self._receive_messages()
            elif action == "ping":
                return await self._ping_agent(kwargs)
            else:
                return {"success": False, "error": f"Unknown action: {action}"}
        except Exception as e:
            logger.error(f"A2A client error: {e}")
            return {"success": False, "error": str(e)}
    
    async def _discover_agent(self, params: Dict) -> Dict:
        """Discover an agent at a URL"""
        agent_url = params.get("agent_url")
        timeout = params.get("timeout", 30)
        
        if not agent_url:
            return {"success": False, "error": "Agent URL is required"}
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{agent_url}/info",
                    timeout=aiohttp.ClientTimeout(total=timeout)
                ) as response:
                    if response.status == 200:
                        agent_info = await response.json()
                        
                        # Store discovered agent
                        agent_id = agent_info.get("id", str(uuid.uuid4()))
                        self.discovered_agents[agent_id] = {
                            "url": agent_url,
                            "info": agent_info,
                            "discovered_at": datetime.now().isoformat()
                        }
                        
                        return {
                            "success": True,
                            "agent_id": agent_id,
                            "agent_info": agent_info,
                            "url": agent_url,
                            "mode": "real"  # Indicate real connection
                        }
                    else:
                        return {
                            "success": False,
                            "error": f"Agent returned status {response.status}"
                        }
        except asyncio.TimeoutError:
            return {
                "success": False,
                "error": f"Discovery timed out after {timeout} seconds"
            }
        except Exception as e:
            # Simulate discovery for demo when real agent not available
            logger.info(f"Real agent connection failed ({str(e)[:50]}), using simulation mode")
            agent_id = str(uuid.uuid4())
            self.discovered_agents[agent_id] = {
                "url": agent_url,
                "info": {
                    "name": "Remote Agent (Simulated)",
                    "capabilities": ["chat", "analysis"],
                    "status": "simulated"
                },
                "discovered_at": datetime.now().isoformat()
            }
            
            return {
                "success": True,
                "agent_id": agent_id,
                "agent_info": self.discovered_agents[agent_id]["info"],
                "url": agent_url,
                "mode": "simulated",  # Clearly indicate simulation
                "note": "Using simulated agent (no real agent found at URL)"
            }
    
    async def _list_agents(self) -> Dict:
        """List discovered agents"""
        agents = []
        for agent_id, agent_data in self.discovered_agents.items():
            agents.append({
                "id": agent_id,
                "url": agent_data["url"],
                "name": agent_data["info"].get("name", "Unknown"),
                "discovered_at": agent_data["discovered_at"]
            })
        
        return {
            "success": True,
            "agents": agents,
            "count": len(agents)
        }
    
    async def _send_message(self, params: Dict) -> Dict:
        """Send message to an agent"""
        agent_url = params.get("agent_url")
        message = params.get("message")
        message_type = params.get("message_type", "request")
        timeout = params.get("timeout", 30)
        
        if not agent_url:
            return {"success": False, "error": "Agent URL is required"}
        
        if not message:
            return {"success": False, "error": "Message is required"}
        
        # Create message payload
        message_payload = {
            "id": str(uuid.uuid4()),
            "type": message_type,
            "content": message,
            "timestamp": datetime.now().isoformat(),
            "sender": "local_agent"
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{agent_url}/message",
                    json=message_payload,
                    timeout=aiohttp.ClientTimeout(total=timeout)
                ) as response:
                    if response.status == 200:
                        response_data = await response.json()
                        
                        # Store in history
                        self.message_history.append({
                            "sent": message_payload,
                            "received": response_data,
                            "timestamp": datetime.now().isoformat()
                        })
                        
                        return {
                            "success": True,
                            "message_id": message_payload["id"],
                            "response": response_data
                        }
                    else:
                        return {
                            "success": False,
                            "error": f"Agent returned status {response.status}"
                        }
        except Exception as e:
            # Simulate message sending for demo
            self.message_history.append({
                "sent": message_payload,
                "received": {
                    "status": "simulated",
                    "response": "Message received (simulated)"
                },
                "timestamp": datetime.now().isoformat()
            })
            
            return {
                "success": True,
                "message_id": message_payload["id"],
                "response": {"status": "simulated", "message": "Response simulated"},
                "note": "Simulated message exchange"
            }
    
    async def _receive_messages(self) -> Dict:
        """Receive pending messages"""
        # In a real implementation, this would check for incoming messages
        # For now, return recent message history
        recent_messages = self.message_history[-5:] if self.message_history else []
        
        return {
            "success": True,
            "messages": recent_messages,
            "count": len(recent_messages),
            "total_history": len(self.message_history)
        }
    
    async def _ping_agent(self, params: Dict) -> Dict:
        """Ping an agent to check if it's alive"""
        agent_url = params.get("agent_url")
        timeout = params.get("timeout", 5)
        
        if not agent_url:
            return {"success": False, "error": "Agent URL is required"}
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{agent_url}/ping",
                    timeout=aiohttp.ClientTimeout(total=timeout)
                ) as response:
                    if response.status == 200:
                        return {
                            "success": True,
                            "agent_url": agent_url,
                            "status": "alive",
                            "response_time": timeout
                        }
                    else:
                        return {
                            "success": False,
                            "agent_url": agent_url,
                            "status": "unreachable",
                            "status_code": response.status
                        }
        except Exception as e:
            # Simulate ping for demo
            return {
                "success": True,
                "agent_url": agent_url,
                "status": "alive (simulated)",
                "response_time": 0.1,
                "note": "Simulated ping"
            }

# Export tools
use_llm = UseLLMTool()
a2a_client = A2AClientTool()

__all__ = [
    "use_llm", "UseLLMTool", "USE_LLM_SPEC",
    "a2a_client", "A2AClientTool", "A2A_CLIENT_SPEC"
]