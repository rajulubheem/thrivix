"""
Real Research Routes using Strands Agents
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime
import asyncio
import logging

# Import research agents
from app.agents.real_web_search import perform_research as standard_research
from app.agents.true_deep_research import perform_true_deep_research

router = APIRouter(prefix="/research", tags=["research"])
logger = logging.getLogger(__name__)

class ResearchRequest(BaseModel):
    query: str
    mode: str = "comprehensive"
    depth: str = "deep" 
    max_agents: int = 50
    include_images: bool = True
    include_citations: bool = True
    verify_facts: bool = True
    enable_deep_research: bool = False  # Toggle for deep research with agent loop

@router.post("/search")
async def search_research(request: ResearchRequest):
    """Perform real research using Strands agents"""
    try:
        logger.info(f"Research request received: {request.query}")
        
        # Use true deep research if enabled, otherwise standard research
        if request.enable_deep_research:
            research_results = await perform_true_deep_research(
                query=request.query,
                enable_deep=True
            )
        else:
            research_results = await standard_research(
                query=request.query,
                mode=request.mode,
                depth=request.depth
            )
        
        # Transform results to match frontend expectations
        transformed_results = {
            "summary": research_results.get("summary", ""),
            "sources": [
                {
                    "id": f"source-{i}",
                    "title": source.get("title", f"Source {i+1}"),
                    "url": source.get("url", "#"),
                    "snippet": source.get("snippet", source.get("content", ""))[:200] if source.get("snippet") or source.get("content") else "",
                    "favicon": "",
                    "domain": source.get("url", "").split('/')[2] if '/' in source.get("url", "") else "source.com",
                    "publishedDate": datetime.now().isoformat(),
                    "author": "",
                    "relevanceScore": source.get("relevance_score", 0.8),
                    "type": "web"
                }
                for i, source in enumerate(research_results.get("sources", []))
            ],
            "images": [],  # Will implement image search separately
            "citations": [
                {
                    "id": f"cite-{i}",
                    "text": citation.replace(f"[{i+1}]", "").strip(),
                    "sourceId": f"source-{i}",
                    "confidence": 0.9
                }
                for i, citation in enumerate(research_results.get("citations", []))
            ],
            "follow_up_questions": research_results.get("follow_up_questions", []),
            "confidence": research_results.get("confidence", 0.85),
            "verification_status": research_results.get("verification_status", "verified"),
            "agent_results": [
                {"agent": agent, "status": "completed"}
                for agent in research_results.get("agents_used", [])
            ]
        }
        
        return {
            "success": True,
            "data": transformed_results,
            "metadata": {
                "query": request.query,
                "mode": request.mode,
                "agents_used": len(research_results.get("agents_used", [])),
                "timestamp": datetime.now().isoformat()
            }
        }
        
    except Exception as e:
        logger.error(f"Research failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/images")
async def search_images(query: str, count: int = 20):
    """Search for images (using web search for now)"""
    try:
        # For now, return empty results
        # TODO: Implement actual image search
        return {
            "success": True,
            "data": {"images": []},
            "total": 0
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/academic")
async def search_academic(query: str, max_results: int = 20):
    """Search academic papers"""
    try:
        # Use research agent with academic focus
        research_results = await perform_research(
            query=f"academic research papers about {query}",
            mode="academic"
        )
        
        papers = []
        for i, source in enumerate(research_results.get("sources", [])):
            papers.append({
                "id": f"paper-{i}",
                "title": source.get("title", f"Paper: {query}"),
                "abstract": research_results.get("summary", "")[:300],
                "authors": ["Research Team"],
                "year": datetime.now().year,
                "citation_count": 0,
                "source": "Academic Search",
                "relevance_score": source.get("relevance_score", 0.8)
            })
        
        return {
            "success": True,
            "data": {
                "papers": papers,
                "total": len(papers)
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/news")
async def search_news(query: str, time_range: str = "24h"):
    """Search news articles"""
    try:
        # Use research agent with news focus
        research_results = await perform_research(
            query=f"latest news about {query}",
            mode="news"
        )
        
        articles = []
        for i, source in enumerate(research_results.get("sources", [])):
            articles.append({
                "id": f"news-{i}",
                "title": source.get("title", f"News: {query}"),
                "description": research_results.get("summary", "")[:200],
                "url": source.get("url", "#"),
                "source": source.get("title", "News Source"),
                "published_at": datetime.now().isoformat(),
                "category": "general",
                "relevance_score": source.get("relevance_score", 0.8)
            })
        
        return {
            "success": True,
            "data": {
                "articles": articles,
                "total": len(articles),
                "trending_topics": []
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/trending")
async def get_trending_topics():
    """Get trending topics"""
    try:
        # TODO: Implement actual trending topics
        return {
            "success": True,
            "data": [
                {"topic": "AI Research", "volume": 95000, "trend": "rising"},
                {"topic": "Climate Change", "volume": 82000, "trend": "stable"},
                {"topic": "Technology", "volume": 75000, "trend": "rising"}
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))