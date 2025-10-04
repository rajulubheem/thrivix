import { Node, Edge, Position, MarkerType } from 'reactflow';
import { NodeData, EdgeData } from '../types/FlowTypes';

export interface FrameHandlerContext {
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  setAgents: React.Dispatch<React.SetStateAction<Map<string, any>>>;
  setActivelyStreamingAgents: React.Dispatch<React.SetStateAction<Set<string>>>;
  setIsRunning: React.Dispatch<React.SetStateAction<boolean>>;
  setHasStateMachineStructure: React.Dispatch<React.SetStateAction<boolean>>;
  setExecutionTrace: React.Dispatch<React.SetStateAction<string[]>>;
  setStateExecutionData: React.Dispatch<React.SetStateAction<any[]>>;
  setExecutionHistory: React.Dispatch<React.SetStateAction<Map<string, any>>>;
  setCurrentExecutingNode: React.Dispatch<React.SetStateAction<string | null>>;
  setIsExecuting: React.Dispatch<React.SetStateAction<boolean>>;
  setExecutionOrderCounter: React.Dispatch<React.SetStateAction<number>>;
  setNextExecutingNode: React.Dispatch<React.SetStateAction<string | null>>;
  setDecisionPrompt: React.Dispatch<React.SetStateAction<any>>;
  setInputPrompt: React.Dispatch<React.SetStateAction<any>>;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  setToolPrefs: React.Dispatch<React.SetStateAction<any>>;
  setPlanned: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedAgent: React.Dispatch<React.SetStateAction<string | null>>;
  setCenter: (x: number, y: number, options?: any) => void;
  fitView: (options?: any) => void;
  layoutDirection: 'TB' | 'LR';
  isDarkMode: boolean;
  nodes: Node[];
  executionHistory: Map<string, any>;
  executionOrderCounter: number;
  pendingFocusIdRef: React.MutableRefObject<string | null>;
  focusAttemptsRef: React.MutableRefObject<number>;
  followActiveRef: React.MutableRefObject<boolean>;
  layoutCache: React.MutableRefObject<any>;
  lastLayoutedAgentIds: React.MutableRefObject<Set<string>>;
  softReset: () => void;
  getLayoutedElements: (nodes: Node[], edges: Edge[], direction: 'TB' | 'LR') => { nodes: Node[], edges: Edge[] };
}

export class FrameHandlers {
  private context: FrameHandlerContext;

  constructor(context: FrameHandlerContext) {
    this.context = context;
  }

  handleTokenFrame(frame: any) {
    const { agent_id, seq, text, final } = frame;

    // Track streaming agents
    if (!final) {
      this.context.setActivelyStreamingAgents(prev => new Set(prev).add(agent_id));
    }

    this.context.setAgents(prev => {
      const updated = new Map(prev);
      const agent = updated.get(agent_id);

      if (agent) {
        const base = typeof agent.output === 'string' ? agent.output : '';
        updated.set(agent_id, {
          ...agent,
          output: final ? base : base + text
        });
      }

      return updated;
    });
  }

  handleControlFrame(frame: any) {
    const { type, agent_id, payload } = frame;

    switch (type) {
      case 'graph_updated':
        this.handleGraphUpdated(payload);
        break;
      case 'rerun_started':
        this.handleRerunStarted(agent_id, payload);
        break;
      case 'rerun_completed':
        this.context.setIsRunning(false);
        break;
      case 'state_machine_created':
        this.handleStateMachineCreated(payload);
        break;
      case 'parallel_start':
        this.handleParallelStart(agent_id, payload);
        break;
      case 'parallel_child_completed':
        this.handleParallelChildCompleted(agent_id, payload);
        break;
      case 'parallel_aggregated':
        this.handleParallelAggregated(agent_id, payload);
        break;
      case 'tool_preferences':
        this.handleToolPreferences(payload);
        break;
      case 'state_progress':
        this.handleStateProgress(agent_id, payload);
        break;
      case 'edge_fired':
        this.handleEdgeFired(payload);
        break;
      case 'dag_structure':
        this.handleDagStructure(payload);
        break;
      case 'next_state_preview':
        this.handleNextStatePreview(payload);
        break;
      case 'human_decision_required':
        this.handleHumanDecisionRequired(payload);
        break;
      case 'human_input_required':
        this.handleHumanInputRequired(payload);
        break;
      case 'state_tools_resolved':
        this.handleStateToolsResolved(payload);
        break;
      case 'state_entered':
        this.handleStateEntered(agent_id, payload, frame);
        break;
      case 'state_exited':
        this.handleStateExited(agent_id, payload, frame);
        break;
      case 'tool_use':
        this.handleToolUse(agent_id, payload);
        break;
      case 'agent_started':
        this.handleAgentStarted(agent_id, payload);
        break;
    }
  }

  private handleGraphUpdated(payload: any) {
    const machine: any = payload?.machine;
    if (machine && Array.isArray(machine.states)) {
      const states = machine.states as any[];
      const edges = (machine.edges || []) as any[];

      // Update existing nodes instead of replacing them
      this.context.setNodes(currentNodes => {
        const updatedNodes = currentNodes.map(existingNode => {
          const machineState = states.find(s => s.id === existingNode.id);
          if (machineState) {
            return {
              ...existingNode,
              data: {
                ...existingNode.data,
                status: existingNode.data.status,
                tools: machineState.tools || existingNode.data.tools,
                toolsPlanned: Array.isArray(machineState.tools) ? machineState.tools : existingNode.data.toolsPlanned,
                description: machineState.description || existingNode.data.description,
                agentRole: machineState.agent_role || existingNode.data.agentRole,
              }
            };
          }
          return existingNode;
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
              direction: this.context.layoutDirection,
              isDarkMode: this.context.isDarkMode,
            },
            targetPosition: this.context.layoutDirection === 'LR' ? Position.Left : Position.Top,
            sourcePosition: this.context.layoutDirection === 'LR' ? Position.Right : Position.Bottom,
          }));

        return [...updatedNodes, ...newNodes];
      });

      // Update edges similarly - preserve existing, add new ones
      this.context.setEdges(currentEdges => {
        const machineEdgeIds = new Set(edges.map((e: any) => `${e.source}-${e.target}-${e.event}`));
        const existingEdgeIds = new Set(currentEdges.map(e => e.id));

        const preservedEdges = currentEdges.filter(edge => machineEdgeIds.has(edge.id));

        const newEdges = edges
          .filter((edge: any) => !existingEdgeIds.has(`${edge.source}-${edge.target}-${edge.event}`))
          .map((edge: any) => ({
            id: `${edge.source}-${edge.target}-${edge.event}`,
            source: edge.source,
            target: edge.target,
            type: 'editable',
            animated: false,
            label: edge.event !== 'success' ? edge.event : '',
            labelStyle: { fill: '#94a3b8', fontSize: 11 },
            labelBgStyle: { fill: '#1e293b', fillOpacity: 0.8 },
            style: { stroke: '#52525b', strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: '#52525b' },
          }));

        return [...preservedEdges, ...newEdges];
      });

      this.context.setHasStateMachineStructure(true);
      console.log('📊 Graph updated preserving existing blocks');
    }
  }

  private handleRerunStarted(agent_id: string, payload: any) {
    this.context.setIsRunning(true);
    this.context.softReset();
    const id = payload?.start_state || agent_id;
    if (id) {
      this.context.pendingFocusIdRef.current = id;
      this.context.focusAttemptsRef.current = 0;
    }
  }

  private handleStateMachineCreated(payload: any) {
    const machine: any = payload?.machine;
    if (machine && Array.isArray(machine.states)) {
      const states = machine.states as any[];
      const edges = (machine.edges || []) as any[];

      this.context.setNodes(currentNodes => {
        if (currentNodes.length > 0) {
          return currentNodes.map(existingNode => {
            const machineState = states.find(s => s.id === existingNode.id);
            if (machineState) {
              return {
                ...existingNode,
                data: {
                  ...existingNode.data,
                  tools: machineState.tools || existingNode.data.tools,
                  toolsPlanned: Array.isArray(machineState.tools) ? machineState.tools : existingNode.data.toolsPlanned,
                }
              };
            }
            return existingNode;
          });
        } else {
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
              direction: this.context.layoutDirection,
              isDarkMode: this.context.isDarkMode,
            },
            targetPosition: this.context.layoutDirection === 'LR' ? Position.Left : Position.Top,
            sourcePosition: this.context.layoutDirection === 'LR' ? Position.Right : Position.Bottom,
          }));
          const layouted = this.context.getLayoutedElements(newNodes, [], this.context.layoutDirection);
          return layouted.nodes;
        }
      });

      this.context.setEdges(currentEdges => {
        if (currentEdges.length > 0) {
          return currentEdges;
        } else {
          const mappedEdges: Edge[] = edges.map((edge: any) => ({
            id: `${edge.source}-${edge.target}-${edge.event}`,
            source: edge.source,
            target: edge.target,
            type: 'editable',
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

      this.context.setHasStateMachineStructure(true);
      this.context.setPlanned(true);
      console.log('📊 State machine created - preserving existing blocks');
    }
  }

  private handleParallelStart(agent_id: string, payload: any) {
    this.context.setNodes(nodes => nodes.map(n => n.id === agent_id ? {
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

    if (payload?.children) {
      const childSet = new Set<string>(payload.children);
      this.context.setEdges(edges => edges.map(e => childSet.has(e.source) && e.target === agent_id ? {
        ...e,
        style: { ...e.style, stroke: '#fde047', strokeWidth: 3 },
      } : e));
      setTimeout(() => {
        this.context.setEdges(edges => edges.map(e => childSet.has(e.source) && e.target === agent_id ? {
          ...e,
          style: { ...e.style, stroke: '#94a3b8', strokeWidth: 2 },
        } : e));
      }, 800);
    }
  }

  private handleParallelChildCompleted(agent_id: string, payload: any) {
    const childId = payload?.child;
    const ev = payload?.event;
    this.context.setNodes(nodes => nodes.map(n => n.id === agent_id ? {
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

    if (childId) {
      this.context.setEdges(edges => edges.map(e => e.source === childId && e.target === agent_id ? {
        ...e,
        style: { ...e.style, stroke: payload?.event === 'failure' ? '#ef4444' : '#22c55e', strokeWidth: 3 },
      } : e));
      setTimeout(() => {
        this.context.setEdges(edges => edges.map(e => e.source === childId && e.target === agent_id ? {
          ...e,
          style: { ...e.style, stroke: '#94a3b8', strokeWidth: 2 },
        } : e));
      }, 900);
    }
  }

  private handleParallelAggregated(agent_id: string, payload: any) {
    const nextEvent = payload?.next_event;
    this.context.setNodes(nodes => nodes.map(n => n.id === agent_id ? {
      ...n,
      data: { ...n.data, parallelRunning: false, parallelSummary: nextEvent, parallelCompleted: 0 }
    } : n));
  }

  private handleToolPreferences(payload: any) {
    const unknown = Array.isArray(payload?.unknown) ? payload.unknown : [];
    const effective = Array.isArray(payload?.effective) ? payload.effective : [];
    this.context.setToolPrefs({ unknown, effective });
  }

  private handleStateProgress(agent_id: string, payload: any) {
    this.context.setNodes(nodes => nodes.map(node =>
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
  }

  private handleEdgeFired(payload: any) {
    const { source, target, event } = payload;
    this.context.setEdges(edges => edges.map(edge =>
      edge.source === source && edge.target === target
        ? { ...edge, data: { ...edge.data, isActive: true, event } as EdgeData }
        : edge
    ));
    setTimeout(() => {
      this.context.setEdges(edges => edges.map(edge =>
        edge.source === source && edge.target === target
          ? { ...edge, data: { ...edge.data, isActive: false } as EdgeData }
          : edge
      ));
    }, 1500);
  }

  private handleDagStructure(payload: any) {
    this.context.setHasStateMachineStructure(false);
    if (payload?.nodes && payload?.edges) {
      const { nodes: dagNodes, edges: dagEdges } = payload;

      const newNodes: Node<NodeData>[] = dagNodes.map((node: any, index: number) => ({
        id: node.id,
        type: 'agent',
        position: { x: 0, y: 0 },
        data: {
          label: node.name,
          name: node.name,
          agentRole: node.role,
          task: node.task,
          status: 'pending',
          nodeType: node.type,
          group: node.group,
          round: node.round || node.depth || 0,
          direction: this.context.layoutDirection,
        } as NodeData,
        targetPosition: this.context.layoutDirection === 'LR' ? Position.Left : Position.Top,
        sourcePosition: this.context.layoutDirection === 'LR' ? Position.Right : Position.Bottom,
      }));

      const newEdges: Edge<EdgeData>[] = dagEdges.map((edge: any) => ({
        id: `${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        type: 'editable',
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

      const layouted = this.context.getLayoutedElements(newNodes, newEdges, this.context.layoutDirection);
      this.context.setNodes(prevNodes => {
        const existingNodeIds = new Set(prevNodes.map(n => n.id));
        const nodesToAdd = layouted.nodes.filter(n => !existingNodeIds.has(n.id));
        return [...prevNodes, ...nodesToAdd];
      });
      this.context.setEdges(prevEdges => {
        const existingEdgeIds = new Set(prevEdges.map(e => e.id));
        const edgesToAdd = layouted.edges.filter(e => !existingEdgeIds.has(e.id));
        return [...prevEdges, ...edgesToAdd];
      });

      setTimeout(() => {
        try {
          this.context.fitView({ padding: 0.2, duration: 400, maxZoom: 1 });
        } catch (e) {
          // Ignore fit view errors
        }
      }, 100);
    }
  }

  private handleNextStatePreview(payload: any) {
    if (payload?.next_state_id) {
      this.context.setNextExecutingNode(payload.next_state_id);
      this.context.setNodes(nodes => nodes.map(node => {
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
  }

  private handleHumanDecisionRequired(payload: any) {
    if (payload?.state && payload?.allowed_events) {
      const st = payload.state;
      this.context.setDecisionPrompt({
        stateId: st.id,
        name: st.name,
        description: st.description,
        allowed: payload.allowed_events as string[],
      });

      setTimeout(() => {
        const nodeToFocus = this.context.nodes.find(n => n.id === st.id);
        if (nodeToFocus) {
          const x = nodeToFocus.position.x + 110;
          const y = nodeToFocus.position.y + 50;
          this.context.setCenter(x, y, { zoom: 1.2, duration: 500 });
          this.context.setSelectedAgent(st.id);

          this.context.setNodes(prevNodes => prevNodes.map(n => ({
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
  }

  private handleHumanInputRequired(payload: any) {
    if (payload?.state && payload?.allowed_events) {
      const st = payload.state;
      this.context.setInputPrompt({
        stateId: st.id,
        name: st.name,
        description: st.description,
        allowed: payload.allowed_events as string[],
        schema: payload.input_schema
      });
      this.context.setInputValue('');
      setTimeout(() => {
        const nodeToFocus = this.context.nodes.find(n => n.id === st.id);
        if (nodeToFocus) {
          const x = nodeToFocus.position.x + 110;
          const y = nodeToFocus.position.y + 50;
          this.context.setCenter(x, y, { zoom: 1.2, duration: 500 });
          this.context.setSelectedAgent(st.id);
        }
      }, 100);
    }
  }

  private handleStateToolsResolved(payload: any) {
    const { state_id, tools } = payload || {};
    if (!state_id) return;
    this.context.setNodes(nodes => nodes.map(n => (
      n.id === state_id ? { ...n, data: { ...n.data, toolsPlanned: Array.isArray(tools) ? tools : [] } } : n
    )));
  }

  private handleStateEntered(agent_id: string, payload: any, frame: any) {
    if (agent_id) {
      this.context.setStateExecutionData(prev => {
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

      this.context.setActivelyStreamingAgents(prev => new Set(prev).add(agent_id));
      this.context.setAgents(prev => {
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

      this.context.setNodes(nodes =>
        nodes.map(node => ({
          ...node,
          data: {
            ...node.data,
            status: node.id === agent_id ? 'running' : node.data.status,
          },
        }))
      );

      this.context.setExecutionTrace((prev: string[]) =>
        (prev.length === 0 || prev[prev.length - 1] !== agent_id) ? [...prev, agent_id] : prev
      );

      if (this.context.followActiveRef.current) {
        this.context.pendingFocusIdRef.current = agent_id;
        this.context.focusAttemptsRef.current = 0;
      }
    }
  }

  private handleStateExited(agent_id: string, payload: any, frame: any) {
    if (agent_id) {
      this.context.setStateExecutionData(prev => {
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

      this.context.setActivelyStreamingAgents(prev => {
        const updated = new Set(prev);
        updated.delete(agent_id);
        return updated;
      });

      this.context.setAgents(prev => {
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

      this.context.setNodes(nodes =>
        nodes.map(node => ({
          ...node,
          data: {
            ...node.data,
            status: node.id === agent_id ? 'completed' : node.data.status,
          },
        }))
      );
    }
  }

  private handleToolUse(agent_id: string, payload: any) {
    const toolName = payload?.tool || payload?.name;
    if (!agent_id || !toolName) return;

    this.context.setExecutionHistory(prev => {
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

    this.context.setNodes(nodes => nodes.map(node => {
      if (node.id === agent_id) {
        const blockName = node.data.name || agent_id;
        return {
          ...node,
          data: {
            ...node.data,
            currentAction: `${blockName} → ${toolName}`,
            currentActionDetail: `Tool: ${toolName}`,
            activeTools: [...(node.data.activeTools || []), toolName],
            toolsUsed: Array.from(new Set([...(node.data?.toolsUsed || []), toolName]))
          }
        };
      }
      return node;
    }));

    this.context.setAgents(prev => {
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
  }

  private handleAgentStarted(agent_id: string, payload: any) {
    if (agent_id) {
      this.context.setActivelyStreamingAgents(prev => new Set(prev).add(agent_id));
      this.context.setCurrentExecutingNode(agent_id);
      this.context.setIsExecuting(true);

      const newOrder = this.context.executionOrderCounter + 1;
      this.context.setExecutionOrderCounter(newOrder);

      setTimeout(() => {
        const nodeElement = document.querySelector(`[data-id="${agent_id}"]`);
        if (nodeElement) {
          nodeElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
      }, 100);

      this.context.setAgents(prev => {
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

      this.context.setNodes(nodes =>
        nodes.map(node => {
          if (node.id === agent_id) {
            const blockName = node.data.name || payload?.name || agent_id;
            const blockType = node.data.type || 'process';

            this.context.setExecutionHistory(prev => {
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

          const wasExecuted = this.context.executionHistory.has(node.id);
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
    }
  }
}