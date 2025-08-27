#!/usr/bin/env python3
"""
Memory MCP Server for Swarm Collaboration
Provides persistent memory and knowledge management for agents
"""
from mcp.server import FastMCP
from typing import Dict, Any, List, Optional
import json
import sqlite3
from datetime import datetime
import structlog

logger = structlog.get_logger()

# Create MCP server
mcp = FastMCP("Memory Server")

# Database setup
DB_PATH = "./swarm_memory.db"

def init_db():
    """Initialize the memory database"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create memories table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL,
            category TEXT,
            agent_id TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            access_count INTEGER DEFAULT 0
        )
    """)
    
    # Create relationships table for knowledge graph
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS relationships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_key TEXT NOT NULL,
            to_key TEXT NOT NULL,
            relationship_type TEXT NOT NULL,
            strength REAL DEFAULT 1.0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    conn.commit()
    conn.close()

# Initialize database on startup
init_db()

@mcp.tool(description="Store a memory or fact")
def store_memory(key: str, value: str, category: str = "general", agent_id: str = None) -> Dict[str, Any]:
    """Store a memory with a unique key"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT OR REPLACE INTO memories (key, value, category, agent_id, timestamp)
            VALUES (?, ?, ?, ?, ?)
        """, (key, value, category, agent_id, datetime.now()))
        
        conn.commit()
        conn.close()
        
        return {
            "success": True,
            "key": key,
            "message": "Memory stored successfully"
        }
    except Exception as e:
        return {"error": str(e)}

@mcp.tool(description="Retrieve a memory by key")
def recall_memory(key: str) -> Dict[str, Any]:
    """Retrieve a specific memory by its key"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Get memory and increment access count
        cursor.execute("""
            SELECT value, category, agent_id, timestamp 
            FROM memories WHERE key = ?
        """, (key,))
        
        result = cursor.fetchone()
        if result:
            cursor.execute("""
                UPDATE memories SET access_count = access_count + 1 
                WHERE key = ?
            """, (key,))
            conn.commit()
            
            conn.close()
            return {
                "key": key,
                "value": result[0],
                "category": result[1],
                "agent_id": result[2],
                "timestamp": result[3]
            }
        else:
            conn.close()
            return {"error": f"Memory with key '{key}' not found"}
    except Exception as e:
        return {"error": str(e)}

@mcp.tool(description="Search memories by category or content")
def search_memories(query: str = None, category: str = None, limit: int = 10) -> Dict[str, Any]:
    """Search memories by query text or category"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        if category and query:
            cursor.execute("""
                SELECT key, value, category, timestamp 
                FROM memories 
                WHERE category = ? AND (key LIKE ? OR value LIKE ?)
                ORDER BY access_count DESC, timestamp DESC
                LIMIT ?
            """, (category, f"%{query}%", f"%{query}%", limit))
        elif category:
            cursor.execute("""
                SELECT key, value, category, timestamp 
                FROM memories 
                WHERE category = ?
                ORDER BY access_count DESC, timestamp DESC
                LIMIT ?
            """, (category, limit))
        elif query:
            cursor.execute("""
                SELECT key, value, category, timestamp 
                FROM memories 
                WHERE key LIKE ? OR value LIKE ?
                ORDER BY access_count DESC, timestamp DESC
                LIMIT ?
            """, (f"%{query}%", f"%{query}%", limit))
        else:
            cursor.execute("""
                SELECT key, value, category, timestamp 
                FROM memories 
                ORDER BY timestamp DESC
                LIMIT ?
            """, (limit,))
        
        results = cursor.fetchall()
        conn.close()
        
        memories = [
            {
                "key": r[0],
                "value": r[1],
                "category": r[2],
                "timestamp": r[3]
            }
            for r in results
        ]
        
        return {
            "count": len(memories),
            "memories": memories
        }
    except Exception as e:
        return {"error": str(e)}

@mcp.tool(description="Create a relationship between two memories")
def link_memories(from_key: str, to_key: str, relationship_type: str, strength: float = 1.0) -> Dict[str, Any]:
    """Create a relationship between two memory keys"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO relationships (from_key, to_key, relationship_type, strength)
            VALUES (?, ?, ?, ?)
        """, (from_key, to_key, relationship_type, strength))
        
        conn.commit()
        conn.close()
        
        return {
            "success": True,
            "from": from_key,
            "to": to_key,
            "relationship": relationship_type
        }
    except Exception as e:
        return {"error": str(e)}

@mcp.tool(description="Get related memories")
def get_related(key: str, relationship_type: str = None) -> Dict[str, Any]:
    """Get memories related to a specific key"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        if relationship_type:
            cursor.execute("""
                SELECT r.to_key, r.relationship_type, r.strength, m.value
                FROM relationships r
                JOIN memories m ON r.to_key = m.key
                WHERE r.from_key = ? AND r.relationship_type = ?
                ORDER BY r.strength DESC
            """, (key, relationship_type))
        else:
            cursor.execute("""
                SELECT r.to_key, r.relationship_type, r.strength, m.value
                FROM relationships r
                JOIN memories m ON r.to_key = m.key
                WHERE r.from_key = ?
                ORDER BY r.strength DESC
            """, (key,))
        
        results = cursor.fetchall()
        conn.close()
        
        related = [
            {
                "key": r[0],
                "relationship": r[1],
                "strength": r[2],
                "value": r[3]
            }
            for r in results
        ]
        
        return {
            "key": key,
            "related_count": len(related),
            "related": related
        }
    except Exception as e:
        return {"error": str(e)}

@mcp.tool(description="Delete a memory")
def forget_memory(key: str) -> Dict[str, Any]:
    """Delete a memory and its relationships"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Delete memory
        cursor.execute("DELETE FROM memories WHERE key = ?", (key,))
        
        # Delete relationships
        cursor.execute("""
            DELETE FROM relationships 
            WHERE from_key = ? OR to_key = ?
        """, (key, key))
        
        conn.commit()
        conn.close()
        
        return {
            "success": True,
            "key": key,
            "message": "Memory forgotten successfully"
        }
    except Exception as e:
        return {"error": str(e)}

@mcp.tool(description="Get memory statistics")
def memory_stats() -> Dict[str, Any]:
    """Get statistics about stored memories"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM memories")
        total_memories = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM relationships")
        total_relationships = cursor.fetchone()[0]
        
        cursor.execute("""
            SELECT category, COUNT(*) 
            FROM memories 
            GROUP BY category
        """)
        categories = dict(cursor.fetchall())
        
        cursor.execute("""
            SELECT key, access_count 
            FROM memories 
            ORDER BY access_count DESC 
            LIMIT 5
        """)
        most_accessed = [{"key": r[0], "count": r[1]} for r in cursor.fetchall()]
        
        conn.close()
        
        return {
            "total_memories": total_memories,
            "total_relationships": total_relationships,
            "categories": categories,
            "most_accessed": most_accessed
        }
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    print("🧠 Memory MCP Server")
    print("=" * 50)
    print("Persistent memory and knowledge management for agents")
    print("Available tools:")
    print("  - store_memory: Store facts and knowledge")
    print("  - recall_memory: Retrieve specific memories")
    print("  - search_memories: Search by content or category")
    print("  - link_memories: Create knowledge relationships")
    print("  - get_related: Find related memories")
    print("  - forget_memory: Delete memories")
    print("  - memory_stats: Get memory statistics")
    print("=" * 50)
    print("Database: ./swarm_memory.db")
    
    mcp.run(transport="streamable-http")