#!/usr/bin/env python3
"""
Tool Status Checker
Checks which tools are running in real vs simulated mode
"""
import asyncio
import os
import sys
from typing import Dict, Tuple
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich import box

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.tools.tool_registry import tool_registry

console = Console()

async def check_tool_status(tool_name: str, tool) -> Tuple[str, str, str]:
    """Check if a tool is real or simulated"""
    status = "UNKNOWN"
    mode = "?"
    notes = ""
    
    # Tools that are always real
    always_real = [
        'file_read', 'file_write', 'editor', 'current_time', 'sleep',
        'environment', 'system_info', 'calculator', 'python_repl',
        'shell_command', 'journal', 'handoff_to_user', 'stop',
        'think', 'batch', 'workflow', 'task_planner', 'agent_todo',
        'recursive_executor', 'memory', 'cron', 'load_tool'
    ]
    
    # Tools that need API keys
    needs_api_key = {
        'tavily_search': 'TAVILY_API_KEY',
        'use_llm': 'OPENAI_API_KEY',
        'generate_image': 'OPENAI_API_KEY',
        'use_aws': 'AWS_ACCESS_KEY_ID',
        'speak': 'OPENAI_API_KEY or AWS_ACCESS_KEY_ID',
        'mem0_memory': 'MEM0_API_KEY (optional)',
    }
    
    if tool_name in always_real:
        status = "✅ REAL"
        mode = "real"
        notes = "Fully functional"
    elif tool_name in needs_api_key:
        required_key = needs_api_key[tool_name]
        # Check if the key is set
        if 'or' in required_key:
            keys = [k.strip() for k in required_key.split('or')]
            if any(os.getenv(k.replace(' (optional)', '')) for k in keys):
                status = "✅ REAL"
                mode = "real"
                notes = f"API key configured"
            else:
                status = "🟡 SIMULATED"
                mode = "simulated"
                notes = f"Needs: {required_key}"
        elif '(optional)' in required_key:
            status = "✅ REAL"
            mode = "real"
            notes = "Works locally, API optional"
        elif os.getenv(required_key):
            status = "✅ REAL"
            mode = "real"
            notes = f"{required_key} configured"
        else:
            status = "🟡 SIMULATED"
            mode = "simulated"
            notes = f"Missing: {required_key}"
    else:
        # Check other tools
        if tool_name in ['a2a_client']:
            status = "🟡 SIMULATED"
            mode = "simulated"
            notes = "Needs running agent servers"
        elif tool_name in ['image_reader', 'diagram', 'retrieve']:
            status = "🟡 SIMULATED"
            mode = "simulated"
            notes = "Returns mock data"
        elif tool_name in ['rss']:
            status = "🟡 PARTIAL"
            mode = "partial"
            notes = "Falls back to demo feeds"
        elif tool_name == 'http_request':
            status = "✅ REAL"
            mode = "real"
            notes = "Works for public APIs"
        else:
            status = "❓ UNKNOWN"
            mode = "unknown"
            notes = "Status unclear"
    
    return status, mode, notes

async def main():
    """Main function to check all tools"""
    console.print("\n[bold cyan]Strands AI Tools Status Checker[/bold cyan]\n")
    
    # Get all tools
    tools = tool_registry.get_all_tools()
    
    # Create table
    table = Table(title="Tool Status Report", box=box.ROUNDED)
    table.add_column("Tool Name", style="cyan", no_wrap=True)
    table.add_column("Status", style="bold")
    table.add_column("Mode", style="magenta")
    table.add_column("Notes", style="yellow")
    
    # Check each tool
    real_count = 0
    simulated_count = 0
    partial_count = 0
    
    for tool_name, tool in sorted(tools.items()):
        status, mode, notes = await check_tool_status(tool_name, tool)
        table.add_row(tool_name, status, mode, notes)
        
        if "REAL" in status:
            real_count += 1
        elif "SIMULATED" in status:
            simulated_count += 1
        elif "PARTIAL" in status:
            partial_count += 1
    
    console.print(table)
    
    # Summary
    summary = f"""
[bold green]Real/Working:[/bold green] {real_count} tools
[bold yellow]Simulated:[/bold yellow] {simulated_count} tools
[bold orange1]Partial:[/bold orange1] {partial_count} tools
[bold cyan]Total:[/bold cyan] {len(tools)} tools

[dim]To activate simulated tools, see TOOL_ACTIVATION_GUIDE.md[/dim]
"""
    
    console.print(Panel(summary, title="Summary", box=box.ROUNDED))
    
    # Check for common API keys
    console.print("\n[bold]API Key Status:[/bold]")
    api_keys = {
        'TAVILY_API_KEY': 'Tavily Search',
        'OPENAI_API_KEY': 'OpenAI (Images, LLM)',
        'AWS_ACCESS_KEY_ID': 'AWS Services',
        'MEM0_API_KEY': 'Mem0 Platform',
    }
    
    for key, service in api_keys.items():
        is_set = bool(os.getenv(key))
        status = "✅ Set" if is_set else "❌ Not set"
        console.print(f"  {service}: {status}")
    
    console.print("\n[dim]Run with API keys set to activate more tools![/dim]\n")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except ImportError:
        print("Please install rich: pip install rich")
        print("\nOr run without rich formatting:")
        print("python3 -c \"from app.tools.tool_registry import tool_registry; print(f'Total tools: {len(tool_registry.get_all_tools())}')\"")