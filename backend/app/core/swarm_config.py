"""
Swarm Configuration - Prevent infinite loops and ensure proper agent coordination
"""

class SwarmConfig:
    """Configuration to prevent infinite handoffs and improve agent behavior"""
    
    # Maximum limits to prevent infinite loops
    MAX_HANDOFFS = 5  # Reduced from 20 to prevent endless loops
    MAX_ITERATIONS = 10  # Total iterations across all agents
    MAX_AGENT_REPEATS = 2  # Max times same agent can be called
    
    # Timeouts
    EXECUTION_TIMEOUT = 300  # 5 minutes max for entire swarm
    NODE_TIMEOUT = 60  # 1 minute per agent
    
    # Anti-repetition settings
    REPETITIVE_HANDOFF_WINDOW = 3  # Check last 3 handoffs
    MIN_UNIQUE_AGENTS = 2  # Need at least 2 different agents in window
    
    # Agent coordination rules
    AGENT_RULES = {
        "researcher": {
            "max_iterations": 1,
            "allowed_handoffs": ["architect", "developer"],
            "role": "Gather requirements and research"
        },
        "architect": {
            "max_iterations": 1,
            "allowed_handoffs": ["developer", "api_specialist"],
            "role": "Design system architecture"
        },
        "developer": {
            "max_iterations": 2,
            "allowed_handoffs": ["tester", "reviewer"],
            "role": "Implement the solution"
        },
        "reviewer": {
            "max_iterations": 1,
            "allowed_handoffs": [],  # Final agent - no handoffs
            "role": "Review and finalize"
        },
        "tester": {
            "max_iterations": 1,
            "allowed_handoffs": ["developer", "reviewer"],
            "role": "Test the implementation"
        }
    }
    
    @classmethod
    def should_stop_handoff(cls, handoff_history):
        """Check if we should stop handoffs to prevent loops"""
        if len(handoff_history) >= cls.MAX_HANDOFFS:
            return True, "Maximum handoffs reached"
        
        # Check for repetitive patterns
        if len(handoff_history) >= cls.REPETITIVE_HANDOFF_WINDOW:
            recent = handoff_history[-cls.REPETITIVE_HANDOFF_WINDOW:]
            unique_agents = len(set(recent))
            if unique_agents < cls.MIN_UNIQUE_AGENTS:
                return True, "Repetitive handoff pattern detected"
        
        # Check for same agent appearing too many times
        agent_counts = {}
        for agent in handoff_history:
            agent_counts[agent] = agent_counts.get(agent, 0) + 1
            if agent_counts[agent] > cls.MAX_AGENT_REPEATS:
                return True, f"Agent {agent} called too many times"
        
        return False, None
    
    @classmethod
    def get_next_agent(cls, current_agent, handoff_history):
        """Intelligently determine next agent to prevent loops"""
        rules = cls.AGENT_RULES.get(current_agent, {})
        allowed = rules.get("allowed_handoffs", [])
        
        # Filter out agents that have been called too many times
        agent_counts = {}
        for agent in handoff_history:
            agent_counts[agent] = agent_counts.get(agent, 0) + 1
        
        valid_next = [
            agent for agent in allowed 
            if agent_counts.get(agent, 0) < cls.MAX_AGENT_REPEATS
        ]
        
        # If no valid next agents, return None to stop
        return valid_next[0] if valid_next else None