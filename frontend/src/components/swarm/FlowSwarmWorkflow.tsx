import { useCallback } from 'react';
import { Node, Edge, MarkerType, Position } from 'reactflow';
import { v4 as uuidv4 } from 'uuid';
import { stateMachineAdapter } from '../../services/stateMachineAdapter';
import { resolveUserInputsInParams } from '../../utils/parameterResolver';
import { getLayoutedElements } from './utils/layoutUtils';

export const useFlowSwarmWorkflow = (state: any, handlers: any) => {
  const {
    nodes, setNodes,
    edges, setEdges,
    task, setTask,
    isRunning, setIsRunning,
    executionId, setExecutionId,
    setConnectionStatus,
    executionMode,
    selectedTools,
    availableTools,
    layoutDirection,
    isDarkMode,
    setHasStateMachineStructure,
    setPlanned,
    setStateExecutionData,
    selectedAgent,
    selectedNodeForSettings, setSelectedNodeForSettings,
    fitView,
    updateNodeInternals,
    connectWebSocket,
    agentSequences,
    layoutCache,
  } = state;

  const {
    buildMachine,
    softReset,
  } = handlers;

  // Start execution
  const startExecution = useCallback(async () => {
    if (!task.trim() || isRunning) return;

    setIsRunning(true);
    setStateExecutionData([]);

    // If there are no nodes, first plan the workflow
    if (nodes.length === 0 && executionMode === 'dynamic') {
      try {
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

        await importStateMachine(planData.machine, true, false);

        await new Promise(resolve => setTimeout(resolve, 500));

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

    if (nodes.length > 0) {
      softReset();
    } else {
      state.resetView();
    }
    setIsRunning(true);
    agentSequences.current.clear();

    try {
      if (nodes.length > 0) {
        const machine = buildMachine();
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
  }, [task, isRunning, nodes.length, executionMode, selectedTools, buildMachine, softReset, setIsRunning, setStateExecutionData, setConnectionStatus, setExecutionId, connectWebSocket, agentSequences]);

  // Plan workflow
  const planWorkflow = useCallback(async () => {
    if (!task.trim()) return;
    try {
      setPlanned(false);
      const res = await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/plan`, {
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const machine = data.machine;
      if (machine) {
        const shouldPreserve = nodes.length > 0;
        await importStateMachine(machine, true, shouldPreserve);
      }
    } catch (e) {
      console.error('Plan failed', e);
    }
  }, [task, selectedTools, nodes.length]);

  // Run planned workflow
  const runPlannedWorkflow = useCallback(async () => {
    try {
      setStateExecutionData([]);
      const machine = buildMachine();
      const res = await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/execute`, {
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setExecutionId(data.exec_id);
      setIsRunning(true);
      setTimeout(() => connectWebSocket(data.exec_id, false), 100);
    } catch (e) {
      console.error('Run failed', e);
    }
  }, [buildMachine, selectedTools, task, connectWebSocket, setExecutionId, setIsRunning, setStateExecutionData]);

  // Expand a single block into a sub-workflow
  const expandBlockIntoSubWorkflow = useCallback((blockId: string, subMachine: any) => {
    const blockToExpand = nodes.find((n: Node) => n.id === blockId);
    if (!blockToExpand) return;

    const incomingEdges = edges.filter((e: Edge) => e.target === blockId);
    const outgoingEdges = edges.filter((e: Edge) => e.source === blockId);

    const basePosition = blockToExpand.position;
    const offsetX = 50;
    const offsetY = 100;

    const subNodes: Node[] = [];
    const subEdges: Edge[] = [];
    const stateIdMap = new Map<string, string>();

    Object.entries(subMachine.states || {}).forEach(([stateName, stateData]: [string, any], idx) => {
      const nodeId = `${blockId}_sub_${stateName}`;
      stateIdMap.set(stateName, nodeId);

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
            setNodes((nds: Node[]) =>
              nds.map((node: Node) =>
                node.id === id ? { ...node, data: { ...node.data, ...updates } } : node
              )
            );
          },
          onDelete: (id: string) => {
            setNodes((nds: Node[]) => nds.filter((node: Node) => node.id !== id));
            setEdges((eds: Edge[]) => eds.filter((edge: Edge) => edge.source !== id && edge.target !== id));
          },
          onDuplicate: (id: string) => {
            const nodeToDuplicate = nodes.find((n: Node) => n.id === id);
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
              setNodes((nds: Node[]) => [...nds, duplicatedNode]);
            }
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
          isDarkMode
        }
      };

      subNodes.push(newNode);
    });

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
            type: 'editable',
            animated: true,
            style: { stroke: '#94A3B8', strokeWidth: 2 },
            data: { event, isDarkMode }
          });
        }
      });
    });

    const firstSubNodeId = subNodes[0]?.id;
    if (firstSubNodeId) {
      incomingEdges.forEach((edge: Edge) => {
        const newEdge: Edge = {
          ...edge,
          id: `${edge.id}_to_sub`,
          target: firstSubNodeId
        };
        subEdges.push(newEdge);
      });
    }

    const lastSubNodeId = subNodes[subNodes.length - 1]?.id;
    if (lastSubNodeId) {
      outgoingEdges.forEach((edge: Edge) => {
        const newEdge: Edge = {
          ...edge,
          id: `${edge.id}_from_sub`,
          source: lastSubNodeId
        };
        subEdges.push(newEdge);
      });
    }

    setNodes((nds: Node[]) => [...nds.filter((n: Node) => n.id !== blockId), ...subNodes]);
    setEdges((eds: Edge[]) => [
      ...eds.filter((e: Edge) => e.source !== blockId && e.target !== blockId),
      ...subEdges
    ]);

    setTimeout(() => {
      handlers.updateGraph(true);
    }, 100);
  }, [nodes, edges, availableTools, isDarkMode, setNodes, setEdges, setSelectedNodeForSettings, handlers]);

  // Create a local sub-workflow when backend is unavailable
  const createLocalSubWorkflow = useCallback((blockId: string, prompt: string) => {
    const blockToExpand = nodes.find((n: Node) => n.id === blockId);
    if (!blockToExpand) return;

    const blockType = blockToExpand.data.type;
    const subWorkflow: any = { states: {} };

    const promptLower = prompt.toLowerCase();
    if (promptLower.includes('satellite') || promptLower.includes('mission') || promptLower.includes('complex')) {
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
      existingNodes = [...nodes];
      existingEdges = [...edges];
    } else {
      setNodes([]);
      setEdges([]);
    }

    if (machine.enhanced && machine.enhanced_blocks) {
      const enhancedNodes = machine.enhanced_blocks.map((block: any) => {
        if (block.type === 'toolBlock' || block.data?.type === 'tool') {
          return {
            ...block,
            data: {
              ...block.data,
              onExecuteTool: async (id: string, toolName: string, parameters: any) => {
                const { ok, params: resolvedParams, error: resolveError } = await resolveUserInputsInParams(parameters);
                if (!ok || !resolvedParams) {
                  setNodes((nds: Node[]) => nds.map((node: Node) => node.id === id ? { ...node, data: { ...node.data, status: 'needs_input', executionError: resolveError || 'Input required' } } : node));
                  throw new Error(resolveError || 'Input required');
                }

                const precheck = await stateMachineAdapter.validateParameters(toolName, resolvedParams);
                if (!precheck.valid) {
                  setNodes((nds: Node[]) => nds.map((node: Node) => node.id === id ? { ...node, data: { ...node.data, status: 'needs_input', executionError: precheck.message } } : node));
                  throw new Error(precheck.message || 'Missing required parameters');
                }

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

                setNodes((nds: Node[]) =>
                  nds.map((node: Node) => {
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

                try {
                  const enhancedEdges = machine.enhanced_edges || [];
                  const outgoingTargets = enhancedEdges.filter((e: any) => e.source === id).map((e: any) => e.target);
                  setNodes((nds: Node[]) => nds.map((node: Node) => {
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

      stateMachineAdapter.propagateContext(
        enhancedNodes,
        enhancedEdges,
        { previousOutputs: new Map(), globalContext: {}, userInputs: {} }
      );

      const positionedNodes = stateMachineAdapter.calculateNodePositions(enhancedNodes, enhancedEdges);

      setNodes([...existingNodes, ...positionedNodes]);
      setEdges([...existingEdges, ...enhancedEdges]);

      const validation = await stateMachineAdapter.validateWorkflow(positionedNodes);
      if (!validation.valid) {
        console.warn('Workflow validation issues:', validation.issues);
      }

      return;
    }

    if (machine.states) {
      const { nodes: enhancedNodes, edges: enhancedEdges } = await stateMachineAdapter.convertToEnhancedWorkflow(machine);

      const processedNodes = enhancedNodes.map((node: Node) => {
        const forceProfessional = {
          ...node,
          type: 'professional',
          data: {
            ...node.data,
            type: node.data?.type || node.data?.nodeType || 'analysis',
          }
        };

        if (forceProfessional.data?.type === 'tool_call' || forceProfessional.data?.toolName) {
          return {
            ...forceProfessional,
            type: 'tool',
            data: {
              ...forceProfessional.data,
              onUpdate: (id: string, updates: any) => {
                setNodes((nds: Node[]) =>
                  nds.map((node: Node) =>
                    node.id === id
                      ? { ...node, data: { ...node.data, ...updates } }
                      : node
                  )
                );
              },
              onExecuteTool: async (id: string, toolName: string, parameters: any) => {
                const { ok, params: resolvedParams, error: resolveError } = await resolveUserInputsInParams(parameters);
                if (!ok || !resolvedParams) {
                  setNodes((nds: Node[]) => nds.map((node: Node) => node.id === id ? { ...node, data: { ...node.data, status: 'needs_input', executionError: resolveError || 'Input required' } } : node));
                  throw new Error(resolveError || 'Input required');
                }
                const precheck = await stateMachineAdapter.validateParameters(toolName, resolvedParams);
                if (!precheck.valid) {
                  setNodes((nds: Node[]) => nds.map((node: Node) => node.id === id ? { ...node, data: { ...node.data, status: 'needs_input', executionError: precheck.message } } : node));
                  throw new Error(precheck.message || 'Missing required parameters');
                }

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

                setNodes((nds: Node[]) =>
                  nds.map((node: Node) => {
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

                try {
                  const outgoingTargets = enhancedEdges.filter((e: any) => e.source === id).map((e: any) => e.target);
                  setNodes((nds: Node[]) => nds.map((node: Node) => {
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
          ...forceProfessional,
          data: {
            ...forceProfessional.data,
            isDarkMode: isDarkMode
          }
        };
      });

      stateMachineAdapter.propagateContext(
        processedNodes,
        enhancedEdges,
        { previousOutputs: new Map(), globalContext: {}, userInputs: {} }
      );

      const positionedNodes = stateMachineAdapter.calculateNodePositions(processedNodes, enhancedEdges);

      setNodes([...existingNodes, ...positionedNodes]);
      setEdges([...existingEdges, ...enhancedEdges]);

      const validation = await stateMachineAdapter.validateWorkflow(positionedNodes);
      if (!validation.valid) {
        console.warn('Workflow validation issues:', validation.issues);
      }

      return;
    }

    const newNodes: Node[] = machine.states.map((state: any, index: number) => {
      const nodeType = useProfessionalBlocks ? 'professional' : 'agent';

      const stateTransitions: Record<string, string> = {};
      machine.edges.forEach((edge: any) => {
        if (edge.source === state.id) {
          stateTransitions[edge.event] = edge.target;
        }
      });

      let blockType = state.type || 'analysis';
      if (state.id === 'start' || state.id === 'initial' ||
          state.name?.toLowerCase() === 'start' ||
          state.name?.toLowerCase() === 'initial' ||
          state.id === machine.initial_state) {
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
        onUpdate: (id: string, updates: any) => {
          setNodes((nds: Node[]) =>
            nds.map((node: Node) =>
              node.id === id
                ? { ...node, data: { ...node.data, ...updates } }
                : node
            )
          );
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
        }
      };

      if (!useProfessionalBlocks) {
        return {
          id: state.id,
          type: nodeType,
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
            isDarkMode
          },
          targetPosition: layoutDirection === 'LR' ? Position.Left : Position.Top,
          sourcePosition: layoutDirection === 'LR' ? Position.Right : Position.Bottom,
        };
      }

      return {
        id: state.id,
        type: nodeType,
        position: { x: 0, y: 0 },
        data: nodeData,
        targetPosition: layoutDirection === 'LR' ? Position.Left : Position.Top,
        sourcePosition: layoutDirection === 'LR' ? Position.Right : Position.Bottom,
      };
    });

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

    const finalNodes = preserveExisting ? [...existingNodes, ...newNodes] : newNodes;
    const finalEdges = preserveExisting ? [...existingEdges, ...newEdges] : newEdges;

    const layouted = getLayoutedElements(finalNodes, finalEdges, layoutDirection);
    layoutCache.current = layouted;
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
    setHasStateMachineStructure(true);
    setPlanned(true);

    setTimeout(() => fitView({ padding: 0.2, duration: 400, maxZoom: 1 }), 100);

    console.log(`Imported state machine with ${newNodes.length} states and ${newEdges.length} transitions`);
  }, [layoutDirection, isDarkMode, availableTools, fitView, setNodes, setEdges, setHasStateMachineStructure, setPlanned, nodes, edges, layoutCache, updateNodeInternals]);

  // Enhance flow with AI - expand selected blocks or entire workflow
  const enhanceFlow = useCallback(async (prompt: string, selectedNodeIds: string[]) => {
    try {
      const currentMachine = buildMachine();

      if (selectedNodeIds.length > 0) {
        const selectedNodes = nodes.filter((n: Node) => selectedNodeIds.includes(n.id));

        const expansionContext = selectedNodes.map((node: Node) => ({
          id: node.id,
          type: node.data.type,
          name: node.data.name,
          description: node.data.description,
          tools: node.data.tools,
          agent_role: node.data.agent_role
        }));

        const enhancementRequest = {
          task: task || "Enhance workflow",
          prompt: `Expand the following blocks into detailed sub-workflows: ${expansionContext.map((c: any) => c.name).join(', ')}. ${prompt}`,
          current_machine: currentMachine,
          selected_states: selectedNodeIds,
          expansion_context: expansionContext,
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

        if (!res.ok) {
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
              expandBlockIntoSubWorkflow(selectedNodeIds[0], data.machine);
            }
          }
          return;
        }

        const data = await res.json();
        const enhancedMachine = data.machine;

        if (enhancedMachine) {
          if (selectedNodeIds.length === 1) {
            expandBlockIntoSubWorkflow(selectedNodeIds[0], enhancedMachine);
          } else {
            await importStateMachine(enhancedMachine, true, true);
          }
        }
      } else {
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
            await importStateMachine(data.machine, true, true);
          }
        } else {
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
              await importStateMachine(data.machine, true, true);
            }
          }
        }
      }

      console.log(`Successfully enhanced workflow`);
    } catch (e) {
      console.error('Enhancement failed', e);
      if (selectedNodeIds.length === 1) {
        createLocalSubWorkflow(selectedNodeIds[0], prompt);
      }
    }
  }, [task, selectedTools, buildMachine, importStateMachine, nodes, expandBlockIntoSubWorkflow, createLocalSubWorkflow]);

  // Save current workflow as template with full visual properties
  const saveAsTemplate = useCallback(() => {
    const machine = buildMachine();

    const fullWorkflow = {
      nodes: nodes.map((node: Node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data,
        width: node.width,
        height: node.height,
        selected: false,
        style: node.style
      })),
      edges: edges.map((edge: Edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
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
      machine,
      fullWorkflow,
      category: 'custom',
      difficulty: 'medium',
      tools: Array.from(selectedTools),
      created: new Date().toISOString(),
      version: '2.1.0'
    };

    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow_template_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    try {
      const savedTemplates = JSON.parse(localStorage.getItem('custom_workflow_templates') || '[]');
      savedTemplates.push(template);
      if (savedTemplates.length > 10) {
        savedTemplates.shift();
      }
      localStorage.setItem('custom_workflow_templates', JSON.stringify(savedTemplates));
      alert('Template saved successfully!');
    } catch (e) {
      console.error('Failed to save template to localStorage:', e);
    }
  }, [buildMachine, task, selectedTools, nodes, edges]);

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

          if (template.fullWorkflow) {
            setNodes([]);
            setEdges([]);

            setTimeout(() => {
              const restoredNodes = template.fullWorkflow.nodes.map((node: any) => {
                const nodeType = node.type || (node.data?.type === 'tool' ? 'toolBlock' : 'professional');

                const baseNodeData = {
                  ...node.data,
                  isDarkMode,
                  availableTools,
                  status: node.data?.status || 'pending',
                  onUpdate: (id: string, updates: any) => {
                    setNodes((nds: Node[]) =>
                      nds.map((n: Node) =>
                        n.id === id ? { ...n, data: { ...n.data, ...updates } } : n
                      )
                    );
                  },
                  onDelete: (id: string) => {
                    setNodes((nds: Node[]) => nds.filter((n: Node) => n.id !== id));
                    setEdges((eds: Edge[]) => eds.filter((e: Edge) => e.source !== id && e.target !== id));
                  },
                  onDuplicate: (id: string) => {
                    setNodes((currentNodes: Node[]) => {
                      const nodeToDuplicate = currentNodes.find((n: Node) => n.id === id);
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

                if (nodeType === 'toolBlock' || node.data?.type === 'tool') {
                  baseNodeData.onExecuteTool = async (id: string, toolName: string, parameters: any) => {
                    console.log(`Executing tool ${toolName} for block ${id}`);
                  };
                }

                const restoredNode = {
                  ...node,
                  type: nodeType,
                  data: baseNodeData
                };

                return restoredNode;
              });

              const restoredEdges = template.fullWorkflow.edges.map((edge: any) => {
                let sourceHandle = edge.sourceHandle;
                let targetHandle = edge.targetHandle;

                if (!sourceHandle || !targetHandle) {
                  const edgeLabel = edge.label || edge.data?.label || edge.data?.event || 'success';

                  if (!sourceHandle) {
                    if (edgeLabel === 'success' || edgeLabel === '') {
                      sourceHandle = 'source';
                    } else if (edgeLabel === 'failure' || edgeLabel === 'error') {
                      sourceHandle = 'failure';
                    } else if (edgeLabel === 'retry') {
                      sourceHandle = 'retry';
                    } else if (edgeLabel === 'timeout') {
                      sourceHandle = 'timeout';
                    } else {
                      sourceHandle = 'source';
                    }
                  }

                  if (!targetHandle) {
                    targetHandle = 'target';
                  }

                  const sourceNode = restoredNodes.find((n: any) => n.id === edge.source);
                  const targetNode = restoredNodes.find((n: any) => n.id === edge.target);

                  if (!sourceHandle && (sourceNode?.data?.type === 'parallel_load' || sourceNode?.data?.nodeType === 'parallel_load')) {
                    sourceHandle = 'source';
                  }

                  if (!targetHandle && (targetNode?.data?.type === 'join' || targetNode?.data?.nodeType === 'join')) {
                    targetHandle = 'target';
                  }
                }

                let edgeType = edge.type;
                if (edgeType === 'bezier') {
                  edgeType = 'default';
                } else if (!edgeType || edgeType === '') {
                  edgeType = 'editable';
                }

                return {
                  ...edge,
                  id: edge.id || `${edge.source}-${edge.target}-${sourceHandle}`,
                  sourceHandle,
                  targetHandle,
                  type: edgeType,
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
                };
              });

              setNodes(restoredNodes);

              setTimeout(() => {
                restoredNodes.forEach((node: any) => {
                  if (node.id) {
                    updateNodeInternals(node.id);
                  }
                });

                setEdges(restoredEdges);

                setTimeout(() => {
                  fitView({ padding: 0.2, duration: 400 });
                }, 50);
              }, 50);
            }, 10);
          } else if (template.machine) {
            await importStateMachine(template.machine, true);
          }

          if (template.tools) {
            state.setSelectedTools(new Set(template.tools));
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
  }, [importStateMachine, setNodes, setEdges, isDarkMode, availableTools, fitView, updateNodeInternals, setTask]);

  return {
    startExecution,
    planWorkflow,
    runPlannedWorkflow,
    expandBlockIntoSubWorkflow,
    createLocalSubWorkflow,
    importStateMachine,
    enhanceFlow,
    saveAsTemplate,
    loadTemplate,
  };
};