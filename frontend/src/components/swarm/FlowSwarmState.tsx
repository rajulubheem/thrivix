import { useState, useRef, useMemo, useEffect } from 'react';
import { Node, Edge, useNodesState, useEdgesState, useReactFlow, Position, MarkerType } from 'reactflow';
import { BlockStatus } from '../../types/workflow';
import { useTheme } from '../../contexts/ThemeContext';
import { useWebSocketManager } from './websocket/useWebSocketManager';
import { FrameHandlers, FrameHandlerContext } from './websocket/frameHandlers';
import { ConnectionStatus } from './websocket/WebSocketManager';
import { getLayoutedElements } from './utils/layoutUtils';

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

export const useFlowSwarmState = () => {
  const { fitView, setCenter, getViewport, project, zoomIn, zoomOut } = useReactFlow();
  const { isDark: isDarkMode } = useTheme();
  
  // Core Flow State
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [agents, setAgents] = useState<Map<string, Agent>>(new Map());
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  // History State
  const [history, setHistory] = useState<{ nodes: Node[], edges: Edge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const maxHistorySize = 50;

  // Execution State
  const [task, setTask] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [executionMode, setExecutionMode] = useState<'sequential' | 'parallel' | 'dynamic' | 'neural'>('dynamic');
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

  // UI State
  const [outputPanelWidth, setOutputPanelWidth] = useState(() => {
    const saved = localStorage.getItem('chatbot_panel_width');
    const savedWidth = saved ? parseInt(saved, 10) : 400;
    return Math.min(Math.max(savedWidth, 300), 800);
  });
  const [isInteracting, setIsInteracting] = useState(false);
  const [hasStateMachineStructure, setHasStateMachineStructure] = useState<boolean>(false);
  const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>('LR');
  const [showGrid, setShowGrid] = useState(true);
  const [showMinimap, setShowMinimap] = useState(false);
  const [showConversationPanel, setShowConversationPanel] = useState(true);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [highlightPath, setHighlightPath] = useState(false);
  const [followActive, setFollowActive] = useState<boolean>(true);
  const [showRawDataViewer, setShowRawDataViewer] = useState<boolean>(false);
  const [showToolsHub, setShowToolsHub] = useState(false);
  const [showAIChat, setShowAIChat] = useState<boolean>(false);
  const [aiSessionId, setAISessionId] = useState<string | null>(null);

  // Modal States
  const [decisionPrompt, setDecisionPrompt] = useState<null | {stateId: string, name: string, description?: string, allowed: string[]}>(null);
  const [inputPrompt, setInputPrompt] = useState<null | { stateId: string; name: string; description?: string; allowed: string[]; schema?: any }>(null);
  const [inputValue, setInputValue] = useState<string>("");
  const [showAddNode, setShowAddNode] = useState<boolean>(false);
  const [showImportDialog, setShowImportDialog] = useState<boolean>(false);
  const [showUnifiedManager, setShowUnifiedManager] = useState<boolean>(false);
  const [selectedNodeForSettings, setSelectedNodeForSettings] = useState<Node | null>(null);
  const [showChildrenEditor, setShowChildrenEditor] = useState<string | null>(null);

  // Edit Mode State
  const [editMode, setEditMode] = useState<boolean>(true);
  const [nodeDraft, setNodeDraft] = useState<{ id: string; name: string; type: 'analysis' | 'tool_call' | 'decision' | 'parallel' | 'final'; description?: string; agent_role?: string; tools: string[] }>({ id: '', name: '', type: 'analysis', description: '', agent_role: '', tools: [] });
  const [edgeEdit, setEdgeEdit] = useState<null | { id?: string; source: string; target: string; event?: string }>(null);
  const [paletteOpen, setPaletteOpen] = useState<boolean>(true);
  const [paletteTab, setPaletteTab] = useState<'blocks'|'tools'>('blocks');
  const [planned, setPlanned] = useState<boolean>(false);

  // Replay State
  const [executionTrace, setExecutionTrace] = useState<string[]>([]);
  const [replayMode, setReplayMode] = useState<boolean>(false);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [stateExecutionData, setStateExecutionData] = useState<any[]>([]);

  // Tools State
  const [availableTools, setAvailableTools] = useState<string[]>([]);
  const [toolDetails, setToolDetails] = useState<Record<string, { description?: string; category?: string }>>({});
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [toolSearch, setToolSearch] = useState('');
  const [toolPrefs, setToolPrefs] = useState<null | { unknown: string[]; effective: string[] }>(null);

  // Parallel State
  const [childrenOverrides, setChildrenOverrides] = useState<Record<string, string[]>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [parallelTooltip, setParallelTooltip] = useState<null | { id: string; x: number; y: number; lines: Array<{ child: string; event: string; durationMs: number }> }>(null);

  // Refs
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const pendingLayoutRef = useRef<boolean>(false);
  const pendingFocusIdRef = useRef<string | null>(null);
  const focusAttemptsRef = useRef<number>(0);
  const followActiveRef = useRef<boolean>(true);
  const preventRerender = useRef(false);
  const layoutCache = useRef<{ nodes: Node[], edges: Edge[] }>({ nodes: [], edges: [] });
  const updateTimer = useRef<NodeJS.Timeout | null>(null);
  const lastLayoutedAgentIds = useRef<Set<string>>(new Set());

  // Soft reset function
  const softReset = () => {
    setAgents(new Map());
    setSelectedAgent(null);
    setActivelyStreamingAgents(new Set());
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

  // Reset view function
  const resetView = () => {
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

  // Frame handler context
  const frameHandlerContext: FrameHandlerContext = {
    setNodes,
    setEdges,
    setAgents,
    setActivelyStreamingAgents,
    setIsRunning,
    setHasStateMachineStructure,
    setExecutionTrace,
    setStateExecutionData,
    setExecutionHistory,
    setCurrentExecutingNode,
    setIsExecuting,
    setExecutionOrderCounter,
    setNextExecutingNode,
    setDecisionPrompt,
    setInputPrompt,
    setInputValue,
    setToolPrefs,
    setPlanned,
    setSelectedAgent,
    setCenter,
    fitView,
    layoutDirection,
    isDarkMode,
    nodes,
    executionHistory,
    executionOrderCounter,
    pendingFocusIdRef,
    focusAttemptsRef,
    followActiveRef,
    layoutCache,
    lastLayoutedAgentIds,
    softReset,
    getLayoutedElements,
  };

  const frameHandlersRef = useRef<FrameHandlers>(new FrameHandlers(frameHandlerContext));

  // Update frame handlers when context changes
  useEffect(() => {
    frameHandlersRef.current = new FrameHandlers(frameHandlerContext);
  }, [nodes, executionHistory, executionOrderCounter, layoutDirection, isDarkMode]);

  // WebSocket
  const { connectWebSocket, disconnectWebSocket, wsRef, agentSequences } = useWebSocketManager({
    onTokenFrame: (frame) => frameHandlersRef.current.handleTokenFrame(frame),
    onControlFrame: (frame) => frameHandlersRef.current.handleControlFrame(frame),
    isRunning
  });

  return {
    // Core Flow
    nodes, setNodes, onNodesChange,
    edges, setEdges, onEdgesChange,
    agents, setAgents,
    selectedAgent, setSelectedAgent,
    
    // History
    history, setHistory,
    historyIndex, setHistoryIndex,
    maxHistorySize,
    
    // Execution
    task, setTask,
    isRunning, setIsRunning,
    executionId, setExecutionId,
    connectionStatus, setConnectionStatus,
    executionMode, setExecutionMode,
    activelyStreamingAgents, setActivelyStreamingAgents,
    currentExecutingNode, setCurrentExecutingNode,
    nextExecutingNode, setNextExecutingNode,
    executionActions, setExecutionActions,
    isExecuting, setIsExecuting,
    executionHistory, setExecutionHistory,
    executionOrderCounter, setExecutionOrderCounter,
    
    // UI
    outputPanelWidth, setOutputPanelWidth,
    isInteracting, setIsInteracting,
    hasStateMachineStructure, setHasStateMachineStructure,
    layoutDirection, setLayoutDirection,
    showGrid, setShowGrid,
    showMinimap, setShowMinimap,
    showConversationPanel, setShowConversationPanel,
    toolsLoading, setToolsLoading,
    highlightPath, setHighlightPath,
    followActive, setFollowActive,
    showRawDataViewer, setShowRawDataViewer,
    showToolsHub, setShowToolsHub,
    showAIChat, setShowAIChat,
    aiSessionId, setAISessionId,

    // Modals
    decisionPrompt, setDecisionPrompt,
    inputPrompt, setInputPrompt,
    inputValue, setInputValue,
    showAddNode, setShowAddNode,
    showImportDialog, setShowImportDialog,
    showUnifiedManager, setShowUnifiedManager,
    selectedNodeForSettings, setSelectedNodeForSettings,
    showChildrenEditor, setShowChildrenEditor,
    
    // Edit Mode
    editMode, setEditMode,
    nodeDraft, setNodeDraft,
    edgeEdit, setEdgeEdit,
    paletteOpen, setPaletteOpen,
    paletteTab, setPaletteTab,
    planned, setPlanned,
    
    // Replay
    executionTrace, setExecutionTrace,
    replayMode, setReplayMode,
    replayIndex, setReplayIndex,
    stateExecutionData, setStateExecutionData,
    
    // Tools
    availableTools, setAvailableTools,
    toolDetails, setToolDetails,
    selectedTools, setSelectedTools,
    toolSearch, setToolSearch,
    toolPrefs, setToolPrefs,
    
    // Parallel
    childrenOverrides, setChildrenOverrides,
    collapsedGroups, setCollapsedGroups,
    parallelTooltip, setParallelTooltip,
    
    // Refs
    reactFlowWrapper,
    pendingLayoutRef,
    pendingFocusIdRef,
    focusAttemptsRef,
    followActiveRef,
    preventRerender,
    layoutCache,
    updateTimer,
    lastLayoutedAgentIds,
    
    // React Flow hooks
    fitView, setCenter, getViewport, project, zoomIn, zoomOut,
    
    // Theme
    isDarkMode,
    
    // WebSocket
    connectWebSocket,
    disconnectWebSocket,
    wsRef,
    agentSequences,
    frameHandlersRef,
    frameHandlerContext,
    
    // Utility functions
    softReset,
    resetView,
  };
};