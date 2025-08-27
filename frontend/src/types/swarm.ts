export interface Agent {
  name: string;
  system_prompt: string;
  tools: string[];
  model_id?: string;
  description?: string;
  icon?: string;
}

export interface SwarmExecutionRequest {
  task: string;
  agents: Agent[];
  max_handoffs?: number;
  max_iterations?: number;
  execution_timeout?: number;
  node_timeout?: number;
  execution_id?: string;
  background?: boolean;
}

export interface SwarmExecutionResult {
  execution_id: string;
  status: 'completed' | 'failed' | 'stopped';
  result?: string;
  error?: string;
  execution_time?: number;
  handoffs: number;
  tokens_used: number;
  agent_sequence: string[];
  artifacts: Artifact[];
}

export interface SwarmEvent {
  type:
      | "execution_started"
      | "execution_completed"
      | "execution_failed"
      | "execution_stopped"
      | "agent_started"
      | "agent_completed"
      | "text_generation"
      | "tool_use"           // When agent decides to use a tool
      | "tool_execution"     // When tool is actually being executed
      | "tool_called"        // Alternative name for tool execution
      | "tool_approval_required"  // NEW: Tool needs approval (execution paused)
      | "tool_approval_response"   // NEW: Approval granted/denied (execution resumed)
      | "tool_rejected"      // NEW: Tool was rejected
      | "tool_executed"      // NEW: Tool successfully executed after approval
      | "handoff"
      | "handoff_requested"
      | "handoff_approved"
      | "system_message"
      | "artifact_created"
      | "approval_required"
      | "safety_flag"
      | "metrics_updated"
      | "execution_paused"
      | "execution_resumed"
      | "plan_created"
      | "step_started"
      | "step_completed"
      | "action_started"
      | "action_completed"
      | "error";
  timestamp: string | Date;
  agent?: string;
  data?: any;
  executionId?: string;
  stepId?: string;
  actionId?: string;
}

export interface Artifact {
  id: string;
  type: 'code' | 'html' | 'document' | 'data' | 'image' | 'test_result';
  title: string;
  content: string;
  language?: string;
  filename?: string;
  agentId?: string;
  timestamp?: Date;
  size?: number;
  metadata?: {
    language?: string;
    agent?: string;
    lines?: number;
    functions?: number;
    [key: string]: any;
  };
}

export interface ExecutionMetrics {
  totalAgents: number;     // Changed from totalDuration
  handoffs: number;        // Changed from totalHandoffs
  toolUses: number;        // Changed from totalToolCalls
  events: number;          // New field
  tokensUsed: number;      // Changed from totalTokens
  executionTime: number;   // Changed from totalDuration
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  system_prompt: string;
  tools: string[];
  category: 'research' | 'development' | 'analysis' | 'creative' | 'review';
}