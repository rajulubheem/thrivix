"""
Agent Memory Storage System
"""
import json
import os
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List
from pathlib import Path

logger = logging.getLogger(__name__)

class AgentMemoryStore:
    """File-based storage for agent memory and context"""
    
    def __init__(self, base_path: str = "agent_memory"):
        self.base_path = Path(base_path)
        self.base_path.mkdir(exist_ok=True, parents=True)
        logger.info(f"Agent memory store initialized at: {self.base_path}")
    
    def _get_memory_file_path(self, agent_id: str, execution_id: str) -> Path:
        """Get file path for agent memory"""
        execution_dir = self.base_path / execution_id
        execution_dir.mkdir(exist_ok=True, parents=True)
        return execution_dir / f"{agent_id}_memory.json"
    
    def save_agent_memory(self, agent_id: str, execution_id: str, memory_data: Dict[str, Any]):
        """Save agent memory to file"""
        try:
            file_path = self._get_memory_file_path(agent_id, execution_id)
            memory_data["saved_at"] = datetime.utcnow().isoformat()
            
            with open(file_path, 'w') as f:
                json.dump(memory_data, f, indent=2, default=str)
            
            logger.debug(f"Saved memory for agent {agent_id} in execution {execution_id}")
            
        except Exception as e:
            logger.error(f"Failed to save agent memory: {e}")
    
    def get_agent_memory(self, agent_id: str, execution_id: str) -> Optional[Dict[str, Any]]:
        """Load agent memory from file"""
        try:
            file_path = self._get_memory_file_path(agent_id, execution_id)
            
            if not file_path.exists():
                return None
            
            with open(file_path, 'r') as f:
                memory_data = json.load(f)
            
            logger.debug(f"Loaded memory for agent {agent_id} in execution {execution_id}")
            return memory_data
            
        except Exception as e:
            logger.error(f"Failed to load agent memory: {e}")
            return None
    
    def get_execution_agents(self, execution_id: str) -> List[str]:
        """Get all agent IDs for an execution"""
        try:
            execution_dir = self.base_path / execution_id
            if not execution_dir.exists():
                return []
            
            agent_files = list(execution_dir.glob("*_memory.json"))
            agent_ids = [f.stem.replace("_memory", "") for f in agent_files]
            
            return agent_ids
            
        except Exception as e:
            logger.error(f"Failed to get execution agents: {e}")
            return []
    
    def get_execution_summary(self, execution_id: str) -> Dict[str, Any]:
        """Get summary of an execution with all agent memories"""
        try:
            agent_ids = self.get_execution_agents(execution_id)
            
            summary = {
                "execution_id": execution_id,
                "agent_count": len(agent_ids),
                "agents": {},
                "total_interactions": 0,
                "total_decisions": 0,
                "created_at": None,
                "last_updated": None
            }
            
            for agent_id in agent_ids:
                memory = self.get_agent_memory(agent_id, execution_id)
                if memory:
                    summary["agents"][agent_id] = {
                        "role": memory.get("role", "unknown"),
                        "conversation_length": len(memory.get("conversation_history", [])),
                        "human_interactions": len(memory.get("human_interactions", [])),
                        "decisions_made": len(memory.get("decisions_made", [])),
                        "created_at": memory.get("created_at"),
                        "updated_at": memory.get("updated_at")
                    }
                    
                    summary["total_interactions"] += len(memory.get("human_interactions", []))
                    summary["total_decisions"] += len(memory.get("decisions_made", []))
                    
                    # Track earliest and latest timestamps
                    if memory.get("created_at"):
                        if not summary["created_at"] or memory["created_at"] < summary["created_at"]:
                            summary["created_at"] = memory["created_at"]
                    
                    if memory.get("updated_at"):
                        if not summary["last_updated"] or memory["updated_at"] > summary["last_updated"]:
                            summary["last_updated"] = memory["updated_at"]
            
            return summary
            
        except Exception as e:
            logger.error(f"Failed to get execution summary: {e}")
            return {"execution_id": execution_id, "error": str(e)}
    
    def cleanup_old_memories(self, days_old: int = 30):
        """Clean up memories older than specified days"""
        try:
            from datetime import timedelta
            cutoff_date = datetime.utcnow() - timedelta(days=days_old)
            
            removed_count = 0
            for execution_dir in self.base_path.iterdir():
                if execution_dir.is_dir():
                    # Check if any memory files are newer than cutoff
                    should_keep = False
                    for memory_file in execution_dir.glob("*_memory.json"):
                        if memory_file.stat().st_mtime > cutoff_date.timestamp():
                            should_keep = True
                            break
                    
                    if not should_keep:
                        # Remove entire execution directory
                        import shutil
                        shutil.rmtree(execution_dir)
                        removed_count += 1
                        logger.info(f"Cleaned up old execution memory: {execution_dir.name}")
            
            logger.info(f"Cleaned up {removed_count} old execution memories")
            
        except Exception as e:
            logger.error(f"Failed to cleanup old memories: {e}")
    
    def export_execution_memory(self, execution_id: str, output_file: str):
        """Export execution memory to a single file"""
        try:
            summary = self.get_execution_summary(execution_id)
            
            # Add detailed memory for each agent
            for agent_id in summary.get("agents", {}):
                memory = self.get_agent_memory(agent_id, execution_id)
                if memory:
                    summary["agents"][agent_id]["full_memory"] = memory
            
            with open(output_file, 'w') as f:
                json.dump(summary, f, indent=2, default=str)
            
            logger.info(f"Exported execution memory to: {output_file}")
            
        except Exception as e:
            logger.error(f"Failed to export execution memory: {e}")

class RedisAgentMemoryStore(AgentMemoryStore):
    """Redis-based storage for agent memory (for production)"""
    
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        try:
            import redis
            self.redis_client = redis.from_url(redis_url)
            self.redis_client.ping()  # Test connection
            logger.info(f"Redis agent memory store connected to: {redis_url}")
        except ImportError:
            logger.warning("Redis not available, falling back to file storage")
            super().__init__()
        except Exception as e:
            logger.warning(f"Redis connection failed, falling back to file storage: {e}")
            super().__init__()
    
    def _get_memory_key(self, agent_id: str, execution_id: str) -> str:
        """Get Redis key for agent memory"""
        return f"agent_memory:{execution_id}:{agent_id}"
    
    def save_agent_memory(self, agent_id: str, execution_id: str, memory_data: Dict[str, Any]):
        """Save agent memory to Redis"""
        if not hasattr(self, 'redis_client'):
            return super().save_agent_memory(agent_id, execution_id, memory_data)
        
        try:
            key = self._get_memory_key(agent_id, execution_id)
            memory_data["saved_at"] = datetime.utcnow().isoformat()
            
            self.redis_client.setex(
                key, 
                60 * 60 * 24 * 7,  # 7 days TTL
                json.dumps(memory_data, default=str)
            )
            
            logger.debug(f"Saved memory to Redis for agent {agent_id} in execution {execution_id}")
            
        except Exception as e:
            logger.error(f"Failed to save agent memory to Redis: {e}")
    
    def get_agent_memory(self, agent_id: str, execution_id: str) -> Optional[Dict[str, Any]]:
        """Load agent memory from Redis"""
        if not hasattr(self, 'redis_client'):
            return super().get_agent_memory(agent_id, execution_id)
        
        try:
            key = self._get_memory_key(agent_id, execution_id)
            data = self.redis_client.get(key)
            
            if data:
                memory_data = json.loads(data)
                logger.debug(f"Loaded memory from Redis for agent {agent_id} in execution {execution_id}")
                return memory_data
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to load agent memory from Redis: {e}")
            return None

# Global memory store instance
_global_memory_store = None

def get_memory_store() -> AgentMemoryStore:
    """Get global memory store instance"""
    global _global_memory_store
    if _global_memory_store is None:
        # Try Redis first, fall back to file storage
        try:
            import os
            redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
            _global_memory_store = RedisAgentMemoryStore(redis_url)
        except:
            _global_memory_store = AgentMemoryStore()
    
    return _global_memory_store