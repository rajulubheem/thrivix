import { useState, useCallback, useRef, useEffect } from 'react';

interface StreamingOptions {
  onToken?: (agent: string, token: string) => void;
  onAgentStart?: (agent: string) => void;
  onAgentComplete?: (agent: string, content: string, tokens?: number) => void;
  onHandoff?: (from: string, to: string, reason?: string) => void;
  onTool?: (agent: string, tool: string, filename?: string) => void;
  onToolApprovalRequired?: (agent: string, data: any) => void;
  onToolApprovalResponse?: (agent: string, data: any) => void;
  onToolRejected?: (agent: string, data: any) => void;
  onToolExecuted?: (agent: string, data: any) => void;
  onArtifact?: (agent: string, artifact: any) => void;
  onArtifactsCreated?: (agent: string, artifacts: any[]) => void;
  onComplete?: (metrics?: any) => void;
  onError?: (error: string) => void;
  onPollingData?: (data: any) => void;  // Add callback for raw polling data

  // Polling configuration
  minPollInterval?: number;
  maxPollInterval?: number;
  pollBackoff?: number;
  longPollTimeout?: number;
}

export const useStreamingPolling = (options: StreamingOptions = {}) => {
  // Default configuration - optimized for real-time streaming like ChatGPT
  const config = {
    minPollInterval: options.minPollInterval || 0,  // No delay between polls for real-time
    maxPollInterval: options.maxPollInterval || 50,  // Very low max for continuous streaming
    pollBackoff: options.pollBackoff || 1.01,  // Almost no backoff
    longPollTimeout: options.longPollTimeout || 25,  // Long timeout for server-side efficiency
  };

  // State
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<any>(null);

  // Refs for persistent values
  const sessionRef = useRef<string | null>(null);
  const offsetRef = useRef<number>(0);
  const abortRef = useRef<boolean>(false);
  const pollIntervalRef = useRef<number>(config.minPollInterval);
  const retryCountRef = useRef<number>(0);
  const lastActivityRef = useRef<number>(Date.now());
  
  // Initialize sessionRef from sessionStorage on mount
  // But ONLY if it's still valid (not an old session)
  useEffect(() => {
    const storedSession = sessionStorage.getItem('currentStreamingSession');
    const sessionAge = sessionStorage.getItem('currentStreamingSessionTime');
    
    if (storedSession && !sessionRef.current) {
      // Check if session is less than 5 minutes old (TTL)
      if (sessionAge) {
        const age = Date.now() - parseInt(sessionAge);
        if (age < 5 * 60 * 1000) { // 5 minutes in milliseconds
          sessionRef.current = storedSession;
          console.log('🔄 Restored recent session in hook:', storedSession);
        } else {
          // Session too old, clear it
          sessionStorage.removeItem('currentStreamingSession');
          sessionStorage.removeItem('currentStreamingSessionTime');
          console.log('🔄 Cleared old session:', storedSession);
        }
      }
    }
  }, []);

  // FIXED: Add deduplication tracking for tool results
  const processedApprovalIds = useRef<Set<string>>(new Set());
  const processedToolResults = useRef<Set<string>>(new Set());

  // Adaptive polling with exponential backoff
  const adaptPollInterval = useCallback((hasNewData: boolean) => {
    if (hasNewData) {
      pollIntervalRef.current = config.minPollInterval;
      lastActivityRef.current = Date.now();
      retryCountRef.current = 0;
    } else {
      const timeSinceActivity = Date.now() - lastActivityRef.current;

      if (timeSinceActivity > 5000) {
        pollIntervalRef.current = config.maxPollInterval;
      } else {
        pollIntervalRef.current = Math.min(
            pollIntervalRef.current * config.pollBackoff,
            config.maxPollInterval
        );
      }
    }
  }, [config]);

  // Main polling function with error handling and retry logic
  const pollForUpdates = useCallback(async (sessionId: string) => {
    if (abortRef.current) {
      console.log('🚫 Polling aborted');
      return;
    }

    console.log('📡 Polling session:', sessionId, 'at offset:', offsetRef.current);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), (config.longPollTimeout + 5) * 1000);

      const response = await fetch(
          `http://localhost:8000/api/v1/streaming/poll/${sessionId}?offset=${offsetRef.current}&timeout=${config.longPollTimeout}`,
          { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          console.error('Session expired or not found');
          setError('Session expired');
          setIsStreaming(false);
          return;
        }
        if (response.status === 500) {
          console.warn(`Server error ${response.status} at offset ${offsetRef.current}, retrying...`);
          if (retryCountRef.current < 3) {
            retryCountRef.current++;
            setTimeout(() => pollForUpdates(sessionId), 1000 * retryCountRef.current);
            return;
          }
          console.error('Max retries reached for 500 error');
          setError('Server error - please try again');
          setIsStreaming(false);
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      console.log('📦 Poll response:', {
        sessionId: data.session_id,
        status: data.status,
        chunks: data.chunks?.length || 0,
        hasMore: data.has_more,
        offset: data.offset
      });

      if (data.error) {
        console.error('Stream error from server:', data.error);
        if (data.status !== 'error') {
          setTimeout(() => pollForUpdates(sessionId), 1000);
          return;
        }
      }

      if (data.metrics) {
        setMetrics(data.metrics);
      }

      // Send raw polling data for enhanced parsing
      if (options.onPollingData && data.chunks && data.chunks.length > 0) {
        console.log('📤 Sending chunks to onPollingData');
        options.onPollingData(data);
      }

      // Process chunks
      const hasNewChunks = data.chunks && data.chunks.length > 0;
      console.log('📊 Processing chunks:', hasNewChunks ? data.chunks.length : 'none');
      
      // DEBUG: Log the actual chunks to see what we're getting
      if (hasNewChunks) {
        console.log('🔍 Chunk details:', data.chunks.map((c: any) => ({ 
          type: c.type, 
          agent: c.agent, 
          hasContent: !!c.content,
          contentLength: c.content?.length || 0,
          hasData: !!c.data,
          fullChunk: c  // Log the entire chunk for debugging
        })));
      }

      for (const chunk of data.chunks || []) {
        switch (chunk.type) {
          case 'agent_start':
          case 'agent_started':
            // Handle both agent_start and agent_started events
            if (chunk.agent) {
              console.log(`🚀 Agent started: ${chunk.agent}`);
              options.onAgentStart?.(chunk.agent);
            }
            break;

          case 'delta':
          case 'text_generation':
            // Handle both delta (old format) and text_generation (new format)
            const textContent = chunk.content || chunk.data?.chunk || chunk.data?.text || '';
            const agentName = chunk.agent;
            
            if (textContent && agentName) {
              const content = textContent;

              // FIXED: Check if this is a tool result from backend
              if (chunk.is_tool_result) {
                console.log(`📊 Tool result chunk received from backend:`, content.substring(0, 100));
                // Create unique signature for tool result
                const resultSignature = `${chunk.agent}-${content.substring(0, 50)}`;

                if (!processedToolResults.current.has(resultSignature)) {
                  processedToolResults.current.add(resultSignature);
                  options.onToken?.(chunk.agent, content);
                } else {
                  console.log('⭐️ Skipping duplicate tool result');
                }
                break;
              }

              // FIXED: Check for tool call markers with better deduplication
              if (content.includes('[TOOL:') && !content.includes('[EXECUTING:')) {
                const toolCallMatch = content.match(/\[TOOL:\s*([\w_]+)\]/);
                if (toolCallMatch) {
                  const toolName = toolCallMatch[1];
                  console.log(`🔧 Detected tool call in stream: ${toolName}`);

                  // Create signature for deduplication
                  const toolSignature = `${chunk.agent}-${toolName}-${Date.now()}`;

                  // Extract parameters if present
                  const accumulatedContent = chunk.accumulated || content;
                  const toolSpecificRegex = new RegExp(`\\[TOOL:\\s*${toolName}\\]\\s*\\n?\\s*(\\{[\\s\\S]*?\\})`, 'g');
                  const paramsMatch = accumulatedContent.match(toolSpecificRegex);
                  let params: any = {};
                  if (paramsMatch && paramsMatch[0]) {
                    try {
                      const jsonMatch = paramsMatch[0].match(/\{[\s\S]*?\}/);
                      if (jsonMatch) {
                        params = JSON.parse(jsonMatch[0]);
                      }
                    } catch (e) {
                      console.log('Could not parse tool parameters');
                    }
                  }

                  options.onTool?.(chunk.agent, toolName, params?.filename || params?.path);
                }
              }

              // Always send the raw content for display
              options.onToken?.(agentName, content);
            }
            break;

          case 'agent_done':
          case 'agent_completed':
            console.log('🎯 Processing agent_done/agent_completed chunk:', chunk);
            if (chunk.agent) {
              // Handle both formats - agent_done uses chunk.content, agent_completed uses chunk.data.output
              const output = chunk.content || chunk.data?.output || '';
              const tokens = chunk.tokens || chunk.data?.tokens || 0;
              console.log(`✅ Agent ${chunk.agent} completed with output (${output.length} chars):`, output);
              if (output) {
                options.onAgentComplete?.(chunk.agent, output, tokens);
              } else {
                console.warn('⚠️ Agent completed but no output found in chunk:', chunk);
              }
            } else {
              console.warn('⚠️ Agent done chunk without agent field:', chunk);
            }
            break;

          case 'handoff':
            // Handle both formats - data might contain from_agent/to_agent or from/to
            const fromAgent = chunk.from || chunk.data?.from_agent || chunk.data?.from || '?';
            const toAgent = chunk.to || chunk.data?.to_agent || chunk.data?.to || '?';
            const reason = chunk.reason || chunk.data?.reason || '';
            
            console.log('🔄 Handoff event:', { fromAgent, toAgent, reason, chunk });
            
            if (fromAgent !== '?' || toAgent !== '?') {
              options.onHandoff?.(fromAgent, toAgent, reason);
            }
            break;

          case 'tool':
            if (chunk.agent && chunk.tool) {
              options.onTool?.(chunk.agent, chunk.tool, chunk.filename);
            }
            break;

          case 'tool_approval_required':
            if (chunk.agent && chunk.data) {
              const approvalId = chunk.data.approval_id;

              if (approvalId && processedApprovalIds.current.has(approvalId)) {
                console.log('⚠️ Skipping duplicate approval in polling:', approvalId);
                break;
              }

              if (approvalId) {
                processedApprovalIds.current.add(approvalId);
              }

              console.log('🛑 TOOL APPROVAL REQUIRED (from polling):', chunk);

              if (options.onToolApprovalRequired) {
                options.onToolApprovalRequired(chunk.agent, chunk.data);
              } else {
                window.dispatchEvent(new CustomEvent('tool-approval-required', {
                  detail: { agent: chunk.agent, data: chunk.data }
                }));
              }
            }
            break;

          case 'tool_approval_response':
            console.log('✅ TOOL APPROVAL RESPONSE (from polling):', chunk);
            if (options.onToolApprovalResponse) {
              options.onToolApprovalResponse(chunk.agent, chunk.data);
            }
            break;

          case 'tool_rejected':
            console.log('❌ TOOL REJECTED (from polling):', chunk);
            if (options.onToolRejected) {
              options.onToolRejected(chunk.agent, chunk.data);
            }
            break;

          case 'tool_executed':
            console.log('✓ TOOL EXECUTED (from polling):', chunk);
            if (chunk.agent && chunk.data) {
              // FIXED: Only call callback once, don't format message here
              options.onToolExecuted?.(chunk.agent, chunk.data);
            }
            break;

          case 'tool_call':
            console.log('🔧 TOOL CALL (from polling):', chunk);
            if (chunk.agent && chunk.data) {
              const toolName = chunk.data.tool || chunk.data.name || 'Unknown Tool';
              const toolParams = chunk.data.parameters || chunk.data.params || {};

              // FIXED: Don't create formatted display here - let the backend handle it
              options.onTool?.(chunk.agent, toolName, toolParams.filename);
            }
            break;

          case 'tool_result':
            console.log('📊 TOOL RESULT (from polling):', chunk);
            // FIXED: Handle structured tool result event without duplication
            if (chunk.agent && chunk.data) {
              options.onToolExecuted?.(chunk.agent, chunk.data);
            }
            break;

          case 'artifact':
            console.log('🎨 ARTIFACT (from polling):', chunk);
            if (chunk.agent && chunk.data) {
              const artifact = chunk.data;

              // FIXED: Don't format artifact for display here - backend handles it
              options.onArtifact?.(chunk.agent, artifact);
            }
            break;

          case 'artifacts_created':
            console.log('📦 ARTIFACTS CREATED (from polling):', chunk);
            if (chunk.agent && chunk.data?.artifacts) {
              const artifacts = chunk.data.artifacts;

              // FIXED: Don't format artifacts for display here
              options.onArtifactsCreated?.(chunk.agent, artifacts);
            }
            break;

          case 'continuation_separator':
            // Handle continuation separator - treat it as a system message
            if (chunk.content) {
              console.log('🔄 Continuation separator:', chunk.content);
              // This will be displayed as a system message in the chat
            }
            break;

          case 'done':
            setIsStreaming(false);
            options.onComplete?.(chunk.metrics);
            return;

          case 'error':
            throw new Error(chunk.error || 'Stream error');
        }
      }

      // Update offset safely
      if (typeof data.offset === 'number' && data.offset >= 0) {
        offsetRef.current = data.offset;
      } else {
        console.warn('Invalid offset received:', data.offset);
      }

      // Adapt polling interval based on activity
      adaptPollInterval(hasNewChunks);

      // Continue polling if more data expected
      if (data.has_more && !abortRef.current) {
        const nextPollDelay = hasNewChunks && data.chunks?.length >= 50 ? 0 : pollIntervalRef.current;
        setTimeout(() => pollForUpdates(sessionId), nextPollDelay);
      } else if (!data.has_more && data.status === 'complete') {
        setIsStreaming(false);
        options.onComplete?.(data.metrics);
      } else if (data.status === 'running' || data.status === 'initializing') {
        // Keep polling for running or initializing sessions
        console.log('🔄 Continuing to poll for status:', data.status);
        setTimeout(() => pollForUpdates(sessionId), pollIntervalRef.current);
      }

      retryCountRef.current = 0;

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';

      if (err instanceof Error && err.name === 'AbortError') {
        if (!abortRef.current && retryCountRef.current < 3) {
          retryCountRef.current++;
          setTimeout(() => pollForUpdates(sessionId), 1000 * retryCountRef.current);
          return;
        }
      } else if (errorMsg.includes('Session expired') || errorMsg.includes('404')) {
        setError('Session expired');
        setIsStreaming(false);
        options.onError?.(errorMsg);
        return;
      } else if (errorMsg.includes('Failed to fetch') && retryCountRef.current < 5) {
        retryCountRef.current++;
        const retryDelay = Math.min(1000 * Math.pow(2, retryCountRef.current), 10000);
        console.warn(`Network error, retrying in ${retryDelay}ms...`);
        setTimeout(() => pollForUpdates(sessionId), retryDelay);
        return;
      }

      setError(errorMsg);
      setIsStreaming(false);
      options.onError?.(errorMsg);
    }
  }, [options, config, adaptPollInterval]);

  // Start streaming
  const startStream = useCallback(async (
      task: string,
      agents: any[] = [],
      maxHandoffs: number = 20,
      existingSessionId?: string,
      previousMessages?: any[]
  ) => {
    // Reset state
    setIsStreaming(true);
    setError(null);
    setMetrics(null);
    abortRef.current = false;
    
    // CRITICAL FIX: Reset offset for continue endpoint
    // When we call /continue, we're creating a new streaming context even if using the same session_id
    // The backend will append new chunks starting from where it left off
    // So we should NOT reset if it's the exact same streaming session still running
    if (!existingSessionId || existingSessionId !== sessionRef.current) {
      // This is either a new session or a different session - reset offset
      offsetRef.current = 0;
      console.log('🆕 New or different session - resetting offset to 0');
    } else {
      // This is a continuation of the SAME streaming session already in progress
      console.log(`🔄 Continuing same streaming session ${existingSessionId} - keeping offset at ${offsetRef.current}`);
    }
    
    retryCountRef.current = 0;
    pollIntervalRef.current = config.minPollInterval;
    lastActivityRef.current = Date.now();

    // FIXED: Clear deduplication tracking
    processedApprovalIds.current.clear();
    processedToolResults.current.clear();

    try {
      const formattedAgents = agents.map(agent => {
        if (typeof agent === 'string') {
          return {
            name: agent,
            system_prompt: `You are ${agent}. Help with the task.`,
            tools: [],
            model: 'gpt-4o-mini'
          };
        }
        return agent;
      });

      // CRITICAL FIX: Determine endpoint based on whether we're continuing
      // existingSessionId is the chat session ID
      // sessionRef.current is the streaming session ID 
      // For continuation: we should have an existingSessionId AND have received chunks (offsetRef > 0)
      const isContinuation = existingSessionId && offsetRef.current > 0;
      
      console.log('🔄 Starting stream with:', {
        existingSessionId,
        currentSessionRef: sessionRef.current,
        isContinuation,
        offsetRef: offsetRef.current,
        task: task.substring(0, 50) + '...'
      });
      
      // Choose endpoint based on whether we're continuing
      const endpoint = isContinuation
        ? 'http://localhost:8000/api/v1/streaming/continue'
        : 'http://localhost:8000/api/v1/streaming/start';
      
      console.log(`📡 Using endpoint: ${endpoint} for session: ${existingSessionId || 'NEW'}`)
      
      // Always pass the session_id in the request
      const requestBody = isContinuation
        ? {
            session_id: existingSessionId,
            task,
            previous_messages: previousMessages || [],
            agents: formattedAgents,
            max_handoffs: maxHandoffs
          }
        : {
            session_id: existingSessionId,  // CRITICAL: Pass session_id even for start endpoint
            task,
            agents: formattedAgents,
            max_handoffs: maxHandoffs
          };

      console.log('📡 Sending request to:', endpoint);
      console.log('📦 Request body:', requestBody);
      
      // Add timeout to catch hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error('❌ Request timeout after 30 seconds');
        controller.abort();
      }, 30000);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      }).catch(error => {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          console.error('❌ Request timed out');
          throw new Error('Request timed out after 30 seconds');
        }
        console.error('❌ Network error:', error);
        throw new Error(`Network error: ${error.message}`);
      });
      
      clearTimeout(timeoutId);

      console.log('📨 Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error message');
        console.error('❌ Response not OK:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json().catch(error => {
        console.error('❌ Failed to parse JSON:', error);
        throw new Error('Invalid JSON response');
      });
      
      console.log('✅ Response data:', data);
      sessionRef.current = data.session_id;
      
      // Save to sessionStorage for persistence with timestamp
      sessionStorage.setItem('currentStreamingSession', data.session_id);
      sessionStorage.setItem('currentStreamingSessionTime', Date.now().toString());
      console.log('💾 Saved session to storage:', data.session_id);

      pollForUpdates(data.session_id);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      setIsStreaming(false);
      options.onError?.(errorMsg);
    }
  }, [pollForUpdates, options, config]);

  // Stop streaming
  const stopStream = useCallback(() => {
    abortRef.current = true;
    setIsStreaming(false);

    // IMPORTANT: Do NOT clear sessionRef.current here!
    // We need to preserve it for conversation continuation
    if (sessionRef.current) {
      fetch(`http://localhost:8000/api/v1/streaming/stop/${sessionRef.current}`, {
        method: 'DELETE',
      }).catch(() => {
        // Ignore cleanup errors
      });
      // DO NOT CLEAR: sessionRef.current = null;
      // We need this for continuing the conversation!
    }
  }, []);

  // Get current status
  const getStatus = useCallback(async () => {
    if (!sessionRef.current) return null;

    try {
      const response = await fetch(`http://localhost:8000/api/v1/streaming/status/${sessionRef.current}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch {
      return null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        abortRef.current = true;
        fetch(`http://localhost:8000/api/v1/streaming/stop/${sessionRef.current}`, {
          method: 'DELETE',
        }).catch(() => {});
      }
    };
  }, []);

  return {
    startStream,
    stopStream,
    getStatus,
    isStreaming,
    error,
    metrics,
    sessionId: sessionRef.current,
  };
};