#!/usr/bin/env python3
"""
MCP Server Launcher - Runs multiple MCP servers on different ports
"""
import subprocess
import sys
import time
import json
import os
import signal
from typing import List, Dict

# Load server configurations
with open('mcp_servers_config.json', 'r') as f:
    config = json.load(f)

processes = []

def signal_handler(sig, frame):
    """Handle shutdown gracefully"""
    print("\n\nShutting down MCP servers...")
    for p in processes:
        p.terminate()
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)

def start_server(server_config: Dict, port: int):
    """Start an MCP server on a specific port"""
    script = server_config['script']
    name = server_config['name']
    
    # Create a wrapper script that runs the server on the specified port
    wrapper_content = f"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Override the port by monkey-patching uvicorn if needed
import uvicorn
original_run = uvicorn.run

def custom_run(app, *args, **kwargs):
    kwargs['port'] = {port}
    kwargs['host'] = '0.0.0.0'
    return original_run(app, *args, **kwargs)

uvicorn.run = custom_run

# Import and run the server
from {script.replace('.py', '')} import mcp

if __name__ == "__main__":
    print("Starting {name} on port {port}...")
    # Get the app from FastMCP
    from mcp.server.fastmcp import FastAPI
    import asyncio
    
    # Create FastAPI app for streamable-http transport
    app = FastAPI()
    
    # Register MCP routes
    mcp._transport = "streamable-http"
    
    # Add MCP endpoints
    @app.get("/mcp/")
    async def mcp_info():
        return {{
            "name": "{name}",
            "tools": {server_config.get('tools', [])}
        }}
    
    @app.get("/tools")
    async def list_tools():
        return [
            {{"name": tool, "description": f"Tool: {{tool}}"}} 
            for tool in {server_config.get('tools', [])}
        ]
    
    # Run with uvicorn
    uvicorn.run(app, host="0.0.0.0", port={port})
"""
    
    # Write wrapper script
    wrapper_file = f"temp_wrapper_{name.lower()}.py"
    with open(wrapper_file, 'w') as f:
        f.write(wrapper_content)
    
    # Start the server
    print(f"🚀 Starting {name} MCP Server on port {port}...")
    process = subprocess.Popen(
        [sys.executable, wrapper_file],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    
    return process

def main():
    """Main function to start all servers"""
    print("=" * 60)
    print("🎯 MCP Server Launcher for Swarm Collaboration")
    print("=" * 60)
    
    # Start each server
    for server in config['servers']:
        try:
            process = start_server(server, server['port'])
            processes.append(process)
            print(f"✅ {server['name']} server started on port {server['port']}")
            time.sleep(2)  # Give each server time to start
        except Exception as e:
            print(f"❌ Failed to start {server['name']}: {e}")
    
    print("\n" + "=" * 60)
    print("All servers started! Available MCP Servers:")
    print("=" * 60)
    
    for server in config['servers']:
        print(f"\n📦 {server['name']} Server")
        print(f"   URL: {server['url']}")
        print(f"   Tools: {', '.join(server['tools'][:3])}...")
    
    print("\n" + "=" * 60)
    print("Press Ctrl+C to stop all servers")
    print("=" * 60)
    
    # Keep running
    try:
        while True:
            time.sleep(1)
            # Check if any process has died
            for i, p in enumerate(processes):
                if p.poll() is not None:
                    print(f"⚠️ Server {config['servers'][i]['name']} has stopped")
    except KeyboardInterrupt:
        signal_handler(None, None)

if __name__ == "__main__":
    main()