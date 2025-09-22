import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import { 
  Loader2, Send, StopCircle, RefreshCw, User, Bot, Sparkles, Brain,
  Settings, Activity, Users, MessageSquare, Clock, ChevronRight, ChevronDown,
  Zap, Shield, Gauge, Filter, LayoutGrid, List, Play, Pause,
  CheckCircle, AlertCircle, Cpu, Database, GitBranch, Target,
  Plus, Trash2, Edit2, Save, X, History, FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import AgentPipeline from '../components/swarm/AgentPipeline';
import { useNavigate } from 'react-router-dom';
import { HomeButton } from '../components/ui/HomeButton';

// API Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  agent?: string;
  timestamp: string;
  isStreaming?: boolean;
}

interface AgentActivity {
  agent: string;
  status: 'idle' | 'thinking' | 'typing' | 'done';
  content?: string;
}

interface SessionData {
  id: string;
  title: string;
  messages: Message[];
  timestamp: string;
  lastMessage?: string;
}

export function CleanSwarmChat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeAgents, setActiveAgents] = useState<Map<string, AgentActivity>>(new Map());
  const [streamingContent, setStreamingContent] = useState<Map<string, string>>(new Map());
  const [toolCalls, setToolCalls] = useState<any[]>([]);
  const [toolResults, setToolResults] = useState<any[]>([]);
  const [showToolsBar, setShowToolsBar] = useState<boolean>(false);
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [handoffs, setHandoffs] = useState<any[]>([]);
  const [sharedState, setSharedState] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'chat'|'agents'|'timeline'>('chat');
  const [detailAgent, setDetailAgent] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [pausedBuffer, setPausedBuffer] = useState<Map<string, string>>(new Map());
  const [goalDraft, setGoalDraft] = useState('');
  const [timeline, setTimeline] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'grid'|'list'>('grid');
  const [sessionHistory, setSessionHistory] = useState<SessionData[]>([]);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  // Orchestrator → Swarm handoff state
  const [orchAgents, setOrchAgents] = useState<any[]>([]);
  const [orchAutoStart, setOrchAutoStart] = useState<boolean>(false);
  const [orchTask, setOrchTask] = useState<string>('');
  const [showOrchEditor, setShowOrchEditor] = useState<boolean>(false);
  const [orchDraftTask, setOrchDraftTask] = useState<string>('');
  const [availableTools, setAvailableTools] = useState<string[]>(['python_repl', 'file_write', 'file_read', 'tavily_search']);
  const [isGeneratingAgents, setIsGeneratingAgents] = useState<boolean>(false);
  const [runParallel, setRunParallel] = useState<boolean>(false);
  const [showScrollButton, setShowScrollButton] = useState<boolean>(false);
  
  // Track accumulating tool calls to prevent duplicate messages
  const accumulatingToolsRef = useRef<Map<string, any>>(new Map());

  const persistOrchAgents = useCallback((agents: any[]) => {
    try {
      setOrchAgents(agents);
      sessionStorage.setItem('orchestratorAgents', JSON.stringify(agents));
    } catch {}
  }, []);

  // Try to load available tools from backend registry (optional)
  useEffect(() => {
    (async () => {
      try {
        // Prefer available-tools endpoint; keep fallback if alias is added later
        let res = await fetch('/api/v1/tool-registry/available-tools');
        if (!res.ok) {
          res = await fetch('/api/v1/tool-registry/available');
        }
        if (res.ok) {
          const data = await res.json();
          const names = Array.isArray(data?.tools) ? data.tools.map((t: any) => t.name || t) : [];
          if (names.length) setAvailableTools(names);
        }
      } catch {}
    })();
  }, []);
  // Execution mode + config
  const [executionMode, setExecutionMode] = useState<'event_driven'|'turn_based'|'hybrid'>('event_driven');
  const [showModeConfig, setShowModeConfig] = useState(false);
  const [modeConfig, setModeConfig] = useState<{max_concurrent_agents:number; max_total_agents:number; max_agent_runtime:number}>(
    { max_concurrent_agents: 3, max_total_agents: 8, max_agent_runtime: 90 }
  );
  const [agentStartTs, setAgentStartTs] = useState<Map<string, number>>(new Map());
  const [agentTimeouts, setAgentTimeouts] = useState<Map<string, number>>(new Map());
  const [timelineFilters, setTimelineFilters] = useState<Record<string, boolean>>({
    session_start: true,
    agent_started: true,
    token: false,
    tool_call: true,
    tool_result: true,
    handoff: true,
    agent_completed: true,
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const processedAgentFinalRef = useRef<Set<string>>(new Set());
  // Track last delegated target agent for fallback rendering
  const lastHandoffTargetRef = useRef<string | null>(null);
  
  const roleFor = (name: string) => {
    const n = (name || '').toLowerCase();
    if (n.includes('analy') || n.includes('research')) return { 
      role: 'Analyzer', 
      color: 'text-purple-700 dark:text-purple-300', 
      bg: 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800', 
      emoji: '🔍' 
    };
    if (n.includes('develop') || n.includes('coder') || n.includes('build')) return { 
      role: 'Developer', 
      color: 'text-green-700 dark:text-green-300', 
      bg: 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800', 
      emoji: '💻' 
    };
    if (n.includes('review') || n.includes('qa') || n.includes('test')) return { 
      role: 'Reviewer', 
      color: 'text-amber-700 dark:text-amber-300', 
      bg: 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800', 
      emoji: '🧪' 
    };
    if (n.includes('coordinator')) return { 
      role: 'Coordinator', 
      color: 'text-blue-700 dark:text-blue-300', 
      bg: 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800', 
      emoji: '🎯' 
    };
    return { 
      role: 'Specialist', 
      color: 'text-indigo-700 dark:text-indigo-300', 
      bg: 'bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800', 
      emoji: '🤖' 
    };
  };
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentAgentContentRef = useRef<Map<string, string>>(new Map());
  const isUserScrollingRef = useRef<boolean>(false);
  const lastScrollPositionRef = useRef<number>(0);

  // Smart auto-scroll like ChatGPT - only scroll if user is at bottom
  useEffect(() => {
    console.log(`📊 Messages state updated: ${messages.length} messages`);
    messages.forEach((msg, idx) => {
      console.log(`  Message ${idx}: role=${msg.role}, agent=${msg.agent}, content=${msg.content.substring(0, 50)}...`);
    });
    
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        // Check if user is near the bottom (within 100px threshold)
        const isNearBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 100;
        
        // Only auto-scroll if user is near bottom or if this is a new conversation
        if (isNearBottom || messages.length <= 1) {
          // Use requestAnimationFrame for smoother scrolling
          requestAnimationFrame(() => {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
          });
        }
      }
    }
  }, [messages, streamingContent]);

  // Add scroll event listener to detect when user scrolls
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        const handleScroll = () => {
          const isNearBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 100;
          setShowScrollButton(!isNearBottom && scrollContainer.scrollHeight > scrollContainer.clientHeight);
        };

        scrollContainer.addEventListener('scroll', handleScroll);
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
      }
    }
  }, []);

  // Function to manually scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: 'smooth'
        });
      }
    }
  }, []);

  // Load session history from localStorage
  const loadSessionHistory = useCallback(() => {
    const history = localStorage.getItem('swarm_session_history');
    if (history) {
      try {
        const parsed = JSON.parse(history);
        setSessionHistory(parsed);
      } catch (e) {
        console.error('Failed to parse session history:', e);
      }
    }
  }, []);

  // Save current session to history
  const saveCurrentSession = useCallback(() => {
    if (!sessionId || messages.length === 0) return;
    
    const currentSession: SessionData = {
      id: sessionId,
      title: messages[0]?.content?.slice(0, 50) || 'New Chat',
      messages: messages,
      timestamp: new Date().toISOString(),
      lastMessage: messages[messages.length - 1]?.content?.slice(0, 100)
    };
    
    // Get fresh history from localStorage to avoid stale closure
    const storedHistory = localStorage.getItem('swarm_session_history');
    let existingHistory: SessionData[] = [];
    if (storedHistory) {
      try {
        existingHistory = JSON.parse(storedHistory);
      } catch (e) {
        console.error('Failed to parse session history:', e);
      }
    }
    
    const updatedHistory = existingHistory.filter(s => s.id !== sessionId);
    updatedHistory.unshift(currentSession);
    
    // Keep only last 50 sessions
    const trimmedHistory = updatedHistory.slice(0, 50);
    setSessionHistory(trimmedHistory);
    localStorage.setItem('swarm_session_history', JSON.stringify(trimmedHistory));
  }, [sessionId, messages]);

  // Initialize session on mount (and pull orchestrator handoff data)
  useEffect(() => {
    loadSessionHistory();
    
    // Check if we have a current session in URL or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const urlSessionId = urlParams.get('session');
    const storedSessionId = localStorage.getItem('swarm_current_session_id');
    
    if (urlSessionId) {
      // Load session from URL
      setSessionId(urlSessionId);
      fetchSharedState(urlSessionId);
    } else if (storedSessionId) {
      // Restore last session
      const history = localStorage.getItem('swarm_session_history');
      if (history) {
        try {
          const parsed = JSON.parse(history);
          const session = parsed.find((s: SessionData) => s.id === storedSessionId);
          if (session) {
            setSessionId(session.id);
            setMessages(session.messages);
            fetchSharedState(session.id);
          } else {
            // Session not in history, create new
            const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            setSessionId(newSessionId);
            localStorage.setItem('swarm_current_session_id', newSessionId);
          }
        } catch (e) {
          // Create new session on error
          const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          setSessionId(newSessionId);
          localStorage.setItem('swarm_current_session_id', newSessionId);
        }
      } else {
        // No history, create new session
        const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setSessionId(newSessionId);
        localStorage.setItem('swarm_current_session_id', newSessionId);
      }
    } else {
      // Create new session
      const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setSessionId(newSessionId);
      localStorage.setItem('swarm_current_session_id', newSessionId);
    }
    
    // Pull orchestrator handoff from sessionStorage
    try {
      const auto = sessionStorage.getItem('orchestratorAutoStart') === 'true';
      const agentsStr = sessionStorage.getItem('orchestratorAgents');
      const taskStr = sessionStorage.getItem('orchestratorTask') || '';
      if (agentsStr) {
        const parsed = JSON.parse(agentsStr);
        if (Array.isArray(parsed)) {
          setOrchAgents(parsed);
        }
      }
      if (auto && taskStr) {
        setOrchAutoStart(true);
        setOrchTask(taskStr);
      }
    } catch {}

    const onBeforeUnload = () => {
      if (sessionId) {
        try { fetch(`${API_BASE_URL}/api/v1/streaming/stop/${sessionId}`, { method: 'POST', keepalive: true }); } catch {}
      }
      if (abortControllerRef.current) {
        try { abortControllerRef.current.abort(); } catch {}
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []); // Empty dependency array - only run once on mount

  // If orchestrator requested auto-start, kick off once sessionId is ready
  useEffect(() => {
    if (orchAutoStart && sessionId) {
      const userMessage: Message = {
        id: `user_${Date.now()}`,
        role: 'user',
        content: orchTask,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, userMessage]);
      setOrchAutoStart(false);
      sessionStorage.removeItem('orchestratorAutoStart');
      startSSEStream(orchTask, true);
    }
  }, [orchAutoStart, sessionId]);

  // Save session when messages change
  useEffect(() => {
    if (messages.length > 0 && sessionId) {
      const timer = setTimeout(() => {
        saveCurrentSession();
      }, 500); // Debounce to avoid rapid saves
      
      return () => clearTimeout(timer);
    }
  }, [messages.length, sessionId]); // Only depend on length and sessionId, not the full arrays

  // Fetch shared state snapshot from backend
  const fetchSharedState = useCallback(async (sid: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sid}/shared-state`);
      if (res.ok) {
        const data = await res.json();
        setSharedState(data);
      }
    } catch (e) {
      // Non-fatal
    }
  }, []);

  const startSSEStream = useCallback(async (task: string, isFirstMessage: boolean) => {
    if (!sessionId) return;

    setIsLoading(true);
    setActiveAgents(new Map());
    setStreamingContent(new Map());

    try {
      // CRITICAL: Use the correct SSE endpoints
      const endpoint = isFirstMessage 
        ? '/api/v1/streaming/start/sse' 
        : '/api/v1/streaming/continue/sse';

      // Attach orchestrator-generated agents if present
      const mappedAgents = (orchAgents || []).map((a: any) => {
        // Choose tools from multiple possible fields
        const toolList = Array.isArray(a?.tools) && a.tools.length > 0
          ? a.tools
          : (Array.isArray(a?.primary_tools) ? a.primary_tools : []);
        // Heuristic: ensure core build/search tools are present when task implies building
        const tset = new Set<string>(toolList);
        const taskLower = (task || '').toLowerCase();
        const roleLower = (a?.role || a?.name || '').toLowerCase();
        const needsBuild = /(build|create|implement|code|app|prototype|scaffold|cli|write\s+files|project|module|generate)/.test(taskLower)
          || /(dev|build|coder|engineer|developer|builder|creator|writer|file|operations)/.test(roleLower);
        if (needsBuild) {
          ['python_repl','file_write','file_read'].forEach(t => tset.add(t));
        }
        // Ensure research capability for research-like roles
        if (/(research|ingest|discover|explore|analy)/.test(roleLower)) {
          tset.add('web_search');
        }
        const toolsFinal = Array.from(tset);
        // Build a rich system prompt if not provided
        let sys = a?.system_prompt || '';
        if (!sys) {
          const instr = Array.isArray(a?.instructions) ? a.instructions.slice(0, 8) : [];
          const instrText = instr.length ? ('\n\nInstructions:\n- ' + instr.map((s: string) => (s || '').trim()).filter(Boolean).join('\n- ')) : '';
          const toolsText = toolsFinal.length ? ('\n\nAvailable tools: ' + toolsFinal.join(', ')) : '';
          sys = (
            `You are ${a?.role || a?.name || 'a specialized agent'}. ${a?.description || ''}`.trim() +
            instrText + toolsText +
            `\n\nGuidance:\n- Prefer using the available tools to produce tangible outputs.\n- If you need information, use web_search; to write or run code, use python_repl and file_write.\n- Always produce concrete artifacts or clear next actions.\n- If blocked, state blockers and what you need to proceed.\n`
          );
        }
        return {
          name: a?.name || a?.role || 'custom_agent',
          system_prompt: sys || 'You are a helpful agent.',
          tools: toolsFinal,
          description: a?.description || a?.role || '',
          model: a?.model || 'gpt-4o-mini',
          temperature: typeof a?.temperature === 'number' ? a.temperature : 0.7,
          max_tokens: typeof a?.max_tokens === 'number' ? a.max_tokens : 4000,
        };
      });

      // For continuation, Strands loads conversation automatically
      const requestBody = {
        task,
        session_id: sessionId,
        agents: mappedAgents,
        // Allow more handoffs so agents can collaborate meaningfully
        max_handoffs: 6,
        // Respect UI mode; for custom agents prefer sequential unless parallel requested
        execution_mode: (mappedAgents.length > 0 && !runParallel ? 'sequential' : executionMode),
        context: {
          swarm_config: {
            mode: executionMode,
            parallel: runParallel,
            // In strict mode, coordinator enforces baton; in autonomous keep limits permissive
            max_concurrent_agents: modeConfig.max_concurrent_agents,
            max_total_agents: modeConfig.max_total_agents,
            max_agent_runtime: modeConfig.max_agent_runtime
          }
        }
      } as any;

      console.log(`📤 Sending to ${endpoint}:`, requestBody);

      // Create abort controller for request
      abortControllerRef.current = new AbortController();

      // Make POST request to get SSE stream
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Check if response is SSE
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('text/event-stream')) {
        console.error('Response is not SSE, got:', contentType);
        throw new Error('Response is not SSE');
      }

      // Create a reader for the stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      // Process the stream
      let buffer = '';
      // Reset the ref for new request
      currentAgentContentRef.current = new Map<string, string>();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr.trim()) {
              try {
                const event = JSON.parse(jsonStr);
                console.log('📨 SSE Event:', event.type, event);
                
                // Debug logging for text generation events
                if (event.type === 'text_generation' || event.type === 'delta') {
                  const agent = event.agent || 'unknown';
                  const content = event.content || event.data?.chunk || event.data?.text || '';
                  console.log(`📝 Text from ${agent}:`, content);
                  console.log('Current accumulated content:', currentAgentContentRef.current.get(agent));
                }
                
                // Debug logging for agent completion
                if (event.type === 'agent_completed' || event.type === 'agent_done') {
                  const agent = event.agent || 'unknown';
                  console.log(`✅ Agent ${agent} completed`);
                  console.log('Final accumulated content:', currentAgentContentRef.current.get(agent));
                  console.log('Event content:', event.content);
                  console.log('Event data.output:', event.data?.output);
                }

                const pushTimeline = (type: string, extra: any = {}) => {
                  setTimeline(prev => [...prev, { type, ts: event.timestamp, agent: event.agent, ...extra }].slice(-500));
                };

                switch (event.type) {
                  case 'session_start':
                    console.log('🚀 Session started:', event.session_id);
                    if (event.session_id) {
                      fetchSharedState(event.session_id);
                    }
                    pushTimeline('session_start');
                    // reset dedupe for completions on new session
                    processedAgentFinalRef.current.clear();
                    break;

                  case 'agent_start':
                  case 'agent_started':
                    const startAgent = event.agent || 'Unknown';
                    setActiveAgents(prev => new Map(prev).set(startAgent, {
                      agent: startAgent,
                      status: 'thinking'
                    }));
                    currentAgentContentRef.current.set(startAgent, '');
                    // record start time for progress clocks
                    setAgentStartTs((prev: Map<string, number>) => { const n = new Map(prev); n.set(startAgent, Date.now()); return n; });
                    pushTimeline('agent_started');
                    break;

                  case 'delta':
                  case 'text_generation':
                    const deltaAgent = event.agent || 'coordinator';
                    const content = event.content || event.data?.chunk || event.data?.text || '';
                    
                    // Hide system-level informational text from user chat
                    if (deltaAgent === 'system') {
                      // Still consume but do not display/accumulate
                      break;
                    }
                    
                    // Initialize accumulator for this agent if it doesn't exist
                    if (!currentAgentContentRef.current.has(deltaAgent)) {
                      currentAgentContentRef.current.set(deltaAgent, '');
                      console.log(`🆕 Initializing content accumulator for agent: ${deltaAgent}`);
                    }
                    
                    if (content) {
                      pushTimeline('token', { preview: (content as string).slice(0, 40) });
                      // Update agent status to typing
                      setActiveAgents(prev => {
                        const updated = new Map(prev);
                        const current = updated.get(deltaAgent) || { agent: deltaAgent, status: 'idle' };
                        updated.set(deltaAgent, { ...current, status: 'typing' });
                        return updated;
                      });

                      // Accumulate content (respect pause buffer)
                      if (paused) {
                        setPausedBuffer(prev => {
                          const next = new Map(prev);
                          next.set(deltaAgent, (prev.get(deltaAgent) || '') + content);
                          return next;
                        });
                      } else {
                        const existingContent = currentAgentContentRef.current.get(deltaAgent) || '';
                        currentAgentContentRef.current.set(deltaAgent, existingContent + content);
                        setStreamingContent(new Map(currentAgentContentRef.current));
                      }
                    }
                    break;

                  case 'agent_done':
                  case 'agent_completed':
                    const doneAgent = event.agent || 'coordinator';
                    pushTimeline('agent_completed');
                    // Dedupe: only finalize once per agent per run
                    if (processedAgentFinalRef.current.has(doneAgent)) {
                      // Ensure we still clear any buffers
                      currentAgentContentRef.current.delete(doneAgent);
                      setStreamingContent(new Map(currentAgentContentRef.current));
                      setPausedBuffer(prev => { const n=new Map(prev); n.delete(doneAgent); return n; });
                      break;
                    }
                    processedAgentFinalRef.current.add(doneAgent);
                    if (doneAgent === 'system') {
                      // Don't create user-visible messages for system meta
                      currentAgentContentRef.current.delete(doneAgent);
                      setStreamingContent(new Map(currentAgentContentRef.current));
                      break;
                    }
                    
                    // Helper to detect truly blank/placeholder outputs
                    const isTrulyBlank = (txt?: string) => {
                      const t = (txt || '').trim();
                      if (!t) return true;
                      const lower = t.toLowerCase();
                      return lower === '[blank text]' || lower === '(no content)' || lower === '<blank>';
                    };

                    // Skip empty coordinator responses (they're just handoffs). Try fallback to delegated agent output.
                    const coordOutput = event.data?.output || event.content || '';
                    if (doneAgent === 'coordinator' && isTrulyBlank(coordOutput)) {
                      console.log('📝 Skipping empty coordinator response (handoff). Attempting fallback to delegated agent output.');
                      try {
                        if (sessionId) {
                          // Fetch latest shared state snapshot to find agent_outputs
                          const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/shared-state`);
                          if (res.ok) {
                            const data = await res.json();
                            const outputs = (data?.agent_outputs) || (data?.shared_context?.agent_outputs) || {};
                            const agentNames: string[] = Array.isArray(data?.agents) ? data.agents : Object.keys(outputs);

                            // Build candidate order: preferred handoff target first, then others excluding coordinator
                            const preferred = (lastHandoffTargetRef.current || '').trim();
                            const candidates: string[] = [];
                            if (preferred && !candidates.includes(preferred)) candidates.push(preferred);
                            for (const name of agentNames) {
                              if (name && name !== 'coordinator' && !candidates.includes(name)) candidates.push(name);
                            }

                            // Try to find the first non-duplicate, non-blank content
                            let inserted = false;
                            for (const name of candidates) {
                              const val = outputs?.[name];
                              if (typeof val !== 'string') continue;
                              const txt = val as string;
                              if (!txt || !txt.trim() || isTrulyBlank(txt)) continue;
                              // Avoid duplicate same-content message from same agent
                              let isDup = false;
                              // Check a small tail of messages for duplicates
                              // Using a closure on current state is tricky; rely on the latest messages array
                              const lastSameAgent = [...messages].reverse().find(m => m.role==='assistant' && m.agent===name);
                              if (lastSameAgent && (lastSameAgent.content || '').trim() === txt.trim()) {
                                console.log(`⚠️ Skipping duplicate fallback candidate from ${name}`);
                                isDup = true;
                              }
                              if (isDup) continue;
                              const newMessage: Message = {
                                id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                role: 'assistant',
                                content: txt,
                                agent: name,
                                timestamp: new Date().toISOString(),
                                isStreaming: false
                              };
                              setMessages(prev => {
                                const last = [...prev].reverse().find(m => m.role==='assistant' && m.agent===name);
                                if (last && last.content.trim() === txt.trim()) {
                                  console.log(`⚠️ Skipping duplicate fallback message from ${name}`);
                                  return prev;
                                }
                                console.log(`✅ Fallback: adding message from ${name} to UI:`, txt.substring(0, 100));
                                return [...prev, newMessage];
                              });
                              inserted = true;
                              break;
                            }
                            if (!inserted) {
                              console.log('⚠️ No suitable agent_outputs found for fallback.');
                            }
                          }
                        }
                      } catch (e) {
                        console.log('⚠️ Fallback to delegated agent output failed:', e);
                      }
                      // Cleanup streaming buffers for coordinator and exit
                      currentAgentContentRef.current.delete(doneAgent);
                      setStreamingContent(new Map(currentAgentContentRef.current));
                      setPausedBuffer(prev => { const n=new Map(prev); n.delete(doneAgent); return n; });
                      setActiveAgents(prev => {
                        const updated = new Map(prev);
                        updated.set(doneAgent, { agent: doneAgent, status: 'done' });
                        return updated;
                      });
                      if (sessionId) {
                        fetchSharedState(sessionId);
                      }
                      break;
                    }
                    const finalContent = event.content || event.data?.output || currentAgentContentRef.current.get(doneAgent) || '';
                    
                    console.log(`📦 Agent ${doneAgent} completed with content:`, finalContent);
                    console.log('Full event data:', event.data);
                    
                    if (finalContent.trim() && !isTrulyBlank(finalContent)) {
                      // Add final message
                      const newMessage: Message = {
                        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        role: 'assistant',
                        content: finalContent,
                        agent: doneAgent,
                        timestamp: new Date().toISOString(),
                        isStreaming: false
                      };
                      
                      // Avoid duplicate same-content message from same agent
                      setMessages(prev => {
                        const last = [...prev].reverse().find(m => m.role==='assistant' && m.agent===doneAgent);
                        if (last && last.content.trim() === finalContent.trim()) {
                          console.log(`⚠️ Skipping duplicate message from ${doneAgent}`);
                          return prev;
                        }
                        console.log(`✅ Adding message from ${doneAgent} to UI:`, finalContent.substring(0, 100));
                        return [...prev, newMessage];
                      });
                    }

                    // Clear streaming content for this agent
                    currentAgentContentRef.current.delete(doneAgent);
                    setStreamingContent(new Map(currentAgentContentRef.current));
                    setPausedBuffer(prev => {
                      const next = new Map(prev);
                      next.delete(doneAgent);
                      return next;
                    });
                    
                    // Update agent status
                    setActiveAgents(prev => {
                      const updated = new Map(prev);
                      updated.set(doneAgent, { agent: doneAgent, status: 'done' });
                      return updated;
                    });
                    if (sessionId) {
                      fetchSharedState(sessionId);
                    }
                    break;

                  case 'tool_call':
                    if (event.agent && event.data) {
                      const toolName = event.data.tool || 'unknown_tool';
                      const toolKey = `${event.agent}_${toolName}`;
                      const paramChunk = event.data.parameters || '';
                      
                      // Get or create accumulator for this tool
                      let toolAcc = accumulatingToolsRef.current.get(toolKey);
                      if (!toolAcc) {
                        toolAcc = {
                          agent: event.agent,
                          tool: toolName,
                          parameters: '',
                          messageId: `tool_${toolKey}_${Date.now()}`,
                          complete: false
                        };
                        accumulatingToolsRef.current.set(toolKey, toolAcc);
                      }
                      
                      // Accumulate parameters
                      toolAcc.parameters += paramChunk;
                      
                      // Check if parameters are complete (valid JSON)
                      let isComplete = false;
                      if (toolAcc.parameters.trim().startsWith('{') && 
                          toolAcc.parameters.trim().endsWith('}')) {
                        try {
                          JSON.parse(toolAcc.parameters);
                          isComplete = true;
                        } catch {
                          // Not yet valid JSON
                        }
                      }
                      
                      // Only create/update message when tool call is complete
                      if (isComplete && !toolAcc.complete) {
                        toolAcc.complete = true;
                        
                        pushTimeline('tool_call', { tool: toolName });
                        setToolCalls(prev => [...prev, {
                          agent: event.agent,
                          tool: toolName,
                          parameters: toolAcc.parameters,
                          timestamp: event.timestamp
                        }]);
                        
                        // Create single message for complete tool call
                        const wrapper = event.data.wrapper;
                        const header = wrapper && wrapper !== toolName ? `Tool: ${toolName} (via ${wrapper})` : `Tool: ${toolName}`;
                        let parsedParams: any;
                        try {
                          parsedParams = JSON.parse(toolAcc.parameters);
                        } catch {
                          parsedParams = toolAcc.parameters;
                        }
                        // Track last delegated agent for fallback rendering when coordinator output is blank
                        if (toolName === 'handoff_to_agent') {
                          const target = (parsedParams && (parsedParams.to_agent || parsedParams.target_agent || parsedParams.agent)) || null;
                          if (typeof target === 'string' && target.trim()) {
                            lastHandoffTargetRef.current = target.trim();
                            console.log('🧭 Recorded last handoff target:', lastHandoffTargetRef.current);
                          }
                        }
                        const paramsBlock = parsedParams ? `\n\nParameters:\n\n\`\`\`json\n${JSON.stringify(parsedParams, null, 2)}\n\`\`\`` : '';
                        
                        setMessages(prev => {
                          // Check if message already exists and update it
                          const existing = prev.find(m => m.id === toolAcc.messageId);
                          if (existing) {
                            return prev.map(m => 
                              m.id === toolAcc.messageId 
                                ? { ...m, content: `${header}${paramsBlock}` }
                                : m
                            );
                          } else {
                            return [...prev, {
                              id: toolAcc.messageId,
                              role: 'system',
                              content: `${header}${paramsBlock}`,
                              timestamp: new Date().toISOString()
                            } as any];
                          }
                        });
                        
                        // Clear accumulator after complete
                        accumulatingToolsRef.current.delete(toolKey);
                        
                        // Detect handoff_to_user and enqueue approval
                        if (toolName === 'handoff_to_user') {
                          const message = parsedParams?.message || 'Input required';
                          setApprovals(prev => [...prev, {
                            id: `handoff_${Date.now()}_${Math.random()}`,
                            type: 'handoff_to_user',
                            agent: event.agent,
                            message,
                            breakout: !!parsedParams?.breakout_of_loop,
                            ts: event.timestamp
                          }]);
                        }
                      }
                    }
                    break;

                  case 'tool_result':
                    if (event.agent && event.data) {
                      pushTimeline('tool_result', { tool: event.data.tool, ok: event.data.success });
                      setToolResults(prev => [...prev, {
                        agent: event.agent,
                        tool: event.data.tool,
                        success: event.data.success,
                        summary: event.data.summary,
                        results: event.data.results,
                        timestamp: event.timestamp
                      }]);
                      
                      // Skip creating message for empty or trivial results
                      const resultObj = event.data.result || event.data.error || {};
                      const raw = (() => { try { return JSON.stringify(resultObj, null, 2); } catch { return String(resultObj); } })();
                      
                      // Don't show tool_result messages if the output is empty or just "{}"
                      const isEmptyResult = raw === '{}' || raw === '""' || raw === 'null' || raw === '[]' || !raw || raw === '{\n}';
                      if (!isEmptyResult) {
                        // Only show tool result if there's meaningful output
                        const actual = event.data.tool || 'unknown_tool';
                        const ok = event.data.success !== false;
                        setMessages(prev => [...prev, {
                          id: `tool_result_${Date.now()}`,
                          role: 'system',
                          content: `${ok ? '✅' : '❌'} ${actual} ${ok ? 'completed' : 'failed'}\n\nRaw Output:\n\n\`\`\`json\n${raw}\n\`\`\``,
                          timestamp: new Date().toISOString()
                        } as any]);
                      }
                    }
                    break;

                  case 'artifact':
                    if (event.agent && event.data) {
                      setArtifacts(prev => [...prev, {
                        agent: event.agent,
                        name: event.data.name,
                        type: event.data.type,
                        language: event.data.language,
                        timestamp: event.timestamp
                      }]);
                    }
                    break;

                  case 'artifacts_created':
                    if (event.agent && event.data?.artifacts) {
                      const items = (event.data.artifacts || []).map((a: any) => ({
                        agent: event.agent,
                        name: a.name,
                        type: a.type,
                        language: a.language,
                        timestamp: event.timestamp
                      }));
                      setArtifacts(prev => [...prev, ...items]);
                    }
                    break;

                  case 'handoff':
                    pushTimeline('handoff', { from: event.from || event.data?.from, to: event.to || event.data?.to });
                    setHandoffs(prev => [...prev, {
                      from: event.from || event.data?.from,
                      to: event.to || event.data?.to,
                      reason: event.reason || event.data?.reason,
                      timestamp: event.timestamp
                    }]);
                    // Track last handoff target for fallback logic
                    try {
                      const dest = (event.to || event.data?.to || '').toString();
                      if (dest) {
                        lastHandoffTargetRef.current = dest;
                        console.log('🧭 Recorded last handoff target (event):', dest);
                      }
                    } catch {}
                    // Also surface a concise system message
                    setMessages(prev => [...prev, {
                      id: `handoff_${Date.now()}`,
                      role: 'system',
                      content: `Handoff: ${(event.from || event.data?.from || 'agent')} → ${(event.to || event.data?.to || 'agent')}`,
                      timestamp: new Date().toISOString()
                    } as any]);
                    break;

                  

                  case 'tool_approval_required':
                    if (event.agent && event.data) {
                      pushTimeline('approval_required', { tool: event.data.tool });
                      const id = event.data.approval_id || `approval_${Date.now()}`;
                      setApprovals(prev => [...prev, {
                        id,
                        type: 'tool_approval',
                        agent: event.agent,
                        tool: event.data.tool,
                        parameters: event.data.parameters || {},
                        ts: event.timestamp
                      }]);
                    }
                    break;

                  case 'execution_failed':
                  case 'session_complete':
                  case 'done':
                    if (event.type === 'execution_failed') {
                      console.log('❌ Execution failed event received:', event);
                    }
                    console.log('✅ Session complete');
                    // Finalize any remaining streaming content as assistant messages
                    if (currentAgentContentRef.current.size > 0) {
                      const now = Date.now();
                      const entries = Array.from(currentAgentContentRef.current.entries())
                        .filter(([agentName, content]) => agentName !== 'system' && (content || '').trim().length > 0);
                      const finalMsgs: Message[] = entries
                        .map(([agentName, content], idx) => ({
                          id: `msg_${now}_${idx}_${Math.random().toString(36).substr(2, 6)}`,
                          role: 'assistant',
                          content: content,
                          agent: agentName || 'assistant',
                          timestamp: new Date().toISOString(),
                          isStreaming: false
                        }));
                      if (finalMsgs.length > 0) {
                        setMessages(prev => [...prev, ...finalMsgs]);
                      }
                    }
                    // Clear streaming state/maps
                    currentAgentContentRef.current.clear();
                    setStreamingContent(new Map());
                    setIsLoading(false);
                    setActiveAgents(new Map());

                    // Reconcile: If backend only completed coordinator, surface any non-empty agent_outputs
                    try {
                      if (sessionId) {
                        const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/shared-state`);
                        if (res.ok) {
                          const data = await res.json();
                          const outputs = (data?.agent_outputs) || (data?.shared_context?.agent_outputs) || {};
                          const agentNames: string[] = Array.isArray(data?.agents) ? data.agents : Object.keys(outputs);
                          const placeholders = new Set(['[blank text]', '(no content)', '<blank>']);
                          const candidates = agentNames.filter(n => n && n !== 'coordinator');
                          for (const name of candidates) {
                            const txt = (outputs?.[name] || '') as string;
                            if (typeof txt !== 'string') continue;
                            const t = txt.trim();
                            if (!t || placeholders.has(t.toLowerCase())) continue;
                            // Append if not already present for this agent/content
                            setMessages(prev => {
                              const existing = [...prev].reverse().find(m => m.role==='assistant' && m.agent===name && (m.content||'').trim() === t);
                              if (existing) return prev;
                              console.log(`✅ Reconcile: adding message from ${name} to UI:`, t.substring(0, 100));
                              return [...prev, {
                                id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                role: 'assistant',
                                content: txt,
                                agent: name,
                                timestamp: new Date().toISOString(),
                                isStreaming: false
                              }];
                            });
                          }
                        }
                      }
                    } catch (e) {
                      console.log('⚠️ Reconcile from shared-state failed:', e);
                    }
                    break;

                  case 'error':
                    console.error('❌ Error:', event.error);
                    setIsLoading(false);
                    setActiveAgents(new Map());
                    break;

                  case 'keepalive':
                    // Ignore keepalive events
                    break;
                  case 'execution_stopped':
                  case 'done':
                  case 'error':
                    // Terminal states: clear stopping/loading flags
                    setIsStopping(false);
                    setIsLoading(false);
                    pushTimeline(event.type || 'terminal');
                    break;

                  case 'agent.needed':
                    // Dynamic agent request; record in timeline
                    pushTimeline('agent_needed', { requested: event?.data?.role, by: event?.agent });
                    break;
                  case 'handoff.requested':
                  case 'handoff':
                    pushTimeline('handoff', { from: event?.data?.from, to: event?.data?.to });
                    // Track last handoff target for fallback logic
                    try {
                      const dest = (event?.data?.to || '').toString();
                      if (dest) {
                        lastHandoffTargetRef.current = dest;
                        console.log('🧭 Recorded last handoff target (event):', dest);
                      }
                    } catch {}
                    setMessages(prev => [...prev, {
                      id: `handoff_${Date.now()}`,
                      role: 'system',
                      content: `Handoff: ${(event?.data?.from || 'agent')} → ${(event?.data?.to || 'agent')}`,
                      timestamp: new Date().toISOString()
                    } as any]);
                    break;
                  case 'task.progress':
                    pushTimeline('task_progress', { status: event?.data?.status || 'progress' });
                    break;
                  case 'task.complete':
                    pushTimeline('task_complete');
                    break;
                  default:
                    // Quietly record unknown events for debugging without spamming console
                    pushTimeline(event.type || 'unknown_event');
                }
              } catch (e) {
                console.error('Failed to parse SSE data:', e, jsonStr);
              }
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('❌ SSE Stream error:', error);
        setMessages(prev => [...prev, {
          id: `error_${Date.now()}`,
          role: 'system',
          content: `Error: ${error.message}`,
          timestamp: new Date().toISOString()
        }]);
      }
    } finally {
      setIsLoading(false);
      setActiveAgents(new Map());
      setStreamingContent(new Map());
    }
  }, [sessionId, messages, executionMode, modeConfig, paused, pausedBuffer, fetchSharedState]);

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || isLoading || !sessionId) return;

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    const task = inputValue.trim();
    setInputValue('');

    // CRITICAL: Determine if this is the first message correctly
    // Only the VERY FIRST user message should use /start/sse
    const isFirstMessage = messages.filter(m => m.role === 'user').length === 0;
    
    console.log(`📝 Sending message. First message? ${isFirstMessage}. Total messages: ${messages.length}`);
    
    // Start SSE stream
    await startSSEStream(task, isFirstMessage);
  }, [inputValue, isLoading, sessionId, messages, startSSEStream]);

  const handleStop = useCallback(() => {
    // Prefer graceful stop: ask server to cancel first
    if (sessionId) {
      fetch(`${API_BASE_URL}/api/v1/streaming/stop/${sessionId}`, { method: 'POST' })
        .catch(() => {});
    }
    // Give server a brief moment to end SSE, then abort client read if still running
    setTimeout(() => {
      if (abortControllerRef.current) {
        try { abortControllerRef.current.abort(); } catch {}
        abortControllerRef.current = null;
      }
    }, 300);
    setIsStopping(true);
    // keep isLoading true until we receive terminal event or stream ends
    setActiveAgents(new Map());
    setStreamingContent(new Map());
  }, [sessionId]);

  const handleEmergencyStop = useCallback(() => {
    if (sessionId) {
      // Fire-and-forget emergency stop; return immediately
      fetch(`${API_BASE_URL}/api/v1/streaming/emergency-stop/${sessionId}`, { method: 'POST', keepalive: true })
        .catch(() => {
          // Try normal stop as fallback
          fetch(`${API_BASE_URL}/api/v1/streaming/stop/${sessionId}`, { method: 'POST', keepalive: true }).catch(() => {});
        });
      // Abort SSE immediately
      if (abortControllerRef.current) {
        try { abortControllerRef.current.abort(); } catch {}
        abortControllerRef.current = null;
      }
    }
    setIsStopping(true);
    setActiveAgents(new Map());
    setStreamingContent(new Map());
  }, [sessionId]);

  const handlePauseResume = useCallback(() => {
    if (!paused) {
      // Going to pause: keep collecting into pausedBuffer
      setPaused(true);
    } else {
      // Resuming: flush pausedBuffer into visible streamingContent
      setPaused(false);
      setStreamingContent(prev => {
        const next = new Map(prev);
        pausedBuffer.forEach((v, k) => {
          next.set(k, (next.get(k) || '') + v);
        });
        return next;
      });
      setPausedBuffer(new Map());
    }
  }, [paused, pausedBuffer]);

  const handleSetGoal = useCallback(async () => {
    if (!sessionId || !goalDraft.trim()) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/shared-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_goal: goalDraft.trim() })
      });
      if (res.ok) {
        setGoalDraft('');
        fetchSharedState(sessionId);
      }
    } catch (e) {}
  }, [sessionId, goalDraft, fetchSharedState]);

  // Create new session
  const createNewSession = useCallback(() => {
    // Save current session first if it has messages
    if (messages.length > 0 && sessionId) {
      const currentSession: SessionData = {
        id: sessionId,
        title: messages[0]?.content?.slice(0, 50) || 'New Chat',
        messages: messages,
        timestamp: new Date().toISOString(),
        lastMessage: messages[messages.length - 1]?.content?.slice(0, 100)
      };
      
      // Get fresh history from localStorage
      const storedHistory = localStorage.getItem('swarm_session_history');
      let existingHistory: SessionData[] = [];
      if (storedHistory) {
        try {
          existingHistory = JSON.parse(storedHistory);
        } catch (e) {
          console.error('Failed to parse session history:', e);
        }
      }
      
      const updatedHistory = existingHistory.filter(s => s.id !== sessionId);
      updatedHistory.unshift(currentSession);
      const trimmedHistory = updatedHistory.slice(0, 50);
      localStorage.setItem('swarm_session_history', JSON.stringify(trimmedHistory));
      setSessionHistory(trimmedHistory);
    }
    
    // Stop any ongoing processes
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Clear all state
    setMessages([]);
    setStreamingContent(new Map());
    setActiveAgents(new Map());
    setToolCalls([]);
    setToolResults([]);
    setArtifacts([]);
    setHandoffs([]);
    setSharedState(null);
    setTimeline([]);
    setApprovals([]);
    setIsLoading(false);
    setGoalDraft('');
    setPaused(false);
    setPausedBuffer(new Map());
    
    // Create new session ID
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setSessionId(newSessionId);
    localStorage.setItem('swarm_current_session_id', newSessionId);
    console.log('🆕 New session created:', newSessionId);
  }, [messages, sessionId]);

  // Load a specific session
  const loadSession = useCallback((sessionIdToLoad: string) => {
    // Save current session before switching
    if (messages.length > 0 && sessionId && sessionId !== sessionIdToLoad) {
      saveCurrentSession();
    }
    
    // Find session in history
    const session = sessionHistory.find(s => s.id === sessionIdToLoad);
    
    if (session) {
      // Load session data
      setSessionId(session.id);
      setMessages(session.messages);
      localStorage.setItem('swarm_current_session_id', session.id);
      fetchSharedState(session.id);
      
      // Clear other state
      setStreamingContent(new Map());
      setActiveAgents(new Map());
      setToolCalls([]);
      setToolResults([]);
      setArtifacts([]);
      setHandoffs([]);
      setTimeline([]);
      setApprovals([]);
      setIsLoading(false);
      
      console.log('📂 Loaded session:', session.id);
    } else {
      // Session not found, check if it's current session
      if (sessionIdToLoad === sessionId) {
        // Already loaded
        return;
      }
      
      // Try to fetch from backend or create new
      setSessionId(sessionIdToLoad);
      localStorage.setItem('swarm_current_session_id', sessionIdToLoad);
      fetchSharedState(sessionIdToLoad);
    }
  }, [sessionHistory, sessionId, messages, saveCurrentSession, fetchSharedState]);

  // Delete a session
  const deleteSession = useCallback((sessionIdToDelete: string) => {
    const updatedHistory = sessionHistory.filter(s => s.id !== sessionIdToDelete);
    setSessionHistory(updatedHistory);
    localStorage.setItem('swarm_session_history', JSON.stringify(updatedHistory));
    
    // If deleting current session, create new one
    if (sessionIdToDelete === sessionId) {
      // Clear state and create new session
      setMessages([]);
      setStreamingContent(new Map());
      setActiveAgents(new Map());
      setToolCalls([]);
      setToolResults([]);
      setArtifacts([]);
      setHandoffs([]);
      setSharedState(null);
      setTimeline([]);
      setApprovals([]);
      setIsLoading(false);
      setGoalDraft('');
      setPaused(false);
      setPausedBuffer(new Map());
      
      const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setSessionId(newSessionId);
      localStorage.setItem('swarm_current_session_id', newSessionId);
    }
  }, [sessionHistory, sessionId]);

  // Rename a session
  const renameSession = useCallback((sessionIdToRename: string, newTitle: string) => {
    const updatedHistory = sessionHistory.map(s => 
      s.id === sessionIdToRename ? { ...s, title: newTitle } : s
    );
    setSessionHistory(updatedHistory);
    localStorage.setItem('swarm_session_history', JSON.stringify(updatedHistory));
    setEditingSessionId(null);
    setEditingTitle('');
  }, [sessionHistory]);

  // Alias for backwards compatibility
  const handleReset = createNewSession;

  const allAgents = Array.from(new Set([
    ...(sharedState?.agents || []),
    ...Array.from(activeAgents.keys()),
    ...Array.from(streamingContent.keys()),
    ...Object.keys(sharedState?.agent_outputs || {})
  ])).sort();

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      {/* Modern Sidebar */}
      <motion.div 
        className={`${sidebarCollapsed ? 'w-16' : 'w-72'} bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-all duration-300 shadow-xl flex-shrink-0`}
        initial={{ x: -320 }}
        animate={{ x: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        style={{ maxWidth: sidebarCollapsed ? '64px' : '288px' }}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="mb-3">
            <HomeButton variant={sidebarCollapsed ? 'icon' : 'both'} />
          </div>
          <div className="flex items-center justify-between">
            <motion.div 
              className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center' : ''}`}
              whileHover={{ scale: 1.02 }}
            >
              <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              {!sidebarCollapsed && (
                <div>
                  <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    Agent Swarm
                  </h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Multi-Agent Orchestration</p>
                </div>
              )}
            </motion.div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1"
            >
              <ChevronRight className={`h-4 w-4 transition-transform ${sidebarCollapsed ? '' : 'rotate-180'}`} />
            </Button>
          </div>
        </div>

        {/* New Chat Button */}
        {!sidebarCollapsed && (
          <div className="p-3">
            <Button
              onClick={createNewSession}
              className="w-full justify-start gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
            >
              <Plus className="h-4 w-4" />
              New Chat
            </Button>
          </div>
        )}

        {/* Session History */}
        {!sidebarCollapsed && (
          <ScrollArea className="flex-1 px-3">
            <div className="space-y-1 py-2">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-2 mb-2 flex items-center justify-between">
                <span>RECENT CHATS</span>
                <History className="h-3 w-3" />
              </div>
              {sessionHistory.length === 0 ? (
                <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
                  No chat history yet
                </div>
              ) : (
                sessionHistory.map((session) => (
                  <div
                    key={session.id}
                    className={`group relative flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                      session.id === sessionId
                        ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                    onClick={() => loadSession(session.id)}
                  >
                    <FileText className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      {editingSessionId === session.id ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Input
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                renameSession(session.id, editingTitle);
                              }
                            }}
                            className="h-6 text-xs"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => renameSession(session.id, editingTitle)}
                          >
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => {
                              setEditingSessionId(null);
                              setEditingTitle('');
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="text-sm font-medium truncate">
                            {session.title}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {new Date(session.timestamp).toLocaleDateString()}
                          </div>
                        </>
                      )}
                    </div>
                    {!editingSessionId && (
                      <div className="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingSessionId(session.id);
                            setEditingTitle(session.title);
                          }}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('Delete this chat?')) {
                              deleteSession(session.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        )}

        {/* Current Session Info */}
        {!sidebarCollapsed && sessionId && (
          <div className="p-3 border-t border-gray-200 dark:border-gray-800">
            <Card className="p-2 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-1">
                <Database className="h-3 w-3 text-blue-600" />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Current Session</span>
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                <div>Messages: {messages.length}</div>
                <div>Agents: {allAgents.length}</div>
              </div>
            </Card>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-col gap-1 p-2 border-t border-gray-200 dark:border-gray-800">
          <Button
            variant={activeTab === 'chat' ? 'default' : 'ghost'}
            className={`justify-start gap-3 ${sidebarCollapsed ? 'px-0 justify-center' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <MessageSquare className="h-4 w-4" />
            {!sidebarCollapsed && <span>Conversation</span>}
          </Button>
          <Button
            variant={activeTab === 'agents' ? 'default' : 'ghost'}
            className={`justify-start gap-3 ${sidebarCollapsed ? 'px-0 justify-center' : ''}`}
            onClick={() => setActiveTab('agents')}
          >
            <Users className="h-4 w-4" />
            {!sidebarCollapsed && <span>Agents</span>}
          </Button>
          <Button
            variant={activeTab === 'timeline' ? 'default' : 'ghost'}
            className={`justify-start gap-3 ${sidebarCollapsed ? 'px-0 justify-center' : ''}`}
            onClick={() => setActiveTab('timeline')}
          >
            <Activity className="h-4 w-4" />
            {!sidebarCollapsed && <span>Timeline</span>}
          </Button>
        </div>


        {/* Sidebar Footer - Controls */}
        <div className={`p-3 border-t border-gray-200 dark:border-gray-800 space-y-2`}>
          {!sidebarCollapsed && (
            <>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={isLoading ? handleStop : createNewSession}
                >
                  {isLoading ? (
                    <>
                      <StopCircle className="h-4 w-4 mr-1" />
                      Stop
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Reset
                    </>
                  )}
                </Button>
                {(isLoading || isStopping) && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleEmergencyStop}
                    title="Force stop immediately"
                  >
                    <StopCircle className="h-4 w-4 mr-1" />
                    Force Stop
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowModeConfig(true)}
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Execution Mode Selector */}
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${
                  executionMode === 'event_driven' ? 'bg-green-100 dark:bg-green-900/30' :
                  executionMode === 'turn_based' ? 'bg-blue-100 dark:bg-blue-900/30' :
                  'bg-purple-100 dark:bg-purple-900/30'
                }`}>
                  {executionMode === 'event_driven' ? <Zap className="h-3 w-3 text-green-600" /> :
                   executionMode === 'turn_based' ? <Shield className="h-3 w-3 text-blue-600" /> :
                   <Gauge className="h-3 w-3 text-purple-600" />}
                </div>
                <select
                  value={executionMode}
                  onChange={e => setExecutionMode(e.target.value as any)}
                  className="flex-1 text-xs bg-transparent border rounded-lg px-2 py-1"
                >
                  <option value="event_driven">Autonomous</option>
                  <option value="turn_based">Strict</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Header Bar */}
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-3 shadow-sm">
          <div className="flex items-center justify-between min-w-0">
            <div className="flex items-center gap-4 min-w-0">
              {/* Status Pills */}
              <div className="flex items-center gap-2">
                <div className="px-3 py-1.5 bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-full flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {activeAgents.size} Active
                  </span>
                </div>
                <div className="px-3 py-1.5 bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 rounded-full flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {messages.filter(m => m.role === 'assistant').length} Responses
                  </span>
                </div>
                <div className="px-3 py-1.5 bg-gradient-to-r from-yellow-100 to-orange-100 dark:from-yellow-900/30 dark:to-orange-900/30 rounded-full flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-yellow-600" />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {handoffs.length} Handoffs
                  </span>
                </div>
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => navigate('/swarm/tools')} title="Tools Hub">
                Tools
              </Button>
              <Button size="sm" variant="ghost" onClick={() => navigate('/orchestrator/config')} title="Configure Agents">
                <Brain className="h-4 w-4 mr-1" /> Configure Agents
              </Button>
              <Button
                size="sm"
                variant="outline"
                title="Export session as ZIP (HTML report + artifacts)"
                onClick={async () => {
                  try {
                    if (!sessionId) return;
                    const res = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}/export`);
                    if (!res.ok) throw new Error(`Export failed: ${res.status}`);
                    const blob = await res.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `session_${sessionId}.zip`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    window.URL.revokeObjectURL(url);
                  } catch (e) {
                    console.error('Export error', e);
                    alert('Export failed');
                  }
                }}
              >
                Export
              </Button>
              {isLoading && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePauseResume}
                >
                  {paused ? <Play className="h-4 w-4 mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
                  {paused ? 'Resume' : 'Pause'}
                </Button>
              )}
              
              {/* View Mode Toggle */}
              {activeTab === 'agents' && (
                <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    size="sm"
                    className="px-2 py-1"
                    onClick={() => setViewMode('grid')}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    className="px-2 py-1"
                    onClick={() => setViewMode('list')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Goal Setting */}
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-gray-500" />
                <Input
                  value={goalDraft}
                  onChange={(e: any) => setGoalDraft(e.target.value)}
                  placeholder="Set goal..."
                  className="w-48 h-8 text-sm"
                />
                <Button size="sm" onClick={handleSetGoal} disabled={!goalDraft.trim()}>
                  Set
                </Button>
              </div>
            </div>
          </div>

          {/* Active Agents Bar */}
          {activeAgents.size > 0 && (
            <div className="mt-3 overflow-x-auto max-w-full overscroll-x-contain">
              <motion.div 
                className="flex items-center gap-2 pb-2 min-w-max"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {Array.from(activeAgents.values()).map(agent => {
                  const meta = roleFor(agent.agent);
                  return (
                    <motion.div
                      key={agent.agent}
                      className={`flex items-center gap-2 px-2 py-1 ${meta.bg} rounded-md text-xs whitespace-nowrap`}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      whileHover={{ scale: 1.02 }}
                    >
                      <div className={`h-2 w-2 rounded-full ${
                        agent.status === 'thinking' ? 'bg-amber-500 animate-pulse' :
                        agent.status === 'typing' ? 'bg-blue-500 animate-pulse' :
                        agent.status === 'done' ? 'bg-green-500' :
                        'bg-gray-400'
                      }`} />
                      <span className={`font-medium ${meta.color}`}>{agent.agent}</span>
                      <span className="text-[10px] text-gray-600 dark:text-gray-400">
                        {agent.status === 'thinking' ? 'analyzing' :
                         agent.status === 'typing' ? 'responding' :
                         agent.status === 'done' ? 'completed' : ''}
                      </span>
                    </motion.div>
                  );
                })}
              </motion.div>
            </div>
          )}
        </div>

        {/* Orchestrator UI moved to dedicated route (/orchestrator/config) */}
        {/* Main Content by Tab */}
        <ScrollArea className="flex-1 overflow-x-hidden" ref={scrollAreaRef}>
          <div className="w-full">
            {/* Chat Tab */}
            {activeTab === 'chat' && (
              <div className="w-full max-w-4xl mx-auto px-4 py-6">
                {messages.length === 0 && !isLoading && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card className="p-8 text-center bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-blue-200 dark:border-blue-800">
                      <div className="flex flex-col items-center">
                        <div className="p-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-xl mb-4">
                          <Sparkles className="h-10 w-10 text-white" />
                        </div>
                        <h3 className="text-2xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                          Welcome to Swarm Intelligence
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 max-w-md">
                          Start a conversation and watch multiple AI agents collaborate to solve your problems
                        </p>
                      </div>
                    </Card>
                  </motion.div>
                )}

                <AnimatePresence initial={false}>
                  {messages.map(message => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.3 }}
                      className="mb-4"
                    >
                      <div className={`flex w-full ${
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}>
                        <Card className={`p-4 max-w-[min(70%,42rem)] ${
                        message.role === 'user' 
                          ? 'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800' 
                          : message.role === 'system'
                          ? 'bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border-red-200 dark:border-red-800'
                          : 'bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow'
                      }`}>
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-xl ${
                            message.role === 'user' 
                              ? 'bg-gradient-to-br from-blue-500 to-indigo-600' 
                              : message.role === 'system'
                              ? 'bg-gradient-to-br from-red-500 to-orange-600'
                              : roleFor(message.agent || '').bg
                          }`}>
                            {message.role === 'user' ? (
                              <User className="h-4 w-4 text-white" />
                            ) : message.role === 'system' ? (
                              <AlertCircle className="h-4 w-4 text-white" />
                            ) : (
                              <span className="text-sm">{roleFor(message.agent || '').emoji}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            {message.agent && (
                              <div className={`text-xs font-semibold mb-1 ${roleFor(message.agent).color}`}>
                                {message.agent}
                              </div>
                            )}
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              <ReactMarkdown
                                components={{
                                  code({ node, className, children, ...props }: any) {
                                    const match = /language-(\w+)/.exec(className || '');
                                    const inline = !match;
                                    return !inline && match ? (
                                      <SyntaxHighlighter
                                        style={vscDarkPlus as any}
                                        language={match[1]}
                                        PreTag="div"
                                        {...props}
                                      >
                                        {String(children).replace(/\n$/, '')}
                                      </SyntaxHighlighter>
                                    ) : (
                                      <code className={className} {...props}>
                                        {children}
                                      </code>
                                    );
                                  }
                                }}
                              >
                                {message.content}
                              </ReactMarkdown>
                            </div>
                            <div className="text-xs text-gray-400 mt-2">
                              {new Date(message.timestamp).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                        </Card>
                      </div>
                    </motion.div>
                  ))}

                  {/* Streaming content */}
                  {Array.from(streamingContent.entries())
                    .filter(([agent, content]) => agent !== 'system' && content.trim().length > 0)
                    .map(([agent, content]) => {
                      const meta = roleFor(agent);
                      return (
                        <motion.div
                          key={`streaming_${agent}`}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3 }}
                          className="mb-4"
                        >
                          <div className="flex w-full justify-start">
                            <Card className={`max-w-[min(70%,42rem)] ${meta.bg} border-2 ${meta.color.replace('text', 'border')}`}>
                            <div className="p-4">
                              <div className="flex items-start gap-3">
                                <div className={`p-2 rounded-xl ${meta.bg} animate-pulse`}>
                                  <span className="text-sm">{meta.emoji}</span>
                                </div>
                                <div className="flex-1">
                                  <div className={`text-xs font-semibold mb-1 ${meta.color}`}>
                                    {agent} (streaming...)
                                  </div>
                                  <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                                    <ReactMarkdown>{content}</ReactMarkdown>
                                  </div>
                                </div>
                              </div>
                            </div>
                            </Card>
                          </div>
                        </motion.div>
                      );
                    })}
                </AnimatePresence>

                {/* Loading Indicator */}
                {isLoading && streamingContent.size === 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center justify-center py-8"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                      <span className="text-sm text-gray-500">Initializing swarm agents...</span>
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {/* Agents Tab */}
            {activeTab === 'agents' && (
              <div className="max-w-6xl mx-auto px-4 py-6">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold mb-2">Agent Dashboard</h2>
                  <p className="text-gray-600 dark:text-gray-400">Monitor and manage your swarm agents</p>
                </div>

                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {allAgents.map((agentName) => {
                      const status = (activeAgents.get(agentName)?.status) || 
                        (streamingContent.get(agentName) ? 'typing' : 
                        (sharedState?.agent_outputs?.[agentName] ? 'done' : 'idle'));
                      const meta = roleFor(agentName);
                      const calls = toolCalls.filter(t => t.agent === agentName).length;
                      const results = toolResults.filter(t => t.agent === agentName).length;
                      const arts = artifacts.filter(a => a.agent === agentName).length;
                      
                      return (
                        <motion.div
                          key={agentName}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Card className={`p-4 cursor-pointer ${meta.bg} hover:shadow-lg transition-all`}
                                onClick={() => setDetailAgent(detailAgent === agentName ? null : agentName)}>
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="relative">
                                  <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-white dark:bg-gray-800 shadow-sm">
                                    <span className="text-xl">{meta.emoji}</span>
                                  </div>
                                  <div className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white dark:border-gray-900 ${
                                    status === 'typing' ? 'bg-blue-500 animate-pulse' :
                                    status === 'done' ? 'bg-green-500' :
                                    status === 'thinking' ? 'bg-amber-500 animate-pulse' :
                                    'bg-gray-400'
                                  }`} />
                                </div>
                                <div>
                                  <div className={`font-bold text-base ${meta.color}`}>
                                    {agentName}
                                  </div>
                                  <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                                    {meta.role}
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-700 dark:text-gray-300 font-medium">Status</span>
                                <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${
                                  status === 'typing' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                                  status === 'done' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                                  status === 'thinking' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                                  'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                }`}>
                                  {status === 'typing' ? 'Responding' :
                                   status === 'done' ? 'Completed' :
                                   status === 'thinking' ? 'Analyzing' :
                                   'Idle'}
                                </span>
                              </div>
                              
                              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                                <div className="text-center">
                                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{calls}</div>
                                  <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">Calls</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{results}</div>
                                  <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">Results</div>
                                </div>
                                <div className="text-center">
                                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{arts}</div>
                                  <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">Artifacts</div>
                                </div>
                              </div>
                            </div>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </div>
                ) : (
                  <AgentPipeline
                    agents={allAgents}
                    statusMap={activeAgents as any}
                    handoffs={handoffs}
                    stats={{
                      calls: toolCalls.reduce((acc: any, t: any) => (acc[t.agent]=(acc[t.agent]||0)+1, acc), {}),
                      results: toolResults.reduce((acc: any, t: any) => (acc[t.agent]=(acc[t.agent]||0)+1, acc), {}),
                      artifacts: artifacts.reduce((acc: any, a: any) => (acc[a.agent]=(acc[a.agent]||0)+1, acc), {}),
                    }}
                    startTsMap={agentStartTs}
                    timeoutSecMap={agentTimeouts}
                    onStopAgent={async (agent: string) => {
                      if (!sessionId) return;
                      try {
                        await fetch(`${API_BASE_URL}/api/v1/streaming/stop-agent/${sessionId}/${encodeURIComponent(agent)}`, { method: 'POST' });
                      } catch {}
                    }}
                    onSetTimeout={async (agent: string, seconds: number) => {
                      setAgentTimeouts((prev: Map<string, number>) => { const n = new Map(prev); n.set(agent, seconds); return n; });
                      if (!sessionId) return;
                      try {
                        await fetch(`${API_BASE_URL}/api/v1/streaming/timeout-agent/${sessionId}/${encodeURIComponent(agent)}`, {
                          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds })
                        });
                      } catch {}
                    }}
                  />
                )}
              </div>
            )}

            {/* Timeline Tab */}
            {activeTab === 'timeline' && (
              <div className="max-w-4xl mx-auto px-4 py-6">
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">Event Timeline</h2>
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-gray-500" />
                      <div className="flex items-center gap-2 text-xs">
                        {Object.entries(timelineFilters).map(([key, value]) => (
                          <label key={key} className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={value}
                              onChange={e => setTimelineFilters({ ...timelineFilters, [key]: e.target.checked })}
                              className="rounded"
                            />
                            <span className="capitalize">{key.replace('_', ' ')}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <ScrollArea className="h-[600px]">
                    <div className="space-y-2">
                      {timeline
                        .filter(e => (timelineFilters as any)[e.type] !== false)
                        .slice(-500)
                        .reverse()
                        .map((e, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.01 }}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            <Clock className="h-3 w-3 text-gray-400" />
                            <span className="font-mono text-xs text-gray-500">
                              {new Date(e.ts || Date.now()).toLocaleTimeString()}
                            </span>
                            <span className="text-blue-600 dark:text-blue-400 font-medium">
                              {e.agent || 'system'}
                            </span>
                            <ChevronRight className="h-3 w-3 text-gray-400" />
                            <span className="font-medium">{e.type}</span>
                            {e.preview && (
                              <span className="text-gray-500 text-sm truncate max-w-xs">
                                "{e.preview}"
                              </span>
                            )}
                            {e.tool && (
                              <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                                {e.tool}
                              </span>
                            )}
                          </motion.div>
                        ))}
                    </div>
                  </ScrollArea>
                </Card>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Scroll to Bottom Button */}
        <AnimatePresence>
          {showScrollButton && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={scrollToBottom}
              className="absolute bottom-24 right-8 z-10 p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-colors"
              title="Scroll to bottom"
            >
              <ChevronDown className="h-5 w-5" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Collapsible Tools Bar */}
        <div className="border-t bg-white dark:bg-gray-900 px-4 py-2">
          <div className="max-w-4xl mx-auto">
            <button
              className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
              onClick={() => setShowToolsBar(s => !s)}
            >
              {showToolsBar ? 'Hide Tools' : `Show Tools (${toolCalls.length + toolResults.length})`}
            </button>
            {showToolsBar && (
              <div className="mt-2 max-h-40 overflow-y-auto text-xs space-y-2">
                {[...toolCalls.slice(-10).map(c => ({ type: 'call', ...c })), ...toolResults.slice(-10).map(r => ({ type: 'result', ...r }))]
                  .sort((a, b) => (new Date(a.timestamp || 0).getTime()) - (new Date(b.timestamp || 0).getTime()))
                  .map((item, idx) => (
                    <div key={idx} className="p-2 rounded border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="mr-2">{item.type === 'call' ? '🔧' : (item.success !== false ? '✅' : '❌')}</span>
                          <strong>{item.tool}</strong>
                          {item.agent ? <span className="ml-2 text-gray-500">(agent: {item.agent})</span> : null}
                        </div>
                        <span className="text-gray-400">{new Date(item.timestamp || Date.now()).toLocaleTimeString()}</span>
                      </div>
                      {item.parameters && (
                        <details className="mt-1">
                          <summary className="cursor-pointer">Parameters</summary>
                          <pre className="mt-1 bg-black/5 dark:bg-black/30 p-2 rounded border border-gray-200 dark:border-gray-700 overflow-auto">{JSON.stringify(item.parameters, null, 2)}</pre>
                        </details>
                      )}
                      {item.type === 'result' && (item.results || item.summary) && (
                        <details className="mt-1">
                          <summary className="cursor-pointer">Result</summary>
                          <pre className="mt-1 bg-black/5 dark:bg-black/30 p-2 rounded border border-gray-200 dark:border-gray-700 overflow-auto">{JSON.stringify(item.results || item.summary, null, 2)}</pre>
                        </details>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="border-t bg-white dark:bg-gray-900 p-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-3">
              <Input
                value={inputValue}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
                onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                placeholder="Ask your swarm anything..."
                disabled={isLoading}
                className="flex-1 h-12 px-4 text-base"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isLoading}
                className="h-12 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>

          {/* Orchestrator preview bar removed to reduce confusion */}
        </div>

        {/* In-depth editor moved to /orchestrator/config */}
      </div>

      {/* Agent Detail Modal */}
      <AnimatePresence>
        {detailAgent && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60" onClick={() => setDetailAgent(null)} />
            <motion.div
              className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              <div className="sticky top-0 bg-white dark:bg-gray-900 p-6 border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-xl ${roleFor(detailAgent).bg}`}>
                      <span className="text-2xl">{roleFor(detailAgent).emoji}</span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">{detailAgent}</h3>
                      <p className="text-sm text-gray-500">{roleFor(detailAgent).role}</p>
                    </div>
                  </div>
                  <Button variant="ghost" onClick={() => setDetailAgent(null)}>
                    Close
                  </Button>
                </div>
              </div>
              
              <div className="p-6 space-y-4">
                {streamingContent.get(detailAgent) && (
                  <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                    <div className="font-semibold mb-3 text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      Live Output
                    </div>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown
                        components={{
                          code({ node, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '');
                            const inline = !match;
                            return !inline && match ? (
                              <SyntaxHighlighter
                                style={vscDarkPlus as any}
                                language={match[1]}
                                PreTag="div"
                                {...props}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            ) : (
                              <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-sm" {...props}>
                                {children}
                              </code>
                            );
                          }
                        }}
                      >
                        {streamingContent.get(detailAgent) || ''}
                      </ReactMarkdown>
                    </div>
                  </Card>
                )}
                
                {sharedState?.agent_outputs?.[detailAgent] && (
                  <Card className="p-4 bg-gray-50 dark:bg-gray-800/50">
                    <div className="font-semibold mb-3 text-gray-900 dark:text-gray-100">Latest Output</div>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown
                        components={{
                          code({ node, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '');
                            const inline = !match;
                            return !inline && match ? (
                              <SyntaxHighlighter
                                style={vscDarkPlus as any}
                                language={match[1]}
                                PreTag="div"
                                {...props}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            ) : (
                              <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-sm" {...props}>
                                {children}
                              </code>
                            );
                          }
                        }}
                      >
                        {sharedState.agent_outputs[detailAgent]}
                      </ReactMarkdown>
                    </div>
                  </Card>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  <Card className="p-4">
                    <div className="font-semibold mb-2">Tool Calls</div>
                    <div className="space-y-2 max-h-48 overflow-auto">
                      {toolCalls.filter(t => t.agent === detailAgent).slice(-20).reverse().map((t, i) => (
                        <div key={i} className="text-sm">
                          <span className="font-mono text-xs text-gray-500">
                            {new Date(t.timestamp).toLocaleTimeString()}
                          </span>
                          {' '}
                          <span className="font-medium">{t.tool}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                  
                  <Card className="p-4">
                    <div className="font-semibold mb-2">Artifacts</div>
                    <div className="space-y-2 max-h-48 overflow-auto">
                      {artifacts.filter(a => a.agent === detailAgent).slice(-20).reverse().map((a, i) => (
                        <div key={i} className="text-sm">
                          <span className="font-mono text-xs text-gray-500">
                            {new Date(a.timestamp).toLocaleTimeString()}
                          </span>
                          {' '}
                          <span className="font-medium">{a.name}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mode Config Modal */}
      <AnimatePresence>
        {showModeConfig && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowModeConfig(false)} />
            <motion.div
              className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              <div className="p-6">
                <h3 className="text-xl font-bold mb-4">Execution Configuration</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Execution Mode</label>
                    <select
                      value={executionMode}
                      onChange={e => setExecutionMode(e.target.value as any)}
                      className="w-full border rounded-lg px-3 py-2 bg-transparent"
                    >
                      <option value="event_driven">Autonomous (emergent behavior)</option>
                      <option value="turn_based">Strict Handoff (coordinator)</option>
                      <option value="hybrid">Hybrid (trunk + branches)</option>
                    </select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1 block">Max Concurrent</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={modeConfig.max_concurrent_agents}
                        onChange={e => setModeConfig({ ...modeConfig, max_concurrent_agents: parseInt(e.target.value || '1') })}
                        className="w-full border rounded-lg px-3 py-2 bg-transparent"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Max Total</label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={modeConfig.max_total_agents}
                        onChange={e => setModeConfig({ ...modeConfig, max_total_agents: parseInt(e.target.value || '1') })}
                        className="w-full border rounded-lg px-3 py-2 bg-transparent"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium mb-1 block">Agent Timeout (seconds)</label>
                    <input
                      type="number"
                      min={10}
                      max={600}
                      value={modeConfig.max_agent_runtime}
                      onChange={e => setModeConfig({ ...modeConfig, max_agent_runtime: parseInt(e.target.value || '60') })}
                      className="w-full border rounded-lg px-3 py-2 bg-transparent"
                    />
                  </div>
                  
                  <div className="pt-4 flex justify-end">
                    <Button onClick={() => setShowModeConfig(false)}>
                      Save Configuration
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Approvals Drawer */}
      <AnimatePresence>
        {approvals.length > 0 && (
          <motion.div
            className="fixed bottom-4 right-4 z-40"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
          >
            <Card className="p-4 shadow-2xl border-blue-300 dark:border-blue-600 max-w-md">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold">Approval Required</div>
                <Button variant="ghost" size="sm" onClick={() => setApprovals([])}>
                  Clear
                </Button>
              </div>
              <div className="space-y-3">
                {approvals.map((appr) => (
                  <div key={appr.id} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                    {appr.type === 'tool_approval' && (
                      <div className="space-y-2">
                        <div className="text-sm">
                          <span className="font-medium">{appr.agent}</span> requests{' '}
                          <span className="font-semibold">{appr.tool}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={async () => {
                            try {
                              await fetch(`${API_BASE_URL}/api/v1/approval/tool-approval/${appr.parameters?.approval_id || appr.id}/respond`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ approved: true })
                              });
                            } catch {}
                            setApprovals(prev => prev.filter(p => p.id !== appr.id));
                          }}>
                            Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={async () => {
                            try {
                              await fetch(`${API_BASE_URL}/api/v1/approval/tool-approval/${appr.parameters?.approval_id || appr.id}/respond`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ approved: false, rejection_reason: 'Rejected by user' })
                              });
                            } catch {}
                            setApprovals(prev => prev.filter(p => p.id !== appr.id));
                          }}>
                            Reject
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default CleanSwarmChat;
