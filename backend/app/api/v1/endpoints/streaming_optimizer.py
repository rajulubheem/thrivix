"""
Streaming optimization module to handle chunk aggregation
"""
from typing import Dict, List, Optional
from datetime import datetime
import asyncio

class StreamingOptimizer:
    """Optimizes streaming by aggregating chunks when needed"""
    
    def __init__(self):
        self.pending_chunks: Dict[str, List[str]] = {}
        self.last_flush: Dict[str, datetime] = {}
        
    async def should_aggregate(self, session_id: str, chunk_count: int) -> bool:
        """Determine if we should aggregate chunks"""
        # Start aggregating after 1000 chunks to maintain real-time feel
        return chunk_count > 1000
    
    async def add_chunk(self, session_id: str, agent: str, content: str):
        """Add a chunk to pending buffer"""
        key = f"{session_id}:{agent}"
        
        if key not in self.pending_chunks:
            self.pending_chunks[key] = []
            self.last_flush[key] = datetime.utcnow()
        
        self.pending_chunks[key].append(content)
        
        # Check if we should flush
        should_flush = False
        
        # Flush if we have accumulated enough content
        if len(self.pending_chunks[key]) >= 10:  # Every 10 chunks
            should_flush = True
        
        # Flush if enough time has passed
        time_since_flush = (datetime.utcnow() - self.last_flush[key]).total_seconds()
        if time_since_flush > 0.5:  # Every 500ms
            should_flush = True
        
        if should_flush:
            return await self.flush_chunks(session_id, agent)
        
        return None
    
    async def flush_chunks(self, session_id: str, agent: str) -> Optional[Dict]:
        """Flush pending chunks as an aggregated chunk"""
        key = f"{session_id}:{agent}"
        
        if key not in self.pending_chunks or not self.pending_chunks[key]:
            return None
        
        # Combine all pending chunks
        combined_content = "".join(self.pending_chunks[key])
        
        # Clear the buffer
        self.pending_chunks[key] = []
        self.last_flush[key] = datetime.utcnow()
        
        # Return aggregated chunk
        return {
            "type": "delta",
            "agent": agent,
            "content": combined_content,
            "aggregated": True,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    async def flush_all(self, session_id: str) -> List[Dict]:
        """Flush all pending chunks for a session"""
        results = []
        
        keys_to_flush = [k for k in self.pending_chunks.keys() if k.startswith(f"{session_id}:")]
        
        for key in keys_to_flush:
            _, agent = key.split(":", 1)
            chunk = await self.flush_chunks(session_id, agent)
            if chunk:
                results.append(chunk)
        
        return results

# Global optimizer instance
optimizer = StreamingOptimizer()