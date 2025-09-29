export interface Agent {
  id: string;
  name: string;
  output: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'needs_input' | 'idle' | string;
  startTime?: number;
  endTime?: number;
  parent?: string;
  depth?: number;
  role?: string;
  tools?: string[];
  error?: string;
  input?: string;
  messages?: Array<{
    role: string;
    content: string;
    timestamp?: string;
  }>;
  toolsUsed?: string[];
  timestamp?: string;
}