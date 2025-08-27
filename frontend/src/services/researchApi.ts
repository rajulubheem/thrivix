import axios, { AxiosInstance } from 'axios';

class ResearchApiService {
  private client: AxiosInstance;

  constructor() {
    // Don't use baseURL at all - construct full URLs manually
    this.client = axios.create({
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for auth
    this.client.interceptors.request.use(
      (config) => {
        let token = localStorage.getItem('access_token');
        if (!token) {
          token = 'demo-token';
          localStorage.setItem('access_token', token);
        }
        config.headers.Authorization = `Bearer ${token}`;
        
        // Debug logging
        console.log('Request URL:', config.url);
        console.log('Request baseURL:', config.baseURL);
        
        return config;
      },
      (error) => Promise.reject(error)
    );
  }

  async searchResearch(params: {
    query: string;
    mode: string;
    depth: string;
    max_agents: number;
    include_images: boolean;
    include_citations: boolean;
    verify_facts: boolean;
    enable_deep_research?: boolean;
  }) {
    // Use full URL directly
    const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    // Transform params to match backend API
    const apiParams = {
      query: params.query,
      mode: params.mode,
      depth: params.depth,
      max_agents: params.max_agents,
      include_images: params.include_images,
      include_citations: params.include_citations,
      verify_facts: params.verify_facts,
      enable_deep_research: params.enable_deep_research || false
    };
    const response = await this.client.post(`${baseUrl}/api/v1/research/search`, apiParams);
    return response.data;
  }

  async searchImages(query: string, count: number = 20) {
    const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    const response = await this.client.post(`${baseUrl}/api/v1/research/images`, {
      query,
      count,
      safe_search: true
    });
    return response.data;
  }

  async searchAcademic(query: string, maxResults: number = 20) {
    const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    const response = await this.client.post(`${baseUrl}/api/v1/research/academic`, {
      query,
      max_results: maxResults
    });
    return response.data;
  }

  async searchNews(query: string, timeRange: string = '24h') {
    const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    const response = await this.client.post(`${baseUrl}/api/v1/research/news`, {
      query,
      time_range: timeRange
    });
    return response.data;
  }
}

export const researchApi = new ResearchApiService();