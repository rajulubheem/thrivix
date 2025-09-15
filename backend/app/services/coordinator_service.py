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
        
        # CRITICAL: Ensure handoff_to_agent is ALWAYS in the tools list
        # Create a simple handoff wrapper if not provided in tools
        if tools is None:
            tools = []
        
        # Check if handoff_to_agent is already in tools
        has_handoff = False
        for tool in tools:
            if callable(tool):
                # Check various ways the tool might be named
                tool_name = None
                if hasattr(tool, '__name__'):
                    tool_name = tool.__name__
                elif hasattr(tool, 'name'):
                    tool_name = tool.name
                elif hasattr(tool, '__wrapped__') and hasattr(tool.__wrapped__, '__name__'):
                    tool_name = tool.__wrapped__.__name__
                
                if tool_name and 'handoff' in tool_name.lower():
                    has_handoff = True
                    logger.info(f"✅ Found handoff tool: {tool_name}")
                    break
        
        if not has_handoff:
            logger.error("❌ CRITICAL: handoff_to_agent not found in tools! Coordinator CANNOT delegate!")
            logger.info(f"📦 Available tools: {[getattr(t, '__name__', getattr(t, 'name', 'unknown')) for t in tools if callable(t)]}")
        
        # Get or create coordinator with consistent naming for persistence
        coordinator = self.strands_service.get_or_create_agent(
            session_id=session_id,
            agent_name="coordinator",  # MUST be exactly "coordinator" for persistence logic
            system_prompt=coordinator_prompt,
            tools=tools,  # Now tools is never None
            model_config={
                "model_id": "gpt-4o",  # Use GPT-4 for better instruction following
                "temperature": 0.0,  # Zero temperature for most deterministic behavior
                "max_tokens": 16000
            },
            force_new=False  # Reuse existing coordinator for continuation messages
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

CRITICAL: You have a tool called 'handoff_to_agent' that you MUST USE for every user message.
DO NOT write the function call as text - USE the actual tool from your tools list.

YOUR ONLY ALLOWED ACTION:
- USE the handoff_to_agent tool (it appears in your available tools)
- Never output text
- Never write the function call as a string
- Actually CALL the tool function

You maintain the COMPLETE conversation history and context for this session.
You can see ALL previous messages and maintain continuity across all interactions.

Current Task: {task}

"""
        
        if agent_configs:
            prompt += "You have the following specialized capabilities that you coordinate:\n\n"
            for i, config in enumerate(agent_configs, 1):
                # Handle both dict and string configs
                if isinstance(config, dict):
                    name = config.get('name', f'Capability {i}')
                    description = config.get('description', config.get('system_prompt', ''))[:200]
                else:
                    # If it's a string or something else, use it as the name
                    name = str(config) if config else f'Capability {i}'
                    description = ""
                prompt += f"{i}. **{name}**: {description}\n"
            
            prompt += "\nYou DELEGATE to these capabilities. You NEVER synthesize or respond yourself.\n"
        
        prompt += """
CRITICAL COORDINATOR RULES - YOU MUST FOLLOW THESE:

1. YOU ARE ONLY A COORDINATOR - YOU DO NOT DO ANY ACTUAL WORK
2. FOR EVERY USER REQUEST, YOU MUST USE handoff_to_agent TO DELEGATE
3. NEVER PROVIDE DIRECT ANSWERS - ALWAYS DELEGATE TO A SPECIALIST
4. CONTINUE DELEGATING THROUGHOUT THE ENTIRE CONVERSATION
5. THE handoff_to_agent TOOL IS YOUR ONLY WAY TO RESPOND
6. DO NOT SUMMARIZE, ACKNOWLEDGE, OR RESPOND TO THE USER - ONLY DELEGATE

YOUR ONLY JOB IS TO:
1. Understand what the user needs
2. IMMEDIATELY call handoff_to_agent to delegate to a specialist
3. NEVER write ANY text response yourself
4. When a specialist completes work, DO NOT comment on it
5. For follow-up requests, IMMEDIATELY delegate again WITHOUT commentary

CRITICAL: If you receive ANY user message and don't call handoff_to_agent, you have FAILED.
EVERY user message MUST result in a handoff_to_agent call. NO EXCEPTIONS.

HOW TO USE THE handoff_to_agent TOOL:
- It's a function in your tools list - CALL it, don't write it as text
- Pass parameters: to_agent (string), reason (string), context (object)
- The tool will handle the delegation automatically

DELEGATION PATTERNS:
- User says "hello" or "hi" → Call tool with to_agent="greeting_specialist"
- User introduces themselves → Call tool with to_agent="introduction_handler"  
- User provides information → Call tool with to_agent="conversation_specialist"
- User says "proceed" → Call tool with to_agent="implementation_specialist"
- User says "continue" → Call tool with to_agent="continuation_specialist"
- User says "thanks" → Call tool with to_agent="gratitude_specialist"
- ANY OTHER INPUT → Call tool with appropriate to_agent parameter

CRITICAL - DO NOT DO THIS (WRONG):
❌ "I have gathered some current trends..." - NO! You cannot summarize!
❌ "The design and architecture planning is underway..." - NO! You cannot provide status updates!
❌ "Please let me know if you have specific requirements..." - NO! You cannot ask questions!
❌ "If you have any additional input..." - NO! You cannot request feedback!

CRITICAL - ALWAYS DO THIS (CORRECT):
✅ User says anything → IMMEDIATELY USE the handoff_to_agent TOOL
✅ NEVER write text - only use the tool function
✅ Let the specialist handle ALL communication with the user

ENFORCEMENT RULES:
- If you output ANY TEXT, you have FAILED
- You MUST use the tool even for "hello", "thanks", "goodbye", or "what is 2+2"
- Your response should ONLY be a TOOL CALL - NO TEXT
- Do not explain what you're doing - just USE THE TOOL

Remember: You are ONLY a coordinator. Your ONLY action is to USE the handoff_to_agent TOOL.

FINAL REMINDER:
- Use the handoff_to_agent tool from your tools list
- Do not output any text
- Do not write function calls as strings
- Actually invoke the tool function
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
        # Strands automatically loads all previous messages from the session. However,
        # in some flows we maintain history in external context. If explicit
        # conversation_history is provided, reconcile it into the shared
        # conversation manager before execution so ALL agents see it.
        if hasattr(coordinator, 'conversation_manager') and coordinator.conversation_manager:
            conversation_manager = coordinator.conversation_manager
            existing_message_count = len(conversation_manager.messages) if hasattr(conversation_manager, 'messages') else 0
            
            logger.info(f"📚 Strands loaded {existing_message_count} messages from session persistence")
            
            # Reconcile provided history into the shared manager if needed
            try:
                if conversation_history and isinstance(conversation_history, list):
                    # Normalize to role/content dicts only
                    def norm(msg: Dict[str, Any]) -> Dict[str, str]:
                        return {
                            'role': str(msg.get('role', 'user')),
                            'content': str(msg.get('content', ''))
                        }
                    normalized = [norm(m) for m in conversation_history if isinstance(m, dict)]
                    # If coordinator has fewer messages or differs, replace with normalized history
                    needs_sync = (existing_message_count < len(normalized))
                    if not needs_sync and existing_message_count == len(normalized):
                        try:
                            for a, b in zip(conversation_manager.messages, normalized):
                                if a.get('role') != b.get('role') or (a.get('content') or '') != (b.get('content') or ''):
                                    needs_sync = True
                                    break
                        except Exception:
                            needs_sync = True
                    if needs_sync:
                        logger.info(f"🔁 Syncing {len(normalized)} messages into shared conversation manager for session {session_id}")
                        conversation_manager.messages = normalized
                        # Best-effort: some managers expose a save/sync
                        try:
                            if hasattr(conversation_manager, 'save') and callable(conversation_manager.save):
                                conversation_manager.save()
                        except Exception:
                            pass
                        existing_message_count = len(conversation_manager.messages)
            except Exception as e:
                logger.warning(f"⚠️ Failed to reconcile conversation history into Strands manager: {e}")
            
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
                    
                    # CRITICAL: Don't stream coordinator's function calls to UI
                    # The coordinator should only be calling handoff_to_agent
                    # These calls are internal and shouldn't be shown to users
                    if "handoff_to_agent" in text_chunk:
                        logger.info(f"🔄 Coordinator calling handoff function, not streaming to UI")
                        # Don't send function calls to UI
                        continue
                    
                    # Only stream if it's not a function call
                    # (This shouldn't happen if coordinator is properly configured)
                    if callback_handler:
                        logger.warning(f"⚠️ Coordinator generated text instead of just calling handoff: {text_chunk[:50]}...")
                        # Optionally still send it but mark as an error
                        # await callback_handler(
                        #     type="text_generation",
                        #     agent="coordinator",
                        #     data={
                        #         "chunk": text_chunk,  # Primary chunk key
                        #         "text": text_chunk,
                        #         "content": text_chunk,
                        #         "accumulated": accumulated_text,
                        #         "sequence": sequence_counter  # Use proper sequence counter
                        #     }
                        # )
                        # sequence_counter += 1  # Increment after each chunk
                
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
            
            # Send agent completed event - but DON'T send handoff text to UI
            if callback_handler:
                # Check if this is just a handoff call (which shouldn't be shown to users)
                if "handoff_to_agent" in result_content:
                    logger.info(f"✅ Coordinator completed with handoff call - not sending to UI")
                    # Still send completion event but with empty content
                    await callback_handler(
                        type="agent_completed",
                        agent="coordinator",
                        data={
                            "output": "",  # Empty output for coordinator handoffs
                            "tokens": 0
                        }
                    )
                else:
                    # This shouldn't happen - coordinator should only output handoff calls
                    logger.warning(f"⚠️ Coordinator generated non-handoff text: {result_content[:100]}")
                    await callback_handler(
                        type="agent_completed",
                        agent="coordinator",
                        data={
                            "output": result_content,
                            "tokens": len(result_content.split()) if result_content else 0
                        }
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
