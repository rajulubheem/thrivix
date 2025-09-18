import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  User,
  Send,
  StopCircle,
  Settings,
  Wrench,
  MessageSquare,
  Database,
  Users,
  Activity,
  FileText,
  PlayCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import ReactMarkdown from 'react-markdown';
import './EventDrivenSwarmInterface.css';

// API base URL
const API_BASE_URL = (process as any).env?.REACT_APP_API_URL || 'http://localhost:8000';

type Severity = 'info' | 'warning' | 'error' | 'success';

interface SwarmEvent {
  id?: string | number;
  type?: string;
  agent?: string;
  data?: any;
  timestamp?: number | string;
  severity?: Severity;
  // Anthropic-style envelopes may have these fields without a type
  event?: any;
  message?: any;
  result?: any;
}

interface Message {
  id: string;
  agent: string;
  content: string;
  timestamp: Date;
  type: 'message' | 'system';
  streaming?: boolean;
}

interface AgentState {
  name: string;
  role?: string | Record<string, any>;
  status: 'spawning' | 'working' | 'complete' | 'error' | 'waiting';
  lastActivity: string;
  outputCount: number;
}

// Utility to stringify role regardless of shape
const roleToString = (role: any) => {
  if (!role) return '';
  if (typeof role === 'string') return role;
  if (role.role) return role.role;
  try { return JSON.stringify(role); } catch { return String(role); }
};

export const EventDrivenSwarmInterface: React.FC = () => {
  const [task, setTask] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [events, setEvents] = useState<SwarmEvent[]>([]);
  const [agents, setAgents] = useState<Map<string, AgentState>>(new Map());

  const [showToolsHub, setShowToolsHub] = useState(false);
  const [showSettingsHub, setShowSettingsHub] = useState(false);
  const [availableTools, setAvailableTools] = useState<string[]>([]);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [restrictToSelected, setRestrictToSelected] = useState(false);

  const [maxConcurrentAgents, setMaxConcurrentAgents] = useState(10);
  const [maxTotalAgents, setMaxTotalAgents] = useState(30);
  const [maxExecutionTime, setMaxExecutionTime] = useState(600);
  const [maxAgentRuntime, setMaxAgentRuntime] = useState(120);

  const eventSourceRef = useRef<EventSource | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isExecutingRef = useRef<boolean>(false);
  const lastStartedAgentRef = useRef<string | null>(null);
  const lastCompletedHashRef = useRef<Map<string, string>>(new Map());

  // Auto-scroll on new messages
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Load tool registry once
  useEffect(() => {
    (async () => {
      try {
        let res = await fetch('/api/v1/tool-registry/available-tools');
        if (!res.ok) res = await fetch('/api/v1/tool-registry/available');
        if (res.ok) {
          const data = await res.json();
          let names: string[] = [];
          if (Array.isArray(data?.tools)) {
            names = data.tools.map((t: any) => (typeof t === 'string' ? t : (t?.name || t?.id))).filter(Boolean);
          } else if (Array.isArray(data)) {
            names = data.map((t: any) => (typeof t === 'string' ? t : (t?.name || t?.id))).filter(Boolean);
          } else if (data?.tools && typeof data.tools === 'object') {
            names = Object.keys(data.tools);
          }
          setAvailableTools(names.sort());
        }
      } catch {}
    })();
  }, []);

  const appendEvent = useCallback((e: SwarmEvent) => {
    const sev: Severity = e.type?.includes('error') || e.type?.includes('failed') ? 'error' : e.type?.includes('complete') ? 'success' : 'info';
    setEvents(prev => [...prev, { ...e, severity: sev }]);
  }, []);

  const ensureAgent = useCallback((name: string, patch?: Partial<AgentState>) => {
    setAgents(prev => {
      const next = new Map(prev);
      const existing = next.get(name) || {
        name,
        status: 'waiting' as const,
        lastActivity: new Date().toISOString(),
        outputCount: 0,
      };
      const merged: AgentState = { ...existing, ...patch, name };
      next.set(name, merged);
      return next;
    });
  }, []);

  const appendStreamChunk = useCallback((agent: string, chunk: string) => {
    // Allow empty chunks to create placeholder messages
    const id = `msg-streaming-${agent}`;
    
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === id);
      if (idx >= 0) {
        const updated = [...prev];
        // Only append non-empty chunks to avoid duplicates
        if (chunk && chunk.trim()) {
          updated[idx] = { ...updated[idx], content: updated[idx].content + chunk, streaming: true, timestamp: new Date() };
        }
        return updated;
      }
      // Create new message for this agent if it doesn't exist
      return [...prev, { id, agent, content: chunk || '', timestamp: new Date(), type: 'message', streaming: true }];
    });
  }, []);

  const finalizeAgentMessage = useCallback((agent: string, content: string) => {
    const id = `msg-streaming-${agent}`;
    const hash = `${agent}:${content?.slice(0, 64)}`; // de-dupe repeated completions
    const seen = lastCompletedHashRef.current.get(agent);
    if (seen === hash) return;
    lastCompletedHashRef.current.set(agent, hash);
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], content: content || updated[idx].content, streaming: false, timestamp: new Date() };
        return updated;
      }
      return [...prev, { id, agent, content, timestamp: new Date(), type: 'message', streaming: false }];
    });
    ensureAgent(agent, { status: 'complete', lastActivity: new Date().toISOString() });
  }, [ensureAgent]);

  const handleSSEObject = useCallback((obj: any) => {
    // Enhanced logging to debug event flow
    if (obj?.type === 'text_generation' || obj?.agent) {
      console.log(`[SSE] Event type: ${obj?.type}, Agent: ${obj?.agent}, Has output: ${!!obj?.output}, Has data.chunk: ${!!obj?.data?.chunk}`);
    }
    
    // Handle Anthropic-style envelopes lacking type
    if (!obj?.type && obj?.event?.contentBlockDelta?.delta?.text) {
      const agent = obj.agent || obj.data?.agent || lastStartedAgentRef.current || 'assistant';
      appendStreamChunk(agent, obj.event.contentBlockDelta.delta.text);
      return;
    }
    if (!obj?.type && (obj?.message || obj?.result?.message)) {
      const finalText = obj.message?.content?.[0]?.text || obj.result?.message?.content?.[0]?.text || '';
      if (finalText) {
        const agent = obj.agent || obj.data?.agent || lastStartedAgentRef.current || 'assistant';
        finalizeAgentMessage(agent, finalText);
        return;
      }
    }

    // Handle events without type but with agent data
    if (!obj?.type && obj?.agent) {
      // This looks like an agent event without explicit type
      if (obj.output) {
        // Agent output/message
        console.log('Processing agent output:', obj.agent, 'output length:', obj.output.length);
        const agent = obj.agent;
        appendStreamChunk(agent, obj.output);
        ensureAgent(agent, { status: 'working', lastActivity: new Date().toISOString() });
        return;
      } else if (obj.role) {
        // Agent creation/spawn
        console.log('Processing agent spawn:', obj.agent, 'role:', obj.role);
        const agent = obj.agent;
        ensureAgent(agent, { status: 'spawning', role: obj.role, lastActivity: new Date().toISOString() });
        appendEvent({ ...obj, type: 'agent_spawned', timestamp: Date.now() });
        return;
      }
    }

    const type = obj?.type as string | undefined;
    if (!type) {
      console.log('Dropping event without type:', obj);
      return;
    }
    appendEvent({ ...obj, timestamp: Date.now() });

    switch (type) {
      case 'session_start': {
        const sid = obj.session_id || obj.data?.execution_id || obj.data?.session_id;
        setExecutionId(sid);
        isExecutingRef.current = true;
        setMessages(prev => ([...prev, { id: `sys-${Date.now()}`, agent: 'system', content: `Session started: ${sid}`, timestamp: new Date(), type: 'system' }]));
        break;
      }
      case 'agent.spawned': {
        const agent = obj.data?.agent || obj.agent;
        ensureAgent(agent, { status: 'spawning', role: obj.data?.role, lastActivity: new Date().toISOString() });
        break;
      }
      case 'agent_started':
      case 'agent.started': {
        const agent = obj.agent || obj.data?.agent;
        if (agent) {
          lastStartedAgentRef.current = agent;
          ensureAgent(agent, { status: 'working', lastActivity: new Date().toISOString() });
          // create placeholder bubble for completions
          appendStreamChunk(agent, '');
        }
        break;
      }
      case 'text_generation':
      case 'delta': {
        const agent = obj.agent || obj.data?.agent || lastStartedAgentRef.current || 'assistant';
        // Check multiple possible locations for the text content
        // Backend sends: obj.output at root level and obj.data.chunk/text/content
        const chunk = obj.output || obj.data?.chunk || obj.data?.text || obj.data?.content || obj.content || '';
        if (chunk) {
          console.log(`Processing ${obj.type} from ${agent}:`, chunk.substring(0, 50) + '...');
          appendStreamChunk(agent, chunk);
          ensureAgent(agent, { status: 'working', lastActivity: new Date().toISOString() });
        } else {
          console.warn(`No text content found in ${obj.type} event from ${agent}:`, obj);
        }
        break;
      }
      case 'message.added':
      case 'agent_message':
      case 'agent.message': {
        const agent = obj.agent || obj.data?.agent || lastStartedAgentRef.current || 'assistant';
        const chunk = obj.data?.message || obj.data?.chunk || obj.data?.text || obj.data?.content || '';
        appendStreamChunk(agent, chunk);
        break;
      }
      case 'agent_completed':
      case 'agent.completed': {
        const agent = obj.agent || obj.data?.agent;
        // Don't pass output - it was already streamed
        // The completion event just marks the message as finished
        if (agent) finalizeAgentMessage(agent, ''); // Empty string means keep existing content
        break;
      }
      case 'ai_decision': {
        const c = obj.data?.decision || obj.data?.content || obj.data?.chunk || '';
        setMessages(prev => ([...prev, { id: `ai-${Date.now()}`, agent: 'AI Decision', content: String(c).slice(0, 2000), timestamp: new Date(), type: 'system' }]));
        break;
      }
      case 'agent.needed': {
        const role = roleToString(obj.data?.role);
        const reason = obj.data?.reason || '';
        setMessages(prev => ([...prev, { id: `need-${Date.now()}`, agent: obj.agent || 'system', content: `Agent needed: ${role}\nReason: ${reason}`, timestamp: new Date(), type: 'system' }]));
        break;
      }
      case 'error':
      case 'task.failed': {
        setIsExecuting(false);
        isExecutingRef.current = false;
        setMessages(prev => ([...prev, { id: `err-${Date.now()}`, agent: 'system', content: `Error: ${obj.data?.error || obj.error || 'Unknown error'}`, timestamp: new Date(), type: 'system' }]));
        break;
      }
      case 'session_complete':
      case 'execution_completed': {
        setIsExecuting(false);
        isExecutingRef.current = false;
        setMessages(prev => ([...prev, { id: `done-${Date.now()}`, agent: 'system', content: `Execution completed`, timestamp: new Date(), type: 'system' }]));
        break;
      }
      default: {
        // Log everything else
        break;
      }
    }
  }, [appendEvent, appendStreamChunk, ensureAgent, finalizeAgentMessage]);

  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) return;
    const es = new EventSource(`${API_BASE_URL}/api/v1/streaming/start/sse`, { withCredentials: false } as any);
    // Note: we POST to start stream below; this EventSource path is here to line up with server, but we actually use fetch+reader for streaming body.
    es.close();
  }, []);

  const startExecution = useCallback(async () => {
    if (!task.trim() || isExecutingRef.current) return;
    setIsExecuting(true);
    isExecutingRef.current = true;
    setMessages(prev => ([...prev, { id: `user-${Date.now()}`, agent: 'user', content: task, timestamp: new Date(), type: 'message' }]));
    setAgents(new Map());
    setEvents([]);

    // Start native SSE (server streams in the response body)
    // Use event-swarm endpoint for proper event streaming
    const endpoint = `${API_BASE_URL}/api/v1/event-swarm/stream`;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task,
          execution_mode: 'event_driven',
          agents: [],
          context: {
            swarm_config: {
              max_concurrent_agents: maxConcurrentAgents,
              max_total_agents: maxTotalAgents,
              max_execution_time: maxExecutionTime,
              max_agent_runtime: maxAgentRuntime,
              enable_human_loop: true,
            },
            tool_preferences: {
              selected_tools: Array.from(selectedTools),
              restrict_to_selected: restrictToSelected,
            }
          },
        }),
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let localSessionId: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue; // Skip empty lines
          console.log('Raw SSE line:', line);
          
          if (!line.startsWith('data:')) {
            // Try parsing non-SSE formatted JSON lines directly
            try {
              const obj = JSON.parse(line.trim());
              console.log('Parsed non-SSE JSON:', obj);
              handleSSEObject(obj);
              continue;
            } catch (e) {
              console.log('Skipping non-data line:', line);
              continue;
            }
          }
          
          const json = line.slice(5).trim();
          if (!json) continue;
          try {
            const obj: SwarmEvent = JSON.parse(json);
            console.log('Parsed SSE data:', obj);
            if (obj.type === 'session_start') {
              localSessionId = (obj as any).session_id || obj.data?.execution_id || obj.data?.session_id || null;
              setExecutionId(localSessionId);
            }
            handleSSEObject(obj);
          } catch (e) {
            // Try parsing Anthropic envelope lines
            try {
              const raw = JSON.parse(json);
              console.log('Parsed Anthropic envelope:', raw);
              handleSSEObject(raw);
            } catch (err) {
              console.error('Failed to parse SSE JSON:', json, err);
            }
          }
        }
      }
      setIsExecuting(false);
      isExecutingRef.current = false;
    } catch (err) {
      setIsExecuting(false);
      isExecutingRef.current = false;
      setMessages(prev => ([...prev, { id: `err-${Date.now()}`, agent: 'system', content: `Failed to start: ${String(err)}`, timestamp: new Date(), type: 'system' }]));
    }
  }, [API_BASE_URL, task, maxConcurrentAgents, maxTotalAgents, maxExecutionTime, maxAgentRuntime, selectedTools, restrictToSelected, handleSSEObject]);

  const stopExecution = useCallback(async () => {
    if (!executionId) return;
    try {
      await fetch(`${API_BASE_URL}/api/v1/streaming/stop/${executionId}`, { method: 'POST' });
    } catch {}
    setIsExecuting(false);
    isExecutingRef.current = false;
  }, [executionId]);

  const toggleTool = (name: string) => {
    setSelectedTools(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const activeAgentCount = useMemo(() => Array.from(agents.values()).filter(a => a.status === 'working').length, [agents]);

  return (
    <div className="flex h-full">
      {/* Sidebar: History/Stats */}
      <div className="w-72 bg-white/70 dark:bg-gray-900/70 border-r border-gray-200 dark:border-gray-800 hidden md:flex md:flex-col">
        <div className="px-3 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
          <Database className="h-4 w-4" />
          <div className="text-sm">Session</div>
          {executionId && (<Badge variant="outline" className="ml-auto text-xs">{executionId.slice(0,8)}...</Badge>)}
        </div>
        <div className="p-3">
          <Card className="p-2">
            <div className="text-xs text-gray-600 dark:text-gray-300">Messages: {messages.length}</div>
            <div className="text-xs text-gray-600 dark:text-gray-300">Agents: {agents.size}</div>
            <div className="text-xs text-gray-600 dark:text-gray-300">Active: {activeAgentCount}</div>
            <div className="text-xs text-gray-600 dark:text-gray-300">Events: {events.length}</div>
          </Card>
        </div>
        <div className="px-3 py-2 text-xs text-gray-500">Recent Events</div>
        <ScrollArea className="flex-1 p-2">
          {events.slice(-50).map((e, i) => (
            <div key={i} className="text-[11px] mb-1 text-gray-700 dark:text-gray-300">
              <span className="font-mono mr-1">{(e.type||'event')}</span>
              <span className="text-gray-500">{e.agent ? `· ${e.agent}` : ''}</span>
            </div>
          ))}
        </ScrollArea>
      </div>

      {/* Main: Chat + Top bar */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-white/70 dark:bg-gray-900/70 border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-blue-600" />
            <div className="text-sm text-gray-600 dark:text-gray-300">Messages: {messages.length}</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">Active: {activeAgentCount}</div>
            {executionId && (<Badge variant="outline" className="text-xs">{executionId.slice(0,8)}...</Badge>)}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowSettingsHub(true)} className="gap-2">
              <Settings className="h-4 w-4" /> Settings
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowToolsHub(true)} className="gap-2">
              <Wrench className="h-4 w-4" /> Tools
            </Button>
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 relative overflow-hidden">
          <div ref={messagesContainerRef} className="messages-container absolute inset-0 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 && !isExecuting && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Bot className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Ready</h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-md">Describe your task and press Run. Agents will collaborate to complete it.</p>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.agent === 'user' ? 'justify-end' : 'justify-start'}`}>
                <Card className={`max-w-[min(70%,42rem)] ${m.agent === 'user' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900'} shadow`}>
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`p-1.5 rounded-md ${m.agent === 'user' ? 'bg-blue-500/40' : 'bg-gray-100 dark:bg-gray-800'}`}>
                        {m.agent === 'user' ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                      </div>
                      <div className="text-xs opacity-70">
                        {m.agent} · {m.timestamp.toLocaleTimeString()}
                      </div>
                      {m.streaming && (<Badge variant="outline" className="text-[10px]">Streaming…</Badge>)}
                    </div>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom input bar */}
        <div className="border-t border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur p-3">
          <div className="max-w-4xl mx-auto flex items-center gap-2">
            <Input placeholder="Describe the task for the swarm..." value={task} onChange={(e) => setTask(e.target.value)} disabled={isExecuting} onKeyDown={(e) => { if (e.key === 'Enter' && task.trim() && !isExecuting) startExecution(); }} />
            {!isExecuting ? (
              <Button onClick={() => startExecution()} disabled={!task.trim()} className="gap-2">
                <PlayCircle className="h-4 w-4" /> Run
              </Button>
            ) : (
              <Button onClick={stopExecution} variant="destructive" className="gap-2">
                <StopCircle className="h-4 w-4" /> Stop
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Right: Agents / Tools / Settings */}
      <div className="w-96 bg-white/70 dark:bg-gray-900/70 border-l border-gray-200 dark:border-gray-800 hidden lg:flex lg:flex-col">
        <div className="px-3 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
          <Users className="h-4 w-4" />
          <div className="text-sm">Agents</div>
        </div>
        <ScrollArea className="flex-1 p-3 space-y-2">
          {Array.from(agents.values()).map((a) => (
            <Card key={a.name} className="p-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{a.name}</div>
                <Badge variant="outline" className="text-xs">{a.status}</Badge>
              </div>
              {a.role && (
                <div className="text-xs text-gray-500 mt-1">{roleToString(a.role)}</div>
              )}
            </Card>
          ))}
        </ScrollArea>
        <div className="px-3 py-3 border-t border-gray-200 dark:border-gray-800 flex items-center gap-2">
          <Activity className="h-4 w-4" />
          <div className="text-sm">Activity</div>
        </div>
        <ScrollArea className="h-40 p-3">
          {events.slice(-30).map((e, i) => (
            <div key={i} className="text-[11px] text-gray-700 dark:text-gray-300">
              {(e.type||'event')} {e.agent ? `· ${e.agent}` : ''}
            </div>
          ))}
        </ScrollArea>
      </div>

      {/* Tools Hub */}
      {showToolsHub && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowToolsHub(false)}>
          <Card className="w-[720px] max-w-[95vw]" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5" /> Tools Hub
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-gray-500 mb-2">Select tools to prefer during this execution.</div>
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto">
                {availableTools.map((name) => (
                  <label key={name} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={selectedTools.has(name)} onChange={() => toggleTool(name)} />
                    <span>{name}</span>
                  </label>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <label className="text-sm flex items-center gap-2">
                  <input type="checkbox" checked={restrictToSelected} onChange={(e) => setRestrictToSelected(e.target.checked)} />
                  Restrict to selected
                </label>
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={() => setShowToolsHub(false)}>Done</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Settings Hub */}
      {showSettingsHub && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowSettingsHub(false)}>
          <Card className="w-[720px] max-w-[95vw]" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" /> Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium">Max Concurrent Agents</div>
                  <input type="range" min={1} max={50} value={maxConcurrentAgents} onChange={(e) => setMaxConcurrentAgents(parseInt(e.target.value))} className="w-full" />
                  <div className="text-xs text-gray-500 mt-1">{maxConcurrentAgents}</div>
                </div>
                <div>
                  <div className="text-sm font-medium">Max Total Agents</div>
                  <input type="range" min={1} max={100} value={maxTotalAgents} onChange={(e) => setMaxTotalAgents(parseInt(e.target.value))} className="w-full" />
                  <div className="text-xs text-gray-500 mt-1">{maxTotalAgents}</div>
                </div>
                <div>
                  <div className="text-sm font-medium">Max Execution Time (s)</div>
                  <input type="range" min={60} max={1800} step={30} value={maxExecutionTime} onChange={(e) => setMaxExecutionTime(parseInt(e.target.value))} className="w-full" />
                  <div className="text-xs text-gray-500 mt-1">{maxExecutionTime}s</div>
                </div>
                <div>
                  <div className="text-sm font-medium">Max Agent Runtime (s)</div>
                  <input type="range" min={30} max={600} step={10} value={maxAgentRuntime} onChange={(e) => setMaxAgentRuntime(parseInt(e.target.value))} className="w-full" />
                  <div className="text-xs text-gray-500 mt-1">{maxAgentRuntime}s</div>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={() => setShowSettingsHub(false)}>Close</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default EventDrivenSwarmInterface;

