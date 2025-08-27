"""
Real Web Search Agent using Tavily API
"""
import os
import aiohttp
import asyncio
from typing import Dict, Any, List
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class RealWebSearchAgent:
    def __init__(self):
        # Load API key directly from .env file
        from dotenv import load_dotenv
        load_dotenv()
        self.api_key = os.getenv("TAVILY_API_KEY") or "REMOVED_API_KEY"
        
    async def search(self, query: str, **kwargs) -> Dict[str, Any]:
        """Perform real web search using Tavily API"""
        
        if not self.api_key:
            return self._fallback_response(query, "API key not configured")
        
        try:
            # Prepare the request
            payload = {
                "api_key": self.api_key,
                "query": query,
                "search_depth": kwargs.get("search_depth", "advanced"),
                "max_results": kwargs.get("max_results", 10),
                "include_answer": True,
                "include_raw_content": False,
                "include_images": True,
                "include_domains": [],
                "exclude_domains": []
            }
            
            # Add news-specific parameters for news queries
            if "news" in query.lower() or "latest" in query.lower():
                payload["days"] = 7  # Last 7 days for news
            
            logger.info(f"Searching Tavily for: {query}")
            
            # Make the API request
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://api.tavily.com/search",
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        return self._format_results(query, data)
                    else:
                        error_text = await response.text()
                        logger.error(f"Tavily API error: {response.status} - {error_text}")
                        return self._fallback_response(query, f"API error: {response.status}")
                        
        except asyncio.TimeoutError:
            logger.error("Tavily API timeout")
            return self._fallback_response(query, "Search timeout")
        except Exception as e:
            logger.error(f"Search error: {e}")
            return self._fallback_response(query, str(e))
    
    def _format_results(self, query: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Format Tavily results for the frontend"""
        
        # Extract the main answer
        answer = data.get("answer", f"Search results for: {query}")
        
        # Format sources
        sources = []
        results = data.get("results", [])
        
        for i, result in enumerate(results):
            sources.append({
                "id": f"source-{i}",
                "title": result.get("title", ""),
                "url": result.get("url", ""),
                "snippet": result.get("content", "")[:300] if result.get("content") else "",
                "favicon": f"https://www.google.com/s2/favicons?domain={result.get('url', '').split('/')[2] if '/' in result.get('url', '') else ''}",
                "domain": result.get("url", "").split('/')[2] if '/' in result.get("url", "") else "",
                "publishedDate": result.get("published_date", datetime.now().isoformat()),
                "author": "",
                "relevanceScore": result.get("score", 0.8),
                "type": "web"
            })
        
        # Extract images
        images = []
        for img in data.get("images", [])[:10]:
            # Handle both string URLs and dict objects
            if isinstance(img, str):
                images.append({
                    "url": img,
                    "title": "",
                    "thumbnail": img,
                    "source": "",
                    "width": 800,
                    "height": 600
                })
            elif isinstance(img, dict):
                images.append({
                    "url": img.get("url", ""),
                    "title": img.get("title", ""),
                    "thumbnail": img.get("url", ""),
                    "source": img.get("source", ""),
                    "width": 800,
                    "height": 600
                })
        
        # Generate citations
        citations = []
        for i, result in enumerate(results[:5]):
            if result.get("content"):
                citations.append(f"[{i+1}] {result.get('content', '')[:150]}... (Source: {result.get('title', '')})")
        
        # Generate follow-up questions based on the query
        follow_up_questions = self._generate_follow_up_questions(query)
        
        return {
            "query": query,
            "summary": answer,
            "sources": sources,
            "images": images,
            "citations": citations,
            "follow_up_questions": follow_up_questions,
            "confidence": 0.95 if sources else 0.3,
            "verification_status": "verified" if sources else "unverified",
            "timestamp": datetime.now().isoformat(),
            "agents_used": ["Tavily Web Search"]
        }
    
    def _generate_follow_up_questions(self, query: str) -> List[str]:
        """Generate relevant follow-up questions"""
        
        # For Tesla-specific queries
        if "tesla" in query.lower() or "tsla" in query.lower():
            return [
                "What is Tesla's current stock price and market cap?",
                "What are analysts saying about Tesla's future?",
                "How is Tesla performing compared to other EV manufacturers?",
                "What are Tesla's latest vehicle delivery numbers?",
                "What is Elon Musk's latest statement about Tesla?"
            ]
        
        # For news queries
        if "news" in query.lower() or "latest" in query.lower():
            return [
                f"What happened with {query} in the last 24 hours?",
                f"What are experts saying about {query}?",
                f"How does {query} compare to previous events?",
                f"What's the market reaction to {query}?",
                f"What are the implications of {query}?"
            ]
        
        # Generic questions
        return [
            f"What are the latest developments in {query}?",
            f"How does {query} impact the market?",
            f"What are experts saying about {query}?",
            f"What's the historical context of {query}?",
            f"What are the future predictions for {query}?"
        ]
    
    def _fallback_response(self, query: str, error: str) -> Dict[str, Any]:
        """Fallback response when search fails"""
        return {
            "query": query,
            "summary": f"Unable to fetch real-time results for '{query}'. Error: {error}. Please try again.",
            "sources": [],
            "images": [],
            "citations": [],
            "follow_up_questions": self._generate_follow_up_questions(query),
            "confidence": 0.1,
            "verification_status": "error",
            "timestamp": datetime.now().isoformat(),
            "agents_used": ["Tavily Web Search (Error)"]
        }

# Singleton instance
search_agent = RealWebSearchAgent()

async def perform_research(query: str, **kwargs) -> Dict[str, Any]:
    """Main entry point for research"""
    return await search_agent.search(query, **kwargs)