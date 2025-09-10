"""
Coordinator Service - Single persistent agent per session following Strands best practices
"""
import os
from typing import Dict, Any, List, Optional, Callable
import structlog
from strands import Agent
from strands.models.openai import OpenAIModel
from app.services.strands_session_service import get_strands_session_service

logger = structlog.get_logger()

class CoordinatorService:
    """
    Manages a single persistent coordinator agent per session.
    The coordinator maintains full conversation history and delegates tasks internally.
    """
    
    def __init__(self):
        self.strands_service = get_strands_session_service()
        
    def get_or_create_coordinator(
        self,
        session_id: str,
        task: str,
        agent_configs: List[Dict[str, Any]] = None,
        tools: List = None,
        callback_handler: Optional[Callable] = None
    ) -> Agent:
        """
        Get or create the single coordinator agent for this session.
        Uses session_id as agent_id to ensure persistence.
        """
        
        # CRITICAL FIX: Use "coordinator" as agent_name so strands_session_service 
        # uses session_id as the agent_id for proper persistence
        # This ensures the same agent is reused across all requests in the session
        
        # Build coordinator prompt with delegation instructions
        coordinator_prompt = self._build_coordinator_prompt(session_id, task, agent_configs)
        
        # Get or create coordinator with consistent naming for persistence
        coordinator = self.strands_service.get_or_create_agent(
            session_id=session_id,
            agent_name="coordinator",  # MUST be exactly "coordinator" for persistence logic
            system_prompt=coordinator_prompt,
            tools=tools or [],
            model_config={
                "model_id": "gpt-4o-mini",
                "temperature": 0.7,
                "max_tokens": 16000
            },
            force_new=False  # Now this will actually work with unique agent_id
        )
        
        # The coordinator now has access to the FULL conversation history
        # through the shared session manager and conversation manager
        logger.info(f"✅ Coordinator ready for session {session_id} with full context")
        
        return coordinator
    
    def _build_coordinator_prompt(
        self,
        session_id: str,
        task: str,
        agent_configs: List[Dict[str, Any]] = None
    ) -> str:
        """Build coordinator prompt with delegation instructions"""
        
        prompt = f"""You are the Coordinator Agent for session {session_id}.

You maintain the COMPLETE conversation history and context for this session.
You can see ALL previous messages and maintain continuity across all interactions.

Current Task: {task}

"""
        
        if agent_configs:
            prompt += "You have the following specialized capabilities that you coordinate:\n\n"
            for i, config in enumerate(agent_configs, 1):
                name = config.get('name', f'Capability {i}')
                description = config.get('description', config.get('system_prompt', ''))[:200]
                prompt += f"{i}. **{name}**: {description}\n"
            
            prompt += "\nYou synthesize these capabilities to provide comprehensive responses.\n"
        
        prompt += """
IMPORTANT INSTRUCTIONS:
1. You ALWAYS have access to the full conversation history
2. Reference previous messages when relevant
3. Maintain context across all interactions
4. Provide direct, synthesized answers
5. Use your tools when needed to complete tasks
6. When a specialist is needed, DELEGATE by calling the tool `handoff_to_agent` with:
   - to_agent: the exact agent name from your configured capabilities
   - reason: why you are delegating
   - context: JSON context (inputs, partial results, file paths)
   Do not write a plan when code or file operations are required — delegate instead.

Remember: You are the ONLY agent in this session. You see everything and remember everything.
"""
        
        return prompt
    
    async def execute_coordinator(
        self,
        session_id: str,
        task: str,
        agent_configs: List[Dict[str, Any]] = None,
        tools: List = None,
        callback_handler: Optional[Callable] = None,
        conversation_history: List[Dict[str, str]] = None,
        stop_check: Optional[Callable[[], bool]] = None
    ) -> Dict[str, Any]:
        """
        Execute the coordinator agent with the given task.
        Returns the actual message content, not execution objects.
        """
        
        # CRITICAL: We'll add conversation history to the agent's messages array after creating it
        # The SlidingWindowConversationManager doesn't have add_user_message/add_assistant_message methods
        # It works by managing the agent's messages array directly
        
        # Get or create the coordinator
        coordinator = self.get_or_create_coordinator(
            session_id=session_id,
            task=task,
            agent_configs=agent_configs,
            tools=tools,
            callback_handler=callback_handler
        )
        
        # CRITICAL: According to Strands documentation:
        # - Session manager automatically persists conversation history
        # - Conversation manager is automatically populated from session on agent creation
        # - We should NOT manually manipulate the messages array
        # - The framework handles all persistence through FileSessionManager
        
        # Since coordinator uses session_id as agent_id and force_new=False,
        # Strands automatically loads all previous messages from the session
        
        if hasattr(coordinator, 'conversation_manager') and coordinator.conversation_manager:
            conversation_manager = coordinator.conversation_manager
            existing_message_count = len(conversation_manager.messages) if hasattr(conversation_manager, 'messages') else 0
            
            logger.info(f"📚 Strands loaded {existing_message_count} messages from session persistence")
            
            # Log the messages for debugging
            if existing_message_count > 0:
                logger.info(f"✅ Coordinator has full conversation history from Strands session")
                # Show last few messages for context
                for msg in conversation_manager.messages[-3:]:
                    role = msg.get('role', 'unknown')
                    content = msg.get('content', '')[:100]
                    logger.debug(f"  [{role}]: {content}...")
            else:
                logger.warning(f"⚠️ No messages loaded from Strands session - this might be a new session")
        else:
            logger.warning(f"⚠️ Coordinator has no conversation_manager attribute!")
        
        # Log current context state
        context = self.strands_service.get_context(session_id)
        
        # Check the conversation manager's message count (this is what matters)
        conversation_manager = coordinator.conversation_manager if hasattr(coordinator, 'conversation_manager') else None
        strands_message_count = len(conversation_manager.messages) if conversation_manager and hasattr(conversation_manager, 'messages') else 0
        
        logger.info(f"📚 Coordinator executing with {strands_message_count} messages in shared conversation manager")
        
        try:
            # Log callback handler status
            logger.info(f"🔧 Callback handler provided: {callback_handler is not None}")
            
            # Send agent started event
            if callback_handler:
                logger.info(f"📤 Sending agent_started event for coordinator")
                await callback_handler(
                    type="agent_started",
                    agent="coordinator",
                    data={"task": task}
                )
            else:
                logger.warning(f"⚠️ No callback handler provided to coordinator")
            
            # Execute the coordinator with streaming
            result_content = ""
            accumulated_text = ""
            sequence_counter = 0  # Start sequence from 0
            
            logger.info(f"🚀 Starting coordinator streaming for task: {task[:50]}...")
            
            # Stream the response
            agent_stream = coordinator.stream_async(task)
            chunk_count = 0
            
            async for event in agent_stream:
                # Cooperative stop: if stop requested, close stream and exit
                try:
                    if stop_check and stop_check():
                        logger.info(f"🛑 Stop requested for session {session_id}; closing coordinator stream")
                        try:
                            await agent_stream.aclose()
                        except Exception:
                            pass
                        break
                except Exception:
                    # If stop_check raises, be safe and break
                    break
                # Log event structure for debugging
                logger.debug(f"📡 Stream event keys: {event.keys() if isinstance(event, dict) else 'not a dict'}")
                
                # Handle text generation - Strands sends text in "data" key
                if "data" in event and event["data"]:
                    text_chunk = event["data"]
                    result_content += text_chunk
                    accumulated_text += text_chunk
                    chunk_count += 1
                    
                    logger.debug(f"📤 Chunk {chunk_count}: {text_chunk[:50] if text_chunk else 'empty'}...")
                    
                    # Stream individual chunks to UI for real-time display
                    if callback_handler:
                        await callback_handler(
                            type="text_generation",
                            agent="coordinator",
                            data={
                                "chunk": text_chunk,  # Primary chunk key
                                "text": text_chunk,
                                "content": text_chunk,
                                "accumulated": accumulated_text,
                                "sequence": sequence_counter  # Use proper sequence counter
                            }
                        )
                        sequence_counter += 1  # Increment after each chunk
                
                # Handle tool usage
                elif "current_tool_use" in event:
                    tool_info = event["current_tool_use"]
                    tool_name = tool_info.get("name", "")
                    
                    if tool_name and callback_handler:
                        await callback_handler(
                            type="tool_call",
                            agent="coordinator",
                            data={
                                "tool": tool_name,
                                "parameters": tool_info.get("input", {})
                            }
                        )
                
                # Handle result
                elif "result" in event:
                    result = event["result"]
                    if hasattr(result, 'content') and result.content:
                        if result.content not in result_content:
                            result_content = result.content
            
            # Log what we captured
            logger.info(f"📝 Captured {len(result_content)} chars from coordinator: {result_content if result_content else 'EMPTY'}")
            
            # If we didn't capture any content from streaming, log a warning
            if not result_content:
                logger.warning(f"⚠️ No content captured from coordinator streaming for session {session_id}")
                # Try to get the last message from the conversation manager as fallback
                if hasattr(coordinator, 'conversation_manager') and coordinator.conversation_manager:
                    if hasattr(coordinator.conversation_manager, 'messages') and coordinator.conversation_manager.messages:
                        last_msg = coordinator.conversation_manager.messages[-1]
                        if last_msg.get('role') == 'assistant':
                            result_content = last_msg.get('content', '')
                            logger.info(f"📝 Retrieved response from conversation manager: {result_content[:100]}...")
                            
                            # CRITICAL FIX: Send the fallback content as a text_generation event
                            if result_content and callback_handler:
                                logger.info(f"📤 Sending fallback content as text_generation event")
                                await callback_handler(
                                    type="text_generation",
                                    agent="coordinator",
                                    data={
                                        "chunk": result_content,  # Send entire content as one chunk
                                        "text": result_content,
                                        "content": result_content,
                                        "accumulated": result_content,
                                        "sequence": 0  # Single chunk, sequence 0
                                    }
                                )
            
            # Send agent completed event with content
            if callback_handler:
                logger.info(f"📤 Sending agent_completed with {len(result_content)} chars")
                # CRITICAL: Send with output in data field for streaming callback to capture
                await callback_handler(
                    type="agent_completed",
                    agent="coordinator",
                    data={
                        "output": result_content,  # This will be captured by streaming callback
                        "tokens": len(result_content.split()) if result_content else 0
                    }
                )
                
                # Also send an agent_done event directly if we have content
                if result_content:
                    logger.info(f"📤 Also sending agent_done event directly with content")
                    await callback_handler(
                        type="agent_done",
                        agent="coordinator",
                        content=result_content  # Send content directly at top level
                    )
            
            # Return the actual message content
            return {
                "success": True,
                "content": result_content or "I'm here to help. How can I assist you?",
                "agent": "coordinator",
                "session_id": session_id
            }
            
        except Exception as e:
            logger.error(f"Coordinator execution failed: {e}")
            return {
                "success": False,
                "content": f"Error: {str(e)}",
                "agent": "coordinator",
                "session_id": session_id
            }

# Global instance
_coordinator_service = None

def get_coordinator_service() -> CoordinatorService:
    """Get or create the global coordinator service"""
    global _coordinator_service
    if _coordinator_service is None:
        _coordinator_service = CoordinatorService()
    return _coordinator_service
