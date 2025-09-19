"""Task Analyzer: Analyzes tasks and determines required agents"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
import re

logger = logging.getLogger(__name__)


@dataclass
class TaskRequirement:
    """Requirements identified from task analysis"""
    requires_research: bool = False
    requires_coding: bool = False
    requires_analysis: bool = False
    requires_writing: bool = False
    requires_testing: bool = False
    requires_design: bool = False
    requires_review: bool = False
    complexity: str = "simple"  # simple, moderate, complex
    

@dataclass
class AgentSpec:
    """Specification for an agent to be created"""
    agent_id: str
    name: str
    agent_type: str
    role: str
    task: str
    dependencies: List[str] = None
    model: str = "gpt-4o-mini"
    temperature: float = 0.7
    

class TaskAnalyzer:
    """Analyzes tasks and determines agent requirements"""
    
    # Keywords that indicate different types of work
    RESEARCH_KEYWORDS = [
        "research", "investigate", "find", "search", "explore", 
        "discover", "study", "analyze market", "competitor analysis"
    ]
    
    CODING_KEYWORDS = [
        "code", "implement", "develop", "build", "create app",
        "program", "script", "api", "backend", "frontend",
        "function", "class", "algorithm"
    ]
    
    ANALYSIS_KEYWORDS = [
        "analyze", "evaluate", "assess", "review data", "metrics",
        "statistics", "performance", "optimize", "measure"
    ]
    
    WRITING_KEYWORDS = [
        "write", "document", "report", "article", "blog",
        "content", "copy", "draft", "compose", "describe"
    ]
    
    TESTING_KEYWORDS = [
        "test", "qa", "quality", "verify", "validate",
        "check", "debug", "troubleshoot"
    ]
    
    DESIGN_KEYWORDS = [
        "design", "ui", "ux", "interface", "mockup",
        "wireframe", "layout", "visual", "graphics"
    ]
    
    def analyze_task(self, task: str) -> TaskRequirement:
        """Analyze task text to determine requirements"""
        task_lower = task.lower()
        
        req = TaskRequirement()
        
        # Check for different types of work
        req.requires_research = self._contains_keywords(task_lower, self.RESEARCH_KEYWORDS)
        req.requires_coding = self._contains_keywords(task_lower, self.CODING_KEYWORDS)
        req.requires_analysis = self._contains_keywords(task_lower, self.ANALYSIS_KEYWORDS)
        req.requires_writing = self._contains_keywords(task_lower, self.WRITING_KEYWORDS)
        req.requires_testing = self._contains_keywords(task_lower, self.TESTING_KEYWORDS)
        req.requires_design = self._contains_keywords(task_lower, self.DESIGN_KEYWORDS)
        
        # Determine complexity
        req.complexity = self._determine_complexity(req)
        
        # Always require review for complex tasks
        if req.complexity in ["moderate", "complex"]:
            req.requires_review = True
        
        return req
    
    def _contains_keywords(self, text: str, keywords: List[str]) -> bool:
        """Check if text contains any of the keywords"""
        return any(keyword in text for keyword in keywords)
    
    def _determine_complexity(self, req: TaskRequirement) -> str:
        """Determine task complexity based on requirements"""
        requirement_count = sum([
            req.requires_research,
            req.requires_coding,
            req.requires_analysis,
            req.requires_writing,
            req.requires_testing,
            req.requires_design
        ])
        
        if requirement_count >= 4:
            return "complex"
        elif requirement_count >= 2:
            return "moderate"
        else:
            return "simple"
    
    def generate_agent_specs(self, task: str, requirements: TaskRequirement) -> List[AgentSpec]:
        """Generate agent specifications based on requirements"""
        agents = []
        agent_counter = 0
        
        # Track dependencies for DAG construction
        last_agent_id = None
        
        # Research phase (first if needed)
        if requirements.requires_research:
            agent_id = f"agent_{agent_counter:03d}"
            agents.append(AgentSpec(
                agent_id=agent_id,
                name="Research Specialist",
                agent_type="research",
                role="Gather information and research",
                task=f"Research information for: {task}",
                model="gpt-4o-mini",
                temperature=0.3
            ))
            last_agent_id = agent_id
            agent_counter += 1
        
        # Design phase (before implementation)
        if requirements.requires_design:
            agent_id = f"agent_{agent_counter:03d}"
            agents.append(AgentSpec(
                agent_id=agent_id,
                name="Design Specialist",
                agent_type="custom",
                role="Create designs and user interfaces",
                task=f"Design the interface/visuals for: {task}",
                dependencies=[last_agent_id] if last_agent_id else None,
                model="gpt-4o-mini",
                temperature=0.7
            ))
            last_agent_id = agent_id
            agent_counter += 1
        
        # Implementation phase (can be parallel)
        implementation_agents = []
        
        if requirements.requires_coding:
            agent_id = f"agent_{agent_counter:03d}"
            agents.append(AgentSpec(
                agent_id=agent_id,
                name="Development Specialist",
                agent_type="custom",
                role="Implement code and functionality",
                task=f"Develop the implementation for: {task}",
                dependencies=[last_agent_id] if last_agent_id else None,
                model="gpt-4o-mini",
                temperature=0.5
            ))
            implementation_agents.append(agent_id)
            agent_counter += 1
        
        if requirements.requires_writing:
            agent_id = f"agent_{agent_counter:03d}"
            agents.append(AgentSpec(
                agent_id=agent_id,
                name="Content Writer",
                agent_type="writer",
                role="Create written content",
                task=f"Write content for: {task}",
                dependencies=[last_agent_id] if last_agent_id else None,
                model="gpt-4o-mini",
                temperature=0.7
            ))
            implementation_agents.append(agent_id)
            agent_counter += 1
        
        # Use implementation agents as dependencies for next phase
        if implementation_agents:
            last_agent_id = implementation_agents  # List of IDs for parallel deps
        
        # Analysis phase
        if requirements.requires_analysis:
            agent_id = f"agent_{agent_counter:03d}"
            deps = last_agent_id if isinstance(last_agent_id, list) else [last_agent_id] if last_agent_id else None
            agents.append(AgentSpec(
                agent_id=agent_id,
                name="Analysis Specialist",
                agent_type="analysis",
                role="Analyze and evaluate results",
                task=f"Analyze the results for: {task}",
                dependencies=deps,
                model="gpt-4o-mini",
                temperature=0.5
            ))
            last_agent_id = agent_id
            agent_counter += 1
        
        # Testing phase
        if requirements.requires_testing:
            agent_id = f"agent_{agent_counter:03d}"
            deps = last_agent_id if isinstance(last_agent_id, list) else [last_agent_id] if last_agent_id else None
            agents.append(AgentSpec(
                agent_id=agent_id,
                name="QA Specialist",
                agent_type="qa",
                role="Test and ensure quality",
                task=f"Test and validate: {task}",
                dependencies=deps,
                model="gpt-4o-mini",
                temperature=0.2
            ))
            last_agent_id = agent_id
            agent_counter += 1
        
        # Review phase (always last if needed)
        if requirements.requires_review:
            agent_id = f"agent_{agent_counter:03d}"
            deps = last_agent_id if isinstance(last_agent_id, list) else [last_agent_id] if last_agent_id else None
            agents.append(AgentSpec(
                agent_id=agent_id,
                name="Review Specialist",
                agent_type="qa",
                role="Review and provide final assessment",
                task=f"Review all work and provide final assessment for: {task}",
                dependencies=deps,
                model="gpt-4o-mini",
                temperature=0.3
            ))
            agent_counter += 1
        
        # If no specific requirements detected, create a general agent
        if not agents:
            agents.append(AgentSpec(
                agent_id="agent_000",
                name="General Assistant",
                agent_type="custom",
                role="Complete the requested task",
                task=task,
                model="gpt-4o-mini",
                temperature=0.7
            ))
        
        return agents
    
    def build_dag_from_specs(self, specs: List[AgentSpec]) -> Dict[str, Any]:
        """Build DAG structure from agent specifications"""
        nodes = []
        edges = []
        
        for spec in specs:
            # Add node
            nodes.append({
                "id": spec.agent_id,
                "data": {
                    "agent_id": spec.agent_id,
                    "task": spec.task
                }
            })
            
            # Add edges based on dependencies
            if spec.dependencies:
                for dep in spec.dependencies:
                    edges.append({
                        "from": dep,
                        "to": spec.agent_id
                    })
        
        return {
            "nodes": nodes,
            "edges": edges,
            "metadata": {
                "total_agents": len(specs),
                "has_parallel": any(len(s.dependencies or []) > 1 for s in specs)
            }
        }