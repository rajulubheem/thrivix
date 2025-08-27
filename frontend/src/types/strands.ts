/**
 * Strands Agents SDK Type Definitions
 * Aligned with official Strands documentation
 */

// Tool Types
export interface StrandsTool {
  name: string;
  description: string;
  category: 'file_ops' | 'web' | 'system' | 'mcp' | 'human' | 'rag' | 'code';
  requiresApproval: boolean;
  parameters: ToolParameter[];
  handler?: (params: any) => Promise<any>;
  mcpEndpoint?: string; // For MCP tools
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: any;
  validation?: (value: any) => boolean;
}

// Tool Call Types
export interface ToolCall {
  id: string;
  toolName: string;
  parameters: Record<string, any>;
  agent: string;
  timestamp: Date;
  status: 'pending_approval' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  approvedBy?: string;
  approvedAt?: Date;
}

// Agent Types
export interface StrandsAgent {
  id: string;
  name: string;
  system_prompt: string;
  tools: string[]; // Tool names this agent can use
  model: string;
  temperature: number;
  maxTokens?: number;
  capabilities: string[];
  trustLevel: 'low' | 'medium' | 'high'; // Determines auto-approval
}

// MCP Types
export interface MCPServer {
  id: string;
  name: string;
  url: string;
  transport: 'http' | 'websocket' | 'stdio';
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  availableTools: string[];
  lastConnected?: Date;
}

export interface MCPToolCall {
  server: string;
  tool: string;
  parameters: Record<string, any>;
  requestId: string;
}

// Swarm Types
export interface SwarmConfig {
  maxHandoffs: number;
  maxIterations: number;
  timeoutSeconds: number;
  agentTimeoutSeconds: number;
  requireApprovalForTools: boolean;
  autoApproveTools: string[]; // Tools that don't need approval
  humanInTheLoop: boolean;
}

export interface SwarmExecution {
  id: string;
  task: string;
  agents: StrandsAgent[];
  config: SwarmConfig;
  startTime: Date;
  endTime?: Date;
  status: 'initializing' | 'running' | 'waiting_approval' | 'completed' | 'failed';
  handoffCount: number;
  iterationCount: number;
  pendingApprovals: ToolCall[];
}

// Event Types (aligned with Strands)
export interface SwarmEvent {
  id: string;
  type: 'swarm.started' | 'swarm.agent.thinking' | 'swarm.agent.handoff' | 
        'swarm.tool.requested' | 'swarm.tool.approved' | 'swarm.tool.rejected' |
        'swarm.tool.executed' | 'swarm.tool.failed' | 'swarm.completed' | 
        'swarm.error' | 'swarm.user.input.required';
  timestamp: Date;
  agent?: string;
  data: any;
  metadata?: Record<string, any>;
}

// Human-in-the-Loop Types
export interface HumanApprovalRequest {
  id: string;
  type: 'tool_execution' | 'agent_handoff' | 'content_generation';
  requestedBy: string; // Agent name
  message: string;
  details: {
    toolCall?: ToolCall;
    handoff?: {
      from: string;
      to: string;
      reason: string;
    };
    content?: {
      preview: string;
      fullContent?: string;
    };
  };
  timestamp: Date;
  expiresAt?: Date;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

// Result Types
export interface SwarmResult {
  execution_id: string;
  final_output: string;
  total_tokens: number;
  total_cost: number;
  execution_time: number;
  handoff_count: number;
  agents_used: string[];
  tools_executed: ToolCall[];
  human_interventions: HumanApprovalRequest[];
  metrics: {
    tokens_per_agent: Record<string, number>;
    time_per_agent: Record<string, number>;
    tool_usage: Record<string, number>;
  };
}

// Tool Registry
export interface ToolRegistry {
  tools: Map<string, StrandsTool>;
  mcpServers: Map<string, MCPServer>;
  agentTools: Map<string, Set<string>>; // agent -> tool names
  approvalRequired: Set<string>; // Tool names requiring approval
  autoApproved: Set<string>; // Tool names that are auto-approved
}

// Safety Configuration
export interface SafetyConfig {
  maxToolCallsPerAgent: number;
  maxRecursiveHandoffs: number;
  bannedTools: string[];
  sensitiveTools: string[]; // Always require approval
  toolTimeoutSeconds: number;
  requireParameterValidation: boolean;
  logAllToolCalls: boolean;
}