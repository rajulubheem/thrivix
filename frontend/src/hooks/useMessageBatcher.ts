import { useRef, useCallback, useEffect } from 'react';

interface BatchedUpdate {
  agent: string;
  content: string;
  timestamp: number;
}

/**
 * Hook to batch message updates for better streaming performance
 * Reduces React re-renders by batching multiple tokens together
 */
export const useMessageBatcher = (
  onBatchUpdate: (updates: Map<string, string>) => void,
  batchInterval: number = 50 // Batch every 50ms for smooth 20fps updates
) => {
  const batchRef = useRef<Map<string, BatchedUpdate>>(new Map());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(Date.now());

  // Flush the batch
  const flush = useCallback(() => {
    if (batchRef.current.size > 0) {
      const updates = new Map<string, string>();
      
      batchRef.current.forEach((update, agent) => {
        updates.set(agent, update.content);
      });
      
      onBatchUpdate(updates);
      batchRef.current.clear();
      lastUpdateRef.current = Date.now();
    }
    
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [onBatchUpdate]);

  // Add content to batch
  const addToBatch = useCallback((agent: string, token: string) => {
    const existing = batchRef.current.get(agent);
    
    if (existing) {
      existing.content += token;
      existing.timestamp = Date.now();
    } else {
      batchRef.current.set(agent, {
        agent,
        content: token,
        timestamp: Date.now()
      });
    }
    
    // Clear existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    
    // Schedule flush
    const timeSinceLastUpdate = Date.now() - lastUpdateRef.current;
    
    if (timeSinceLastUpdate >= batchInterval) {
      // If enough time has passed, flush immediately
      flush();
    } else {
      // Otherwise schedule a flush
      timerRef.current = setTimeout(flush, batchInterval);
    }
  }, [flush, batchInterval]);

  // Force flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      flush();
    };
  }, [flush]);

  return {
    addToBatch,
    flush
  };
};