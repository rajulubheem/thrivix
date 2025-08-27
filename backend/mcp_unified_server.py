#!/usr/bin/env python3
"""
Unified MCP Server for Swarm Collaboration
Combines multiple tool categories into one server
"""
from mcp.server import FastMCP
from typing import Dict, Any, List, Optional
import os
import json
import sqlite3
import requests
from bs4 import BeautifulSoup
from datetime import datetime
from urllib.parse import quote_plus
import structlog

logger = structlog.get_logger()

# Create MCP server
mcp = FastMCP("Unified Swarm Tools")

# ============= FILESYSTEM TOOLS =============

ALLOWED_DIRS = ["/tmp/swarm_workspace", "./workspace"]

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
        os.makedirs(os.path.dirname(filepath) if os.path.dirname(filepath) else ".", exist_ok=True)
        with open(filepath, 'w') as f:
            f.write(content)
        return {
            "filepath": filepath,
            "success": True,
            "size": len(content)
        }
    except Exception as e:
        return {"error": str(e)}

# ============= MEMORY TOOLS =============

DB_PATH = "./swarm_memory.db"

def init_memory_db():
    """Initialize the memory database"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
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
    
    conn.commit()
    conn.close()

# Initialize database on import
init_memory_db()

@mcp.tool(description="Store a memory or fact")
def store_memory(key: str, value: str, category: str = "general") -> Dict[str, Any]:
    """Store a memory with a unique key"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT OR REPLACE INTO memories (key, value, category, timestamp)
            VALUES (?, ?, ?, ?)
        """, (key, value, category, datetime.now()))
        
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
        
        cursor.execute("""
            SELECT value, category, timestamp 
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
                "timestamp": str(result[2])
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
                "timestamp": str(r[3])
            }
            for r in results
        ]
        
        return {
            "count": len(memories),
            "memories": memories
        }
    except Exception as e:
        return {"error": str(e)}

# ============= CALCULATOR TOOLS =============

@mcp.tool(description="Add two numbers together")
def add(x: float, y: float) -> Dict[str, Any]:
    """Add two numbers"""
    result = x + y
    return {
        "result": result,
        "operation": "addition",
        "expression": f"{x} + {y} = {result}"
    }

@mcp.tool(description="Subtract second number from first")
def subtract(x: float, y: float) -> Dict[str, Any]:
    """Subtract y from x"""
    result = x - y
    return {
        "result": result,
        "operation": "subtraction",
        "expression": f"{x} - {y} = {result}"
    }

@mcp.tool(description="Multiply two numbers")
def multiply(x: float, y: float) -> Dict[str, Any]:
    """Multiply two numbers"""
    result = x * y
    return {
        "result": result,
        "operation": "multiplication",
        "expression": f"{x} * {y} = {result}"
    }

@mcp.tool(description="Divide first number by second")
def divide(x: float, y: float) -> Dict[str, Any]:
    """Divide x by y"""
    if y == 0:
        return {
            "error": "Division by zero is not allowed",
            "operation": "division"
        }
    result = x / y
    return {
        "result": result,
        "operation": "division",
        "expression": f"{x} / {y} = {result}"
    }

# ============= WEB SEARCH TOOLS =============

@mcp.tool(description="Search the web using DuckDuckGo")
def web_search(query: str, max_results: int = 5) -> Dict[str, Any]:
    """Search the web and return results"""
    try:
        # Use DuckDuckGo HTML version (no API key needed)
        search_url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        response = requests.get(search_url, headers=headers, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        results = []
        for result in soup.find_all('div', class_='result')[:max_results]:
            title_elem = result.find('a', class_='result__a')
            snippet_elem = result.find('a', class_='result__snippet')
            
            if title_elem:
                results.append({
                    'title': title_elem.get_text(strip=True),
                    'url': title_elem.get('href', ''),
                    'snippet': snippet_elem.get_text(strip=True) if snippet_elem else ''
                })
        
        return {
            'query': query,
            'count': len(results),
            'results': results
        }
    except Exception as e:
        return {'error': str(e)}

@mcp.tool(description="Fetch and extract text from a webpage")
def fetch_webpage(url: str) -> Dict[str, Any]:
    """Fetch a webpage and extract its text content"""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Remove script and style elements
        for script in soup(["script", "style"]):
            script.decompose()
        
        # Get text content
        text = soup.get_text()
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = ' '.join(chunk for chunk in chunks if chunk)
        
        return {
            'url': url,
            'title': soup.title.string if soup.title else '',
            'text': text[:5000],  # Limit to 5000 chars
            'text_length': len(text),
            'status_code': response.status_code
        }
    except Exception as e:
        return {'error': str(e)}

if __name__ == "__main__":
    print("🚀 Unified MCP Server for Swarm Collaboration")
    print("=" * 60)
    print("Available tool categories:")
    print("  📁 Filesystem: list_files, read_file, write_file")
    print("  🧠 Memory: store_memory, recall_memory, search_memories")
    print("  🧮 Calculator: add, subtract, multiply, divide")
    print("  🔍 Web Search: web_search, fetch_webpage")
    print("=" * 60)
    print("Server will run on default port 8000")
    print("URL: http://localhost:8000/mcp/")
    
    # Ensure workspace exists
    os.makedirs("./workspace", exist_ok=True)
    
    mcp.run(transport="streamable-http")