"""
SwarmDAGAdapter - Seamlessly integrates DAG parallel execution with existing Swarm
WITHOUT breaking any existing functionality.
"""

import re
from typing import List, Dict, Any, Optional, Tuple
from enum import Enum
import asyncio
import logging

from ..graph import GraphBuilder, Graph
from strands import Agent as StrandsAgent

logger = logging.getLogger(__name__)


class ExecutionMode(str, Enum):
    """Execution modes for agent orchestration"""
    SEQUENTIAL = "sequential"  # Traditional swarm mode (default)
    PARALLEL = "parallel"      # DAG-based parallel execution
    AUTO = "auto"              # Auto-detect best mode


class ParallelPattern:
    """Patterns that benefit from parallel execution"""
    
    # Keywords that suggest parallel research
    RESEARCH_KEYWORDS = [
        "research", "analyze", "compare", "investigate", "explore",
        "gather", "collect", "assess", "evaluate", "study"
    ]
    
    # Keywords that suggest multiple topics
    MULTI_TOPIC_PATTERNS = [
        r"\band\b",  # "X and Y and Z"
        r",\s+",     # "X, Y, Z"
        r"multiple", # "multiple aspects"
        r"various",  # "various topics"
        r"different" # "different areas"
    ]
    
    # Keywords that suggest data collection
    DATA_KEYWORDS = [
        "data", "information", "statistics", "metrics", "reports",
        "sources", "databases", "apis", "services"
    ]


class SwarmDAGAdapter:
    """
    Adapter that intelligently chooses between sequential and parallel execution
    based on task analysis, without modifying existing swarm code.
    """
    
    def __init__(self):
        self.execution_mode = ExecutionMode.AUTO
        self.parallel_threshold = 3  # Min agents to consider parallel
        
    def analyze_task_for_parallelism(self, task: str) -> Tuple[bool, str]:
        """
        Analyze if a task would benefit from parallel execution.
        
        Returns:
            (should_parallelize, reason)
        """
        task_lower = task.lower()
        
        # Check for research patterns
        research_score = sum(1 for kw in ParallelPattern.RESEARCH_KEYWORDS 
                            if kw in task_lower)
        
        # Check for multiple topics
        multi_topic_score = sum(1 for pattern in ParallelPattern.MULTI_TOPIC_PATTERNS
                               if re.search(pattern, task_lower))
        
        # Check for data collection
        data_score = sum(1 for kw in ParallelPattern.DATA_KEYWORDS 
                        if kw in task_lower)
        
        # Decision logic
        total_score = research_score + multi_topic_score + data_score
        
        if total_score >= 3:
            return True, f"Task suggests parallel execution (score: {total_score})"
        
        # Check for explicit parallel indicators
        if "parallel" in task_lower or "simultaneous" in task_lower:
            return True, "Explicit parallel execution requested"
        
        # Check for multiple distinct items
        items = re.findall(r'"([^"]*)"', task)  # Find quoted items
        if len(items) >= 3:
            return True, f"Multiple distinct items found ({len(items)} items)"
        
        return False, "Sequential execution recommended"
    
    def detect_agent_dependencies(self, agents: List[Dict]) -> Dict[str, List[str]]:
        """
        Detect dependencies between agents based on their roles and prompts.
        
        Returns:
            Dict mapping agent_id to list of dependency agent_ids
        """
        dependencies = {}
        
        for i, agent in enumerate(agents):
            agent_id = f"agent_{i}"
            deps = []
            
            # Analyze system prompt for dependency keywords
            prompt_lower = agent.get("system_prompt", "").lower()
            name_lower = agent.get("name", "").lower()
            
            # Special handling for research agents - they can run in parallel
            if any(word in name_lower for word in ["research", "explore", "investigate", "analyze"]):
                # Research agents typically don't depend on each other
                # unless explicitly stated
                if "synthesize" in prompt_lower or "combine" in prompt_lower:
                    # This is a synthesizer, depends on all researchers
                    for j, other in enumerate(agents[:i]):
                        other_name = other.get("name", "").lower()
                        if any(word in other_name for word in ["research", "explore", "investigate"]):
                            deps.append(f"agent_{j}")
                # Otherwise, research agents are independent
            
            # Check for explicit synthesis/combination roles
            elif any(word in prompt_lower for word in 
                   ["synthesize", "combine", "aggregate", "summarize all", "integrate"]):
                # This agent depends on others
                # Find which agents it should depend on
                for j, other in enumerate(agents[:i]):
                    # Depend on all previous agents that aren't synthesizers
                    other_prompt = other.get("system_prompt", "").lower()
                    if not any(word in other_prompt for word in ["synthesize", "combine", "aggregate"]):
                        deps.append(f"agent_{j}")
            
            # Check role-based dependencies
            role = agent.get("role", "").lower()
            if role in ["validator", "reviewer", "synthesizer", "reporter", "coordinator"]:
                # These roles typically depend on all previous work
                if i > 0 and not deps:  # Only if we haven't already set dependencies
                    deps = [f"agent_{j}" for j in range(i)]
            elif role in ["analyzer", "processor"] and "final" in prompt_lower:
                # Final analyzers depend on everything
                for j in range(i):
                    deps.append(f"agent_{j}")
            
            dependencies[agent_id] = deps
        
        return dependencies
    
    def build_dag_from_agents(self, agents: List[Dict], task: str) -> Optional[Graph]:
        """
        Build a DAG from agent configurations if parallel execution would help.
        
        Returns:
            Graph object or None if sequential is better
        """
        # Check if we have enough agents
        if len(agents) < self.parallel_threshold:
            logger.info(f"Only {len(agents)} agents, using sequential mode")
            return None
        
        # Detect dependencies
        dependencies = self.detect_agent_dependencies(agents)
        
        # Check if there's any parallelism opportunity
        parallel_groups = self._identify_parallel_groups(dependencies, len(agents))
        if len(parallel_groups) <= 1:
            logger.info("No parallelism opportunity detected")
            return None
        
        # Build the DAG
        builder = GraphBuilder()
        
        # Create Strands agents and add nodes
        for i, agent_config in enumerate(agents):
            agent = StrandsAgent(
                name=agent_config.get("name", f"Agent_{i}"),
                system_prompt=agent_config.get("system_prompt", ""),
                tools=agent_config.get("tools", [])
            )
            
            node_id = f"agent_{i}"
            builder.add_node(agent, node_id)
            
            # Add dependencies
            for dep in dependencies.get(node_id, []):
                builder.add_edge(dep, node_id)
            
            # Set entry points (nodes with no dependencies)
            if not dependencies.get(node_id):
                builder.set_entry_point(node_id)
        
        return builder.build()
    
    def _identify_parallel_groups(self, dependencies: Dict, num_agents: int) -> List[List[str]]:
        """
        Identify groups of agents that can run in parallel.
        
        Returns:
            List of parallel groups
        """
        groups = []
        processed = set()
        
        for level in range(num_agents):
            group = []
            for i in range(num_agents):
                agent_id = f"agent_{i}"
                if agent_id in processed:
                    continue
                
                # Check if all dependencies are processed
                deps = dependencies.get(agent_id, [])
                if all(dep in processed for dep in deps):
                    group.append(agent_id)
            
            if group:
                groups.append(group)
                processed.update(group)
            
            if len(processed) == num_agents:
                break
        
        return groups
    
    async def execute_with_best_mode(
        self,
        task: str,
        agents: List[Dict],
        execution_mode: ExecutionMode = ExecutionMode.AUTO,
        existing_swarm_executor=None
    ) -> Dict[str, Any]:
        """
        Execute task using the best execution mode.
        
        Args:
            task: The task to execute
            agents: List of agent configurations
            execution_mode: Force a specific mode or use AUTO
            existing_swarm_executor: The existing swarm executor to use for sequential
            
        Returns:
            Execution result with mode information
        """
        # Determine execution mode
        use_parallel = False
        reason = ""
        
        if execution_mode == ExecutionMode.PARALLEL:
            use_parallel = True
            reason = "Parallel mode forced by user"
        elif execution_mode == ExecutionMode.SEQUENTIAL:
            use_parallel = False
            reason = "Sequential mode forced by user"
        else:  # AUTO mode
            use_parallel, reason = self.analyze_task_for_parallelism(task)
        
        # Log decision
        logger.info(f"Execution mode: {'PARALLEL' if use_parallel else 'SEQUENTIAL'} - {reason}")
        
        # Execute based on mode
        if use_parallel:
            # Try to build DAG
            graph = self.build_dag_from_agents(agents, task)
            
            if graph:
                # Execute with DAG
                result = await graph.execute_async(task)
                
                return {
                    "execution_mode": "parallel",
                    "reason": reason,
                    "parallel_groups": len(graph._get_execution_levels()),
                    "time_saved_estimate": self._estimate_time_saved(agents, result),
                    "result": result
                }
        
        # Fall back to sequential execution
        if existing_swarm_executor:
            result = await existing_swarm_executor.execute(task, agents)
        else:
            # Simple sequential execution
            result = await self._simple_sequential_execution(task, agents)
        
        return {
            "execution_mode": "sequential",
            "reason": reason if not use_parallel else "Fell back to sequential",
            "result": result
        }
    
    async def _simple_sequential_execution(self, task: str, agents: List[Dict]) -> Any:
        """
        Simple sequential execution for fallback.
        """
        results = []
        current_input = task
        
        for agent_config in agents:
            agent = StrandsAgent(
                name=agent_config.get("name", "Agent"),
                system_prompt=agent_config.get("system_prompt", ""),
                tools=agent_config.get("tools", [])
            )
            
            result = await agent.invoke_async(current_input)
            results.append(result)
            current_input = str(result)  # Use output as next input
        
        return results
    
    def _estimate_time_saved(self, agents: List[Dict], result: Any) -> float:
        """
        Estimate time saved by parallel execution.
        """
        # Simple estimation based on agent count and parallelism
        sequential_time = len(agents) * 2.0  # Assume 2 seconds per agent
        parallel_time = getattr(result, 'execution_time_ms', 0) / 1000.0
        
        if parallel_time > 0:
            return max(0, sequential_time - parallel_time)
        return 0.0
    
    def get_execution_preview(self, task: str, agents: List[Dict]) -> Dict[str, Any]:
        """
        Preview how the task would be executed without actually running it.
        
        Returns:
            Preview information including mode and reasoning
        """
        use_parallel, reason = self.analyze_task_for_parallelism(task)
        
        preview = {
            "recommended_mode": "parallel" if use_parallel else "sequential",
            "reason": reason,
            "agent_count": len(agents)
        }
        
        if use_parallel:
            dependencies = self.detect_agent_dependencies(agents)
            parallel_groups = self._identify_parallel_groups(dependencies, len(agents))
            
            preview["parallel_groups"] = [
                {
                    "level": i + 1,
                    "agents": group,
                    "count": len(group)
                }
                for i, group in enumerate(parallel_groups)
            ]
            preview["estimated_speedup"] = f"{len(agents) / len(parallel_groups):.1f}x"
        
        return preview


# Singleton instance for easy access
swarm_dag_adapter = SwarmDAGAdapter()