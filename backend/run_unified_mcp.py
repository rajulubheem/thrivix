#!/usr/bin/env python3
"""
Run the Unified MCP Server on port 8005
"""
import os
os.environ['MCP_PORT'] = '8005'

from mcp_unified_server import mcp

if __name__ == "__main__":
    print("🚀 Unified MCP Server for Swarm Collaboration")
    print("=" * 60)
    print("Available tool categories:")
    print("  📁 Filesystem: list_files, read_file, write_file")
    print("  🧠 Memory: store_memory, recall_memory, search_memories")
    print("  🧮 Calculator: add, subtract, multiply, divide")
    print("  🔍 Web Search: web_search, fetch_webpage")
    print("=" * 60)
    print("Server running at: http://localhost:8005/")
    print("Press Ctrl+C to stop the server")
    
    # Run the FastMCP server
    mcp.run()