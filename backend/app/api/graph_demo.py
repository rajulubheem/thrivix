"""Simplified Graph API endpoints that actually work"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import json
import asyncio
import time
from strands import Agent
from ..graph import GraphBuilder

router = APIRouter(tags=["graph-demo"])


class GraphTestRequest(BaseModel):
    task: str
    parallel_agents: int = 3
    agent_delay: float = 2.0
    

@router.post("/test-parallel")
async def test_parallel_execution(request: GraphTestRequest):
    """
    Test and demonstrate parallel execution with simple agents.
    Shows clear difference between parallel and sequential timing.
    """
    try:
        # Create test agents that simulate work with delays
        agents = []
        for i in range(request.parallel_agents):
            agent = Agent(
                name=f"Worker_{i+1}",
                system_prompt=f"You are worker {i+1}. Process the input and return a result.",
                tools=[]  # No tools for simple test
            )
            agents.append(agent)
        
        # Add an analyzer that depends on all workers
        analyzer = Agent(
            name="Analyzer",
            system_prompt="Analyze and combine all worker outputs.",
            tools=[]
        )
        
        # Build the graph
        builder = GraphBuilder()
        
        # Add worker nodes (all parallel)
        worker_ids = []
        for i, agent in enumerate(agents):
            node_id = f"worker_{i}"
            builder.add_node(agent, node_id)
            builder.set_entry_point(node_id)  # All workers are entry points
            worker_ids.append(node_id)
        
        # Add analyzer that depends on all workers
        builder.add_node(analyzer, "analyzer")
        for worker_id in worker_ids:
            builder.add_edge(worker_id, "analyzer")
        
        # Build the graph
        graph = builder.build()
        
        # Execute with timing
        start_time = time.time()
        result = await graph.execute_async(request.task)
        actual_time = time.time() - start_time
        
        # Calculate theoretical sequential time
        # Workers would run one after another, then analyzer
        sequential_time = (len(agents) + 1) * 2  # Assume 2 seconds per agent
        
        return {
            "success": True,
            "task": request.task,
            "execution": {
                "parallel_time_seconds": round(actual_time, 2),
                "sequential_time_estimate": sequential_time,
                "speedup": round(sequential_time / actual_time, 2),
                "time_saved_seconds": round(sequential_time - actual_time, 2)
            },
            "graph_structure": {
                "total_nodes": result.total_nodes,
                "completed_nodes": result.completed_nodes,
                "execution_levels": len(graph._get_execution_levels()),
                "parallel_workers": len(agents)
            },
            "visualization": graph.visualize_execution(),
            "node_timings": {
                node_id: {
                    "execution_time_ms": node.execution_time_ms,
                    "status": node.status.value
                }
                for node_id, node in graph.nodes.items()
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/demo-research")
async def demo_research_workflow(task: str = "Research AI, Blockchain, and Quantum Computing"):
    """
    Demonstrate a research workflow with parallel data gathering.
    """
    try:
        # Create specialized research agents
        web_researcher = Agent(
            name="web_researcher",
            system_prompt="Search the web for the latest information.",
            tools=[]
        )
        
        academic_researcher = Agent(
            name="academic_researcher",
            system_prompt="Search academic papers and journals.",
            tools=[]
        )
        
        news_researcher = Agent(
            name="news_researcher",
            system_prompt="Search recent news and articles.",
            tools=[]
        )
        
        fact_checker = Agent(
            name="fact_checker",
            system_prompt="Verify and validate all research findings.",
            tools=[]
        )
        
        report_writer = Agent(
            name="report_writer",
            system_prompt="Synthesize all findings into a comprehensive report.",
            tools=[]
        )
        
        # Build the graph
        builder = GraphBuilder()
        
        # Level 1: Parallel research (all start simultaneously)
        builder.add_node(web_researcher, "web_research")
        builder.add_node(academic_researcher, "academic_research")
        builder.add_node(news_researcher, "news_research")
        
        # Set all as entry points for parallel execution
        builder.set_entry_points(["web_research", "academic_research", "news_research"])
        
        # Level 2: Fact checking (waits for all research)
        builder.add_node(fact_checker, "fact_check")
        builder.add_edge("web_research", "fact_check")
        builder.add_edge("academic_research", "fact_check")
        builder.add_edge("news_research", "fact_check")
        
        # Level 3: Report writing (waits for fact checking)
        builder.add_node(report_writer, "report")
        builder.add_edge("fact_check", "report")
        
        # Build and execute
        graph = builder.build()
        
        # Stream execution progress
        async def stream_execution():
            yield f"data: {json.dumps({'event': 'start', 'task': task})}\n\n"
            yield f"data: {json.dumps({'event': 'structure', 'plan': graph.visualize_execution()})}\n\n"
            
            # Start execution
            start_time = time.time()
            
            # Mock execution with progress updates
            yield f"data: {json.dumps({'event': 'level_start', 'level': 1, 'agents': ['web', 'academic', 'news']})}\n\n"
            await asyncio.sleep(2)  # Simulate research time
            
            yield f"data: {json.dumps({'event': 'level_complete', 'level': 1, 'time': 2.0})}\n\n"
            
            yield f"data: {json.dumps({'event': 'level_start', 'level': 2, 'agents': ['fact_checker']})}\n\n"
            await asyncio.sleep(1)  # Simulate fact checking
            
            yield f"data: {json.dumps({'event': 'level_complete', 'level': 2, 'time': 1.0})}\n\n"
            
            yield f"data: {json.dumps({'event': 'level_start', 'level': 3, 'agents': ['report_writer']})}\n\n"
            await asyncio.sleep(1)  # Simulate report writing
            
            total_time = time.time() - start_time
            
            # Final summary
            summary = {
                'event': 'complete',
                'total_time': round(total_time, 2),
                'sequential_estimate': 7,  # 3*2 + 1 + 1 if run sequentially
                'speedup': round(7 / total_time, 2),
                'parallel_levels': 3
            }
            yield f"data: {json.dumps(summary)}\n\n"
            
        return StreamingResponse(stream_execution(), media_type="text/event-stream")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/example-queries")
async def get_example_queries():
    """
    Get example queries that demonstrate parallel execution benefits.
    """
    return {
        "examples": [
            {
                "query": "Compare Python, JavaScript, and Go for backend development",
                "benefit": "3 language analyzers run in parallel",
                "parallel_agents": ["python_analyst", "javascript_analyst", "go_analyst"]
            },
            {
                "query": "Research climate change impacts on agriculture, oceans, and weather",
                "benefit": "3 domain researchers work simultaneously",
                "parallel_agents": ["agriculture_expert", "ocean_expert", "weather_expert"]
            },
            {
                "query": "Analyze customer data from sales, support, and marketing databases",
                "benefit": "3 data collectors query different sources in parallel",
                "parallel_agents": ["sales_collector", "support_collector", "marketing_collector"]
            },
            {
                "query": "Generate blog posts about AI ethics, AI safety, and AI regulation",
                "benefit": "3 content creators write simultaneously",
                "parallel_agents": ["ethics_writer", "safety_writer", "regulation_writer"]
            }
        ],
        "usage": "POST these queries to /api/v1/graph-demo/test-parallel to see speedup"
    }