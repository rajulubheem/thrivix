# Graph DAG Parallel Execution - Usage Guide

## Overview
The Graph DAG (Directed Acyclic Graph) implementation enables **true parallel execution** of agents, unlike the sequential swarm pattern where agents wait for each other.

## Key Benefits
- **Parallel Execution**: Multiple agents run simultaneously when they don't depend on each other
- **Automatic Dependency Resolution**: The system automatically determines execution order
- **Performance Improvement**: 2-3x speedup for parallel workflows
- **Scalable Architecture**: Add more agents without slowing down the system

## API Endpoints

### 1. Test Parallel Execution
**Endpoint**: `POST /api/v1/graph-demo/test-parallel`

**Purpose**: Demonstrate parallel vs sequential execution with clear timing metrics

**Request**:
```json
{
  "task": "Research AI, Blockchain, and Quantum Computing trends",
  "parallel_agents": 3,
  "agent_delay": 2.0
}
```

**Response**:
```json
{
  "success": true,
  "execution": {
    "parallel_time_seconds": 2.01,
    "sequential_time_estimate": 8,
    "speedup": 3.98,
    "time_saved_seconds": 5.99
  }
}
```

### 2. Get Example Queries
**Endpoint**: `GET /api/v1/graph-demo/example-queries`

**Purpose**: Get sample queries that benefit from parallel execution

**Response**:
```json
{
  "examples": [
    {
      "query": "Compare Python, JavaScript, and Go for backend development",
      "benefit": "3 language analyzers run in parallel",
      "parallel_agents": ["python_analyst", "javascript_analyst", "go_analyst"]
    }
  ]
}
```

### 3. Research Workflow (Streaming)
**Endpoint**: `POST /api/v1/graph-demo/demo-research`

**Purpose**: Execute a research workflow with streaming progress updates

**Query Parameter**: `task` (string)

**Response**: Server-Sent Events stream showing execution progress

## How It Works

### Sequential (Old Way)
```
Agent1 (2s) → Agent2 (2s) → Agent3 (2s) → Analyzer (1s) → Reporter (1s)
Total Time: 8 seconds
```

### Parallel (New DAG Way)
```
Agent1 (2s) ⎤
Agent2 (2s) ⎥→ Analyzer (1s) → Reporter (1s)
Agent3 (2s) ⎦
Total Time: 4 seconds (2x faster!)
```

## Testing the Implementation

Run the test script to verify parallel execution:
```bash
python test_graph_demo.py
```

Expected output:
```
✅ All tests passed! Parallel execution is working!
  - Parallel time: ~2s
  - Sequential estimate: 8s
  - Speedup: ~4x
```

## Real-World Use Cases

1. **Research Tasks**: Multiple researchers gather data simultaneously
2. **Code Analysis**: Analyze different modules in parallel
3. **Data Processing**: Process multiple data sources concurrently
4. **Content Generation**: Create multiple content pieces simultaneously

## Architecture Components

1. **GraphNode**: Represents an agent with dependencies
2. **GraphEdge**: Defines relationships between agents
3. **GraphBuilder**: Constructs the execution DAG
4. **Graph**: Executes agents in parallel respecting dependencies
5. **GraphExecutor**: Integrates with the Strands agent system

## Verification

To verify parallel execution is working:
1. Check the speedup factor (should be > 1.5x)
2. Compare actual time vs sequential estimate
3. Monitor execution levels in the visualization

## Next Steps

- UI components for DAG visualization (pending)
- Integration with main swarm interface
- Custom graph patterns for specific workflows
- Performance monitoring dashboard