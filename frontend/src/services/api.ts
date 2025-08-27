import axios, { AxiosInstance, AxiosError } from 'axios';
import { SwarmExecutionRequest, SwarmExecutionResult } from '../types/swarm';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    this.client = axios.create({
      baseURL: `${baseUrl}/api/v1`,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for auth
    this.client.interceptors.request.use(
      (config) => {
        let token = localStorage.getItem('access_token');
        // Ensure we always have a token for demo
        if (!token) {
          token = 'demo-token';
          localStorage.setItem('access_token', token);
        }
        config.headers.Authorization = `Bearer ${token}`;
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Handle token refresh or redirect to login
          localStorage.removeItem('access_token');
          // For demo, we'll just continue without auth
        }
        return Promise.reject(error);
      }
    );
  }

  // Swarm endpoints
  async executeSwarm(request: SwarmExecutionRequest): Promise<SwarmExecutionResult> {
    const response = await this.client.post('/swarm/execute', request);
    return response.data;
  }

  async executeSwarmStream(request: SwarmExecutionRequest): Promise<{execution_id: string, stream_url: string}> {
    // Use the streaming/start endpoint for real-time streaming
    const response = await this.client.post('/streaming/start', request);
    return {
      execution_id: response.data.session_id,
      stream_url: response.data.poll_url
    };
  }

  async getExecution(executionId: string): Promise<SwarmExecutionResult> {
    const response = await this.client.get(`/swarm/executions/${executionId}`);
    return response.data;
  }

  async listExecutions(skip = 0, limit = 100) {
    const response = await this.client.get('/swarm/executions', {
      params: { skip, limit }
    });
    return response.data;
  }

  async stopExecution(executionId: string) {
    const response = await this.client.delete(`/sse/stop/${executionId}`);
    return response.data;
  }

  async getAgentTemplates() {
    const response = await this.client.get('/swarm/templates');
    return response.data;
  }

  // Health check
  async healthCheck() {
    const response = await this.client.get('/health');
    return response.data;
  }

  // Create polling URL for streaming (not using SSE anymore)
  getPollingUrl(sessionId: string): string {
    const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    return `${baseUrl}/api/v1/streaming/poll/${sessionId}`;
  }
  
  // Deprecated - keeping for compatibility
  createEventSource(executionId: string): EventSource {
    const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    // Note: SSE is deprecated, using polling instead
    const url = `${baseUrl}/api/v1/sse/stream/${executionId}`;
    console.log('Warning: SSE is deprecated, use polling instead');
    return new EventSource(url);
  }
}

export const apiService = new ApiService();