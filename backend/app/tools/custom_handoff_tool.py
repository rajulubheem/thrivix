"""
Custom handoff_to_user implementation for web interface
"""
from strands import tool
import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Store pending handoff requests
handoff_requests = {}

@tool
def web_handoff_to_user(message: str, breakout_of_loop: bool = False) -> str:
    """
    Custom handoff tool that works with web interface.
    
    Args:
        message: The message to display to the user
        breakout_of_loop: If True, stops the agent execution completely
        
    Returns:
        The user's response (when breakout_of_loop=False)
    """
    import uuid
    from datetime import datetime
    
    # Generate a unique handoff ID
    handoff_id = str(uuid.uuid4())
    
    # Store the handoff request
    handoff_requests[handoff_id] = {
        'message': message,
        'breakout': breakout_of_loop,
        'timestamp': datetime.now().isoformat(),
        'response': None,
        'status': 'pending'
    }
    
    logger.info(f"Handoff request created: {handoff_id} - {message}")
    
    if breakout_of_loop:
        # For complete handoff, we signal to stop and return a message
        return f"HANDOFF_COMPLETE:{handoff_id}:{message}"
    else:
        # For interactive mode, we need to wait for user response
        # In a web context, we'll use a special marker that the backend can handle
        return f"HANDOFF_WAIT:{handoff_id}:{message}"

def set_handoff_response(handoff_id: str, response: str):
    """
    Set the user's response for a handoff request
    """
    if handoff_id in handoff_requests:
        handoff_requests[handoff_id]['response'] = response
        handoff_requests[handoff_id]['status'] = 'responded'
        logger.info(f"Handoff response set for {handoff_id}: {response}")
        return True
    return False

def get_handoff_response(handoff_id: str) -> Optional[str]:
    """
    Get the user's response for a handoff request
    """
    if handoff_id in handoff_requests:
        return handoff_requests[handoff_id].get('response')
    return None

def clear_handoff_requests():
    """
    Clear all handoff requests
    """
    handoff_requests.clear()