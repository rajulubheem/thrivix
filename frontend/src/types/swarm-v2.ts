// Unified Swarm v2 Types with strict agent roles and handoff control

export type AgentRole = 
  | "orchestrator"
  | "researcher" 
  | "planner"
  | "tool-runner"
  | "coder"
  | "reviewer"
  | "safety";

export interface Goal {
  id: string;
  text: string;
  constraints?: {
    timeMinutes?: number;
    costMax?: number;
    maxHandoffs?: number;
  };
  acceptance?: string[];
  createdAt: Date;
}

export interface PlanStep {
  id: string;
  title: string;
  description?: string;
  agent: AgentRole;
  deps: string[]; // IDs of dependent steps
  status: "queued" | "running" | "blocked" | "done" | "failed" | "approved" | "waiting_approval";
  summary?: string;
  artifacts?: ArtifactRef[];
  confidence?: number;
  estimatedTime?: number;
  actualTime?: number;
  retryCount?: number;
  blockedReason?: string;
}

export interface RunCaps {
  maxHandoffs: number;
  maxRuntimeSec: number;
  maxCost: number;
  maxRetries: number;
  requireApprovals: boolean;
  safetyLevel: "strict" | "moderate" | "minimal";
}

export interface Action {
  id: string;
  stepId: string;
  agent: AgentRole;
  type: "tool" | "reason" | "handoff" | "ask_user" | "approval_request";
  input?: any;
  output?: any;
  confidence?: number;
  cost?: number;
  tokensUsed?: number;
  duration?: number;
  blockedBy?: string;
  timestamp: Date;
  status: "pending" | "running" | "complete" | "failed" | "approved" | "rejected";
}

export interface ArtifactRef {
  id: string;
  name: string;
  type: 'code' | 'document' | 'data' | 'image' | 'test_result';
  content?: string;
  path?: string;
  size?: number;
  metadata?: {
    language?: string;
    agent?: string;
    [key: string]: any;
  };
}

export interface AgentState {
  role: AgentRole;
  status: "idle" | "waiting" | "running" | "blocked" | "done" | "error";
  currentStep?: string;
  currentAction?: string;
  message?: string;
  confidence?: number;
  tokensUsed: number;
  toolCallsCount: number;
  handoffsCount: number;
}

export interface HandoffRequest {
  fromAgent: AgentRole;
  toAgent: AgentRole;
  stepId: string;
  reason: string;
  context: Record<string, any>;
  priority: "low" | "normal" | "high" | "critical";
  requiresApproval: boolean;
}

export interface SafetyFlag {
  id: string;
  severity: "info" | "warning" | "error" | "critical";
  type: "pii" | "unsafe_content" | "policy_violation" | "cost_exceeded" | "time_exceeded";
  message: string;
  agent: AgentRole;
  stepId?: string;
  timestamp: Date;
  resolved: boolean;
}

export interface ExecutionMetrics {
  totalDuration: number;
  totalCost: number;
  totalTokens: number;
  totalToolCalls: number;
  totalHandoffs: number;
  successRate: number;
  retryCount: number;
  confidenceAvg: number;
  stepsCompleted: number;
  stepsTotal: number;
  artifactsGenerated: number;
  safetyFlags: number;
}

export interface SwarmExecution {
  id: string;
  goal: Goal;
  plan: PlanStep[];
  runCaps: RunCaps;
  actions: Action[];
  artifacts: ArtifactRef[];
  agentStates: Record<AgentRole, AgentState>;
  handoffHistory: HandoffRequest[];
  safetyFlags: SafetyFlag[];
  metrics: ExecutionMetrics;
  status: "idle" | "planning" | "running" | "paused" | "completed" | "failed" | "cancelled";
  startTime?: Date;
  endTime?: Date;
  pausedAt?: Date;
  error?: string;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  category: string;
  goalTemplate: string;
  defaultPlan: PlanStep[];
  defaultCaps: RunCaps;
  requiredAgents: AgentRole[];
  estimatedTime: number;
  estimatedCost: number;
  successRate?: number;
  usageCount?: number;
}

export interface ApprovalRequest {
  id: string;
  executionId: string;
  stepId: string;
  agent: AgentRole;
  type: "tool_execution" | "external_api" | "code_execution" | "data_export" | "handoff";
  description: string;
  risk: "low" | "medium" | "high";
  details: Record<string, any>;
  requestedAt: Date;
  status: "pending" | "approved" | "rejected" | "timeout";
  respondedAt?: Date;
  respondedBy?: string;
}

// Agent-specific configurations
export interface AgentConfig {
  role: AgentRole;
  name: string;
  avatar: string;
  color: string;
  systemPrompt: string;
  tools: string[];
  maxTokens: number;
  temperature: number;
  capabilities: string[];
  limitations: string[];
}

// Real-time event types
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

// Timeline visualization types
export interface TimelineEntry {
  id: string;
  agent: AgentRole;
  title: string;
  description?: string;
  status: "waiting" | "running" | "blocked" | "done" | "failed";
  startTime: Date;
  endTime?: Date;
  duration?: number;
  artifacts?: ArtifactRef[];
  toolCalls?: string[];
  confidence?: number;
  cost?: number;
  retryable: boolean;
  approvable: boolean;
  expandable: boolean;
  children?: TimelineEntry[];
}

// DAG visualization types
export interface DAGNode {
  id: string;
  label: string;
  agent: AgentRole;
  x?: number;
  y?: number;
  status: PlanStep["status"];
  estimatedTime?: number;
  actualTime?: number;
}

export interface DAGEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface DAGLayout {
  nodes: DAGNode[];
  edges: DAGEdge[];
  layout: "hierarchical" | "force" | "circular";
}