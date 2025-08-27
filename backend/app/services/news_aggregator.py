"""
Real-time News Aggregation Service with multiple news sources
"""
import asyncio
import aiohttp
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import json
import feedparser
from bs4 import BeautifulSoup
import hashlib

class NewsAggregatorService:
    def __init__(self):
        self.news_sources = {
            "newsapi": {
                "base_url": "https://newsapi.org/v2",
                "requires_key": True
            },
            "gdelt": {
                "base_url": "https://api.gdeltproject.org/api/v2/doc/doc",
                "requires_key": False
            },
            "mediastack": {
                "base_url": "http://api.mediastack.com/v1",
                "requires_key": True
            },
            "currents": {
                "base_url": "https://api.currentsapi.services/v1",
                "requires_key": True
            }
        }
        
        self.rss_feeds = {
            "reuters": "https://feeds.reuters.com/reuters/topNews",
            "bbc": "http://feeds.bbci.co.uk/news/rss.xml",
            "nyt": "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
            "guardian": "https://www.theguardian.com/world/rss",
            "ap": "https://feeds.apnews.com/rss/apf-topnews",
            "cnn": "http://rss.cnn.com/rss/cnn_topstories.rss",
            "techcrunch": "https://techcrunch.com/feed/",
            "wired": "https://www.wired.com/feed/rss",
            "ars": "https://feeds.arstechnica.com/arstechnica/index",
            "verge": "https://www.theverge.com/rss/index.xml"
        }
        
        self.cache = {}
        self.cache_duration = 300  # 5 minutes
        
    async def aggregate_news(
        self,
        query: str,
        categories: List[str] = ["general"],
        languages: List[str] = ["en"],
        max_results: int = 50,
        time_range: str = "24h"
    ) -> Dict[str, Any]:
        """Aggregate news from multiple sources"""
        
        # Check cache
        cache_key = self._generate_cache_key(query, categories, languages, time_range)
        if cache_key in self.cache:
            cached_data, timestamp = self.cache[cache_key]
            if datetime.now() - timestamp < timedelta(seconds=self.cache_duration):
                return cached_data
        
        # Parallel fetch from all sources
        tasks = [
            self.fetch_rss_feeds(query, categories),
            self.fetch_gdelt_news(query, time_range),
            self.fetch_newsapi_everything(query, languages, time_range),
            self.fetch_trending_topics(),
            self.fetch_breaking_news()
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Combine and deduplicate results
        all_articles = []
        for result in results:
            if not isinstance(result, Exception) and isinstance(result, list):
                all_articles.extend(result)
        
        # Deduplicate by title similarity
        unique_articles = self._deduplicate_articles(all_articles)
        
        # Sort by relevance and recency
        sorted_articles = sorted(
            unique_articles,
            key=lambda x: (x.get("relevance_score", 0.5), x.get("published_at", "")),
            reverse=True
        )[:max_results]
        
        # Group by category and source
        grouped_results = self._group_articles(sorted_articles)
        
        # Generate summary statistics
        stats = self._generate_stats(sorted_articles)
        
        result = {
            "query": query,
            "total_articles": len(sorted_articles),
            "articles": sorted_articles,
            "grouped": grouped_results,
            "stats": stats,
            "trending_topics": await self.fetch_trending_topics(),
            "timestamp": datetime.now().isoformat()
        }
        
        # Cache the result
        self.cache[cache_key] = (result, datetime.now())
        
        return result
    
    async def fetch_rss_feeds(self, query: str, categories: List[str]) -> List[Dict]:
        """Fetch news from RSS feeds"""
        articles = []
        query_lower = query.lower()
        
        for source, feed_url in self.rss_feeds.items():
            try:
                feed = await self._parse_feed_async(feed_url)
                
                for entry in feed.entries[:20]:  # Limit per feed
                    # Check if article matches query
                    title = entry.get("title", "").lower()
                    summary = entry.get("summary", "").lower()
                    
                    if query_lower in title or query_lower in summary:
                        article = {
                            "id": hashlib.md5(entry.get("link", "").encode()).hexdigest(),
                            "title": entry.get("title"),
                            "description": self._clean_html(entry.get("summary", "")),
                            "url": entry.get("link"),
                            "source": source.upper(),
                            "author": entry.get("author"),
                            "published_at": self._parse_date(entry.get("published_parsed")),
                            "category": self._determine_category(entry),
                            "relevance_score": self._calculate_relevance(query_lower, title, summary),
                            "image_url": self._extract_image(entry),
                            "type": "rss"
                        }
                        articles.append(article)
            except Exception as e:
                print(f"Error fetching RSS from {source}: {e}")
                continue
        
        return articles
    
    async def fetch_gdelt_news(self, query: str, time_range: str) -> List[Dict]:
        """Fetch news from GDELT Project"""
        async with aiohttp.ClientSession() as session:
            params = {
                "query": query,
                "mode": "artlist",
                "format": "json",
                "maxrecords": 50,
                "timespan": time_range,
                "sort": "hybridrel"
            }
            
            try:
                async with session.get(
                    f"{self.news_sources['gdelt']['base_url']}",
                    params=params
                ) as response:
                    if response.status != 200:
                        return []
                    
                    data = await response.json()
                    articles = []
                    
                    for article in data.get("articles", []):
                        articles.append({
                            "id": hashlib.md5(article.get("url", "").encode()).hexdigest(),
                            "title": article.get("title"),
                            "description": article.get("seendate", ""),
                            "url": article.get("url"),
                            "source": article.get("domain", "GDELT"),
                            "published_at": article.get("seendate"),
                            "category": "general",
                            "relevance_score": float(article.get("sourcelang", 0.5)),
                            "image_url": article.get("socialimage"),
                            "type": "gdelt"
                        })
                    
                    return articles
            except Exception as e:
                print(f"Error fetching GDELT news: {e}")
                return []
    
    async def fetch_newsapi_everything(
        self,
        query: str,
        languages: List[str],
        time_range: str
    ) -> List[Dict]:
        """Fetch news from NewsAPI (requires API key)"""
        # This would require an API key in production
        # Placeholder for NewsAPI integration
        return []
    
    async def fetch_trending_topics(self) -> List[Dict]:
        """Fetch trending topics from various sources"""
        topics = []
        
        # Fetch from Google Trends (unofficial)
        try:
            async with aiohttp.ClientSession() as session:
                # This would integrate with Google Trends API
                # Placeholder for trending topics
                topics = [
                    {"topic": "AI Research", "volume": 95000, "trend": "rising"},
                    {"topic": "Climate Summit", "volume": 82000, "trend": "stable"},
                    {"topic": "Tech Layoffs", "volume": 67000, "trend": "falling"},
                    {"topic": "Space Exploration", "volume": 54000, "trend": "rising"},
                    {"topic": "Quantum Computing", "volume": 41000, "trend": "rising"}
                ]
        except Exception as e:
            print(f"Error fetching trending topics: {e}")
        
        return topics
    
    async def fetch_breaking_news(self) -> List[Dict]:
        """Fetch breaking news from multiple sources"""
        breaking = []
        
        # Check RSS feeds for breaking news indicators
        for source, feed_url in list(self.rss_feeds.items())[:5]:  # Top sources
            try:
                feed = await self._parse_feed_async(feed_url)
                
                for entry in feed.entries[:5]:  # Recent entries only
                    title = entry.get("title", "").lower()
                    # Check for breaking news indicators
                    if any(word in title for word in ["breaking", "urgent", "alert", "just in"]):
                        breaking.append({
                            "id": hashlib.md5(entry.get("link", "").encode()).hexdigest(),
                            "title": entry.get("title"),
                            "url": entry.get("link"),
                            "source": source.upper(),
                            "published_at": self._parse_date(entry.get("published_parsed")),
                            "is_breaking": True
                        })
            except Exception:
                continue
        
        return breaking
    
    async def monitor_topics(
        self,
        topics: List[str],
        callback: callable,
        interval: int = 60
    ):
        """Monitor topics for new articles in real-time"""
        previous_articles = {}
        
        while True:
            for topic in topics:
                current_articles = await self.aggregate_news(topic, max_results=10)
                
                if topic in previous_articles:
                    # Find new articles
                    previous_ids = {a["id"] for a in previous_articles[topic]}
                    current_ids = {a["id"] for a in current_articles["articles"]}
                    new_ids = current_ids - previous_ids
                    
                    if new_ids:
                        new_articles = [
                            a for a in current_articles["articles"]
                            if a["id"] in new_ids
                        ]
                        await callback(topic, new_articles)
                
                previous_articles[topic] = current_articles["articles"]
            
            await asyncio.sleep(interval)
    
    def _generate_cache_key(self, query: str, categories: List[str], languages: List[str], time_range: str) -> str:
        """Generate cache key for request"""
        key_string = f"{query}_{','.join(categories)}_{','.join(languages)}_{time_range}"
        return hashlib.md5(key_string.encode()).hexdigest()
    
    def _deduplicate_articles(self, articles: List[Dict]) -> List[Dict]:
        """Remove duplicate articles based on title similarity"""
        seen_titles = set()
        unique = []
        
        for article in articles:
            title = article.get("title", "").lower()
            # Simple deduplication - in production, use fuzzy matching
            title_hash = hashlib.md5(title[:50].encode()).hexdigest()
            
            if title_hash not in seen_titles:
                seen_titles.add(title_hash)
                unique.append(article)
        
        return unique
    
    def _group_articles(self, articles: List[Dict]) -> Dict[str, List[Dict]]:
        """Group articles by category and source"""
        grouped = {
            "by_category": {},
            "by_source": {},
            "by_date": {}
        }
        
        for article in articles:
            # By category
            category = article.get("category", "general")
            if category not in grouped["by_category"]:
                grouped["by_category"][category] = []
            grouped["by_category"][category].append(article)
            
            # By source
            source = article.get("source", "unknown")
            if source not in grouped["by_source"]:
                grouped["by_source"][source] = []
            grouped["by_source"][source].append(article)
            
            # By date
            pub_date = article.get("published_at", "")
            if pub_date:
                date_key = pub_date[:10]  # YYYY-MM-DD
                if date_key not in grouped["by_date"]:
                    grouped["by_date"][date_key] = []
                grouped["by_date"][date_key].append(article)
        
        return grouped
    
    def _generate_stats(self, articles: List[Dict]) -> Dict[str, Any]:
        """Generate statistics about the articles"""
        if not articles:
            return {}
        
        sources = {}
        categories = {}
        
        for article in articles:
            # Count sources
            source = article.get("source", "unknown")
            sources[source] = sources.get(source, 0) + 1
            
            # Count categories
            category = article.get("category", "general")
            categories[category] = categories.get(category, 0) + 1
        
        return {
            "total_articles": len(articles),
            "unique_sources": len(sources),
            "top_sources": sorted(sources.items(), key=lambda x: x[1], reverse=True)[:5],
            "categories": categories,
            "average_relevance": sum(a.get("relevance_score", 0) for a in articles) / len(articles),
            "date_range": {
                "earliest": min(a.get("published_at", "") for a in articles if a.get("published_at")),
                "latest": max(a.get("published_at", "") for a in articles if a.get("published_at"))
            }
        }
    
    async def _parse_feed_async(self, feed_url: str) -> Any:
        """Parse RSS feed asynchronously"""
        async with aiohttp.ClientSession() as session:
            async with session.get(feed_url) as response:
                content = await response.text()
                return feedparser.parse(content)
    
    def _clean_html(self, text: str) -> str:
        """Remove HTML tags from text"""
        if not text:
            return ""
        soup = BeautifulSoup(text, "html.parser")
        return soup.get_text().strip()
    
    def _parse_date(self, date_tuple) -> str:
        """Parse date from RSS feed format"""
        if not date_tuple:
            return datetime.now().isoformat()
        try:
            dt = datetime(*date_tuple[:6])
            return dt.isoformat()
        except:
            return datetime.now().isoformat()
    
    def _determine_category(self, entry: Dict) -> str:
        """Determine article category from entry"""
        # Simple keyword-based categorization
        text = f"{entry.get('title', '')} {entry.get('summary', '')}".lower()
        
        categories = {
            "technology": ["tech", "software", "ai", "computer", "digital", "cyber"],
            "business": ["business", "economy", "market", "finance", "stock", "trade"],
            "politics": ["politics", "election", "government", "policy", "congress", "senate"],
            "science": ["science", "research", "study", "discovery", "experiment"],
            "health": ["health", "medical", "disease", "treatment", "covid", "vaccine"],
            "sports": ["sports", "game", "match", "player", "team", "championship"],
            "entertainment": ["movie", "music", "celebrity", "film", "actor", "singer"]
        }
        
        for category, keywords in categories.items():
            if any(keyword in text for keyword in keywords):
                return category
        
        return "general"
    
    def _calculate_relevance(self, query: str, title: str, summary: str) -> float:
        """Calculate relevance score for article"""
        score = 0.0
        
        # Exact match in title
        if query in title:
            score += 0.5
        
        # Exact match in summary
        if query in summary:
            score += 0.3
        
        # Word matches
        query_words = query.split()
        for word in query_words:
            if word in title:
                score += 0.1
            if word in summary:
                score += 0.05
        
        return min(1.0, score)
    
    def _extract_image(self, entry: Dict) -> Optional[str]:
        """Extract image URL from RSS entry"""
        # Check for media content
        if hasattr(entry, "media_content"):
            for media in entry.media_content:
                if media.get("type", "").startswith("image"):
                    return media.get("url")
        
        # Check for enclosures
        if hasattr(entry, "enclosures"):
            for enclosure in entry.enclosures:
                if enclosure.get("type", "").startswith("image"):
                    return enclosure.get("href")
        
        return None