"""
Handoff Tool for Agent Coordination
Enables agents to intelligently hand off tasks to other agents
"""
import json
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
import structlog

logger = structlog.get_logger()


@dataclass
class HandoffRequest:
    """Request to hand off to another agent"""
    target_agent: Optional[str]  # None means let the swarm decide
    reason: str
    context: Dict[str, Any]
    requirements: List[str]
    priority: int = 5


class HandoffTool:
    """
    Tool that agents can use to hand off tasks to other agents
    Implements intelligent routing and context preservation
    """
    
    def __init__(self, swarm_intelligence, shared_memory, available_agents):
        self.swarm_intelligence = swarm_intelligence
        self.shared_memory = shared_memory
        self.available_agents = available_agents
        
    def handoff(self, 
                current_agent: str,
                target_agent: Optional[str] = None,
                reason: str = "",
                context: Dict[str, Any] = None,
                requirements: List[str] = None) -> Dict[str, Any]:
        """
        Hand off to another agent
        
        Args:
            current_agent: Name of the current agent
            target_agent: Specific agent to hand off to (optional)
            reason: Reason for handoff
            context: Additional context to pass
            requirements: Required capabilities for next agent
            
        Returns:
            Handoff result with next agent and formatted context
        """
        context = context or {}
        requirements = requirements or []
        
        # If no target specified, use swarm intelligence to decide
        if not target_agent:
            decision = self.swarm_intelligence.decide_next_agent(
                current_agent,
                self.available_agents
            )
            
            if not decision:
                return {
                    "success": False,
                    "message": "No suitable agent found for handoff"
                }
                
            target_agent = decision.to_agent
            reason = reason or decision.message
            
        # Validate target agent exists
        if target_agent not in self.available_agents:
            return {
                "success": False,
                "message": f"Agent '{target_agent}' not found in swarm"
            }
            
        # Prepare handoff context
        handoff_context = self._prepare_handoff_context(
            current_agent,
            target_agent,
            reason,
            context
        )
        
        # Record the handoff
        from app.core.swarm_orchestration import HandoffDecision, HandoffReason
        decision = HandoffDecision(
            from_agent=current_agent,
            to_agent=target_agent,
            reason=HandoffReason.EXPERTISE_NEEDED,
            message=reason,
            context=handoff_context
        )
        self.swarm_intelligence.record_handoff(decision)
        
        logger.info(f"Handoff: {current_agent} -> {target_agent} | Reason: {reason}")
        
        return {
            "success": True,
            "next_agent": target_agent,
            "context": handoff_context,
            "message": f"Handing off to {target_agent}"
        }
        
    def _prepare_handoff_context(self, 
                                 from_agent: str,
                                 to_agent: str,
                                 reason: str,
                                 additional_context: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare comprehensive context for the next agent"""
        
        # Get shared context
        shared_context = self.shared_memory.get_context_for_agent(to_agent)
        
        # Build handoff message
        handoff_message = f"""
=== HANDOFF FROM {from_agent.upper()} TO {to_agent.upper()} ===

Reason for Handoff: {reason}

What {from_agent} has completed:
{self._get_agent_accomplishments(from_agent)}

What {to_agent} needs to do:
{self._get_agent_tasks(to_agent)}

Additional Context from {from_agent}:
{json.dumps(additional_context, indent=2)}

{shared_context}
"""
        
        return {
            "handoff_message": handoff_message,
            "from_agent": from_agent,
            "to_agent": to_agent,
            "reason": reason,
            "shared_memory": self.shared_memory.__dict__,
            "additional_context": additional_context
        }
        
    def _get_agent_accomplishments(self, agent: str) -> str:
        """Get what an agent has accomplished"""
        contributions = self.shared_memory.agent_contributions.get(agent, [])
        if contributions:
            return "\n".join(f"• {contrib}" for contrib in contributions)
        return "• No recorded contributions yet"
        
    def _get_agent_tasks(self, agent: str) -> str:
        """Get suggested tasks for an agent based on their capabilities"""
        remaining_tasks = [
            task for task in self.shared_memory.task_decomposition
            if task not in self.shared_memory.completed_subtasks
        ]
        
        if not remaining_tasks:
            return "• Provide final review and synthesis"
            
        # Filter tasks based on agent capabilities
        agent_caps = self.swarm_intelligence.agent_capabilities.get(agent, [])
        relevant_tasks = []
        
        for task in remaining_tasks:
            task_lower = task.lower()
            # Check if agent has relevant capabilities for this task
            if any(cap in task_lower for cap in agent_caps):
                relevant_tasks.append(task)
                
        if relevant_tasks:
            return "\n".join(f"• {task}" for task in relevant_tasks[:3])  # Top 3 tasks
        else:
            return f"• {remaining_tasks[0]}"  # Next task in sequence
            
    def suggest_next_agent(self, current_agent: str, task_description: str) -> List[str]:
        """Suggest which agents would be best for a given task"""
        # Analyze task requirements
        required_capabilities = self.swarm_intelligence._analyze_task_requirements(task_description)
        
        # Rank agents by suitability
        agent_scores = {}
        for agent in self.available_agents:
            if agent == current_agent:
                continue
                
            agent_caps = self.swarm_intelligence.agent_capabilities.get(agent, [])
            score = len(set(required_capabilities) & set(agent_caps))
            
            if score > 0:
                agent_scores[agent] = score
                
        # Sort by score and return top suggestions
        sorted_agents = sorted(agent_scores.items(), key=lambda x: x[1], reverse=True)
        return [agent for agent, _ in sorted_agents[:3]]
        
    def get_swarm_status(self) -> Dict[str, Any]:
        """Get current status of the swarm"""
        return {
            "shared_memory": {
                "original_task": self.shared_memory.original_task,
                "completed_subtasks": len(self.shared_memory.completed_subtasks),
                "total_subtasks": len(self.shared_memory.task_decomposition),
                "artifacts": len(self.shared_memory.implementation_artifacts),
                "knowledge_entries": len(self.shared_memory.knowledge_base)
            },
            "collaboration": self.swarm_intelligence.get_collaboration_summary(),
            "available_agents": self.available_agents,
            "agent_workload": self.swarm_intelligence.agent_workload
        }