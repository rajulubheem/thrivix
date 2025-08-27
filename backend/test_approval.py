#!/usr/bin/env python
"""
Test script to verify tool approval system is working
"""
import asyncio
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

# Set up environment
os.environ["OPENAI_API_KEY"] = os.getenv("OPENAI_API_KEY", "your-key-here")
os.environ["TAVILY_API_KEY"] = os.getenv("TAVILY_API_KEY", "your-key-here")

from strands import Agent
from strands.models.openai import OpenAIModel
from strands import tool
from app.services.tool_approval_hook import ToolApprovalInterceptor, get_approval_manager
import structlog

logger = structlog.get_logger()

# Create a simple tool that requires approval
@tool
async def test_tool(message: str) -> dict:
    """A test tool that should require approval"""
    return {
        "status": "success",
        "content": [{"text": f"Tool executed with message: {message}"}]
    }

async def test_callback(type: str, **kwargs):
    """Test callback handler"""
    print(f"📣 Callback: {type} - {kwargs}")

async def main():
    print("🚀 Testing Tool Approval System")
    
    # Create approval manager
    approval_manager = ToolApprovalInterceptor(
        callback_handler=test_callback,
        tool_settings={
            "test_tool": {
                "requires_approval": True,
                "name": "Test Tool",
                "description": "A test tool"
            }
        }
    )
    
    # Create model
    model = OpenAIModel(
        client_args={"api_key": os.getenv("OPENAI_API_KEY")},
        model_id="gpt-4o-mini",
        params={"temperature": 0.7, "max_tokens": 1000}
    )
    
    # Create agent with approval hooks
    agent = Agent(
        model=model,
        tools=[test_tool],
        system_prompt="You are a test agent. Use the test_tool with message 'Hello from test'",
        hooks=[approval_manager]
    )
    
    print("✅ Agent created with approval hooks")
    print(f"📋 Agent hooks: {agent._hooks if hasattr(agent, '_hooks') else 'No hooks attribute'}")
    
    # Test the agent
    print("\n📝 Sending message to agent...")
    response = await agent.invoke_async("Please use the test_tool to say hello")
    
    print(f"\n📬 Response: {response}")
    
    # Check pending approvals
    pending = approval_manager.get_pending_approvals()
    print(f"\n⏳ Pending approvals: {pending}")
    
    if pending:
        # Simulate approval
        approval_id = list(pending.keys())[0]
        print(f"\n✅ Approving tool execution: {approval_id}")
        approval_manager.approve_tool(approval_id, approved=True)
        
        # Re-run to see if it works
        print("\n📝 Re-running agent after approval...")
        response = await agent.invoke_async("Please use the test_tool to say hello")
        print(f"\n📬 Final response: {response}")

if __name__ == "__main__":
    asyncio.run(main())