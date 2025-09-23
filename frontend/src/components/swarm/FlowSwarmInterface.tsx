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
import ProfessionalAgentNode from './components/ProfessionalAgentNode';
import OptimizedSmoothEdge from './components/OptimizedSmoothEdge';
import ChatbotOutput from './components/ChatbotOutput';
import { useTheme } from '../../contexts/ThemeContext';

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

      {(data.toolsPlanned?.length > 0 || data.toolsUsed?.length > 0) && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          marginTop: '8px',
        }}>
          {(data.toolsUsed || data.toolsPlanned || []).slice(0, 3).map((tool: string, i: number) => (
            <span
              key={i}
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                background: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
                color: isDark ? '#d1d5db' : '#6b7280',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
              }}
            >
              {tool}
            </span>
          ))}
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
  status: 'pending' | 'running' | 'completed' | 'failed';
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
  const { fitView, setCenter, getViewport } = useReactFlow();
  
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
  const [outputPanelWidth, setOutputPanelWidth] = useState(400);
  const [activelyStreamingAgents, setActivelyStreamingAgents] = useState<Set<string>>(new Set());
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
  const [toolsLoading, setToolsLoading] = useState(false);
  const [highlightPath, setHighlightPath] = useState(false);
  const [followActive, setFollowActive] = useState<boolean>(true);
  const followActiveRef = useRef<boolean>(true);
  useEffect(() => { followActiveRef.current = followActive; }, [followActive]);
  // Replay/trace controls
  const [executionTrace, setExecutionTrace] = useState<string[]>([]);
  const [replayMode, setReplayMode] = useState<boolean>(false);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
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
  
  // WebSocket
  const wsRef = useRef<WebSocket | null>(null);
  const agentSequences = useRef<Map<string, number>>(new Map());
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
    agent: AgentNode
  }), []);
  const edgeTypes = useMemo<EdgeTypes>(() => ({
    animated: AnimatedEdge,
    smoothstep: AnimatedEdge,
    default: AnimatedEdge,
    bezier: AnimatedEdge,
    straight: AnimatedEdge,
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

  // Keyboard shortcuts for replay navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
          
          // Update node status in graph
          setNodes(nodes => 
            nodes.map(node => ({
              ...node,
              data: {
                ...node.data,
                status: node.id === agent_id ? 'running' : node.data.status,
              },
            }))
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
          
          // Update node status in graph
          setNodes(nodes => 
            nodes.map(node => ({
              ...node,
              data: {
                ...node.data,
                status: node.id === agent_id ? 'completed' : node.data.status,
              },
            }))
          );
          
          // Update edges to show completion
          setEdges(edges =>
            edges.map(edge => ({
              ...edge,
              animated: false,
              style: {
                ...edge.style,
                stroke: edge.source === agent_id ? '#22c55e' : edge.style?.stroke || '#52525b',
              },
            }))
          );
        }
        break;
        
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

  const startExecution = async () => {
    if (!task.trim()) return;
    
    // If we have an existing state machine structure, preserve it (soft reset)
    // Otherwise do a full reset
    if (hasStateMachineStructure && nodes.length > 0) {
      softReset();
    } else {
      resetView();
    }
    setIsRunning(true);
    agentSequences.current.clear();
    
    try {
      const requestBody = {
        task,
        execution_mode: executionMode,
        use_mock: false,
        max_parallel: 5,
        tool_preferences: {
          selected_tools: Array.from(selectedTools),
          restrict_to_selected: selectedTools.size > 0,  // If tools are selected, restrict to them
        }
      };
      
      // Use AI state machine endpoint for dynamic mode
      const apiUrl = executionMode === 'dynamic' 
        ? `${window.location.origin}/api/v1/streaming/stream/state-machine`
        : `${window.location.origin}/api/v1/streaming/stream/v2`;
        
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const data = await response.json();
      setExecutionId(data.exec_id);
      
      setTimeout(() => connectWebSocket(data.exec_id, false), 100);
    } catch (error) {
      console.error('Failed:', error);
      setIsRunning(false);
      setConnectionStatus('error');
    }
  };

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
    setHasStateMachineStructure(false);

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
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
    <div className={`flow-swarm-container ${isDarkMode ? 'dark-mode' : 'light-mode'}`}>
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
        <div className="flow-graph-panel" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            fitView={false}
            attributionPosition="bottom-left"
            minZoom={0.2}
            maxZoom={1.5}
            nodesDraggable={true}
            nodesConnectable={false}
            elementsSelectable={true}
            panOnScroll={true}
            panOnDrag={true}
            elevateNodesOnSelect={false}
            snapToGrid={true}
            snapGrid={[15, 15]}
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={null}
            selectionKeyCode={null}
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
                width: 15,
                height: 15,
                color: isDarkMode ? '#475569' : '#cbd5e1',
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
              color={isDarkMode ? '#334155' : '#cbd5e1'}
            />
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
            <Panel position="top-left">
              <div className="panel-controls" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={() => fitView({ padding: 0.3, duration: 400, maxZoom: 1.0 })} className="panel-button">
                  Fit View
                </button>

                <button onClick={() => updateGraph(true)} className="panel-button">
                  Re-layout
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

                <button onClick={resetView} className="panel-button">
                  Clear
                </button>

                <button onClick={() => setShowToolsHub(true)} className="panel-button">
                  Tools
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

          </ReactFlow>
        </div>

        {/* Chatbot Output Panel */}
        <div className="flow-output-panel" style={{ width: `${outputPanelWidth}px` }}>
          <ChatbotOutput
            agents={stableAgents}
            nodes={nodes}
            selectedAgent={selectedAgent}
            onAgentSelect={handleAgentSelect}
            onNodeFocus={handleNodeFocus}
          />
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
