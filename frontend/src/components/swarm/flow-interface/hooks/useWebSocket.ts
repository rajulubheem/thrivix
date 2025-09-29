import { useState, useEffect, useRef, useCallback } from 'react';
import { Frame } from '../types';

interface WebSocketHookReturn {
  ws: WebSocket | null;
  isConnected: boolean;
  frames: Frame[];
  sendMessage: (message: any) => void;
  clearFrames: () => void;
  reconnect: () => void;
}

export const useWebSocket = (url: string): WebSocketHookReturn => {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [frames, setFrames] = useState<Frame[]>([]);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const websocket = new WebSocket(url);
      wsRef.current = websocket;

      websocket.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setWs(websocket);

        // Clear any existing reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', data);

          // Handle frame data
          if (data.type === 'token' || data.type === 'control') {
            setFrames((prev) => [...prev, data as Frame]);
          }

          // Handle other message types if needed
          if (data.exec_id && data.frame_type) {
            // This is a structured frame from the backend
            if (data.frame_type === 'token') {
              const frame: Frame = {
                type: 'token',
                content: data.payload?.content || '',
                sender: data.agent_id || 'system',
                agent_id: data.agent_id,
                ts: data.ts,
              };
              setFrames((prev) => [...prev, frame]);
            } else {
              const frame: Frame = {
                type: 'control',
                action: data.payload?.action || '',
                status: data.payload?.status,
                agent_id: data.agent_id,
                ts: data.ts,
              };
              setFrames((prev) => [...prev, frame]);
            }
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };

      websocket.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        setWs(null);
        wsRef.current = null;

        // Attempt to reconnect after 3 seconds
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('Attempting to reconnect...');
            connect();
          }, 3000);
        }
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      setIsConnected(false);
    }
  }, [url]);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected');
    }
  }, []);

  const clearFrames = useCallback(() => {
    setFrames([]);
  }, []);

  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    connect();
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    ws,
    isConnected,
    frames,
    sendMessage,
    clearFrames,
    reconnect,
  };
};