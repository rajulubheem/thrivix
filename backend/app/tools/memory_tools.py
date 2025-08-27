"""
Memory Tools for Strands Agents
Includes mem0_memory, memory, and other memory management tools
"""
import json
import hashlib
from typing import Dict, Any, Optional, List, Union
from datetime import datetime, timedelta
import structlog
from pathlib import Path
import pickle

logger = structlog.get_logger()

# Memory Tool
MEMORY_SPEC = {
    "name": "memory",
    "description": (
        "Store and retrieve structured information with semantic search capabilities. "
        "Useful for maintaining context and knowledge across sessions."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["store", "retrieve", "update", "delete", "search", "list"],
                "description": "Memory operation to perform"
            },
            "key": {
                "type": "string",
                "description": "Memory key/identifier"
            },
            "value": {
                "type": ["string", "object", "array"],
                "description": "Data to store"
            },
            "namespace": {
                "type": "string",
                "description": "Memory namespace for organization",
                "default": "default"
            },
            "query": {
                "type": "string",
                "description": "Search query for retrieval"
            },
            "limit": {
                "type": "integer",
                "description": "Maximum number of results",
                "default": 10
            },
            "tags": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Tags for categorization"
            },
            "ttl": {
                "type": "integer",
                "description": "Time to live in seconds (0 = permanent)",
                "default": 0
            }
        },
        "required": ["action"]
    }
}

class MemoryTool:
    """Basic memory storage and retrieval tool"""
    
    def __init__(self):
        self.name = "memory"
        self.description = MEMORY_SPEC["description"]
        self.input_schema = MEMORY_SPEC["input_schema"]
        
        # In-memory storage (in production, use a database)
        self.memories = {}
        self.namespaces = {}
    
    async def __call__(self, **kwargs):
        """Execute memory operation"""
        action = kwargs.get("action")
        
        try:
            if action == "store":
                return await self._store_memory(kwargs)
            elif action == "retrieve":
                return await self._retrieve_memory(kwargs)
            elif action == "update":
                return await self._update_memory(kwargs)
            elif action == "delete":
                return await self._delete_memory(kwargs)
            elif action == "search":
                return await self._search_memories(kwargs)
            elif action == "list":
                return await self._list_memories(kwargs)
            else:
                return {"success": False, "error": f"Unknown action: {action}"}
        except Exception as e:
            logger.error(f"Memory tool error: {e}")
            return {"success": False, "error": str(e)}
    
    async def _store_memory(self, params: Dict) -> Dict:
        """Store a memory"""
        key = params.get("key")
        value = params.get("value")
        namespace = params.get("namespace", "default")
        tags = params.get("tags", [])
        ttl = params.get("ttl", 0)
        
        if not key:
            # Generate key from value hash
            key = hashlib.md5(str(value).encode()).hexdigest()[:12]
        
        if not value:
            return {"success": False, "error": "Value is required"}
        
        # Create namespace if it doesn't exist
        if namespace not in self.namespaces:
            self.namespaces[namespace] = {}
        
        # Store memory
        memory_entry = {
            "key": key,
            "value": value,
            "namespace": namespace,
            "tags": tags,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "accessed_count": 0,
            "ttl": ttl,
            "expires_at": (datetime.now() + timedelta(seconds=ttl)).isoformat() if ttl > 0 else None
        }
        
        self.memories[f"{namespace}:{key}"] = memory_entry
        self.namespaces[namespace][key] = memory_entry
        
        return {
            "success": True,
            "key": key,
            "namespace": namespace,
            "message": "Memory stored successfully"
        }
    
    async def _retrieve_memory(self, params: Dict) -> Dict:
        """Retrieve a memory by key"""
        key = params.get("key")
        namespace = params.get("namespace", "default")
        
        if not key:
            return {"success": False, "error": "Key is required"}
        
        memory_key = f"{namespace}:{key}"
        
        if memory_key not in self.memories:
            return {"success": False, "error": f"Memory not found: {key}"}
        
        memory = self.memories[memory_key]
        
        # Check expiration
        if memory.get("expires_at"):
            if datetime.fromisoformat(memory["expires_at"]) < datetime.now():
                del self.memories[memory_key]
                return {"success": False, "error": "Memory has expired"}
        
        # Update access count
        memory["accessed_count"] += 1
        memory["last_accessed"] = datetime.now().isoformat()
        
        return {
            "success": True,
            "memory": memory,
            "value": memory["value"]
        }
    
    async def _update_memory(self, params: Dict) -> Dict:
        """Update an existing memory"""
        key = params.get("key")
        value = params.get("value")
        namespace = params.get("namespace", "default")
        
        if not key:
            return {"success": False, "error": "Key is required"}
        
        memory_key = f"{namespace}:{key}"
        
        if memory_key not in self.memories:
            return {"success": False, "error": f"Memory not found: {key}"}
        
        memory = self.memories[memory_key]
        
        if value is not None:
            memory["value"] = value
        
        if "tags" in params:
            memory["tags"] = params["tags"]
        
        memory["updated_at"] = datetime.now().isoformat()
        
        return {
            "success": True,
            "key": key,
            "namespace": namespace,
            "message": "Memory updated successfully"
        }
    
    async def _delete_memory(self, params: Dict) -> Dict:
        """Delete a memory"""
        key = params.get("key")
        namespace = params.get("namespace", "default")
        
        if not key:
            return {"success": False, "error": "Key is required"}
        
        memory_key = f"{namespace}:{key}"
        
        if memory_key not in self.memories:
            return {"success": False, "error": f"Memory not found: {key}"}
        
        del self.memories[memory_key]
        
        if namespace in self.namespaces and key in self.namespaces[namespace]:
            del self.namespaces[namespace][key]
        
        return {
            "success": True,
            "key": key,
            "namespace": namespace,
            "message": "Memory deleted successfully"
        }
    
    async def _search_memories(self, params: Dict) -> Dict:
        """Search memories by query"""
        query = params.get("query", "")
        namespace = params.get("namespace")
        tags = params.get("tags", [])
        limit = params.get("limit", 10)
        
        results = []
        query_lower = query.lower()
        
        for memory_key, memory in self.memories.items():
            # Filter by namespace
            if namespace and memory["namespace"] != namespace:
                continue
            
            # Filter by tags
            if tags and not any(tag in memory.get("tags", []) for tag in tags):
                continue
            
            # Search in value
            if query:
                value_str = str(memory["value"]).lower()
                if query_lower not in value_str:
                    continue
            
            # Check expiration
            if memory.get("expires_at"):
                if datetime.fromisoformat(memory["expires_at"]) < datetime.now():
                    continue
            
            results.append({
                "key": memory["key"],
                "namespace": memory["namespace"],
                "value": memory["value"],
                "tags": memory.get("tags", []),
                "created_at": memory["created_at"],
                "relevance": self._calculate_relevance(query_lower, str(memory["value"]).lower())
            })
        
        # Sort by relevance
        results.sort(key=lambda x: x["relevance"], reverse=True)
        
        return {
            "success": True,
            "results": results[:limit],
            "total_found": len(results),
            "query": query
        }
    
    async def _list_memories(self, params: Dict) -> Dict:
        """List all memories in a namespace"""
        namespace = params.get("namespace")
        limit = params.get("limit", 50)
        
        memories_list = []
        
        for memory_key, memory in self.memories.items():
            if namespace and memory["namespace"] != namespace:
                continue
            
            # Check expiration
            if memory.get("expires_at"):
                if datetime.fromisoformat(memory["expires_at"]) < datetime.now():
                    continue
            
            memories_list.append({
                "key": memory["key"],
                "namespace": memory["namespace"],
                "tags": memory.get("tags", []),
                "created_at": memory["created_at"],
                "accessed_count": memory.get("accessed_count", 0)
            })
        
        # Sort by creation date
        memories_list.sort(key=lambda x: x["created_at"], reverse=True)
        
        return {
            "success": True,
            "memories": memories_list[:limit],
            "total": len(memories_list),
            "namespaces": list(self.namespaces.keys())
        }
    
    def _calculate_relevance(self, query: str, text: str) -> float:
        """Calculate relevance score"""
        if not query:
            return 1.0
        
        # Simple relevance: count occurrences
        count = text.count(query)
        length_ratio = len(query) / len(text) if text else 0
        
        return count + length_ratio

# Mem0 Memory Tool
MEM0_MEMORY_SPEC = {
    "name": "mem0_memory",
    "description": (
        "Advanced memory management with vector embeddings and semantic search. "
        "Provides long-term memory with intelligent retrieval and associations."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["add", "get", "search", "update", "delete", "get_all", "reset"],
                "description": "Mem0 operation to perform"
            },
            "messages": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "role": {"type": "string"},
                        "content": {"type": "string"}
                    }
                },
                "description": "Messages to add to memory"
            },
            "user_id": {
                "type": "string",
                "description": "User identifier for personalized memory",
                "default": "default"
            },
            "agent_id": {
                "type": "string",
                "description": "Agent identifier",
                "default": "default"
            },
            "run_id": {
                "type": "string",
                "description": "Session/run identifier"
            },
            "memory_id": {
                "type": "string",
                "description": "Specific memory ID"
            },
            "query": {
                "type": "string",
                "description": "Search query"
            },
            "limit": {
                "type": "integer",
                "description": "Number of results to return",
                "default": 10
            },
            "metadata": {
                "type": "object",
                "description": "Additional metadata"
            }
        },
        "required": ["action"]
    }
}

class Mem0MemoryTool:
    """Advanced Mem0 memory management tool"""
    
    def __init__(self):
        self.name = "mem0_memory"
        self.description = MEM0_MEMORY_SPEC["description"]
        self.input_schema = MEM0_MEMORY_SPEC["input_schema"]
        
        # Memory storage with embeddings (simplified)
        self.memory_store = {}
        self.embeddings = {}
        self.associations = {}
    
    async def __call__(self, **kwargs):
        """Execute Mem0 memory operation"""
        action = kwargs.get("action")
        
        try:
            if action == "add":
                return await self._add_memory(kwargs)
            elif action == "get":
                return await self._get_memory(kwargs)
            elif action == "search":
                return await self._search_memory(kwargs)
            elif action == "update":
                return await self._update_memory(kwargs)
            elif action == "delete":
                return await self._delete_memory(kwargs)
            elif action == "get_all":
                return await self._get_all_memories(kwargs)
            elif action == "reset":
                return await self._reset_memory(kwargs)
            else:
                return {"success": False, "error": f"Unknown action: {action}"}
        except Exception as e:
            logger.error(f"Mem0 memory error: {e}")
            return {"success": False, "error": str(e)}
    
    async def _add_memory(self, params: Dict) -> Dict:
        """Add memory from messages"""
        messages = params.get("messages", [])
        user_id = params.get("user_id", "default")
        agent_id = params.get("agent_id", "default")
        run_id = params.get("run_id")
        metadata = params.get("metadata", {})
        
        if not messages:
            return {"success": False, "error": "Messages are required"}
        
        # Process messages
        memories_added = []
        
        for message in messages:
            # Extract memory from message
            content = message.get("content", "")
            role = message.get("role", "user")
            
            # Generate memory ID
            memory_id = hashlib.md5(f"{content}{datetime.now()}".encode()).hexdigest()[:16]
            
            # Create memory entry
            memory_entry = {
                "id": memory_id,
                "content": content,
                "role": role,
                "user_id": user_id,
                "agent_id": agent_id,
                "run_id": run_id,
                "metadata": metadata,
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
                "embedding": self._generate_embedding(content),
                "associations": []
            }
            
            # Store memory
            key = f"{user_id}:{agent_id}:{memory_id}"
            self.memory_store[key] = memory_entry
            
            # Update associations
            self._update_associations(memory_entry)
            
            memories_added.append({
                "id": memory_id,
                "content": content[:100] + "..." if len(content) > 100 else content
            })
        
        return {
            "success": True,
            "memories": memories_added,
            "count": len(memories_added),
            "message": f"Added {len(memories_added)} memories"
        }
    
    async def _get_memory(self, params: Dict) -> Dict:
        """Get specific memory"""
        memory_id = params.get("memory_id")
        user_id = params.get("user_id", "default")
        agent_id = params.get("agent_id", "default")
        
        if not memory_id:
            return {"success": False, "error": "Memory ID is required"}
        
        key = f"{user_id}:{agent_id}:{memory_id}"
        
        if key not in self.memory_store:
            return {"success": False, "error": f"Memory not found: {memory_id}"}
        
        memory = self.memory_store[key]
        
        return {
            "success": True,
            "memory": memory
        }
    
    async def _search_memory(self, params: Dict) -> Dict:
        """Search memories semantically"""
        query = params.get("query", "")
        user_id = params.get("user_id", "default")
        agent_id = params.get("agent_id", "default")
        limit = params.get("limit", 10)
        
        if not query:
            return {"success": False, "error": "Query is required"}
        
        # Generate query embedding
        query_embedding = self._generate_embedding(query)
        
        # Search memories
        results = []
        
        for key, memory in self.memory_store.items():
            # Filter by user and agent
            parts = key.split(":")
            if len(parts) >= 2:
                mem_user_id = parts[0]
                mem_agent_id = parts[1]
                
                if user_id != "all" and mem_user_id != user_id:
                    continue
                if agent_id != "all" and mem_agent_id != agent_id:
                    continue
            
            # Calculate similarity
            similarity = self._calculate_similarity(query_embedding, memory["embedding"])
            
            results.append({
                "memory": memory,
                "similarity": similarity
            })
        
        # Sort by similarity
        results.sort(key=lambda x: x["similarity"], reverse=True)
        
        # Format results
        search_results = []
        for result in results[:limit]:
            memory = result["memory"]
            search_results.append({
                "id": memory["id"],
                "content": memory["content"],
                "similarity": result["similarity"],
                "created_at": memory["created_at"],
                "metadata": memory.get("metadata", {})
            })
        
        return {
            "success": True,
            "results": search_results,
            "query": query,
            "total_found": len(results)
        }
    
    async def _update_memory(self, params: Dict) -> Dict:
        """Update existing memory"""
        memory_id = params.get("memory_id")
        user_id = params.get("user_id", "default")
        agent_id = params.get("agent_id", "default")
        content = params.get("content")
        metadata = params.get("metadata")
        
        if not memory_id:
            return {"success": False, "error": "Memory ID is required"}
        
        key = f"{user_id}:{agent_id}:{memory_id}"
        
        if key not in self.memory_store:
            return {"success": False, "error": f"Memory not found: {memory_id}"}
        
        memory = self.memory_store[key]
        
        if content:
            memory["content"] = content
            memory["embedding"] = self._generate_embedding(content)
        
        if metadata:
            memory["metadata"].update(metadata)
        
        memory["updated_at"] = datetime.now().isoformat()
        
        return {
            "success": True,
            "memory_id": memory_id,
            "message": "Memory updated successfully"
        }
    
    async def _delete_memory(self, params: Dict) -> Dict:
        """Delete memory"""
        memory_id = params.get("memory_id")
        user_id = params.get("user_id", "default")
        agent_id = params.get("agent_id", "default")
        
        if not memory_id:
            return {"success": False, "error": "Memory ID is required"}
        
        key = f"{user_id}:{agent_id}:{memory_id}"
        
        if key not in self.memory_store:
            return {"success": False, "error": f"Memory not found: {memory_id}"}
        
        del self.memory_store[key]
        
        # Remove associations
        if memory_id in self.associations:
            del self.associations[memory_id]
        
        return {
            "success": True,
            "memory_id": memory_id,
            "message": "Memory deleted successfully"
        }
    
    async def _get_all_memories(self, params: Dict) -> Dict:
        """Get all memories for a user/agent"""
        user_id = params.get("user_id", "default")
        agent_id = params.get("agent_id", "default")
        limit = params.get("limit", 100)
        
        memories = []
        
        for key, memory in self.memory_store.items():
            parts = key.split(":")
            if len(parts) >= 2:
                mem_user_id = parts[0]
                mem_agent_id = parts[1]
                
                if user_id != "all" and mem_user_id != user_id:
                    continue
                if agent_id != "all" and mem_agent_id != agent_id:
                    continue
            
            memories.append({
                "id": memory["id"],
                "content": memory["content"],
                "created_at": memory["created_at"],
                "metadata": memory.get("metadata", {})
            })
        
        # Sort by creation date
        memories.sort(key=lambda x: x["created_at"], reverse=True)
        
        return {
            "success": True,
            "memories": memories[:limit],
            "total": len(memories),
            "user_id": user_id,
            "agent_id": agent_id
        }
    
    async def _reset_memory(self, params: Dict) -> Dict:
        """Reset memories for user/agent"""
        user_id = params.get("user_id", "default")
        agent_id = params.get("agent_id", "default")
        
        keys_to_delete = []
        
        for key in self.memory_store.keys():
            parts = key.split(":")
            if len(parts) >= 2:
                mem_user_id = parts[0]
                mem_agent_id = parts[1]
                
                if mem_user_id == user_id and mem_agent_id == agent_id:
                    keys_to_delete.append(key)
        
        for key in keys_to_delete:
            del self.memory_store[key]
        
        return {
            "success": True,
            "deleted_count": len(keys_to_delete),
            "message": f"Reset {len(keys_to_delete)} memories"
        }
    
    def _generate_embedding(self, text: str) -> List[float]:
        """Generate simple embedding (in production, use real embeddings)"""
        # Simple hash-based embedding for demo
        hash_val = hashlib.sha256(text.encode()).hexdigest()
        embedding = [float(int(hash_val[i:i+2], 16)) / 255.0 for i in range(0, min(32, len(hash_val)), 2)]
        return embedding
    
    def _calculate_similarity(self, emb1: List[float], emb2: List[float]) -> float:
        """Calculate cosine similarity between embeddings"""
        if not emb1 or not emb2:
            return 0.0
        
        # Simple dot product for demo
        min_len = min(len(emb1), len(emb2))
        similarity = sum(a * b for a, b in zip(emb1[:min_len], emb2[:min_len]))
        
        # Normalize to 0-1
        return min(1.0, max(0.0, similarity / min_len))
    
    def _update_associations(self, memory: Dict):
        """Update memory associations"""
        memory_id = memory["id"]
        
        # Find related memories (simplified)
        related = []
        for key, other_memory in self.memory_store.items():
            if other_memory["id"] != memory_id:
                similarity = self._calculate_similarity(
                    memory["embedding"],
                    other_memory["embedding"]
                )
                if similarity > 0.7:  # Threshold
                    related.append({
                        "id": other_memory["id"],
                        "similarity": similarity
                    })
        
        # Store associations
        self.associations[memory_id] = related[:5]  # Top 5 associations
        memory["associations"] = self.associations[memory_id]

# Export tools
memory = MemoryTool()
mem0_memory = Mem0MemoryTool()

__all__ = [
    "memory", "MemoryTool", "MEMORY_SPEC",
    "mem0_memory", "Mem0MemoryTool", "MEM0_MEMORY_SPEC"
]