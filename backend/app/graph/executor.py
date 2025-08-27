"""Graph executor that integrates with the existing Strands agent system."""

import asyncio
import logging
from typing import Dict, List, Any, Optional, Union
from datetime import datetime

from strands import Agent
from ..services.ai_orchestrator import AIOrchestrator as AgentOrchestrator
from .builder import GraphBuilder
from .graph import Graph, GraphResult


logger = logging.getLogger(__name__)


class GraphExecutor:
    """
    Executor that creates and runs DAG-based agent workflows.
    Integrates with existing Strands agent system.
    """
    
    def __init__(self, orchestrator: Optional[AgentOrchestrator] = None):
        self.orchestrator = orchestrator or AgentOrchestrator()
        self.execution_history: List[GraphResult] = []
        
    async def create_graph_from_task_analysis(
        self,
        task: str,
        agents_config: Optional[Dict[str, Any]] = None
    ) -> Graph:
        """
        Analyze task and create an optimal graph structure.
        
        Args:
            task: Task to analyze
            agents_config: Optional agent configuration
            
        Returns:
            Constructed Graph
        """
        # Initialize orchestrator if needed
        if not self.orchestrator._initialized:
            await self.orchestrator._ensure_initialized()
            
        # Use orchestrator to analyze task and generate agents
        task_analysis = await self.orchestrator.analyze_task(task)
        agent_configs = await self.orchestrator.generate_agents(
            task=task,
            analysis=task_analysis
        )
        
        # Convert agent configs to actual Agent instances
        agents = []
        for config in agent_configs:
            agent = Agent(
                name=config.name,
                system_prompt=config.system_prompt,
                tools=config.tools or []
            )
            agents.append(agent)
        
        # Build graph based on task type and agent capabilities
        builder = GraphBuilder()
        
        # Determine graph topology based on task analysis
        task_type = task_analysis.task_type if hasattr(task_analysis, 'task_type') else 'general'
        
        if task_type == 'research':
            return self._build_research_graph(builder, agents, task_analysis)
        elif task_type == 'development':
            return self._build_development_graph(builder, agents, task_analysis)
        elif task_type == 'analysis':
            return self._build_analysis_graph(builder, agents, task_analysis)
        else:
            return self._build_general_graph(builder, agents, task_analysis)
            
    def _build_research_graph(
        self,
        builder: GraphBuilder,
        agents: List[Agent],
        analysis: Dict[str, Any]
    ) -> Graph:
        """
        Build a research-oriented graph with parallel data gathering.
        
        Research pattern:
        - Multiple researchers work in parallel
        - Fact checker validates all research
        - Synthesizer combines findings
        - Report writer creates final output
        """
        # Identify agent roles
        researchers = [a for a in agents if 'research' in a.name.lower()]
        analyzers = [a for a in agents if 'analy' in a.name.lower()]
        validators = [a for a in agents if any(word in a.name.lower() for word in ['check', 'valid', 'verify'])]
        synthesizers = [a for a in agents if any(word in a.name.lower() for word in ['synth', 'combin', 'report', 'summar'])]
        
        # Add researcher nodes (parallel)
        for i, researcher in enumerate(researchers):
            builder.add_node(researcher, f"research_{i}")
            builder.set_entry_point(f"research_{i}")
            
        # Add analyzer nodes (depend on researchers)
        for i, analyzer in enumerate(analyzers):
            builder.add_node(analyzer, f"analyze_{i}")
            for j in range(len(researchers)):
                builder.add_edge(f"research_{j}", f"analyze_{i}")
                
        # Add validator (depends on analyzers)
        if validators:
            builder.add_node(validators[0], "validate")
            for i in range(len(analyzers)):
                builder.add_edge(f"analyze_{i}", "validate")
                
        # Add synthesizer (depends on validation or analysis)
        if synthesizers:
            builder.add_node(synthesizers[0], "synthesize")
            if validators:
                builder.add_edge("validate", "synthesize")
            else:
                for i in range(len(analyzers)):
                    builder.add_edge(f"analyze_{i}", "synthesize")
                    
        return builder.build()
        
    def _build_development_graph(
        self,
        builder: GraphBuilder,
        agents: List[Agent],
        analysis: Dict[str, Any]
    ) -> Graph:
        """
        Build a development-oriented graph with parallel implementation.
        
        Development pattern:
        - Architect designs the solution
        - Multiple developers implement in parallel
        - Tester validates implementation
        - Reviewer ensures quality
        """
        # Identify agent roles
        architects = [a for a in agents if any(word in a.name.lower() for word in ['architect', 'design', 'plan'])]
        developers = [a for a in agents if any(word in a.name.lower() for word in ['develop', 'code', 'implement', 'build'])]
        testers = [a for a in agents if any(word in a.name.lower() for word in ['test', 'qa', 'quality'])]
        reviewers = [a for a in agents if any(word in a.name.lower() for word in ['review', 'check', 'valid'])]
        
        # Add architect as entry point
        if architects:
            builder.add_node(architects[0], "architect")
            builder.set_entry_point("architect")
            
            # Developers depend on architect
            for i, dev in enumerate(developers):
                builder.add_node(dev, f"dev_{i}")
                builder.add_edge("architect", f"dev_{i}")
        else:
            # No architect, developers are entry points
            for i, dev in enumerate(developers):
                builder.add_node(dev, f"dev_{i}")
                builder.set_entry_point(f"dev_{i}")
                
        # Add tester (depends on all developers)
        if testers:
            builder.add_node(testers[0], "test")
            for i in range(len(developers)):
                builder.add_edge(f"dev_{i}", "test")
                
        # Add reviewer (depends on testing)
        if reviewers:
            builder.add_node(reviewers[0], "review")
            if testers:
                builder.add_edge("test", "review")
            else:
                for i in range(len(developers)):
                    builder.add_edge(f"dev_{i}", "review")
                    
        return builder.build()
        
    def _build_analysis_graph(
        self,
        builder: GraphBuilder,
        agents: List[Agent],
        analysis: Dict[str, Any]
    ) -> Graph:
        """
        Build an analysis-oriented graph with parallel processing.
        
        Analysis pattern:
        - Data collectors gather in parallel
        - Processors transform data in parallel
        - Analyzer combines results
        - Reporter presents findings
        """
        # Group agents by capability
        collectors = [a for a in agents if any(word in a.name.lower() for word in ['collect', 'gather', 'fetch'])]
        processors = [a for a in agents if any(word in a.name.lower() for word in ['process', 'transform', 'compute'])]
        analyzers = [a for a in agents if any(word in a.name.lower() for word in ['analy', 'evaluat'])]
        reporters = [a for a in agents if any(word in a.name.lower() for word in ['report', 'present', 'summar'])]
        
        # Add collectors as entry points (parallel)
        for i, collector in enumerate(collectors[:3]):  # Limit to 3 parallel collectors
            builder.add_node(collector, f"collect_{i}")
            builder.set_entry_point(f"collect_{i}")
            
        # Add processors (depend on collectors)
        for i, processor in enumerate(processors[:2]):  # Limit parallel processors
            builder.add_node(processor, f"process_{i}")
            for j in range(min(3, len(collectors))):
                builder.add_edge(f"collect_{j}", f"process_{i}")
                
        # Add analyzer (depends on processors)
        if analyzers:
            builder.add_node(analyzers[0], "analyze")
            for i in range(min(2, len(processors))):
                builder.add_edge(f"process_{i}", "analyze")
                
        # Add reporter (final node)
        if reporters:
            builder.add_node(reporters[0], "report")
            if analyzers:
                builder.add_edge("analyze", "report")
            elif processors:
                for i in range(min(2, len(processors))):
                    builder.add_edge(f"process_{i}", "report")
                    
        return builder.build()
        
    def _build_general_graph(
        self,
        builder: GraphBuilder,
        agents: List[Agent],
        analysis: Dict[str, Any]
    ) -> Graph:
        """
        Build a general graph with intelligent dependency detection.
        
        Uses agent capabilities to determine dependencies.
        """
        # Sort agents by complexity/capability
        # Entry points: agents that gather or research
        # Middle layer: agents that process or analyze
        # Final layer: agents that synthesize or report
        
        entry_agents = []
        middle_agents = []
        final_agents = []
        
        for agent in agents:
            name_lower = agent.name.lower()
            if any(word in name_lower for word in ['research', 'gather', 'collect', 'fetch', 'search']):
                entry_agents.append(agent)
            elif any(word in name_lower for word in ['report', 'summar', 'synth', 'final', 'present']):
                final_agents.append(agent)
            else:
                middle_agents.append(agent)
                
        # Build graph structure
        # Entry layer
        for i, agent in enumerate(entry_agents[:3]):  # Limit parallel entry points
            builder.add_node(agent, f"entry_{i}")
            builder.set_entry_point(f"entry_{i}")
            
        # Middle layer
        for i, agent in enumerate(middle_agents[:3]):
            builder.add_node(agent, f"middle_{i}")
            # Connect to all entry points
            for j in range(min(3, len(entry_agents))):
                builder.add_edge(f"entry_{j}", f"middle_{i}")
                
        # Final layer
        if final_agents:
            builder.add_node(final_agents[0], "final")
            # Connect to all middle agents
            if middle_agents:
                for i in range(min(3, len(middle_agents))):
                    builder.add_edge(f"middle_{i}", "final")
            else:
                # Connect directly to entry if no middle layer
                for i in range(min(3, len(entry_agents))):
                    builder.add_edge(f"entry_{i}", "final")
                    
        # If no agents fit the categories, create a simple sequential graph
        if not entry_agents and not middle_agents and not final_agents:
            for i, agent in enumerate(agents):
                builder.add_node(agent, f"agent_{i}")
                if i == 0:
                    builder.set_entry_point(f"agent_{i}")
                else:
                    builder.add_edge(f"agent_{i-1}", f"agent_{i}")
                    
        return builder.build()
        
    async def execute_graph_async(
        self,
        task: str,
        graph: Optional[Graph] = None,
        agents_config: Optional[Dict[str, Any]] = None
    ) -> GraphResult:
        """
        Execute a graph asynchronously.
        
        Args:
            task: Task to execute
            graph: Optional pre-built graph (will create if not provided)
            agents_config: Optional agent configuration
            
        Returns:
            GraphResult
        """
        # Create graph if not provided
        if graph is None:
            graph = await self.create_graph_from_task_analysis(task, agents_config)
            
        # Log execution plan
        logger.info(f"Executing graph with {len(graph.nodes)} nodes")
        logger.info(graph.visualize_execution())
        
        # Execute graph
        result = await graph.execute_async(task)
        
        # Store in history
        self.execution_history.append(result)
        
        return result
        
    def execute_graph(
        self,
        task: str,
        graph: Optional[Graph] = None,
        agents_config: Optional[Dict[str, Any]] = None
    ) -> GraphResult:
        """
        Execute a graph synchronously.
        
        Args:
            task: Task to execute
            graph: Optional pre-built graph
            agents_config: Optional agent configuration
            
        Returns:
            GraphResult
        """
        return asyncio.run(self.execute_graph_async(task, graph, agents_config))