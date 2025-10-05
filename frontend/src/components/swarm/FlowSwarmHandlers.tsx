import { useCallback, useMemo } from 'react';
import { Node, Edge, Connection, MarkerType, Position, NodeTypes, EdgeTypes, useUpdateNodeInternals } from 'reactflow';
import { v4 as uuidv4 } from 'uuid';
import { ToolSchema } from '../../services/toolSchemaService';
import { unifiedToolService } from '../../services/unifiedToolService';
import { stateMachineAdapter } from '../../services/stateMachineAdapter';
import { resolveUserInputsInParams } from '../../utils/parameterResolver';
import { buildMachineFromGraph, rerunFromSelected as rerunFromSelectedUtil } from './utils/executionUtils';
import { getLayoutedElements } from './utils/layoutUtils';
import { BlockConfig } from './components/UnifiedBlockManager';
import AgentNode from './components/nodes/AgentNode';
import { EnhancedAgentNode } from './components/EnhancedAgentNode';
import { ProfessionalWorkflowBlock } from './components/ProfessionalWorkflowBlock';
import { ImprovedEnhancedToolBlock } from './components/ImprovedEnhancedToolBlock';
import EnhancedEditableEdge from './components/EnhancedEditableEdge';
import { BlockStatus } from '../../types/workflow';

// Agent interface
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

export const useFlowSwarmHandlers = (state: any) => {
  const {
    nodes, setNodes, onNodesChange,
    edges, setEdges, onEdgesChange,
    agents, setAgents,
    selectedAgent, setSelectedAgent,
    history, setHistory,
    historyIndex, setHistoryIndex,
    maxHistorySize,
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
    decisionPrompt, setDecisionPrompt,
    inputPrompt, setInputPrompt,
    inputValue, setInputValue,
    showAddNode, setShowAddNode,
    showImportDialog, setShowImportDialog,
    showUnifiedManager, setShowUnifiedManager,
    selectedNodeForSettings, setSelectedNodeForSettings,
    showChildrenEditor, setShowChildrenEditor,
    editMode, setEditMode,
    nodeDraft, setNodeDraft,
    edgeEdit, setEdgeEdit,
    paletteOpen, setPaletteOpen,
    paletteTab, setPaletteTab,
    planned, setPlanned,
    executionTrace, setExecutionTrace,
    replayMode, setReplayMode,
    replayIndex, setReplayIndex,
    stateExecutionData, setStateExecutionData,
    availableTools, setAvailableTools,
    toolDetails, setToolDetails,
    selectedTools, setSelectedTools,
    toolSearch, setToolSearch,
    toolPrefs, setToolPrefs,
    childrenOverrides, setChildrenOverrides,
    collapsedGroups, setCollapsedGroups,
    parallelTooltip, setParallelTooltip,
    reactFlowWrapper,
    pendingLayoutRef,
    pendingFocusIdRef,
    focusAttemptsRef,
    followActiveRef,
    preventRerender,
    layoutCache,
    updateTimer,
    lastLayoutedAgentIds,
    fitView, setCenter, getViewport, project, zoomIn, zoomOut,
    isDarkMode,
    connectWebSocket,
    disconnectWebSocket,
    wsRef,
    agentSequences,
    frameHandlersRef,
    frameHandlerContext
  } = state;

  const updateNodeInternals = useUpdateNodeInternals();

  // Node and Edge types
  const nodeTypes = useMemo<NodeTypes>(() => ({
    agent: AgentNode,
    enhanced: EnhancedAgentNode,
    professional: ProfessionalWorkflowBlock,
    tool: ImprovedEnhancedToolBlock,
    toolBlock: ImprovedEnhancedToolBlock
  }), []);

  const edgeTypes = useMemo<EdgeTypes>(() => ({
    animated: EnhancedEditableEdge,
    smoothstep: EnhancedEditableEdge,
    default: EnhancedEditableEdge,
    straight: EnhancedEditableEdge,
    interactive: EnhancedEditableEdge,
    editable: EnhancedEditableEdge,
  }), []);

  // Undo/Redo Functions
  const saveToHistory = useCallback((newNodes: Node[], newEdges: Edge[]) => {
    if (historyIndex !== history.length - 1) {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push({ nodes: newNodes, edges: newEdges });
      if (newHistory.length > maxHistorySize) {
        newHistory.shift();
      }
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    } else {
      const newHistory = [...history, { nodes: newNodes, edges: newEdges }];
      if (newHistory.length > maxHistorySize) {
        newHistory.shift();
      } else {
        setHistoryIndex(historyIndex + 1);
      }
      setHistory(newHistory);
    }
  }, [history, historyIndex, maxHistorySize, setHistory, setHistoryIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const previousState = history[historyIndex - 1];
      setNodes(previousState.nodes);
      setEdges(previousState.edges);
      setHistoryIndex(historyIndex - 1);
    }
  }, [history, historyIndex, setNodes, setEdges, setHistoryIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setNodes(nextState.nodes);
      setEdges(nextState.edges);
      setHistoryIndex(historyIndex + 1);
    }
  }, [history, historyIndex, setNodes, setEdges, setHistoryIndex]);

  // Soft reset - preserve structure but reset execution state
  const softReset = useCallback(() => {
    setAgents(new Map());
    setSelectedAgent(null);
    setActivelyStreamingAgents(new Set());
    setNodes((nodes: Node[]) =>
      nodes.map((node: Node) => ({
        ...node,
        data: {
          ...node.data,
          status: 'pending',
          toolsUsed: []
        }
      }))
    );
    setEdges((edges: Edge[]) =>
      edges.map((edge: Edge) => ({
        ...edge,
        animated: false,
        style: {
          ...edge.style,
          stroke: '#52525b'
        }
      }))
    );
  }, [setAgents, setSelectedAgent, setActivelyStreamingAgents, setNodes, setEdges]);

  // Clear execution history
  const clearExecutionHistory = useCallback(() => {
    setExecutionHistory(new Map());
    setExecutionOrderCounter(0);
    setExecutionActions(new Map());

    setNodes((nodes: Node[]) => nodes.map((node: Node) => ({
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

    setEdges((edges: Edge[]) => edges.map((edge: Edge) => ({
      ...edge,
      animated: false,
      className: '',
      style: {
        ...edge.style,
        stroke: '#52525b',
        strokeWidth: 2,
      }
    })));
  }, [setExecutionHistory, setExecutionOrderCounter, setExecutionActions, setNodes, setEdges]);

  // Reset view - complete reset
  const resetView = useCallback(() => {
    setAgents(new Map());
    setNodes([]);
    setEdges([]);
    setSelectedAgent(null);
    layoutCache.current = { nodes: [], edges: [] };
    lastLayoutedAgentIds.current.clear();
    setActivelyStreamingAgents(new Set());
    setHasStateMachineStructure(false);
    setPlanned(false);
  }, [setAgents, setNodes, setEdges, setSelectedAgent, layoutCache, lastLayoutedAgentIds, setActivelyStreamingAgents, setHasStateMachineStructure, setPlanned]);

  // Graph Update
  const updateGraph = useCallback((forceLayout: boolean = false) => {
    if (agents.size === 0) {
      return;
    }

    if (hasStateMachineStructure) {
      setNodes((prevNodes: Node[]) => prevNodes.map((node: Node) => {
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

      setEdges((prevEdges: Edge[]) => prevEdges.map((edge: Edge) => {
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

    const currentAgentIds = new Set(agents.keys());
    const needsLayout = forceLayout || Array.from(currentAgentIds).some(id => !lastLayoutedAgentIds.current.has(id));

    if (isInteracting) {
      if (needsLayout) pendingLayoutRef.current = true;
      return;
    }

    if (needsLayout) {
      const agentsArray = Array.from<Agent>(agents.values());
      const newNodes: Node[] = agentsArray.map((agent) => ({
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
        position: { x: 0, y: 0 },
        targetPosition: layoutDirection === 'LR' ? Position.Left : Position.Top,
        sourcePosition: layoutDirection === 'LR' ? Position.Right : Position.Bottom,
      }));

      const newEdges: Edge[] = [];
      agents.forEach((agent: Agent) => {
        if (agent.parent && agents.has(agent.parent)) {
          const parentAgent = agents.get(agent.parent) as Agent;
          newEdges.push({
            id: `${agent.parent}-${agent.id}`,
            source: agent.parent,
            target: agent.id,
            type: 'editable',
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

      const layouted = getLayoutedElements(newNodes, newEdges, layoutDirection);

      layoutCache.current = layouted;
      lastLayoutedAgentIds.current = currentAgentIds;

      setNodes(layouted.nodes);
      setEdges(layouted.edges);

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
      const updatedNodes = layoutCache.current.nodes.map((node: Node) => {
        const agent = agents.get(node.id);
        if (!agent) return node;
        const nextDuration = agent.endTime && agent.startTime ? agent.endTime - agent.startTime : undefined;
        if (node.data?.status === agent.status && (node.data as any)?.duration === nextDuration) {
          return node;
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

      const updatedEdges = layoutCache.current.edges.map((edge: Edge) => {
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
  }, [agents, setNodes, setEdges, fitView, layoutDirection, isInteracting, hasStateMachineStructure, isDarkMode, lastLayoutedAgentIds, layoutCache, pendingLayoutRef, preventRerender]);

  // Build machine from current graph
  const buildMachine = useCallback(() => {
    return buildMachineFromGraph(nodes, edges);
  }, [nodes, edges]);

  // Add tool block
  const addToolBlock = useCallback(async (toolName: string, schema?: ToolSchema, position?: { x: number; y: number }) => {
    const toolSchema = schema || await unifiedToolService.getToolSchema(toolName);

    if (!toolSchema) {
      console.warn(`Tool schema not found for ${toolName}`);
      return;
    }

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
        onUpdate: (id: string, updates: any) => {
          setNodes((nds: Node[]) =>
            nds.map((node: Node) =>
              node.id === id
                ? { ...node, data: { ...node.data, ...updates } }
                : node
            )
          );
        },
        onToggleEnabled: (id: string) => {
          setNodes((nds: Node[]) =>
            nds.map((node: Node) =>
              node.id === id
                ? { ...node, data: { ...node.data, enabled: !node.data.enabled } }
                : node
            )
          );
        },
        onToggleAdvanced: (id: string) => {
          setNodes((nds: Node[]) =>
            nds.map((node: Node) =>
              node.id === id
                ? { ...node, data: { ...node.data, advancedMode: !node.data.advancedMode } }
                : node
            )
          );
        },
        onToggleWide: (id: string) => {
          setNodes((nds: Node[]) =>
            nds.map((node: Node) =>
              node.id === id
                ? { ...node, data: { ...node.data, isWide: !node.data.isWide } }
                : node
            )
          );
        },
        onOpenSettings: (id: string) => {
          const node = nodes.find((n: Node) => n.id === id);
          if (node) {
            setSelectedNodeForSettings(node);
          }
        },
        onDelete: (id: string) => {
          setNodes((nds: Node[]) => nds.filter((node: Node) => node.id !== id));
          setEdges((eds: Edge[]) => eds.filter((edge: Edge) => edge.source !== id && edge.target !== id));
        },
        onDuplicate: (id: string) => {
          const nodeToDuplicate = nodes.find((node: Node) => node.id === id);
          if (nodeToDuplicate) {
            const duplicatedNode = {
              ...nodeToDuplicate,
              id: uuidv4(),
              position: {
                x: nodeToDuplicate.position.x + 50,
                y: nodeToDuplicate.position.y + 50
              }
            };
            setNodes((nds: Node[]) => [...nds, duplicatedNode]);
          }
        },
        onExecuteTool: async (id: string, toolName: string, parameters: any) => {
          try {
            const { ok, params: resolvedParams, error: resolveError } = await resolveUserInputsInParams(parameters);
            if (!ok || !resolvedParams) {
              setNodes((nds: Node[]) => nds.map((n: Node) => n.id === id ? { ...n, data: { ...n.data, status: 'needs_input', executionError: resolveError || 'Input required' } } : n));
              throw new Error(resolveError || 'Input required');
            }

            setNodes((nds: Node[]) => nds.map((n: Node) => n.id === id ? { ...n, data: { ...n.data, parameters: resolvedParams } } : n));

            const precheck = await stateMachineAdapter.validateParameters(toolName, resolvedParams);
            if (!precheck.valid) {
              setNodes((nds: Node[]) =>
                nds.map((node: Node) =>
                  node.id === id
                    ? { ...node, data: { ...node.data, status: 'needs_input', executionError: precheck.message } }
                    : node
                )
              );
              throw new Error(precheck.message || 'Missing required parameters');
            }

            setNodes((nds: Node[]) =>
              nds.map((node: Node) =>
                node.id === id
                  ? { ...node, data: { ...node.data, status: 'running', isExecuting: true } }
                  : node
              )
            );

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
              const blockResult = data.results?.[id] || data.result;

              setNodes((nds: Node[]) =>
                nds.map((node: Node) =>
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

              try {
                const outgoingTargets = edges.filter((e: Edge) => e.source === id).map((e: Edge) => e.target);
                setNodes((nds: Node[]) => nds.map((node: Node) => {
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

              return data.result;
            } else {
              const errorMessage = data.error || data.detail || 'Execution failed';

              setNodes((nds: Node[]) =>
                nds.map((node: Node) =>
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

            setNodes((nds: Node[]) =>
              nds.map((node: Node) =>
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

    setNodes((nds: Node[]) => [...nds, newNode]);
  }, [nodes, setNodes, setEdges, edges, setSelectedNodeForSettings]);

  // Unified block addition handler
  const addUnifiedBlock = useCallback((blockConfig: BlockConfig, position?: { x: number; y: number }) => {
    const nodePosition = position || {
      x: Math.random() * 400 + 200,
      y: Math.random() * 300 + 100
    };

    if (blockConfig.type === 'tool' && blockConfig.toolSchema) {
      addToolBlock(blockConfig.toolName!, blockConfig.toolSchema, nodePosition);
    } else {
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
          tools: toolsList,
          toolsPlanned: toolsList,
          transitions: {},
          enabled: true,
          advancedMode: false,
          isWide: false,
          isDarkMode,
          nodeType: blockConfig.subType as any,
          icon: blockConfig.icon,
          color: blockConfig.color,
          category: blockConfig.category,
          isStart: blockConfig.name?.toLowerCase() === 'start'
        }
      };
      setNodes((nds: Node[]) => {
        if ((newNode.data as any).isStart) {
          return nds.map((n: Node) => ({ ...n, data: { ...n.data, isStart: false } })).concat(newNode);
        }
        return [...nds, newNode];
      });
    }
  }, [nodes.length, setNodes, isDarkMode, addToolBlock]);

  // Legacy wrapper for professional blocks
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
          setNodes((nds: Node[]) =>
            nds.map((node: Node) =>
              node.id === id
                ? { ...node, data: { ...node.data, enabled: !node.data.enabled } }
                : node
            )
          );
        },
        onToggleAdvanced: (id: string) => {
          setNodes((nds: Node[]) =>
            nds.map((node: Node) =>
              node.id === id
                ? { ...node, data: { ...node.data, advancedMode: !node.data.advancedMode } }
                : node
            )
          );
        },
        onToggleWide: (id: string) => {
          setNodes((nds: Node[]) =>
            nds.map((node: Node) =>
              node.id === id
                ? { ...node, data: { ...node.data, isWide: !node.data.isWide } }
                : node
            )
          );
        },
        onOpenSettings: (id: string) => {
          const node = nodes.find((n: Node) => n.id === id);
          if (node) {
            setSelectedNodeForSettings(node);
          }
        },
        onDelete: (id: string) => {
          setNodes((nds: Node[]) => nds.filter((node: Node) => node.id !== id));
          setEdges((eds: Edge[]) => eds.filter((edge: Edge) => edge.source !== id && edge.target !== id));
        },
        onDuplicate: (id: string) => {
          const nodeToDuplicate = nodes.find((n: Node) => n.id === id);
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
            setNodes((nds: Node[]) => [...nds, duplicatedNode]);
          }
        }
      }
    };

    setNodes((nds: Node[]) => [...nds, newNode]);

    if (nodes.length > 0) {
      const lastNode = nodes[nodes.length - 1];
      const newEdge: Edge = {
        id: uuidv4(),
        source: lastNode.id,
        target: newNode.id,
        type: 'animated',
        animated: true
      };
      setEdges((eds: Edge[]) => [...eds, newEdge]);
    }

    return newNode.id;
  }, [nodes, setNodes, setEdges, selectedTools, availableTools, setSelectedNodeForSettings]);

  // Stop execution
  const stopExecution = useCallback(() => {
    setIsRunning(false);
    setActivelyStreamingAgents(new Set());
    setCurrentExecutingNode(null);
    setNextExecutingNode(null);
    setExecutionActions(new Map());
    setIsExecuting(false);

    setNodes((nodes: Node[]) => nodes.map((node: Node) => ({
      ...node,
      data: {
        ...node.data,
        status: node.data.status === 'running' ? 'failed' : node.data.status,
        isExecuting: false,
        isDimmed: false,
        currentAction: undefined,
        currentActionDetail: undefined,
        activeTools: [],
        wasExecuted: node.data.wasExecuted,
        executionOrder: node.data.executionOrder,
        executionDuration: node.data.executionDuration,
        executionDurationText: node.data.executionDurationText,
        executedTools: node.data.executedTools
      }
    })));

    disconnectWebSocket();
  }, [setIsRunning, setActivelyStreamingAgents, setCurrentExecutingNode, setNextExecutingNode, setExecutionActions, setIsExecuting, setNodes, disconnectWebSocket]);

  // Rerun from selected node
  const rerunFromSelected = useCallback(async () => {
    await rerunFromSelectedUtil(executionId, selectedAgent);
  }, [executionId, selectedAgent]);

  // Add agent and rerun
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

  // Node click handler
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    event.stopPropagation();
    preventRerender.current = true;

    setSelectedAgent((prev: string | null) => prev === node.id ? null : node.id);

    if (event.detail === 2) {
      setSelectedNodeForSettings(node);
    }

    if (highlightPath && selectedAgent !== node.id) {
      setHighlightPath(false);
    }
    setTimeout(() => { preventRerender.current = false; }, 100);
  }, [highlightPath, selectedAgent, setSelectedAgent, setSelectedNodeForSettings, preventRerender, setHighlightPath]);

  // Node context menu handler
  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedNodeForSettings(node);
  }, [setSelectedNodeForSettings]);

  // Edge path highlighting
  const handleEdgePathHighlight = useCallback((edgeId: string, sourceId: string, targetId: string) => {
    const pathNodes = new Set<string>();
    const pathEdges = new Set<string>();

    pathNodes.add(sourceId);
    pathNodes.add(targetId);
    pathEdges.add(edgeId);

    const findDownstream = (nodeId: string) => {
      const outgoingEdges = edges.filter((e: Edge) => e.source === nodeId);
      outgoingEdges.forEach((edge: Edge) => {
        if (!pathEdges.has(edge.id)) {
          pathEdges.add(edge.id);
          pathNodes.add(edge.target);
          findDownstream(edge.target);
        }
      });
    };

    const findUpstream = (nodeId: string) => {
      const incomingEdges = edges.filter((e: Edge) => e.target === nodeId);
      incomingEdges.forEach((edge: Edge) => {
        if (!pathEdges.has(edge.id)) {
          pathEdges.add(edge.id);
          pathNodes.add(edge.source);
          findUpstream(edge.source);
        }
      });
    };

    findDownstream(targetId);
    findUpstream(sourceId);

    setNodes((nds: Node[]) => nds.map((node: Node) => {
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

    setEdges((eds: Edge[]) => eds.map((edge: Edge) => {
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

    setHighlightPath(true);
  }, [edges, setNodes, setEdges, setHighlightPath]);

  // Clear path highlighting
  const clearPathHighlight = useCallback(() => {
    setNodes((nds: Node[]) => nds.map((node: Node) => ({
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

    setEdges((eds: Edge[]) => eds.map((edge: Edge) => ({
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
  }, [setNodes, setEdges, setHighlightPath]);

  // Agent selection handler
  const handleAgentSelect = useCallback((agentId: string | null) => {
    setSelectedAgent(agentId);
    if (agentId) {
      setNodes((nds: Node[]) =>
        nds.map((node: Node) => ({
          ...node,
          selected: node.id === agentId,
        }))
      );
      const node = nodes.find((n: Node) => n.id === agentId);
      if (node) {
        setCenter(node.position.x + (((node as any).width) || 280) / 2, node.position.y + (((node as any).height) || 140) / 2, { zoom: 1.0, duration: 300 });
      }
    }
  }, [setSelectedAgent, setNodes, nodes, setCenter]);

  // Node focus handler
  const handleNodeFocus = useCallback((agentId: string) => {
    const node = nodes.find((n: Node) => n.id === agentId);
    if (node) {
      setCenter(node.position.x + 110, node.position.y + 50, { zoom: 1.2, duration: 300 });
    }
  }, [nodes, setCenter]);

  // Stable agents reference
  const stableAgents = useMemo(() => {
    const agentEntries = Array.from(agents.entries()) as [string, Agent][];
    const dependencyString = agentEntries
      .map(([k, v]) => `${k}:${v.status}:${v.output?.length || 0}:${v.startTime}:${v.endTime}`)
      .join(',');
    return agents;
  }, [
    agents.size,
    Array.from(agents.entries())
      .map((entry: any) => {
        const [k, v] = entry as [string, Agent];
        return `${k}:${v.status}:${v.output?.length || 0}:${v.startTime}:${v.endTime}`;
      })
      .join(',')
  ]);

  return {
    nodeTypes,
    edgeTypes,
    saveToHistory,
    undo,
    redo,
    softReset,
    clearExecutionHistory,
    resetView,
    updateGraph,
    buildMachine,
    addToolBlock,
    addUnifiedBlock,
    addProfessionalBlock,
    stopExecution,
    rerunFromSelected,
    addAgentAndRerun,
    onNodeClick,
    onNodeContextMenu,
    handleEdgePathHighlight,
    clearPathHighlight,
    handleAgentSelect,
    handleNodeFocus,
    stableAgents,
  };
};