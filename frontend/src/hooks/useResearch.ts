import { useState, useCallback } from 'react';
import { researchApi } from '../services/researchApi';

interface ResearchOptions {
  query: string;
  mode: string;
  depth: string;
  maxAgents: number;
  includeImages: boolean;
  includeCitations: boolean;
  verifyFacts: boolean;
  enableDeepResearch?: boolean;
}

interface ImageSearchOptions {
  count?: number;
  safeSearch?: boolean;
}

export function useResearch() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const performResearch = useCallback(async (options: ResearchOptions) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await researchApi.searchResearch({
        query: options.query,
        mode: options.mode,
        depth: options.depth,
        max_agents: options.maxAgents,
        include_images: options.includeImages,
        include_citations: options.includeCitations,
        verify_facts: options.verifyFacts,
        enable_deep_research: options.enableDeepResearch || false
      });

      // Transform the response to match frontend expectations
      const data = response.data;
      
      return {
        id: `research-${Date.now()}`,
        query: options.query,
        summary: data.summary || 'Research completed successfully.',
        sources: data.sources || [],
        images: data.images || [],
        followUpQuestions: data.follow_up_questions || [],
        citations: data.citations || [],
        timestamp: new Date(),
        confidence: data.confidence || 0.85,
        verificationStatus: data.verification_status || 'unverified'
      };
    } catch (err: any) {
      setError(err.message || 'Research failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const searchImages = useCallback(async (query: string, options?: ImageSearchOptions) => {
    try {
      const response = await researchApi.searchImages(query, options?.count || 20);
      return response.data;
    } catch (err: any) {
      setError(err.message || 'Image search failed');
      throw err;
    }
  }, []);

  const getAcademicPapers = useCallback(async (query: string, maxResults: number = 20) => {
    try {
      const response = await researchApi.searchAcademic(query, maxResults);
      return response.data;
    } catch (err: any) {
      setError(err.message || 'Academic search failed');
      throw err;
    }
  }, []);

  const getNews = useCallback(async (query: string, timeRange: string = '24h') => {
    try {
      const response = await researchApi.searchNews(query, timeRange);
      return response.data;
    } catch (err: any) {
      setError(err.message || 'News aggregation failed');
      throw err;
    }
  }, []);

  return {
    performResearch,
    searchImages,
    getAcademicPapers,
    getNews,
    isLoading,
    error
  };
}