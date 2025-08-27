import { useEffect, useState, useCallback, useRef } from 'react';
import { SwarmEvent } from '../types/swarm';

interface UseSSEOptions {
  onEvent?: (event: SwarmEvent) => void;
  onError?: (error: Event) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

// CRITICAL: Zero delays for immediate processing
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 10000;

export function useSSE(executionId: string | null, options: UseSSEOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [events, setEvents] = useState<SwarmEvent[]>([]);
  const [executionComplete, setExecutionComplete] = useState(false);

  // Refs for managing connections and state
  const eventSourceRef = useRef<EventSource | null>(null);
  const processedEvents = useRef(new Set<string>());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const { onEvent, onError, onOpen, onClose } = options;

  // Store callback refs to avoid reconnections when callbacks change
  const callbackRefs = useRef({ onEvent, onError, onOpen, onClose });
  callbackRefs.current = { onEvent, onError, onOpen, onClose };

  // CRITICAL FIX: Process events IMMEDIATELY with zero delay and direct callback
  const processEvent = useCallback((eventData: string) => {
    try {
      const data = JSON.parse(eventData);

      // Handle connection established separately
      if (data.type === 'connection_established' || data.type === 'connected') {
        console.log('✅ SSE Connection established');
        return;
      }

      // Handle status check for already completed or active executions
      if (data.type === 'status_check') {
        console.log('📊 Execution status:', data.status);
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'stopped') {
          reconnectAttemptsRef.current = 999; // Prevent reconnection
          setExecutionComplete(true);
        } else if (data.status === 'active') {
          // Execution is already active, just wait for events
          console.log('⏳ Execution already in progress, waiting for events...');
        }
        return;
      }

      // Build the swarm event
      let swarmEvent: SwarmEvent;

      if (data.type === 'swarm_event' && data.event) {
        swarmEvent = {
          type: data.event.type,
          timestamp: data.event.timestamp || data.timestamp,
          agent: data.event.agent,
          data: data.event.data
        };
      } else if (data.type === 'execution_completed') {
        swarmEvent = {
          type: data.type,
          timestamp: data.timestamp,
          agent: undefined,
          data: data.result ? { result: data.result } : {}
        };
      } else if (data.type === 'execution_failed') {
        swarmEvent = {
          type: data.type,
          timestamp: data.timestamp,
          agent: undefined,
          data: { error: data.error }
        };
      } else if (data.type === 'execution_started' || data.type === 'execution_stopped') {
        swarmEvent = {
          type: data.type,
          timestamp: data.timestamp,
          agent: undefined,
          data: {}
        };
      } else {
        swarmEvent = {
          type: data.type || 'unknown',
          timestamp: data.timestamp || new Date().toISOString(),
          agent: data.agent,
          data: data.data || {}
        };
      }

      // CRITICAL FIX: Aggressive deduplication but immediate processing
      const eventKey = `${swarmEvent.type}-${swarmEvent.timestamp}-${swarmEvent.agent || 'system'}`;

      if (!processedEvents.current.has(eventKey)) {
        processedEvents.current.add(eventKey);

        // Clean up old processed events periodically (keep only last 200)
        if (processedEvents.current.size > 200) {
          const keysArray = Array.from(processedEvents.current);
          keysArray.slice(0, 20).forEach(key => processedEvents.current.delete(key));
        }

        console.log('✅ Processing event IMMEDIATELY:', swarmEvent.type, swarmEvent.agent || '');

        // CRITICAL: Add to events array immediately
        setEvents(prev => [...prev, swarmEvent]);

        // CRITICAL: Call callback immediately for real-time processing
        if (callbackRefs.current.onEvent) {
          callbackRefs.current.onEvent(swarmEvent);
        }

        // Check for completion events
        if (swarmEvent.type === 'execution_completed' ||
            swarmEvent.type === 'execution_failed' ||
            swarmEvent.type === 'execution_stopped') {
          setExecutionComplete(true);
        }
      }
    } catch (error) {
      console.error('❌ Failed to parse SSE event:', error, 'Data:', eventData);
    }
  }, []);

  // Enhanced connection management with exponential backoff
  const calculateReconnectDelay = useCallback((attempt: number): number => {
    const exponentialDelay = Math.min(BASE_RECONNECT_DELAY * Math.pow(1.5, attempt), MAX_RECONNECT_DELAY);
    const jitter = Math.random() * 0.2 * exponentialDelay; // 20% jitter
    return exponentialDelay + jitter;
  }, []);

  // Connect to SSE endpoint
  const connect = useCallback(() => {
    if (!executionId || eventSourceRef.current || executionComplete) {
      return;
    }

    console.log(`🔌 Connecting to SSE for execution: ${executionId}`);

    const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    const url = `${baseUrl}/api/v1/sse_fixed/stream/${executionId}`;

    try {
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      // Connection opened - IMMEDIATE
      eventSource.onopen = () => {
        console.log('✅ SSE connection opened IMMEDIATELY');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        callbackRefs.current.onOpen?.();
      };

      // CRITICAL FIX: Handle messages with IMMEDIATE processing - no batching
      eventSource.onmessage = (event) => {
        // CRITICAL: Process immediately without any delay or queuing
        console.log('📨 IMMEDIATE SSE MESSAGE:', event.data.substring(0, 100));
        processEvent(event.data);
      };

      // Handle specific event types
      eventSource.addEventListener('ping', () => {
        // Silent ping handling - no processing needed
      });

      eventSource.addEventListener('heartbeat', () => {
        // Silent heartbeat handling
      });

      // CRITICAL: Handle any custom message types immediately
      eventSource.addEventListener('message', (event) => {
        console.log('📨 CUSTOM MESSAGE:', event.data.substring(0, 100));
        processEvent(event.data);
      });

      // Enhanced error handling
      eventSource.onerror = (error) => {
        console.error('❌ SSE error:', error);
        setIsConnected(false);

        // Check if this was after a completion event
        if (executionComplete) {
          console.log('✅ SSE closed after execution completed - this is normal');
          disconnect();
          return;
        }

        // Check connection state
        if (eventSource.readyState === EventSource.CLOSED) {
          console.log('🔄 SSE connection closed');

          // Clean up current connection
          if (eventSourceRef.current === eventSource) {
            eventSourceRef.current = null;
          }

          // Check if we should reconnect
          if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS && !executionComplete) {
            const delay = calculateReconnectDelay(reconnectAttemptsRef.current);
            reconnectAttemptsRef.current++;

            console.log(`⏱️ Reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttemptsRef.current})`);

            reconnectTimeoutRef.current = setTimeout(() => {
              if (!executionComplete && !eventSourceRef.current) {
                connect();
              }
            }, delay);
          } else {
            console.error('❌ Max reconnection attempts reached or execution complete');
            if (!executionComplete) {
              callbackRefs.current.onError?.(error);
            }
          }
        }
      };

    } catch (error) {
      console.error('❌ Failed to create EventSource:', error);
      setIsConnected(false);
      callbackRefs.current.onError?.(error as Event);
    }
  }, [executionId, processEvent, executionComplete, calculateReconnectDelay]);

  // Disconnect with proper cleanup
  const disconnect = useCallback(() => {
    console.log('🔌 Disconnecting SSE');

    // Clear all timeouts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsConnected(false);
    reconnectAttemptsRef.current = 0;
    callbackRefs.current.onClose?.();
  }, []);

  // Clear events with proper cleanup
  const clearEvents = useCallback(() => {
    setEvents([]);
    processedEvents.current.clear();
    setExecutionComplete(false);
  }, []);

  // Connect when executionId changes
  useEffect(() => {
    if (executionId) {
      console.log(`🔗 SSE: Connecting for execution ID: ${executionId}`);
      clearEvents();
      connect();
    } else {
      console.log('🔗 SSE: No execution ID, disconnecting');
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [executionId]); // Only depend on executionId to avoid reconnection loops

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return {
    isConnected,
    events,
    connect,
    disconnect,
    clearEvents,
    // Additional info for debugging
    reconnectAttempts: reconnectAttemptsRef.current,
    isComplete: executionComplete
  };
}