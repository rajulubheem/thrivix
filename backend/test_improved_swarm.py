"""
Test the improved dynamic swarm to ensure agents use tools effectively
"""

import asyncio
import json
from app.services.improved_dynamic_swarm import get_improved_dynamic_swarm_service


async def test_improved_swarm():
    """Test improved dynamic swarm execution"""
    
    print("\n" + "="*60)
    print("Testing Improved Dynamic Swarm Service")
    print("="*60 + "\n")
    
    service = await get_improved_dynamic_swarm_service()
    
    # Test with research task
    task = "Create a comprehensive research report about the latest developments in quantum computing in 2024 and 2025"
    execution_id = "test-improved-001"
    
    print(f"Task: {task}\n")
    print("Starting swarm execution...\n")
    
    tool_usage_count = 0
    agent_outputs = {}
    
    async for event in service.execute_improved_swarm(
        execution_id=execution_id,
        task=task,
        conversation_history=[]
    ):
        event_type = event.get("type")
        
        if event_type == "task_analysis":
            print(f"📊 Task Analysis:")
            print(f"   Primary Focus: {event.get('primary_focus')}")
            print(f"   Complexity: {event.get('complexity')}\n")
            
        elif event_type == "agent_created":
            agent = event.get("agent")
            role = event.get("role")
            tools = event.get("tools", [])
            print(f"🤖 Agent Created: {agent}")
            print(f"   Role: {role}")
            print(f"   Tools: {tools}\n")
            
        elif event_type == "swarm_init":
            agents = event.get("agents", [])
            print(f"🐝 Swarm Initialized with {len(agents)} agents: {', '.join(agents)}\n")
            
        elif event_type == "tool_execution":
            tool = event.get("tool")
            status = event.get("status")
            print(f"🔧 Tool Execution: {tool} - {status}")
            if tool == "tavily_search":
                params = event.get("params", {})
                print(f"   Query: {params.get('query', 'N/A')}")
            tool_usage_count += 1
            
        elif event_type == "tool_result":
            tool = event.get("tool")
            status = event.get("status")
            if status == "success":
                print(f"✅ Tool Result: {tool} succeeded")
                if tool == "tavily_search":
                    results_count = event.get("results_count", 0)
                    has_answer = event.get("has_answer", False)
                    print(f"   Found {results_count} results")
                    if has_answer:
                        print(f"   Direct answer available")
            else:
                print(f"❌ Tool Result: {tool} failed - {event.get('error', 'Unknown error')}")
            print()
            
        elif event_type == "status":
            message = event.get("message")
            if "tool calls" in message:
                print(f"📈 {message}")
                
        elif event_type == "complete":
            print("\n" + "="*60)
            print("✨ SWARM EXECUTION COMPLETE")
            print("="*60)
            
            output = event.get("output", "")
            agents_used = event.get("agents_used", 0)
            tools_used = event.get("tools_used", 0)
            
            print(f"\n📊 Execution Stats:")
            print(f"   Agents Used: {agents_used}")
            print(f"   Tools Used: {tools_used}")
            print(f"   Tool Usage Count: {tool_usage_count}")
            
            print("\n📄 Final Output:")
            print("-" * 40)
            print(output[:2000] if len(output) > 2000 else output)
            print("-" * 40)
            
            # Verify agents actually used tools
            if tools_used > 0:
                print("\n✅ SUCCESS: Agents used tools effectively!")
            else:
                print("\n⚠️ WARNING: No tool usage detected!")
                
        elif event_type == "error":
            print(f"\n❌ ERROR: {event.get('error')}")
            
    print("\n" + "="*60)
    print("Test Complete")
    print("="*60 + "\n")


if __name__ == "__main__":
    asyncio.run(test_improved_swarm())