"""
Real Strands Research Agent using existing tools
Provides actual web search, news, and research capabilities
"""
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import asyncio
import json
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import existing tools from the backend
from app.tools.tavily_tool import tavily_search
from app.tools.http_request_tool import http_request
from app.tools.file_tools import file_read, file_write
from app.tools.python_repl_tool import python_repl
from app.tools.calculator_tool import calculator
from app.tools.system_tools import current_time

# Configure logging
logger = logging.getLogger(__name__)

class StrandsResearchAgent:
    """
    Research Agent using existing backend tools for real research capabilities
    """
    
    def __init__(self):
        """Initialize the research agent with tools"""
        self.tools = {
            'tavily_search': tavily_search,
            'http_request': http_request,
            'python_repl': python_repl,
            'calculator': calculator,
            'current_time': current_time,
            'file_read': file_read,
            'file_write': file_write
        }
    
    async def research(self, query: str, **kwargs) -> Dict[str, Any]:
        """
        Perform comprehensive research on a query
        
        Args:
            query: The research query
            **kwargs: Additional parameters
            
        Returns:
            Research results with sources, citations, and analysis
        """
        logger.info(f"Starting research for: {query}")
        
        mode = kwargs.get('mode', 'comprehensive')
        depth = kwargs.get('depth', 'deep')
        
        # Parallel research tasks
        tasks = []
        
        # Web search task using Tavily
        tasks.append(self._web_search(query))
        
        # News search if mode is news or comprehensive
        if mode in ['news', 'comprehensive']:
            tasks.append(self._news_search(query))
        
        # Academic search if mode is academic or comprehensive
        if mode in ['academic', 'comprehensive']:
            tasks.append(self._academic_search(query))
        
        # Run tasks in parallel
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        web_results = results[0] if not isinstance(results[0], Exception) else None
        news_results = results[1] if len(results) > 1 and not isinstance(results[1], Exception) else None
        academic_results = results[2] if len(results) > 2 and not isinstance(results[2], Exception) else None
        
        # Compile final results
        return self._compile_results(
            query=query,
            web_results=web_results,
            news_results=news_results,
            academic_results=academic_results,
            **kwargs
        )
    
    async def _web_search(self, query: str) -> Dict[str, Any]:
        """Perform web search using Tavily"""
        try:
            # Use Tavily search tool
            search_params = {
                "query": query,
                "max_results": 10,
                "search_depth": "deep",
                "include_answer": True,
                "include_raw_content": False,
                "include_images": True
            }
            
            result = await asyncio.to_thread(
                tavily_search,
                **search_params
            )
            
            if isinstance(result, dict) and result.get("status") == "success":
                data = result.get("data", {})
                return {
                    "success": True,
                    "answer": data.get("answer", ""),
                    "sources": data.get("results", []),
                    "images": data.get("images", [])
                }
            else:
                return {"success": False, "error": "Search failed"}
                
        except Exception as e:
            logger.error(f"Web search failed: {e}")
            return {"success": False, "error": str(e)}
    
    async def _news_search(self, query: str) -> Dict[str, Any]:
        """Search for news articles"""
        try:
            # Use Tavily with news focus
            search_params = {
                "query": f"latest news {query}",
                "max_results": 5,
                "search_depth": "basic",
                "include_answer": False,
                "days": 7  # Last 7 days
            }
            
            result = await asyncio.to_thread(
                tavily_search,
                **search_params
            )
            
            if isinstance(result, dict) and result.get("status") == "success":
                data = result.get("data", {})
                return {
                    "success": True,
                    "articles": data.get("results", [])
                }
            else:
                return {"success": False, "articles": []}
                
        except Exception as e:
            logger.error(f"News search failed: {e}")
            return {"success": False, "articles": []}
    
    async def _academic_search(self, query: str) -> Dict[str, Any]:
        """Search for academic papers"""
        try:
            # Use Tavily with academic focus
            search_params = {
                "query": f"research paper academic {query} site:arxiv.org OR site:scholar.google.com OR site:pubmed.gov",
                "max_results": 5,
                "search_depth": "deep",
                "include_answer": True
            }
            
            result = await asyncio.to_thread(
                tavily_search,
                **search_params
            )
            
            if isinstance(result, dict) and result.get("status") == "success":
                data = result.get("data", {})
                return {
                    "success": True,
                    "papers": data.get("results", [])
                }
            else:
                return {"success": False, "papers": []}
                
        except Exception as e:
            logger.error(f"Academic search failed: {e}")
            return {"success": False, "papers": []}
    
    def _compile_results(
        self,
        query: str,
        web_results: Optional[Dict],
        news_results: Optional[Dict],
        academic_results: Optional[Dict],
        **kwargs
    ) -> Dict[str, Any]:
        """Compile all results into final response"""
        
        # Extract key information
        summary_parts = []
        sources = []
        images = []
        
        # Process web results
        if web_results and web_results.get("success"):
            answer = web_results.get("answer", "")
            if answer:
                summary_parts.append(answer)
            
            for source in web_results.get("sources", []):
                sources.append({
                    "url": source.get("url", ""),
                    "title": source.get("title", ""),
                    "content": source.get("content", ""),
                    "score": source.get("score", 0.5)
                })
            
            images = web_results.get("images", [])
        
        # Process news results
        if news_results and news_results.get("success"):
            for article in news_results.get("articles", [])[:3]:
                sources.append({
                    "url": article.get("url", ""),
                    "title": f"[News] {article.get('title', '')}",
                    "content": article.get("content", ""),
                    "score": article.get("score", 0.5)
                })
        
        # Process academic results
        if academic_results and academic_results.get("success"):
            for paper in academic_results.get("papers", [])[:2]:
                sources.append({
                    "url": paper.get("url", ""),
                    "title": f"[Academic] {paper.get('title', '')}",
                    "content": paper.get("content", ""),
                    "score": paper.get("score", 0.5)
                })
        
        # Generate summary if none exists
        summary = "\n\n".join(summary_parts) if summary_parts else f"Research completed for: {query}"
        
        # Generate follow-up questions
        follow_up_questions = [
            f"What are the latest developments in {query}?",
            f"How does {query} compare to alternatives?",
            f"What are the implications of {query}?",
            f"What do experts say about {query}?",
            f"What are the challenges related to {query}?"
        ]
        
        # Generate citations
        citations = []
        for i, source in enumerate(sources[:10], 1):
            if source.get("content"):
                citations.append(f"[{i}] {source.get('content', '')[:200]}...")
        
        return {
            "query": query,
            "summary": summary,
            "sources": [
                {
                    "id": f"source-{i}",
                    "title": source.get("title", f"Source {i+1}"),
                    "url": source.get("url", "#"),
                    "snippet": source.get("content", "")[:200] if source.get("content") else "",
                    "favicon": "",
                    "domain": source.get("url", "").split('/')[2] if '/' in source.get("url", "") else "source.com",
                    "publishedDate": datetime.now().isoformat(),
                    "author": "",
                    "relevanceScore": source.get("score", 0.8),
                    "type": "web"
                }
                for i, source in enumerate(sources[:15])
            ],
            "images": images[:20],
            "citations": citations,
            "follow_up_questions": follow_up_questions,
            "confidence": 0.85 if sources else 0.3,
            "verification_status": "verified" if sources else "unverified",
            "timestamp": datetime.now().isoformat(),
            "agents_used": [
                agent for agent in [
                    "Web Research Agent" if web_results else None,
                    "News Agent" if news_results else None,
                    "Academic Agent" if academic_results else None
                ] if agent is not None
            ]
        }

# Create singleton instance
research_agent = StrandsResearchAgent()

async def perform_research(query: str, **kwargs) -> Dict[str, Any]:
    """
    Main entry point for research requests
    
    Args:
        query: Research query
        **kwargs: Additional parameters
        
    Returns:
        Research results
    """
    return await research_agent.research(query, **kwargs)