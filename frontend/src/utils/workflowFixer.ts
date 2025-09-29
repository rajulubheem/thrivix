/**
 * Utility to fix workflow states that should have tools but don't
 * This ensures retry states get the same tools as their parent states
 */

export interface WorkflowState {
  id: string;
  name: string;
  type: string;
  tools: string[];
  transitions?: Record<string, string>;
  [key: string]: any;
}

export interface WorkflowMachine {
  states: WorkflowState[];
  edges?: any[];
  [key: string]: any;
}

/**
 * Fix retry states to have the same tools as the states they're retrying
 */
export function fixRetryStates(machine: WorkflowMachine): WorkflowMachine {
  const stateMap = new Map<string, WorkflowState>();

  // Build state map
  machine.states.forEach(state => {
    stateMap.set(state.id, state);
  });

  // Find and fix retry states
  machine.states.forEach(state => {
    // Check if this is a retry state (by name pattern or by checking what it transitions to)
    if (state.id.includes('retry_') && state.type === 'analysis') {
      // Find the original state being retried
      const originalStateName = state.id.replace('retry_', '');
      const originalState = stateMap.get(originalStateName);

      if (originalState && originalState.tools && originalState.tools.length > 0) {
        // Copy tools from original state to retry state
        state.tools = [...originalState.tools];

        // Optionally change type to tool_call to ensure tools are used
        if (originalState.type === 'tool_call') {
          state.type = 'tool_call';
        }

        console.log(`Fixed retry state ${state.id} - added tools: ${state.tools.join(', ')}`);
      }
    }
  });

  return machine;
}

/**
 * Alternative approach: Change all analysis states with tools to tool_call type
 */
export function ensureToolStatesHaveCorrectType(machine: WorkflowMachine): WorkflowMachine {
  machine.states.forEach(state => {
    // If state has tools but is type 'analysis', change to 'tool_call'
    if (state.tools && state.tools.length > 0 && state.type === 'analysis') {
      state.type = 'tool_call';
      console.log(`Changed state ${state.id} from 'analysis' to 'tool_call' because it has tools`);
    }
  });

  return machine;
}

/**
 * Apply all fixes to a workflow machine
 */
export function fixWorkflowMachine(machine: WorkflowMachine): WorkflowMachine {
  let fixed = { ...machine };
  fixed = fixRetryStates(fixed);
  fixed = ensureToolStatesHaveCorrectType(fixed);
  return fixed;
}