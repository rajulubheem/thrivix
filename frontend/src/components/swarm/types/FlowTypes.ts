// Type definitions for Flow UI components
import { Node, Edge } from 'reactflow';
import { BlockStatus } from '../../../types/workflow';

// Strongly typed node data
export interface NodeData {
  // Basic info
  label: string;
  name: string;
  status: BlockStatus;
  nodeType?: string;
  
  // Agent-specific
  agentRole?: string;
  task?: string;
  description?: string;
  
  // Tools
  toolsPlanned?: string[];
  toolsUsed?: string[];
  
  // Metrics & progress
  duration?: number;
  progress?: number;
  tokens?: number;
  toolCalls?: number;
  startedAt?: number;
  updatedAt?: number;
  executionTime?: number;
  tokenCount?: number;
  cost?: number;
  
  // Organization
  group?: string;
  round?: number;
  rank?: number;
  depth?: number;
  // Layout preferences (for handle orientation)
  direction?: 'TB' | 'LR' | 'BT' | 'RL';
}

// Strongly typed edge data
export interface EdgeData {
  label?: string;
  event?: string;
  isActive?: boolean;
  isCompleted?: boolean;
  phase?: 'start' | 'end';
  durationMs?: number;
  ok?: boolean;
  error?: string;
}

// Control frame types with richer payloads
export interface StateProgress {
  agent_id: string;
  progress: number; // 0..1
  tokens?: number;
  tool_calls?: number;
  started_at?: number;
  updated_at?: number;
}

export interface EdgeFired {
  source: string;
  target: string;
  event: string;
  ts: number;
}

export interface AgentMetrics {
  execution_time: number;
  token_count: number;
  tool_count: number;
  cost_estimate?: number;
}

export interface HumanDecision {
  state_id: string;
  name: string;
  description?: string;
  allowed: string[];
  expires_at?: number;
  reason?: string;
}

export interface ErrorDetails {
  error_code?: string;
  error_type?: string;
  stack_excerpt?: string;
  retryable?: boolean;
}

export interface ToolPreferences {
  unknown: string[];
  effective: string[];
  reason?: string;
}

// Layout preferences
export interface LayoutPreferences {
  direction: 'TB' | 'LR' | 'BT' | 'RL';
  algorithm: 'dagre' | 'elk';
  snapToGrid: boolean;
  gridSize: [number, number];
  nodeSpacing: number;
  rankSpacing: number;
}

// Persisted state
export interface PersistedLayout {
  executionId: string;
  nodes: Array<{ id: string; position: { x: number; y: number } }>;
  viewport?: { x: number; y: number; zoom: number };
  timestamp: number;
}

// Camera settings
export interface CameraSettings {
  followExecution: boolean;
  animateTransitions: boolean;
  fitViewPadding: number;
  maxZoom: number;
  minZoom: number;
}

// Typed React Flow nodes and edges
export type FlowNode = Node<NodeData>;
export type FlowEdge = Edge<EdgeData>;
