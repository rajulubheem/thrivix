"""
Multi-source Fact Checking and Verification Service
Verifies information across multiple authoritative sources
"""
import asyncio
import aiohttp
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
import re
import hashlib
from dataclasses import dataclass
from enum import Enum

class VerificationStatus(Enum):
    VERIFIED = "verified"
    PARTIALLY_VERIFIED = "partially_verified"
    DISPUTED = "disputed"
    UNVERIFIED = "unverified"
    FALSE = "false"

@dataclass
class FactCheckResult:
    claim: str
    status: VerificationStatus
    confidence: float
    sources: List[Dict]
    evidence: List[str]
    counter_evidence: List[str]
    consensus: Optional[str]
    timestamp: datetime

class FactCheckerService:
    def __init__(self):
        self.authoritative_sources = {
            "snopes": "https://www.snopes.com",
            "factcheck": "https://www.factcheck.org",
            "politifact": "https://www.politifact.com",
            "wikipedia": "https://en.wikipedia.org/api/rest_v1",
            "reuters_factcheck": "https://www.reuters.com/fact-check"
        }
        
        self.trusted_domains = [
            ".gov", ".edu", ".org",
            "nature.com", "science.org", "nejm.org",
            "who.int", "cdc.gov", "nih.gov",
            "ieee.org", "acm.org", "arxiv.org"
        ]
        
        self.verification_cache = {}
        
    async def verify_claims(
        self,
        claims: List[str],
        context: Optional[str] = None,
        sources: Optional[List[Dict]] = None
    ) -> List[FactCheckResult]:
        """Verify multiple claims in parallel"""
        tasks = [
            self.verify_single_claim(claim, context, sources)
            for claim in claims
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Filter out exceptions
        valid_results = [
            r for r in results 
            if not isinstance(r, Exception)
        ]
        
        return valid_results
    
    async def verify_single_claim(
        self,
        claim: str,
        context: Optional[str] = None,
        sources: Optional[List[Dict]] = None
    ) -> FactCheckResult:
        """Verify a single claim across multiple sources"""
        
        # Check cache
        cache_key = hashlib.md5(claim.encode()).hexdigest()
        if cache_key in self.verification_cache:
            return self.verification_cache[cache_key]
        
        # Extract key facts from claim
        key_facts = self._extract_key_facts(claim)
        
        # Parallel verification tasks
        verification_tasks = [
            self._check_wikipedia(key_facts),
            self._check_fact_checking_sites(claim),
            self._cross_reference_sources(claim, sources or []),
            self._check_authoritative_sources(key_facts),
            self._analyze_source_credibility(sources or [])
        ]
        
        results = await asyncio.gather(*verification_tasks, return_exceptions=True)
        
        # Aggregate results
        all_evidence = []
        all_counter_evidence = []
        verification_scores = []
        all_sources = []
        
        for result in results:
            if isinstance(result, dict):
                all_evidence.extend(result.get("evidence", []))
                all_counter_evidence.extend(result.get("counter_evidence", []))
                verification_scores.append(result.get("score", 0.5))
                all_sources.extend(result.get("sources", []))
        
        # Calculate overall verification status
        avg_score = sum(verification_scores) / len(verification_scores) if verification_scores else 0.5
        status = self._determine_status(avg_score, len(all_evidence), len(all_counter_evidence))
        
        # Generate consensus statement
        consensus = self._generate_consensus(
            claim,
            all_evidence,
            all_counter_evidence,
            status
        )
        
        result = FactCheckResult(
            claim=claim,
            status=status,
            confidence=avg_score,
            sources=all_sources,
            evidence=all_evidence[:10],  # Top 10 pieces of evidence
            counter_evidence=all_counter_evidence[:5],  # Top 5 counter-evidence
            consensus=consensus,
            timestamp=datetime.now()
        )
        
        # Cache the result
        self.verification_cache[cache_key] = result
        
        return result
    
    async def _check_wikipedia(self, key_facts: List[str]) -> Dict:
        """Check facts against Wikipedia"""
        evidence = []
        counter_evidence = []
        sources = []
        
        async with aiohttp.ClientSession() as session:
            for fact in key_facts[:5]:  # Limit API calls
                try:
                    # Search Wikipedia
                    search_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{fact}"
                    async with session.get(search_url) as response:
                        if response.status == 200:
                            data = await response.json()
                            extract = data.get("extract", "")
                            
                            # Simple relevance check
                            if fact.lower() in extract.lower():
                                evidence.append(f"Wikipedia confirms: {extract[:200]}...")
                                sources.append({
                                    "name": "Wikipedia",
                                    "url": data.get("content_urls", {}).get("desktop", {}).get("page", ""),
                                    "type": "encyclopedia"
                                })
                except Exception:
                    continue
        
        return {
            "evidence": evidence,
            "counter_evidence": counter_evidence,
            "sources": sources,
            "score": 0.7 if evidence else 0.3
        }
    
    async def _check_fact_checking_sites(self, claim: str) -> Dict:
        """Check claim against fact-checking websites"""
        # In production, this would use fact-checking APIs
        # For now, return placeholder data
        
        # Simulate fact-checking
        claim_lower = claim.lower()
        
        # Check for common false claims patterns
        false_indicators = ["conspiracy", "hoax", "fake", "debunked", "myth"]
        true_indicators = ["confirmed", "verified", "proven", "established", "documented"]
        
        score = 0.5
        evidence = []
        counter_evidence = []
        
        for indicator in false_indicators:
            if indicator in claim_lower:
                score -= 0.1
                counter_evidence.append(f"Claim contains disputed terminology: '{indicator}'")
        
        for indicator in true_indicators:
            if indicator in claim_lower:
                score += 0.1
                evidence.append(f"Claim contains verified terminology: '{indicator}'")
        
        return {
            "evidence": evidence,
            "counter_evidence": counter_evidence,
            "sources": [],
            "score": max(0, min(1, score))
        }
    
    async def _cross_reference_sources(
        self,
        claim: str,
        sources: List[Dict]
    ) -> Dict:
        """Cross-reference claim across provided sources"""
        if not sources:
            return {"evidence": [], "counter_evidence": [], "sources": [], "score": 0.5}
        
        consistent_sources = []
        inconsistent_sources = []
        
        # Analyze source agreement
        for source in sources:
            # Check if source supports the claim
            content = f"{source.get('title', '')} {source.get('description', '')}".lower()
            claim_words = claim.lower().split()
            
            matching_words = sum(1 for word in claim_words if word in content)
            match_ratio = matching_words / len(claim_words) if claim_words else 0
            
            if match_ratio > 0.5:
                consistent_sources.append(source)
            elif match_ratio < 0.2:
                inconsistent_sources.append(source)
        
        # Calculate consistency score
        total_sources = len(sources)
        consistency_ratio = len(consistent_sources) / total_sources if total_sources else 0.5
        
        evidence = [
            f"{s.get('source', 'Source')} supports this claim"
            for s in consistent_sources[:3]
        ]
        
        counter_evidence = [
            f"{s.get('source', 'Source')} presents conflicting information"
            for s in inconsistent_sources[:2]
        ]
        
        return {
            "evidence": evidence,
            "counter_evidence": counter_evidence,
            "sources": consistent_sources[:5],
            "score": consistency_ratio
        }
    
    async def _check_authoritative_sources(self, key_facts: List[str]) -> Dict:
        """Check against authoritative sources"""
        score = 0.5
        evidence = []
        sources = []
        
        # Simulate checking authoritative sources
        # In production, this would query actual authoritative APIs
        
        authoritative_facts = {
            "climate change": "Scientific consensus confirms human-caused climate change",
            "vaccines": "Vaccines are safe and effective according to medical authorities",
            "earth": "The Earth is approximately 4.5 billion years old",
            "evolution": "Evolution is supported by extensive scientific evidence"
        }
        
        for fact in key_facts:
            fact_lower = fact.lower()
            for key, confirmation in authoritative_facts.items():
                if key in fact_lower:
                    evidence.append(confirmation)
                    sources.append({
                        "name": "Scientific Consensus",
                        "type": "authoritative",
                        "credibility": 1.0
                    })
                    score = 0.9
                    break
        
        return {
            "evidence": evidence,
            "counter_evidence": [],
            "sources": sources,
            "score": score
        }
    
    async def _analyze_source_credibility(self, sources: List[Dict]) -> Dict:
        """Analyze the credibility of provided sources"""
        if not sources:
            return {"evidence": [], "counter_evidence": [], "sources": [], "score": 0.5}
        
        credible_sources = []
        questionable_sources = []
        
        for source in sources:
            url = source.get("url", "")
            domain = source.get("domain", "")
            
            # Check if from trusted domain
            is_trusted = any(
                trusted in url or trusted in domain
                for trusted in self.trusted_domains
            )
            
            if is_trusted:
                credible_sources.append(source)
            else:
                # Additional credibility checks
                credibility_score = self._calculate_source_credibility(source)
                if credibility_score > 0.7:
                    credible_sources.append(source)
                elif credibility_score < 0.3:
                    questionable_sources.append(source)
        
        # Calculate overall credibility
        if sources:
            credibility_ratio = len(credible_sources) / len(sources)
        else:
            credibility_ratio = 0.5
        
        evidence = [
            f"Verified by {s.get('source', 'credible source')}"
            for s in credible_sources[:3]
        ]
        
        counter_evidence = [
            f"Questionable source: {s.get('source', 'unknown')}"
            for s in questionable_sources[:2]
        ]
        
        return {
            "evidence": evidence,
            "counter_evidence": counter_evidence,
            "sources": credible_sources,
            "score": credibility_ratio
        }
    
    def _extract_key_facts(self, claim: str) -> List[str]:
        """Extract key facts from a claim for verification"""
        # Remove common words and extract key terms
        stop_words = {"the", "is", "are", "was", "were", "in", "on", "at", "to", "for", "of", "and", "or", "but"}
        
        words = claim.lower().split()
        key_words = [w for w in words if w not in stop_words and len(w) > 3]
        
        # Extract potential facts (simplified)
        facts = []
        
        # Look for numbers, dates, names (capitalized words)
        for word in claim.split():
            if word[0].isupper() or any(c.isdigit() for c in word):
                facts.append(word)
        
        # Also include full claim if short enough
        if len(claim) < 100:
            facts.append(claim)
        
        return facts[:5]  # Limit to 5 key facts
    
    def _determine_status(
        self,
        score: float,
        evidence_count: int,
        counter_evidence_count: int
    ) -> VerificationStatus:
        """Determine verification status based on evidence"""
        
        if score >= 0.8 and evidence_count > counter_evidence_count * 2:
            return VerificationStatus.VERIFIED
        elif score >= 0.6 and evidence_count > counter_evidence_count:
            return VerificationStatus.PARTIALLY_VERIFIED
        elif score <= 0.2 and counter_evidence_count > evidence_count:
            return VerificationStatus.FALSE
        elif abs(evidence_count - counter_evidence_count) <= 2:
            return VerificationStatus.DISPUTED
        else:
            return VerificationStatus.UNVERIFIED
    
    def _generate_consensus(
        self,
        claim: str,
        evidence: List[str],
        counter_evidence: List[str],
        status: VerificationStatus
    ) -> str:
        """Generate a consensus statement about the claim"""
        
        if status == VerificationStatus.VERIFIED:
            return f"This claim is supported by multiple authoritative sources. {len(evidence)} pieces of supporting evidence found."
        elif status == VerificationStatus.PARTIALLY_VERIFIED:
            return f"This claim has partial support. Some aspects are verified while others require further investigation."
        elif status == VerificationStatus.FALSE:
            return f"This claim is contradicted by authoritative sources. {len(counter_evidence)} pieces of counter-evidence found."
        elif status == VerificationStatus.DISPUTED:
            return f"This claim is disputed. Found {len(evidence)} supporting and {len(counter_evidence)} contradicting sources."
        else:
            return "Insufficient evidence to verify this claim. Further research recommended."
    
    def _calculate_source_credibility(self, source: Dict) -> float:
        """Calculate credibility score for a source"""
        score = 0.5  # Start neutral
        
        # Check for HTTPS
        if source.get("url", "").startswith("https://"):
            score += 0.1
        
        # Check domain age (would need external API in production)
        # For now, use simple heuristics
        
        # Check for author information
        if source.get("author"):
            score += 0.1
        
        # Check for publication date
        if source.get("published_at"):
            score += 0.1
        
        # Check for citations/references
        if source.get("citations") or source.get("references"):
            score += 0.2
        
        return min(1.0, score)