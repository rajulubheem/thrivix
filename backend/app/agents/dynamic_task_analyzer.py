"""
Dynamic Task Analyzer
Analyzes tasks and creates appropriate agents dynamically
"""
from typing import List, Dict, Any
import structlog

logger = structlog.get_logger()

class DynamicTaskAnalyzer:
    """Analyzes tasks and determines what agents are needed"""
    
    def analyze_task(self, task: str, max_agents: int = 10) -> List[Dict[str, Any]]:
        """
        Analyze task and create appropriate agents dynamically
        This is a simple implementation - can be enhanced with AI
        """
        task_lower = task.lower()
        agents = []
        
        # Analyze task complexity and requirements
        needs_search = any(word in task_lower for word in ["latest", "news", "search", "find", "current", "recent"])
        needs_summary = any(word in task_lower for word in ["summary", "summarize", "brief", "overview"])
        needs_analysis = any(word in task_lower for word in ["analyze", "compare", "evaluate", "assess"])
        needs_code = any(word in task_lower for word in ["code", "implement", "create", "build", "develop"])
        
        # Create agents based on task needs
        if needs_search:
            agents.append({
                "name": f"{self._extract_topic(task)} researcher",
                "role": "researcher",
                "tools": ["tavily_search"],
                "description": "Research and gather information"
            })
        
        if needs_code:
            agents.append({
                "name": "code developer",
                "role": "developer",
                "tools": ["file_write", "file_read"],
                "description": "Write and implement code"
            })
        
        if needs_analysis:
            agents.append({
                "name": "data analyst",
                "role": "analyst",
                "tools": [],  # Analysis doesn't need tools, just reasoning
                "description": "Analyze and evaluate information"
            })
        
        if needs_summary or (needs_search and len(agents) > 0):
            # Add summarizer if explicitly needed or if we have search results
            agents.append({
                "name": "information summarizer",
                "role": "summarizer",
                "tools": [],  # No tools needed for summarization
                "description": "Summarize and synthesize information"
            })
        
        # If no specific needs identified, create a general assistant
        if not agents:
            agents.append({
                "name": "general assistant",
                "role": "assistant",
                "tools": ["tavily_search"],
                "description": "General task assistance"
            })
        
        # Limit to max_agents
        if len(agents) > max_agents:
            logger.info(f"Limiting from {len(agents)} to {max_agents} agents")
            agents = agents[:max_agents]
        
        logger.info(f"Task analysis created {len(agents)} agents: {[a['name'] for a in agents]}")
        return agents
    
    def _extract_topic(self, task: str) -> str:
        """Extract main topic from task"""
        task_lower = task.lower()
        
        # Common topics
        if "tesla" in task_lower or "tsla" in task_lower:
            return "tesla"
        elif "stock" in task_lower or "market" in task_lower:
            return "stock market"
        elif "ai" in task_lower or "artificial" in task_lower:
            return "AI"
        elif "crypto" in task_lower or "bitcoin" in task_lower:
            return "cryptocurrency"
        else:
            # Extract first significant noun/topic
            words = task_lower.split()
            for word in words:
                if len(word) > 4 and word not in ["latest", "current", "recent", "please", "could"]:
                    return word
        
        return "information"

# Global instance
task_analyzer = DynamicTaskAnalyzer()