"""
Intelligent Orchestrator for Agent Coordination
Ensures proper agent sequencing and prevents infinite loops
"""
import json
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import structlog

logger = structlog.get_logger()


class TaskType(Enum):
    """Types of tasks the orchestrator can handle"""
    API_DEVELOPMENT = "api_development"
    DATA_ANALYSIS = "data_analysis" 
    FRONTEND_DEVELOPMENT = "frontend_development"
    FULL_STACK = "full_stack"
    DEVOPS = "devops"
    GENERAL = "general"


@dataclass
class AgentTransition:
    """Defines a transition from one agent to another"""
    from_agent: str
    to_agent: str
    reason: str
    context_to_pass: Dict[str, Any]


class Orchestrator:
    """
    Orchestrates agent execution with intelligent handoffs
    Prevents loops and ensures meaningful progression
    """
    
    # Define clear agent workflows for different task types
    WORKFLOWS = {
        TaskType.API_DEVELOPMENT: [
            {
                "agent": "researcher",
                "role": "Analyze requirements and research best practices",
                "outputs": ["requirements", "technologies", "approach"]
            },
            {
                "agent": "architect", 
                "role": "Design system architecture and API structure",
                "outputs": ["endpoints", "schemas", "architecture"]
            },
            {
                "agent": "api_specialist",
                "role": "Implement the complete REST API with code",
                "outputs": ["server_code", "routes", "models", "config"]
            },
            {
                "agent": "reviewer",
                "role": "Review implementation and provide summary",
                "outputs": ["summary", "improvements", "documentation"]
            }
        ],
        TaskType.DATA_ANALYSIS: [
            {
                "agent": "researcher",
                "role": "Understand data requirements and analysis goals",
                "outputs": ["data_requirements", "analysis_goals"]
            },
            {
                "agent": "data_scientist",
                "role": "Perform data analysis and create visualizations",
                "outputs": ["analysis_code", "visualizations", "insights"]
            },
            {
                "agent": "reviewer",
                "role": "Summarize findings and recommendations",
                "outputs": ["summary", "recommendations"]
            }
        ]
    }
    
    def __init__(self):
        self.execution_history: List[Dict[str, Any]] = []
        self.current_workflow: List[Dict] = []
        self.current_step = 0
        
    def identify_task_type(self, task: str) -> TaskType:
        """Identify the type of task from the user's request"""
        task_lower = task.lower()
        
        if any(word in task_lower for word in ["api", "rest", "endpoint", "backend", "todo"]):
            return TaskType.API_DEVELOPMENT
        elif any(word in task_lower for word in ["data", "analysis", "visualization", "chart"]):
            return TaskType.DATA_ANALYSIS
        elif any(word in task_lower for word in ["frontend", "ui", "react", "vue"]):
            return TaskType.FRONTEND_DEVELOPMENT
        elif any(word in task_lower for word in ["full stack", "complete app"]):
            return TaskType.FULL_STACK
        elif any(word in task_lower for word in ["deploy", "ci/cd", "docker", "kubernetes"]):
            return TaskType.DEVOPS
        else:
            return TaskType.GENERAL
            
    def get_workflow_for_task(self, task: str) -> List[Dict]:
        """Get the appropriate workflow for the given task"""
        task_type = self.identify_task_type(task)
        logger.info(f"Identified task type: {task_type.value}")
        
        # Return the predefined workflow or a default
        return self.WORKFLOWS.get(task_type, self.WORKFLOWS[TaskType.API_DEVELOPMENT])
        
    def get_next_agent(self, current_agent: Optional[str] = None) -> Optional[Dict]:
        """
        Get the next agent in the workflow
        Returns None if workflow is complete
        """
        if not self.current_workflow:
            return None
            
        if self.current_step >= len(self.current_workflow):
            logger.info("Workflow complete - no more agents")
            return None
            
        next_agent = self.current_workflow[self.current_step]
        logger.info(f"Next agent in workflow: {next_agent['agent']} (step {self.current_step + 1}/{len(self.current_workflow)})")
        
        return next_agent
        
    def start_workflow(self, task: str) -> List[str]:
        """
        Start a new workflow for the given task
        Returns list of agent names in execution order
        """
        self.current_workflow = self.get_workflow_for_task(task)
        self.current_step = 0
        self.execution_history = []
        
        agent_sequence = [step["agent"] for step in self.current_workflow]
        logger.info(f"Starting workflow with agents: {' -> '.join(agent_sequence)}")
        
        return agent_sequence
        
    def record_agent_completion(self, agent_name: str, output: str) -> bool:
        """
        Record that an agent has completed its task
        Returns True if workflow should continue, False if complete
        """
        self.execution_history.append({
            "agent": agent_name,
            "step": self.current_step,
            "output_preview": output[:200] if output else ""
        })
        
        self.current_step += 1
        
        # Check if workflow is complete
        if self.current_step >= len(self.current_workflow):
            logger.info(f"Workflow complete after {self.current_step} agents")
            return False
            
        return True
        
    def get_handoff_context(self, from_agent: str, to_agent: str) -> Dict[str, Any]:
        """
        Get context to pass from one agent to another
        This ensures agents build on each other's work
        """
        # Find what the previous agent produced
        prev_outputs = {}
        for record in self.execution_history:
            if record["agent"] == from_agent:
                prev_outputs = {
                    "previous_agent": from_agent,
                    "summary": record.get("output_preview", "")
                }
                break
                
        # Get the expected role of the next agent
        next_role = ""
        for step in self.current_workflow:
            if step["agent"] == to_agent:
                next_role = step["role"]
                break
                
        return {
            "from": from_agent,
            "to": to_agent,
            "previous_outputs": prev_outputs,
            "next_role": next_role,
            "step": f"{self.current_step + 1}/{len(self.current_workflow)}"
        }
        
    def should_stop_execution(self) -> Tuple[bool, Optional[str]]:
        """
        Check if execution should stop due to loops or errors
        Returns (should_stop, reason)
        """
        # Check for infinite loops - same agent appearing too many times
        agent_counts = {}
        for record in self.execution_history:
            agent = record["agent"]
            agent_counts[agent] = agent_counts.get(agent, 0) + 1
            
            if agent_counts[agent] > 2:
                return True, f"Agent {agent} has run {agent_counts[agent]} times - possible loop"
                
        # Check if we've exceeded maximum steps
        if len(self.execution_history) > 10:
            return True, "Maximum execution steps (10) exceeded"
            
        return False, None
        
    def get_execution_summary(self) -> Dict[str, Any]:
        """Get a summary of the execution"""
        return {
            "workflow_type": self.identify_task_type("").value if self.current_workflow else "unknown",
            "total_steps": len(self.current_workflow),
            "completed_steps": self.current_step,
            "agents_executed": [r["agent"] for r in self.execution_history],
            "is_complete": self.current_step >= len(self.current_workflow)
        }