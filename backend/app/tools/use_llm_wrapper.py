"""
Wrapper for use_llm tool that properly configures the model
"""
import logging
from typing import Any, Dict
from datetime import datetime
from strands import Agent
from strands.models.openai import OpenAIModel
import os
import json

logger = logging.getLogger(__name__)

async def use_llm_with_model_async(prompt: str, system_prompt: str = None, session=None, **kwargs) -> Dict[str, Any]:
    """
    Create a new LLM instance with proper model configuration and stream thoughts.
    
    This wrapper ensures the nested agent uses OpenAI and streams its thinking process.
    """
    try:
        # Create OpenAI model configuration
        openai_model = OpenAIModel(
            client_args={
                "api_key": os.getenv("OPENAI_API_KEY"),
            },
            model_id="gpt-4o-mini",
            params={
                "max_tokens": 4000,
                "temperature": 0.7,
            }
        )
        
        # Get parent agent if available to inherit tools and context
        parent_agent = kwargs.get("agent")
        tools = []
        
        if parent_agent and hasattr(parent_agent, 'tool_registry'):
            # Inherit tools from parent but exclude use_llm to prevent recursion
            for tool_name, tool_obj in parent_agent.tool_registry.registry.items():
                if 'use_llm' not in tool_name.lower():
                    tools.append(tool_obj)
        
        # Extract context from parent agent's conversation history
        enhanced_system_prompt = system_prompt or "You are an expert research analyst. Provide deep, comprehensive analysis with specific insights and non-obvious connections."
        
        if parent_agent and hasattr(parent_agent, 'messages'):
            # Get last 2-3 messages for context (not entire history to avoid token overflow)
            recent_messages = parent_agent.messages[-4:] if len(parent_agent.messages) > 4 else parent_agent.messages
            
            # Create a context summary for the nested agent
            if recent_messages:
                context_summary = "Previous conversation context:\n"
                for msg in recent_messages:
                    if hasattr(msg, 'role') and hasattr(msg, 'content'):
                        role = msg.role
                        content = str(msg.content)[:200] + "..." if len(str(msg.content)) > 200 else str(msg.content)
                        context_summary += f"{role}: {content}\n"
                
                # Add context to the system prompt
                enhanced_system_prompt = f"""{system_prompt or 'You are an expert research analyst.'}

IMPORTANT CONTEXT:
{context_summary}

Current date and time context should be preserved from the main conversation.
When analyzing or searching, maintain awareness of any temporal context mentioned in the conversation above.
"""
        
        # Also check if session has additional context
        if session and 'context' in session:
            session_context = session.get('context', {})
            if 'date' in session_context or 'time' in session_context:
                enhanced_system_prompt += f"\nCurrent context: Date: {session_context.get('date', 'unknown')}, Time: {session_context.get('time', 'unknown')}"
        
        # Create the nested agent with proper configuration and context
        agent = Agent(
            model=openai_model,
            messages=[],
            tools=tools,
            system_prompt=enhanced_system_prompt
        )
        
        logger.info(f"Created nested agent for deep analysis with {len(tools)} tools")
        
        # Stream the agent's response and capture thoughts
        response_text = ""
        current_thought = ""
        
        # Add initial thought to session
        if session and 'thoughts' in session:
            session['thoughts'].append({
                'type': 'analyzing',
                'content': f'🧠 Starting deep analysis: "{prompt[:100]}..."',
                'timestamp': datetime.now().isoformat()
            })
        
        # Use async streaming to capture nested agent's thoughts
        async for event in agent.stream_async(prompt):
            if "data" in event:
                text_chunk = event["data"]
                response_text += text_chunk
                current_thought += text_chunk
                
                # Detect thought completion and add to session
                if session and any(punct in text_chunk for punct in ['. ', '.\n', '! ', '?\n']):
                    if current_thought.strip():
                        # Determine thought type
                        thought_type = 'analyzing'
                        if any(kw in current_thought.lower() for kw in ['searching', 'looking for', 'finding']):
                            thought_type = 'searching'
                        elif any(kw in current_thought.lower() for kw in ['pattern', 'trend', 'insight']):
                            thought_type = 'synthesizing'
                        elif any(kw in current_thought.lower() for kw in ['question', 'challenge', 'assumption']):
                            thought_type = 'evaluating'
                        
                        session['thoughts'].append({
                            'type': thought_type,
                            'content': f'[Deep Analysis] {current_thought.strip()}',
                            'timestamp': datetime.now().isoformat()
                        })
                        current_thought = ""
        
        # Add completion thought
        if session and 'thoughts' in session:
            session['thoughts'].append({
                'type': 'synthesizing',
                'content': '✅ Deep analysis completed',
                'timestamp': datetime.now().isoformat()
            })
        
        # Return the response
        return {
            "status": "success",
            "content": [{"text": response_text}]
        }
        
    except Exception as e:
        logger.error(f"Error in use_llm_with_model_async: {e}")
        return {
            "status": "error",
            "content": [{"text": f"Failed to perform deep analysis: {str(e)}"}]
        }

def use_llm_with_model(prompt: str, system_prompt: str = None, **kwargs) -> str:
    """
    Synchronous wrapper that creates a nested agent properly.
    Returns a string result directly as expected by Strands.
    """
    try:
        # Log the incoming prompt for debugging
        logger.info(f"use_llm_with_model called with prompt length: {len(prompt) if prompt else 0}")
        
        # Validate prompt
        if not prompt or len(prompt.strip()) == 0:
            logger.warning("Empty prompt received")
            return "I need a specific prompt to analyze. Please provide more details."
        
        # Create OpenAI model configuration
        openai_model = OpenAIModel(
            client_args={
                "api_key": os.getenv("OPENAI_API_KEY"),
            },
            model_id="gpt-4o-mini",
            params={
                "max_tokens": 4000,
                "temperature": 0.7,
            }
        )
        
        # Get parent agent if available to inherit tools and context
        parent_agent = kwargs.get("agent")
        tools = []
        context_messages = []
        
        if parent_agent and hasattr(parent_agent, 'tool_registry'):
            # Inherit tools from parent but exclude use_llm to prevent recursion
            for tool_name, tool_obj in parent_agent.tool_registry.registry.items():
                if 'use_llm' not in tool_name.lower():
                    tools.append(tool_obj)
        
        # Extract context from parent agent's conversation history
        if parent_agent and hasattr(parent_agent, 'messages'):
            # Get last 2-3 messages for context (not entire history to avoid token overflow)
            recent_messages = parent_agent.messages[-4:] if len(parent_agent.messages) > 4 else parent_agent.messages
            
            # Create a context summary for the nested agent
            if recent_messages:
                context_summary = "Previous conversation context:\n"
                for msg in recent_messages:
                    if hasattr(msg, 'role') and hasattr(msg, 'content'):
                        role = msg.role
                        content = str(msg.content)[:200] + "..." if len(str(msg.content)) > 200 else str(msg.content)
                        context_summary += f"{role}: {content}\n"
                
                # Add context to the system prompt
                enhanced_system_prompt = f"""{system_prompt or 'You are an expert research analyst.'}

IMPORTANT CONTEXT:
{context_summary}

Current date and time context should be preserved from the main conversation.
When analyzing or searching, maintain awareness of any temporal context mentioned in the conversation above.
"""
            else:
                enhanced_system_prompt = system_prompt or "You are an expert research analyst. Provide deep, comprehensive analysis with specific insights and non-obvious connections."
        else:
            enhanced_system_prompt = system_prompt or "You are an expert research analyst. Provide deep, comprehensive analysis with specific insights and non-obvious connections."
        
        # Create the nested agent with proper configuration
        agent = Agent(
            model=openai_model,
            messages=[],
            tools=tools,
            system_prompt=enhanced_system_prompt
        )
        
        logger.info(f"Created nested agent for deep analysis with {len(tools)} tools")
        
        # Run the agent with the prompt (synchronously)
        result = agent(prompt)
        
        # Log the result for debugging
        logger.info(f"Deep analysis completed, result length: {len(str(result))}")
        
        # Return the string result directly
        return str(result) if result else "Analysis completed but no specific insights were generated."
        
    except Exception as e:
        logger.error(f"Error in use_llm_with_model: {e}", exc_info=True)
        # Return error message as string
        return f"I encountered an error during deep analysis: {str(e)}. I'll continue with the research using available information."

# Create a tool-compatible wrapper
from strands import tool

@tool
def use_llm_fixed(
    prompt: str,
    system_prompt: str = None,
    agent: Any = None,
    **kwargs
) -> str:
    """
    Fixed version of use_llm that properly configures the OpenAI model.
    Returns a string result as expected by Strands tools.
    
    Args:
        prompt: The prompt to analyze
        system_prompt: Optional system prompt for the analysis
        agent: Parent agent (automatically passed by Strands)
    
    Returns:
        String containing the analysis results
    """
    # Log tool invocation
    logger.info(f"use_llm_fixed tool invoked with prompt: {prompt[:100] if prompt else 'None'}...")
    
    # Clean and validate the prompt
    if isinstance(prompt, dict):
        # If prompt is a dict, extract the actual prompt string
        prompt = prompt.get('prompt', '') or prompt.get('query', '') or str(prompt)
    
    prompt = str(prompt).strip()
    
    # Get session from kwargs if available for thought tracking
    session = kwargs.get('session')
    
    # Add thought tracking if session is available
    if session and isinstance(session, dict) and 'thoughts' in session:
        session['thoughts'].append({
            'type': 'analyzing',
            'content': f'🧠 Starting deep analysis: "{prompt[:100]}..."',
            'timestamp': datetime.now().isoformat()
        })
    
    # Call the actual analysis function
    result = use_llm_with_model(prompt, system_prompt, agent=agent, session=session)
    
    # Add completion thought if session is available
    if session and isinstance(session, dict) and 'thoughts' in session:
        session['thoughts'].append({
            'type': 'synthesizing',
            'content': '✅ Deep analysis completed',
            'timestamp': datetime.now().isoformat()
        })
    
    # Log the result
    logger.info(f"use_llm_fixed returning result of length: {len(result) if result else 0}")
    
    return result