import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { SwarmExecutionRequest, SwarmExecutionResult, SwarmEvent, ExecutionMetrics } from '../types/swarm';
import { apiService } from '../services/api';
import { useSSE } from './useSSE';

// CRITICAL: Remove all throttling - everything immediate
const CRITICAL_EVENTS = new Set([
  'text_generation',
  'tool_called',
  'tool_use',
  'tool_execution',
  'agent_started',
  'handoff',
  'execution_completed',
  'execution_failed',
  'execution_stopped'
]);

interface AgentState {
  name: string;
  status: 'idle' | 'thinking' | 'working' | 'streaming' | 'complete' | 'error';
  currentTask?: string;
  lastActivity?: Date;
  tokensUsed: number;
  toolsUsed: string[];
  contributions: number;
}

export function useSwarmExecution() {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [result, setResult] = useState<SwarmExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<ExecutionMetrics | null>(null);
  const [agentStates, setAgentStates] = useState<Map<string, AgentState>>(new Map());

  // CRITICAL FIX: Real-time streaming messages with aggressive deduplication
  const [streamingMessages, setStreamingMessages] = useState<Map<string, string>>(new Map());
  // Force re-render counter for streaming updates
  const [streamUpdateCounter, setStreamUpdateCounter] = useState(0);

  // Performance optimization refs
  const processedEventCountRef = useRef<number>(0);
  const executionStartTimeRef = useRef<number | null>(null);
  const completionHandledRef = useRef<boolean>(false);

  // CRITICAL: Track last processed content length to prevent duplicates
  const lastContentLengthRef = useRef<Map<string, number>>(new Map());
  const lastProcessedEventRef = useRef<Map<string, string>>(new Map());

  // Memoized initial metrics
  const initialMetrics = useMemo((): ExecutionMetrics => ({
    totalAgents: 0,
    handoffs: 0,
    toolUses: 0,
    events: 0,
    tokensUsed: 0,
    executionTime: 0
  }), []);

  // Connect to SSE IMMEDIATELY when execution starts
  const { isConnected, events, clearEvents, disconnect, isComplete } = useSSE(executionId, {
    onEvent: (event: SwarmEvent) => {
      // CRITICAL: Process events with aggressive deduplication
      console.log('🔥 IMMEDIATE EVENT:', event.type, event.agent, event.data);
      processEventWithoutDuplicates(event);

      // Handle completion events
      if ((event.type === 'execution_completed' || event.type === 'execution_failed') && !completionHandledRef.current) {
        completionHandledRef.current = true;
        handleExecutionComplete(event);
      }
    },
    onError: (error) => {
      if (isExecuting && !isComplete) {
        console.error('SSE Error during execution:', error);
        setError('Connection error occurred');
      }
    }
  });

  // CRITICAL FIX: Process events with AGGRESSIVE deduplication and real-time streaming
  const processEventWithoutDuplicates = useCallback((event: SwarmEvent) => {
    processedEventCountRef.current++;
    console.log(`🚀 IMMEDIATE PROCESSING #${processedEventCountRef.current}:`, event.type);

    // CRITICAL: Handle text_generation with ZERO duplicates
    if (event.type === 'text_generation' && event.agent && event.data) {
      const agentName = event.agent;

      // CRITICAL: Create unique event signature to detect exact duplicates
      const eventSignature = `${event.type}-${agentName}-${JSON.stringify(event.data)}`;
      const lastEventSignature = lastProcessedEventRef.current.get(agentName);

      // CRITICAL: Skip if this is the exact same event we just processed
      if (eventSignature === lastEventSignature) {
        console.log('🚫 SKIPPING EXACT DUPLICATE EVENT');
        return;
      }
      lastProcessedEventRef.current.set(agentName, eventSignature);

      // CRITICAL: Handle accumulated text with smart deduplication
      if (event.data.accumulated) {
        const newContent = event.data.accumulated;
        const lastLength = lastContentLengthRef.current.get(agentName) || 0;

      // CRITICAL: Only update if content is actually new/longer
      if (newContent.length > lastLength) {
        console.log(`📜 REAL-TIME UPDATE for ${agentName}: ${lastLength} -> ${newContent.length} chars`);

        // CRITICAL: Force immediate state update that triggers re-render
        setStreamingMessages(prev => {
          const newMap = new Map(prev);
          newMap.set(agentName, newContent);
          console.log(`🔄 IMMEDIATE RENDER TRIGGER for ${agentName}`);
          return newMap;
        });

        lastContentLengthRef.current.set(agentName, newContent.length);
      } else {
        console.log(`🚫 SKIPPING DUPLICATE CONTENT for ${agentName}: same length ${newContent.length}`);
        return;
      }
    }
    // CRITICAL: Handle chunk-based streaming (incremental)
    else if (event.data.chunk || event.data.text) {
      const chunk = event.data.chunk || event.data.text;
      console.log(`📝 REAL-TIME CHUNK for ${agentName}:`, chunk);

      // CRITICAL: Force immediate state update for each chunk
      setStreamingMessages(prev => {
        const newMap = new Map(prev);
        const existingContent = newMap.get(agentName) || '';
        const newContent = existingContent + chunk;
        newMap.set(agentName, newContent);

        // Update length tracker
        lastContentLengthRef.current.set(agentName, newContent.length);
        console.log(`🔄 IMMEDIATE CHUNK RENDER for ${agentName}: "${chunk}"`);
        return newMap;
      });
      
      // CRITICAL: Force re-render by updating counter
      setStreamUpdateCounter(prev => prev + 1);
    }

    // CRITICAL: Update agent status for streaming with immediate effect
    setAgentStates(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(agentName);
      if (existing) {
        newMap.set(agentName, {
          ...existing,
          status: 'streaming',
          currentTask: 'Generating response...',
          lastActivity: new Date()
        });
        console.log(`👤 IMMEDIATE AGENT STATUS UPDATE: ${agentName} -> streaming`);
      }
      return newMap;
    });

      return; // Early return for text_generation events
    }

    // CRITICAL: Update agent states for non-text events IMMEDIATELY
    if (event.agent) {
      setAgentStates(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(event.agent!) || {
          name: event.agent!,
          status: 'idle' as const,
          tokensUsed: 0,
          toolsUsed: [],
          contributions: 0,
          lastActivity: new Date()
        };

        let updatedState = { ...existing, lastActivity: new Date() };

        switch (event.type) {
          case 'agent_started':
            updatedState.status = 'thinking';
            updatedState.currentTask = 'Starting task...';
            console.log(`🧠 Agent ${event.agent} STARTED`);
            break;

          case 'tool_use':
          case 'tool_execution':
          case 'tool_called':
            updatedState.status = 'working';
            if (event.data?.tool) {
              const tools = existing.toolsUsed || [];
              if (!tools.includes(event.data.tool)) {
                updatedState.toolsUsed = [...tools, event.data.tool];
              }
              updatedState.currentTask = `Using ${event.data.tool}...`;
              console.log(`🔧 Agent ${event.agent} using tool: ${event.data.tool}`);
            }
            break;

          case 'agent_completed':
            updatedState.status = 'complete';
            updatedState.contributions = existing.contributions + 1;
            updatedState.currentTask = 'Task completed';
            if (event.data?.tokens) {
              updatedState.tokensUsed = existing.tokensUsed + event.data.tokens;
            }
            console.log(`✅ Agent ${event.agent} COMPLETED`);
            break;
        }

        newMap.set(event.agent!, updatedState);
        return newMap;
      });
    }

    // Update metrics immediately
    updateMetricsImmediately(event);
  }, []);

  // Update metrics immediately
  const updateMetricsImmediately = useCallback((event: SwarmEvent) => {
    setMetrics(prevMetrics => {
      const current = prevMetrics || initialMetrics;
      let tokensUsed = current.tokensUsed;
      let handoffs = current.handoffs;
      let toolUses = current.toolUses;

      // Count event types immediately
      switch (event.type) {
        case 'handoff':
          handoffs++;
          break;
        case 'tool_use':
        case 'tool_execution':
        case 'tool_called':
          toolUses++;
          break;
      }

      // Add token usage if available
      if (event.data?.tokens) {
        tokensUsed += event.data.tokens;
      }

      // Calculate execution time immediately
      const executionTime = executionStartTimeRef.current
          ? (Date.now() - executionStartTimeRef.current) / 1000
          : current.executionTime;

      return {
        totalAgents: Math.max(agentStates.size, current.totalAgents),
        handoffs,
        toolUses,
        events: processedEventCountRef.current,
        tokensUsed,
        executionTime
      };
    });
  }, [agentStates.size, initialMetrics]);

  // Handle execution completion
  const handleExecutionComplete = useCallback((event: SwarmEvent) => {
    console.log('🏁 Handling execution completion:', event.type);

    if (event.type === 'execution_completed') {
      setIsExecuting(false);
      if (event.data?.result) {
        setResult(event.data.result);

        // Final metrics update from result
        const finalMetrics: ExecutionMetrics = {
          totalAgents: event.data.result.agent_sequence?.length || agentStates.size,
          handoffs: event.data.result.handoffs || metrics?.handoffs || 0,
          toolUses: metrics?.toolUses || 0,
          events: processedEventCountRef.current,
          tokensUsed: event.data.result.tokens_used || 0,
          executionTime: event.data.result.execution_time ||
              (executionStartTimeRef.current ? (Date.now() - executionStartTimeRef.current) / 1000 : 0)
        };

        setMetrics(finalMetrics);
      }
    } else if (event.type === 'execution_failed') {
      setIsExecuting(false);
      setError(event.data?.error || 'Execution failed');
    }

    // Cleanup after short delay
    setTimeout(() => {
      setExecutionId(null);
    }, 1000);
  }, [agentStates.size, metrics?.handoffs, metrics?.toolUses]);

  // Enhanced execute function with IMMEDIATE SSE connection
  const execute = useCallback(async (request: SwarmExecutionRequest) => {
    try {
      // Reset ALL state immediately and thoroughly
      setIsExecuting(true);
      setError(null);
      setResult(null);
      setMetrics(initialMetrics);
      setAgentStates(new Map());
      setStreamingMessages(new Map());

      // CRITICAL: Clear ALL refs to prevent stale data
      processedEventCountRef.current = 0;
      executionStartTimeRef.current = Date.now();
      completionHandledRef.current = false;
      lastContentLengthRef.current.clear();
      lastProcessedEventRef.current.clear();

      clearEvents();

      console.log('🚀 Starting COMPLETELY FRESH swarm execution');

      // Start streaming execution and connect to SSE IMMEDIATELY
      try {
        const response = await apiService.executeSwarmStream(request);
        console.log('📥 IMMEDIATE SSE CONNECTION with execution ID:', response.execution_id);

        // Set execution ID IMMEDIATELY to start SSE connection
        setExecutionId(response.execution_id);

      } catch (streamError) {
        console.warn('⚠️ SSE streaming failed, using regular execution:', streamError);

        // Fallback to regular execution
        const result = await apiService.executeSwarm(request);
        console.log('✅ Regular execution completed:', result);

        setResult(result);
        setIsExecuting(false);

        if (result) {
          const finalMetrics: ExecutionMetrics = {
            totalAgents: result.agent_sequence?.length || 0,
            handoffs: result.handoffs || 0,
            toolUses: 0,
            events: 1,
            tokensUsed: result.tokens_used || 0,
            executionTime: result.execution_time || 0
          };
          setMetrics(finalMetrics);
        }
      }

    } catch (err) {
      setIsExecuting(false);
      setError(err instanceof Error ? err.message : 'Failed to start execution');
      console.error('❌ Execution failed:', err);
    }
  }, [clearEvents, initialMetrics]);

  // Enhanced stop function
  const stop = useCallback(async (execId: string) => {
    try {
      await apiService.stopExecution(execId);
      setIsExecuting(false);
      console.log('⏹️ Execution stopped');

      setTimeout(() => {
        setExecutionId(null);
      }, 500);
    } catch (err) {
      console.error('❌ Failed to stop execution:', err);
    }
  }, []);

  // Enhanced reset function
  const reset = useCallback(() => {
    console.log('🔄 COMPLETE RESET of execution state');

    setIsExecuting(false);
    setExecutionId(null);
    setResult(null);
    setError(null);
    setMetrics(initialMetrics);
    setAgentStates(new Map());
    setStreamingMessages(new Map());

    // CRITICAL: Clear ALL refs completely
    processedEventCountRef.current = 0;
    executionStartTimeRef.current = null;
    completionHandledRef.current = false;
    lastContentLengthRef.current.clear();
    lastProcessedEventRef.current.clear();

    clearEvents();
  }, [clearEvents, initialMetrics]);

  // Memoized agent states array for components
  const agentStatesArray = useMemo(() => {
    return Array.from(agentStates.values()).map(state => ({
      id: `agent-${state.name}`,
      name: state.name,
      description: `${state.name} specialist`,
      capabilities: state.toolsUsed,
      status: state.status,
      contributions: state.contributions,
      lastActivity: state.lastActivity?.toISOString(),
      currentTask: state.currentTask,
      tokensUsed: state.tokensUsed,
      toolsUsed: state.toolsUsed
    }));
  }, [agentStates]);

  return {
    execute,
    stop,
    reset,
    isExecuting,
    executionId,
    events,
    result,
    metrics,
    error,
    isConnected,
    agentStates: agentStatesArray,
    // FIXED: Real-time streaming content with aggressive deduplication
    streamingMessages, // Map<agentName, currentText>
    streamUpdateCounter, // Force re-render counter
    // Performance debug info
    processedEvents: processedEventCountRef.current,
    isComplete
  };
}