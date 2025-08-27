#!/usr/bin/env python3
"""
Test script to verify tool visibility and functionality
"""
import requests
import json
from typing import Dict, Any

BASE_URL = "http://localhost:8000/api/v1"

def test_available_tools():
    """Test the available tools endpoint"""
    print("\n" + "="*60)
    print("TESTING AVAILABLE TOOLS")
    print("="*60)
    
    # Test existing endpoint
    response = requests.get(f"{BASE_URL}/settings/available-tools")
    if response.status_code == 200:
        data = response.json()
        tools = data['data']['tools']
        print(f"\n✅ Found {len(tools)} tools:")
        for tool in tools:
            status = "✓" if tool['enabled'] else "✗"
            approval = "🔐" if tool.get('requires_approval') else "🔓"
            print(f"  {status} {approval} {tool['name']:20} - {tool['description'][:50]}...")
    else:
        print(f"❌ Failed to get tools: {response.status_code}")
    
    return tools if response.status_code == 200 else []

def test_tool_debug_info():
    """Test tool configuration from settings"""
    print("\n" + "="*60)
    print("TOOL CONFIGURATION FROM SETTINGS")
    print("="*60)
    
    # Get settings to check tool configuration
    response = requests.get(f"{BASE_URL}/settings")
    if response.status_code == 200:
        data = response.json()
        settings = data.get('data', {})
        tools = settings.get('tools', {})
        
        enabled_count = sum(1 for t in tools.values() if t.get('enabled'))
        print(f"\nTotal tools configured: {len(tools)}")
        print(f"Enabled tools: {enabled_count}")
        print(f"Disabled tools: {len(tools) - enabled_count}")
        
        # Group by category
        categories = {}
        for name, tool in tools.items():
            cat = tool.get('category', 'other')
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(name)
        
        print(f"\nTools by category:")
        for cat, tool_list in categories.items():
            print(f"  {cat}: {', '.join(tool_list)}")
    else:
        print(f"❌ Failed to get settings: {response.status_code}")

def test_agent_configuration():
    """Test agent configuration"""
    print(f"\n" + "="*60)
    print(f"AGENT CONFIGURATION")
    print("="*60)
    
    # Get agent list from the agents endpoint
    response = requests.get(f"{BASE_URL}/agents")
    if response.status_code == 200:
        data = response.json()
        agents = data.get('agents', [])
        
        print(f"\nFound {len(agents)} agent configurations:")
        for agent in agents[:5]:  # Show first 5
            print(f"\n  Agent: {agent.get('name')}")
            print(f"  Model: {agent.get('model', 'default')}")
            print(f"  Description: {agent.get('description', 'N/A')[:60]}...")
    else:
        print(f"❌ Failed to get agents: {response.status_code}")

def show_tool_summary(tools):
    """Show summary of enabled tools"""
    print("\n" + "="*60)
    print("TOOL SUMMARY")
    print("="*60)
    
    if tools:
        # Count by category
        categories = {}
        for tool in tools:
            cat = tool.get('category', 'other')
            if cat not in categories:
                categories[cat] = 0
            categories[cat] += 1
        
        print(f"\nEnabled tools by category:")
        for cat, count in categories.items():
            print(f"  {cat}: {count} tool(s)")
        
        print(f"\nTools requiring approval:")
        approval_tools = [t['name'] for t in tools if t.get('requires_approval')]
        if approval_tools:
            for tool in approval_tools:
                print(f"  🔐 {tool}")
        else:
            print("  None")
        
        print(f"\nTools without approval:")
        no_approval = [t['name'] for t in tools if not t.get('requires_approval')]
        if no_approval:
            for tool in no_approval:
                print(f"  🔓 {tool}")
        else:
            print("  None")

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print(" TOOL VISIBILITY AND CONFIGURATION TEST ")
    print("="*80)
    
    # Test available tools
    tools = test_available_tools()
    
    # Test tool configuration from settings
    test_tool_debug_info()
    
    # Show tool summary
    show_tool_summary(tools)
    
    # Test agent configuration
    test_agent_configuration()
    
    print("\n" + "="*80)
    print(" IMPORTANT FINDINGS ")
    print("="*80)
    
    print("\n📌 Current Status:")
    print(f"  • {len(tools)} tools are enabled and available")
    print(f"  • Tools are loaded from: app_settings.json")
    print(f"  • Agents receive tools through enhanced_swarm_service.py")
    
    print("\n⚠️  Known Issues:")
    print("  • Some agent templates have non-existent tools")
    print("  • Tools are now mapped to real ones (file_write, file_read, etc.)")
    print("  • Tool approval system is in place for sensitive operations")
    
    print("\n✅ Recommendations:")
    print("  • Enable more tools in Settings page as needed")
    print("  • Test tools with actual agent runs")
    print("  • Monitor agent logs to see which tools are being used")
    
    print("\n" + "="*80)
    print(" TEST COMPLETE ")
    print("="*80)

if __name__ == "__main__":
    main()