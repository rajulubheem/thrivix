#!/usr/bin/env python3
"""
Run the MCP Calculator Server on port 8001
"""
import uvicorn
from mcp_calculator_server import mcp

if __name__ == "__main__":
    print("🧮 Calculator MCP Server")
    print("=" * 50)
    print("Starting server with Streamable HTTP transport on port 8001...")
    print("Available tools: add, subtract, multiply, divide, power, sqrt, percentage")
    print("=" * 50)
    print("Server running at: http://localhost:8001/mcp/")
    print("Press Ctrl+C to stop the server")
    
    # Get the FastMCP app and run it with uvicorn on port 8001
    app, _ = mcp.get_app()
    uvicorn.run(app, host="0.0.0.0", port=8001)