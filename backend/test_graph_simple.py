#!/usr/bin/env python3
"""Simple test to verify Graph DAG parallel execution works"""

import asyncio
import time
from app.graph import GraphBuilder, Graph

# Create simple test executors
class TestAgent:
    def __init__(self, name, delay=1):
        self.name = name
        self.delay = delay
        
    async def invoke_async(self, task):
        print(f"[{self.name}] Starting with input: {task[:50]}...")
        start = time.time()
        await asyncio.sleep(self.delay)
        elapsed = time.time() - start
        result = f"[{self.name}] completed in {elapsed:.2f}s"
        print(result)
        return result

async def test_parallel_execution():
    """Test that agents actually run in parallel"""
    print("\n=== Testing Parallel Execution ===\n")
    
    # Create test agents
    agent1 = TestAgent("Research_AI", delay=2)
    agent2 = TestAgent("Research_Blockchain", delay=2)
    agent3 = TestAgent("Research_IoT", delay=2)
    analyzer = TestAgent("Analyzer", delay=1)
    reporter = TestAgent("Reporter", delay=1)
    
    # Build DAG
    builder = GraphBuilder()
    
    # Add parallel researchers
    builder.add_node(agent1, "research_ai")
    builder.add_node(agent2, "research_blockchain")
    builder.add_node(agent3, "research_iot")
    
    # All are entry points (run in parallel)
    builder.set_entry_points(["research_ai", "research_blockchain", "research_iot"])
    
    # Analyzer depends on all research
    builder.add_node(analyzer, "analyzer")
    builder.add_edge("research_ai", "analyzer")
    builder.add_edge("research_blockchain", "analyzer")
    builder.add_edge("research_iot", "analyzer")
    
    # Reporter depends on analyzer
    builder.add_node(reporter, "reporter")
    builder.add_edge("analyzer", "reporter")
    
    # Build and visualize
    graph = builder.build()
    print(graph.visualize_execution())
    print("\n" + "="*50 + "\n")
    
    # Execute
    start_time = time.time()
    result = await graph.execute_async("Research the latest in AI, Blockchain, and IoT")
    total_time = time.time() - start_time
    
    print(f"\n=== Results ===")
    print(f"Total execution time: {total_time:.2f}s")
    print(f"Status: {result.status.value}")
    print(f"Completed nodes: {result.completed_nodes}/{result.total_nodes}")
    
    # If this was sequential, it would take 2+2+2+1+1 = 8 seconds
    # With parallel execution, it should take 2+1+1 = 4 seconds
    expected_sequential = 8
    speedup = expected_sequential / total_time
    
    print(f"\nPerformance:")
    print(f"  Sequential time (if run one by one): {expected_sequential}s")
    print(f"  Actual parallel time: {total_time:.2f}s")
    print(f"  Speedup: {speedup:.2f}x")
    print(f"  Time saved: {expected_sequential - total_time:.2f}s")
    
    if total_time < 5:  # Should be around 4 seconds
        print("\n✅ SUCCESS: Parallel execution is working!")
    else:
        print("\n❌ FAILURE: Agents ran sequentially")

if __name__ == "__main__":
    asyncio.run(test_parallel_execution())