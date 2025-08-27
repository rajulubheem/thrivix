"""
Simple Research Agent with mock data for demonstration
"""
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import asyncio
import random

logger = logging.getLogger(__name__)

class SimpleResearchAgent:
    """
    Simple Research Agent that provides realistic mock data
    """
    
    async def research(self, query: str, **kwargs) -> Dict[str, Any]:
        """
        Perform mock research with realistic data
        """
        logger.info(f"Starting research for: {query}")
        
        # Simulate processing time
        await asyncio.sleep(0.5)
        
        # Generate realistic mock data based on query
        sources = self._generate_sources(query)
        summary = self._generate_summary(query, sources)
        images = self._generate_images(query)
        citations = self._generate_citations(sources)
        
        return {
            "query": query,
            "summary": summary,
            "sources": sources,
            "images": images,
            "citations": citations,
            "follow_up_questions": [
                f"What are the latest developments in {query}?",
                f"How does {query} impact the industry?",
                f"What are the key challenges in {query}?",
                f"Who are the leading researchers in {query}?",
                f"What's the future outlook for {query}?"
            ],
            "confidence": 0.92,
            "verification_status": "verified",
            "timestamp": datetime.now().isoformat(),
            "agents_used": ["Web Research Agent", "Analysis Agent", "Citation Agent"]
        }
    
    def _generate_sources(self, query: str) -> List[Dict[str, Any]]:
        """Generate realistic mock sources"""
        domains = [
            ("OpenAI Blog", "openai.com", "Leading AI research organization"),
            ("MIT Technology Review", "technologyreview.com", "In-depth technology analysis"),
            ("Nature AI", "nature.com", "Scientific research and discoveries"),
            ("ArXiv", "arxiv.org", "Latest research papers"),
            ("Google AI Blog", "ai.googleblog.com", "Google's AI research updates"),
            ("DeepMind", "deepmind.com", "Advanced AI research"),
            ("Stanford AI Lab", "ai.stanford.edu", "Academic research and education"),
            ("IEEE Spectrum", "spectrum.ieee.org", "Engineering and technology insights")
        ]
        
        sources = []
        for i, (name, domain, desc) in enumerate(random.sample(domains, min(6, len(domains)))):
            sources.append({
                "id": f"source-{i}",
                "title": f"{name}: {query.title()} - Latest Research and Developments",
                "url": f"https://{domain}/articles/{query.lower().replace(' ', '-')}-2024",
                "snippet": f"{desc}. Recent breakthroughs in {query} have shown significant progress in understanding and implementing advanced techniques. Researchers have demonstrated new approaches that improve performance by up to 40% compared to previous methods...",
                "favicon": f"https://{domain}/favicon.ico",
                "domain": domain,
                "publishedDate": datetime.now().isoformat(),
                "author": f"{name} Research Team",
                "relevanceScore": 0.85 + (i * 0.02),
                "type": "web"
            })
        
        return sources
    
    def _generate_summary(self, query: str, sources: List[Dict]) -> str:
        """Generate a realistic summary"""
        return f"""Recent advances in {query} have marked a significant milestone in the field. Leading researchers from institutions including MIT, Stanford, and DeepMind have reported breakthrough developments that are reshaping our understanding of the technology.

Key highlights include:
• Performance improvements of 30-40% over previous state-of-the-art methods
• New architectural designs that reduce computational requirements by 60%
• Novel applications in healthcare, finance, and scientific research
• Enhanced interpretability and explainability features

The research community has responded enthusiastically, with over {len(sources)} major publications and ongoing projects exploring these innovations. Industry leaders are already implementing these advances in production systems, demonstrating real-world impact and scalability."""
    
    def _generate_images(self, query: str) -> List[Dict[str, Any]]:
        """Generate mock image results"""
        images = []
        image_topics = [
            "architecture diagram", "performance chart", "research timeline",
            "comparison graph", "workflow illustration", "concept visualization"
        ]
        
        for i, topic in enumerate(random.sample(image_topics, min(4, len(image_topics)))):
            images.append({
                "url": f"https://images.example.com/{query.lower().replace(' ', '-')}-{topic.replace(' ', '-')}.png",
                "title": f"{query.title()} - {topic.title()}",
                "thumbnail": f"https://images.example.com/thumb/{query.lower().replace(' ', '-')}-{i}.jpg",
                "source": random.choice(["MIT", "Stanford", "OpenAI", "Google Research"]),
                "width": 1920,
                "height": 1080
            })
        
        return images
    
    def _generate_citations(self, sources: List[Dict]) -> List[str]:
        """Generate citations from sources"""
        citations = []
        for i, source in enumerate(sources[:5], 1):
            snippet = source['snippet'][:150]
            citations.append(f"[{i}] {snippet}... (Source: {source['domain']})")
        return citations

# Create singleton instance
research_agent = SimpleResearchAgent()

async def perform_research(query: str, **kwargs) -> Dict[str, Any]:
    """
    Main entry point for research requests
    """
    return await research_agent.research(query, **kwargs)