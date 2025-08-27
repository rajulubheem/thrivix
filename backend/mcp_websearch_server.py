#!/usr/bin/env python3
"""
Web Search MCP Server for Swarm Collaboration
Provides web search and scraping capabilities for agents
"""
from mcp.server import FastMCP
from typing import Dict, Any, List, Optional
import requests
from bs4 import BeautifulSoup
import json
import structlog
from urllib.parse import quote_plus, urlparse

logger = structlog.get_logger()

# Create MCP server
mcp = FastMCP("Web Search Server")

@mcp.tool(description="Search the web using DuckDuckGo")
def web_search(query: str, max_results: int = 5) -> Dict[str, Any]:
    """Search the web and return results"""
    try:
        # Use DuckDuckGo HTML version (no API key needed)
        search_url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        response = requests.get(search_url, headers=headers, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        results = []
        for result in soup.find_all('div', class_='result')[:max_results]:
            title_elem = result.find('a', class_='result__a')
            snippet_elem = result.find('a', class_='result__snippet')
            
            if title_elem:
                results.append({
                    'title': title_elem.get_text(strip=True),
                    'url': title_elem.get('href', ''),
                    'snippet': snippet_elem.get_text(strip=True) if snippet_elem else ''
                })
        
        return {
            'query': query,
            'count': len(results),
            'results': results
        }
    except Exception as e:
        return {'error': str(e)}

@mcp.tool(description="Fetch and extract content from a webpage")
def fetch_webpage(url: str, extract_text: bool = True, extract_links: bool = False) -> Dict[str, Any]:
    """Fetch a webpage and extract its content"""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        result = {
            'url': url,
            'title': soup.title.string if soup.title else '',
            'status_code': response.status_code
        }
        
        if extract_text:
            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()
            
            # Get text content
            text = soup.get_text()
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text = ' '.join(chunk for chunk in chunks if chunk)
            
            result['text'] = text[:5000]  # Limit to 5000 chars
            result['text_length'] = len(text)
        
        if extract_links:
            links = []
            for link in soup.find_all('a', href=True)[:20]:  # Limit to 20 links
                links.append({
                    'text': link.get_text(strip=True),
                    'url': link['href']
                })
            result['links'] = links
        
        return result
    except Exception as e:
        return {'error': str(e)}

@mcp.tool(description="Extract structured data from a webpage")
def extract_metadata(url: str) -> Dict[str, Any]:
    """Extract metadata and structured data from a webpage"""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        metadata = {
            'url': url,
            'title': soup.title.string if soup.title else '',
        }
        
        # Extract meta tags
        meta_tags = {}
        for meta in soup.find_all('meta'):
            if meta.get('name'):
                meta_tags[meta.get('name')] = meta.get('content', '')
            elif meta.get('property'):
                meta_tags[meta.get('property')] = meta.get('content', '')
        
        metadata['meta_tags'] = meta_tags
        
        # Extract headers
        headers = {
            'h1': [h.get_text(strip=True) for h in soup.find_all('h1')[:5]],
            'h2': [h.get_text(strip=True) for h in soup.find_all('h2')[:5]],
        }
        metadata['headers'] = headers
        
        # Extract images
        images = []
        for img in soup.find_all('img')[:10]:
            images.append({
                'src': img.get('src', ''),
                'alt': img.get('alt', '')
            })
        metadata['images'] = images
        
        return metadata
    except Exception as e:
        return {'error': str(e)}

@mcp.tool(description="Check if a URL is accessible")
def check_url(url: str) -> Dict[str, Any]:
    """Check if a URL is accessible and get basic info"""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        response = requests.head(url, headers=headers, timeout=5, allow_redirects=True)
        
        return {
            'url': url,
            'accessible': True,
            'status_code': response.status_code,
            'content_type': response.headers.get('content-type', ''),
            'content_length': response.headers.get('content-length', ''),
            'final_url': response.url
        }
    except Exception as e:
        return {
            'url': url,
            'accessible': False,
            'error': str(e)
        }

@mcp.tool(description="Extract all text from a webpage for analysis")
def extract_article(url: str) -> Dict[str, Any]:
    """Extract article/main content from a webpage"""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Try to find main content areas
        main_content = None
        for selector in ['main', 'article', '[role="main"]', '#content', '.content']:
            main_content = soup.select_one(selector)
            if main_content:
                break
        
        if not main_content:
            main_content = soup.body
        
        if main_content:
            # Remove script and style elements
            for script in main_content(["script", "style", "nav", "header", "footer"]):
                script.decompose()
            
            # Get text content
            text = main_content.get_text()
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text = '\n'.join(chunk for chunk in chunks if chunk and len(chunk) > 20)
            
            # Extract title
            title = soup.title.string if soup.title else ''
            h1 = soup.find('h1')
            if h1:
                title = h1.get_text(strip=True)
            
            return {
                'url': url,
                'title': title,
                'content': text[:10000],  # Limit to 10000 chars
                'word_count': len(text.split()),
                'success': True
            }
        else:
            return {
                'url': url,
                'success': False,
                'error': 'Could not extract content'
            }
    except Exception as e:
        return {
            'url': url,
            'success': False,
            'error': str(e)
        }

if __name__ == "__main__":
    print("🔍 Web Search MCP Server")
    print("=" * 50)
    print("Web search and scraping capabilities for agents")
    print("Available tools:")
    print("  - web_search: Search using DuckDuckGo")
    print("  - fetch_webpage: Fetch and parse web pages")
    print("  - extract_metadata: Extract structured data")
    print("  - check_url: Check URL accessibility")
    print("  - extract_article: Extract main content")
    print("=" * 50)
    
    mcp.run(transport="streamable-http")