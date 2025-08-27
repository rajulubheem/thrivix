"""
Synchronous Tool Approval Hook for Strands Agents
Uses synchronous callbacks as required by Strands hooks
"""
import json
import uuid
from typing import Any, Dict, Optional, Callable
from datetime import datetime
import structlog
import os
import threading
import queue
import asyncio

from app.services.tool_approval_manager import approval_manager
from app.services.approval_wait_tool import create_approval_wait_tool

logger = structlog.get_logger()

# Queue for async callbacks
callback_queue = queue.Queue()


def create_intercept_tool_call(callback_handler=None):
    """
    Create a synchronous tool interception callback
    """
    def intercept_tool_call(event):
        """
        Synchronous callback for BeforeToolInvocationEvent
        """
        try:
            # Access tool information
            tool_use = event.tool_use
            tool_name = tool_use.name if hasattr(tool_use, 'name') else tool_use.get("name", "unknown") if isinstance(tool_use, dict) else "unknown"
            tool_input = tool_use.input if hasattr(tool_use, 'input') else tool_use.get("input", {}) if isinstance(tool_use, dict) else {}
            agent_name = event.agent.name if hasattr(event, 'agent') and hasattr(event.agent, 'name') else "agent"
            
            logger.info(f"🔍 SYNC Intercepting tool call: {tool_name}")
            
            # Check if tool requires approval using the global manager
            if not approval_manager.requires_approval(tool_name):
                logger.info(f"✅ Tool {tool_name} does not require approval, executing normally")
                return  # Let the tool execute normally
            
            logger.info(f"🛑 Tool {tool_name} REQUIRES APPROVAL!")
            
            # Create approval request in the global manager
            approval_id = approval_manager.create_approval_request(
                tool_name=tool_name,
                tool_input=tool_input,
                original_tool=event.selected_tool,
                agent_name=agent_name
            )
            
            # Queue callback for async execution
            if callback_handler:
                logger.info(f"📤 Queueing approval request for {tool_name} to UI")
                callback_queue.put({
                    'handler': callback_handler,
                    'type': 'tool_approval_required',
                    'agent': agent_name,
                    'data': {
                        'approval_id': approval_id,
                        'tool': tool_name,
                        'parameters': tool_input,
                        'description': approval_manager.tool_settings.get(tool_name, {}).get('description', f'Execute {tool_name}')
                    }
                })
            
            # Create a simple tool that returns immediately to prevent retries
            from strands import tool
            
            @tool(name=f"approval_pending_{tool_name}")
            def approval_pending(**kwargs):
                """Tool requires approval - execution pending"""
                logger.info(f"🔐 Tool {tool_name} requires approval (ID: {approval_id})")
                # Return success to prevent retries
                return {
                    "status": "success", 
                    "results": [],
                    "answer": f"Tool '{tool_name}' requires human approval before execution. Please approve or reject the request in the approval dialog (ID: {approval_id}). Once approved, please retry your request.",
                    "content": [{
                        "text": f"⏳ Tool '{tool_name}' requires approval. Please check the approval dialog and approve/reject, then retry your request."
                    }]
                }
            
            event.selected_tool = approval_pending
            
            # Update tool_use to reflect the pending state
            if hasattr(event.tool_use, 'name'):
                event.tool_use.name = f"approval_pending_{tool_name}"
                event.tool_use.input = {'approval_id': approval_id}
            elif isinstance(event.tool_use, dict):
                event.tool_use["name"] = f"approval_pending_{tool_name}"
                event.tool_use["input"] = {'approval_id': approval_id}
            
            logger.info(f"⏸️ Tool {tool_name} execution paused for approval")
            
        except Exception as e:
            logger.error(f"Error in synchronous tool interception: {e}", exc_info=True)
    
    return intercept_tool_call


def create_process_tool_result():
    """
    Create a synchronous tool result processor callback
    """
    def process_tool_result(event):
        """
        Synchronous callback for AfterToolInvocationEvent
        """
        try:
            tool_use = event.tool_use
            tool_name = tool_use.name if hasattr(tool_use, 'name') else tool_use.get("name", "") if isinstance(tool_use, dict) else ""
            
            # Log if this was an approval pending tool
            if tool_name.startswith("approval_pending_"):
                logger.info(f"📋 Processed approval pending tool: {tool_name}")
                
        except Exception as e:
            logger.error(f"Error in synchronous tool result processing: {e}", exc_info=True)
    
    return process_tool_result


# Background thread to process callbacks
def process_callback_queue():
    """Background thread to process async callbacks"""
    import asyncio
    
    async def run_callback(item):
        handler = item['handler']
        await handler(
            type=item['type'],
            agent=item.get('agent', 'system'),
            data=item.get('data', {})
        )
    
    while True:
        try:
            item = callback_queue.get(timeout=1)
            if item:
                # Create new event loop for this thread
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(run_callback(item))
                loop.close()
        except queue.Empty:
            continue
        except Exception as e:
            logger.error(f"Error processing callback: {e}")


# Start background thread
callback_thread = threading.Thread(target=process_callback_queue, daemon=True)
callback_thread.start()