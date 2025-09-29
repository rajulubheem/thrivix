import { Node, Edge } from 'reactflow';
import { Frame, TokenFrame, ControlFrame } from '../types/FlowTypes';
import { Agent } from '../../../types/agent';

export interface ExecutionCallbacks {
  onAgentUpdate: (agentId: string, agent: Agent) => void;
  onNodeUpdate: (nodeId: string, updates: any) => void;
  onEdgeUpdate: (edgeId: string, updates: any) => void;
  onStateChange: (state: string) => void;
  onError: (error: string) => void;
  onComplete: () => void;
  onHumanDecisionRequired?: (state: any, allowedEvents: string[]) => void;
}

export class ExecutionManager {
  private agents = new Map<string, Agent>();
  private stateExecutionData: any[] = [];
  private currentState: string = '';
  private agentSequences = new Map<string, string[]>();
  private callbacks: ExecutionCallbacks;

  constructor(callbacks: ExecutionCallbacks) {
    this.callbacks = callbacks;
  }

  handleFrame(frame: Frame): void {
    if (frame.frame_type === 'token') {
      this.handleTokenFrame(frame as TokenFrame);
    } else if (frame.frame_type === 'control') {
      this.handleControlFrame(frame as ControlFrame);
    }
  }

  private handleTokenFrame(frame: TokenFrame): void {
    const agentId = frame.agent_id;
    if (!agentId) return;

    let agent = this.agents.get(agentId);
    if (!agent) {
      agent = {
        id: agentId,
        name: agentId,
        status: 'running',
        output: '',
        messages: []
      };
      this.agents.set(agentId, agent);
    }

    // Update agent output
    agent.output = (agent.output || '') + frame.text;
    agent.status = 'running';

    // Track sequence
    if (!this.agentSequences.has(agentId)) {
      this.agentSequences.set(agentId, []);
    }
    const sequence = this.agentSequences.get(agentId)!;
    sequence.push(frame.text);

    // Update node status
    this.callbacks.onNodeUpdate(agentId, {
      status: 'running',
      output: agent.output
    });

    // Update agent state
    this.callbacks.onAgentUpdate(agentId, agent);

    // Store execution data
    this.stateExecutionData.push({
      timestamp: Date.now(),
      agentId,
      type: 'token',
      content: frame.text,
      final: frame.final
    });
  }

  handleControlFrame(frame: ControlFrame): void {
    const { type, agent_id, payload } = frame;

    // Reduce logging noise - only log important events
    if (type !== 'tool_use') {
      console.log(`Control frame [${type}]:`, frame);
    }

    switch (type) {
      case 'graph_updated': {
        // Graph structure updated during execution
        console.log('📊 Graph updated');
        break;
      }

      case 'rerun_started': {
        console.log('🔄 Rerun started');
        break;
      }

      case 'rerun_completed': {
        console.log('✅ Rerun completed');
        break;
      }

      case 'state_machine_created': {
        console.log('🏗️ State machine created');
        break;
      }

      case 'parallel_start': {
        if (agent_id) {
          this.callbacks.onNodeUpdate(agent_id, {
            parallelRunning: true,
            parallelChildren: payload?.children || [],
            parallelCompleted: 0,
            parallelStartTs: Date.now(),
            parallelChildEvents: {}
          });
        }
        break;
      }

      case 'parallel_child_completed': {
        const childId = payload?.child;
        if (agent_id && childId) {
          // Update parent node with child completion
          this.callbacks.onNodeUpdate(agent_id, {
            parallelCompleted: (payload?.completed_count || 0)
          });
        }
        break;
      }

      case 'parallel_aggregated': {
        if (agent_id) {
          this.callbacks.onNodeUpdate(agent_id, {
            parallelRunning: false,
            parallelCompleted: payload?.total_completed || 0
          });
        }
        break;
      }

      case 'tool_preferences': {
        console.log('🔧 Tool preferences:', payload);
        break;
      }

      case 'state_progress': {
        if (agent_id) {
          this.callbacks.onNodeUpdate(agent_id, {
            progress: payload?.progress || 0,
            progressMessage: payload?.message
          });
        }
        break;
      }

      case 'edge_fired': {
        const { source, target, event } = payload || {};
        if (source && target && event) {
          const edgeId = `${source}-${target}-${event}`;
          this.callbacks.onEdgeUpdate(edgeId, {
            animated: true,
            isActive: true
          });

          // Clear animation after delay
          setTimeout(() => {
            this.callbacks.onEdgeUpdate(edgeId, {
              animated: false,
              isActive: false
            });
          }, 2000);
        }
        break;
      }

      case 'dag_structure': {
        console.log('📊 DAG structure mode');
        break;
      }

      case 'next_state_preview': {
        if (payload?.next_state_id) {
          this.callbacks.onNodeUpdate(payload.next_state_id, {
            isPreview: true
          });
        }
        break;
      }

      case 'human_decision_required': {
        console.log('Human decision required event:', frame);

        // Use the original's flexible approach - match the exact logic
        if (payload?.state && payload?.allowed_events) {
          const st = payload.state;
          this.callbacks.onHumanDecisionRequired?.(st, payload.allowed_events);
        }
        break;
      }

      case 'state_tools_resolved': {
        const { state_id, tools } = payload || {};
        if (state_id && tools) {
          this.callbacks.onNodeUpdate(state_id, {
            tools: tools,
            toolsPlanned: tools
          });
        }
        break;
      }

      case 'state_entered': {
        if (agent_id) {
          this.callbacks.onNodeUpdate(agent_id, { status: 'running' });
          // Also ensure agent exists
          if (!this.agents.has(agent_id)) {
            this.handleAgentStart(agent_id, agent_id);
          }
        }
        break;
      }

      case 'state_exited': {
        if (agent_id) {
          // Only mark as completed if not in error/failure state
          const agent = this.agents.get(agent_id);
          if (agent && agent.status !== 'failed') {
            this.callbacks.onNodeUpdate(agent_id, { status: 'completed' });
          }
        }
        break;
      }

      case 'tool_use': {
        const toolName = payload?.tool || payload?.name;
        if (agent_id && toolName) {
          const agent = this.agents.get(agent_id);
          if (agent) {
            agent.toolsUsed = agent.toolsUsed || [];
            if (!agent.toolsUsed.includes(toolName)) {
              agent.toolsUsed.push(toolName);
            }
            this.callbacks.onAgentUpdate(agent_id, agent);
            this.callbacks.onNodeUpdate(agent_id, {
              toolsUsed: agent.toolsUsed
            });
          }
        }
        break;
      }

      case 'agent_started': {
        if (agent_id) {
          this.handleAgentStart(agent_id, agent_id);
        }
        break;
      }

      case 'agent_spawned': {
        if (payload?.id) {
          const newAgent: Agent = {
            id: payload.id,
            name: payload.name || payload.id,
            status: 'pending',
            output: '',
            messages: []
          };
          this.agents.set(payload.id, newAgent);
          this.callbacks.onAgentUpdate(payload.id, newAgent);
        }
        break;
      }

      case 'agent_completed': {
        if (agent_id) {
          this.handleAgentEnd(agent_id, 'success', frame.result);
        }
        break;
      }

      case 'workflow_completed': {
        this.handleWorkflowCompleted();
        break;
      }

      case 'workflow_failed': {
        console.log('❌ Workflow failed');
        this.callbacks.onError('Workflow execution failed');
        break;
      }

      case 'error': {
        const errorMsg = frame.error || 'Unknown error';
        this.handleError(agent_id || 'system', errorMsg);
        break;
      }

      case 'session_end': {
        console.log('🏁 Session ended');
        this.callbacks.onComplete();
        break;
      }

      // Legacy cases for backward compatibility
      case 'agent_start':
        this.handleAgentStart(agent_id!, frame.state!);
        break;

      case 'agent_end':
        this.handleAgentEnd(agent_id!, frame.status!, frame.result);
        break;

      case 'state_transition':
        this.handleStateTransition(frame.from!, frame.to!, frame.event!);
        break;

      case 'execution_start':
        this.handleExecutionStart();
        break;

      case 'execution_end':
        this.handleExecutionEnd(frame.status!);
        break;

      case 'workflow_plan':
        if (frame.machine) {
          this.handleWorkflowPlan(frame.machine);
        }
        break;

      default:
        console.log(`Unhandled control frame type: ${type}`, frame);
    }
  }

  private handleAgentStart(agentId: string, state: string): void {
    const agent: Agent = {
      id: agentId,
      name: state || agentId,
      status: 'running',
      output: '',
      messages: []
    };
    this.agents.set(agentId, agent);
    this.currentState = state;

    this.callbacks.onNodeUpdate(agentId, { status: 'running' });
    this.callbacks.onAgentUpdate(agentId, agent);
    this.callbacks.onStateChange(state);
  }

  private handleAgentEnd(agentId: string, status: string, result: any): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status === 'success' ? 'completed' : 'failed';
      if (result) {
        agent.output = typeof result === 'string' ? result : JSON.stringify(result);
      }
      this.callbacks.onAgentUpdate(agentId, agent);
    }

    this.callbacks.onNodeUpdate(agentId, {
      status: status === 'success' ? 'completed' : 'failed'
    });
  }

  private handleStateTransition(from: string, to: string, event: string): void {
    // Update edge animation
    const edgeId = `${from}-${to}-${event}`;
    this.callbacks.onEdgeUpdate(edgeId, {
      animated: true,
      isActive: true
    });

    // Update node states
    this.callbacks.onNodeUpdate(from, { status: 'completed' });
    this.callbacks.onNodeUpdate(to, { status: 'pending' });

    // Clear animation after delay
    setTimeout(() => {
      this.callbacks.onEdgeUpdate(edgeId, {
        animated: false,
        isActive: false
      });
    }, 2000);
  }

  private handleExecutionStart(): void {
    this.agents.clear();
    this.stateExecutionData = [];
    this.agentSequences.clear();
  }

  private handleExecutionEnd(status: string): void {
    if (status === 'success') {
      this.callbacks.onComplete();
    } else if (status === 'error') {
      this.callbacks.onError('Execution failed');
    }
  }

  private handleError(agentId: string, error: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'failed';
      agent.error = error;
      this.callbacks.onAgentUpdate(agentId, agent);
    }

    this.callbacks.onNodeUpdate(agentId, {
      status: 'failed',
      error
    });

    this.callbacks.onError(error);
  }

  private handleWorkflowPlan(machine: any): void {
    // This would trigger importing the machine
    // Handled in main component
  }

  private handleWorkflowCompleted(): void {
    console.log('Workflow completed');
    // Mark all pending/running nodes as completed based on their final state
    this.agents.forEach((agent, id) => {
      if (agent.status === 'running' || agent.status === 'pending') {
        agent.status = 'completed';
        this.callbacks.onAgentUpdate(id, agent);
        this.callbacks.onNodeUpdate(id, { status: 'completed' });
      }
    });

    // Trigger the completion callback
    this.callbacks.onComplete();
  }

  getAgents(): Map<string, Agent> {
    return this.agents;
  }

  getStateExecutionData(): any[] {
    return this.stateExecutionData;
  }

  getCurrentState(): string {
    return this.currentState;
  }

  reset(): void {
    this.agents.clear();
    this.stateExecutionData = [];
    this.agentSequences.clear();
    this.currentState = '';
  }
}