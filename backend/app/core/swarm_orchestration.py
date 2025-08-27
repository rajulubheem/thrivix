"""
Advanced Swarm Orchestration System
Implements true multi-agent collaboration with emergent intelligence
"""
import json
import asyncio
from typing import Dict, List, Any, Optional, Set, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import structlog

logger = structlog.get_logger()


class HandoffReason(Enum):
    """Reasons for agent handoffs"""
    EXPERTISE_NEEDED = "expertise_needed"
    TASK_COMPLETE = "task_complete"
    CLARIFICATION_NEEDED = "clarification_needed"
    IMPLEMENTATION_READY = "implementation_ready"
    REVIEW_REQUIRED = "review_required"
    OPTIMIZATION_NEEDED = "optimization_needed"


@dataclass
class SharedMemory:
    """Shared working memory accessible by all agents in the swarm"""
    original_task: str
    task_decomposition: List[str] = field(default_factory=list)
    discovered_requirements: Dict[str, Any] = field(default_factory=dict)
    design_decisions: Dict[str, Any] = field(default_factory=dict)
    implementation_artifacts: List[Dict[str, Any]] = field(default_factory=list)
    knowledge_base: Dict[str, Any] = field(default_factory=dict)
    constraints: List[str] = field(default_factory=list)
    open_questions: List[str] = field(default_factory=list)
    completed_subtasks: Set[str] = field(default_factory=set)
    agent_contributions: Dict[str, List[str]] = field(default_factory=dict)
    
    def add_knowledge(self, agent: str, key: str, value: Any):
        """Add knowledge contributed by an agent"""
        if agent not in self.agent_contributions:
            self.agent_contributions[agent] = []
        self.agent_contributions[agent].append(f"Added {key}")
        self.knowledge_base[key] = value
        
    def add_artifact(self, agent: str, artifact: Dict[str, Any]):
        """Add an implementation artifact"""
        artifact['contributed_by'] = agent
        artifact['timestamp'] = datetime.utcnow().isoformat()
        self.implementation_artifacts.append(artifact)
        
    def mark_subtask_complete(self, subtask: str, agent: str):
        """Mark a subtask as complete"""
        self.completed_subtasks.add(subtask)
        if agent not in self.agent_contributions:
            self.agent_contributions[agent] = []
        self.agent_contributions[agent].append(f"Completed: {subtask}")
        
    def get_context_for_agent(self, agent_name: str) -> str:
        """Get formatted context for a specific agent"""
        context = f"""
=== SHARED SWARM CONTEXT ===

Original Task: {self.original_task}

Task Breakdown:
{chr(10).join(f'• {task}' for task in self.task_decomposition)}

Completed Subtasks ({len(self.completed_subtasks)}/{len(self.task_decomposition)}):
{chr(10).join(f'✓ {task}' for task in self.completed_subtasks)}

Discovered Requirements:
{json.dumps(self.discovered_requirements, indent=2)}

Design Decisions Made:
{json.dumps(self.design_decisions, indent=2)}

Knowledge Base:
{json.dumps(self.knowledge_base, indent=2)}

Open Questions:
{chr(10).join(f'? {q}' for q in self.open_questions)}

Previous Agent Contributions:
{chr(10).join(f'{agent}: {", ".join(contribs)}' for agent, contribs in self.agent_contributions.items())}

Implementation Artifacts Generated: {len(self.implementation_artifacts)}
"""
        return context


@dataclass  
class HandoffDecision:
    """Represents a handoff decision made by an agent"""
    from_agent: str
    to_agent: str
    reason: HandoffReason
    message: str
    context: Dict[str, Any]
    priority: int = 5  # 1-10, higher is more urgent
    

class SwarmIntelligence:
    """
    Implements swarm intelligence for multi-agent coordination
    Enables emergent behavior through autonomous agent decisions
    """
    
    def __init__(self):
        self.shared_memory = None
        self.agent_capabilities: Dict[str, List[str]] = {}
        self.agent_workload: Dict[str, int] = {}
        self.handoff_history: List[HandoffDecision] = []
        self.collaboration_graph: Dict[str, Set[str]] = {}
        
    def initialize_swarm(self, task: str, agents: List[Any]) -> SharedMemory:
        """Initialize the swarm with a task and available agents"""
        self.shared_memory = SharedMemory(original_task=task)
        
        # Initialize agent tracking
        for agent in agents:
            self.agent_workload[agent.name] = 0
            self.collaboration_graph[agent.name] = set()
            
            # Extract capabilities from agent description/prompt
            self.agent_capabilities[agent.name] = self._extract_capabilities(agent)
            
        logger.info(f"Swarm initialized with {len(agents)} agents for task: {task[:100]}...")
        return self.shared_memory
        
    def _extract_capabilities(self, agent) -> List[str]:
        """Extract capabilities from agent configuration"""
        capabilities = []
        
        # Map agent names to capabilities
        capability_map = {
            "researcher": ["research", "analysis", "requirements", "discovery"],
            "architect": ["design", "architecture", "system_design", "planning"],
            "developer": ["implementation", "coding", "programming", "development"],
            "api_specialist": ["api", "rest", "endpoints", "backend", "integration"],
            "reviewer": ["review", "quality", "synthesis", "documentation"],
            "tester": ["testing", "validation", "qa", "verification"],
            "data_scientist": ["data_analysis", "visualization", "statistics", "ml"],
            "devops": ["deployment", "ci_cd", "infrastructure", "monitoring"]
        }
        
        agent_name = agent.name.lower()
        for key, caps in capability_map.items():
            if key in agent_name:
                capabilities.extend(caps)
                break
                
        return capabilities
        
    def decompose_task(self, task: str) -> List[str]:
        """Decompose a task into subtasks"""
        subtasks = []
        
        # Intelligent task decomposition based on task type
        task_lower = task.lower()
        
        if "api" in task_lower or "rest" in task_lower:
            subtasks = [
                "Analyze API requirements and use cases",
                "Design API endpoints and data models",
                "Define request/response schemas",
                "Implement server and middleware",
                "Create database models and connections",
                "Implement CRUD operations",
                "Add authentication and authorization",
                "Write tests and documentation",
                "Review and optimize implementation"
            ]
        elif "data" in task_lower and "analysis" in task_lower:
            subtasks = [
                "Understand data requirements",
                "Design analysis approach",
                "Implement data processing",
                "Create visualizations",
                "Generate insights and recommendations"
            ]
        else:
            # Generic decomposition
            subtasks = [
                "Understand requirements",
                "Design solution architecture",
                "Implement core functionality",
                "Test and validate",
                "Document and review"
            ]
            
        self.shared_memory.task_decomposition = subtasks
        return subtasks
        
    def decide_next_agent(self, current_agent: str, available_agents: List[str]) -> Optional[HandoffDecision]:
        """
        Decide which agent should handle the task next
        Uses swarm intelligence to make optimal decisions
        """
        if not self.shared_memory:
            return None
            
        # Find uncompleted subtasks
        remaining_tasks = [
            task for task in self.shared_memory.task_decomposition
            if task not in self.shared_memory.completed_subtasks
        ]
        
        if not remaining_tasks:
            # All tasks complete, handoff to reviewer for final synthesis
            if current_agent != "reviewer" and "reviewer" in available_agents:
                return HandoffDecision(
                    from_agent=current_agent,
                    to_agent="reviewer",
                    reason=HandoffReason.REVIEW_REQUIRED,
                    message="All subtasks complete, need final review and synthesis",
                    context={"completed_tasks": list(self.shared_memory.completed_subtasks)}
                )
            return None
            
        # Analyze next task requirements
        next_task = remaining_tasks[0]
        required_capabilities = self._analyze_task_requirements(next_task)
        
        # Find best agent for the task
        best_agent = self._find_best_agent(
            required_capabilities,
            available_agents,
            exclude=[current_agent]
        )
        
        if best_agent:
            reason = self._determine_handoff_reason(current_agent, best_agent, next_task)
            
            return HandoffDecision(
                from_agent=current_agent,
                to_agent=best_agent,
                reason=reason,
                message=f"Handing off to {best_agent} for: {next_task}",
                context={
                    "next_task": next_task,
                    "remaining_tasks": len(remaining_tasks),
                    "required_capabilities": required_capabilities
                }
            )
            
        return None
        
    def _analyze_task_requirements(self, task: str) -> List[str]:
        """Analyze what capabilities are needed for a task"""
        task_lower = task.lower()
        required = []
        
        # Map keywords to required capabilities
        keyword_capability_map = {
            "analyze": ["analysis", "research"],
            "design": ["design", "architecture"],
            "implement": ["implementation", "coding", "development"],
            "api": ["api", "rest", "backend"],
            "test": ["testing", "qa"],
            "review": ["review", "quality"],
            "document": ["documentation"],
            "deploy": ["deployment", "devops"],
            "data": ["data_analysis"],
            "optimize": ["optimization", "review"]
        }
        
        for keyword, capabilities in keyword_capability_map.items():
            if keyword in task_lower:
                required.extend(capabilities)
                
        return list(set(required))  # Remove duplicates
        
    def _find_best_agent(self, required_capabilities: List[str], 
                        available_agents: List[str], 
                        exclude: List[str] = None) -> Optional[str]:
        """Find the best agent for required capabilities"""
        exclude = exclude or []
        best_agent = None
        best_score = 0
        
        for agent in available_agents:
            if agent in exclude:
                continue
                
            # Calculate capability match score
            agent_caps = self.agent_capabilities.get(agent, [])
            score = len(set(required_capabilities) & set(agent_caps))
            
            # Adjust score based on workload (prefer less busy agents)
            workload = self.agent_workload.get(agent, 0)
            score = score * (1.0 / (1 + workload * 0.1))
            
            if score > best_score:
                best_score = score
                best_agent = agent
                
        return best_agent
        
    def _determine_handoff_reason(self, from_agent: str, to_agent: str, task: str) -> HandoffReason:
        """Determine the reason for handoff"""
        task_lower = task.lower()
        
        if "implement" in task_lower:
            return HandoffReason.IMPLEMENTATION_READY
        elif "review" in task_lower:
            return HandoffReason.REVIEW_REQUIRED
        elif "design" in task_lower or "architect" in task_lower:
            return HandoffReason.EXPERTISE_NEEDED
        elif "optimize" in task_lower:
            return HandoffReason.OPTIMIZATION_NEEDED
        else:
            return HandoffReason.TASK_COMPLETE
            
    def record_handoff(self, decision: HandoffDecision):
        """Record a handoff decision"""
        self.handoff_history.append(decision)
        
        # Update collaboration graph
        if decision.from_agent not in self.collaboration_graph:
            self.collaboration_graph[decision.from_agent] = set()
        self.collaboration_graph[decision.from_agent].add(decision.to_agent)
        
        # Update workload
        self.agent_workload[decision.to_agent] = self.agent_workload.get(decision.to_agent, 0) + 1
        
    def get_collaboration_summary(self) -> Dict[str, Any]:
        """Get a summary of swarm collaboration"""
        return {
            "total_handoffs": len(self.handoff_history),
            "unique_collaborations": sum(len(agents) for agents in self.collaboration_graph.values()),
            "agent_workload": self.agent_workload,
            "completed_subtasks": len(self.shared_memory.completed_subtasks) if self.shared_memory else 0,
            "total_subtasks": len(self.shared_memory.task_decomposition) if self.shared_memory else 0,
            "artifacts_generated": len(self.shared_memory.implementation_artifacts) if self.shared_memory else 0,
            "knowledge_entries": len(self.shared_memory.knowledge_base) if self.shared_memory else 0
        }
        
    def should_terminate(self) -> Tuple[bool, str]:
        """Determine if the swarm should terminate"""
        if not self.shared_memory:
            return True, "No shared memory initialized"
            
        # Check if all subtasks are complete
        if self.shared_memory.task_decomposition:
            completion_rate = len(self.shared_memory.completed_subtasks) / len(self.shared_memory.task_decomposition)
            if completion_rate >= 1.0:
                return True, "All subtasks completed"
                
        # Check for excessive handoffs (possible loop)
        if len(self.handoff_history) > 20:
            # Check for ping-pong behavior
            recent_handoffs = self.handoff_history[-6:]
            agents_involved = set()
            for handoff in recent_handoffs:
                agents_involved.add(handoff.from_agent)
                agents_involved.add(handoff.to_agent)
                
            if len(agents_involved) <= 2:
                return True, "Detected ping-pong behavior between agents"
                
        # Check for timeout (would need to track time)
        # ...
        
        return False, ""