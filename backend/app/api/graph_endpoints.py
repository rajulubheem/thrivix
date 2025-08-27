"""API endpoints for Graph-based agent orchestration."""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
import json
import asyncio
import logging

from ..graph import GraphBuilder, GraphExecutor
from ..services.ai_orchestrator import AIOrchestrator as AgentOrchestrator
from strands import Agent


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/graph", tags=["graph"])


class GraphNodeConfig(BaseModel):
    """Configuration for a graph node."""
    node_id: str
    agent_name: str
    system_prompt: str
    tools: List[str] = []
    dependencies: List[str] = []
    metadata: Dict[str, Any] = {}


class GraphConfig(BaseModel):
    """Configuration for building a graph."""
    nodes: List[GraphNodeConfig]
    entry_points: Optional[List[str]] = None
    max_parallel: int = Field(default=5, ge=1, le=20)


class GraphExecuteRequest(BaseModel):
    """Request to execute a graph."""
    task: str
    graph_config: Optional[GraphConfig] = None
    auto_build: bool = Field(default=True, description="Auto-build graph from task if config not provided")
    stream: bool = Field(default=True, description="Stream execution progress")
    session_id: Optional[str] = None


class GraphVisualizationRequest(BaseModel):
    """Request to visualize a graph."""
    task: str
    graph_config: Optional[GraphConfig] = None


@router.post("/build")
async def build_graph(request: GraphVisualizationRequest):
    """
    Build and visualize a graph structure without executing it.
    
    This endpoint allows you to preview the graph topology before execution.
    """
    try:
        executor = GraphExecutor()
        
        if request.graph_config:
            # Build from provided configuration
            builder = GraphBuilder()
            
            # Create agents and add nodes
            agents = {}
            for node_config in request.graph_config.nodes:
                agent = Agent(
                    name=node_config.agent_name,
                    system_prompt=node_config.system_prompt,
                    tools=node_config.tools
                )
                agents[node_config.node_id] = agent
                builder.add_node(agent, node_config.node_id, node_config.metadata)
                
            # Add dependencies as edges
            for node_config in request.graph_config.nodes:
                for dep in node_config.dependencies:
                    builder.add_edge(dep, node_config.node_id)
                    
            # Set entry points
            if request.graph_config.entry_points:
                builder.set_entry_points(request.graph_config.entry_points)
                
            graph = builder.build()
        else:
            # Auto-build from task analysis
            graph = await executor.create_graph_from_task_analysis(request.task)
            
        # Return visualization
        return {
            "success": True,
            "graph": {
                "nodes": [
                    {
                        "id": node_id,
                        "name": getattr(node.executor, 'name', node_id),
                        "dependencies": list(node.dependencies),
                        "status": node.status.value
                    }
                    for node_id, node in graph.nodes.items()
                ],
                "edges": [
                    {
                        "from": edge.from_node,
                        "to": edge.to_node,
                        "conditional": edge.condition is not None
                    }
                    for edge in graph.edges
                ],
                "entry_points": list(graph.entry_points),
                "execution_plan": graph.visualize_execution()
            }
        }
        
    except Exception as e:
        logger.error(f"Error building graph: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/execute")
async def execute_graph(request: GraphExecuteRequest):
    """
    Execute a graph with parallel agent processing.
    
    This endpoint supports both auto-building graphs from task analysis
    and executing pre-configured graph structures.
    """
    try:
        executor = GraphExecutor()
        
        # Build or use provided graph
        if request.graph_config:
            builder = GraphBuilder()
            
            # Create agents and build graph
            for node_config in request.graph_config.nodes:
                agent = Agent(
                    name=node_config.agent_name,
                    system_prompt=node_config.system_prompt,
                    tools=node_config.tools
                )
                builder.add_node(agent, node_config.node_id, node_config.metadata)
                
            # Add edges
            for node_config in request.graph_config.nodes:
                for dep in node_config.dependencies:
                    builder.add_edge(dep, node_config.node_id)
                    
            # Set entry points
            if request.graph_config.entry_points:
                builder.set_entry_points(request.graph_config.entry_points)
                
            graph = builder.build()
        else:
            graph = None  # Will be auto-built
            
        if request.stream:
            # Stream execution progress
            async def stream_graph_execution():
                try:
                    # Start execution
                    result = await executor.execute_graph_async(
                        task=request.task,
                        graph=graph
                    )
                    
                    # Stream progress updates
                    for node in result.execution_order:
                        update = {
                            "type": "node_complete",
                            "node_id": node.node_id,
                            "status": node.status.value,
                            "execution_time_ms": node.execution_time_ms
                        }
                        yield f"data: {json.dumps(update)}\n\n"
                        
                    # Final result
                    final = {
                        "type": "execution_complete",
                        "status": result.status.value,
                        "completed_nodes": result.completed_nodes,
                        "failed_nodes": result.failed_nodes,
                        "skipped_nodes": result.skipped_nodes,
                        "total_time_ms": result.execution_time_ms,
                        "tokens_used": result.accumulated_tokens
                    }
                    yield f"data: {json.dumps(final)}\n\n"
                    
                except Exception as e:
                    error = {
                        "type": "error",
                        "message": str(e)
                    }
                    yield f"data: {json.dumps(error)}\n\n"
                    
            return StreamingResponse(
                stream_graph_execution(),
                media_type="text/event-stream"
            )
        else:
            # Non-streaming execution
            result = await executor.execute_graph_async(
                task=request.task,
                graph=graph
            )
            
            return {
                "success": True,
                "result": {
                    "status": result.status.value,
                    "completed_nodes": result.completed_nodes,
                    "failed_nodes": result.failed_nodes,
                    "skipped_nodes": result.skipped_nodes,
                    "execution_time_ms": result.execution_time_ms,
                    "tokens_used": result.accumulated_tokens,
                    "node_results": {
                        node_id: {
                            "agent": res.agent_name,
                            "status": res.status.value,
                            "execution_time_ms": res.execution_time_ms,
                            "tokens_used": res.tokens_used
                        }
                        for node_id, res in result.results.items()
                    }
                }
            }
            
    except Exception as e:
        logger.error(f"Error executing graph: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/patterns")
async def get_graph_patterns():
    """
    Get predefined graph patterns for common workflows.
    
    Returns a collection of graph templates that can be customized.
    """
    patterns = {
        "research": {
            "name": "Research Pipeline",
            "description": "Parallel research with validation and synthesis",
            "topology": "Multiple researchers -> Fact checker -> Synthesizer -> Report writer",
            "nodes": [
                {"id": "research_1", "role": "researcher", "parallel": True},
                {"id": "research_2", "role": "researcher", "parallel": True},
                {"id": "fact_check", "role": "validator", "dependencies": ["research_1", "research_2"]},
                {"id": "synthesize", "role": "synthesizer", "dependencies": ["fact_check"]},
                {"id": "report", "role": "reporter", "dependencies": ["synthesize"]}
            ]
        },
        "development": {
            "name": "Development Pipeline",
            "description": "Architecture -> Parallel implementation -> Testing -> Review",
            "topology": "Architect -> Multiple developers -> Tester -> Reviewer",
            "nodes": [
                {"id": "architect", "role": "architect", "parallel": False},
                {"id": "dev_backend", "role": "developer", "parallel": True, "dependencies": ["architect"]},
                {"id": "dev_frontend", "role": "developer", "parallel": True, "dependencies": ["architect"]},
                {"id": "test", "role": "tester", "dependencies": ["dev_backend", "dev_frontend"]},
                {"id": "review", "role": "reviewer", "dependencies": ["test"]}
            ]
        },
        "analysis": {
            "name": "Data Analysis Pipeline",
            "description": "Parallel data collection -> Processing -> Analysis -> Reporting",
            "topology": "Collectors -> Processors -> Analyzer -> Reporter",
            "nodes": [
                {"id": "collect_1", "role": "collector", "parallel": True},
                {"id": "collect_2", "role": "collector", "parallel": True},
                {"id": "process", "role": "processor", "dependencies": ["collect_1", "collect_2"]},
                {"id": "analyze", "role": "analyzer", "dependencies": ["process"]},
                {"id": "report", "role": "reporter", "dependencies": ["analyze"]}
            ]
        },
        "creative": {
            "name": "Creative Workflow",
            "description": "Brainstorming -> Parallel creation -> Review -> Refinement",
            "topology": "Ideator -> Multiple creators -> Critic -> Refiner",
            "nodes": [
                {"id": "ideate", "role": "ideator", "parallel": False},
                {"id": "create_1", "role": "creator", "parallel": True, "dependencies": ["ideate"]},
                {"id": "create_2", "role": "creator", "parallel": True, "dependencies": ["ideate"]},
                {"id": "critique", "role": "critic", "dependencies": ["create_1", "create_2"]},
                {"id": "refine", "role": "refiner", "dependencies": ["critique"]}
            ]
        }
    }
    
    return {
        "success": True,
        "patterns": patterns
    }


@router.post("/compare")
async def compare_execution_modes(request: GraphExecuteRequest):
    """
    Compare sequential vs parallel execution for the same task.
    
    This endpoint runs the task in both modes and provides performance metrics.
    """
    try:
        executor = GraphExecutor()
        
        # Build graph
        if request.graph_config:
            # Use provided config
            pass  # Implementation similar to execute endpoint
        else:
            graph = await executor.create_graph_from_task_analysis(request.task)
            
        # Run parallel execution
        parallel_start = asyncio.get_event_loop().time()
        parallel_result = await executor.execute_graph_async(request.task, graph)
        parallel_time = (asyncio.get_event_loop().time() - parallel_start) * 1000
        
        # Simulate sequential execution (all nodes in sequence)
        sequential_time = sum(
            node.execution_time_ms 
            for node in graph.nodes.values() 
            if node.result
        )
        
        # Calculate speedup
        speedup = sequential_time / parallel_time if parallel_time > 0 else 1.0
        
        return {
            "success": True,
            "comparison": {
                "parallel": {
                    "execution_time_ms": parallel_time,
                    "completed_nodes": parallel_result.completed_nodes,
                    "execution_levels": len(graph._get_execution_levels())
                },
                "sequential": {
                    "estimated_time_ms": sequential_time,
                    "nodes": len(graph.nodes)
                },
                "speedup": f"{speedup:.2f}x",
                "time_saved_ms": sequential_time - parallel_time,
                "parallelism_efficiency": f"{(speedup / len(graph._get_execution_levels())) * 100:.1f}%"
            }
        }
        
    except Exception as e:
        logger.error(f"Error comparing execution modes: {e}")
        raise HTTPException(status_code=500, detail=str(e))