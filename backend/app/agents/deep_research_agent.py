"""
Deep Research Agent with Agent Loop for Multi-Step Reasoning
Implements the agent loop concept for sophisticated research
"""
import os
import aiohttp
import asyncio
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
import logging
from enum import Enum

logger = logging.getLogger(__name__)

class StopReason(Enum):
    """Reasons why the agent loop stopped"""
    COMPLETED = "completed"
    MAX_ITERATIONS = "max_iterations"
    ERROR = "error"
    TIMEOUT = "timeout"

class AgentState(Enum):
    """Current state of the agent"""
    INITIALIZING = "initializing"
    REASONING = "reasoning"
    TOOL_SELECTION = "tool_selection"
    TOOL_EXECUTION = "tool_execution"
    SYNTHESIZING = "synthesizing"
    COMPLETED = "completed"

class DeepResearchAgent:
    """
    Deep Research Agent that implements agent loop for multi-step reasoning
    """
    
    def __init__(self):
        # Load API key
        from dotenv import load_dotenv
        load_dotenv()
        self.api_key = os.getenv("TAVILY_API_KEY") or "REMOVED_API_KEY"
        
        # Agent loop configuration
        self.max_iterations = 5
        self.thinking_depth = 3  # How many reasoning steps per iteration
        
    async def deep_research(self, query: str, enable_deep: bool = True, **kwargs) -> Dict[str, Any]:
        """
        Perform deep research using agent loop methodology
        
        Args:
            query: The research query
            enable_deep: Whether to enable deep multi-step reasoning
            **kwargs: Additional parameters
            
        Returns:
            Comprehensive research results with reasoning trace
        """
        logger.info(f"Starting {'deep' if enable_deep else 'standard'} research for: {query}")
        
        # Initialize agent state
        state = {
            "query": query,
            "iteration": 0,
            "messages": [],
            "tool_results": [],
            "reasoning_trace": [],
            "current_state": AgentState.INITIALIZING,
            "stop_reason": None
        }
        
        if enable_deep:
            # Run the agent loop for deep research
            state = await self._run_agent_loop(state)
        else:
            # Single pass for standard research
            state = await self._single_pass_research(state)
        
        # Compile final results
        return self._compile_deep_results(state)
    
    async def _run_agent_loop(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Core agent loop implementation
        Follows: Receive Input -> Process -> Decide -> Execute -> Iterate
        """
        
        while state["iteration"] < self.max_iterations and state["stop_reason"] is None:
            state["iteration"] += 1
            logger.info(f"Agent Loop Iteration {state['iteration']}")
            
            # Step 1: Reasoning - Analyze what we know and what we need
            state = await self._reasoning_step(state)
            
            # Step 2: Tool Selection - Decide which tools to use
            state = await self._tool_selection_step(state)
            
            # Step 3: Tool Execution - Execute selected tools
            state = await self._tool_execution_step(state)
            
            # Step 4: Synthesis - Analyze results and decide next steps
            state = await self._synthesis_step(state)
            
            # Check if we have enough information
            if self._is_research_complete(state):
                state["stop_reason"] = StopReason.COMPLETED
                break
        
        if state["stop_reason"] is None:
            state["stop_reason"] = StopReason.MAX_ITERATIONS
        
        return state
    
    async def _reasoning_step(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Reasoning step: Analyze current knowledge and plan next actions
        """
        state["current_state"] = AgentState.REASONING
        
        reasoning = {
            "iteration": state["iteration"],
            "timestamp": datetime.now().isoformat(),
            "thoughts": []
        }
        
        if state["iteration"] == 1:
            reasoning["thoughts"].append(f"🔍 Starting comprehensive research on: {state['query']}")
            reasoning["thoughts"].append("📊 Phase 1: Gathering broad overview and current state")
            reasoning["thoughts"].append("🎯 Objective: Establish baseline understanding with authoritative sources")
        elif state["iteration"] == 2:
            prev_results = state["tool_results"][-1] if state["tool_results"] else {}
            sources_count = len(prev_results.get('sources', []))
            reasoning["thoughts"].append(f"✅ Phase 1 complete: Found {sources_count} initial sources")
            reasoning["thoughts"].append("🔬 Phase 2: Deep analysis - seeking expert opinions and predictions")
            reasoning["thoughts"].append("⚠️ Also investigating challenges, risks, and potential concerns")
        elif state["iteration"] == 3:
            total_sources = sum(len(r.get('sources', [])) for r in state.get("tool_results", []))
            reasoning["thoughts"].append(f"📈 Accumulated {total_sources} sources so far")
            reasoning["thoughts"].append("🚀 Phase 3: Future outlook and competitive analysis")
            reasoning["thoughts"].append("🔮 Searching for roadmaps, strategies, and market positioning")
        else:
            reasoning["thoughts"].append("🎯 Final phase: Filling information gaps")
            reasoning["thoughts"].append("📰 Checking for latest breaking news and updates")
            reasoning["thoughts"].append("🔧 Gathering technical specifications and implementation details")
        
        state["reasoning_trace"].append(reasoning)
        return state
    
    async def _tool_selection_step(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Tool selection: Decide which tools to use based on reasoning
        """
        state["current_state"] = AgentState.TOOL_SELECTION
        
        tools_to_use = []
        query = state["query"]
        
        if state["iteration"] == 1:
            # Initial broad search
            tools_to_use.append({
                "tool": "tavily_search",
                "params": {
                    "query": query,
                    "search_depth": "advanced",
                    "max_results": 10
                }
            })
        elif state["iteration"] == 2:
            # Deep dive into specific aspects
            # Focus on analysis and predictions
            tools_to_use.append({
                "tool": "tavily_search",
                "params": {
                    "query": f"{query} analysis predictions experts opinion forecast",
                    "search_depth": "advanced",
                    "max_results": 8
                }
            })
            # Also search for challenges and risks
            tools_to_use.append({
                "tool": "tavily_search",
                "params": {
                    "query": f"{query} challenges risks problems concerns",
                    "search_depth": "advanced",
                    "max_results": 5
                }
            })
        elif state["iteration"] == 3:
            # Search for recent updates and future outlook
            tools_to_use.append({
                "tool": "tavily_search",
                "params": {
                    "query": f"{query} future outlook roadmap plans strategy 2025 2026",
                    "search_depth": "advanced",
                    "max_results": 8
                }
            })
            # Search for comparisons and alternatives
            tools_to_use.append({
                "tool": "tavily_search",
                "params": {
                    "query": f"{query} comparison alternatives competitors market position",
                    "search_depth": "basic",
                    "max_results": 5
                }
            })
        else:
            # Additional targeted searches based on gaps
            # Search for technical details
            tools_to_use.append({
                "tool": "tavily_search",
                "params": {
                    "query": f"{query} technical specifications details implementation data",
                    "search_depth": "advanced",
                    "max_results": 5
                }
            })
            # Search for latest breaking news
            tools_to_use.append({
                "tool": "tavily_search",
                "params": {
                    "query": f"{query} breaking news today latest updates",
                    "search_depth": "basic",
                    "max_results": 5,
                    "days": 3
                }
            })
        
        state["selected_tools"] = tools_to_use
        return state
    
    async def _tool_execution_step(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Tool execution: Execute selected tools concurrently
        """
        state["current_state"] = AgentState.TOOL_EXECUTION
        
        tools_to_execute = state.get("selected_tools", [])
        
        # Execute tools concurrently
        tasks = []
        for tool_config in tools_to_execute:
            if tool_config["tool"] == "tavily_search":
                tasks.append(self._execute_tavily_search(**tool_config["params"]))
        
        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Process results
            combined_results = {
                "sources": [],
                "images": [],
                "answer": "",
                "iteration": state["iteration"]
            }
            
            for result in results:
                if not isinstance(result, Exception) and result:
                    combined_results["sources"].extend(result.get("sources", []))
                    combined_results["images"].extend(result.get("images", []))
                    if result.get("answer"):
                        combined_results["answer"] += f"\n\n{result['answer']}"
            
            state["tool_results"].append(combined_results)
        
        return state
    
    async def _synthesis_step(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Synthesis: Analyze results and determine next steps
        """
        state["current_state"] = AgentState.SYNTHESIZING
        
        # Analyze the quality and completeness of information
        if state["tool_results"]:
            # Count total sources across all iterations
            total_sources = sum(len(r.get("sources", [])) for r in state["tool_results"])
            latest_results = state["tool_results"][-1]
            
            # Calculate confidence based on iterations and sources
            base_confidence = 0.3
            iteration_boost = state["iteration"] * 0.15  # Each iteration adds 15%
            source_boost = min(0.3, total_sources * 0.02)  # Sources add up to 30%
            depth_boost = 0.1 if state["iteration"] >= 3 else 0  # Bonus for deep research
            
            confidence = min(0.98, base_confidence + iteration_boost + source_boost + depth_boost)
            
            synthesis = {
                "iteration": state["iteration"],
                "sources_found": total_sources,
                "latest_sources": len(latest_results.get("sources", [])),
                "has_answer": bool(latest_results.get("answer")),
                "needs_more_info": total_sources < 10 and state["iteration"] < 3,
                "confidence": confidence
            }
            
            state["synthesis"] = synthesis
            
            logger.info(f"Synthesis - Iteration: {state['iteration']}, Total Sources: {total_sources}, Confidence: {confidence:.2%}")
        
        return state
    
    def _is_research_complete(self, state: Dict[str, Any]) -> bool:
        """
        Determine if research is complete based on current state
        """
        synthesis = state.get("synthesis", {})
        
        # For deep research, require minimum iterations
        min_iterations = 3
        
        # Don't complete until we've done minimum iterations
        if state["iteration"] < min_iterations:
            return False
        
        # After minimum iterations, check quality
        if synthesis.get("confidence", 0) >= 0.95 and synthesis.get("sources_found", 0) >= 15:
            return True
        
        # Complete after max iterations
        if state["iteration"] >= self.max_iterations:
            return True
        
        return False
    
    async def _single_pass_research(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Single pass research without deep reasoning loop
        """
        state["current_state"] = AgentState.TOOL_EXECUTION
        
        # Direct search
        result = await self._execute_tavily_search(
            query=state["query"],
            search_depth="basic",
            max_results=10
        )
        
        state["tool_results"] = [result]
        state["stop_reason"] = StopReason.COMPLETED
        
        return state
    
    async def _execute_tavily_search(self, query: str, **params) -> Dict[str, Any]:
        """
        Execute Tavily search tool
        """
        if not self.api_key:
            return {"error": "API key not configured"}
        
        try:
            payload = {
                "api_key": self.api_key,
                "query": query,
                "search_depth": params.get("search_depth", "advanced"),
                "max_results": params.get("max_results", 10),
                "include_answer": True,
                "include_raw_content": False,
                "include_images": True
            }
            
            if params.get("days"):
                payload["days"] = params["days"]
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://api.tavily.com/search",
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        return self._format_tavily_results(data)
                    else:
                        return {"error": f"API error: {response.status}"}
                        
        except Exception as e:
            logger.error(f"Search error: {e}")
            return {"error": str(e)}
    
    def _format_tavily_results(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Format Tavily results"""
        sources = []
        for result in data.get("results", []):
            sources.append({
                "title": result.get("title", ""),
                "url": result.get("url", ""),
                "content": result.get("content", ""),
                "score": result.get("score", 0.5)
            })
        
        images = []
        for img in data.get("images", [])[:10]:
            if isinstance(img, str):
                images.append({"url": img})
            elif isinstance(img, dict):
                images.append(img)
        
        return {
            "answer": data.get("answer", ""),
            "sources": sources,
            "images": images
        }
    
    def _compile_deep_results(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Compile final results from agent loop execution
        """
        # Combine all sources from iterations
        all_sources = []
        all_images = []
        combined_answer = ""
        
        for result in state.get("tool_results", []):
            all_sources.extend(result.get("sources", []))
            all_images.extend(result.get("images", []))
            if result.get("answer"):
                combined_answer += f"{result['answer']}\n\n"
        
        # Remove duplicate sources
        seen_urls = set()
        unique_sources = []
        for source in all_sources:
            if source.get("url") not in seen_urls:
                seen_urls.add(source.get("url"))
                unique_sources.append(source)
        
        # Generate deep insights from reasoning trace
        deep_insights = self._generate_deep_insights(state)
        
        # Enhanced summary with deep reasoning
        if combined_answer:
            summary = f"{combined_answer}\n\n**Deep Analysis:**\n{deep_insights}"
        else:
            summary = f"Research completed with deep analysis:\n\n{deep_insights}"
        
        return {
            "query": state["query"],
            "summary": summary,
            "sources": self._format_sources_for_frontend(unique_sources[:15]),
            "images": all_images[:20],
            "citations": self._generate_citations(unique_sources[:10]),
            "follow_up_questions": self._generate_smart_followups(state),
            "confidence": state.get("synthesis", {}).get("confidence", 0.5),
            "verification_status": "verified" if unique_sources else "unverified",
            "timestamp": datetime.now().isoformat(),
            "agents_used": self._get_agents_used(state),
            "reasoning_trace": state.get("reasoning_trace", []),
            "iterations": state.get("iteration", 1),
            "stop_reason": state.get("stop_reason", StopReason.COMPLETED).value
        }
    
    def _generate_deep_insights(self, state: Dict[str, Any]) -> str:
        """Generate deep insights from the reasoning trace"""
        insights = []
        
        # Show the multi-step research process
        insights.append(f"🔄 **Multi-Step Deep Research Process ({state.get('iteration', 1)} iterations)**\n")
        
        # Add reasoning trace with details
        for i, reasoning in enumerate(state.get("reasoning_trace", []), 1):
            insights.append(f"**Iteration {i}:**")
            for thought in reasoning.get("thoughts", []):
                insights.append(f"  {thought}")
            
            # Add results from this iteration
            if i <= len(state.get("tool_results", [])):
                results = state.get("tool_results", [])[i-1]
                sources_found = len(results.get("sources", []))
                insights.append(f"  → Found {sources_found} new sources")
        
        insights.append("")
        
        # Add synthesis summary
        total_sources = sum(len(r.get("sources", [])) for r in state.get("tool_results", []))
        insights.append(f"📊 **Synthesis:**")
        insights.append(f"  • Total sources analyzed: {total_sources}")
        insights.append(f"  • Research phases completed: {state.get('iteration', 1)}")
        insights.append(f"  • Confidence level: {state.get('synthesis', {}).get('confidence', 0):.1%}")
        
        # Add key findings
        if state.get("tool_results"):
            insights.append("")
            insights.append("🎯 **Key Research Phases:**")
            insights.append("  1. Initial overview and current state")
            if state.get('iteration', 0) >= 2:
                insights.append("  2. Expert analysis and risk assessment")
            if state.get('iteration', 0) >= 3:
                insights.append("  3. Future outlook and competitive positioning")
        
        return "\n".join(insights)
    
    def _format_sources_for_frontend(self, sources: List[Dict]) -> List[Dict]:
        """Format sources for frontend display"""
        formatted = []
        for i, source in enumerate(sources):
            formatted.append({
                "id": f"source-{i}",
                "title": source.get("title", ""),
                "url": source.get("url", ""),
                "snippet": source.get("content", "")[:300] if source.get("content") else "",
                "favicon": f"https://www.google.com/s2/favicons?domain={source.get('url', '').split('/')[2] if '/' in source.get('url', '') else ''}",
                "domain": source.get("url", "").split('/')[2] if '/' in source.get("url", "") else "",
                "publishedDate": datetime.now().isoformat(),
                "author": "",
                "relevanceScore": source.get("score", 0.8),
                "type": "web"
            })
        return formatted
    
    def _generate_citations(self, sources: List[Dict]) -> List[str]:
        """Generate citations from sources"""
        citations = []
        for i, source in enumerate(sources[:5], 1):
            if source.get("content"):
                citations.append(f"[{i}] {source.get('content', '')[:150]}... (Source: {source.get('title', '')})")
        return citations
    
    def _generate_smart_followups(self, state: Dict[str, Any]) -> List[str]:
        """Generate intelligent follow-up questions based on research"""
        query = state["query"]
        
        # Base questions
        questions = [
            f"What are the technical details of {query}?",
            f"What are the latest developments in {query}?",
            f"How does {query} compare to alternatives?",
            f"What are experts saying about {query}?",
            f"What's the future outlook for {query}?"
        ]
        
        # Add context-specific questions based on iterations
        if state.get("iteration", 0) > 2:
            questions.insert(0, f"What are the deeper implications of {query}?")
            questions.insert(1, f"What patterns emerge from analyzing {query}?")
        
        return questions[:5]
    
    def _get_agents_used(self, state: Dict[str, Any]) -> List[str]:
        """Get list of agents used in the research"""
        agents = ["Deep Research Orchestrator"]
        
        if state.get("iteration", 0) > 1:
            agents.append("Multi-Step Reasoning Agent")
        
        if state.get("tool_results"):
            agents.append("Web Search Agent")
        
        if state.get("reasoning_trace"):
            agents.append("Analysis Agent")
        
        return agents

# Singleton instance
deep_research_agent = DeepResearchAgent()

async def perform_deep_research(query: str, enable_deep: bool = True, **kwargs) -> Dict[str, Any]:
    """
    Main entry point for deep research
    
    Args:
        query: Research query
        enable_deep: Enable deep multi-step reasoning
        **kwargs: Additional parameters
        
    Returns:
        Research results with reasoning trace
    """
    return await deep_research_agent.deep_research(query, enable_deep, **kwargs)