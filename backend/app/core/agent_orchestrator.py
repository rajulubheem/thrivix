"""
Agent Orchestrator with strict role enforcement and handoff control
"""
import json
import asyncio
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import structlog

from app.core.swarm_orchestration import HandoffReason, SharedMemory

logger = structlog.get_logger()


class AgentRole(Enum):
    """Strict agent roles for the swarm"""
    ORCHESTRATOR = "orchestrator"
    RESEARCHER = "researcher"
    PLANNER = "planner"
    TOOL_RUNNER = "tool-runner"
    CODER = "coder"
    REVIEWER = "reviewer"
    SAFETY = "safety"


@dataclass
class AgentAction:
    """Represents an action taken by an agent"""
    id: str
    agent: AgentRole
    type: str  # tool, reason, handoff, ask_user, approval_request
    input: Any
    output: Optional[Any] = None
    confidence: float = 0.0
    cost: float = 0.0
    tokens_used: int = 0
    duration: float = 0.0
    timestamp: datetime = field(default_factory=datetime.utcnow)
    status: str = "pending"  # pending, running, complete, failed, approved, rejected


@dataclass
class PlanStep:
    """A step in the execution plan"""
    id: str
    title: str
    description: str
    agent: AgentRole
    dependencies: List[str]  # IDs of dependent steps
    status: str = "queued"  # queued, running, blocked, done, failed
    summary: Optional[str] = None
    artifacts: List[Dict[str, Any]] = field(default_factory=list)
    confidence: float = 0.0
    estimated_time: float = 0.0
    actual_time: float = 0.0
    retry_count: int = 0
    max_retries: int = 2


@dataclass
class RunCaps:
    """Runtime capability limits"""
    max_handoffs: int = 10
    max_runtime_sec: int = 600
    max_cost: float = 2.0
    max_retries: int = 2
    require_approvals: bool = False
    safety_level: str = "moderate"  # minimal, moderate, strict


class AgentOrchestrator:
    """
    Orchestrates agent execution with strict controls
    """
    
    def __init__(self):
        self.shared_memory: Optional[SharedMemory] = None
        self.plan: List[PlanStep] = []
        self.actions: List[AgentAction] = []
        self.handoff_count: int = 0
        self.total_cost: float = 0.0
        self.start_time: Optional[datetime] = None
        self.run_caps: RunCaps = RunCaps()
        self.approval_queue: List[Dict[str, Any]] = []
        self.safety_flags: List[Dict[str, Any]] = []
        
    async def parse_goal(self, goal_text: str, constraints: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parse user goal into structured format
        Extract acceptance criteria and constraints
        """
        logger.info(f"Parsing goal: {goal_text[:100]}...")
        
        # Extract key components
        acceptance_criteria = self._extract_acceptance_criteria(goal_text)
        task_type = self._identify_task_type(goal_text)
        required_agents = self._determine_required_agents(task_type)
        
        return {
            "goal": goal_text,
            "acceptance_criteria": acceptance_criteria,
            "task_type": task_type,
            "required_agents": required_agents,
            "constraints": constraints
        }
    
    def _extract_acceptance_criteria(self, goal_text: str) -> List[str]:
        """Extract acceptance criteria from goal"""
        criteria = []
        
        # Look for specific keywords and patterns
        if "test" in goal_text.lower():
            criteria.append("All tests must pass")
        if "api" in goal_text.lower():
            criteria.append("API endpoints must be functional")
            criteria.append("Documentation must be provided")
        if "secure" in goal_text.lower() or "security" in goal_text.lower():
            criteria.append("Security best practices must be followed")
        if "performance" in goal_text.lower():
            criteria.append("Performance benchmarks must be met")
            
        # Default criteria
        if not criteria:
            criteria = [
                "Solution must be complete and functional",
                "Code must be clean and maintainable",
                "Documentation must be provided"
            ]
            
        return criteria
    
    def _identify_task_type(self, goal_text: str) -> str:
        """Identify the type of task"""
        goal_lower = goal_text.lower()
        
        if any(word in goal_lower for word in ["api", "rest", "endpoint", "server"]):
            return "api_development"
        elif any(word in goal_lower for word in ["analyze", "data", "visualization", "chart"]):
            return "data_analysis"
        elif any(word in goal_lower for word in ["test", "testing", "qa", "quality"]):
            return "testing"
        elif any(word in goal_lower for word in ["research", "investigate", "explore"]):
            return "research"
        elif any(word in goal_lower for word in ["code", "implement", "build", "create"]):
            return "development"
        else:
            return "general"
    
    def _determine_required_agents(self, task_type: str) -> List[AgentRole]:
        """Determine which agents are needed for the task"""
        agents_map = {
            "api_development": [
                AgentRole.ORCHESTRATOR,
                AgentRole.PLANNER,
                AgentRole.RESEARCHER,
                AgentRole.CODER,
                AgentRole.TOOL_RUNNER,
                AgentRole.REVIEWER,
                AgentRole.SAFETY
            ],
            "data_analysis": [
                AgentRole.ORCHESTRATOR,
                AgentRole.RESEARCHER,
                AgentRole.TOOL_RUNNER,
                AgentRole.CODER,
                AgentRole.REVIEWER
            ],
            "testing": [
                AgentRole.ORCHESTRATOR,
                AgentRole.PLANNER,
                AgentRole.CODER,
                AgentRole.TOOL_RUNNER,
                AgentRole.REVIEWER
            ],
            "research": [
                AgentRole.ORCHESTRATOR,
                AgentRole.RESEARCHER,
                AgentRole.TOOL_RUNNER,
                AgentRole.REVIEWER
            ],
            "development": [
                AgentRole.ORCHESTRATOR,
                AgentRole.PLANNER,
                AgentRole.CODER,
                AgentRole.REVIEWER,
                AgentRole.SAFETY
            ],
            "general": [
                AgentRole.ORCHESTRATOR,
                AgentRole.RESEARCHER,
                AgentRole.PLANNER,
                AgentRole.REVIEWER
            ]
        }
        
        return agents_map.get(task_type, agents_map["general"])
    
    async def create_plan(self, parsed_goal: Dict[str, Any]) -> List[PlanStep]:
        """
        Create execution plan as DAG of steps
        """
        logger.info("Creating execution plan...")
        
        task_type = parsed_goal["task_type"]
        
        if task_type == "api_development":
            self.plan = self._create_api_development_plan()
        elif task_type == "data_analysis":
            self.plan = self._create_data_analysis_plan()
        elif task_type == "testing":
            self.plan = self._create_testing_plan()
        elif task_type == "research":
            self.plan = self._create_research_plan()
        else:
            self.plan = self._create_generic_plan()
            
        return self.plan
    
    def _create_api_development_plan(self) -> List[PlanStep]:
        """Create plan for API development tasks"""
        return [
            PlanStep(
                id="step-1",
                title="Analyze API requirements",
                description="Research best practices and gather requirements",
                agent=AgentRole.RESEARCHER,
                dependencies=[],
                estimated_time=60
            ),
            PlanStep(
                id="step-2",
                title="Design API architecture",
                description="Create endpoint design and data models",
                agent=AgentRole.PLANNER,
                dependencies=["step-1"],
                estimated_time=90
            ),
            PlanStep(
                id="step-3",
                title="Implement server and routes",
                description="Code the API server and endpoints",
                agent=AgentRole.CODER,
                dependencies=["step-2"],
                estimated_time=180
            ),
            PlanStep(
                id="step-4",
                title="Create database models",
                description="Implement data persistence layer",
                agent=AgentRole.CODER,
                dependencies=["step-2"],
                estimated_time=120
            ),
            PlanStep(
                id="step-5",
                title="Test API endpoints",
                description="Execute tests and validate functionality",
                agent=AgentRole.TOOL_RUNNER,
                dependencies=["step-3", "step-4"],
                estimated_time=60
            ),
            PlanStep(
                id="step-6",
                title="Security audit",
                description="Check for security vulnerabilities",
                agent=AgentRole.SAFETY,
                dependencies=["step-5"],
                estimated_time=45
            ),
            PlanStep(
                id="step-7",
                title="Final review and documentation",
                description="Review code and create documentation",
                agent=AgentRole.REVIEWER,
                dependencies=["step-6"],
                estimated_time=60
            )
        ]
    
    def _create_data_analysis_plan(self) -> List[PlanStep]:
        """Create plan for data analysis tasks"""
        return [
            PlanStep(
                id="step-1",
                title="Understand data requirements",
                description="Gather information about data sources and goals",
                agent=AgentRole.RESEARCHER,
                dependencies=[],
                estimated_time=45
            ),
            PlanStep(
                id="step-2",
                title="Collect and prepare data",
                description="Retrieve and clean data for analysis",
                agent=AgentRole.TOOL_RUNNER,
                dependencies=["step-1"],
                estimated_time=90
            ),
            PlanStep(
                id="step-3",
                title="Perform analysis",
                description="Execute data analysis and generate insights",
                agent=AgentRole.CODER,
                dependencies=["step-2"],
                estimated_time=120
            ),
            PlanStep(
                id="step-4",
                title="Create visualizations",
                description="Generate charts and visual representations",
                agent=AgentRole.CODER,
                dependencies=["step-3"],
                estimated_time=60
            ),
            PlanStep(
                id="step-5",
                title="Review and compile results",
                description="Validate findings and create report",
                agent=AgentRole.REVIEWER,
                dependencies=["step-4"],
                estimated_time=45
            )
        ]
    
    def _create_testing_plan(self) -> List[PlanStep]:
        """Create plan for testing tasks"""
        return [
            PlanStep(
                id="step-1",
                title="Define test requirements",
                description="Identify what needs to be tested",
                agent=AgentRole.PLANNER,
                dependencies=[],
                estimated_time=30
            ),
            PlanStep(
                id="step-2",
                title="Create test cases",
                description="Write comprehensive test cases",
                agent=AgentRole.CODER,
                dependencies=["step-1"],
                estimated_time=90
            ),
            PlanStep(
                id="step-3",
                title="Execute tests",
                description="Run test suite and collect results",
                agent=AgentRole.TOOL_RUNNER,
                dependencies=["step-2"],
                estimated_time=60
            ),
            PlanStep(
                id="step-4",
                title="Analyze results",
                description="Review test outcomes and identify issues",
                agent=AgentRole.REVIEWER,
                dependencies=["step-3"],
                estimated_time=45
            )
        ]
    
    def _create_research_plan(self) -> List[PlanStep]:
        """Create plan for research tasks"""
        return [
            PlanStep(
                id="step-1",
                title="Define research scope",
                description="Clarify research questions and objectives",
                agent=AgentRole.RESEARCHER,
                dependencies=[],
                estimated_time=30
            ),
            PlanStep(
                id="step-2",
                title="Gather information",
                description="Collect data from various sources",
                agent=AgentRole.TOOL_RUNNER,
                dependencies=["step-1"],
                estimated_time=90
            ),
            PlanStep(
                id="step-3",
                title="Analyze findings",
                description="Synthesize and interpret information",
                agent=AgentRole.RESEARCHER,
                dependencies=["step-2"],
                estimated_time=60
            ),
            PlanStep(
                id="step-4",
                title="Compile report",
                description="Create comprehensive research report",
                agent=AgentRole.REVIEWER,
                dependencies=["step-3"],
                estimated_time=45
            )
        ]
    
    def _create_generic_plan(self) -> List[PlanStep]:
        """Create generic plan for unspecified tasks"""
        return [
            PlanStep(
                id="step-1",
                title="Understand requirements",
                description="Analyze task and gather requirements",
                agent=AgentRole.RESEARCHER,
                dependencies=[],
                estimated_time=45
            ),
            PlanStep(
                id="step-2",
                title="Create solution plan",
                description="Design approach and architecture",
                agent=AgentRole.PLANNER,
                dependencies=["step-1"],
                estimated_time=60
            ),
            PlanStep(
                id="step-3",
                title="Implement solution",
                description="Execute the planned solution",
                agent=AgentRole.TOOL_RUNNER,
                dependencies=["step-2"],
                estimated_time=120
            ),
            PlanStep(
                id="step-4",
                title="Review and finalize",
                description="Review solution and ensure quality",
                agent=AgentRole.REVIEWER,
                dependencies=["step-3"],
                estimated_time=45
            )
        ]
    
    async def execute_step(self, step: PlanStep) -> Dict[str, Any]:
        """
        Execute a single step with the assigned agent
        """
        logger.info(f"Executing step {step.id}: {step.title} with {step.agent.value}")
        
        # Check preconditions
        if not self._check_caps():
            return {"status": "blocked", "reason": "Capability limits exceeded"}
            
        # Check dependencies
        if not self._check_dependencies(step):
            return {"status": "blocked", "reason": "Dependencies not met"}
        
        # Update step status
        step.status = "running"
        step_start = datetime.utcnow()
        
        try:
            # Execute based on agent role
            result = await self._execute_agent_action(step)
            
            # Update step with results
            step.status = "done"
            step.actual_time = (datetime.utcnow() - step_start).total_seconds()
            step.summary = result.get("summary", "")
            step.artifacts = result.get("artifacts", [])
            step.confidence = result.get("confidence", 0.8)
            
            return {"status": "success", "result": result}
            
        except Exception as e:
            logger.error(f"Step {step.id} failed: {e}")
            step.status = "failed"
            step.retry_count += 1
            
            if step.retry_count < step.max_retries:
                return {"status": "retry", "error": str(e)}
            else:
                return {"status": "failed", "error": str(e)}
    
    def _check_caps(self) -> bool:
        """Check if execution is within capability limits"""
        if self.handoff_count >= self.run_caps.max_handoffs:
            logger.warning("Max handoffs exceeded")
            return False
            
        if self.total_cost >= self.run_caps.max_cost:
            logger.warning("Max cost exceeded")
            return False
            
        if self.start_time:
            runtime = (datetime.utcnow() - self.start_time).total_seconds()
            if runtime >= self.run_caps.max_runtime_sec:
                logger.warning("Max runtime exceeded")
                return False
                
        return True
    
    def _check_dependencies(self, step: PlanStep) -> bool:
        """Check if all dependencies are satisfied"""
        for dep_id in step.dependencies:
            dep_step = next((s for s in self.plan if s.id == dep_id), None)
            if not dep_step or dep_step.status != "done":
                return False
        return True
    
    async def _execute_agent_action(self, step: PlanStep) -> Dict[str, Any]:
        """Execute action based on agent role"""
        
        # Create action record
        action = AgentAction(
            id=f"action-{len(self.actions)}",
            agent=step.agent,
            type="reason",
            input={"step": step.title, "description": step.description}
        )
        self.actions.append(action)
        
        # Simulate agent execution based on role
        if step.agent == AgentRole.RESEARCHER:
            result = await self._execute_researcher(step)
        elif step.agent == AgentRole.PLANNER:
            result = await self._execute_planner(step)
        elif step.agent == AgentRole.TOOL_RUNNER:
            result = await self._execute_tool_runner(step)
        elif step.agent == AgentRole.CODER:
            result = await self._execute_coder(step)
        elif step.agent == AgentRole.REVIEWER:
            result = await self._execute_reviewer(step)
        elif step.agent == AgentRole.SAFETY:
            result = await self._execute_safety(step)
        else:
            result = {"summary": "Step completed", "confidence": 0.5}
        
        # Update action with result
        action.output = result
        action.status = "complete"
        action.confidence = result.get("confidence", 0.5)
        
        return result
    
    async def _execute_researcher(self, step: PlanStep) -> Dict[str, Any]:
        """Execute researcher agent actions"""
        # Simulate research
        await asyncio.sleep(0.5)  # Simulate work
        
        return {
            "summary": f"Researched: {step.title}",
            "confidence": 0.85,
            "artifacts": [
                {
                    "type": "document",
                    "name": "research_notes.md",
                    "content": f"# Research Notes\n\n{step.description}\n\n## Findings\n- Key finding 1\n- Key finding 2"
                }
            ]
        }
    
    async def _execute_planner(self, step: PlanStep) -> Dict[str, Any]:
        """Execute planner agent actions"""
        await asyncio.sleep(0.5)
        
        return {
            "summary": f"Planned: {step.title}",
            "confidence": 0.9,
            "artifacts": [
                {
                    "type": "document",
                    "name": "plan.md",
                    "content": f"# Plan\n\n{step.description}\n\n## Steps\n1. Step 1\n2. Step 2"
                }
            ]
        }
    
    async def _execute_tool_runner(self, step: PlanStep) -> Dict[str, Any]:
        """Execute tool runner agent actions"""
        await asyncio.sleep(0.5)
        
        # Check if approval needed for external tools
        if self.run_caps.require_approvals:
            self.approval_queue.append({
                "type": "tool_execution",
                "step_id": step.id,
                "description": f"Execute external tool for: {step.title}"
            })
        
        return {
            "summary": f"Executed tools: {step.title}",
            "confidence": 0.95,
            "artifacts": []
        }
    
    async def _execute_coder(self, step: PlanStep) -> Dict[str, Any]:
        """Execute coder agent actions"""
        await asyncio.sleep(0.5)
        
        return {
            "summary": f"Implemented: {step.title}",
            "confidence": 0.88,
            "artifacts": [
                {
                    "type": "code",
                    "name": "implementation.py",
                    "content": f"# Implementation for {step.title}\n\ndef main():\n    pass"
                }
            ]
        }
    
    async def _execute_reviewer(self, step: PlanStep) -> Dict[str, Any]:
        """Execute reviewer agent actions"""
        await asyncio.sleep(0.5)
        
        return {
            "summary": f"Reviewed: {step.title}",
            "confidence": 0.92,
            "artifacts": [
                {
                    "type": "document",
                    "name": "review.md",
                    "content": f"# Review\n\n{step.description}\n\n## Status: Approved"
                }
            ]
        }
    
    async def _execute_safety(self, step: PlanStep) -> Dict[str, Any]:
        """Execute safety agent actions"""
        await asyncio.sleep(0.5)
        
        # Perform safety checks
        if self.run_caps.safety_level == "strict":
            self.safety_flags.append({
                "severity": "info",
                "type": "policy_check",
                "message": f"Safety check performed for: {step.title}"
            })
        
        return {
            "summary": f"Safety validated: {step.title}",
            "confidence": 0.98,
            "artifacts": []
        }
    
    def handle_handoff(self, from_agent: AgentRole, to_agent: AgentRole, reason: str) -> bool:
        """
        Handle agent handoff with enforcement
        """
        self.handoff_count += 1
        
        # Check handoff limits
        if self.handoff_count > self.run_caps.max_handoffs:
            logger.warning(f"Handoff limit exceeded: {self.handoff_count}/{self.run_caps.max_handoffs}")
            return False
        
        # Log handoff
        logger.info(f"Handoff: {from_agent.value} → {to_agent.value} ({reason})")
        
        # Check if handoff requires approval
        if self.run_caps.require_approvals and reason in ["external_api", "code_execution"]:
            self.approval_queue.append({
                "type": "handoff",
                "from": from_agent.value,
                "to": to_agent.value,
                "reason": reason
            })
            return False
        
        return True
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get execution metrics"""
        completed_steps = len([s for s in self.plan if s.status == "done"])
        total_steps = len(self.plan)
        
        return {
            "total_duration": (datetime.utcnow() - self.start_time).total_seconds() if self.start_time else 0,
            "total_cost": self.total_cost,
            "total_tokens": sum(a.tokens_used for a in self.actions),
            "total_tool_calls": len([a for a in self.actions if a.type == "tool"]),
            "total_handoffs": self.handoff_count,
            "success_rate": completed_steps / total_steps if total_steps > 0 else 0,
            "retry_count": sum(s.retry_count for s in self.plan),
            "confidence_avg": sum(s.confidence for s in self.plan) / len(self.plan) if self.plan else 0,
            "steps_completed": completed_steps,
            "steps_total": total_steps,
            "artifacts_generated": sum(len(s.artifacts) for s in self.plan),
            "safety_flags": len(self.safety_flags)
        }