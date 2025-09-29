import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlowProvider,
  BackgroundVariant,
  NodeTypes,
  EdgeTypes,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './FlowSwarmInterface.css';

// Components
import AgentNode from './nodes/AgentNode';
import AnimatedEdge from './nodes/AnimatedEdge';
import InteractiveEdge from './components/InteractiveEdge';
import ImprovedChatbotOutput from './components/ImprovedChatbotOutput';
import ImprovedStateDataViewer from './components/ImprovedStateDataViewer';
import BlockSettingsPanel from './components/BlockSettingsPanel';
import UnifiedBlockManager, { BlockConfig } from './components/UnifiedBlockManager';
import { WorkflowToolbar } from './components/WorkflowToolbar';
import ProfessionalAgentNode from './components/ProfessionalAgentNode';
import { ProfessionalWorkflowBlock } from './components/ProfessionalWorkflowBlock';
import { EnhancedAgentNode } from './components/EnhancedAgentNode';
import { ImprovedEnhancedToolBlock } from './components/ImprovedEnhancedToolBlock';
import OptimizedSmoothEdge from './components/OptimizedSmoothEdge';

// Services & Hooks
import { useTheme } from '../../contexts/ThemeContext';
import { useFlowState } from './hooks/useFlowState';
import { StateMachineService } from './services/StateMachineService';
import { ExecutionManager } from './services/ExecutionManager';

// Types
import { Agent } from '../../types/agent';
import { Frame, WorkflowTemplate } from './types/FlowTypes';

const nodeTypes: NodeTypes = {
  agent: AgentNode,
  professional: ProfessionalWorkflowBlock,
  enhanced: EnhancedAgentNode,
  tool: ImprovedEnhancedToolBlock,
};

const edgeTypes: EdgeTypes = {
  animated: InteractiveEdge,
  smoothstep: OptimizedSmoothEdge,
  interactiveEdge: InteractiveEdge,
};

const FlowSwarmInterface: React.FC = () => {
  const { isDark: isDarkMode } = useTheme();
  const { fitView, setCenter, getZoom } = useReactFlow();
  const [task, setTask] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [showUnifiedManager, setShowUnifiedManager] = useState(false);
  const [outputPanelWidth, setOutputPanelWidth] = useState(() => {
    const saved = localStorage.getItem('chatbot_panel_width');
    return saved ? parseInt(saved, 10) : 480;
  });
  const [showRawDataViewer, setShowRawDataViewer] = useState(false);
  const [agents, setAgents] = useState<Map<string, Agent>>(new Map());
  const [stateExecutionData, setStateExecutionData] = useState<any[]>([]);
  const [activelyStreamingAgents, setActivelyStreamingAgents] = useState<Set<string>>(new Set());
  const [hasStateMachineStructure, setHasStateMachineStructure] = useState(false);
  const [planned, setPlanned] = useState(false);

  // Additional UI controls
  const [showGrid, setShowGrid] = useState(true);
  const [showMinimap, setShowMinimap] = useState(false);
  const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>('LR');
  const [replayMode, setReplayMode] = useState(false);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [executionTrace, setExecutionTrace] = useState<string[]>([]);
  const [followActive, setFollowActive] = useState(true);
  const [highlightPath, setHighlightPath] = useState(false);
  const [executionMode, setExecutionMode] = useState<'dynamic' | 'neural' | 'parallel' | 'sequential'>('dynamic');
  const [showToolsHub, setShowToolsHub] = useState(false);
  const [decisionPrompt, setDecisionPrompt] = useState<null | {
    stateId: string;
    name: string;
    description?: string;
    allowed: string[];
  }>(null);

  // WebSocket and Services
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const agentSequences = useRef<Map<string, number>>(new Map());
  const stateMachine = useRef(new StateMachineService());
  const executionManager = useRef<ExecutionManager | null>(null);

  // Focus tracking
  const pendingFocusIdRef = useRef<string | null>(null);
  const focusAttemptsRef = useRef(0);

  // Flow state
  const {
    nodes, setNodes, onNodesChange,
    edges, setEdges, onEdgesChange,
    selectedAgent, setSelectedAgent,
    selectedNodeForSettings, setSelectedNodeForSettings,
    onConnect, addNode, updateNodeData, updateEdgeData,
    clearFlow, softReset, handleEdgePathHighlight,
  } = useFlowState(isDarkMode);

  // Create a stable callback ref for human decision
  const handleHumanDecision = useCallback((state: any, allowedEvents: string[]) => {
    console.log('Frontend: Human decision required for:', state, allowedEvents);

    // Always show the decision modal when this callback is triggered
    const stateId = typeof state === 'string' ? state : state.id;
    const stateName = typeof state === 'string' ? state : state.name;
    const stateDesc = typeof state === 'object' ? state.description : '';

    const promptData = {
      stateId: stateId,
      name: stateName || stateId,
      description: stateDesc,
      allowed: allowedEvents
    };
    console.log('Setting decision prompt:', promptData);
    setDecisionPrompt(promptData);

    // Focus on the node requiring decision
    setSelectedAgent(stateId);
  }, []);

  // Debug decision prompt state changes
  useEffect(() => {
    console.log('Decision prompt state changed to:', decisionPrompt);
  }, [decisionPrompt]);

  // WebSocket handlers
  const handleFrame = useCallback((frame: Frame) => {
    if (frame.frame_type === 'token') {
      handleTokenFrame(frame as any);
    } else if (frame.frame_type === 'control') {
      handleControlFrame(frame as any);
    }
  }, []);

  const handleTokenFrame = useCallback((frame: any) => {
    const { agent_id, seq, text, final } = frame;

    const lastSeq = agentSequences.current.get(agent_id) || 0;
    if (seq === lastSeq) return;
    if (seq < lastSeq && !final) return;

    agentSequences.current.set(agent_id, seq);

    // Track streaming agents
    if (!final) {
      setActivelyStreamingAgents(prev => new Set(prev).add(agent_id));
    } else {
      setActivelyStreamingAgents(prev => {
        const updated = new Set(prev);
        updated.delete(agent_id);
        return updated;
      });
    }

    setAgents(prev => {
      const updated = new Map(prev);
      let agent = updated.get(agent_id);

      if (!agent) {
        agent = {
          id: agent_id,
          name: agent_id,
          status: 'running',
          output: '',
          messages: []
        };
      }

      updated.set(agent_id, {
        ...agent,
        output: final ? agent.output + text : agent.output + text,
        status: final ? (agent.status === 'running' ? 'completed' : agent.status) : 'running'
      });

      return updated;
    });

    // Update node data as well
    updateNodeData(agent_id, {
      status: final ? 'completed' : 'running',
      output: final ? 'Completed' : 'Processing...'
    });
  }, [updateNodeData]);

  const handleControlFrame = useCallback((frame: any) => {
    executionManager.current?.handleControlFrame(frame);
  }, []);

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
  }, [handleFrame, isRunning]);

  // Initialize execution manager with current callback
  useEffect(() => {
      executionManager.current = new ExecutionManager({
      onAgentUpdate: (id, agent) => {
        setAgents(prev => new Map(prev).set(id, agent));

        // Auto-focus on active node if following
        if (agent.status === 'running' && followActive) {
          pendingFocusIdRef.current = id;
          focusAttemptsRef.current = 0;
        }
      },
      onNodeUpdate: (id, updates) => {
        updateNodeData(id, updates);

        // Highlight active node and animate edges
        if (updates.status === 'running') {
          // Update node states for visual feedback
          setNodes(nds => nds.map(node => ({
            ...node,
            data: {
              ...node.data,
              status: node.id === id ? 'running' : node.data.status,
              isActive: node.id === id,
              dimmed: node.id !== id && highlightPath
            }
          })));

          // Update edges to show flow with animation
          setEdges(eds => eds.map(edge => ({
            ...edge,
            animated: edge.source === id,
            data: {
              ...edge.data,
              isActive: edge.source === id,
              status: edge.source === id ? 'running' : edge.data?.status
            }
          })));
        } else if (updates.status === 'completed' || updates.status === 'failed') {
          // Update node with final status
          setNodes(nds => nds.map(node => ({
            ...node,
            data: {
              ...node.data,
              status: node.id === id ? updates.status : node.data.status,
              isActive: false
            }
          })));

          // Stop edge animations
          setEdges(eds => eds.map(edge => ({
            ...edge,
            animated: false,
            data: {
              ...edge.data,
              isActive: false
            }
          })));
        }
      },
      onEdgeUpdate: (id, updates) => updateEdgeData(id, updates),
      onStateChange: (state) => {
        console.log('State:', state);
        setExecutionTrace(prev => [...prev, state]);
      },
      onError: (error) => console.error('Error:', error),
      onComplete: () => {
        setIsRunning(false);
        setConnectionStatus('disconnected');

        // Clear active highlights and reset all animations
        setNodes(nds => nds.map(node => ({
          ...node,
          data: {
            ...node.data,
            isActive: false,
            dimmed: false,
            status: node.data.status === 'running' ? 'completed' : node.data.status
          }
        })));
        setEdges(eds => eds.map(edge => ({
          ...edge,
          animated: false,
          data: { ...edge.data, isActive: false, status: 'idle' }
        })));
      },
      onHumanDecisionRequired: handleHumanDecision
    });
  }, [handleHumanDecision, followActive, highlightPath, updateNodeData, updateEdgeData, connectWebSocket]);

  // Import state machine
  const importStateMachine = useCallback(async (machine: any) => {
    await stateMachine.current.importStateMachine(
      machine,
      true,
      (newNodes, newEdges) => {
        setNodes(newNodes);
        setEdges(newEdges);
      },
      isDarkMode,
      layoutDirection
    );
  }, [isDarkMode, layoutDirection, setNodes, setEdges]);

  // Start execution
  const startExecution = useCallback(async () => {
    if (!task.trim() || isRunning) return;

    setIsRunning(true);
    // Clear sequences and streaming state
    agentSequences.current.clear();
    setActivelyStreamingAgents(new Set());
    executionManager.current?.reset();
    softReset();

    // If there are no nodes and execution mode is dynamic, first plan the workflow
    if (nodes.length === 0 && executionMode === 'dynamic') {
      try {
        // Step 1: Plan the workflow
        const planData = await stateMachine.current.planWorkflow(task, selectedTools);

        if (!planData) {
          console.warn('Plan response did not include a machine definition.');
          setIsRunning(false);
          return;
        }

        // Import the generated workflow
        await importStateMachine(planData);

        // Wait a bit for the UI to update
        await new Promise(resolve => setTimeout(resolve, 500));

        // Keep UI interactive after planning
        setIsRunning(false);
        setConnectionStatus('disconnected');
        setExecutionId(null);
        return;
      } catch (error) {
        console.error('Workflow planning failed:', error);
        setIsRunning(false);
        setConnectionStatus('error');
        return;
      }
    }

    // If nodes exist, execute with existing machine
    const machine = stateMachine.current.buildMachineFromGraph(nodes, edges);

    // Execute workflow
    const result = await stateMachine.current.executeWorkflow(task, machine, selectedTools);

    if (result) {
      setExecutionId(result.exec_id);
      setTimeout(() => connectWebSocket(result.exec_id, false), 100);
    } else {
      setIsRunning(false);
    }
  }, [task, isRunning, nodes, edges, selectedTools, executionMode, importStateMachine, softReset]);

  // Stop execution
  const stopExecution = useCallback(() => {
    setIsRunning(false);
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus('disconnected');
  }, []);

  // Add unified block
  const addUnifiedBlock = useCallback((blockConfig: BlockConfig, position?: { x: number; y: number }) => {
    const node = addNode(blockConfig.subType || 'analysis', position);
    updateNodeData(node.id, {
      ...blockConfig,
      tools: blockConfig.tools || [],
      toolsPlanned: blockConfig.tools || [],
    });
  }, [addNode, updateNodeData]);

  // Handle agent selection
  const handleAgentSelect = useCallback((agentId: string | null) => {
    setSelectedAgent(agentId);
    if (agentId) {
      const node = nodes.find(n => n.id === agentId);
      if (node && selectedNodeForSettings?.id !== agentId) {
        setSelectedNodeForSettings(node);
      }
    }
  }, [nodes, selectedNodeForSettings]);

  // Handle node focus
  const handleNodeFocus = useCallback((agentId: string) => {
    const node = nodes.find(n => n.id === agentId);
    if (node) {
      // Focus logic here if needed
    }
  }, [nodes]);

  // Stable agents reference for ChatbotOutput
  const stableAgents = useMemo(() => agents, [agents]);

  // Update graph layout
  const updateGraph = useCallback((forceLayout: boolean = false) => {
    // This would normally do auto-layout, but for now just trigger a re-render
    if (forceLayout) {
      // Could add dagre or other layout algorithm here
      setNodes(nodes => [...nodes]);
    }
  }, [setNodes]);

  // Clear path highlighting
  const clearPathHighlight = useCallback(() => {
    setHighlightPath(false);
    setNodes(nds => nds.map(node => ({
      ...node,
      data: { ...node.data, dimmed: false }
    })));
    setEdges(eds => eds.map(edge => ({
      ...edge,
      data: { ...edge.data, dimmed: false }
    })));
  }, [setNodes, setEdges]);

  // Keyboard shortcuts
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

  // Auto-focus on active nodes during execution
  useEffect(() => {
    if (!pendingFocusIdRef.current || !followActive) return;

    const focusInterval = setInterval(() => {
      const id = pendingFocusIdRef.current;
      if (!id) return;

      const node = nodes.find(n => n.id === id);
      if (node) {
        const zoom = getZoom();
        setCenter(
          node.position.x + 130, // Half of node width (260/2)
          node.position.y + 60,  // Half of node height (120/2)
          { zoom, duration: 500 }
        );
        pendingFocusIdRef.current = null;
      } else if (focusAttemptsRef.current++ > 10) {
        pendingFocusIdRef.current = null;
        focusAttemptsRef.current = 0;
      }
    }, 100);

    return () => clearInterval(focusInterval);
  }, [nodes, followActive, setCenter, getZoom]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      // Clear all state
      agentSequences.current.clear();
      setActivelyStreamingAgents(new Set());
    };
  }, []);

  return (
    <div className={`flow-swarm-container ${isDarkMode ? 'dark-mode' : 'light-mode'}`}>
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
        {/* Unified Block Manager */}
        <UnifiedBlockManager
        isOpen={showUnifiedManager}
        onClose={() => setShowUnifiedManager(false)}
        onAddBlock={addUnifiedBlock}
        isDarkMode={isDarkMode}
        selectedTools={selectedTools}
        onToolsChange={setSelectedTools}
      />

      {/* Main Flow Canvas */}
      <div className="flow-graph-panel" style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => handleAgentSelect(node.id)}
          onEdgeClick={(_, edge) => handleEdgePathHighlight(edge.id, edge.source, edge.target)}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{
            type: 'animated',
            animated: false,
            style: { strokeWidth: 2 }
          }}
          defaultViewport={{ x: 0, y: 0, zoom: 0.75 }}
          minZoom={0.2}
          maxZoom={1.5}
          panOnScroll={true}
          panOnDrag={true}
          zoomOnScroll={true}
          zoomOnDoubleClick={true}
          nodesDraggable={true}
          nodesConnectable={true}
          elementsSelectable={true}
          fitView
          fitViewOptions={{
            padding: 0.3,
            maxZoom: 1.0,
            minZoom: 0.2
          }}
          snapToGrid={true}
          snapGrid={[15, 15]}
        >
          <Background
            variant={showGrid ? BackgroundVariant.Lines : BackgroundVariant.Dots}
            gap={showGrid ? 16 : 24}
            size={showGrid ? 1.25 : 1.5}
            color={isDarkMode ? '#334155' : '#e5e7eb'}
          />
          <Controls />
          {showMinimap && <MiniMap style={{ background: isDarkMode ? '#0b1220' : '#f8fafc' }} />}

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

              <button onClick={() => clearFlow()} className="panel-button">
                Clear
              </button>

              <button onClick={() => setShowUnifiedManager(true)} className="panel-button">
                📦 Block Manager
              </button>

              <button onClick={() => setShowToolsHub(true)} className="panel-button">
                Tools
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

              {replayMode && (
                <>
                  <button
                    className="panel-button"
                    onClick={() => {
                      if (executionTrace.length === 0) return;
                      setReplayIndex((i: number | null) => {
                        const next = Math.max(0, (i ?? 0) - 1);
                        const id = executionTrace[next];
                        if (id) setSelectedAgent(id);
                        return next;
                      });
                    }}
                    title="Previous (←)"
                  >
                    Prev
                  </button>
                  <button
                    className="panel-button"
                    onClick={() => {
                      if (executionTrace.length === 0) return;
                      setReplayIndex((i: number | null) => {
                        const next = Math.min(executionTrace.length - 1, (i ?? 0) + 1);
                        const id = executionTrace[next];
                        if (id) setSelectedAgent(id);
                        return next;
                      });
                    }}
                    title="Next (→)"
                  >
                    Next
                  </button>
                </>
              )}

              <button
                className={`panel-button ${highlightPath ? 'active' : ''}`}
                onClick={() => setHighlightPath(!highlightPath)}
                title="Highlight Active Path"
              >
                Path: {highlightPath ? 'On' : 'Off'}
              </button>
            </div>
          </Panel>

          <WorkflowToolbar
            onAddBlock={(type) => addNode(type)}
            onArrangeBlocks={() => updateGraph(true)}
            selectedNodes={nodes.filter(n => n.selected)}
            onImportTemplate={(template) => importStateMachine(template.machine)}
          />
        </ReactFlow>
      </div>

      {/* Resizable Divider */}
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
              Math.min(800, window.innerWidth - 500) // Maximum width: 800px
            );
            setOutputPanelWidth(newWidth);
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
          bottom: '70px',
          width: '6px',
          cursor: 'col-resize',
          zIndex: 50,
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

      {/* Output Panel */}
      <div className="flow-output-panel" style={{ width: `${outputPanelWidth}px` }}>
        <ImprovedChatbotOutput
          agents={stableAgents}
          nodes={nodes}
          selectedAgent={selectedAgent}
          onAgentSelect={handleAgentSelect}
          onNodeFocus={handleNodeFocus}
          isDarkMode={isDarkMode}
        />

        {showRawDataViewer && executionId && (
          <ImprovedStateDataViewer
            execId={executionId}
            isDarkMode={isDarkMode}
            onClose={() => setShowRawDataViewer(false)}
            nodes={nodes}
            edges={edges}
          />
        )}
      </div>

      {/* Block Settings Panel */}
      {selectedNodeForSettings && (
        <BlockSettingsPanel
          node={selectedNodeForSettings}
          onClose={() => setSelectedNodeForSettings(null)}
          onUpdate={(nodeId, data) => updateNodeData(nodeId, data)}
          onDelete={(nodeId) => {
            setNodes(nds => nds.filter(n => n.id !== nodeId));
            setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
            setSelectedNodeForSettings(null);
          }}
          onDuplicate={(nodeId) => {
            const node = nodes.find(n => n.id === nodeId);
            if (node) {
              addNode(node.data.nodeType, {
                x: node.position.x + 50,
                y: node.position.y + 50
              });
            }
          }}
          isDarkMode={isDarkMode}
        />
      )}
      </div> {/* End of flow-content */}

      {/* Command Bar - At bottom */}
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
          {isRunning ? '⏹ Stop' : nodes.length === 0 && executionMode === 'dynamic' ? '📋 Plan' : '▶ Execute'}
        </button>
      </div>

      {/* Human Decision Modal */}
      {decisionPrompt && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            background: isDarkMode ? '#0f172a' : '#ffffff',
            color: isDarkMode ? '#e2e8f0' : '#1e293b',
            padding: 20,
            borderRadius: 8,
            width: 420,
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Choose next event</h3>
            <div style={{ fontWeight: 600 }}>{decisionPrompt.name}</div>
            {decisionPrompt.description && (
              <div style={{ fontSize: 13, color: isDarkMode ? '#94a3b8' : '#64748b', marginTop: 6 }}>
                {decisionPrompt.description}
              </div>
            )}
            <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {decisionPrompt.allowed.map(ev => (
                <button
                  key={ev}
                  className="panel-button"
                  onClick={async () => {
                    try {
                      await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/decision/${executionId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          state_id: decisionPrompt.stateId,
                          event: ev
                        })
                      });
                      setDecisionPrompt(null);
                    } catch (e) {
                      console.error('Failed to submit decision', e);
                    }
                  }}
                >
                  {ev}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <button
                className="panel-button"
                onClick={() => setDecisionPrompt(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const FlowSwarmInterfaceWrapper: React.FC = () => {
  return (
    <ReactFlowProvider>
      <FlowSwarmInterface />
    </ReactFlowProvider>
  );
};

export default FlowSwarmInterfaceWrapper;