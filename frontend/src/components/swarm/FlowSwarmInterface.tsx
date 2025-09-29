import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  ConnectionMode,
  Connection,
  ConnectionLineType,
  Panel,
  BackgroundVariant,
  NodeTypes,
  EdgeTypes,
  MarkerType,
  Position,
  Handle,
  NodeProps,
  BaseEdge,
  getBezierPath,
  EdgeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './FlowSwarmInterface.css';
import dagre from 'dagre';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { NodeData, EdgeData } from './types/FlowTypes';
import { BlockStatus } from '../../types/workflow';
import ProfessionalAgentNode from './components/ProfessionalAgentNode';
import OptimizedSmoothEdge from './components/OptimizedSmoothEdge';
import InteractiveEdge from './components/InteractiveEdge';
import ImprovedChatbotOutput from './components/ImprovedChatbotOutput';
import { useTheme } from '../../contexts/ThemeContext';
import { EnhancedAgentNode } from './components/EnhancedAgentNode';
import { ProfessionalWorkflowBlock } from './components/ProfessionalWorkflowBlock';
import { EnhancedToolBlock } from './components/EnhancedToolBlock';
import { ImprovedEnhancedToolBlock } from './components/ImprovedEnhancedToolBlock';
import UnifiedBlockManager, { BlockConfig } from './components/UnifiedBlockManager';
import BlockSettingsPanel from './components/BlockSettingsPanel';
import { WorkflowToolbar } from './components/WorkflowToolbar';
import ImprovedStateDataViewer from './components/ImprovedStateDataViewer';
import { v4 as uuidv4 } from 'uuid';
import { toolSchemaService, ToolSchema } from '../../services/toolSchemaService';
import { unifiedToolService } from '../../services/unifiedToolService';
import { stateMachineAdapter } from '../../services/stateMachineAdapter';
import { resolveUserInputsInParams } from '../../utils/parameterResolver';

// Clean Professional Node Component (v3)
const AgentNode: React.FC<NodeProps> = ({ data, selected }) => {
  const isDark = data.isDarkMode === true;

  const getStatusColor = () => {
    switch (data.status) {
      case 'running': return '#fbbf24';
      case 'completed': return '#10b981';
      case 'failed': return '#ef4444';
      default: return isDark ? '#6b7280' : '#9ca3af';
    }
  };

  const getNodeBackground = () => {
    if (isDark) {
      switch (data.status) {
        case 'running':
          return 'linear-gradient(135deg, rgba(251, 191, 36, 0.08) 0%, rgba(30, 41, 59, 0.95) 100%)';
        case 'completed':
          return 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(30, 41, 59, 0.95) 100%)';
        case 'failed':
          return 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(30, 41, 59, 0.95) 100%)';
        default:
          return 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)';
      }
    } else {
      switch (data.status) {
        case 'running':
          return 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)';
        case 'completed':
          return 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)';
        case 'failed':
          return 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)';
        default:
          return 'linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)';
      }
    }
  };

  return (
    <div
      className={`agent-node ${data.status} ${selected ? 'selected' : ''}`}
      style={{
        background: getNodeBackground(),
        border: `2px solid ${selected ? getStatusColor() : isDark ? 'rgba(71, 85, 105, 0.5)' : '#e5e7eb'}`,
        borderRadius: '10px',
        padding: '16px',
        minWidth: '240px',
        maxWidth: '280px',
        color: isDark ? '#e5e7eb' : '#1f2937',
        boxShadow: selected
          ? `0 0 0 3px ${getStatusColor()}40, 0 10px 25px -5px rgba(0, 0, 0, 0.15)`
          : isDark
            ? '0 4px 12px rgba(0, 0, 0, 0.4)'
            : '0 2px 8px rgba(0, 0, 0, 0.1)',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: getStatusColor(),
          width: '12px',
          height: '12px',
          border: `3px solid ${isDark ? '#0f172a' : '#ffffff'}`,
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          left: '-6px',
        }}
      />

      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: getStatusColor(),
            boxShadow: data.status === 'running'
              ? `0 0 0 4px ${getStatusColor()}30`
              : 'none',
            animation: data.status === 'running' ? 'pulse 2s infinite' : 'none',
          }} />
          <span style={{
            fontSize: '15px',
            fontWeight: '600',
            color: isDark ? '#f3f4f6' : '#111827',
            letterSpacing: '-0.025em',
          }}>
            {data.label || data.name || 'Agent'}
          </span>
        </div>

        {data.agentRole && (
          <div style={{
            fontSize: '12px',
            color: isDark ? '#9ca3af' : '#6b7280',
            marginLeft: '20px',
            fontStyle: 'italic',
          }}>
            {data.agentRole}
          </div>
        )}
      </div>

      {data.description && (
        <div style={{
          fontSize: '12px',
          color: isDark ? '#d1d5db' : '#4b5563',
          lineHeight: '1.4',
          marginBottom: '8px',
          maxHeight: '36px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {data.description}
        </div>
      )}

      {(data.tools?.length > 0 || data.toolsPlanned?.length > 0 || data.toolsUsed?.length > 0) && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          marginTop: '8px',
        }}>
          {(data.toolsUsed || data.tools || data.toolsPlanned || []).slice(0, 3).map((tool: string, i: number) => (
            <span
              key={i}
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                background: data.toolsUsed?.includes(tool)
                  ? (isDark ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7')
                  : (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)'),
                color: data.toolsUsed?.includes(tool)
                  ? (isDark ? '#86efac' : '#166534')
                  : (isDark ? '#d1d5db' : '#6b7280'),
                border: data.toolsUsed?.includes(tool)
                  ? (isDark ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid #86efac')
                  : (isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)'),
                fontWeight: data.toolsUsed?.includes(tool) ? '600' : '400',
              }}
            >
              {tool}
            </span>
          ))}
          {((data.toolsUsed || data.tools || data.toolsPlanned || []).length > 3) && (
            <span
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                background: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
                color: isDark ? '#d1d5db' : '#6b7280',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
              }}
            >
              +{(data.toolsUsed || data.tools || data.toolsPlanned || []).length - 3}
            </span>
          )}
        </div>
      )}

      {data.status === 'running' && (
        <div style={{
          marginTop: '10px',
          height: '2px',
          background: isDark ? '#374151' : '#e5e7eb',
          borderRadius: '1px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: '50%',
            height: '100%',
            background: getStatusColor(),
            animation: 'progress 1.5s ease-in-out infinite',
          }} />
        </div>
      )}

      {data.duration && (
        <div style={{
          marginTop: '6px',
          fontSize: '11px',
          color: isDark ? '#9ca3af' : '#6b7280',
          textAlign: 'right',
        }}>
          {(data.duration / 1000).toFixed(1)}s
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: getStatusColor(),
          width: '12px',
          height: '12px',
          border: `3px solid ${isDark ? '#0f172a' : '#ffffff'}`,
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          right: '-6px',
        }}
      />
    </div>
  );
};

// Clean Edge Component with smooth animations
const AnimatedEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isDark = data?.isDarkMode !== false;

  const getEdgeColor = () => {
    if (data?.isActive) return '#fbbf24';
    if (data?.isCompleted) return '#10b981';
    return isDark ? '#4b5563' : '#d1d5db';
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: getEdgeColor(),
          strokeWidth: data?.isActive ? 3 : 2,
          opacity: data?.dimmed ? 0.2 : 1,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
      {data?.isActive && (
        <>
          <circle r="5" fill={getEdgeColor()}>
            <animateMotion
              dur="2s"
              repeatCount="indefinite"
              path={edgePath}
            />
          </circle>
          <circle r="5" fill={getEdgeColor()} opacity="0.5">
            <animateMotion
              dur="2s"
              begin="0.5s"
              repeatCount="indefinite"
              path={edgePath}
            />
          </circle>
        </>
      )}
    </>
  );
};

// Types
interface Agent {
  id: string;
  name: string;
  status: BlockStatus;
  output: string;
  startTime?: number;
  endTime?: number;
  error?: string;
  parent?: string;
  depth?: number;
}

interface TokenFrame {
  exec_id: string;
  agent_id: string;
  seq: number;
  text: string;
  ts: number;
  final: boolean;
  frame_type: 'token';
}

interface ControlFrame {
  exec_id: string;
  type: string;
  agent_id?: string;
  payload?: any;
  ts: number;
  frame_type: 'control';
}

type Frame = TokenFrame | ControlFrame;

// Layout function has been moved to utils/layoutUtils.ts

// Main Component
const FlowSwarmInterface: React.FC = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView, setCenter, getViewport, project, zoomIn, zoomOut } = useReactFlow();
  
  // State
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [agents, setAgents] = useState<Map<string, Agent>>(new Map());
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [task, setTask] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [executionMode, setExecutionMode] = useState<'sequential' | 'parallel' | 'dynamic' | 'neural'>('dynamic');
  const [outputPanelWidth, setOutputPanelWidth] = useState(() => {
    // Load saved width from localStorage or use default
    const saved = localStorage.getItem('chatbot_panel_width');
    const savedWidth = saved ? parseInt(saved, 10) : 400;
    // Ensure saved width is within bounds (min: 300, max: 800)
    return Math.min(Math.max(savedWidth, 300), 800);
  });
  const [activelyStreamingAgents, setActivelyStreamingAgents] = useState<Set<string>>(new Set());
  const [currentExecutingNode, setCurrentExecutingNode] = useState<string | null>(null);
  const [nextExecutingNode, setNextExecutingNode] = useState<string | null>(null);
  const [executionActions, setExecutionActions] = useState<Map<string, string[]>>(new Map());
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionHistory, setExecutionHistory] = useState<Map<string, {
    order: number;
    startTime: number;
    endTime?: number;
    status: 'running' | 'completed' | 'failed';
    actions: string[];
    tools: string[];
    blockName?: string;
    blockType?: string;
  }>>(new Map());
  const [executionOrderCounter, setExecutionOrderCounter] = useState(0);
  // Interaction flags to keep dragging/snapping smooth
  const [isInteracting, setIsInteracting] = useState(false);
  const pendingLayoutRef = useRef<boolean>(false);
  // When a full state machine graph is provided by backend, keep it as source of truth
  const [hasStateMachineStructure, setHasStateMachineStructure] = useState<boolean>(false);
  // Human-in-the-loop decision modal
  const [decisionPrompt, setDecisionPrompt] = useState<null | {stateId: string, name: string, description?: string, allowed: string[]}>(null);
  // Tools hub state
  const [showToolsHub, setShowToolsHub] = useState(false);
  // Get theme from context
  const { isDark: isDarkMode } = useTheme();

  // Enhanced UI states
  const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>('LR');
  const [showGrid, setShowGrid] = useState(true);
  const [showMinimap, setShowMinimap] = useState(false);
  const [showConversationPanel, setShowConversationPanel] = useState(true);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [highlightPath, setHighlightPath] = useState(false);
  const [followActive, setFollowActive] = useState<boolean>(true);
  const followActiveRef = useRef<boolean>(true);
  useEffect(() => { followActiveRef.current = followActive; }, [followActive]);
  // Replay/trace controls
  const [executionTrace, setExecutionTrace] = useState<string[]>([]);
  const [replayMode, setReplayMode] = useState<boolean>(false);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [showRawDataViewer, setShowRawDataViewer] = useState<boolean>(false);
  const [stateExecutionData, setStateExecutionData] = useState<any[]>([]);
  const [availableTools, setAvailableTools] = useState<string[]>([]);
  const [toolDetails, setToolDetails] = useState<Record<string, { description?: string; category?: string }>>({});
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [toolSearch, setToolSearch] = useState('');
  const [toolPrefs, setToolPrefs] = useState<null | { unknown: string[]; effective: string[] }>(null);
  // Parallel UI helpers
  const [childrenOverrides, setChildrenOverrides] = useState<Record<string, string[]>>({});
  const [showChildrenEditor, setShowChildrenEditor] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [parallelTooltip, setParallelTooltip] = useState<null | { id: string; x: number; y: number; lines: Array<{ child: string; event: string; durationMs: number }> }>(null);
  // Search overlay state
  // Edit mode state
  const [editMode, setEditMode] = useState<boolean>(true); // Always allow editing
  const [showAddNode, setShowAddNode] = useState<boolean>(false);
  const [nodeDraft, setNodeDraft] = useState<{ id: string; name: string; type: 'analysis' | 'tool_call' | 'decision' | 'parallel' | 'final'; description?: string; agent_role?: string; tools: string[] }>({ id: '', name: '', type: 'analysis', description: '', agent_role: '', tools: [] });
  const [edgeEdit, setEdgeEdit] = useState<null | { id?: string; source: string; target: string; event?: string }>(null);
  const [paletteOpen, setPaletteOpen] = useState<boolean>(true);
  const [paletteTab, setPaletteTab] = useState<'blocks'|'tools'>('blocks');
  const [planned, setPlanned] = useState<boolean>(false);
  const [showImportDialog, setShowImportDialog] = useState<boolean>(false);
  const [importJsonText, setImportJsonText] = useState<string>('');
  const [showUnifiedManager, setShowUnifiedManager] = useState<boolean>(false);
  const [selectedNodeForSettings, setSelectedNodeForSettings] = useState<Node | null>(null);

  // WebSocket
  const wsRef = useRef<WebSocket | null>(null);
  const agentSequences = useRef<Map<string, number>>(new Map());

  // Keyboard shortcut for Block Manager
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + B to open Block Manager
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setShowUnifiedManager(true);
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Camera follow helpers
  const pendingFocusIdRef = useRef<string | null>(null);
  const focusAttemptsRef = useRef<number>(0);

  // Focus loop: tries a few times until node dimensions are known
  useEffect(() => {
    let t: any;
    const tick = () => {
      const id = pendingFocusIdRef.current;
      if (!id || !followActive) return;
      const node = (layoutCache.current.nodes as Node[]).find(n => n.id === id) || nodes.find(n => n.id === id);
      if (node) {
        const width = (node as any).width || 0;
        const height = (node as any).height || 0;
        const cx = node.position.x + (width || 280) / 2;
        const cy = node.position.y + (height || 140) / 2;
        const ready = width > 0 && height > 0;
        setCenter(cx, cy, { zoom: 0.95, duration: ready ? 320 : 200 });
        if (ready) {
          pendingFocusIdRef.current = null;
          return;
        }
      }
      focusAttemptsRef.current += 1;
      if (focusAttemptsRef.current < 10) {
        t = setTimeout(tick, 120);
      } else {
        pendingFocusIdRef.current = null;
      }
    };
    if (pendingFocusIdRef.current) {
      t = setTimeout(tick, 60);
    }
    return () => { if (t) clearTimeout(t); };
  }, [nodes, setCenter, followActive]);

  // Improved layout function with better spacing
  const getLayoutedElements = useCallback((nodes: Node[], edges: Edge[], direction: 'TB' | 'LR' = 'LR') => {
    if (nodes.length === 0) return { nodes, edges };

    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    const isHorizontal = direction === 'LR';

    // Increase spacing for better clarity
    dagreGraph.setGraph({
      rankdir: direction,
      nodesep: isHorizontal ? 120 : 100,  // Increased horizontal spacing
      ranksep: isHorizontal ? 200 : 150,  // Increased vertical spacing
      marginx: 50,
      marginy: 50,
      align: 'UL',  // Upper-left alignment for cleaner look
      ranker: 'tight-tree',  // Better ranking algorithm
    });

    // Set node dimensions with padding
    nodes.forEach((node) => {
      dagreGraph.setNode(node.id, {
        width: 260,   // Increased width for better content fit
        height: 120   // Increased height
      });
    });

    edges.forEach((edge) => {
      if (dagreGraph.node(edge.source) && dagreGraph.node(edge.target)) {
        dagreGraph.setEdge(edge.source, edge.target, {
          weight: 1,
          minlen: 2,  // Minimum edge length for spacing
        });
      }
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      return {
        ...node,
        position: nodeWithPosition ? {
          x: nodeWithPosition.x - 130,  // Center based on new width
          y: nodeWithPosition.y - 60,   // Center based on new height
        } : node.position,
      };
    });

    return { nodes: layoutedNodes, edges };
  }, []);

  // Node and Edge types - use professional components
  const nodeTypes = useMemo<NodeTypes>(() => ({
    agent: AgentNode,
    enhanced: EnhancedAgentNode,
    professional: ProfessionalWorkflowBlock,
    tool: ImprovedEnhancedToolBlock,
    toolBlock: ImprovedEnhancedToolBlock  // Alias for compatibility
  }), []);
  const edgeTypes = useMemo<EdgeTypes>(() => ({
    animated: InteractiveEdge,
    smoothstep: InteractiveEdge,
    default: InteractiveEdge,
    bezier: InteractiveEdge,
    straight: InteractiveEdge,
    interactive: InteractiveEdge,
  }), []);
  
  // Optimized state management
  const layoutCache = useRef<{ nodes: Node[], edges: Edge[] }>({ nodes: [], edges: [] });
  const updateTimer = useRef<NodeJS.Timeout | null>(null);
  const lastLayoutedAgentIds = useRef<Set<string>>(new Set());
  const preventRerender = useRef(false);

  // Optimized graph update with better performance
  const updateGraph = useCallback((forceLayout: boolean = false) => {
    // Don't clear nodes if we have agents
    if (agents.size === 0) {
      return;
    }

    // If we already have a full state-machine structure rendered,
    // avoid rebuilding the graph from the (partial) agents map.
    if (hasStateMachineStructure) {
      // Only update node statuses/durations and edge animations in-place
      setNodes(prevNodes => prevNodes.map(node => {
        const agent = agents.get(node.id);
        if (!agent) return node;
        return {
          ...node,
          data: {
            ...node.data,
            status: agent.status,
            duration: agent.endTime && agent.startTime ? agent.endTime - agent.startTime : (node.data?.duration as any),
          },
        };
      }));

      setEdges(prevEdges => prevEdges.map(edge => {
        const sourceAgent = agents.get(edge.source);
        const targetAgent = agents.get(edge.target);
        if (!sourceAgent || !targetAgent) return edge;
        return {
          ...edge,
          animated: targetAgent.status === 'running',
          style: {
            ...edge.style,
            stroke: targetAgent.status === 'running' ? '#facc15' : targetAgent.status === 'completed' ? '#22c55e' : (edge.style?.stroke || '#52525b'),
          },
        };
      }));

      return;
    }

    // Check if we need to recalculate layout (new agents added)
    const currentAgentIds = new Set(agents.keys());
    const needsLayout = forceLayout || Array.from(currentAgentIds).some(id => !lastLayoutedAgentIds.current.has(id));

    // If user is interacting (dragging/panning), defer heavy updates to avoid jitter
    if (isInteracting) {
      if (needsLayout) pendingLayoutRef.current = true;
      return;
    }

    // Always do layout when needed, regardless of streaming state
    if (needsLayout) {
      // Build all nodes
      const newNodes: Node[] = Array.from(agents.values()).map(agent => ({
        id: agent.id,
        type: 'agent',
        data: {
          label: agent.name,
          name: agent.name,
          status: agent.status,
          duration: agent.endTime && agent.startTime ? agent.endTime - agent.startTime : undefined,
          direction: layoutDirection,
          isDarkMode,
        },
        // default position; will be set by layout
        position: { x: 0, y: 0 },
        // help edge routing by setting handle sides based on layout direction
        targetPosition: layoutDirection === 'LR' ? Position.Left : Position.Top,
        sourcePosition: layoutDirection === 'LR' ? Position.Right : Position.Bottom,
      }));

      // Build all edges
      const newEdges: Edge[] = [];
      agents.forEach(agent => {
        if (agent.parent && agents.has(agent.parent)) {
          const parentAgent = agents.get(agent.parent);
          newEdges.push({
            id: `${agent.parent}-${agent.id}`,
            source: agent.parent,
            target: agent.id,
            type: 'smoothstep',
            animated: agent.status === 'running',
            data: {
              isActive: parentAgent?.status === 'completed' && agent.status === 'running',
              isCompleted: parentAgent?.status === 'completed' && agent.status === 'completed',
              isDarkMode,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 18,
              height: 18,
              color: agent.status === 'running' ? '#fbbf24' : agent.status === 'completed' ? '#10b981' : isDarkMode ? '#4b5563' : '#d1d5db',
            },
            style: {
              strokeWidth: agent.status === 'running' ? 2.5 : 2,
            },
          });
        }
      });

      // Apply simple dagre layout
      const layouted = getLayoutedElements(newNodes, newEdges, layoutDirection);

      layoutCache.current = layouted;
      lastLayoutedAgentIds.current = currentAgentIds;

      setNodes(layouted.nodes);
      setEdges(layouted.edges);

      // Fit view with proper padding
      if (layouted.nodes.length > 0 && !preventRerender.current) {
        requestAnimationFrame(() => {
          fitView({
            padding: 0.25,
            duration: 300,
            maxZoom: 1.0,
            minZoom: 0.2
          });
        });
      }
    } else {
      // Just update node data without changing layout
      const updatedNodes = layoutCache.current.nodes.map(node => {
        const agent = agents.get(node.id);
        if (!agent) return node;
        const nextDuration = agent.endTime && agent.startTime ? agent.endTime - agent.startTime : undefined;
        if (node.data?.status === agent.status && (node.data as any)?.duration === nextDuration) {
          return node; // avoid unnecessary re-renders while idle
        }
        return {
          ...node,
          data: {
            ...node.data,
            status: agent.status,
            duration: nextDuration,
          },
        };
      });

      // Update edge animations
      const updatedEdges = layoutCache.current.edges.map(edge => {
        const sourceAgent = agents.get(edge.source);
        const targetAgent = agents.get(edge.target);
        if (!sourceAgent || !targetAgent) return edge;
        
        return {
          ...edge,
          animated: targetAgent.status === 'running',
          data: {
            isActive: sourceAgent.status === 'completed' && targetAgent.status === 'running',
            isCompleted: sourceAgent.status === 'completed' && targetAgent.status === 'completed',
            isDarkMode,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18,
            color: targetAgent.status === 'running' ? '#fbbf24' :
                   targetAgent.status === 'completed' ? '#10b981' : isDarkMode ? '#4b5563' : '#d1d5db',
          },
        };
      });

      setNodes(updatedNodes);
      setEdges(updatedEdges);
    }
  }, [agents, setNodes, setEdges, fitView, layoutDirection, getLayoutedElements, isInteracting]);

  // Debounced graph updates
  useEffect(() => {
    if (updateTimer.current) clearTimeout(updateTimer.current);

    updateTimer.current = setTimeout(() => {
      if (!preventRerender.current && !isInteracting) {
        updateGraph();
      }
    }, 150);

    return () => {
      if (updateTimer.current) clearTimeout(updateTimer.current);
    };
  }, [agents, updateGraph, isInteracting]);

  // Force update all nodes when theme changes
  useEffect(() => {
    setNodes(prev => prev.map(node => ({
      ...node,
      data: {
        ...node.data,
        isDarkMode,
        _themeUpdate: Date.now(), // Force re-render
      },
    })));
    setEdges(prev => prev.map(edge => ({
      ...edge,
      data: {
        ...edge.data,
        isDarkMode,
      },
    })));
  }, [isDarkMode, setNodes, setEdges]);

  // Load tools (once)
  useEffect(() => {
    (async () => {
      try {
        setToolsLoading(true);
        const res = await fetch(`${window.location.origin}/api/v1/dynamic-tools/available`);
        if (res.ok) {
          const data = await res.json();
          const names: string[] = (data.tools || []).map((t: any) => t.name);
          const details: Record<string, { description?: string; category?: string }> = {};
          (data.tools || []).forEach((t: any) => {
            details[t.name] = { description: t.description, category: (t.capabilities || [])[0] };
          });
          setAvailableTools(names);
          setToolDetails(details);
          // Restore
          try {
            const rawSel = localStorage.getItem('flowswarm_selected_tools');
            if (rawSel) setSelectedTools(new Set(JSON.parse(rawSel)));
            // Removed restrictToSelected - no longer needed
          } catch {}
        }
      } finally {
        setToolsLoading(false);
      }
    })();
  }, []);

  // Keyboard shortcuts for replay navigation and panel resizing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Panel resize shortcuts
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '[') {
          e.preventDefault();
          setOutputPanelWidth(prev => Math.max(300, prev - 50)); // Decrease width (min: 300px)
        } else if (e.key === ']') {
          e.preventDefault();
          setOutputPanelWidth(prev => Math.min(800, prev + 50)); // Increase width (max: 800px)
        } else if (e.key === '\\') {
          e.preventDefault();
          setOutputPanelWidth(prev => prev <= 350 ? 500 : 300); // Toggle between collapsed and default
        } else if (e.key === '/') {
          e.preventDefault();
          setShowConversationPanel(prev => !prev); // Toggle conversation panel visibility
        }
      }

      // Replay navigation
      if (!replayMode) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (executionTrace.length === 0) return;
        setReplayIndex((i: number | null) => {
          const next = Math.max(0, (i ?? 0) - 1);
          const id = executionTrace[next];
          if (id) { setSelectedAgent(id); pendingFocusIdRef.current = id; focusAttemptsRef.current = 0; }
          return next;
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (executionTrace.length === 0) return;
        setReplayIndex((i: number | null) => {
          const next = Math.min(executionTrace.length - 1, (i ?? 0) + 1);
          const id = executionTrace[next];
          if (id) { setSelectedAgent(id); pendingFocusIdRef.current = id; focusAttemptsRef.current = 0; }
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [replayMode, executionTrace]);

  // Persist tool prefs
  useEffect(() => {
    try { localStorage.setItem('flowswarm_selected_tools', JSON.stringify(Array.from(selectedTools))); } catch {}
  }, [selectedTools]);

  // Persist chatbot panel width
  useEffect(() => {
    try { localStorage.setItem('chatbot_panel_width', outputPanelWidth.toString()); } catch {}
  }, [outputPanelWidth]);

  // Load saved parallel children overrides once
  useEffect(() => {
    try {
      const raw = localStorage.getItem('flowswarm_parallel_children');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') setChildrenOverrides(parsed);
      }
    } catch {}
  }, []);
  // Persist overrides on change
  useEffect(() => {
    try { localStorage.setItem('flowswarm_parallel_children', JSON.stringify(childrenOverrides)); } catch {}
  }, [childrenOverrides]);

  // WebSocket handlers
  const connectWebSocket = useCallback((execId: string, isReconnect: boolean = false) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setConnectionStatus('connecting');
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const startFrom = isReconnect ? '$' : '0';
    const port = window.location.hostname === 'localhost' ? '8000' : window.location.port || (protocol === 'wss:' ? '443' : '8000');
    const wsUrl = `${protocol}//${window.location.hostname}:${port}/api/v1/ws/${execId}?start_from=${startFrom}`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.onopen = () => {
      setConnectionStatus('connected');
      ws.send(JSON.stringify({ type: 'ping' }));
    };
    
    ws.onmessage = (event) => {
      try {
        const frame: Frame = JSON.parse(event.data);
        handleFrame(frame);
      } catch (error) {
        console.error('Parse error:', error);
      }
    };
    
    ws.onerror = () => {
      setConnectionStatus('error');
    };
    
    ws.onclose = (event) => {
      setConnectionStatus('disconnected');
      wsRef.current = null;
      
      if (isRunning && !event.wasClean) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket(execId, true);
        }, 2000);
      }
    };
  }, [isRunning]);

  const handleFrame = useCallback((frame: Frame) => {
    if (frame.frame_type === 'token') {
      handleTokenFrame(frame as TokenFrame);
    } else if (frame.frame_type === 'control') {
      handleControlFrame(frame as ControlFrame);
    }
  }, []);

  const handleTokenFrame = useCallback((frame: TokenFrame) => {
    const { agent_id, seq, text, final } = frame;
    
    const lastSeq = agentSequences.current.get(agent_id) || 0;
    if (seq === lastSeq) return;
    if (seq < lastSeq && !final) return;
    
    agentSequences.current.set(agent_id, seq);
    
    // Track streaming agents
    if (!final) {
      setActivelyStreamingAgents(prev => new Set(prev).add(agent_id));
    }
    
    setAgents(prev => {
      const updated = new Map(prev);
      const agent = updated.get(agent_id);
      
      if (agent) {
        updated.set(agent_id, {
          ...agent,
          output: final ? agent.output : agent.output + text
        });
      }
      
      return updated;
    });
  }, []);

  const handleControlFrame = useCallback((frame: ControlFrame) => {
    const { type, agent_id, payload } = frame;
    
    switch (type) {
      case 'graph_updated': {
        // ⚠️  PRESERVE EXISTING BLOCKS: Update only data, don't replace entire graph
        const machine: any = payload?.machine;
        if (machine && Array.isArray(machine.states)) {
          const states = machine.states as any[];
          const edges = (machine.edges || []) as any[];

          // Update existing nodes instead of replacing them
          setNodes(currentNodes => {
            const updatedNodes = currentNodes.map(existingNode => {
              const machineState = states.find(s => s.id === existingNode.id);
              if (machineState) {
                // Update the data of existing node while preserving position and type
                return {
                  ...existingNode,
                  data: {
                    ...existingNode.data,
                    // Update only essential data from machine state
                    status: existingNode.data.status, // Keep current status
                    tools: machineState.tools || existingNode.data.tools,
                    toolsPlanned: Array.isArray(machineState.tools) ? machineState.tools : existingNode.data.toolsPlanned,
                    description: machineState.description || existingNode.data.description,
                    agentRole: machineState.agent_role || existingNode.data.agentRole,
                  }
                };
              }
              return existingNode; // Keep unchanged if not in machine
            });

            // Add only new nodes that don't exist yet
            const existingIds = new Set(currentNodes.map(n => n.id));
            const newNodes = states
              .filter(state => !existingIds.has(state.id))
              .map((state: any) => ({
                id: state.id,
                type: 'agent',
                position: { x: Math.random() * 400, y: Math.random() * 400 },
                data: {
                  label: state.name,
                  name: state.name,
                  status: 'pending',
                  nodeType: state.type,
                  task: state.task,
                  tools: state.tools,
                  toolsPlanned: Array.isArray(state.tools) ? state.tools : [],
                  description: state.description,
                  agentRole: state.agent_role,
                  direction: layoutDirection,
                  isDarkMode,
                },
                targetPosition: layoutDirection === 'LR' ? Position.Left : Position.Top,
                sourcePosition: layoutDirection === 'LR' ? Position.Right : Position.Bottom,
              }));

            return [...updatedNodes, ...newNodes];
          });

          // Update edges similarly - preserve existing, add new ones
          setEdges(currentEdges => {
            const machineEdgeIds = new Set(edges.map((e: any) => `${e.source}-${e.target}-${e.event}`));
            const existingEdgeIds = new Set(currentEdges.map(e => e.id));

            // Keep existing edges that are still in the machine
            const preservedEdges = currentEdges.filter(edge => machineEdgeIds.has(edge.id));

            // Add new edges
            const newEdges = edges
              .filter((edge: any) => !existingEdgeIds.has(`${edge.source}-${edge.target}-${edge.event}`))
              .map((edge: any) => ({
                id: `${edge.source}-${edge.target}-${edge.event}`,
                source: edge.source,
                target: edge.target,
                type: 'smoothstep',
                animated: false,
                label: edge.event !== 'success' ? edge.event : '',
                labelStyle: { fill: '#94a3b8', fontSize: 11 },
                labelBgStyle: { fill: '#1e293b', fillOpacity: 0.8 },
                style: { stroke: '#52525b', strokeWidth: 1.5 },
                markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: '#52525b' },
              }));

            return [...preservedEdges, ...newEdges];
          });

          setHasStateMachineStructure(true);
          console.log('📊 Graph updated preserving existing blocks');
        }
        break;
      }
      case 'rerun_started': {
        setIsRunning(true);
        // soft reset visuals to show fresh run but preserve layout
        softReset();
        const id = payload?.start_state || agent_id;
        if (id) {
          pendingFocusIdRef.current = id;
          focusAttemptsRef.current = 0;
        }
        break;
      }
      case 'rerun_completed': {
        setIsRunning(false);
        break;
      }
      case 'state_machine_created': {
        // ⚠️ PRESERVE EXISTING BLOCKS: Don't replace user's blocks during execution
        const machine: any = payload?.machine;
        if (machine && Array.isArray(machine.states)) {
          const states = machine.states as any[];
          const edges = (machine.edges || []) as any[];

          // Update existing nodes, don't replace them
          setNodes(currentNodes => {
            // If we already have nodes (user created them), just update their data
            if (currentNodes.length > 0) {
              return currentNodes.map(existingNode => {
                const machineState = states.find(s => s.id === existingNode.id);
                if (machineState) {
                  return {
                    ...existingNode,
                    // Keep the existing node structure and position
                    data: {
                      ...existingNode.data,
                      // Only update execution-relevant data
                      tools: machineState.tools || existingNode.data.tools,
                      toolsPlanned: Array.isArray(machineState.tools) ? machineState.tools : existingNode.data.toolsPlanned,
                    }
                  };
                }
                return existingNode;
              });
            } else {
              // Only create new nodes if canvas is empty
              const newNodes: Node[] = states.map((state: any) => ({
                id: state.id,
                type: 'agent',
                position: { x: Math.random() * 400, y: Math.random() * 400 },
                data: {
                  label: state.name,
                  name: state.name,
                  status: 'pending',
                  nodeType: state.type,
                  task: state.task,
                  tools: state.tools,
                  toolsPlanned: Array.isArray(state.tools) ? state.tools : [],
                  description: state.description,
                  agentRole: state.agent_role,
                  direction: layoutDirection,
                  isDarkMode,
                },
                targetPosition: layoutDirection === 'LR' ? Position.Left : Position.Top,
                sourcePosition: layoutDirection === 'LR' ? Position.Right : Position.Bottom,
              }));
              const layouted = getLayoutedElements(newNodes, [], layoutDirection);
              return layouted.nodes;
            }
          });

          // Similarly for edges - preserve existing ones
          setEdges(currentEdges => {
            if (currentEdges.length > 0) {
              // Keep existing edges, just update if needed
              return currentEdges;
            } else {
              // Only create new edges if none exist
              const mappedEdges: Edge[] = edges.map((edge: any) => ({
                id: `${edge.source}-${edge.target}-${edge.event}`,
                source: edge.source,
                target: edge.target,
                type: 'smoothstep',
                animated: false,
                label: edge.event !== 'success' ? edge.event : '',
                labelStyle: { fill: '#94a3b8', fontSize: 11 },
                labelBgStyle: { fill: '#1e293b', fillOpacity: 0.8 },
                style: { stroke: '#52525b', strokeWidth: 1.5 },
                markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: '#52525b' },
              }));
              return mappedEdges;
            }
          });

          setHasStateMachineStructure(true);
          setPlanned(true);
          console.log('📊 State machine created - preserving existing blocks');
        }
        break;
      }
      case 'parallel_start': {
        setNodes(nodes => nodes.map(n => n.id === agent_id ? {
          ...n,
          data: {
            ...n.data,
            parallelRunning: true,
            parallelChildren: payload?.children || [],
            parallelCompleted: 0,
            parallelStartTs: Date.now(),
            parallelChildEvents: {}
          }
        } : n));
        break;
      }
      case 'parallel_child_completed': {
        const childId = payload?.child;
        const ev = payload?.event;
        setNodes(nodes => nodes.map(n => n.id === agent_id ? {
          ...n,
          data: {
            ...n.data,
            parallelCompleted: (n.data?.parallelCompleted || 0) + 1,
            parallelChildEvents: {
              ...(n.data as any)?.parallelChildEvents,
              [childId]: {
                event: ev,
                durationMs: Math.max(0, Date.now() - ((n.data as any)?.parallelStartTs || Date.now()))
              }
            }
          }
        } : n));
        break;
      }
      case 'parallel_aggregated': {
        setNodes(nodes => nodes.map(n => n.id === agent_id ? {
          ...n,
          data: { ...n.data, parallelRunning: false, parallelSummary: payload?.next_event }
        } : n));
        break;
      }
      case 'parallel_start': {
        setNodes(nodes => nodes.map(n => n.id === agent_id ? {
          ...n,
          data: { ...n.data, parallelRunning: true, parallelChildren: payload?.children || [] }
        } : n));
        if (payload?.children) {
          const childSet = new Set<string>(payload.children);
          setEdges(edges => edges.map(e => childSet.has(e.source) && e.target === agent_id ? {
            ...e,
            style: { ...e.style, stroke: '#fde047', strokeWidth: 3 },
          } : e));
          setTimeout(() => {
            setEdges(edges => edges.map(e => childSet.has(e.source) && e.target === agent_id ? {
              ...e,
              style: { ...e.style, stroke: '#94a3b8', strokeWidth: 2 },
            } : e));
          }, 800);
        }
        break;
      }
      case 'parallel_child_completed': {
        const childId = payload?.child;
        setNodes(nodes => nodes.map(n => n.id === agent_id ? {
          ...n,
          data: { ...n.data, parallelCompleted: (n.data?.parallelCompleted || 0) + 1 }
        } : n));
        if (childId) {
          setEdges(edges => edges.map(e => e.source === childId && e.target === agent_id ? {
            ...e,
            style: { ...e.style, stroke: payload?.event === 'failure' ? '#ef4444' : '#22c55e', strokeWidth: 3 },
          } : e));
          setTimeout(() => {
            setEdges(edges => edges.map(e => e.source === childId && e.target === agent_id ? {
              ...e,
              style: { ...e.style, stroke: '#94a3b8', strokeWidth: 2 },
            } : e));
          }, 900);
        }
        break;
      }
      case 'parallel_aggregated': {
        const nextEvent = payload?.next_event;
        setNodes(nodes => nodes.map(n => n.id === agent_id ? {
          ...n,
          data: { ...n.data, parallelRunning: false, parallelSummary: nextEvent, parallelCompleted: 0 }
        } : n));
        break;
      }
      case 'tool_preferences': {
        const unknown = Array.isArray(payload?.unknown) ? payload.unknown : [];
        const effective = Array.isArray(payload?.effective) ? payload.effective : [];
        setToolPrefs({ unknown, effective });
        break;
      }
      case 'state_progress':
        // Update node with progress
        setNodes(nodes => nodes.map(node => 
          node.id === agent_id 
            ? { 
                ...node, 
                data: { 
                  ...node.data, 
                  progress: payload.progress,
                  tokens: payload.tokens,
                  toolCalls: payload.tool_calls 
                } as NodeData
              }
            : node
        ));
        break;

      case 'edge_fired':
        // Animate edge activation
        const { source, target, event } = payload;
        setEdges(edges => edges.map(edge => 
          edge.source === source && edge.target === target
            ? { ...edge, data: { ...edge.data, isActive: true, event } as EdgeData }
            : edge
        ));
        // Clear after animation
        setTimeout(() => {
          setEdges(edges => edges.map(edge => 
            edge.source === source && edge.target === target
              ? { ...edge, data: { ...edge.data, isActive: false } as EdgeData }
              : edge
          ));
        }, 1500);
        break;

      case 'dag_structure':
        // Switch to DAG structure mode
        setHasStateMachineStructure(false);
        // Handle DAG structure from dynamic coordinator
        if (payload?.nodes && payload?.edges) {
          const { nodes: dagNodes, edges: dagEdges } = payload;
          
          // Convert DAG nodes to React Flow nodes with proper layout
          const newNodes: Node<NodeData>[] = dagNodes.map((node: any, index: number) => ({
            id: node.id,
            type: 'agent',
            position: { x: 0, y: 0 }, // Will be set by layout
            data: {
              label: node.name,
              name: node.name,
              agentRole: node.role,
              task: node.task,
              status: 'pending',
              nodeType: node.type,
              group: node.group,
              round: node.round || node.depth || 0,
              direction: layoutDirection,
            } as NodeData,
            targetPosition: layoutDirection === 'LR' ? Position.Left : Position.Top,
            sourcePosition: layoutDirection === 'LR' ? Position.Right : Position.Bottom,
          }));
          
          // Convert DAG edges to React Flow edges
          const newEdges: Edge<EdgeData>[] = dagEdges.map((edge: any) => ({
            id: `${edge.source}-${edge.target}`,
            source: edge.source,
            target: edge.target,
            type: 'smoothstep',
            animated: false,
            data: {
              label: edge.type === 'dependency' ? '' : edge.type,
            } as EdgeData,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: '#94a3b8',
            },
            style: {
              strokeWidth: 2,
              stroke: '#94a3b8',
            },
          }));
          
          // Apply layout for proper grid positioning
          
          const layouted = getLayoutedElements(newNodes, newEdges, layoutDirection);
          setNodes(prevNodes => {
            // Merge with existing nodes if any
            const existingNodeIds = new Set(prevNodes.map(n => n.id));
            const nodesToAdd = layouted.nodes.filter(n => !existingNodeIds.has(n.id));
            return [...prevNodes, ...nodesToAdd];
          });
          setEdges(prevEdges => {
            // Merge with existing edges if any
            const existingEdgeIds = new Set(prevEdges.map(e => e.id));
            const edgesToAdd = layouted.edges.filter(e => !existingEdgeIds.has(e.id));
            return [...prevEdges, ...edgesToAdd];
          });

          // Fit view to show the complete DAG
          setTimeout(() => {
            try {
              fitView({ padding: 0.2, duration: 400, maxZoom: 1 });
            } catch (e) {
              // Ignore fit view errors
            }
          }, 100);
        }
        break;
        
      case 'state_machine_created':
        // AI has created a state machine - visualize it
        if (payload?.machine) {
          const { states, edges } = payload.machine;
          
          // Convert to React Flow nodes
          const newNodes: Node[] = states.map((state: any) => ({
            id: state.id,
            type: 'agent',
            position: { x: 0, y: 0 },
            data: {
              label: state.name,
              name: state.name,
              status: 'pending',
              nodeType: state.type,
              task: state.task,
              tools: state.tools,
              toolsPlanned: Array.isArray(state.tools) ? state.tools : [],
              description: state.description,
              agentRole: state.agent_role,
              direction: layoutDirection,
              isDarkMode,
            },
            targetPosition: layoutDirection === 'LR' ? Position.Left : Position.Top,
            sourcePosition: layoutDirection === 'LR' ? Position.Right : Position.Bottom,
          }));
          
          // Convert to React Flow edges
          const mappedEdges: Edge[] = edges.map((edge: any) => ({
            id: `${edge.source}-${edge.target}-${edge.event}`,
            source: edge.source,
            target: edge.target,
            type: 'smoothstep',
            animated: false,
            label: edge.event !== 'success' ? edge.event : '',
            labelStyle: { fill: '#94a3b8', fontSize: 11 },
            labelBgStyle: { fill: '#1e293b', fillOpacity: 0.8 },
            style: {
              stroke: '#52525b',
              strokeWidth: 1.5,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: '#52525b',
            },
          }));
          // Deduplicate edges by id to avoid React key collisions
          const edgeMap = new Map<string, Edge>();
          for (const e of mappedEdges) {
            if (!edgeMap.has(e.id)) edgeMap.set(e.id, e);
          }
          const newEdges = Array.from(edgeMap.values());
          
          // Apply layout and set
          
          const layouted = getLayoutedElements(newNodes, newEdges, layoutDirection);
          // Cache and mark structure as state-machine-driven so we don't overwrite it
          layoutCache.current = layouted;
          lastLayoutedAgentIds.current = new Set(states.map((s: any) => s.id));
          setHasStateMachineStructure(true);
          setNodes(layouted.nodes);
          setEdges(layouted.edges);
          
          setTimeout(() => fitView({ padding: 0.2, duration: 400, maxZoom: 1 }), 100);
        }
        break;
        
      case 'next_state_preview':
        // Preview the next state that will be executed
        if (payload?.next_state_id) {
          setNextExecutingNode(payload.next_state_id);

          // Highlight the next node
          setNodes(nodes => nodes.map(node => {
            if (node.id === payload.next_state_id) {
              return {
                ...node,
                data: {
                  ...node.data,
                  isNextToExecute: true,
                  nextStepPreview: payload.preview_text || 'Next step'
                }
              };
            }
            return node;
          }));
        }
        break;

      case 'human_decision_required':
        if (payload?.state && payload?.allowed_events) {
          const st = payload.state;
          setDecisionPrompt({
            stateId: st.id,
            name: st.name,
            description: st.description,
            allowed: payload.allowed_events as string[],
          });

          // Focus on the node that requires decision
          setTimeout(() => {
            const nodeToFocus = nodes.find(n => n.id === st.id);
            if (nodeToFocus) {
              const x = nodeToFocus.position.x + 110; // Center of node (width/2)
              const y = nodeToFocus.position.y + 50;  // Center of node (height/2)
              setCenter(x, y, { zoom: 1.2, duration: 500 });
              setSelectedAgent(st.id);

              // Highlight the node
              setNodes(prevNodes => prevNodes.map(n => ({
                ...n,
                selected: n.id === st.id,
                data: {
                  ...n.data,
                  highlighted: n.id === st.id,
                },
              })));
            }
          }, 100);
        }
        break;

      case 'state_tools_resolved': {
        const { state_id, tools } = payload || {};
        if (!state_id) break;
        setNodes(nodes => nodes.map(n => (
          n.id === state_id ? { ...n, data: { ...n.data, toolsPlanned: Array.isArray(tools) ? tools : [] } } : n
        )));
        break;
      }
        
      case 'state_entered':
        // A state is being executed
        if (agent_id) {
          // Capture state execution data for raw viewer
          setStateExecutionData(prev => {
            const existingIndex = prev.findIndex(d => d.stateId === agent_id);
            const newData = {
              stateId: agent_id,
              stateName: payload?.state?.name || agent_id,
              timestamp: frame.ts || Date.now() / 1000,
              input: payload,
              output: null,
              context: payload?.state || {},
              transitions: payload?.state?.transitions || {},
            };

            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = { ...updated[existingIndex], ...newData };
              return updated;
            }
            return [...prev, newData];
          });

          setActivelyStreamingAgents(prev => new Set(prev).add(agent_id));
          setAgents(prev => {
            const updated = new Map(prev);
            updated.set(agent_id, {
              id: agent_id,
              name: payload?.state?.name || agent_id,
              output: '',
              status: 'running',
              startTime: Date.now(),
              parent: payload?.parent,
              depth: payload?.depth || 0
            });
            return updated;
          });
          
          // Update node visualization
          setNodes(nodes => 
            nodes.map(node => ({
              ...node,
              data: {
                ...node.data,
                status: node.id === agent_id ? 'running' : node.data.status,
              },
            }))
          );
          // Append to trace (de-dupe consecutive)
          setExecutionTrace((prev: string[]) => (prev.length === 0 || prev[prev.length - 1] !== agent_id) ? [...prev, agent_id] : prev);
          // Request focus on this node; loop will center when ready
          if (followActiveRef.current) {
            pendingFocusIdRef.current = agent_id;
            focusAttemptsRef.current = 0;
          }
        }
        break;
        
      case 'state_exited':
        // State completed execution
        if (agent_id) {
          // Update state execution data with output
          setStateExecutionData(prev => {
            const existingIndex = prev.findIndex(d => d.stateId === agent_id);
            if (existingIndex >= 0) {
              const updated = [...prev];
              const startTime = updated[existingIndex].timestamp;
              updated[existingIndex] = {
                ...updated[existingIndex],
                output: payload?.result || payload,
                nextEvent: payload?.next_event,
                duration: ((frame.ts || Date.now() / 1000) - startTime) * 1000
              };
              return updated;
            }
            return prev;
          });

          setActivelyStreamingAgents(prev => {
            const updated = new Set(prev);
            updated.delete(agent_id);
            return updated;
          });

          setAgents(prev => {
            const updated = new Map(prev);
            const agent = updated.get(agent_id);
            if (agent) {
              updated.set(agent_id, {
                ...agent,
                status: 'completed',
                endTime: Date.now(),
                output: payload?.result || agent.output,
              });
            }
            return updated;
          });
          
          // Update node visualization
          setNodes(nodes => 
            nodes.map(node => ({
              ...node,
              data: {
                ...node.data,
                status: node.id === agent_id ? 'completed' : node.data.status,
              },
            }))
          );
        }
        break;

      case 'tool_use': {
        const toolName = payload?.tool || payload?.name;
        if (!agent_id || !toolName) break;

        // Update execution history with tool
        setExecutionHistory(prev => {
          const updated = new Map(prev);
          const history = updated.get(agent_id);
          if (history) {
            updated.set(agent_id, {
              ...history,
              tools: [...history.tools, toolName]
            });
          }
          return updated;
        });

        // Update node to show current tool being executed with block context
        setNodes(nodes => nodes.map(node => {
          if (node.id === agent_id) {
            const blockName = node.data.name || agent_id;
            return {
              ...node,
              data: {
                ...node.data,
                currentAction: `${blockName} → ${toolName}`,
                currentActionDetail: `Tool: ${toolName}`,
                activeTools: [...(node.data.activeTools || []), toolName]
              }
            };
          }
          return node;
        }));

        // Update agents map with tool usage
        setAgents(prev => {
          const updated = new Map(prev);
          const ag = updated.get(agent_id);
          if (ag) {
            const tools = new Set((ag as any).tools || []);
            tools.add(toolName);
            (ag as any).tools = Array.from(tools);
            updated.set(agent_id, ag);
          }
          return updated;
        });
        // Update node badges
        setNodes(nodes => nodes.map(n => {
          if (n.id !== agent_id) return n;
          const current = new Set<string>(Array.isArray(n.data?.toolsUsed) ? n.data.toolsUsed : []);
          current.add(toolName);
          return { ...n, data: { ...n.data, toolsUsed: Array.from(current) } };
        }));
        break;
      }
        
      case 'agent_started':
        if (agent_id) {
          setActivelyStreamingAgents(prev => new Set(prev).add(agent_id));
          setCurrentExecutingNode(agent_id);
          setIsExecuting(true);

          // Increment execution order and track history
          const newOrder = executionOrderCounter + 1;
          setExecutionOrderCounter(newOrder);

          // Auto-scroll to the executing node
          setTimeout(() => {
            const nodeElement = document.querySelector(`[data-id="${agent_id}"]`);
            if (nodeElement) {
              nodeElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            }
          }, 100);

          setAgents(prev => {
            const updated = new Map(prev);
            updated.set(agent_id, {
              id: agent_id,
              name: payload?.name || agent_id,
              output: '',
              status: 'running',
              startTime: Date.now(),
              parent: payload?.parent,
              depth: payload?.depth || 0
            });
            return updated;
          });

          // Update node status in graph with detailed execution info
          setNodes(nodes =>
            nodes.map(node => {
              if (node.id === agent_id) {
                const blockName = node.data.name || payload?.name || agent_id;
                const blockType = node.data.type || 'process';

                // Update execution history
                setExecutionHistory(prev => {
                  const updated = new Map(prev);
                  updated.set(agent_id, {
                    order: newOrder,
                    startTime: Date.now(),
                    status: 'running',
                    actions: [],
                    tools: [],
                    blockName,
                    blockType
                  });
                  return updated;
                });

                return {
                  ...node,
                  data: {
                    ...node.data,
                    status: 'running',
                    isExecuting: true,
                    executionOrder: newOrder,
                    currentActionDetail: `Executing ${blockName} (${blockType})`,
                    executionStartTime: Date.now()
                  },
                };
              }
              // Dim nodes that haven't been executed yet
              const wasExecuted = executionHistory.has(node.id);
              return {
                ...node,
                data: {
                  ...node.data,
                  status: node.data.status,
                  isDimmed: !wasExecuted && node.id !== agent_id
                },
              };
            })
          );
          
          // Animate edges leading to this node
          setEdges(edges =>
            edges.map(edge => ({
              ...edge,
              animated: edge.target === agent_id,
              style: {
                ...edge.style,
                stroke: edge.target === agent_id ? '#facc15' : edge.style?.stroke || '#52525b',
              },
            }))
          );
          // Append to trace (de-dupe consecutive)
          setExecutionTrace((prev: string[]) => (prev.length === 0 || prev[prev.length - 1] !== agent_id) ? [...prev, agent_id] : prev);
          if (followActiveRef.current) {
            pendingFocusIdRef.current = agent_id;
            focusAttemptsRef.current = 0;
          }
        }
        break;
        
      case 'agent_spawned':
        if (payload?.id) {
          setAgents(prev => {
            const updated = new Map(prev);
            updated.set(payload.id, {
              id: payload.id,
              name: payload.name || payload.id,
              status: 'pending',
              output: '',
              parent: payload.parent,
              depth: (payload.depth || 0) + 1
            });
            return updated;
          });
        }
        break;
        
      case 'agent_completed':
        if (agent_id) {
          setActivelyStreamingAgents(prev => {
            const updated = new Set(prev);
            updated.delete(agent_id);
            return updated;
          });

          // Update execution history with completion
          setExecutionHistory(prev => {
            const updated = new Map(prev);
            const history = updated.get(agent_id);
            if (history) {
              updated.set(agent_id, {
                ...history,
                endTime: Date.now(),
                status: 'completed'
              });
            }
            return updated;
          });

          // Clear current executing node
          if (currentExecutingNode === agent_id) {
            setCurrentExecutingNode(null);
          }

          setAgents(prev => {
            const updated = new Map(prev);
            const agent = updated.get(agent_id);
            if (agent) {
              updated.set(agent_id, {
                ...agent,
                status: 'completed',
                endTime: Date.now()
              });
            }
            return updated;
          });

          // Update node status in graph - keep execution history visible
          setNodes(nodes =>
            nodes.map(node => {
              if (node.id === agent_id) {
                const history = executionHistory.get(agent_id);
                const duration = history && history.startTime ? Date.now() - history.startTime : undefined;
                return {
                  ...node,
                  data: {
                    ...node.data,
                    status: 'completed',
                    isExecuting: false,
                    wasExecuted: true,
                    executionOrder: history?.order,
                    executionDuration: duration,
                    executionDurationText: duration ? `${(duration / 1000).toFixed(1)}s` : undefined,
                    executedTools: history?.tools || [],
                    currentAction: undefined,
                    currentActionDetail: undefined,
                    activeTools: []
                  },
                };
              }
              return {
                ...node,
                data: {
                  ...node.data,
                  // Remove dimming from other executed nodes
                  isDimmed: !executionHistory.has(node.id) ? node.data.isDimmed : false
                }
              };
            })
          );
          
          // Update edges to show completion and execution path
          setEdges(edges =>
            edges.map(edge => {
              // Check if both source and target have been executed
              const sourceExecuted = executionHistory.has(edge.source);
              const targetExecuted = executionHistory.has(edge.target);
              const isExecutionPath = sourceExecuted && targetExecuted;

              return {
                ...edge,
                animated: false,
                className: isExecutionPath ? 'execution-path-edge' : '',
                style: {
                  ...edge.style,
                  stroke: isExecutionPath ? '#10b981' :
                         edge.source === agent_id ? '#22c55e' :
                         edge.style?.stroke || '#52525b',
                  strokeWidth: isExecutionPath ? 3 : 2,
                },
              };
            })
          );
        }
        break;
        
      case 'workflow_completed': {
        setIsRunning(false);
        setIsExecuting(false);
        setCurrentExecutingNode(null);
        setNextExecutingNode(null);
        setActivelyStreamingAgents(new Set());
        setExecutionActions(new Map());
        setConnectionStatus('connected');

        setNodes(nodes => nodes.map(node => ({
          ...node,
          data: {
            ...node.data,
            isExecuting: false,
            isDimmed: false,
            currentAction: undefined,
            currentActionDetail: undefined,
            activeTools: []
          }
        })));
        break;
      }

      case 'workflow_failed': {
        setIsRunning(false);
        setIsExecuting(false);
        setCurrentExecutingNode(null);
        setNextExecutingNode(null);
        setActivelyStreamingAgents(new Set());
        setExecutionActions(new Map());
        setConnectionStatus('error');

        setNodes(nodes => nodes.map(node => ({
          ...node,
          data: {
            ...node.data,
            isExecuting: false,
            currentAction: undefined,
            currentActionDetail: undefined,
            activeTools: []
          }
        })));
        break;
      }

      case 'error':
        if (agent_id) {
          setActivelyStreamingAgents(prev => {
            const updated = new Set(prev);
            updated.delete(agent_id);
            return updated;
          });
          setAgents(prev => {
            const updated = new Map(prev);
            const agent = updated.get(agent_id);
            if (agent) {
              updated.set(agent_id, {
                ...agent,
                status: 'failed',
                error: payload?.error || 'Unknown error',
                endTime: Date.now()
              });
            }
            return updated;
          });
        }
        break;
        
      case 'session_end':
        setIsRunning(false);
        setActivelyStreamingAgents(new Set());
        break;
    }
  }, []);

  const rerunFromSelected = useCallback(async () => {
    if (!executionId || !selectedAgent) return;
    try {
      await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/${executionId}/rerun_from`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_state_id: selectedAgent })
      });
    } catch (e) {
      console.error('Failed to rerun from node', e);
    }
  }, [executionId, selectedAgent]);

  const addAgentAndRerun = useCallback(async () => {
    if (!executionId || !selectedAgent) return;
    try {
      const newId = window.prompt('New agent id (slug_case):');
      if (!newId) return;
      const newName = window.prompt('Display name:', newId.replace(/_/g, ' '));
      if (!newName) return;
      const type = window.prompt('Type (analysis|tool_call|decision|parallel|final):', 'analysis') || 'analysis';
      const desc = window.prompt('Short description of this agent/task:', '') || '';
      const event = window.prompt(`Event from ${selectedAgent} to ${newId} (e.g., success|failure|custom):`, 'success') || 'success';

      const patch = {
        states: [
          {
            id: newId,
            name: newName,
            type,
            task: desc || newName,
            description: desc,
            agent_role: 'Custom Agent'
          }
        ],
        edges: [
          { source: selectedAgent, target: newId, event }
        ]
      };

      await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/${executionId}/rerun_from`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_state_id: selectedAgent, graph_patch: patch })
      });
    } catch (e) {
      console.error('Failed to add agent and rerun', e);
    }
  }, [executionId, selectedAgent]);

  const startExecution = async () => {
    if (!task.trim() || isRunning) return;

    setIsRunning(true);
    setStateExecutionData([]); // Clear previous execution data

    // If there are no nodes, first plan the workflow
    if (nodes.length === 0 && executionMode === 'dynamic') {
      try {
        // Step 1: Plan the workflow
        const planRes = await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/plan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task,
            tool_preferences: {
              selected_tools: Array.from(selectedTools),
              restrict_to_selected: selectedTools.size > 0,
              use_enhanced_blocks: true
            }
          })
        });

        if (!planRes.ok) throw new Error(`Plan HTTP error! status: ${planRes.status}`);

        const planData = await planRes.json();

        if (!planData.machine) {
          console.warn('Plan response did not include a machine definition.');
          setIsRunning(false);
          return;
        }

        // Import the generated workflow
        await importStateMachine(planData.machine, true, false);

        // Wait a bit for the UI to update
        await new Promise(resolve => setTimeout(resolve, 500));

        // Keep UI interactive after planning; execution can be triggered explicitly once blocks are reviewed
        setIsRunning(false);
        setConnectionStatus('disconnected');
        setExecutionId(null);
      } catch (error) {
        console.error('Workflow planning failed:', error);
        setIsRunning(false);
        setConnectionStatus('error');
      }
      return;
    }

    // If nodes exist or not dynamic mode, execute directly
    // ⚠️ PRESERVE USER BLOCKS: Only clear if there are absolutely no nodes
    // This prevents accidental clearing of manually created blocks
    if (nodes.length > 0) {
      // Always prefer soft reset to preserve user's work
      softReset();
    } else {
      // Only do full reset if canvas is completely empty
      resetView();
    }
    setIsRunning(true);
    agentSequences.current.clear();

    try {
      if (nodes.length > 0) {
        // Execute with existing machine
        const machine = buildMachineFromGraph();
        const response = await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task,
            machine,
            tool_preferences: {
              selected_tools: Array.from(selectedTools),
              restrict_to_selected: selectedTools.size > 0
            }
          })
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        setExecutionId(data.exec_id);
        setTimeout(() => connectWebSocket(data.exec_id, false), 100);
      } else {
        // Non-dynamic mode without nodes
        const requestBody = {
          task,
          execution_mode: executionMode,
          use_mock: false,
          max_parallel: 5,
          tool_preferences: {
            selected_tools: Array.from(selectedTools),
            restrict_to_selected: selectedTools.size > 0,
          }
        };

        const response = await fetch(`${window.location.origin}/api/v1/streaming/stream/v2`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        setExecutionId(data.exec_id);
        setTimeout(() => connectWebSocket(data.exec_id, false), 100);
      }
    } catch (error) {
      console.error('Failed:', error);
      setIsRunning(false);
      setConnectionStatus('error');
    }
  };

  // Build machine from current graph (nodes/edges)
  const buildMachineFromGraph = useCallback(() => {
    const states = nodes.map((n:any)=>{
      // Handle professional and enhanced nodes
      if (n.type === 'professional' || n.type === 'enhanced') {
        return {
          id: n.id,
          name: n.data.name || n.id,
          type: n.data.type || 'analysis',
          description: n.data.description || '',
          agent_role: n.data.agent_role || 'Agent',
          tools: n.data.tools || [],
          transitions: n.data.transitions || {},
          enabled: n.data.enabled !== false
        };
      }
      // Handle regular nodes
      return {
        id: n.id,
        name: n.data?.name || n.data?.label || n.id,
        type: n.data?.nodeType || 'analysis',
        description: n.data?.description || '',
        agent_role: n.data?.agentRole || '',
        tools: Array.isArray(n.data?.toolsPlanned)? n.data.toolsPlanned : []
      };
    });
    const edgesJson = edges.map((e:any)=>({ source: e.source, target: e.target, event: (e.label && typeof e.label==='string' && e.label.length>0)? e.label : 'success' }));
    // Find the initial state - look for nodes with no incoming edges, or named 'start'/'initial'
    const nodesWithNoIncoming = nodes.filter(n =>
      !edges.some(e => e.target === n.id)
    );
    let initial = nodesWithNoIncoming[0]?.id || nodes[0]?.id || 'start';

    // Prefer nodes explicitly named 'start' or 'initial'
    const startNode = nodes.find(n =>
      n.data.name?.toLowerCase() === 'start' ||
      n.data.name?.toLowerCase() === 'initial' ||
      n.id === 'start' ||
      n.id === 'initial'
    );
    if (startNode) {
      initial = startNode.id;
    }

    return { name: `User Planned Workflow`, initial_state: initial, states, edges: edgesJson };
  }, [nodes, edges]);

  // Add professional block function
  // Add tool block to canvas - now unified with backend Strands tools
  const addToolBlock = useCallback(async (toolName: string, schema?: ToolSchema, position?: { x: number; y: number }) => {
    // Get schema from unified service if not provided
    const toolSchema = schema || await unifiedToolService.getToolSchema(toolName);

    if (!toolSchema) {
      console.warn(`Tool schema not found for ${toolName}`);
      return;
    }

    // Check if tool is available in UI
    if (toolSchema.available_in_ui === false) {
      console.warn(`Tool ${toolName} is not available for UI usage`);
      return;
    }

    const nodePosition = position || {
      x: Math.random() * 400 + 200,
      y: Math.random() * 300 + 100
    };

    const newNode: Node = {
      id: uuidv4(),
      type: 'tool',
      position: nodePosition,
      data: {
        type: 'tool',
        name: toolSchema.display_name || toolName.replace(/_/g, ' '),
        toolName: toolName,
        toolSchema: toolSchema,
        parameters: {},
        category: toolSchema.category,
        icon: toolSchema.icon,
        color: toolSchema.color,
        available_in_agents: toolSchema.available_in_agents,
        enabled: true,
        advancedMode: false,
        isWide: false,
        onToggleEnabled: (id: string) => {
          setNodes((nds) =>
            nds.map((node) =>
              node.id === id
                ? { ...node, data: { ...node.data, enabled: !node.data.enabled } }
                : node
            )
          );
        },
        onToggleAdvanced: (id: string) => {
          setNodes((nds) =>
            nds.map((node) =>
              node.id === id
                ? { ...node, data: { ...node.data, advancedMode: !node.data.advancedMode } }
                : node
            )
          );
        },
        onToggleWide: (id: string) => {
          setNodes((nds) =>
            nds.map((node) =>
              node.id === id
                ? { ...node, data: { ...node.data, isWide: !node.data.isWide } }
                : node
            )
          );
        },
        onUpdate: (id: string, updates: any) => {
          setNodes((nds) =>
            nds.map((node) =>
              node.id === id
                ? { ...node, data: { ...node.data, ...updates } }
                : node
            )
          );
        },
        onDelete: (id: string) => {
          setNodes((nds) => nds.filter((node) => node.id !== id));
          setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
        },
        onDuplicate: (id: string) => {
          const nodeToDuplicate = nodes.find((node) => node.id === id);
          if (nodeToDuplicate) {
            const duplicatedNode = {
              ...nodeToDuplicate,
              id: uuidv4(),
              position: {
                x: nodeToDuplicate.position.x + 50,
                y: nodeToDuplicate.position.y + 50
              }
            };
            setNodes((nds) => [...nds, duplicatedNode]);
          }
        },
        onExecuteTool: async (id: string, toolName: string, parameters: any) => {
          // Execute tool through unified backend endpoint for Strands compatibility
          try {
            // Resolve placeholders (DRY utility)
            const { ok, params: resolvedParams, error: resolveError } = await resolveUserInputsInParams(parameters);
            if (!ok || !resolvedParams) {
              setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, status: 'needs_input', executionError: resolveError || 'Input required' } } : n));
              throw new Error(resolveError || 'Input required');
            }

            // Persist resolved params back to node
            setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, parameters: resolvedParams } } : n));

            // Validate parameters before execution
            const precheck = await stateMachineAdapter.validateParameters(toolName, resolvedParams);
            if (!precheck.valid) {
              setNodes((nds) =>
                nds.map((node) =>
                  node.id === id
                    ? { ...node, data: { ...node.data, status: 'needs_input', executionError: precheck.message } }
                    : node
                )
              );
              throw new Error(precheck.message || 'Missing required parameters');
            }
            // Update status to running
            setNodes((nds) =>
              nds.map((node) =>
                node.id === id
                  ? { ...node, data: { ...node.data, status: 'running', isExecuting: true } }
                  : node
              )
            );

            // Create workflow request for unified execution
            const workflowRequest = {
              workflow_id: `tool-exec-${id}`,
              blocks: [{
                id: id,
                type: 'tool',
                tool_name: toolName,
                parameters: resolvedParams,
                position: { x: 0, y: 0 },
                connections: []
              }],
              edges: [],
              context: {},
              use_agents: false // Direct tool execution
            };

            const response = await fetch(`http://localhost:8000/api/v1/unified/execute-workflow`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
              },
              body: JSON.stringify(workflowRequest)
            });

            const data = await response.json();

            if (response.ok && data.success) {
              console.log('Tool execution result:', data);

              // Get the actual result from the correct location
              const blockResult = data.results?.[id] || data.result;

              // Update node with success status and result
              setNodes((nds) =>
                nds.map((node) =>
                  node.id === id
                    ? {
                        ...node,
                        data: {
                          ...node.data,
                          status: 'completed',
                          isCompleted: true,
                          isExecuting: false,
                          executionResult: blockResult,
                          executionError: blockResult?.error || undefined
                        }
                      }
                    : node
                )
              );

              // Prefill dependent nodes if any
              try {
                const outgoingTargets = edges.filter(e => e.source === id).map(e => e.target);
                setNodes(nds => nds.map(node => {
                  if (outgoingTargets.includes(node.id) && (node.type === 'toolBlock' || node.data?.type === 'tool')) {
                    const tname = node.data?.toolName;
                    if (tname === 'python_repl') {
                      const params = { ...(node.data?.parameters || {}) };
                      if (!params.code) {
                        params.code = (stateMachineAdapter as any).generateCodeFromResults ? (stateMachineAdapter as any).generateCodeFromResults(data.result) : '';
                        return { ...node, data: { ...node.data, parameters: params } };
                      }
                    }
                  }
                  return node;
                }));
              } catch {}

              // Return the result for the component to display
              return data.result;
            } else {
              // Handle error
              const errorMessage = data.error || data.detail || 'Execution failed';

              setNodes((nds) =>
                nds.map((node) =>
                  node.id === id
                    ? {
                        ...node,
                        data: {
                          ...node.data,
                          status: 'failed',
                          isError: true,
                          isExecuting: false,
                          executionError: errorMessage,
                          executionResult: undefined
                        }
                      }
                    : node
                )
              );

              throw new Error(errorMessage);
            }
          } catch (error: any) {
            console.error('Failed to execute tool:', error);

            setNodes((nds) =>
              nds.map((node) =>
                node.id === id
                  ? {
                      ...node,
                      data: {
                        ...node.data,
                        status: node.data?.status === 'needs_input' ? 'needs_input' : 'failed',
                        isError: true,
                        isExecuting: false,
                        executionError: error.message || 'Failed to execute tool',
                        executionResult: undefined
                      }
                    }
                  : node
              )
            );

            throw error;
          }
        }
      }
    };

    setNodes((nds) => [...nds, newNode]);
  }, [nodes, setNodes, setEdges]);

  // Unified block addition handler
  const addUnifiedBlock = useCallback((blockConfig: BlockConfig, position?: { x: number; y: number }) => {
    const nodePosition = position || {
      x: Math.random() * 400 + 200,
      y: Math.random() * 300 + 100
    };

    if (blockConfig.type === 'tool' && blockConfig.toolSchema) {
      // Add tool block
      addToolBlock(blockConfig.toolName!, blockConfig.toolSchema, nodePosition);
    } else {
      // Add professional/workflow block
      const toolsList = blockConfig.tools || [];
      const newNode: Node = {
        id: uuidv4(),
        type: 'professional',
        position: nodePosition,
        data: {
          type: blockConfig.subType,
          name: blockConfig.name || `${blockConfig.subType.charAt(0).toUpperCase() + blockConfig.subType.slice(1)} ${nodes.length + 1}`,
          description: blockConfig.description || '',
          agent_role: blockConfig.agent_role || 'Agent',
          tools: toolsList,  // Modern field name
          toolsPlanned: toolsList,  // Legacy compatibility
          transitions: {},
          enabled: true,
          advancedMode: false,
          isWide: false,
          isDarkMode,
          nodeType: blockConfig.subType as any,
          icon: blockConfig.icon,
          color: blockConfig.color,
          category: blockConfig.category
        }
      };
      setNodes((nds) => [...nds, newNode]);
    }
  }, [nodes.length, setNodes, isDarkMode, addToolBlock]);

  // Legacy wrapper for compatibility
  const addProfessionalBlock = useCallback((type: string = 'analysis', position?: { x: number; y: number }) => {
    const nodePosition = position || {
      x: Math.random() * 400 + 200,
      y: Math.random() * 300 + 100
    };

    const newNode: Node = {
      id: uuidv4(),
      type: 'professional',
      position: nodePosition,
      data: {
        type: type,
        name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${nodes.length + 1}`,
        description: '',
        agent_role: type === 'analysis' ? 'Analyst' : type === 'tool_call' ? 'Executor' : 'Agent',
        tools: type === 'tool_call' ? Array.from(selectedTools).slice(0, 3) : [],
        transitions: {
          success: null,
          failure: null
        },
        enabled: true,
        advancedMode: false,
        isWide: false,
        availableTools: availableTools,
        onToggleEnabled: (id: string) => {
          setNodes((nds) =>
            nds.map((node) =>
              node.id === id
                ? { ...node, data: { ...node.data, enabled: !node.data.enabled } }
                : node
            )
          );
        },
        onToggleAdvanced: (id: string) => {
          setNodes((nds) =>
            nds.map((node) =>
              node.id === id
                ? { ...node, data: { ...node.data, advancedMode: !node.data.advancedMode } }
                : node
            )
          );
        },
        onToggleWide: (id: string) => {
          setNodes((nds) =>
            nds.map((node) =>
              node.id === id
                ? { ...node, data: { ...node.data, isWide: !node.data.isWide } }
                : node
            )
          );
        },
        onUpdate: (id: string, updates: any) => {
          setNodes((nds) =>
            nds.map((node) =>
              node.id === id
                ? { ...node, data: { ...node.data, ...updates } }
                : node
            )
          );
        },
        onDelete: (id: string) => {
          setNodes((nds) => nds.filter((node) => node.id !== id));
          setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
        },
        onDuplicate: (id: string) => {
          const nodeToDuplicate = nodes.find((n) => n.id === id);
          if (nodeToDuplicate) {
            const newId = uuidv4();
            const duplicatedNode = {
              ...nodeToDuplicate,
              id: newId,
              position: {
                x: nodeToDuplicate.position.x + 50,
                y: nodeToDuplicate.position.y + 50
              },
              data: {
                ...nodeToDuplicate.data,
                name: `${nodeToDuplicate.data.name} (Copy)`
              }
            };
            setNodes((nds) => [...nds, duplicatedNode]);
          }
        }
      }
    };

    setNodes((nds) => [...nds, newNode]);

    // Auto-connect to last node if exists
    if (nodes.length > 0) {
      const lastNode = nodes[nodes.length - 1];
      const newEdge: Edge = {
        id: uuidv4(),
        source: lastNode.id,
        target: newNode.id,
        type: 'animated',
        animated: true
      };
      setEdges((eds) => [...eds, newEdge]);
    }

    return newNode.id;
  }, [nodes, setNodes, setEdges, selectedTools, availableTools]);

  // Expand a single block into a sub-workflow
  const expandBlockIntoSubWorkflow = useCallback((blockId: string, subMachine: any) => {
    const blockToExpand = nodes.find(n => n.id === blockId);
    if (!blockToExpand) return;

    // Get incoming and outgoing edges for the block
    const incomingEdges = edges.filter(e => e.target === blockId);
    const outgoingEdges = edges.filter(e => e.source === blockId);

    // Position for the sub-workflow (offset from original block)
    const basePosition = blockToExpand.position;
    const offsetX = 50;
    const offsetY = 100;

    // Create nodes for the sub-workflow states
    const subNodes: Node[] = [];
    const subEdges: Edge[] = [];
    const stateIdMap = new Map<string, string>();

    // Generate sub-nodes
    Object.entries(subMachine.states || {}).forEach(([stateName, stateData]: [string, any], idx) => {
      const nodeId = `${blockId}_sub_${stateName}`;
      stateIdMap.set(stateName, nodeId);

      // Calculate position in a grid layout
      const col = idx % 3;
      const row = Math.floor(idx / 3);

      const newNode: Node = {
        id: nodeId,
        type: 'professionalBlock',
        position: {
          x: basePosition.x + offsetX + col * 250,
          y: basePosition.y + offsetY + row * 200
        },
        data: {
          type: stateData.type || 'analysis',
          name: `${blockToExpand.data.name} - ${stateName}`,
          description: stateData.description || stateData.prompt || '',
          agent_role: stateData.agent_role || blockToExpand.data.agent_role,
          tools: stateData.tools || blockToExpand.data.tools || [],
          transitions: {},
          enabled: true,
          advancedMode: false,
          availableTools: availableTools,
          onUpdate: (id: string, updates: any) => {
            setNodes((nds) =>
              nds.map((node) =>
                node.id === id ? { ...node, data: { ...node.data, ...updates } } : node
              )
            );
          },
          onDelete: (id: string) => {
            setNodes((nds) => nds.filter((node) => node.id !== id));
            setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
          },
          onDuplicate: (id: string) => {
            const nodeToDuplicate = nodes.find(n => n.id === id);
            if (nodeToDuplicate) {
              const newId = `${id}_copy_${Date.now()}`;
              const duplicatedNode: Node = {
                ...nodeToDuplicate,
                id: newId,
                position: {
                  x: nodeToDuplicate.position.x + 100,
                  y: nodeToDuplicate.position.y + 100
                },
                data: {
                  ...nodeToDuplicate.data,
                  name: `${nodeToDuplicate.data.name} (Copy)`
                }
              };
              setNodes((nds) => [...nds, duplicatedNode]);
            }
          },
          onToggleEnabled: (id: string) => {
            setNodes((nds) =>
              nds.map((node) =>
                node.id === id
                  ? { ...node, data: { ...node.data, enabled: !node.data.enabled } }
                  : node
              )
            );
          },
          onToggleAdvanced: (id: string) => {
            setNodes((nds) =>
              nds.map((node) =>
                node.id === id
                  ? { ...node, data: { ...node.data, advancedMode: !node.data.advancedMode } }
                  : node
              )
            );
          },
          onToggleWide: (id: string) => {
            setNodes((nds) =>
              nds.map((node) =>
                node.id === id
                  ? { ...node, data: { ...node.data, isWide: !node.data.isWide } }
                  : node
              )
            );
          },
          isDarkMode
        }
      };

      subNodes.push(newNode);
    });

    // Generate sub-edges from transitions
    Object.entries(subMachine.states || {}).forEach(([stateName, stateData]: [string, any]) => {
      const sourceId = stateIdMap.get(stateName);
      if (!sourceId) return;

      Object.entries(stateData.transitions || {}).forEach(([event, targetState]) => {
        const targetId = stateIdMap.get(targetState as string);
        if (targetId) {
          const edgeId = `${sourceId}_${event}_${targetId}`;
          subEdges.push({
            id: edgeId,
            source: sourceId,
            target: targetId,
            sourceHandle: event === 'failure' || event === 'false' ? 'failure' : 'source',
            targetHandle: 'target',
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#94A3B8', strokeWidth: 2 },
            data: { event, isDarkMode }
          });
        }
      });
    });

    // Connect incoming edges to first sub-node
    const firstSubNodeId = subNodes[0]?.id;
    if (firstSubNodeId) {
      incomingEdges.forEach(edge => {
        const newEdge: Edge = {
          ...edge,
          id: `${edge.id}_to_sub`,
          target: firstSubNodeId
        };
        subEdges.push(newEdge);
      });
    }

    // Connect last sub-node to outgoing edges
    const lastSubNodeId = subNodes[subNodes.length - 1]?.id;
    if (lastSubNodeId) {
      outgoingEdges.forEach(edge => {
        const newEdge: Edge = {
          ...edge,
          id: `${edge.id}_from_sub`,
          source: lastSubNodeId
        };
        subEdges.push(newEdge);
      });
    }

    // Remove the original block and its edges
    setNodes((nds) => [...nds.filter(n => n.id !== blockId), ...subNodes]);
    setEdges((eds) => [
      ...eds.filter(e => e.source !== blockId && e.target !== blockId),
      ...subEdges
    ]);

    // Apply layout after a short delay
    setTimeout(() => {
      updateGraph(true);
    }, 100);
  }, [nodes, edges, availableTools, isDarkMode, setNodes, setEdges, updateGraph]);

  // Create a local sub-workflow when backend is unavailable
  const createLocalSubWorkflow = useCallback((blockId: string, prompt: string) => {
    const blockToExpand = nodes.find(n => n.id === blockId);
    if (!blockToExpand) return;

    // Create a simple sub-workflow based on the block type and prompt
    const blockType = blockToExpand.data.type;
    const subWorkflow: any = { states: {} };

    // Check for complex workflows mentioned in prompt
    const promptLower = prompt.toLowerCase();
    if (promptLower.includes('satellite') || promptLower.includes('mission') || promptLower.includes('complex')) {
      // Create a complex nested workflow for satellite mission or similar complex scenarios
      subWorkflow.states = {
        'mission_init': {
          type: 'analysis',
          description: `Initialize mission parameters for ${blockToExpand.data.name}`,
          transitions: { success: 'pre_flight_check' }
        },
        'pre_flight_check': {
          type: 'validation',
          description: `Validate all systems operational`,
          transitions: { validated: 'telemetry_setup', invalid: 'abort_sequence' }
        },
        'telemetry_setup': {
          type: 'tool_call',
          description: `Configure telemetry and communication systems`,
          tools: ['telemetry_config', 'comm_setup'],
          transitions: { success: 'launch_sequence' }
        },
        'launch_sequence': {
          type: 'parallel',
          description: `Execute parallel launch operations`,
          transitions: { success: 'orbit_insertion' }
        },
        'orbit_insertion': {
          type: 'decision',
          description: `Monitor and adjust orbital parameters`,
          transitions: { success: 'mission_operations', failure: 'contingency_maneuver' }
        },
        'mission_operations': {
          type: 'loop',
          description: `Execute primary mission objectives`,
          transitions: { success: 'data_collection', failure: 'error_recovery' }
        },
        'data_collection': {
          type: 'aggregation',
          description: `Collect and aggregate mission data`,
          tools: ['data_collector', 'data_analyzer'],
          transitions: { success: 'transmission' }
        },
        'transmission': {
          type: 'tool_call',
          description: `Transmit collected data to ground station`,
          tools: ['data_transmitter'],
          transitions: { success: 'mission_complete', failure: 'retry_transmission' }
        },
        'retry_transmission': {
          type: 'loop',
          description: `Retry data transmission with error correction`,
          transitions: { success: 'mission_complete', failure: 'store_for_later' }
        },
        'contingency_maneuver': {
          type: 'analysis',
          description: `Calculate corrective maneuvers`,
          transitions: { success: 'orbit_insertion' }
        },
        'error_recovery': {
          type: 'analysis',
          description: `Diagnose and recover from errors`,
          transitions: { success: 'mission_operations' }
        },
        'store_for_later': {
          type: 'transformation',
          description: `Store data for later transmission`,
          transitions: { success: 'mission_complete' }
        },
        'abort_sequence': {
          type: 'final',
          description: `Safely abort mission`
        },
        'mission_complete': {
          type: 'final',
          description: `Mission successfully completed`
        }
      };
    } else if (blockType === 'analysis') {
      subWorkflow.states = {
        'gather_data': {
          type: 'tool_call',
          description: `Gather data for ${blockToExpand.data.name}`,
          tools: blockToExpand.data.tools || [],
          transitions: { success: 'analyze_data' }
        },
        'analyze_data': {
          type: 'analysis',
          description: `Analyze gathered data`,
          transitions: { success: 'validate_results' }
        },
        'validate_results': {
          type: 'validation',
          description: `Validate analysis results`,
          transitions: { success: 'complete', failure: 'gather_data' }
        },
        'complete': {
          type: 'final',
          description: `Complete ${blockToExpand.data.name}`
        }
      };
    } else if (blockType === 'tool_call') {
      subWorkflow.states = {
        'prepare_input': {
          type: 'transformation',
          description: `Prepare input for tool execution`,
          transitions: { success: 'execute_tool' }
        },
        'execute_tool': {
          type: 'tool_call',
          description: blockToExpand.data.description || `Execute tools`,
          tools: blockToExpand.data.tools || [],
          transitions: { success: 'process_output', failure: 'handle_error' }
        },
        'process_output': {
          type: 'transformation',
          description: `Process tool output`,
          transitions: { success: 'complete' }
        },
        'handle_error': {
          type: 'analysis',
          description: `Handle execution error`,
          transitions: { success: 'execute_tool' }
        },
        'complete': {
          type: 'final',
          description: `Complete tool execution`
        }
      };
    } else if (blockType === 'decision') {
      subWorkflow.states = {
        'evaluate_conditions': {
          type: 'analysis',
          description: `Evaluate decision conditions`,
          transitions: { success: 'check_criteria' }
        },
        'check_criteria': {
          type: 'validation',
          description: `Check decision criteria`,
          transitions: { validated: 'positive_path', invalid: 'negative_path' }
        },
        'positive_path': {
          type: 'transformation',
          description: `Process positive decision path`,
          transitions: { success: 'complete' }
        },
        'negative_path': {
          type: 'transformation',
          description: `Process negative decision path`,
          transitions: { success: 'complete' }
        },
        'complete': {
          type: 'final',
          description: `Decision complete`
        }
      };
    } else {
      // Default sub-workflow structure
      subWorkflow.states = {
        'initialize': {
          type: 'analysis',
          description: `Initialize ${blockToExpand.data.name}`,
          transitions: { success: 'process' }
        },
        'process': {
          type: blockType,
          description: blockToExpand.data.description || `Process ${blockToExpand.data.name}`,
          tools: blockToExpand.data.tools || [],
          transitions: { success: 'finalize' }
        },
        'finalize': {
          type: 'final',
          description: `Complete ${blockToExpand.data.name}`
        }
      };
    }

    // Apply the expansion
    expandBlockIntoSubWorkflow(blockId, subWorkflow);
  }, [nodes, expandBlockIntoSubWorkflow]);

  // Import state machine from backend and convert to enhanced blocks
  const importStateMachine = useCallback(async (machine: any, useProfessionalBlocks: boolean = true, preserveExisting: boolean = false) => {
    if (!machine || (!machine.states && !machine.enhanced_blocks)) {
      console.error('Invalid state machine format');
      return;
    }

    let existingNodes: Node[] = [];
    let existingEdges: Edge[] = [];

    if (preserveExisting) {
      // Preserve existing blocks and connections
      existingNodes = [...nodes];
      existingEdges = [...edges];
    } else {
      // Clear existing graph (only when explicitly importing new workflow)
      setNodes([]);
      setEdges([]);
    }

    // Check if machine has enhanced blocks from backend
    if (machine.enhanced && machine.enhanced_blocks) {
      // Use enhanced blocks directly from backend
      const enhancedNodes = machine.enhanced_blocks.map((block: any) => {
        // Ensure tool blocks have execution handler
        if (block.type === 'toolBlock' || block.data?.type === 'tool') {
          return {
            ...block,
            data: {
              ...block.data,
              onExecuteTool: async (id: string, toolName: string, parameters: any) => {
                // Resolve placeholders using shared utility
                const { ok, params: resolvedParams, error: resolveError } = await resolveUserInputsInParams(parameters);
                if (!ok || !resolvedParams) {
                  setNodes(nds => nds.map(node => node.id === id ? { ...node, data: { ...node.data, status: 'needs_input', executionError: resolveError || 'Input required' } } : node));
                  throw new Error(resolveError || 'Input required');
                }

                // Validate before execution
                const precheck = await stateMachineAdapter.validateParameters(toolName, resolvedParams);
                if (!precheck.valid) {
                  setNodes(nds => nds.map(node => node.id === id ? { ...node, data: { ...node.data, status: 'needs_input', executionError: precheck.message } } : node));
                  throw new Error(precheck.message || 'Missing required parameters');
                }
                // Use existing tool execution logic
                const workflowRequest = {
                  workflow_id: `tool-exec-${id}`,
                  blocks: [{
                    id: id,
                    type: 'tool',
                    tool_name: toolName,
                    parameters: resolvedParams,
                    position: { x: 0, y: 0 },
                    connections: []
                  }],
                  edges: [],
                  context: {},
                  use_agents: false
                };

                const response = await fetch(`${window.location.origin}/api/v1/unified/execute-workflow`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                  },
                  body: JSON.stringify(workflowRequest)
                });

                const data = await response.json();
                const blockResult = data.results?.[id] || data.result;

                // Update node with result
                setNodes(nds =>
                  nds.map(node => {
                    if (node.id === id) {
                      return {
                        ...node,
                        data: {
                          ...node.data,
                          status: data.success ? 'completed' : 'failed',
                          executionResult: blockResult,
                          executionError: data.error
                        }
                      };
                    }
                    return node;
                  })
                );

                // Prefill dependent nodes if any
                try {
                  const outgoingTargets = enhancedEdges.filter((e:any) => e.source === id).map((e:any) => e.target);
                  setNodes(nds => nds.map(node => {
                    if (outgoingTargets.includes(node.id) && (node.type === 'toolBlock' || node.data?.type === 'tool')) {
                      const tname = node.data?.toolName;
                      if (tname === 'python_repl') {
                        const params = { ...(node.data?.parameters || {}) };
                        if (!params.code) {
                          params.code = (stateMachineAdapter as any).generateCodeFromResults ? (stateMachineAdapter as any).generateCodeFromResults(blockResult) : '';
                          return { ...node, data: { ...node.data, parameters: params } };
                        }
                      }
                    }
                    return node;
                  }));
                } catch {}

                return blockResult;
              },
              isDarkMode: isDarkMode
            }
          };
        }
        return {
          ...block,
          data: {
            ...block.data,
            isDarkMode: isDarkMode
          }
        };
      });

      const enhancedEdges = machine.enhanced_edges || [];

      // Propagate any known context into blocks (scaffold for runtime passing)
      stateMachineAdapter.propagateContext(
        enhancedNodes,
        enhancedEdges,
        { previousOutputs: new Map(), globalContext: {}, userInputs: {} }
      );

      // Calculate positions if needed
      const positionedNodes = stateMachineAdapter.calculateNodePositions(enhancedNodes, enhancedEdges);

      setNodes([...existingNodes, ...positionedNodes]);
      setEdges([...existingEdges, ...enhancedEdges]);

      // Validate workflow
      const validation = await stateMachineAdapter.validateWorkflow(positionedNodes);
      if (!validation.valid) {
        console.warn('Workflow validation issues:', validation.issues);
      }

      return;
    }

    // Otherwise, convert states to enhanced blocks using adapter
    if (machine.states) {
      const { nodes: enhancedNodes, edges: enhancedEdges } = await stateMachineAdapter.convertToEnhancedWorkflow(machine);

      // Add execution handlers and dark mode - FORCE PROFESSIONAL BLOCKS
      const processedNodes = enhancedNodes.map(node => {
        // Force professional block type for proper styling
        const forceProfessional = {
          ...node,
          type: 'professional', // Always use professional blocks
          data: {
            ...node.data,
            type: node.data?.type || node.data?.nodeType || 'analysis', // Ensure subType is set
          }
        };

        if (forceProfessional.data?.type === 'tool_call' || forceProfessional.data?.toolName) {
          // For tool blocks, keep them as tool type but with professional styling
          return {
            ...forceProfessional,
            type: 'tool', // Tool blocks use the tool type for execution
            data: {
              ...forceProfessional.data,
              onExecuteTool: async (id: string, toolName: string, parameters: any) => {
                // Resolve placeholders using shared utility
                const { ok, params: resolvedParams, error: resolveError } = await resolveUserInputsInParams(parameters);
                if (!ok || !resolvedParams) {
                  setNodes(nds => nds.map(node => node.id === id ? { ...node, data: { ...node.data, status: 'needs_input', executionError: resolveError || 'Input required' } } : node));
                  throw new Error(resolveError || 'Input required');
                }
                const precheck = await stateMachineAdapter.validateParameters(toolName, resolvedParams);
                if (!precheck.valid) {
                  setNodes(nds => nds.map(node => node.id === id ? { ...node, data: { ...node.data, status: 'needs_input', executionError: precheck.message } } : node));
                  throw new Error(precheck.message || 'Missing required parameters');
                }
                // Use existing tool execution logic
                const workflowRequest = {
                  workflow_id: `tool-exec-${id}`,
                  blocks: [{
                    id: id,
                    type: 'tool',
                    tool_name: toolName,
                    parameters: resolvedParams,
                    position: { x: 0, y: 0 },
                    connections: []
                  }],
                  edges: [],
                  context: {},
                  use_agents: false
                };

                const response = await fetch(`${window.location.origin}/api/v1/unified/execute-workflow`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                  },
                  body: JSON.stringify(workflowRequest)
                });

                const data = await response.json();
                const blockResult = data.results?.[id] || data.result;

                // Update node with result
                setNodes(nds =>
                  nds.map(node => {
                    if (node.id === id) {
                      return {
                        ...node,
                        data: {
                          ...node.data,
                          status: data.success ? 'completed' : 'failed',
                          executionResult: blockResult,
                          executionError: data.error
                        }
                      };
                    }
                    return node;
                  })
                );

                // Prefill dependent nodes if any
                try {
                  const outgoingTargets = enhancedEdges.filter((e:any) => e.source === id).map((e:any) => e.target);
                  setNodes(nds => nds.map(node => {
                    if (outgoingTargets.includes(node.id) && (node.type === 'toolBlock' || node.data?.type === 'tool')) {
                      const tname = node.data?.toolName;
                      if (tname === 'python_repl') {
                        const params = { ...(node.data?.parameters || {}) };
                        if (!params.code) {
                          params.code = (stateMachineAdapter as any).generateCodeFromResults ? (stateMachineAdapter as any).generateCodeFromResults(blockResult) : '';
                          return { ...node, data: { ...node.data, parameters: params } };
                        }
                      }
                    }
                    return node;
                  }));
                } catch {}

                return blockResult;
              },
              isDarkMode: isDarkMode
            }
          };
        }

        // For non-tool blocks, use professional type
        return {
          ...forceProfessional,
          data: {
            ...forceProfessional.data,
            isDarkMode: isDarkMode
          }
        };
      });

      // Propagate any known context into blocks (scaffold for runtime passing)
      stateMachineAdapter.propagateContext(
        processedNodes,
        enhancedEdges,
        { previousOutputs: new Map(), globalContext: {}, userInputs: {} }
      );

      // Calculate positions
      const positionedNodes = stateMachineAdapter.calculateNodePositions(processedNodes, enhancedEdges);

      setNodes([...existingNodes, ...positionedNodes]);
      setEdges([...existingEdges, ...enhancedEdges]);

      // Validate workflow
      const validation = await stateMachineAdapter.validateWorkflow(positionedNodes);
      if (!validation.valid) {
        console.warn('Workflow validation issues:', validation.issues);
      }

      return;
    }

    // Fallback to original implementation if no enhanced support
    const newNodes: Node[] = machine.states.map((state: any, index: number) => {
      // Use professional block type for better editing experience
      const nodeType = useProfessionalBlocks ? 'professional' : 'agent';

      // Map transitions from edges
      const stateTransitions: Record<string, string> = {};
      machine.edges.forEach((edge: any) => {
        if (edge.source === state.id) {
          stateTransitions[edge.event] = edge.target;
        }
      });

      // Determine block type - preserve special initial/start blocks
      let blockType = state.type || 'analysis';
      if (state.id === 'start' || state.id === 'initial' ||
          state.name?.toLowerCase() === 'start' ||
          state.name?.toLowerCase() === 'initial' ||
          state.id === machine.initial_state) {
        // Keep as analysis type for starting blocks
        blockType = 'analysis';
      }

      const nodeData: any = {
        type: blockType,
        name: state.name || state.id,
        description: state.description || '',
        agent_role: state.agent_role || 'Agent',
        tools: state.tools || [],
        transitions: stateTransitions,
        retry_count: state.retry_count || 0,
        timeout: state.timeout || 60,
        enabled: true,
        advancedMode: false,
        isWide: false,
        isDarkMode,
        availableTools,
        // Professional block callbacks
        onUpdate: (id: string, updates: any) => {
          setNodes((nds) =>
            nds.map((node) =>
              node.id === id
                ? { ...node, data: { ...node.data, ...updates } }
                : node
            )
          );
        },
        onDelete: (id: string) => {
          setNodes((nds) => nds.filter((node) => node.id !== id));
          setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
        },
        onDuplicate: (id: string) => {
          const nodeToDuplicate = nodes.find((n) => n.id === id);
          if (nodeToDuplicate) {
            const newId = uuidv4();
            const duplicatedNode = {
              ...nodeToDuplicate,
              id: newId,
              position: {
                x: nodeToDuplicate.position.x + 50,
                y: nodeToDuplicate.position.y + 50
              },
              data: {
                ...nodeToDuplicate.data,
                name: `${nodeToDuplicate.data.name} (Copy)`
              }
            };
            setNodes((nds) => [...nds, duplicatedNode]);
          }
        },
        onToggleEnabled: (id: string) => {
          setNodes((nds) =>
            nds.map((node) =>
              node.id === id
                ? { ...node, data: { ...node.data, enabled: !node.data.enabled } }
                : node
            )
          );
        },
        onToggleAdvanced: (id: string) => {
          setNodes((nds) =>
            nds.map((node) =>
              node.id === id
                ? { ...node, data: { ...node.data, advancedMode: !node.data.advancedMode } }
                : node
            )
          );
        },
        onToggleWide: (id: string) => {
          setNodes((nds) =>
            nds.map((node) =>
              node.id === id
                ? { ...node, data: { ...node.data, isWide: !node.data.isWide } }
                : node
            )
          );
        }
      };

      // For non-professional nodes, use simpler data
      if (!useProfessionalBlocks) {
        return {
          id: state.id,
          type: nodeType,
          position: { x: 0, y: 0 }, // Will be laid out
          data: {
            label: state.name,
            name: state.name,
            status: 'pending',
            nodeType: state.type,
            task: state.task,
            tools: state.tools,
            toolsPlanned: Array.isArray(state.tools) ? state.tools : [],
            description: state.description,
            agentRole: state.agent_role,
            direction: layoutDirection,
            isDarkMode
          },
          targetPosition: layoutDirection === 'LR' ? Position.Left : Position.Top,
          sourcePosition: layoutDirection === 'LR' ? Position.Right : Position.Bottom,
        };
      }

      return {
        id: state.id,
        type: nodeType,
        position: { x: 0, y: 0 }, // Will be laid out
        data: nodeData,
        targetPosition: layoutDirection === 'LR' ? Position.Left : Position.Top,
        sourcePosition: layoutDirection === 'LR' ? Position.Right : Position.Bottom,
      };
    });

    // Create edges from transitions
    const newEdges: Edge[] = machine.edges.map((edge: any) => ({
      id: `${edge.source}-${edge.target}-${edge.event}`,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      animated: edge.event === 'success',
      label: edge.event !== 'success' ? edge.event : '',
      labelStyle: { fill: '#94a3b8', fontSize: 11 },
      labelBgStyle: { fill: '#1e293b', fillOpacity: 0.8 },
      style: {
        stroke: edge.event === 'failure' ? '#ef4444' :
               edge.event === 'retry' ? '#f59e0b' :
               edge.event === 'success' ? '#10b981' : '#52525b',
        strokeWidth: 2
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 20,
        height: 20,
        color: edge.event === 'failure' ? '#ef4444' :
               edge.event === 'retry' ? '#f59e0b' :
               edge.event === 'success' ? '#10b981' : '#52525b'
      },
    }));

    // Merge with existing nodes if preserving
    const finalNodes = preserveExisting ? [...existingNodes, ...newNodes] : newNodes;
    const finalEdges = preserveExisting ? [...existingEdges, ...newEdges] : newEdges;

    // Apply layout
    const layouted = getLayoutedElements(finalNodes, finalEdges, layoutDirection);
    layoutCache.current = layouted;
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
    setHasStateMachineStructure(true);
    setPlanned(true);

    // Fit view to show all nodes
    setTimeout(() => fitView({ padding: 0.2, duration: 400, maxZoom: 1 }), 100);

    // Show success message (you can add a toast notification here)
    console.log(`Imported state machine with ${newNodes.length} states and ${newEdges.length} transitions`);
  }, [layoutDirection, isDarkMode, availableTools, getLayoutedElements, fitView, setNodes, setEdges]);

  // Enhance flow with AI - expand selected blocks or entire workflow
  const enhanceFlow = useCallback(async (prompt: string, selectedNodeIds: string[]) => {
    try {
      // Build current state machine from graph
      const currentMachine = buildMachineFromGraph();

      // If specific blocks are selected, we'll expand them into sub-workflows
      if (selectedNodeIds.length > 0) {
        // For each selected block, create an expansion request
        const selectedNodes = nodes.filter(n => selectedNodeIds.includes(n.id));

        // Prepare detailed context for expansion
        const expansionContext = selectedNodes.map(node => ({
          id: node.id,
          type: node.data.type,
          name: node.data.name,
          description: node.data.description,
          tools: node.data.tools,
          agent_role: node.data.agent_role
        }));

        // Create enhanced request that focuses on expanding these specific blocks
        const enhancementRequest = {
          task: task || "Enhance workflow",
          prompt: `Expand the following blocks into detailed sub-workflows: ${expansionContext.map(c => c.name).join(', ')}. ${prompt}`,
          current_machine: currentMachine,
          selected_states: selectedNodeIds,
          expansion_context: expansionContext,
          tool_preferences: {
            selected_tools: Array.from(selectedTools),
            restrict_to_selected: selectedTools.size > 0
          }
        };

        // Call backend to enhance the workflow
        const res = await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/enhance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enhancementRequest)
        });

        if (!res.ok) {
          // If enhance endpoint doesn't exist, use plan endpoint with expanded context
          const planRes = await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              task: `Expand ${selectedNodes[0]?.data.name || 'block'} into sub-workflow: ${prompt}`,
              tool_preferences: { ...enhancementRequest.tool_preferences, use_enhanced_blocks: true }
            })
          });

          if (planRes.ok) {
            const data = await planRes.json();
            if (data.machine) {
              // Create sub-workflow from the enhanced machine
              expandBlockIntoSubWorkflow(selectedNodeIds[0], data.machine);
            }
          }
          return;
        }

        const data = await res.json();
        const enhancedMachine = data.machine;

        if (enhancedMachine) {
          // Expand selected blocks into sub-workflows
          if (selectedNodeIds.length === 1) {
            expandBlockIntoSubWorkflow(selectedNodeIds[0], enhancedMachine);
          } else {
            // Replace entire workflow if multiple blocks selected
            importStateMachine(enhancedMachine, true, true); // Preserve existing blocks during enhancement
          }
        }
      } else {
        // Enhance entire workflow
        const enhancementRequest = {
          task: task || "Enhance workflow",
          prompt: prompt,
          current_machine: currentMachine,
          tool_preferences: {
            selected_tools: Array.from(selectedTools),
            restrict_to_selected: selectedTools.size > 0
          }
        };

        const res = await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/enhance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enhancementRequest)
        });

        if (res.ok) {
          const data = await res.json();
          if (data.machine) {
            importStateMachine(data.machine, true, true); // Preserve existing blocks during enhancement
          }
        } else {
          // Fallback to plan
          const planRes = await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              task: `${task || 'Workflow'}: ${prompt}`,
              tool_preferences: { ...enhancementRequest.tool_preferences, use_enhanced_blocks: true }
            })
          });
          if (planRes.ok) {
            const data = await planRes.json();
            if (data.machine) {
              importStateMachine(data.machine, true, true); // Preserve existing blocks during enhancement
            }
          }
        }
      }

      console.log(`Successfully enhanced workflow`);
    } catch (e) {
      console.error('Enhancement failed', e);
      // Create a local expansion if backend fails
      if (selectedNodeIds.length === 1) {
        createLocalSubWorkflow(selectedNodeIds[0], prompt);
      }
    }
  }, [task, selectedTools, buildMachineFromGraph, importStateMachine, nodes, expandBlockIntoSubWorkflow, createLocalSubWorkflow]);

  const planWorkflow = useCallback(async ()=>{
    if (!task.trim()) return;
    try{
      setPlanned(false);
      const res = await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/plan`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ task, tool_preferences: { selected_tools: Array.from(selectedTools), restrict_to_selected: selectedTools.size>0, use_enhanced_blocks: true } }) });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const machine = data.machine;
      if(machine){
        // Clear existing if empty, preserve if not
        const shouldPreserve = nodes.length > 0;
        importStateMachine(machine, true, shouldPreserve);
      }
    }catch(e){ console.error('Plan failed', e); }
  }, [task, selectedTools, importStateMachine, nodes.length]);

  const runPlannedWorkflow = useCallback(async ()=>{
    try{
      setStateExecutionData([]); // Clear previous execution data
      const machine = buildMachineFromGraph();
      const res = await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/execute`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ task, machine, tool_preferences: { selected_tools: Array.from(selectedTools), restrict_to_selected: selectedTools.size>0 } }) });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setExecutionId(data.exec_id);
      setIsRunning(true);
      setTimeout(()=>connectWebSocket(data.exec_id, false), 100);
    }catch(e){ console.error('Run failed', e); }
  }, [buildMachineFromGraph, selectedTools, task, connectWebSocket]);

  // Save current workflow as template with full visual properties
  const saveAsTemplate = useCallback(() => {
    const machine = buildMachineFromGraph();

    // Save complete node and edge data including positions and styling
    const fullWorkflow = {
      nodes: nodes.map(node => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data,
        width: node.width,
        height: node.height,
        selected: false,
        style: node.style
      })),
      edges: edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type,
        label: edge.label,
        data: edge.data,
        style: edge.style,
        animated: edge.animated,
        markerEnd: edge.markerEnd
      }))
    };

    const template = {
      name: `Workflow_${new Date().toISOString().split('T')[0]}`,
      description: task || 'Custom workflow template',
      machine, // Keep for backward compatibility
      fullWorkflow, // New: complete visual workflow
      category: 'custom',
      difficulty: 'medium',
      tools: Array.from(selectedTools),
      created: new Date().toISOString(),
      version: '2.0.0' // Updated version for new format
    };

    // Convert to JSON and trigger download
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow_template_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Also save to localStorage for quick access
    try {
      const savedTemplates = JSON.parse(localStorage.getItem('custom_workflow_templates') || '[]');
      savedTemplates.push(template);
      // Keep only last 10 templates
      if (savedTemplates.length > 10) {
        savedTemplates.shift();
      }
      localStorage.setItem('custom_workflow_templates', JSON.stringify(savedTemplates));
      alert('Template saved successfully!');
    } catch (e) {
      console.error('Failed to save template to localStorage:', e);
    }
  }, [buildMachineFromGraph, task, selectedTools, nodes, edges]);

  // Load template from file with full visual properties
  const loadTemplate = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (file) {
        try {
          const text = await file.text();
          const template = JSON.parse(text);

          // Check if this is a new format template with fullWorkflow
          if (template.fullWorkflow) {
            // Clear existing workflow
            setNodes([]);
            setEdges([]);

            // Restore complete workflow with all visual properties
            setTimeout(() => {
              // Restore nodes with all their properties and professional block features
              const restoredNodes = template.fullWorkflow.nodes.map((node: any) => {
                // Ensure node has proper type for professional blocks
                const nodeType = node.type || (node.data?.type === 'tool' ? 'toolBlock' : 'professional');

                // Prepare base node data
                const baseNodeData = {
                  ...node.data,
                  isDarkMode,
                  availableTools,
                  status: node.data?.status || 'pending',
                  // Restore callbacks for professional blocks
                  onUpdate: (id: string, updates: any) => {
                    setNodes((nds) =>
                      nds.map((n) =>
                        n.id === id ? { ...n, data: { ...n.data, ...updates } } : n
                      )
                    );
                  },
                  onDelete: (id: string) => {
                    setNodes((nds) => nds.filter((n) => n.id !== id));
                    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
                  },
                  onDuplicate: (id: string) => {
                    setNodes((currentNodes) => {
                      const nodeToDuplicate = currentNodes.find((n: any) => n.id === id);
                      if (nodeToDuplicate) {
                        const newId = uuidv4();
                        const duplicatedNode = {
                          ...nodeToDuplicate,
                          id: newId,
                          position: {
                            x: nodeToDuplicate.position.x + 50,
                            y: nodeToDuplicate.position.y + 50
                          },
                          data: {
                            ...nodeToDuplicate.data,
                            label: `${nodeToDuplicate.data.label || nodeToDuplicate.id}_copy`
                          }
                        };
                        return [...currentNodes, duplicatedNode];
                      }
                      return currentNodes;
                    });
                  }
                };

                // Add tool execution callback for tool blocks
                if (nodeType === 'toolBlock' || node.data?.type === 'tool') {
                  baseNodeData.onExecuteTool = async (id: string, toolName: string, parameters: any) => {
                    // Tool execution logic here (simplified for template restoration)
                    console.log(`Executing tool ${toolName} for block ${id}`);
                    // You can add the full tool execution logic here
                  };
                }

                // Restore node with all callbacks
                const restoredNode = {
                  ...node,
                  type: nodeType,
                  data: baseNodeData
                };

                return restoredNode;
              });

              setNodes(restoredNodes);

              // Restore edges with their visual properties
              const restoredEdges = template.fullWorkflow.edges.map((edge: any) => ({
                ...edge,
                type: edge.type || 'interactive',
                style: {
                  ...edge.style,
                  stroke: edge.style?.stroke || (isDarkMode ? '#475569' : '#cbd5e1'),
                  strokeWidth: edge.style?.strokeWidth || 2
                },
                markerEnd: edge.markerEnd || {
                  type: MarkerType.ArrowClosed,
                  width: 20,
                  height: 20,
                  color: isDarkMode ? '#475569' : '#cbd5e1',
                  orient: 'auto'
                }
              }));

              setEdges(restoredEdges);

              // Fit view after loading
              setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 100);
            }, 100);
          } else if (template.machine) {
            // Fallback for old format templates
            importStateMachine(template.machine, true);
          }

          // Restore tools and task
          if (template.tools) {
            setSelectedTools(new Set(template.tools));
          }
          if (template.description) {
            setTask(template.description);
          }

          alert('Template loaded successfully!');
        } catch (err) {
          console.error('Failed to load template:', err);
          alert('Failed to load template. Please check the file format.');
        }
      }
    };
    input.click();
  }, [importStateMachine, setSelectedTools, setTask, setNodes, setEdges, isDarkMode, availableTools, fitView, nodes]);

  // Memoized callbacks for ChatbotOutput to prevent re-renders
  const handleAgentSelect = useCallback((agentId: string | null) => {
    setSelectedAgent(agentId);
    if (agentId) {
      // Highlight the corresponding node when an agent is selected
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          selected: node.id === agentId,
        }))
      );
      // Optionally bring selected into view
      const node = nodes.find(n => n.id === agentId);
      if (node) {
        setCenter(node.position.x + (((node as any).width) || 280) / 2, node.position.y + (((node as any).height) || 140) / 2, { zoom: 1.0, duration: 300 });
      }
    }
  }, [setNodes]);

  const handleNodeFocus = useCallback((agentId: string) => {
    const node = nodes.find(n => n.id === agentId);
    if (node) {
      setCenter(node.position.x + 110, node.position.y + 50, { zoom: 1.2, duration: 300 });
    }
  }, [nodes, setCenter]);

  // Handle edge click to highlight path
  const handleEdgePathHighlight = useCallback((edgeId: string, sourceId: string, targetId: string) => {
    // Find all nodes in the path
    const pathNodes = new Set<string>();
    const pathEdges = new Set<string>();

    // Add source and target to path
    pathNodes.add(sourceId);
    pathNodes.add(targetId);
    pathEdges.add(edgeId);

    // Find all downstream nodes from target
    const findDownstream = (nodeId: string) => {
      const outgoingEdges = edges.filter(e => e.source === nodeId);
      outgoingEdges.forEach(edge => {
        if (!pathEdges.has(edge.id)) {
          pathEdges.add(edge.id);
          pathNodes.add(edge.target);
          findDownstream(edge.target);
        }
      });
    };

    // Find all upstream nodes from source
    const findUpstream = (nodeId: string) => {
      const incomingEdges = edges.filter(e => e.target === nodeId);
      incomingEdges.forEach(edge => {
        if (!pathEdges.has(edge.id)) {
          pathEdges.add(edge.id);
          pathNodes.add(edge.source);
          findUpstream(edge.source);
        }
      });
    };

    findDownstream(targetId);
    findUpstream(sourceId);

    // Update nodes to highlight path
    setNodes(nds => nds.map(node => {
      const inPath = pathNodes.has(node.id);
      return {
        ...node,
        data: {
          ...node.data,
          highlighted: inPath,
        },
        style: {
          ...node.style,
          opacity: inPath ? 1 : 0.3,
          boxShadow: inPath && (node.id === sourceId || node.id === targetId)
            ? '0 0 20px rgba(59, 130, 246, 0.5)'
            : node.style?.boxShadow,
        }
      };
    }));

    // Update edges to highlight path
    setEdges(eds => eds.map(edge => {
      const inPath = pathEdges.has(edge.id);
      return {
        ...edge,
        animated: inPath,
        style: {
          ...edge.style,
          stroke: inPath ? '#3b82f6' : '#94a3b8',
          strokeWidth: inPath ? 3 : 2,
          opacity: inPath ? 1 : 0.3,
        },
        data: {
          ...edge.data,
          highlighted: inPath,
        }
      };
    }));

    // Set highlight path flag
    setHighlightPath(true);
  }, [edges, setNodes, setEdges]);

  // Clear path highlighting
  const clearPathHighlight = useCallback(() => {
    setNodes(nds => nds.map(node => ({
      ...node,
      data: {
        ...node.data,
        highlighted: false,
      },
      style: {
        ...node.style,
        opacity: 1,
        boxShadow: undefined,
      }
    })));

    setEdges(eds => eds.map(edge => ({
      ...edge,
      animated: false,
      style: {
        ...edge.style,
        stroke: edge.data?.isActive ? '#fbbf24' : edge.data?.isCompleted ? '#22c55e' : '#94a3b8',
        strokeWidth: 2,
        opacity: 1,
      },
      data: {
        ...edge.data,
        highlighted: false,
      }
    })));

    setHighlightPath(false);
  }, [setNodes, setEdges]);

  // Keyboard shortcut for clearing path highlight
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && highlightPath) {
        e.preventDefault();
        clearPathHighlight();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [highlightPath, clearPathHighlight]);

  // Create a stable agents reference to prevent ChatbotOutput re-renders
  const stableAgents = useMemo(() => {
    // Only recreate Map when content actually changes
    return agents;
  }, [
    // Create a stable dependency based on actual content
    Array.from(agents.entries())
      .map(([k, v]) => `${k}:${v.status}:${v.output?.length || 0}:${v.startTime}:${v.endTime}`)
      .join(',')
  ]);

  const stopExecution = () => {
    setIsRunning(false);
    setActivelyStreamingAgents(new Set());
    setCurrentExecutingNode(null);
    setNextExecutingNode(null);
    setExecutionActions(new Map());
    setIsExecuting(false);
    // ⚠️ DON'T clear hasStateMachineStructure - preserve user's blocks!
    // setHasStateMachineStructure(false);  // ❌ This was causing blocks to be cleared

    // Clear active execution status but KEEP execution history
    setNodes(nodes => nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        // Change running to failed (stopped), keep completed as is
        status: node.data.status === 'running' ? 'failed' : node.data.status,
        isExecuting: false,
        isDimmed: false,
        currentAction: undefined,
        currentActionDetail: undefined,
        activeTools: [],
        // Keep execution history markers!
        wasExecuted: node.data.wasExecuted,
        executionOrder: node.data.executionOrder,
        executionDuration: node.data.executionDuration,
        executionDurationText: node.data.executionDurationText,
        executedTools: node.data.executedTools
      }
    })));

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
  };

  const clearExecutionHistory = () => {
    // Clear execution history but keep the blocks
    setExecutionHistory(new Map());
    setExecutionOrderCounter(0);
    setExecutionActions(new Map());

    // Reset node execution states but keep the blocks
    setNodes(nodes => nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        status: 'pending',
        wasExecuted: false,
        executionOrder: undefined,
        executionDuration: undefined,
        executionDurationText: undefined,
        executedTools: undefined,
        currentAction: undefined,
        currentActionDetail: undefined,
        activeTools: [],
        isDimmed: false
      }
    })));

    // Reset edge styles
    setEdges(edges => edges.map(edge => ({
      ...edge,
      animated: false,
      className: '',
      style: {
        ...edge.style,
        stroke: '#52525b',
        strokeWidth: 2,
      }
    })));
  };

  const resetView = () => {
    // Clear everything and reset
    setAgents(new Map());
    setNodes([]);
    setEdges([]);
    setSelectedAgent(null);
    layoutCache.current = { nodes: [], edges: [] };
    lastLayoutedAgentIds.current.clear();
    setActivelyStreamingAgents(new Set());
    setHasStateMachineStructure(false);
    setPlanned(false);
  };
  
  const softReset = () => {
    // Reset agents and execution state but preserve visualization structure
    setAgents(new Map());
    setSelectedAgent(null);
    setActivelyStreamingAgents(new Set());
    // Reset node statuses but keep the structure
    setNodes(nodes => 
      nodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          status: 'pending',
          toolsUsed: []
        }
      }))
    );
    // Reset edge animations
    setEdges(edges =>
      edges.map(edge => ({
        ...edge,
        animated: false,
        style: {
          ...edge.style,
          stroke: '#52525b'
        }
      }))
    );
  };

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    event.stopPropagation();
    preventRerender.current = true;
    setSelectedAgent(prev => prev === node.id ? null : node.id);
    // Show settings panel for the clicked node
    setSelectedNodeForSettings(node);
    // Reset highlight path if selecting a new node
    if (highlightPath && selectedAgent !== node.id) {
      setHighlightPath(false);
    }
    setTimeout(() => { preventRerender.current = false; }, 100);
  }, [highlightPath, selectedAgent]);

  // Enhanced path highlighting for state machine visualization
  useEffect(() => {
    // Prevent updates during interaction
    if (preventRerender.current) return;

    if (!highlightPath || !selectedAgent) {
      // Reset dimming if highlighting is off
      if (!highlightPath) {
        setEdges(prev => prev.map(e => {
          if (!e.data?.dimmed) return e;
          return {
            ...e,
            data: { ...e.data, dimmed: false },
          };
        }));
        setNodes(prev => prev.map(n => {
          if (n.style?.opacity === 1) return n;
          return {
            ...n,
            style: { ...n.style, opacity: 1 },
          };
        }));
      }
      return;
    }

    // Debounce to prevent rapid updates
    const timeoutId = setTimeout(() => {
      // Use layout cache for edge information to avoid dependency
      const edgeSnapshot = layoutCache.current.edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target
      }));

      // Find all connected paths from selected node
      const connectedNodes = new Set<string>([selectedAgent]);
      const connectedEdges = new Set<string>();

      // Find downstream nodes
      let changed = true;
      let iterations = 0;
      while (changed && iterations < 100) {
        changed = false;
        iterations++;
        edgeSnapshot.forEach(edge => {
          if (connectedNodes.has(edge.source) && !connectedNodes.has(edge.target)) {
            connectedNodes.add(edge.target);
            connectedEdges.add(edge.id);
            changed = true;
          }
        });
      }

      // Find upstream nodes
      changed = true;
      iterations = 0;
      while (changed && iterations < 100) {
        changed = false;
        iterations++;
        edgeSnapshot.forEach(edge => {
          if (connectedNodes.has(edge.target) && !connectedNodes.has(edge.source)) {
            connectedNodes.add(edge.source);
            connectedEdges.add(edge.id);
            changed = true;
          }
        });
      }

      // Batch updates
      preventRerender.current = true;

      setEdges(prev => prev.map(e => {
        const shouldDim = !connectedEdges.has(e.id) && !(e.source === selectedAgent || e.target === selectedAgent);
        if (e.data?.dimmed === shouldDim) return e;
        return {
          ...e,
          data: {
            ...e.data,
            dimmed: shouldDim,
          },
        };
      }));

      setNodes(prev => prev.map(n => {
        const targetOpacity = connectedNodes.has(n.id) ? 1 : 0.4;
        if (n.style?.opacity === targetOpacity) return n;
        return {
          ...n,
          style: {
            ...n.style,
            opacity: targetOpacity,
          },
        };
      }));

      setTimeout(() => {
        preventRerender.current = false;
      }, 50);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [highlightPath, selectedAgent, setEdges, setNodes]);


  // Cleanup
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, []);

  const selectedAgentData = selectedAgent ? agents.get(selectedAgent) : null;

  return (
    <div className={`flow-swarm-container ${isDarkMode ? 'dark-mode' : 'light-mode'} ${isExecuting ? 'execution-mode' : ''}`}>
      {/* Tools Hub Modal */}
      {showToolsHub && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center'}} onClick={() => setShowToolsHub(false)}>
          <div style={{
            background: isDarkMode ? '#0f172a' : '#ffffff',
            color: isDarkMode ? '#e2e8f0' : '#1e293b',
            width: 720,
            maxHeight: '85vh',
            borderRadius: 12,
            padding: 24,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column' as const
          }} onClick={(e)=>e.stopPropagation()} onMouseDown={(e)=>e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Tool Selection</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: 14, color: isDarkMode ? '#94a3b8' : '#64748b' }}>
                  Choose which tools the AI can use. Leave empty to allow all tools.
                </p>
              </div>
              <button
                className="panel-button"
                onClick={()=>setShowToolsHub(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
                  background: isDarkMode ? '#1e293b' : '#f8fafc'
                }}
              >
                ✕ Close
              </button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <input
                className="task-input"
                placeholder="Search tools..."
                value={toolSearch}
                onChange={e=>setToolSearch(e.target.value)}
                style={{ width: '100%', marginBottom: 12 }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ color: '#64748b', fontSize: 14 }}>
                  {selectedTools.size > 0 ? `${selectedTools.size} tool${selectedTools.size === 1 ? '' : 's'} selected` : 'No tools selected (AI will use all available tools)'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="panel-button"
                    onClick={()=>setSelectedTools(new Set(availableTools))}
                    style={{ padding: '6px 12px', fontSize: 13 }}
                  >
                    Select All
                  </button>
                  <button
                    className="panel-button"
                    onClick={()=>setSelectedTools(new Set())}
                    style={{ padding: '6px 12px', fontSize: 13 }}
                  >
                    Clear All
                  </button>
                </div>
              </div>
            </div>
            {/* Unknown selection warning inside modal */}
            {(() => {
              const unknownSel = Array.from(selectedTools).filter(s => !availableTools.includes(s));
              if (unknownSel.length === 0) return null;
              return (
                <div style={{
                  marginBottom: 8,
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: '#3f1d1d',
                  color: '#fecaca',
                  border: '1px solid #7f1d1d'
                }}>
                  <div style={{ fontSize: 12 }}>These selected names are not registered tools and will be ignored at runtime:</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>{unknownSel.join(', ')}</div>
                </div>
              );
            })()}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              marginBottom: 16,
              border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
              borderRadius: 8,
              padding: 12
            }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 10 }}>
                {availableTools.filter(t => t.toLowerCase().includes(toolSearch.toLowerCase())).map(t => {
                  const isSelected = selectedTools.has(t);
                  return (
                    <div
                      key={t}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedTools(prev => {
                          const n = new Set(prev);
                          if (n.has(t)) n.delete(t); else n.add(t);
                          return n;
                        });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedTools(prev => {
                            const n = new Set(prev);
                            if (n.has(t)) n.delete(t); else n.add(t);
                            return n;
                          });
                        }
                      }}
                      style={{
                        border: `2px solid ${isSelected ? '#3b82f6' : isDarkMode ? '#334155' : '#e2e8f0'}`,
                        borderRadius: 10,
                        padding: 12,
                        display: 'flex',
                        gap: 12,
                        cursor: 'pointer',
                        background: isSelected
                          ? (isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)')
                          : 'transparent',
                        transition: 'all 0.2s',
                        position: 'relative' as const
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      {/* Checkbox */}
                      <div style={{
                        width: 20,
                        height: 20,
                        border: `2px solid ${isSelected ? '#3b82f6' : isDarkMode ? '#475569' : '#cbd5e1'}`,
                        borderRadius: 4,
                        background: isSelected ? '#3b82f6' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'all 0.2s'
                      }}>
                        {isSelected && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      {/* Tool info */}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{
                          fontWeight: 600,
                          fontSize: 14,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          color: isSelected ? '#3b82f6' : (isDarkMode ? '#f1f5f9' : '#1e293b')
                        }}>
                          {t}
                        </div>
                        {toolDetails[t]?.description && (
                          <div style={{
                            fontSize: 12,
                            color: isDarkMode ? '#94a3b8' : '#64748b',
                            marginTop: 2,
                            lineHeight: 1.4
                          }}>
                            {toolDetails[t]?.description}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {toolsLoading && <div>Loading tools…</div>}
              </div>
            </div>
          </div>
        </div>
      )}
      {decisionPrompt && (
        <div style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <div style={{ background: '#0f172a', color: '#e2e8f0', padding: 20, borderRadius: 8, width: 420 }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Choose next event</h3>
            <div style={{ fontWeight: 600 }}>{decisionPrompt.name}</div>
            {decisionPrompt.description && (
              <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>{decisionPrompt.description}</div>
            )}
            <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {decisionPrompt.allowed.map(ev => (
                <button key={ev} className="panel-button" onClick={async () => {
                  try {
                    if (!executionId) return;
                    await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/${executionId}/decision`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ state_id: decisionPrompt.stateId, event: ev })
                    });
                    setDecisionPrompt(null);
                  } catch (e) {
                    console.error('Failed to submit decision', e);
                  }
                }}>{ev}</button>
              ))}
            </div>
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <button className="panel-button" onClick={() => setDecisionPrompt(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="flow-header">
        <div className="header-brand">
          <div className="brand-icon">⚡</div>
          <h1>Dynamic Agent Flow</h1>
          <div className={`connection-status ${connectionStatus}`}>
            <span className="status-dot" />
            <span>{connectionStatus}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flow-content">
        {/* Tool preferences banner - compact */}
        {toolPrefs && (toolPrefs.unknown.length > 0) && (
          <div style={{
            margin: '4px 12px',
            padding: '4px 10px',
            borderRadius: 4,
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#fca5a5',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <span style={{ color: '#f87171' }}>⚠</span>
            <span>Unknown tools: <strong>{toolPrefs.unknown.join(', ')}</strong></span>
          </div>
        )}

        {/* React Flow Graph */}
        <div className="flow-graph-panel" ref={reactFlowWrapper} onDrop={(event)=>{
          event.preventDefault();
          if (!editMode) return;

          // Get block type and optional metadata
          const blockData = event.dataTransfer.getData('application/reactflow');
          const jsonData = event.dataTransfer.getData('application/json');

          if (!blockData) return;

          const bounds = reactFlowWrapper.current?.getBoundingClientRect();
          const pos = project({ x: event.clientX - (bounds?.left || 0), y: event.clientY - (bounds?.top || 0) });

          // Parse the drag data
          let parsedData: any = {};
          try {
            parsedData = JSON.parse(blockData);
          } catch (e) {
            // If not JSON, treat as simple block type string
            parsedData = { type: blockData };
          }

          if (parsedData?.source === 'unified-block-manager' && parsedData.block) {
            addUnifiedBlock(parsedData.block as BlockConfig, pos);
            return;
          }

          // Check if additional JSON data exists
          if (jsonData) {
            try {
              const additionalData = JSON.parse(jsonData);
              parsedData = { ...parsedData, ...additionalData };
            } catch (e) {
              // Ignore parse errors
            }
          }

          // Handle tool drops from ToolPalette
          if (parsedData.type === 'tool' && parsedData.toolName) {
            // Schema can be passed or fetched from unified service
            addToolBlock(parsedData.toolName, parsedData.schema, pos);
          }
          // Use professional block if from new toolbar
          else if (parsedData.useEnhanced || jsonData) {
            addProfessionalBlock(parsedData.type || blockData, pos);
          } else {
            // Legacy block creation
            const blockType = parsedData.type || blockData;
            const id = `node_${Math.random().toString(36).slice(2,8)}`;
            const newNode: Node = {
              id,
              type: 'agent',
              position: pos,
              data: { label: blockType, name: blockType, status:'pending', nodeType: blockType as any, direction: layoutDirection, toolsPlanned: [], isDarkMode },
              targetPosition: layoutDirection==='LR'? Position.Left: Position.Top,
              sourcePosition: layoutDirection==='LR'? Position.Right: Position.Bottom,
            };
            setNodes(nds=>nds.concat(newNode));
          }
        }} onDragOver={(e)=>{ e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}>
          <ReactFlow
            style={{ background: isDarkMode ? '#0a0f1a' : '#ffffff' }}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={async (connection: Connection) => {
              if (!connection.source || !connection.target) return;

              // Determine event type based on source handle
              let ev = 'success';
              if (connection.sourceHandle === 'failure' || connection.sourceHandle === 'false') {
                ev = 'failure';
              } else if (connection.sourceHandle === 'retry') {
                ev = 'retry';
              } else if (connection.sourceHandle && connection.sourceHandle !== 'source' && connection.sourceHandle !== 'true') {
                ev = connection.sourceHandle;
              }

              // Check for duplicate edges
              const existingEdge = edges.find(
                e => e.source === connection.source &&
                     e.target === connection.target &&
                     (e as any).label === ev
              );
              if (existingEdge) {
                console.warn('Edge already exists');
                return;
              }

              // Create new edge
              const newEdge: Edge = {
                id: `${connection.source}-${connection.target}-${ev}`,
                source: connection.source,
                target: connection.target,
                sourceHandle: connection.sourceHandle,
                targetHandle: connection.targetHandle,
                type: 'smoothstep',
                animated: ev === 'success',
                label: ev !== 'success' ? ev : '',
                labelStyle: { fill: '#94a3b8', fontSize: 11 },
                labelBgStyle: { fill: '#1e293b', fillOpacity: 0.8 },
                style: {
                  stroke: ev === 'failure' ? '#ef4444' :
                         ev === 'retry' ? '#f59e0b' :
                         '#10b981',
                  strokeWidth: 2
                },
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  width: 20,
                  height: 20,
                  color: ev === 'failure' ? '#ef4444' :
                         ev === 'retry' ? '#f59e0b' :
                         '#10b981'
                },
              };

              // Update edges locally first
              setEdges(eds => [...eds, newEdge]);

              // Update backend if execution is running
              if (executionId) {
                try {
                  await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/${executionId}/update_graph`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ edges: [{ source: connection.source, target: connection.target, event: ev }] })
                  });
                } catch (e) {
                  console.error('Failed to update backend graph', e);
                }
              }
            }}
            onEdgeClick={(e, edge) => {
              e.stopPropagation();
              if (editMode && e.shiftKey) {
                // Shift+click to edit edge
                setEdgeEdit({ id: edge.id, source: edge.source, target: edge.target, event: (edge as any).label || 'success' });
              } else {
                // Regular click to highlight path
                handleEdgePathHighlight(edge.id, edge.source, edge.target);
              }
            }}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            fitView={false}
            attributionPosition="bottom-left"
            minZoom={0.2}
            maxZoom={1.5}
            nodesDraggable={true}
            nodesConnectable={editMode}
            elementsSelectable={true}
            panOnScroll={true}
            panOnDrag={true}
            elevateNodesOnSelect={false}
            snapToGrid={true}
            snapGrid={[15, 15]}
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={['Delete','Backspace']}
            onEdgeUpdate={async (oldEdge, newCon)=>{
              if (!editMode) return;
              const ev = (oldEdge as any).label || 'success';
              setEdges(prev=>prev.filter(e=>e.id!==oldEdge.id).concat([{ ...oldEdge, id: `${newCon.source}-${newCon.target}-${ev}`, source: newCon.source!, target: newCon.target!, label: ev }] as any));
              if (executionId){
                try{
                  await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/${executionId}/update_graph`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ remove_edges:[{ source: oldEdge.source, target: oldEdge.target, event: ev }], edges:[{ source: newCon.source, target: newCon.target, event: ev }] }) });
                }catch(e){ console.error('Edge update failed', e); }
              }
            }}
            onNodeDragStart={() => {
              preventRerender.current = true;
              setIsInteracting(true);
            }}
            onNodeDragStop={() => {
              setIsInteracting(false);
              setTimeout(() => { preventRerender.current = false; }, 100);
            }}
            onMoveStart={() => {
              preventRerender.current = true;
              setIsInteracting(true);
            }}
            onMoveEnd={() => {
              setIsInteracting(false);
              setTimeout(() => { preventRerender.current = false; }, 100);
            }}
            defaultViewport={{ x: 0, y: 0, zoom: 0.75 }}
            onlyRenderVisibleElements
            edgeUpdaterRadius={10}
            onNodesDelete={async (nds) => {
              if (executionId && nds?.length) {
                try {
                  await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/${executionId}/update_graph`, {
                    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ remove_states: nds.map(n=>n.id) })
                  });
                } catch (e) { console.error('Remove states failed', e); }
              }
            }}
            onEdgesDelete={async (eds) => {
              if (executionId && eds?.length) {
                try {
                  const payload = { remove_edges: eds.map((e:any)=>({ source:e.source, target:e.target, event: (e.label && typeof e.label==='string' && e.label.length>0)? e.label : 'success' })) };
                  await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/${executionId}/update_graph`, {
                    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
                  });
                } catch (e) { console.error('Remove edges failed', e); }
              }
            }}
            noDragClassName="nodrag"
            noPanClassName="nopan"
            defaultEdgeOptions={{
              type: 'animated',
              animated: false,
              style: {
                stroke: isDarkMode ? '#475569' : '#cbd5e1',
                strokeWidth: 2,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 20,
                height: 20,
                color: isDarkMode ? '#475569' : '#cbd5e1',
                orient: 'auto',
              },
            }}
            fitViewOptions={{
              padding: 0.3,
              maxZoom: 1.0,
              minZoom: 0.2,
              includeHiddenNodes: false,
            }}
            connectionLineType={ConnectionLineType.Bezier}
            connectionLineStyle={{
              stroke: isDarkMode ? '#4b5563' : '#d1d5db',
              strokeWidth: 2,
            }}
          >
            {/* Parallel Group Overlay */}
            <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:0 }}>
              {(() => {
                const running = nodes.filter(n => (n.data as any)?.parallelRunning);
                if (running.length === 0) return null;
                const groups = running.map(n => {
                  const children: string[] = (n.data as any)?.parallelChildren || [];
                  const members = [n, ...nodes.filter(nn => children.includes(nn.id))];
                  if (members.length === 0) return null;
                  const minX = Math.min(...members.map(m => m.position.x)) - 20;
                  const minY = Math.min(...members.map(m => m.position.y)) - 30;
                  const maxX = Math.max(...members.map(m => m.position.x + ((m as any).width || 260))) + 20;
                  const maxY = Math.max(...members.map(m => m.position.y + ((m as any).height || 120))) + 30;
                  return { id: n.id, x: minX, y: minY, w: maxX - minX, h: maxY - minY, label: (n.data as any)?.label || n.id };
                }).filter(Boolean) as Array<{ id:string; x:number; y:number; w:number; h:number; label:string }>;
                if (groups.length === 0) return null;
                const xs = groups.flatMap(g => [g.x, g.x + g.w]);
                const ys = groups.flatMap(g => [g.y, g.y + g.h]);
                const minX = Math.min(...xs), minY = Math.min(...ys);
                const maxX = Math.max(...xs), maxY = Math.max(...ys);
                return (
                  <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} style={{ width:'100%', height:'100%' }}>
                    {groups.map(g => (
                      <g key={g.id}>
                        <rect x={g.x} y={g.y} rx={10} ry={10} width={g.w} height={g.h} fill="rgba(59,130,246,0.08)" stroke="rgba(59,130,246,0.35)" strokeWidth={2} />
                        <text x={g.x + 10} y={g.y + 18} fill="#93c5fd" fontSize={12} fontWeight={700}>Parallel Group · {g.label}</text>
                      </g>
                    ))}
                  </svg>
                );
              })()}
            </div>
            <Background
              variant={showGrid ? BackgroundVariant.Lines : BackgroundVariant.Dots}
              gap={showGrid ? 16 : 24}
              size={showGrid ? 1.25 : 1.5}
              color={isDarkMode ? '#334155' : '#e5e7eb'}
            />
            <Controls showInteractive={true} position="bottom-left" />
            {showMinimap && <MiniMap position="bottom-right" pannable zoomable style={{ background: isDarkMode? '#0b1220':'#f8fafc' }} />}
            {/* Parallel Group Overlay with ribbons, summary, and tooltip */}
            <div style={{ position:'absolute', inset:0, pointerEvents:'auto', zIndex:0 }}>
              {(() => {
                const running = nodes.filter(n => (n.data as any)?.parallelRunning || (n.data as any)?.parallelSummary);
                if (running.length === 0) return null;
                const groups = running.map(n => {
                  const data: any = n.data || {};
                  const children: string[] = data.parallelChildren || [];
                  const members = [n, ...nodes.filter(nn => children.includes(nn.id))];
                  if (members.length === 0) return null;
                  const minX = Math.min(...members.map(m => m.position.x)) - 20;
                  const minY = Math.min(...members.map(m => m.position.y)) - 30;
                  const maxX = Math.max(...members.map(m => m.position.x + ((m as any).width || 260))) + 20;
                  const maxY = Math.max(...members.map(m => m.position.y + ((m as any).height || 120))) + 30;
                  return { id: n.id, node: n, data, x: minX, y: minY, w: maxX - minX, h: maxY - minY, label: data?.label || n.id, children };
                }).filter(Boolean) as Array<{ id:string; node: Node; data:any; x:number; y:number; w:number; h:number; label:string; children:string[] }>;
                if (groups.length === 0) return null;
                const xs = groups.flatMap(g => [g.x, g.x + g.w]);
                const ys = groups.flatMap(g => [g.y, g.y + g.h]);
                const minX = Math.min(...xs), minY = Math.min(...ys);
                const maxX = Math.max(...xs), maxY = Math.max(...ys);
                return (
                  <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} style={{ width:'100%', height:'100%' }}>
                    {groups.map(g => {
                      const aggCenterX = g.node.position.x + (((g.node as any).width) || 260) / 2;
                      const aggCenterY = g.node.position.y + (((g.node as any).height) || 120) / 2;
                      const collapsed = !!collapsedGroups[g.id];
                      return (
                        <g key={g.id}>
                          {/* Group box */}
                          <rect
                            x={g.x}
                            y={g.y}
                            rx={10}
                            ry={10}
                            width={g.w}
                            height={g.h}
                            fill={g.data.parallelRunning ? 'rgba(59,130,246,0.10)' : 'rgba(59,130,246,0.06)'}
                            stroke="rgba(59,130,246,0.35)"
                            strokeWidth={2}
                            onMouseEnter={(e) => {
                              const vp = getViewport();
                              const tooltipLines: Array<{child:string; event:string; durationMs:number}> = [];
                              const childEvents = (g.data.parallelChildEvents || {}) as Record<string, {event:string; durationMs:number}>;
                              g.children.forEach(cid => {
                                const ce = childEvents[cid];
                                tooltipLines.push({ child: cid, event: ce?.event || 'pending', durationMs: ce?.durationMs || 0 });
                              });
                              const screenX = (aggCenterX * vp.zoom) + vp.x;
                              const screenY = (g.y * vp.zoom) + vp.y + 24;
                              setParallelTooltip({ id: g.id, x: screenX, y: screenY, lines: tooltipLines });
                            }}
                            onMouseLeave={() => setParallelTooltip(null)}
                          />
                          {/* Label and summary */}
                          <text x={g.x + 12} y={g.y + 18} fill="#93c5fd" fontSize={12} fontWeight={700}>Parallel Group · {g.label}</text>
                          {g.data.parallelCompleted ? (
                            <text x={g.x + 12} y={g.y + 34} fill="#93c5fd" fontSize={11}>Completed: {g.data.parallelCompleted}/{g.children.length} · {g.data.parallelSummary ? `Result: ${g.data.parallelSummary}` : (g.data.parallelRunning ? 'Aggregating…' : '')}</text>
                          ) : null}
                          {/* Ribbons */}
                          {g.children.map(cid => {
                            const child = nodes.find(nn => nn.id === cid);
                            if (!child) return null;
                            const ccenterX = child.position.x + (((child as any).width) || 260) / 2;
                            const ccenterY = child.position.y + (((child as any).height) || 120) / 2;
                            const mx = (ccenterX + aggCenterX) / 2;
                            const my = (ccenterY + aggCenterY) / 2 - 20; // upward bow
                            const ev = (g.data.parallelChildEvents || {})[cid]?.event;
                            const stroke = ev ? (ev === 'failure' ? '#ef4444' : '#22c55e') : '#fde047';
                            const width = ev ? 2.5 : 2;
                            return (
                              <path key={`${g.id}-${cid}`} d={`M ${ccenterX} ${ccenterY} Q ${mx} ${my} ${aggCenterX} ${aggCenterY}`} fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" opacity={collapsed ? 0.2 : 0.9} />
                            );
                          })}
                        </g>
                      );
                    })}
                  </svg>
                );
              })()}
              {/* Tooltip overlay */}
              {parallelTooltip && (
                <div
                  style={{
                    position: 'absolute',
                    left: parallelTooltip.x,
                    top: parallelTooltip.y,
                    transform: 'translate(-50%, 0)',
                    background: isDarkMode ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.98)',
                    color: isDarkMode ? '#e2e8f0' : '#111',
                    border: `1px solid ${isDarkMode ? '#334155' : '#cbd5e1'}`,
                    borderRadius: 8,
                    padding: '8px 10px',
                    boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
                    pointerEvents: 'none',
                    minWidth: 240,
                    zIndex: 2
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12 }}>Branch Summary</div>
                  {parallelTooltip.lines.length === 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.8 }}>No children</div>
                  ) : (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap: 6 }}>
                      {parallelTooltip.lines.map((ln) => (
                        <>
                          <div style={{ fontSize: 12, opacity: 0.9, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{ln.child}</div>
                          <div style={{ fontSize: 12, textAlign:'right' }}>
                            <span style={{ color: ln.event === 'failure' ? '#ef4444' : ln.event === 'pending' ? '#eab308' : '#22c55e', fontWeight: 700 }}>{ln.event}</span>
                            <span style={{ opacity: 0.7 }}> · {(ln.durationMs/1000).toFixed(1)}s</span>
                          </div>
                        </>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <Controls />
          {showMinimap && (
            <MiniMap 
              nodeColor={node => {
                switch (node.data?.status) {
                  case 'running': return '#facc15';
                  case 'completed': return '#22c55e';
                  case 'failed': return '#ef4444';
                  default: return '#71717a';
                }
              }}
              pannable
              zoomable
              />
          )}
          {/* Children Editor Modal */}
          {showChildrenEditor && (
            <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex: 1000, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => setShowChildrenEditor(null)}>
              <div style={{ background: isDarkMode ? '#0f172a' : '#fff', color: isDarkMode ? '#e2e8f0' : '#111', width: 640, maxHeight: '80vh', borderRadius: 8, padding: 16, overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0 }}>Parallel Children for: {showChildrenEditor}</h3>
                  <button className="panel-button" onClick={() => setShowChildrenEditor(null)}>Close</button>
                </div>
                <p style={{ marginTop: 0, opacity: 0.8 }}>Select the contributor nodes whose outputs should aggregate into this parallel block.</p>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8 }}>
                  {nodes.map(n => (
                    <label key={n.id} style={{ display:'flex', alignItems:'center', gap: 8, border:'1px solid #334155', borderRadius: 8, padding: 8 }}>
                      <input
                        type="checkbox"
                        checked={(childrenOverrides[showChildrenEditor!] || []).includes(n.id)}
                        onChange={e => {
                          setChildrenOverrides(prev => {
                            const cur = new Set(prev[showChildrenEditor!] || []);
                            if (e.target.checked) cur.add(n.id); else cur.delete(n.id);
                            return { ...prev, [showChildrenEditor!]: Array.from(cur) };
                          });
                        }}
                      />
                      <span style={{ fontWeight: 600 }}>{(n.data as any)?.label || n.id}</span>
                      <span style={{ opacity: 0.7, fontSize: 12 }}>({n.id})</span>
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: 12, display:'flex', gap: 8, justifyContent:'flex-end' }}>
                  <button className="panel-button" onClick={() => setShowChildrenEditor(null)}>Done</button>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                  Changes apply during this run for aggregation and are also sent with the start request for future runs.
                </div>
              </div>
            </div>
          )}
            {/* Professional Toolbar */}
            <WorkflowToolbar
              onAddBlock={() => setShowUnifiedManager(true)}
              onArrangeBlocks={() => updateGraph(true)}
              onRunWorkflow={runPlannedWorkflow}
              onStopWorkflow={() => setIsRunning(false)}
              onClearHistory={clearExecutionHistory}
              onExportWorkflow={saveAsTemplate}
              onImportWorkflow={loadTemplate}
              onZoomIn={() => zoomIn()}
              onZoomOut={() => zoomOut()}
              onFitView={() => fitView({ padding: 0.3, duration: 400, maxZoom: 1.0 })}
              isRunning={isRunning}
              hasExecutionHistory={executionHistory.size > 0}
              availableTools={availableTools}
              selectedTools={selectedTools}
              onToolsChange={setSelectedTools}
              onEnhanceFlow={enhanceFlow}
              selectedNodes={nodes.filter(n => n.selected)}
              onImportTemplate={(template) => {
                // Import the template's state machine
                importStateMachine(template.machine, true);
              }}
            />

            {/* Unified Block Manager */}
            <UnifiedBlockManager
              isOpen={showUnifiedManager}
              onClose={() => setShowUnifiedManager(false)}
              onAddBlock={addUnifiedBlock}
              isDarkMode={isDarkMode}
              selectedTools={selectedTools}
              onToolsChange={setSelectedTools}
            />

            <Panel position="top-left" style={{ top: '80px' }}>
              <div className="panel-controls" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {highlightPath && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 12px',
                    background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
                    border: '1px solid #3b82f6',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#1e40af'
                  }}>
                    <span>🔍 Path Highlighted</span>
                    <button
                      onClick={clearPathHighlight}
                      style={{
                        padding: '2px 6px',
                        background: 'white',
                        border: '1px solid #3b82f6',
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    >
                      Clear (ESC)
                    </button>
                  </div>
                )}
                <button onClick={() => fitView({ padding: 0.3, duration: 400, maxZoom: 1.0 })} className="panel-button">
                  Fit View
                </button>

                <button onClick={() => updateGraph(true)} className="panel-button">
                  Re-layout
                </button>

                <button onClick={() => setShowUnifiedManager(true)} className="panel-button">
                  📦 Block Manager
                </button>

                <button
                  className={`panel-button ${layoutDirection === 'LR' ? 'active' : ''}`}
                  onClick={() => {
                    setLayoutDirection(layoutDirection === 'LR' ? 'TB' : 'LR');
                    setTimeout(() => updateGraph(true), 50);
                  }}
                >
                  {layoutDirection === 'LR' ? '→ Horizontal' : '↓ Vertical'}
                </button>

                <button
                  className={`panel-button ${showGrid ? 'active' : ''}`}
                  onClick={() => setShowGrid(!showGrid)}
                >
                  Grid: {showGrid ? 'On' : 'Off'}
                </button>

                <button
                  className={`panel-button ${showMinimap ? 'active' : ''}`}
                  onClick={() => setShowMinimap(!showMinimap)}
                >
                  Minimap: {showMinimap ? 'On' : 'Off'}
                </button>

                <button
                  className={`panel-button ${showConversationPanel ? 'active' : ''}`}
                  onClick={() => setShowConversationPanel(!showConversationPanel)}
                  title="Toggle conversation panel"
                >
                  💬 Chat: {showConversationPanel ? 'On' : 'Off'}
                </button>

                <button onClick={resetView} className="panel-button">
                  Clear
                </button>

                <button onClick={() => setShowToolsHub(true)} className="panel-button">
                  Tools
                </button>

                <button
                  onClick={() => setShowRawDataViewer(!showRawDataViewer)}
                  className={`panel-button ${showRawDataViewer ? 'active' : ''}`}
                  title="View raw state execution data"
                >
                  Raw Data
                </button>

                <button
                  className="panel-button"
                  onClick={() => setFollowActive(prev => !prev)}
                  title="Follow active node"
                >
                  Follow: {followActive ? 'On' : 'Off'}
                </button>

                {/* Replay Controls */}
                <button
                  className={`panel-button ${replayMode ? 'active' : ''}`}
                  onClick={() => {
                    setReplayMode(!replayMode);
                    setReplayIndex((prev: number | null) => (prev == null ? 0 : prev));
                  }}
                  title="Toggle replay mode"
                >
                  Replay: {replayMode ? 'On' : 'Off'}
                </button>
                <button
                  className="panel-button"
                  onClick={() => {
                    if (!replayMode || executionTrace.length === 0) return;
                    setReplayIndex((i: number | null) => {
                      const next = Math.max(0, (i ?? 0) - 1);
                      const id = executionTrace[next];
                      if (id) { setSelectedAgent(id); pendingFocusIdRef.current = id; focusAttemptsRef.current = 0; }
                      return next;
                    });
                  }}
                  title="Previous (←)"
                >Prev</button>
                <button
                  className="panel-button"
                  onClick={() => {
                    if (!replayMode || executionTrace.length === 0) return;
                    setReplayIndex((i: number | null) => {
                      const next = Math.min(executionTrace.length - 1, (i ?? 0) + 1);
                      const id = executionTrace[next];
                      if (id) { setSelectedAgent(id); pendingFocusIdRef.current = id; focusAttemptsRef.current = 0; }
                      return next;
                    });
                  }}
                  title="Next (→)"
                >Next</button>

              <button
                className={`panel-button ${highlightPath ? 'active' : ''}`}
                onClick={() => {
                  preventRerender.current = true;
                  setHighlightPath(!highlightPath);
                  setTimeout(() => { preventRerender.current = false; }, 100);
                }}
                title="Highlight Active Path"
              >
                Path: {highlightPath ? 'On' : 'Off'}
              </button>

              {/* Rerun from selected node */}
              <button
                className="panel-button"
                disabled={!selectedAgent || !executionId}
                onClick={rerunFromSelected}
                title="Rerun from the selected node"
              >
                Rerun From Here
              </button>

              {/* Add agent and connect, then rerun */}
              <button
                className="panel-button"
                disabled={!selectedAgent || !executionId}
                onClick={addAgentAndRerun}
                title="Add an agent and connect from selected, then rerun"
              >
                Add Agent + Rerun
              </button>

                {/* Collapse / Expand for selected parallel */}
                {selectedAgent && nodes.find(n => n.id === selectedAgent && ((n.data as any)?.parallelRunning || (n.data as any)?.nodeType === 'parallel')) && (
                  <button
                    className="panel-button"
                    onClick={() => {
                      const id = selectedAgent!;
                      setCollapsedGroups(prev => ({ ...prev, [id]: !prev[id] }));
                      const children = (nodes.find(n => n.id === id)?.data as any)?.parallelChildren || [];
                      const childSet = new Set(children);
                      // Hide/unhide child nodes
                      setNodes(nds => nds.map(n => childSet.has(n.id) ? ({ ...n, hidden: !collapsedGroups[id] ? true : false }) : n));
                      // Dim/undim child edges
                      setEdges(eds => eds.map(e => childSet.has(e.source) || childSet.has(e.target) ? ({ ...e, style: { ...e.style, opacity: !collapsedGroups[id] ? 0.08 : 1 } }) : e));
                    }}
                    title="Collapse/Expand selected parallel group"
                  >
                    {collapsedGroups[selectedAgent!] ? 'Expand Group' : 'Collapse Group'}
                  </button>
                )}

                {/* Edit Children for selected parallel */}
                {selectedAgent && nodes.find(n => n.id === selectedAgent && ((n.data as any)?.parallelRunning || (n.data as any)?.nodeType === 'parallel')) && (
                  <button className="panel-button" onClick={() => setShowChildrenEditor(selectedAgent!)} title="Edit parallel children">Edit Children</button>
                )}

                {/* Show editor button if a parallel node is selected */}
                {selectedAgent && nodes.find(n => n.id === selectedAgent && (n.data as any)?.nodeType === 'parallel') && (
                  <button className="panel-button" onClick={() => setShowChildrenEditor(selectedAgent!)} title="Edit parallel children">Edit Children</button>
                )}
              </div>
            </Panel>

            {/* Import State Machine Dialog */}
            {showImportDialog && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999
              }}>
                <div style={{
                  background: isDarkMode ? '#1e293b' : 'white',
                  borderRadius: 12,
                  padding: 24,
                  width: '90%',
                  maxWidth: 800,
                  maxHeight: '80vh',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                }}>
                  <h3 style={{
                    margin: '0 0 16px 0',
                    fontSize: 18,
                    fontWeight: 600,
                    color: isDarkMode ? '#e5e7eb' : '#111827'
                  }}>
                    Import State Machine
                  </h3>

                  <p style={{
                    margin: '0 0 16px 0',
                    fontSize: 14,
                    color: isDarkMode ? '#9ca3af' : '#6b7280'
                  }}>
                    Paste your state machine JSON from the backend. The structure should include states and edges arrays.
                  </p>

                  <textarea
                    value={importJsonText}
                    onChange={(e) => setImportJsonText(e.target.value)}
                    placeholder={`{
  "name": "Dynamic Workflow",
  "initial_state": "initialization",
  "states": [
    {
      "id": "state1",
      "name": "State Name",
      "type": "analysis",
      "description": "Description",
      "agent_role": "Role",
      "tools": ["tool1", "tool2"],
      "transitions": {...}
    }
  ],
  "edges": [
    {
      "source": "state1",
      "target": "state2",
      "event": "success"
    }
  ]
}`}
                    style={{
                      flex: 1,
                      width: '100%',
                      minHeight: 300,
                      padding: 12,
                      borderRadius: 8,
                      border: `1px solid ${isDarkMode ? '#475569' : '#e5e7eb'}`,
                      background: isDarkMode ? '#0f172a' : '#f9fafb',
                      color: isDarkMode ? '#e5e7eb' : '#111827',
                      fontFamily: 'monospace',
                      fontSize: 12,
                      resize: 'vertical'
                    }}
                  />

                  <div style={{
                    display: 'flex',
                    gap: 8,
                    marginTop: 16,
                    justifyContent: 'flex-end'
                  }}>
                    <button
                      onClick={() => {
                        setShowImportDialog(false);
                        setImportJsonText('');
                      }}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 6,
                        border: `1px solid ${isDarkMode ? '#475569' : '#e5e7eb'}`,
                        background: 'transparent',
                        color: isDarkMode ? '#e5e7eb' : '#374151',
                        cursor: 'pointer',
                        fontSize: 14
                      }}
                    >
                      Cancel
                    </button>

                    <button
                      onClick={() => {
                        try {
                          const machine = JSON.parse(importJsonText);
                          importStateMachine(machine, true);
                          setShowImportDialog(false);
                          setImportJsonText('');
                        } catch (e) {
                          alert('Invalid JSON format. Please check your input.');
                          console.error('JSON parse error:', e);
                        }
                      }}
                      disabled={!importJsonText.trim()}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 6,
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        cursor: importJsonText.trim() ? 'pointer' : 'not-allowed',
                        opacity: importJsonText.trim() ? 1 : 0.5,
                        fontSize: 14
                      }}
                    >
                      Import as Professional Blocks
                    </button>

                    <button
                      onClick={() => {
                        try {
                          const machine = JSON.parse(importJsonText);
                          importStateMachine(machine, false); // Import as regular blocks
                          setShowImportDialog(false);
                          setImportJsonText('');
                        } catch (e) {
                          alert('Invalid JSON format. Please check your input.');
                          console.error('JSON parse error:', e);
                        }
                      }}
                      disabled={!importJsonText.trim()}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 6,
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        cursor: importJsonText.trim() ? 'pointer' : 'not-allowed',
                        opacity: importJsonText.trim() ? 1 : 0.5,
                        fontSize: 14
                      }}
                    >
                      Import as Simple Blocks
                    </button>
                  </div>
                </div>
              </div>
            )}
          </ReactFlow>
        </div>

        {/* Resizable Divider - only show when panel is visible */}
        {showConversationPanel && (
          <div
            className="resize-divider"
            title="Drag to resize • Double-click to reset"
            onDoubleClick={() => {
              setOutputPanelWidth(500); // Reset to default width
            }}
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = outputPanelWidth;

            const handleMouseMove = (e: MouseEvent) => {
              const deltaX = startX - e.clientX;
              const newWidth = Math.min(
                Math.max(startWidth + deltaX, 300), // Minimum width: 300px
                Math.min(800, window.innerWidth - 500) // Maximum width: 800px or window width - 500px for flow canvas
              );
              setOutputPanelWidth(newWidth);
              // Save to localStorage immediately for persistence
              localStorage.setItem('chatbot_panel_width', newWidth.toString());
            };

            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
              document.body.style.cursor = '';
              document.body.style.userSelect = '';
              document.body.classList.remove('resizing');
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            document.body.classList.add('resizing');
          }}
          style={{
            position: 'absolute',
            right: `${outputPanelWidth}px`,
            top: 0,
            bottom: '70px', // Stop before the input area
            width: '6px',
            cursor: 'col-resize',
            zIndex: 50, // Reduced z-index to stay below modals
            background: isDarkMode
              ? 'linear-gradient(90deg, transparent, rgba(51, 65, 85, 0.5), transparent)'
              : 'linear-gradient(90deg, transparent, rgba(203, 213, 225, 0.5), transparent)',
            transition: 'background 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = isDarkMode
              ? 'linear-gradient(90deg, transparent, #3b82f6, transparent)'
              : 'linear-gradient(90deg, transparent, #3b82f6, transparent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isDarkMode
              ? 'linear-gradient(90deg, transparent, rgba(51, 65, 85, 0.5), transparent)'
              : 'linear-gradient(90deg, transparent, rgba(203, 213, 225, 0.5), transparent)';
          }}
        >
          {/* Drag Handle Indicator */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '2px',
              height: '40px',
              background: isDarkMode ? '#475569' : '#cbd5e1',
              borderRadius: '2px',
            }}
          />
        </div>
        )}

        {/* Chatbot Output Panel with Toggle */}
        <div className="flow-output-panel" style={{
          width: showConversationPanel ? `${outputPanelWidth}px` : '0px',
          overflow: showConversationPanel ? 'visible' : 'hidden',
          transition: 'width 0.3s ease-in-out'
        }}>
          {showConversationPanel && (
            <>
              <ImprovedChatbotOutput
                agents={stableAgents}
                nodes={nodes}
                selectedAgent={selectedAgent}
                onAgentSelect={handleAgentSelect}
                onNodeFocus={handleNodeFocus}
                isDarkMode={isDarkMode}
              />

              {/* Improved Raw Data Viewer */}
              {showRawDataViewer && executionId && (
                <ImprovedStateDataViewer
                  execId={executionId}
                  isDarkMode={isDarkMode}
                  onClose={() => setShowRawDataViewer(false)}
                  nodes={nodes}
                  edges={edges}
                />
              )}
            </>
          )}

          {/* Add Node Modal - Replaced by Unified Block Manager */}
          {false && showAddNode && (
            <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200}} onClick={()=>setShowAddNode(false)}>
              <div style={{ background: isDarkMode?'#0f172a':'#fff', color: isDarkMode?'#e2e8f0':'#0f172a', width:480, margin:'10vh auto', padding:16, borderRadius:8 }} onClick={(e)=>e.stopPropagation()}>
                <div style={{ fontWeight:600, marginBottom:8 }}>Add Block</div>
                <div style={{ display:'grid', gap:8 }}>
                  <input className="task-input" placeholder="id (slug_case)" value={nodeDraft.id} onChange={e=>setNodeDraft({...nodeDraft, id:e.target.value})} />
                  <input className="task-input" placeholder="name" value={nodeDraft.name} onChange={e=>setNodeDraft({...nodeDraft, name:e.target.value})} />
                  <select className="task-input" value={nodeDraft.type} onChange={e=>setNodeDraft({...nodeDraft, type: e.target.value as any})}>
                    <option value="analysis">analysis</option>
                    <option value="tool_call">tool_call</option>
                    <option value="decision">decision</option>
                    <option value="parallel">parallel</option>
                    <option value="final">final</option>
                  </select>
                  <input className="task-input" placeholder="agent role (optional)" value={nodeDraft.agent_role} onChange={e=>setNodeDraft({...nodeDraft, agent_role:e.target.value})} />
                  <textarea className="task-input" rows={3} placeholder="description/prompt" value={nodeDraft.description} onChange={e=>setNodeDraft({...nodeDraft, description:e.target.value})} />
                  <div style={{ border:`1px dashed ${isDarkMode?'#334155':'#e2e8f0'}`, padding:6, borderRadius:6, maxHeight:120, overflow:'auto' }}>
                    <div style={{ fontSize:12, marginBottom:4 }}>Tools</div>
                    {availableTools.map(t=>{
                      const checked = nodeDraft.tools.includes(t);
                      return (
                        <label key={t} style={{ display:'inline-flex', alignItems:'center', gap:4, marginRight:8, marginBottom:6 }}>
                          <input type="checkbox" checked={checked} onChange={(e)=>{
                            const set = new Set(nodeDraft.tools);
                            if (e.target.checked) set.add(t); else set.delete(t);
                            setNodeDraft({...nodeDraft, tools: Array.from(set)});
                          }} />
                          <span>{t}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                    <button className="panel-button" onClick={()=>setShowAddNode(false)}>Cancel</button>
                    <button className="panel-button" onClick={async()=>{
                      if (!executionId) return;
                      if (!nodeDraft.id || !nodeDraft.name) return;
                      try {
                        const patch: any = { states: [{ id: nodeDraft.id, name: nodeDraft.name, type: nodeDraft.type, description: nodeDraft.description, agent_role: nodeDraft.agent_role, tools: nodeDraft.tools }] };
                        await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/${executionId}/update_graph`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(patch) });
                        // Update UI
                        const newNode: Node = {
                          id: nodeDraft.id,
                          type: 'agent',
                          position: { x: 100, y: 100 },
                          data: { label: nodeDraft.name, name: nodeDraft.name, status:'pending', nodeType: nodeDraft.type, task: nodeDraft.description, tools: nodeDraft.tools, toolsPlanned: nodeDraft.tools, description: nodeDraft.description, agentRole: nodeDraft.agent_role, direction: layoutDirection },
                          targetPosition: layoutDirection === 'LR' ? Position.Left : Position.Top,
                          sourcePosition: layoutDirection === 'LR' ? Position.Right : Position.Bottom,
                        };
                        setNodes(prev=>[...prev, newNode]);
                        setShowAddNode(false);
                      } catch (e) { console.error('Failed to add block', e); }
                    }}>Create</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Edge Editor */}
          {editMode && edgeEdit && (
            <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200}} onClick={()=>setEdgeEdit(null)}>
              <div style={{ background: isDarkMode?'#0f172a':'#fff', color: isDarkMode?'#e2e8f0':'#0f172a', width:420, margin:'15vh auto', padding:16, borderRadius:8 }} onClick={(e)=>e.stopPropagation()}>
                <div style={{ fontWeight:600, marginBottom:8 }}>Edit Connection</div>
                <div style={{ fontSize:12, marginBottom:8 }}>From <b>{edgeEdit.source}</b> to <b>{edgeEdit.target}</b></div>
                <label>
                  <div className="label">Event</div>
                  <input className="task-input" defaultValue={edgeEdit.event || 'success'} onBlur={(e)=>setEdgeEdit({...edgeEdit, event: e.target.value})} />
                </label>
                <div style={{ display:'flex', gap:8, justifyContent:'space-between', marginTop:12 }}>
                  <button className="panel-button" onClick={async()=>{
                    if (!executionId) return;
                    try {
                      await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/${executionId}/update_graph`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ remove_edges: [{ source: edgeEdit.source, target: edgeEdit.target, event: edgeEdit.event }] }) });
                      setEdges(prev=>prev.filter(e=>!(e.source===edgeEdit.source && e.target===edgeEdit.target && ((e as any).label || 'success')===edgeEdit.event)));
                      setEdgeEdit(null);
                    } catch (e) { console.error('Failed to delete edge', e); }
                  }}>Delete</button>
                  <span />
                  <button className="panel-button" onClick={()=>setEdgeEdit(null)}>Cancel</button>
                  <button className="panel-button" onClick={async()=>{
                    if (!executionId || !edgeEdit) return;
                    try {
                      // Change event: remove old then add new
                      await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/${executionId}/update_graph`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ remove_edges: [{ source: edgeEdit.source, target: edgeEdit.target, event: edgeEdit.event }], edges: [{ source: edgeEdit.source, target: edgeEdit.target, event: edgeEdit.event }] }) });
                      setEdges(prev=>{
                        const rest = prev.filter(e=>!(e.source===edgeEdit.source && e.target===edgeEdit.target));
                        const newE: Edge = { id: `${edgeEdit.source}-${edgeEdit.target}-${edgeEdit.event}`, source: edgeEdit.source, target: edgeEdit.target, type:'smoothstep', animated:false, label: edgeEdit.event && edgeEdit.event!=='success'? edgeEdit.event : '', labelStyle:{ fill:'#94a3b8', fontSize:11 }, labelBgStyle:{ fill:'#1e293b', fillOpacity:0.8 }, style:{ stroke:'#52525b', strokeWidth:1.5 }, markerEnd:{ type: MarkerType.ArrowClosed, width:20, height:20, color:'#52525b' } };
                        return [...rest, newE];
                      });
                      setEdgeEdit(null);
                    } catch (e) { console.error('Failed to update edge', e); }
                  }}>Save</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Original implementation kept below, commented out */}
      {false && (
        <>
          <div className="output-panel-header">
            <h2 className="panel-title">Agent Output</h2>
            <div className="header-actions">
              <button
                className="panel-action-btn"
                onClick={() => {
                  const activeAgent = Array.from(agents.values()).find(a => a.status === 'running');
                  if (activeAgent) {
                    setSelectedAgent(activeAgent.id);
                    const node = nodes.find(n => n.id === activeAgent.id);
                    if (node) {
                      setCenter(node.position.x + 110, node.position.y + 50, { zoom: 1.2, duration: 300 });
                    }
                  }
                }}
                title="Focus Active"
              >
                Focus Active
              </button>
              <button
                className="panel-action-btn"
                onClick={() => setSelectedAgent(null)}
                disabled={!selectedAgent}
              >
                Clear
              </button>
            </div>
          </div>
          
          <div className="output-scroll-container">
            <div className="output-list">
              {Array.from(agents.values()).map(agent => {
                const isExpanded = selectedAgent === agent.id || (!selectedAgent && agent.status === 'running');
                const node = nodes.find(n => n.id === agent.id);
                const nodeData = node?.data;
                
                return (
                  <div
                    key={agent.id}
                    className={`output-card ${agent.status} ${selectedAgent === agent.id ? 'selected' : ''} ${isExpanded ? 'expanded' : ''}`}
                  >
                    <div 
                      className="card-header"
                      onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
                    >
                      <div className="card-header-left">
                        <span className={`status-dot ${agent.status}`} />
                        <div className="agent-info">
                          <span className="agent-name">{agent.name}</span>
                          {nodeData?.agentRole && (
                            <span className="agent-role">{nodeData.agentRole}</span>
                          )}
                        </div>
                      </div>
                      <div className="card-header-right">
                        {agent.status === 'running' && (
                          <span className="running-indicator">
                            <span className="pulse-dot" />
                            Live
                          </span>
                        )}
                        {agent.status === 'completed' && (
                          <span className="status-text success">✓ Done</span>
                        )}
                        {agent.status === 'failed' && (
                          <span className="status-text error">✗ Failed</span>
                        )}
                        {agent.status === 'pending' && (
                          <span className="status-text pending">⏳ Waiting</span>
                        )}
                        {agent.startTime && (
                          <span className="duration">
                            {agent.endTime ? 
                              `${((agent.endTime - agent.startTime) / 1000).toFixed(1)}s` :
                              `${((Date.now() - agent.startTime) / 1000).toFixed(0)}s`
                            }
                          </span>
                        )}
                        <span className="expand-icon">
                          {isExpanded ? '▼' : '▶'}
                        </span>
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div className="card-body">
                        {/* Agent metadata section */}
                        {(nodeData?.task || nodeData?.description || (nodeData?.toolsPlanned && nodeData.toolsPlanned.length > 0)) && (
                          <div className="agent-metadata">
                            {nodeData?.task && (
                              <div className="metadata-item">
                                <span className="metadata-label">Task:</span>
                                <span className="metadata-value">{nodeData.task}</span>
                              </div>
                            )}
                            {nodeData?.description && (
                              <div className="metadata-item">
                                <span className="metadata-label">Description:</span>
                                <span className="metadata-value">{nodeData.description}</span>
                              </div>
                            )}
                            {nodeData?.toolsPlanned && nodeData.toolsPlanned.length > 0 && (
                              <div className="metadata-item">
                                <span className="metadata-label">Tools:</span>
                                <div className="tools-list">
                                  {nodeData.toolsPlanned.map((tool: string, idx: number) => (
                                    <span key={idx} className="tool-badge">{tool}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {agent.parent && (
                              <div className="metadata-item">
                                <span className="metadata-label">Parent:</span>
                                <span className="metadata-value">{agent.parent}</span>
                              </div>
                            )}
                            {agent.depth !== undefined && agent.depth > 0 && (
                              <div className="metadata-item">
                                <span className="metadata-label">Depth Level:</span>
                                <span className="metadata-value">Level {agent.depth}</span>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="card-content">
                          {agent.output ? (
                            <div className="markdown-output">
                              <ReactMarkdown 
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  code: ({className, children, ...props}: any) => {
                                    const match = /language-(\w+)/.exec(className || '');
                                    const isInline = !match;
                                    return !isInline ? (
                                      <div className="code-block">
                                        <div className="code-header">
                                          <span className="code-lang">{match[1]}</span>
                                        </div>
                                        <pre className="code-content">
                                          <code className={className} {...props}>
                                            {children}
                                          </code>
                                        </pre>
                                      </div>
                                    ) : (
                                      <code className={`inline-code ${className || ''}`} {...props}>
                                        {children}
                                      </code>
                                    );
                                  },
                                  p: ({children}) => <p className="markdown-p">{children}</p>,
                                  ul: ({children}) => <ul className="markdown-list">{children}</ul>,
                                  ol: ({children}) => <ol className="markdown-list ordered">{children}</ol>,
                                  li: ({children}) => <li className="markdown-li">{children}</li>,
                                  h1: ({children}) => <h4 className="markdown-h1">{children}</h4>,
                                  h2: ({children}) => <h5 className="markdown-h2">{children}</h5>,
                                  h3: ({children}) => <h6 className="markdown-h3">{children}</h6>,
                                  blockquote: ({children}) => <blockquote className="markdown-blockquote">{children}</blockquote>,
                                  a: ({href, children}) => <a href={href} target="_blank" rel="noopener noreferrer" className="markdown-link">{children}</a>,
                                }}
                              >
                                {agent.output}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <div className="no-output">
                              {agent.status === 'running' ? (
                                <div className="loading-dots">
                                  <span /><span /><span />
                                </div>
                              ) : (
                                <span>Waiting for output...</span>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {agent.error && (
                          <div className="card-error">
                            <span className="error-icon">⚠</span>
                            <span className="error-text">{agent.error}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              
              {agents.size === 0 && (
                <div className="empty-state">
                  <div className="empty-icon">🤖</div>
                  <h3>No agents yet</h3>
                  <p>Enter a task below to start execution</p>
                </div>
              )}
            </div>
          </div>
        </>
      )} {/* End of false block - old implementation */}

      {/* Block Settings Panel */}
      {selectedNodeForSettings && (
        <BlockSettingsPanel
          node={nodes.find(n => n.id === selectedNodeForSettings.id) || selectedNodeForSettings}
          isDarkMode={isDarkMode}
          onClose={() => setSelectedNodeForSettings(null)}
          onUpdate={(nodeId: string, data: any) => {
            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId
                  ? { ...n, data: { ...n.data, ...data } }
                  : n
              )
            );
            // Update the selectedNodeForSettings to reflect the changes
            setSelectedNodeForSettings(prev =>
              prev && prev.id === nodeId
                ? { ...prev, data: { ...prev.data, ...data } }
                : prev
            );
          }}
          onDelete={(nodeId: string) => {
            setNodes((nds) => nds.filter((n) => n.id !== nodeId));
            setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
            setSelectedNodeForSettings(null);
            setSelectedAgent(null);
          }}
          onDuplicate={(nodeId: string) => {
            const nodeToDuplicate = nodes.find((n) => n.id === nodeId);
            if (nodeToDuplicate) {
              const newNode = {
                ...nodeToDuplicate,
                id: uuidv4(),
                position: {
                  x: nodeToDuplicate.position.x + 50,
                  y: nodeToDuplicate.position.y + 50
                }
              };
              setNodes((nds) => [...nds, newNode]);
            }
          }}
          availableTools={availableTools}
        />
      )}

      {/* Command Bar */}
      <div className="command-bar">
        <select
          className="mode-select"
          value={executionMode}
          onChange={(e) => setExecutionMode(e.target.value as any)}
          disabled={isRunning}
        >
          <option value="dynamic">Dynamic</option>
          <option value="neural">Neural</option>
          <option value="parallel">Parallel</option>
          <option value="sequential">Sequential</option>
        </select>
        
        <input
          className="task-input"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Enter your task..."
          disabled={isRunning}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isRunning && task.trim()) {
              startExecution();
            }
          }}
        />
        
        <button
          className={`execute-btn ${isRunning ? 'stop' : ''}`}
          onClick={isRunning ? stopExecution : startExecution}
          disabled={!isRunning && !task.trim()}
        >
          {isRunning ? '⏹ Stop' : '▶ Execute'}
        </button>
      </div>
    </div>
  );
};


// Wrapper Component with Provider
const FlowSwarmInterfaceWrapper: React.FC = () => {
  return (
    <ReactFlowProvider>
      <FlowSwarmInterface />
    </ReactFlowProvider>
  );
};

export default FlowSwarmInterfaceWrapper;
