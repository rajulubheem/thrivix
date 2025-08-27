"""
Academic Paper Search Service - arXiv, PubMed, Semantic Scholar integration
"""
import asyncio
import aiohttp
from typing import List, Dict, Any, Optional
from datetime import datetime
import xml.etree.ElementTree as ET
import json
import re

class AcademicSearchService:
    def __init__(self):
        self.arxiv_base = "http://export.arxiv.org/api/query"
        self.pubmed_base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
        self.semantic_scholar_base = "https://api.semanticscholar.org/graph/v1"
        self.crossref_base = "https://api.crossref.org/works"
        
    async def search_all_sources(self, query: str, max_results: int = 20) -> Dict[str, Any]:
        """Search across all academic sources in parallel"""
        tasks = [
            self.search_arxiv(query, max_results),
            self.search_pubmed(query, max_results),
            self.search_semantic_scholar(query, max_results),
            self.search_crossref(query, max_results)
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        return {
            "arxiv": results[0] if not isinstance(results[0], Exception) else [],
            "pubmed": results[1] if not isinstance(results[1], Exception) else [],
            "semantic_scholar": results[2] if not isinstance(results[2], Exception) else [],
            "crossref": results[3] if not isinstance(results[3], Exception) else [],
            "total_papers": sum(
                len(r) for r in results 
                if not isinstance(r, Exception)
            )
        }
    
    async def search_arxiv(self, query: str, max_results: int = 10) -> List[Dict]:
        """Search arXiv for papers"""
        async with aiohttp.ClientSession() as session:
            params = {
                "search_query": f"all:{query}",
                "start": 0,
                "max_results": max_results,
                "sortBy": "relevance",
                "sortOrder": "descending"
            }
            
            async with session.get(self.arxiv_base, params=params) as response:
                if response.status != 200:
                    return []
                
                xml_data = await response.text()
                root = ET.fromstring(xml_data)
                
                papers = []
                for entry in root.findall("{http://www.w3.org/2005/Atom}entry"):
                    paper = {
                        "id": entry.find("{http://www.w3.org/2005/Atom}id").text,
                        "title": entry.find("{http://www.w3.org/2005/Atom}title").text.strip(),
                        "abstract": entry.find("{http://www.w3.org/2005/Atom}summary").text.strip(),
                        "authors": [
                            author.find("{http://www.w3.org/2005/Atom}name").text
                            for author in entry.findall("{http://www.w3.org/2005/Atom}author")
                        ],
                        "published": entry.find("{http://www.w3.org/2005/Atom}published").text,
                        "updated": entry.find("{http://www.w3.org/2005/Atom}updated").text,
                        "pdf_url": next(
                            (link.get("href") for link in entry.findall("{http://www.w3.org/2005/Atom}link")
                             if link.get("type") == "application/pdf"),
                            None
                        ),
                        "categories": [
                            cat.get("term") for cat in entry.findall("{http://www.w3.org/2005/Atom}category")
                        ],
                        "source": "arXiv",
                        "relevance_score": 0.9  # Calculate based on query match
                    }
                    papers.append(paper)
                
                return papers
    
    async def search_pubmed(self, query: str, max_results: int = 10) -> List[Dict]:
        """Search PubMed for medical/biological papers"""
        async with aiohttp.ClientSession() as session:
            # First, search for IDs
            search_params = {
                "db": "pubmed",
                "term": query,
                "retmax": max_results,
                "retmode": "json",
                "sort": "relevance"
            }
            
            async with session.get(f"{self.pubmed_base}/esearch.fcgi", params=search_params) as response:
                if response.status != 200:
                    return []
                
                search_data = await response.json()
                id_list = search_data.get("esearchresult", {}).get("idlist", [])
                
                if not id_list:
                    return []
                
                # Fetch details for the IDs
                fetch_params = {
                    "db": "pubmed",
                    "id": ",".join(id_list),
                    "retmode": "xml"
                }
                
                async with session.get(f"{self.pubmed_base}/efetch.fcgi", params=fetch_params) as response:
                    if response.status != 200:
                        return []
                    
                    xml_data = await response.text()
                    root = ET.fromstring(xml_data)
                    
                    papers = []
                    for article in root.findall(".//PubmedArticle"):
                        medline = article.find(".//MedlineCitation")
                        if not medline:
                            continue
                        
                        paper = {
                            "id": medline.find(".//PMID").text if medline.find(".//PMID") is not None else "",
                            "title": medline.find(".//ArticleTitle").text if medline.find(".//ArticleTitle") is not None else "",
                            "abstract": self._extract_pubmed_abstract(medline),
                            "authors": self._extract_pubmed_authors(medline),
                            "journal": medline.find(".//Journal/Title").text if medline.find(".//Journal/Title") is not None else "",
                            "published": self._extract_pubmed_date(medline),
                            "doi": self._extract_pubmed_doi(article),
                            "source": "PubMed",
                            "relevance_score": 0.85
                        }
                        papers.append(paper)
                    
                    return papers
    
    async def search_semantic_scholar(self, query: str, max_results: int = 10) -> List[Dict]:
        """Search Semantic Scholar for papers"""
        async with aiohttp.ClientSession() as session:
            params = {
                "query": query,
                "limit": max_results,
                "fields": "paperId,title,abstract,authors,year,citationCount,url,venue,publicationDate"
            }
            
            headers = {
                "Accept": "application/json"
            }
            
            async with session.get(
                f"{self.semantic_scholar_base}/paper/search",
                params=params,
                headers=headers
            ) as response:
                if response.status != 200:
                    return []
                
                data = await response.json()
                papers = []
                
                for paper_data in data.get("data", []):
                    paper = {
                        "id": paper_data.get("paperId"),
                        "title": paper_data.get("title"),
                        "abstract": paper_data.get("abstract", ""),
                        "authors": [
                            author.get("name") for author in paper_data.get("authors", [])
                        ],
                        "year": paper_data.get("year"),
                        "citation_count": paper_data.get("citationCount", 0),
                        "url": paper_data.get("url"),
                        "venue": paper_data.get("venue"),
                        "published": paper_data.get("publicationDate"),
                        "source": "Semantic Scholar",
                        "relevance_score": min(1.0, 0.7 + (paper_data.get("citationCount", 0) / 1000))
                    }
                    papers.append(paper)
                
                return papers
    
    async def search_crossref(self, query: str, max_results: int = 10) -> List[Dict]:
        """Search CrossRef for DOI-registered papers"""
        async with aiohttp.ClientSession() as session:
            params = {
                "query": query,
                "rows": max_results,
                "sort": "relevance",
                "select": "DOI,title,author,published-print,abstract,container-title,cited-by-count"
            }
            
            async with session.get(self.crossref_base, params=params) as response:
                if response.status != 200:
                    return []
                
                data = await response.json()
                papers = []
                
                for item in data.get("message", {}).get("items", []):
                    paper = {
                        "id": item.get("DOI"),
                        "title": " ".join(item.get("title", [])),
                        "abstract": item.get("abstract", ""),
                        "authors": [
                            f"{author.get('given', '')} {author.get('family', '')}"
                            for author in item.get("author", [])
                        ],
                        "journal": " ".join(item.get("container-title", [])),
                        "published": self._format_crossref_date(item.get("published-print")),
                        "citation_count": item.get("cited-by-count", 0),
                        "doi": item.get("DOI"),
                        "source": "CrossRef",
                        "relevance_score": 0.8
                    }
                    papers.append(paper)
                
                return papers
    
    def _extract_pubmed_abstract(self, medline) -> str:
        """Extract abstract from PubMed XML"""
        abstract_elem = medline.find(".//Abstract")
        if abstract_elem is None:
            return ""
        
        abstract_texts = []
        for text in abstract_elem.findall(".//AbstractText"):
            label = text.get("Label", "")
            content = text.text or ""
            if label:
                abstract_texts.append(f"{label}: {content}")
            else:
                abstract_texts.append(content)
        
        return " ".join(abstract_texts)
    
    def _extract_pubmed_authors(self, medline) -> List[str]:
        """Extract authors from PubMed XML"""
        authors = []
        for author in medline.findall(".//Author"):
            last_name = author.find(".//LastName")
            fore_name = author.find(".//ForeName")
            if last_name is not None and fore_name is not None:
                authors.append(f"{fore_name.text} {last_name.text}")
        return authors
    
    def _extract_pubmed_date(self, medline) -> str:
        """Extract publication date from PubMed XML"""
        date_elem = medline.find(".//PubDate")
        if date_elem is None:
            return ""
        
        year = date_elem.find(".//Year")
        month = date_elem.find(".//Month")
        day = date_elem.find(".//Day")
        
        date_parts = []
        if year is not None:
            date_parts.append(year.text)
        if month is not None:
            date_parts.append(month.text)
        if day is not None:
            date_parts.append(day.text)
        
        return "-".join(date_parts)
    
    def _extract_pubmed_doi(self, article) -> str:
        """Extract DOI from PubMed article"""
        for id_elem in article.findall(".//ArticleId"):
            if id_elem.get("IdType") == "doi":
                return id_elem.text
        return ""
    
    def _format_crossref_date(self, date_parts) -> str:
        """Format CrossRef date parts"""
        if not date_parts or "date-parts" not in date_parts:
            return ""
        
        parts = date_parts["date-parts"]
        if parts and len(parts) > 0 and len(parts[0]) > 0:
            return "-".join(str(p) for p in parts[0])
        return ""
    
    async def get_paper_citations(self, paper_id: str, source: str = "semantic_scholar") -> List[Dict]:
        """Get papers that cite a given paper"""
        if source == "semantic_scholar":
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.semantic_scholar_base}/paper/{paper_id}/citations",
                    params={"fields": "paperId,title,authors,year,citationCount"}
                ) as response:
                    if response.status != 200:
                        return []
                    
                    data = await response.json()
                    return data.get("data", [])
        
        return []
    
    async def get_paper_references(self, paper_id: str, source: str = "semantic_scholar") -> List[Dict]:
        """Get papers referenced by a given paper"""
        if source == "semantic_scholar":
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.semantic_scholar_base}/paper/{paper_id}/references",
                    params={"fields": "paperId,title,authors,year,citationCount"}
                ) as response:
                    if response.status != 200:
                        return []
                    
                    data = await response.json()
                    return data.get("data", [])
        
        return []