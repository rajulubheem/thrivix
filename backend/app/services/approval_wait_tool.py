"""
Approval Wait Tool
A tool that actually waits for approval and executes the original tool when approved
"""
import asyncio
import json
from typing import Any, Dict, Optional
import structlog
from strands import tool

from app.services.tool_approval_manager import approval_manager

logger = structlog.get_logger()


def create_approval_wait_tool(tool_name: str, approval_id: str, callback_handler=None):
    """
    Create a tool that waits for approval and executes the original tool
    """
    
    @tool(name=f"approval_wait_{tool_name}")
    async def approval_wait_tool(**kwargs) -> Dict[str, Any]:
        """Wait for approval and execute the original tool if approved"""
        
        logger.info(f"⏳ APPROVAL WAIT TOOL CALLED: {approval_id} for tool {tool_name}")
        logger.info(f"📋 Input parameters: {kwargs}")
        
        # Send visible waiting message to UI
        if callback_handler:
            try:
                await callback_handler(
                    type="text_generation",
                    agent="system",
                    data={
                        "text": f"\n⏳ Waiting for approval to execute `{tool_name}`...\n",
                        "chunk": f"\n⏳ Waiting for approval to execute `{tool_name}`...\n"
                    }
                )
            except Exception as e:
                logger.error(f"Error sending waiting message: {e}")
        
        # Wait for approval response
        try:
            response = await approval_manager.wait_for_approval(approval_id, timeout=60)
            
            if response['approved']:
                logger.info(f"✅ Tool {tool_name} approved by user")
                
                # Get the original tool
                original_info = approval_manager.get_original_tool(approval_id)
                if not original_info:
                    logger.error(f"Original tool not found for {approval_id}")
                    return {
                        "status": "error",
                        "content": [{
                            "text": f"Error: Original tool information lost for {tool_name}"
                        }]
                    }
                
                original_tool = original_info['tool']
                original_input = response.get('modified_params', original_info['input'])
                
                # Send approval confirmation to UI
                if callback_handler:
                    try:
                        await callback_handler(
                            type="text_generation",
                            agent="system",
                            data={
                                "text": f"✅ Tool `{tool_name}` approved. Executing...\n",
                                "chunk": f"✅ Tool `{tool_name}` approved. Executing...\n"
                            }
                        )
                    except Exception as e:
                        logger.error(f"Error sending approval message: {e}")
                
                # Execute the original tool
                try:
                    logger.info(f"Executing original tool {tool_name} with params: {original_input}")
                    
                    # Check if the tool is async or sync
                    if asyncio.iscoroutinefunction(original_tool):
                        result = await original_tool(**original_input)
                    else:
                        # For sync tools, just call them directly
                        result = original_tool(**original_input)
                    
                    logger.info(f"✅ Tool {tool_name} executed successfully")
                    return result
                    
                except Exception as e:
                    logger.error(f"Error executing tool {tool_name}: {e}")
                    return {
                        "status": "error",
                        "content": [{
                            "text": f"Error executing {tool_name}: {str(e)}"
                        }]
                    }
            else:
                # Tool rejected
                logger.info(f"❌ Tool {tool_name} rejected by user")
                reason = response.get('reason', 'User rejected')
                
                # Send rejection notification to UI
                if callback_handler:
                    try:
                        await callback_handler(
                            type="text_generation",
                            agent="system",
                            data={
                                "text": f"❌ Tool `{tool_name}` rejected: {reason}\n",
                                "chunk": f"❌ Tool `{tool_name}` rejected: {reason}\n"
                            }
                        )
                    except Exception as e:
                        logger.error(f"Error sending rejection message: {e}")
                
                return {
                    "status": "error",
                    "content": [{
                        "text": f"Tool execution rejected: {reason}"
                    }]
                }
                
        except asyncio.TimeoutError:
            logger.warning(f"⏱️ Approval timeout for {tool_name}")
            return {
                "status": "error",
                "content": [{
                    "text": f"Tool approval timed out after 60 seconds"
                }]
            }
        except Exception as e:
            logger.error(f"Error in approval wait tool: {e}")
            return {
                "status": "error",
                "content": [{
                    "text": f"Error waiting for approval: {str(e)}"
                }]
            }
    
    return approval_wait_tool