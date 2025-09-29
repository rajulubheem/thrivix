export interface Agent {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'completed' | 'error' | 'active' | 'executing' | 'needs_input' | 'paused';
  output?: string;
  input?: string;
  timestamp?: string;
  messages?: Array<{ role: string; content: string; timestamp?: string }>;
  toolsUsed?: string[];
}

export interface TokenFrame {
  type: 'token';
  content: string;
  sender: string;
  agent_id?: string;
  ts?: number;
}

export interface ControlFrame {
  type: 'control';
  action: string;
  status?: string;
  agent_id?: string;
  ts?: number;
}

export type Frame = TokenFrame | ControlFrame;

export interface ExecutionState {
  currentState: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  states: {
    [key: string]: {
      status: 'idle' | 'active' | 'completed' | 'error';
      output?: string;
      input?: string;
      agent?: Agent;
    };
  };
  transitions: Array<{
    from: string;
    to: string;
    event: string;
  }>;
  frames?: Frame[];
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string;
  nodes: any[];
  edges: any[];
  createdAt: string;
  updatedAt?: string;
  tags?: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  agentId?: string;
  agentName?: string;
}