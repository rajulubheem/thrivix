/**
 * Hook for streaming research with real-time agent thinking
 */
import { useState, useCallback, useRef } from 'react';

interface StreamEvent {
  type: 'init' | 'thought' | 'text' | 'source' | 'image' | 'progress' | 'complete' | 'error';
  data: any;
}

interface UseStreamingResearchOptions {
  onThought?: (thought: any) => void;
  onText?: (text: string) => void;
  onSource?: (source: any) => void;
  onImage?: (image: any) => void;
  onProgress?: (progress: number) => void;
  onComplete?: (data: any) => void;
  onError?: (error: string) => void;
}

export function useStreamingResearch(options: UseStreamingResearchOptions = {}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startStreaming = useCallback(async (query: string, enableDeep: boolean = false) => {
    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setIsStreaming(true);
    setError(null);
    abortControllerRef.current = new AbortController();

    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    
    try {
      // For SSE, we need to use EventSource or fetch with streaming
      const response = await fetch(`${apiUrl}/api/v1/research/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          enable_deep_research: enableDeep,
          stream: true
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete SSE messages
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              break;
            }
            
            try {
              const event: StreamEvent = JSON.parse(data);
              
              switch (event.type) {
                case 'thought':
                  options.onThought?.(event.data);
                  break;
                case 'text':
                  options.onText?.(event.data);
                  break;
                case 'source':
                  options.onSource?.(event.data);
                  break;
                case 'image':
                  options.onImage?.(event.data);
                  break;
                case 'progress':
                  options.onProgress?.(event.data.percentage);
                  break;
                case 'complete':
                  options.onComplete?.(event.data);
                  setIsStreaming(false);
                  break;
                case 'error':
                  throw new Error(event.data);
              }
            } catch (e) {
              console.error('Failed to parse SSE event:', e);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        const errorMsg = err.message || 'Streaming failed';
        setError(errorMsg);
        options.onError?.(errorMsg);
      }
    } finally {
      setIsStreaming(false);
    }
  }, [options]);

  const stopStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  return {
    startStreaming,
    stopStreaming,
    isStreaming,
    error
  };
}