"""
Web-compatible handoff_to_user implementation
"""
import logging
from typing import Dict, Any
from strands import tool

logger = logging.getLogger(__name__)

# Global session storage for handoff state
_handoff_state = {}

def set_handoff_session(session_id: str, session: Dict[str, Any]):
    """Store session reference for handoff tool"""
    _handoff_state[session_id] = session

def clear_handoff_session(session_id: str):
    """Clear session reference after use"""
    if session_id in _handoff_state:
        del _handoff_state[session_id]

@tool
def web_handoff_to_user(
    message: str,
    breakout_of_loop: bool = False
) -> str:
    """
    Request clarification or input from the user.
    
    This tool allows the AI to ask for clarification when queries are ambiguous
    or when additional information is needed to provide a better response.
    
    Args:
        message: The question or request to show to the user
        breakout_of_loop: If True, completely stops execution (used for terminal handoff)
    
    Returns:
        A message indicating the handoff was initiated
    """
    logger.info(f"Web handoff requested: {message}")
    
    # Mark that we need user approval - this will be detected by the streaming handler
    # The actual session update happens in the main conversation handler
    if breakout_of_loop:
        # Complete handoff - stop agent execution
        raise HandoffException(message, complete=True)
    else:
        # Interactive mode - pause for input
        raise HandoffException(message, complete=False)

class HandoffException(Exception):
    """Exception raised to signal handoff to user"""
    def __init__(self, message: str, complete: bool = False):
        self.message = message
        self.complete = complete
        super().__init__(message)