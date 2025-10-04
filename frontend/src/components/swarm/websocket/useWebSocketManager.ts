import { useRef, useCallback, useEffect } from 'react';
import { WebSocketManager, Frame, ConnectionStatus } from './WebSocketManager';

export interface UseWebSocketManagerProps {
  onTokenFrame: (frame: any) => void;
  onControlFrame: (frame: any) => void;
  isRunning: boolean;
}

export const useWebSocketManager = ({
  onTokenFrame,
  onControlFrame,
  isRunning
}: UseWebSocketManagerProps) => {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const managerRef = useRef<WebSocketManager | null>(null);
  const connectionStatusRef = useRef<ConnectionStatus>('disconnected');
  const agentSequencesRef = useRef<Map<string, number>>(new Map());

  const handleFrame = useCallback((frame: Frame) => {
    if (frame.frame_type === 'token') {
      // Handle sequence checking for token frames
      const { agent_id, seq, final } = frame as any;
      const lastSeq = agentSequencesRef.current.get(agent_id) || 0;

      if (seq === lastSeq) return;
      if (seq < lastSeq && !final) return;

      agentSequencesRef.current.set(agent_id, seq);
      onTokenFrame(frame);
    } else if (frame.frame_type === 'control') {
      onControlFrame(frame);
    }
  }, [onTokenFrame, onControlFrame]);

  const handleConnectionStatusChange = useCallback((status: ConnectionStatus) => {
    connectionStatusRef.current = status;
  }, []);

  // Initialize WebSocket manager
  useEffect(() => {
    if (!managerRef.current) {
      managerRef.current = new WebSocketManager(
        wsRef,
        reconnectTimeoutRef,
        {
          onFrame: handleFrame,
          onConnectionStatusChange: handleConnectionStatusChange,
          isRunning
        }
      );
    } else {
      // Update isRunning in the config
      managerRef.current = new WebSocketManager(
        wsRef,
        reconnectTimeoutRef,
        {
          onFrame: handleFrame,
          onConnectionStatusChange: handleConnectionStatusChange,
          isRunning
        }
      );
    }
  }, [isRunning, handleFrame, handleConnectionStatusChange]);

  const connectWebSocket = useCallback((execId: string, isReconnect: boolean = false) => {
    if (managerRef.current) {
      managerRef.current.connect(execId, isReconnect);
    }
  }, []);

  const disconnectWebSocket = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.disconnect();
    }
  }, []);

  const sendWebSocketMessage = useCallback((message: any) => {
    if (managerRef.current) {
      managerRef.current.sendMessage(message);
    }
  }, []);

  const getConnectionStatus = useCallback(() => {
    return connectionStatusRef.current;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (managerRef.current) {
        managerRef.current.disconnect();
      }
    };
  }, []);

  return {
    connectWebSocket,
    disconnectWebSocket,
    sendWebSocketMessage,
    getConnectionStatus,
    wsRef,
    agentSequences: agentSequencesRef
  };
};