import { RefObject } from 'react';

// Frame types
export interface TokenFrame {
  exec_id: string;
  frame_type: 'token';
  agent_id: string;
  seq: number;
  text: string;
  final: boolean;
  ts?: number;
}

export interface ControlFrame {
  exec_id: string;
  frame_type: 'control';
  agent_id: string;
  type: string;
  payload?: any;
  ts?: number;
}

export type Frame = TokenFrame | ControlFrame;

// WebSocket connection status
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// WebSocket manager configuration
export interface WebSocketConfig {
  onFrame: (frame: Frame) => void;
  onConnectionStatusChange: (status: ConnectionStatus) => void;
  isRunning: boolean;
}

export class WebSocketManager {
  private wsRef: RefObject<WebSocket | null>;
  private reconnectTimeoutRef: RefObject<NodeJS.Timeout | null>;
  private config: WebSocketConfig;
  private agentSequences: Map<string, number>;

  constructor(
    wsRef: RefObject<WebSocket | null>,
    reconnectTimeoutRef: RefObject<NodeJS.Timeout | null>,
    config: WebSocketConfig
  ) {
    this.wsRef = wsRef;
    this.reconnectTimeoutRef = reconnectTimeoutRef;
    this.config = config;
    this.agentSequences = new Map();
  }

  connect(execId: string, isReconnect: boolean = false) {
    // Close existing connection if any
    if (this.wsRef.current) {
      this.wsRef.current.close();
      (this.wsRef as any).current = null;
    }

    this.config.onConnectionStatusChange('connecting');

    // Determine WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const startFrom = isReconnect ? '$' : '0';
    const port = window.location.hostname === 'localhost'
      ? '8000'
      : window.location.port || (protocol === 'wss:' ? '443' : '8000');
    const wsUrl = `${protocol}//${window.location.hostname}:${port}/api/v1/ws/${execId}?start_from=${startFrom}`;

    // Create new WebSocket connection
    const ws = new WebSocket(wsUrl);
    (this.wsRef as any).current = ws;

    // Setup WebSocket event handlers
    ws.onopen = () => {
      this.config.onConnectionStatusChange('connected');
      ws.send(JSON.stringify({ type: 'ping' }));
    };

    ws.onmessage = (event) => {
      try {
        const frame: Frame = JSON.parse(event.data);
        this.config.onFrame(frame);
      } catch (error) {
        console.error('Parse error:', error);
      }
    };

    ws.onerror = () => {
      this.config.onConnectionStatusChange('error');
    };

    ws.onclose = (event) => {
      this.config.onConnectionStatusChange('disconnected');
      (this.wsRef as any).current = null;

      // Auto-reconnect if running and connection was not clean
      if (this.config.isRunning && !event.wasClean) {
        (this.reconnectTimeoutRef as any).current = setTimeout(() => {
          this.connect(execId, true);
        }, 2000);
      }
    };
  }

  disconnect() {
    if (this.reconnectTimeoutRef.current) {
      clearTimeout(this.reconnectTimeoutRef.current);
      (this.reconnectTimeoutRef as any).current = null;
    }

    if (this.wsRef.current) {
      this.wsRef.current.close();
      (this.wsRef as any).current = null;
    }
  }

  sendMessage(message: any) {
    if (this.wsRef.current && this.wsRef.current.readyState === WebSocket.OPEN) {
      this.wsRef.current.send(JSON.stringify(message));
    }
  }

  getAgentSequence(agentId: string): number {
    return this.agentSequences.get(agentId) || 0;
  }

  setAgentSequence(agentId: string, seq: number) {
    this.agentSequences.set(agentId, seq);
  }

  clearAgentSequences() {
    this.agentSequences.clear();
  }
}