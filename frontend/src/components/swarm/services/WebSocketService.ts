import { Frame, TokenFrame, ControlFrame } from '../types/FlowTypes';

export class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private onFrameCallback: ((frame: Frame) => void) | null = null;
  private onStatusCallback: ((status: string) => void) | null = null;
  private isRunning: boolean = false;

  constructor() {
    this.ws = null;
  }

  connect(execId: string, isReconnect: boolean = false): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.onStatusCallback?.('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const startFrom = isReconnect ? '$' : '0';
    const port = window.location.hostname === 'localhost'
      ? '8000'
      : window.location.port || (protocol === 'wss:' ? '443' : '8000');
    const wsUrl = `${protocol}//${window.location.hostname}:${port}/api/v1/ws/${execId}?start_from=${startFrom}`;

    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      this.onStatusCallback?.('connected');
      ws.send(JSON.stringify({ type: 'ping' }));
    };

    ws.onmessage = (event) => {
      try {
        const frame: Frame = JSON.parse(event.data);
        this.onFrameCallback?.(frame);
      } catch (error) {
        console.error('Parse error:', error);
      }
    };

    ws.onerror = () => {
      this.onStatusCallback?.('error');
    };

    ws.onclose = (event) => {
      this.onStatusCallback?.('disconnected');
      this.ws = null;

      if (this.isRunning && !event.wasClean) {
        this.reconnectTimeout = setTimeout(() => {
          this.connect(execId, true);
        }, 2000);
      }
    };
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  onFrame(callback: (frame: Frame) => void): void {
    this.onFrameCallback = callback;
  }

  onStatus(callback: (status: string) => void): void {
    this.onStatusCallback = callback;
  }

  setRunning(isRunning: boolean): void {
    this.isRunning = isRunning;
  }

  getWebSocket(): WebSocket | null {
    return this.ws;
  }
}