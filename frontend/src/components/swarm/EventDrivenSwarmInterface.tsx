import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot,
  User,
  Sparkles,
  AlertCircle,
  CheckCircle,
  XCircle,
  Activity,
  MessageSquare,
  Zap,
  HelpCircle,
  Send,
  Copy,
  Check,
  ArrowDown,
  ArrowRight,
  Square,
  Settings,
  ChevronDown,
  ChevronRight,
  Clock,
  Hash,
  Users,
  BarChart3,
  Brain,
  PlayCircle,
  StopCircle,
  PauseCircle,
  RefreshCw,
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
  History,
  FileText,
  Database,
  Wrench,
  List,
  Grid3x3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { cn } from "../../lib/utils";
import ReactMarkdown from "react-markdown";
import HumanInTheLoopPanel from "./HumanInTheLoopPanel";
import ActiveAgentsPanel, { DetailedAgentState } from "./ActiveAgentsPanel";
import AgentMonitor from "./AgentMonitor";
import { ScrollArea } from "../ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface SwarmEvent {
  id: string;
  type: string;
  data: any;
  source?: string;
  timestamp: number;
  agent?: string;
  severity?: 'info' | 'warning' | 'error' | 'success';
}

interface HumanQuestion {
  id: string;
  question: string;
  context?: any;
  requesting_agent?: string;
  timestamp: string;
}

interface HumanApproval {
  id: string;
  action: string;
  reason: string;
  requesting_agent?: string;
  timestamp: string;
}

interface Message {
  id: string;
  agent: string;
  content: string;
  timestamp: Date;
  type: "message" | "handoff" | "system";
  streaming?: boolean;
}

// Local session persistence types (similar to CleanSwarmChat)
interface PersistedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  agent?: string;
  timestamp: string;
}

interface SessionData {
  id: string;
  title: string;
  messages: PersistedMessage[];
  timestamp: string;
  lastMessage?: string;
}

interface AgentState {
  name: string;
  role: string;
  status: "spawning" | "working" | "complete" | "error" | "waiting";
  content?: string;
  contentPreview: string;
  currentThought: string;
  currentTask: string;
  lastActivity: string;
  outputCount: number;
  toolsUsed: Array<{ name: string; timestamp: string }>;
  recentActions: Array<{
    type: string;
    description: string;
    timestamp: string;
  }>;
  progressHistory: Array<{
    message: string;
    timestamp: string;
    type: "thinking" | "working" | "completed" | "ai_reasoning";
  }>;
  totalTokens: number;
  executionTime: number;
  successRate: number;
  
  // AI Reasoning & Decision Making
  aiReasoning?: {
    task_complete?: boolean;
    reasoning?: string;
    needed_agents?: Array<{
      role: string;
      reason: string;
      priority: string;
    }>;
    next_phase?: string;
    [key: string]: any;
  };
  taskComplete?: boolean;
}





export const EventDrivenSwarmInterface: React.FC = () => {
  const [task, setTask] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [events, setEvents] = useState<SwarmEvent[]>([]);
  const [agents, setAgents] = useState<Map<string, AgentState>>(new Map());
  const [humanQuestions, setHumanQuestions] = useState<HumanQuestion[]>([]);
  const [humanApprovals, setHumanApprovals] = useState<HumanApproval[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isExecutingRef = useRef<boolean>(false);
  // Subagent timeline mapping
  type SubTimelineItem = { id: string; parent: string; agent: string; type: 'start'|'token'|'done'; preview?: string; ts: number };
  const subAgentParentRef = useRef<Map<string, string>>(new Map());
  const [subTimeline, setSubTimeline] = useState<SubTimelineItem[]>([]);

  // Sidebar + history state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionHistory, setSessionHistory] = useState<SessionData[]>([]);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>("");

  // Tools sidebar state
  const [rightPanelTab, setRightPanelTab] = useState<'tools' | 'monitor'>('tools');
  const [availableTools, setAvailableTools] = useState<string[]>([]);
  const [toolDetails, setToolDetails] = useState<Record<string, { description?: string; category?: string }>>({});
  const [toolsLoading, setToolsLoading] = useState(false);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [restrictToSelected, setRestrictToSelected] = useState(false);
  const [toolSearch, setToolSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showToolsHub, setShowToolsHub] = useState(false);
  const [showSettingsHub, setShowSettingsHub] = useState(false);
  const [toolsViewMode, setToolsViewMode] = useState<'grid'|'list'>('grid');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Swarm configuration controls
  const [showConfig, setShowConfig] = useState(false);
  const [maxConcurrentAgents, setMaxConcurrentAgents] = useState(3);
  const [maxTotalAgents, setMaxTotalAgents] = useState(8);
  const [maxExecutionTime, setMaxExecutionTime] = useState(180);
  const [maxAgentRuntime, setMaxAgentRuntime] = useState(60);
  const [enableHumanLoop, setEnableHumanLoop] = useState(true);

  // Statistics for header
  const activeAgentCount = Array.from(agents.values()).filter(a => a.status === 'working').length;
  const completedAgentCount = Array.from(agents.values()).filter(a => a.status === 'complete').length;
  const totalEvents = events.length;
  const recentEvents = events.filter(e => Date.now() - e.timestamp < 60000).length;

  // Handle auto-scrolling
  useEffect(() => {
    if (autoScroll && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const container = messagesContainerRef.current;
    const threshold = 100;
    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      threshold;

    // Only change auto-scroll if user has scrolled away from bottom
    if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    } else if (isAtBottom && !autoScroll) {
      setAutoScroll(true);
    }
  };

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
      setAutoScroll(true);
    }
  };

  const handleSwarmEvent = (event: SwarmEvent) => {
    // Add to event log with severity
    const eventWithSeverity = {
      ...event,
      severity: event.type.includes('error') || event.type.includes('failed') ? 'error' as const :
               event.type.includes('complete') ? 'success' as const :
               event.type.includes('warning') ? 'warning' as const : 'info' as const
    };
    
    setEvents((prev) => [...prev, eventWithSeverity]);

    // Handle specific event types
    switch (event.type) {
      case "agent.spawned":
        handleAgentSpawned(event.data);
        break;
      case "agent.started":
        updateAgentStatus(event.data.agent, "working");
        break;
      case "agent.completed":
        updateAgentStatus(event.data.agent, "complete");
        break;
      case "human.question":
        setHumanQuestions((prev) => [...prev, event.data]);
        break;
      case "human.approval_request":
        setHumanApprovals((prev) => [...prev, event.data]);
        break;
    }
  };

  // Fetch available tools from backend (once)
  useEffect(() => {
    (async () => {
      try {
        setToolsLoading(true);
        let res = await fetch('/api/v1/tool-registry/available-tools');
        if (!res.ok) res = await fetch('/api/v1/tool-registry/available');
        if (res.ok) {
          const data = await res.json();

          let names: string[] = [];
          const details: Record<string, { description?: string; category?: string }> = {};

          if (Array.isArray(data?.tools)) {
            // tools is an array: could be strings or objects
            for (const item of data.tools) {
              if (typeof item === 'string') {
                names.push(item);
              } else if (item && typeof item === 'object') {
                const name = item.name || item.id || item.tool || '';
                if (name) {
                  names.push(name);
                  details[name] = { description: item.description, category: item.category };
                }
              }
            }
          } else if (data?.tools && typeof data.tools === 'object') {
            // tools is a map { name: { description, category, ... } }
            names = Object.keys(data.tools);
            for (const key of names) {
              const meta = data.tools[key] || {};
              details[key] = { description: meta.description, category: meta.category };
            }
          } else if (Array.isArray(data)) {
            // endpoint returns array directly
            names = data.map((x: any) => (typeof x === 'string' ? x : (x?.name || x?.id))).filter(Boolean);
          }

          if (names.length) setAvailableTools(names.sort());
          setToolDetails(details);
          // Load persisted tool selections
          try {
            const rawSel = localStorage.getItem('event_swarm_selected_tools');
            if (rawSel) setSelectedTools(new Set(JSON.parse(rawSel)));
            const rest = localStorage.getItem('event_swarm_restrict_tools');
            if (rest) setRestrictToSelected(rest === 'true');
          } catch {}
        }
      } catch {}
      finally { setToolsLoading(false); }
    })();
  }, []);

  const toggleTool = (name: string) => {
    setSelectedTools(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      try { localStorage.setItem('event_swarm_selected_tools', JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };

  const selectAllTools = () => setSelectedTools(new Set(availableTools));
  const clearAllTools = () => setSelectedTools(new Set());

  // Simple grouping heuristic for tools
  const groupFor = (tool: string): string => {
    const n = (tool || '').toLowerCase();
    if (/(search|web|browser|crawl|tavily)/.test(n)) return 'Research';
    if (/(file|fs|write|read|repo|project)/.test(n)) return 'Files';
    if (/(python|repl|code|exec|run|shell)/.test(n)) return 'Code';
    if (/(data|csv|json|sql|db)/.test(n)) return 'Data';
    if (/(git|github|pr|commit)/.test(n)) return 'Git';
    if (/(workflow|swarm|agent|graph)/.test(n)) return 'Orchestration';
    return 'Other';
  };

  const groupedTools = availableTools.reduce((acc: Record<string, string[]>, t) => {
    const cat = toolDetails[t]?.category;
    const backend = (cat || '').toLowerCase();
    const mapped = backend ? ({
      'file_operations': 'Files',
      'web': 'Research',
      'web_search': 'Research',
      'code_execution': 'Code',
      'utilities': 'Utility',
      'utility': 'Utility',
      'reasoning': 'Reasoning',
      'advanced': 'Advanced',
      'memory': 'Data',
      'media': 'Media',
      'planning': 'Planning',
      'unknown': 'Other',
    } as Record<string,string>)[backend] : undefined;
    const g = mapped || groupFor(t);
    (acc[g] ||= []).push(t);
    return acc;
  }, {} as Record<string, string[]>);

  const categoryOrder = ['Research','Code','Files','Data','Utility','Planning','Reasoning','Advanced','Media','Git','Orchestration','Other'];
  const orderedCategories = Object.keys(groupedTools).sort((a,b) => {
    const ai = categoryOrder.indexOf(a);
    const bi = categoryOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  useEffect(() => {
    if (availableTools.length && expandedCategories.size === 0) {
      setExpandedCategories(new Set(Object.keys(groupedTools)));
    }
  }, [availableTools, groupedTools, expandedCategories.size]);

  // Persist restrict toggle
  useEffect(() => {
    try { localStorage.setItem('event_swarm_restrict_tools', restrictToSelected ? 'true' : 'false'); } catch {}
  }, [restrictToSelected]);

  const handleAgentSpawned = (agentData: any) => {
    const agentName = agentData.agent_id || agentData.name || agentData.agent;
    if (!agentName) return;

    setAgents((prev) => {
      const updated = new Map(prev);
      updated.set(agentName, {
        name: agentName,
        role: agentData.role || agentName,
        status: "spawning",
        contentPreview: "",
        currentThought: "Agent initializing...",
        currentTask: "Starting up...",
        lastActivity: new Date().toISOString(),
        outputCount: 0,
        toolsUsed: [],
        recentActions: [],
        progressHistory: [],
        totalTokens: 0,
        executionTime: 0,
        successRate: 100,
      });
      return updated;
    });
  };

  const handleAgentStarted = (agentData: any) => {
    const agentName = agentData.agent_id || agentData.name || agentData.agent;
    if (!agentName) return;

    updateAgentStatus(agentName, "working");
    
    setAgents((prev) => {
      const updated = new Map(prev);
      const agent = updated.get(agentName);
      if (agent) {
        agent.currentThought = "Agent is now active and working...";
        agent.currentTask = "Processing task...";
        agent.lastActivity = new Date().toISOString();
        updated.set(agentName, agent);
      }
      return updated;
    });
  };

  const updateAgentStatus = (
    agentName: string,
    status: AgentState["status"]
  ) => {
    setAgents((prev) => {
      const updated = new Map(prev);
      const agent = updated.get(agentName);
      if (agent) {
        agent.status = status;
        agent.lastActivity = new Date().toISOString();
        
        // Update current task based on status
        switch (status) {
          case 'working':
            agent.currentTask = "Processing...";
            break;
          case 'complete':
            agent.currentTask = "Task completed";
            agent.currentThought = "Work finished successfully";
            break;
          case 'error':
            agent.currentTask = "Error occurred";
            break;
        }
        
        updated.set(agentName, agent);
      }
      return updated;
    });
  };

  const stopExecution = async () => {
    if (!executionId) {
      console.error("No execution to stop");
      return;
    }

    try {
      console.log("🛑 Stopping execution:", executionId);
      const response = await fetch(
        `http://localhost:8000/api/v1/streaming/stop/${executionId}`,
        {
          method: "POST",
        },
      );

      if (response.ok) {
        const data = await response.json();
        console.log("✅ Execution stopped:", data);
        setIsExecuting(false);
        setExecutionId(null);

        // Add stop message to events
        const stopEvent: SwarmEvent = {
          id: Date.now().toString(),
          type: "execution_stopped",
          data: { message: "Execution stopped by user" },
          timestamp: Date.now(),
          source: "user",
          severity: 'warning',
        };
        setEvents((prev) => [...prev, stopEvent]);
      } else {
        console.error("Failed to stop execution:", response.statusText);
      }
    } catch (error) {
      console.error("Error stopping execution:", error);
    }
  };

  const executeSwarm = async (useTest = false) => {
    if (!task.trim()) return;

    setIsExecuting(true);
    isExecutingRef.current = true;
    setEvents([]);
    setAgents(new Map());
    setHumanQuestions([]);
    setHumanApprovals([]);
    // Do NOT clear existing chat history when continuing; append to it
    setAutoScroll(true); // Reset scroll state on new execution

    try {
      // Call the streaming endpoint with event-driven mode
      const endpoint = "http://localhost:8000/api/v1/streaming/start";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          task,
          execution_mode: "event_driven", // Critical: specify event-driven mode
          agents: [], // Let the system decide which agents to spawn
          max_handoffs: 20,
          context: {
            swarm_config: {
              max_concurrent_agents: maxConcurrentAgents,
              max_total_agents: maxTotalAgents,
              max_execution_time: maxExecutionTime,
              max_agent_runtime: maxAgentRuntime,
              enable_human_loop: enableHumanLoop,
            },
            tool_preferences: {
              selected_tools: Array.from(selectedTools),
              restrict_to_selected: restrictToSelected,
            }
          },
        }),
      });

      const data = await response.json();
      const sessionId = data.session_id;

      if (!sessionId) {
        throw new Error("No session ID received from server");
      }

      console.log("📡 Started event-driven swarm with session:", sessionId);
      setExecutionId(sessionId);
      setSessionId(sessionId);
      // Initialize history and persist first user task message
      persistNewSession(sessionId, task);
      // Push initial user message into chat view
      setMessages(prev => ([
        ...prev,
        {
          id: `user-${Date.now()}`,
          agent: 'user',
          content: task,
          timestamp: new Date(),
          type: 'message',
        },
      ]));

      // Now start polling for updates
      pollForUpdates(sessionId);
    } catch (error) {
      console.error("Failed to execute swarm:", error);
      setIsExecuting(false);
      isExecutingRef.current = false;
      handleSwarmEvent({
        id: Date.now().toString(),
        type: "task.failed",
        data: { error: String(error) },
        timestamp: Date.now(),
        severity: 'error',
      });
    }
  };

  // Add polling function
  const pollForUpdates = async (sessionId: string) => {
    let offset = 0;
    let retries = 0;
    const maxRetries = 3;
    const agentMessages = new Map<string, string>(); // Track partial messages per agent
    const startTime = Date.now();
    const maxPollTimeMs = 300000; // 5 minutes maximum polling time

    while (isExecutingRef.current) {
      // Check for timeout to prevent infinite polling
      if (Date.now() - startTime > maxPollTimeMs) {
        console.error(
          "Polling timeout reached (5 minutes), stopping execution",
        );
        setIsExecuting(false);
        isExecutingRef.current = false;
        handleSwarmEvent({
          id: Date.now().toString(),
          type: "task.failed",
          data: { error: "Execution timeout - stopped after 5 minutes" },
          timestamp: Date.now(),
          severity: 'error',
        });
        break;
      }

      try {
        const response = await fetch(
          `http://localhost:8000/api/v1/streaming/poll/${sessionId}?offset=${offset}&timeout=2`,
        );

        if (!response.ok) {
          if (response.status === 404) {
            console.error("Session expired or not found");
            setIsExecuting(false);
            isExecutingRef.current = false;
            break;
          }
          // Handle server errors (5xx) more aggressively to prevent infinite polling
          if (response.status >= 500) {
            console.error(
              `Server error ${response.status}: ${response.statusText}`,
            );
            retries++;
            if (retries >= maxRetries) {
              console.error(
                "Max retries reached due to server errors, stopping polling",
              );
              setIsExecuting(false);
              isExecutingRef.current = false;
              handleSwarmEvent({
                id: Date.now().toString(),
                type: "task.failed",
                data: { error: `Server error: ${response.statusText}` },
                timestamp: Date.now(),
                severity: 'error',
              });
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait longer for server errors
            continue;
          }
          throw new Error(`Poll failed: ${response.statusText}`);
        }

        const data = await response.json();

        // Log polling response for debugging
        console.log(
          `Polling response - Status: ${data.status}, Chunks: ${data.chunks?.length || 0}, Offset: ${offset}`,
        );

        if (data.chunks && data.chunks.length > 0) {
          for (const chunk of data.chunks) {
            processChunk(chunk, agentMessages);
          }
          offset += data.chunks.length;
        }

        // Check for both 'complete' and 'completed' status
        if (
          data.status === "complete" ||
          data.status === "completed" ||
          data.status === "failed" ||
          data.status === "error"
        ) {
          console.log(`Execution finished with status: ${data.status}`);

          // Messages are already finalized via streaming - no need to add duplicates

          setIsExecuting(false);
          isExecutingRef.current = false;
          handleSwarmEvent({
            id: Date.now().toString(),
            type:
              data.status === "complete" || data.status === "completed"
                ? "task.completed"
                : "task.failed",
            data: {},
            timestamp: Date.now(),
            severity: data.status === "complete" || data.status === "completed" ? 'success' : 'error',
          });
          // Save session snapshot in history
          if (sessionId) saveCurrentSessionSnapshot(sessionId);
          break;
        }

        retries = 0; // Reset retries on successful poll
      } catch (error) {
        console.error("Polling error:", error);

        // Check for network errors (backend crashed/unavailable)
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes("fetch") &&
          (errorMessage.includes("ECONNREFUSED") ||
            errorMessage.includes("connection refused") ||
            errorMessage.includes("Failed to fetch") ||
            errorMessage.includes("NetworkError"))
        ) {
          console.error("Backend appears to be unavailable, stopping polling");
          setIsExecuting(false);
          isExecutingRef.current = false;
          handleSwarmEvent({
            id: Date.now().toString(),
            type: "task.failed",
            data: { error: "Backend connection lost" },
            timestamp: Date.now(),
            severity: 'error',
          });
          break;
        }

        retries++;
        if (retries >= maxRetries) {
          console.error("Max retries reached, stopping polling");
          setIsExecuting(false);
          isExecutingRef.current = false;
          handleSwarmEvent({
            id: Date.now().toString(),
            type: "task.failed",
            data: { error: "Polling failed after max retries" },
            timestamp: Date.now(),
            severity: 'error',
          });
          if (sessionId) saveCurrentSessionSnapshot(sessionId);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait before retry
      }
    }
  };

  // Process chunks from polling
  const processChunk = (chunk: any, agentMessages: Map<string, string>) => {
    console.log("📦 Processing chunk of type:", chunk.type, chunk);
    
    // AGGRESSIVE LOGGING FOR AI DECISIONS
    if (chunk.type === "ai_decision" || chunk.type === "debug_log") {
      console.log("🚨 AI DECISION CHUNK DETECTED!", chunk);
    }
    
    switch (chunk.type) {
      case "agent_start":
        if (chunk.agent) {
          handleAgentStarted({ agent_id: chunk.agent, role: chunk.agent });
          // Record parent for nested timeline
          if (chunk.parent) {
            try { subAgentParentRef.current.set(String(chunk.agent), String(chunk.parent)); } catch {}
            setSubTimeline(prev => [
              ...prev,
              ({ id: `sub-${Date.now()}-${String(chunk.agent)}`, parent: String(chunk.parent), agent: String(chunk.agent), type: 'start' as const, ts: Date.now() } as SubTimelineItem)
            ].slice(-500));
          }
          handleSwarmEvent({
            id: Date.now().toString(),
            type: "agent.started",
            data: { agent: chunk.agent },
            timestamp: Date.now(),
            agent: chunk.agent,
            severity: 'info',
          });
          // Initialize message buffer for this agent
          agentMessages.set(chunk.agent, "");

          // Create initial streaming message for this agent
          setMessages((prev) => {
            // Check if we already have a streaming message for this agent
            const existingIndex = prev.findIndex(
              (m) => m.id === `msg-streaming-${chunk.agent}`,
            );
            if (existingIndex === -1) {
              return [
                ...prev,
                {
                  id: `msg-streaming-${chunk.agent}`,
                  agent: chunk.agent,
                  content: "",
                  timestamp: new Date(),
                  type: "message" as const,
                  streaming: true,
                },
              ];
            }
            return prev;
          });
        }
        break;

      case "delta": // Real-time streaming from Strands agents
      case "token":
      case "text":
        if (chunk.agent && (chunk.content || chunk.data?.chunk)) {
          const content = chunk.content || chunk.data?.chunk;
          console.log(`📄 Streaming chunk from ${chunk.agent}: "${content}"`); // Debug

          // Check if this content contains debug logs with AI decisions
          if (content.includes("AI decision for")) {
            // Parse AI decision from content
            const match = content.match(/AI decision for [^:]+: ({.*})/);
            if (match) {
              try {
                const aiDecision = JSON.parse(match[1]);
                
                // Update agent with AI reasoning
                setAgents((prev) => {
                  const updated = new Map(prev);
                  const agentState = updated.get(chunk.agent) || {
                    name: chunk.agent,
                    role: chunk.agent,
                    status: "working" as const,
                    outputCount: 0,
                    lastActivity: new Date().toISOString(),
                    content: "",
                    recentActions: [],
                    toolsUsed: [],
                    progressHistory: [],
                    contentPreview: "",
                    totalTokens: 0,
                    executionTime: 0,
                    successRate: 100,
                    currentThought: "",
                    currentTask: "",
                    aiReasoning: undefined,
                    taskComplete: false,
                  } as AgentState;

                  // Add AI reasoning data
                  agentState.aiReasoning = aiDecision;
                  agentState.currentThought = aiDecision.reasoning || "Processing...";
                  agentState.currentTask = aiDecision.next_phase || "Analyzing task...";
                  agentState.taskComplete = aiDecision.task_complete || false;

                  updated.set(chunk.agent, agentState);
                  return updated;
                });

                // Add event for timeline
                handleSwarmEvent({
                  id: Date.now().toString(),
                  type: "ai.decision",
                  data: { 
                    agent: chunk.agent, 
                    decision: aiDecision,
                    reasoning: aiDecision.reasoning,
                    neededAgents: aiDecision.needed_agents || []
                  },
                  timestamp: Date.now(),
                  agent: chunk.agent,
                  severity: 'info',
                });
              } catch (e) {
                console.warn("Failed to parse AI decision from streaming content:", e);
              }
            }
          }

          // Check for agent spawn requests
          if (content.includes("Event emitted: agent.needed")) {
            const match = content.match(/Event emitted: agent\.needed from ([^:]+)/);
            if (match) {
              const agentName = match[1];
              handleSwarmEvent({
                id: Date.now().toString(),
                type: "agent.spawn_requested",
                data: { 
                  requester: agentName,
                  content: content
                },
                timestamp: Date.now(),
                agent: agentName,
                severity: 'info',
              });
            }
          }
          // Update agent content with enhanced tracking
          setAgents((prev) => {
            const updated = new Map(prev);
            const agentState = updated.get(chunk.agent) || {
              name: chunk.agent,
              role: chunk.agent,
              status: "working" as const,
              outputCount: 0,
              lastActivity: new Date().toISOString(),
              content: "",
              recentActions: [],
              toolsUsed: [],
              progressHistory: [],
              contentPreview: "",
              totalTokens: 0,
              executionTime: 0,
              successRate: 100,
              currentThought: "",
              currentTask: "",
            };

            // Update content and preview
            agentState.content = (agentState.content || "") + content;
            agentState.status = "working";
            agentState.lastActivity = new Date().toISOString();

            // Clean and update content preview (last 100 characters)
            const fullContent = agentState.content;

            // Clean the content preview from debug logs and noise
            const cleanedContent = fullContent
              .replace(/DEBUG:[^\n]*/g, "") // Remove DEBUG lines
              .replace(/\{[^}]*\}/g, "") // Remove JSON objects
              .replace(/\([^)]*\)/g, "") // Remove parenthetical content
              .replace(/['"`]{2,}/g, '"') // Normalize quotes
              .replace(/\s+/g, " ") // Normalize whitespace
              .trim();

            agentState.contentPreview = cleanedContent.slice(-100);

            // Detect if this looks like a "thought" (improved detection)
            const thoughtIndicators = [
              "I need to",
              "Let me",
              "First",
              "The user",
              "Based on",
              "To accomplish",
              "I will",
              "I'll start by",
              "The goal is",
              "Looking at",
              "Analyzing",
              "Considering",
              "Planning to",
            ];

            // Only update thought if it's meaningful content (not debug noise)
            if (
              thoughtIndicators.some((indicator) =>
                content.includes(indicator),
              ) &&
              !content.includes("DEBUG") &&
              content.length > 10
            ) {
              agentState.currentThought = content.slice(0, 200).trim();
            }

            // Update current task based on content patterns
            if (
              content.includes("TASK COMPLETE") ||
              content.includes("Task completed")
            ) {
              agentState.currentTask = "Finalizing work...";
            } else if (content.includes("```") || content.includes("code")) {
              agentState.currentTask = "Writing code...";
            } else if (
              thoughtIndicators.some((indicator) => content.includes(indicator))
            ) {
              agentState.currentTask = "Planning and analyzing...";
            }

            // Add to progress history (only meaningful updates)
            if (
              content.length > 15 &&
              !content.includes("DEBUG") &&
              !content.match(/^[^a-zA-Z]*$/) && // Skip non-alphabetic content
              (thoughtIndicators.some((indicator) =>
                content.includes(indicator),
              ) ||
                content.includes("TASK") ||
                content.includes("```") ||
                content.includes("Here"))
            ) {
              const progressEntry = {
                message:
                  cleanedContent.slice(0, 60) +
                  (cleanedContent.length > 60 ? "..." : ""),
                timestamp: new Date().toISOString(),
                type: content.includes("```")
                  ? ("working" as const)
                  : thoughtIndicators.some((indicator) =>
                        content.includes(indicator),
                      )
                    ? ("thinking" as const)
                    : ("completed" as const),
              };

              // Avoid duplicate consecutive entries
              const lastEntry = agentState.progressHistory?.slice(-1)[0];
              if (!lastEntry || lastEntry.message !== progressEntry.message) {
                agentState.progressHistory = [
                  ...(agentState.progressHistory || []).slice(-4), // Keep last 5
                  progressEntry,
                ];
              }
            }

            // Update token count (rough estimate)
            agentState.totalTokens =
              (agentState.totalTokens || 0) + Math.ceil(content.length / 4);

            updated.set(chunk.agent, agentState);
            return updated;
          });

          // Accumulate content for this agent
          const currentContent = agentMessages.get(chunk.agent) || "";
          const newContent = currentContent + content;
          agentMessages.set(chunk.agent, newContent);

          // Update streaming message in real-time with smooth animation
          setMessages((prev) => {
            const updated = [...prev];
            const streamingIndex = updated.findIndex(
              (m) => m.id === `msg-streaming-${chunk.agent}`,
            );
            if (streamingIndex !== -1) {
              updated[streamingIndex] = {
                ...updated[streamingIndex],
                content: newContent,
                timestamp: new Date(),
                streaming: true, // Add streaming flag for UI styling
              };
            } else {
              // CRITICAL FIX: If no streaming message exists, create one AND ensure agent is added to agents
              console.log(`🚀 EVENT SWARM FIX: Creating streaming message for new agent: ${chunk.agent}`);
              
              // Add agent to agents Map if not exists
              setAgents(prev => {
                const agentExists = prev.has(chunk.agent);
                if (!agentExists) {
                  console.log(`🚀 EVENT SWARM FIX: Auto-adding missing agent to agents: ${chunk.agent}`);
                  const newAgentMap = new Map(prev);
                  newAgentMap.set(chunk.agent, {
                    name: chunk.agent,
                    role: 'Event-driven agent',
                    status: 'working',
                    contentPreview: '',
                    currentThought: 'Processing...',
                    currentTask: 'Analyzing task...',
                    lastActivity: new Date().toISOString(),
                    outputCount: 0,
                    toolsUsed: [],
                    recentActions: [],
                    progressHistory: [],
                    totalTokens: 0,
                    executionTime: 0,
                    successRate: 95,
                    aiReasoning: undefined,
                    taskComplete: false
                  });
                  return newAgentMap;
                }
                return prev;
              });
              
              updated.push({
                id: `msg-streaming-${chunk.agent}`,
                agent: chunk.agent,
                content: newContent,
                timestamp: new Date(),
                type: "message" as const,
                streaming: true,
              });
            }
            return updated;
          });

          // Subagent token into timeline if mapped
          try {
            const parentName = String(subAgentParentRef.current.get(chunk.agent) || '');
            if (parentName && content) {
              setSubTimeline(prev => [
                ...prev,
                ({ id: `subtok-${Date.now()}`, parent: parentName, agent: String(chunk.agent), type: 'token' as const, preview: String(content).slice(0, 60), ts: Date.now() } as SubTimelineItem)
              ].slice(-500));
            }
          } catch {}

          // Auto-scroll to bottom as content streams
          setTimeout(() => {
            const messagesContainer = document.querySelector(
              ".messages-container",
            );
            if (messagesContainer) {
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
          }, 50);
        }
        break;

      case "agent_done":
      case "agent_completed":
        if (chunk.agent) {
          updateAgentStatus(chunk.agent, "complete");
          // Close out subagent in timeline
          try {
            const parentName = String(subAgentParentRef.current.get(chunk.agent) || '');
            if (parentName) setSubTimeline(prev => [
              ...prev,
              ({ id: `subdone-${Date.now()}`, parent: parentName, agent: String(chunk.agent), type: 'done' as const, ts: Date.now() } as SubTimelineItem)
            ].slice(-500));
          } catch {}

          // Finalize the streaming message
          const content = agentMessages.get(chunk.agent) || "";
          setMessages((prev) => {
            const updated = [...prev];
            const streamingIndex = updated.findIndex(
              (m) => m.id === `msg-streaming-${chunk.agent}`,
            );
            if (streamingIndex !== -1) {
              // Replace streaming message with final message
              updated[streamingIndex] = {
                id: `msg-${Date.now()}-${chunk.agent}`,
                agent: chunk.agent,
                content: content || updated[streamingIndex].content,
                timestamp: new Date(),
                type: "message" as const,
                streaming: false, // Mark streaming as complete
              };
            }
            return updated;
          });

          // Clear the buffer for this agent
          agentMessages.set(chunk.agent, "");

          handleSwarmEvent({
            id: Date.now().toString(),
            type: "agent.completed",
            data: { agent: chunk.agent, content: chunk.content || "" },
            timestamp: Date.now(),
            agent: chunk.agent,
            severity: 'success',
          });
        }
        break;

      case "handoff":
        const from = chunk.from || chunk.data?.from || "?";
        const to = chunk.to || chunk.data?.to || "?";

        setMessages((prev) => [
          ...prev,
          {
            id: `handoff-${Date.now()}`,
            agent: "system",
            content: `🔄 **Handoff:** ${from} → ${to}${chunk.reason ? `\n*Reason: ${chunk.reason}*` : ""}`,
            timestamp: new Date(),
            type: "handoff" as const,
          },
        ]);

        handleSwarmEvent({
          id: Date.now().toString(),
          type: "agent.handoff",
          data: { from, to, reason: chunk.reason },
          timestamp: Date.now(),
          severity: 'info',
        });
        break;

      case "ai_decision":
      case "debug_log":
        // Handle AI decision data from backend
        console.log("🧠 Processing AI decision chunk:", chunk);
        console.log("🧠 Chunk type:", chunk.type, "Agent:", chunk.agent, "Data:", chunk.data);
        console.log("🚨 ENTERING AI DECISION PROCESSING BRANCH!");
        const agentName = chunk.agent || chunk.data?.agent;
        if (agentName) {
          let aiDecision: any = null;
          
          // Try to parse AI decision from different formats
          if (chunk.data && chunk.data.decision) {
            // Direct decision data from streaming callback
            try {
              const decisionText = chunk.data.decision;
              if (typeof decisionText === "string") {
                // Extract JSON from the decision text
                const jsonMatch = decisionText.match(/\{.*\}/s);
                if (jsonMatch) {
                  aiDecision = JSON.parse(jsonMatch[0]);
                }
              } else {
                aiDecision = decisionText;
              }
            } catch (e) {
              console.warn("Failed to parse AI decision from streaming data:", e);
            }
          } else if (chunk.data && chunk.data.content) {
            // Legacy format: parse from log content
            const logContent = chunk.data.content || chunk.content || "";
            const aiDecisionMatch = logContent.match(/AI decision for [^:]+: ({.*})/);
            if (aiDecisionMatch) {
              try {
                aiDecision = JSON.parse(aiDecisionMatch[1]);
              } catch (e) {
                console.warn("Failed to parse AI decision from log content:", e);
              }
            }
          }
          
          if (aiDecision) {
            try {
              
              // Update agent with AI reasoning
              setAgents((prev) => {
                const updated = new Map(prev);
                const agentState = updated.get(agentName) || {
                  name: agentName,
                  role: agentName,
                  status: "working" as const,
                  outputCount: 0,
                  lastActivity: new Date().toISOString(),
                  content: "",
                  recentActions: [],
                  toolsUsed: [],
                  progressHistory: [],
                  contentPreview: "",
                  totalTokens: 0,
                  executionTime: 0,
                  successRate: 100,
                  currentThought: "",
                  currentTask: "",
                  aiReasoning: undefined,
                  taskComplete: false,
                } as AgentState;

                // Add AI reasoning data
                console.log("🔍 Updating agent state with AI reasoning:", aiDecision);
                agentState.aiReasoning = aiDecision;
                agentState.currentThought = aiDecision.reasoning || "Processing...";
                agentState.currentTask = aiDecision.next_phase || "Analyzing task...";
                agentState.taskComplete = aiDecision.task_complete || false;
                console.log("🔍 Agent state updated:", agentState);
                console.log("🚨 AGENT STATE UPDATE - AI REASONING SET TO:", agentState.aiReasoning);

                // Add to progress history
                const progressEntry = {
                  message: aiDecision.reasoning || "AI decision made",
                  timestamp: new Date().toISOString(),
                  type: "ai_reasoning" as const,
                };
                agentState.progressHistory = [
                  ...(agentState.progressHistory || []).slice(-9),
                  progressEntry,
                ];

                updated.set(agentName, agentState);
                return updated;
              });

              // Add event for timeline
              handleSwarmEvent({
                id: Date.now().toString(),
                type: "ai.decision",
                data: { 
                  agent: agentName, 
                  decision: aiDecision,
                  reasoning: aiDecision.reasoning,
                  neededAgents: aiDecision.needed_agents || []
                },
                timestamp: Date.now(),
                agent: agentName,
                severity: 'info',
              });
            } catch (e) {
              console.warn("Failed to parse AI decision JSON:", e);
            }
          }

          // Also check for agent spawn events in log content if available
          const logContent = chunk.data?.content || chunk.content || "";
          const spawnMatch = logContent.match(/Event emitted: agent\.needed from ([^:]+)/);
          if (spawnMatch) {
            const agentName = spawnMatch[1];
            handleSwarmEvent({
              id: Date.now().toString(),
              type: "agent.spawn_requested",
              data: { 
                requester: agentName,
                log: logContent
              },
              timestamp: Date.now(),
              agent: agentName,
              severity: 'info',
            });
          }
        }
        break;

      case "tool_use":
      case "tool":
        if (chunk.agent && (chunk.tool || chunk.data?.tool)) {
          const tool = chunk.tool || chunk.data?.tool;

          // Update agent with tool usage tracking
          setAgents((prev) => {
            const updated = new Map(prev);
            const agentState = updated.get(chunk.agent);
            if (agentState) {
              // Add to tools used
              const toolEntry = {
                name: tool,
                timestamp: new Date().toISOString(),
              };
              agentState.toolsUsed = [
                ...(agentState.toolsUsed || []).slice(-9), // Keep last 10
                toolEntry,
              ];

              // Add to recent actions
              const actionEntry = {
                type: "tool_use",
                description: `Using ${tool}`,
                timestamp: new Date().toISOString(),
              };
              agentState.recentActions = [
                ...(agentState.recentActions || []).slice(-4), // Keep last 5
                actionEntry,
              ];

              agentState.currentThought = `Using tool: ${tool}`;
              agentState.currentTask = `Executing ${tool}...`;
              agentState.lastActivity = new Date().toISOString();
              updated.set(chunk.agent, agentState);
            }
            return updated;
          });

          setMessages((prev) => [
            ...prev,
            {
              id: `tool-${Date.now()}`,
              agent: "system",
              content: `🔧 **${chunk.agent}** is using tool: **${tool}**`,
              timestamp: new Date(),
              type: "system" as const,
            },
          ]);

          handleSwarmEvent({
            id: Date.now().toString(),
            type: "tool.execution",
            data: { agent: chunk.agent, tool },
            timestamp: Date.now(),
            agent: chunk.agent,
            severity: 'info',
          });
        }
        break;

      case "error":
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            agent: "system",
            content: `❌ **Error:** ${chunk.message || chunk.error || "Unknown error"}`,
            timestamp: new Date(),
            type: "system" as const,
          },
        ]);

        handleSwarmEvent({
          id: Date.now().toString(),
          type: "error",
          data: { message: chunk.message || chunk.error },
          timestamp: Date.now(),
          severity: 'error',
        });
        break;
    }
  };

  const copyMessage = (message: Message) => {
    navigator.clipboard.writeText(message.content);
    setCopiedId(message.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ===== Session history management (similar to /swarm) =====
  const HISTORY_KEY = 'event_swarm_session_history';
  const CURRENT_SESSION_KEY = 'event_swarm_current_session_id';

  const loadSessionHistory = useCallback(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setSessionHistory(JSON.parse(raw));
    } catch {}
  }, []);

  const persistHistory = (history: SessionData[]) => {
    setSessionHistory(history);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}
  };

  const persistNewSession = (sid: string, initialTask: string) => {
    const now = new Date().toISOString();
    const initial: SessionData = {
      id: sid,
      title: initialTask?.slice(0, 50) || 'New Chat',
      messages: [
        { id: `u-${Date.now()}`, role: 'user', content: initialTask, timestamp: now }
      ],
      timestamp: now,
      lastMessage: initialTask?.slice(0, 100)
    };
    const existing = sessionHistory.filter(s => s.id !== sid);
    const updated = [initial, ...existing].slice(0, 50);
    persistHistory(updated);
    try { localStorage.setItem(CURRENT_SESSION_KEY, sid); } catch {}
  };

  const saveCurrentSessionSnapshot = (sid: string) => {
    const now = new Date().toISOString();
    const transformed: PersistedMessage[] = messages.map(m => ({
      id: m.id,
      role: m.agent === 'user' ? 'user' : (m.type === 'system' ? 'system' : 'assistant'),
      content: m.content,
      agent: m.agent,
      timestamp: m.timestamp.toISOString(),
    }));
    const title = transformed[0]?.content?.slice(0, 50) || 'Chat';
    const last = transformed[transformed.length - 1]?.content?.slice(0, 100) || '';

    const updated = sessionHistory.map(s => s.id === sid ? ({
      ...s,
      title,
      messages: transformed,
      timestamp: now,
      lastMessage: last,
    }) : s);
    persistHistory(updated);
  };

  const createNewSession = () => {
    // Reset local UI state and clear execution context
    setTask("");
    setIsExecuting(false);
    isExecutingRef.current = false;
    setEvents([]);
    setAgents(new Map());
    setHumanQuestions([]);
    setHumanApprovals([]);
    setMessages([]);
    setAutoScroll(true);
    setExecutionId(null);
    const newId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setSessionId(newId);
    try { localStorage.setItem(CURRENT_SESSION_KEY, newId); } catch {}
  };

  const deleteSession = (sid: string) => {
    const updated = sessionHistory.filter(s => s.id !== sid);
    persistHistory(updated);
    if (sessionId === sid) {
      setSessionId(null);
      setMessages([]);
      setExecutionId(null);
    }
  };

  const renameSession = (sid: string, newTitle: string) => {
    const updated = sessionHistory.map(s => s.id === sid ? { ...s, title: newTitle } : s);
    persistHistory(updated);
    setEditingSessionId(null);
    setEditingTitle("");
  };

  const loadSession = (sid: string) => {
    const s = sessionHistory.find(x => x.id === sid);
    setSessionId(sid);
    try { localStorage.setItem(CURRENT_SESSION_KEY, sid); } catch {}
    if (!s) return;
    const restored: Message[] = (s.messages || []).map(pm => ({
      id: pm.id,
      agent: pm.agent || (pm.role === 'user' ? 'user' : 'assistant'),
      content: pm.content,
      timestamp: new Date(pm.timestamp),
      type: pm.role === 'system' ? 'system' : 'message',
    }));
    setMessages(restored);
    setTask("");
    setIsExecuting(false);
    isExecutingRef.current = false;
    setExecutionId(null);
  };

  useEffect(() => {
    loadSessionHistory();
    try {
      const sid = localStorage.getItem(CURRENT_SESSION_KEY);
      if (sid) setSessionId(sid);
    } catch {}
  }, [loadSessionHistory]);

  const answerQuestion = async (questionId: string) => {
    const token = localStorage.getItem("access_token");
    if (!token || !currentAnswer.trim()) return;

    try {
      await fetch("http://localhost:8000/api/v1/event-swarm/human/answer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          question_id: questionId,
          answer: currentAnswer,
        }),
      });

      // Remove question from list
      setHumanQuestions((prev) => prev.filter((q) => q.id !== questionId));
      setCurrentAnswer("");
    } catch (error) {
      console.error("Failed to submit answer:", error);
    }
  };

  const provideApproval = async (approvalId: string, approved: boolean) => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    try {
      await fetch("http://localhost:8000/api/v1/event-swarm/human/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          approval_id: approvalId,
          approved,
          reason: approved ? "User approved" : "User rejected",
        }),
      });

      // Remove approval from list
      setHumanApprovals((prev) => prev.filter((a) => a.id !== approvalId));
    } catch (error) {
      console.error("Failed to submit approval:", error);
    }
  };

  const getEventIcon = (type: string) => {
    if (type.startsWith("agent.")) return <Bot className="h-4 w-4" />;
    if (type.startsWith("human.")) return <User className="h-4 w-4" />;
    if (type.startsWith("task.")) return <CheckCircle className="h-4 w-4" />;
    if (type.startsWith("tool.")) return <Zap className="h-4 w-4" />;
    return <Activity className="h-4 w-4" />;
  };

  const getEventColor = (type: string) => {
    if (type.includes("complete")) return "text-green-500";
    if (type.includes("error") || type.includes("failed"))
      return "text-red-500";
    if (type.includes("started") || type.includes("spawned"))
      return "text-blue-500";
    if (type.includes("human")) return "text-purple-500";
    return "text-muted-foreground";
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      {/* Sidebar: New Chat + History */}
      <motion.div
        className={`${sidebarCollapsed ? 'w-16' : 'w-72'} bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-all duration-300 shadow-xl flex-shrink-0`}
        initial={{ x: -320 }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        style={{ maxWidth: sidebarCollapsed ? '64px' : '288px' }}
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center' : ''}`}>
              <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              {!sidebarCollapsed && (
                <div>
                  <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Event Swarm</h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Event-driven orchestration</p>
                </div>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-1">
              <ChevronRight className={`h-4 w-4 transition-transform ${sidebarCollapsed ? '' : 'rotate-180'}`} />
            </Button>
          </div>
        </div>

        {!sidebarCollapsed && (
          <div className="p-3">
            <Button onClick={createNewSession} className="w-full justify-start gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white">
              <Plus className="h-4 w-4" />
              New Chat
            </Button>
          </div>
        )}

        {!sidebarCollapsed && (
          <ScrollArea className="flex-1 px-3">
            <div className="space-y-1 py-2">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-2 mb-2 flex items-center justify-between">
                <span>RECENT CHATS</span>
                <History className="h-3 w-3" />
              </div>
              {sessionHistory.length === 0 ? (
                <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">No chat history yet</div>
              ) : (
                sessionHistory.map((s) => (
                  <div
                    key={s.id}
                    className={`group relative flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                      s.id === sessionId ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                    onClick={() => loadSession(s.id)}
                  >
                    <FileText className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      {editingSessionId === s.id ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Input
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') renameSession(s.id, editingTitle); }}
                            className="h-6 text-xs"
                            autoFocus
                          />
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => renameSession(s.id, editingTitle)}>
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setEditingSessionId(null); setEditingTitle(''); }}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="text-sm font-medium truncate">{s.title}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{new Date(s.timestamp).toLocaleDateString()}</div>
                        </>
                      )}
                    </div>
                    {!editingSessionId && (
                      <div className="absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); setEditingSessionId(s.id); setEditingTitle(s.title); }}>
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-600 hover:text-red-700" onClick={(e) => { e.stopPropagation(); if (window.confirm('Delete this chat?')) deleteSession(s.id); }}>
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

        {!sidebarCollapsed && (
          <div className="p-3 border-t border-gray-200 dark:border-gray-800">
            <Card className="p-2 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-1">
                <Database className="h-3 w-3 text-blue-600" />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Current Session</span>
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                <div>Messages: {messages.length}</div>
                <div>Agents: {agents.size}</div>
              </div>
            </Card>
          </div>
        )}
      </motion.div>

      {/* Main Chat + Right Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar with stats and quick controls */}
        <div className="bg-white/70 dark:bg-gray-900/70 backdrop-blur border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-blue-600" />
            <div className="text-sm text-gray-600 dark:text-gray-300">Messages: {messages.length}</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">Active: {activeAgentCount}</div>
            <div className="text-sm text-gray-600 dark:text-gray-300">Events: {totalEvents}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowSettingsHub(true)} className="gap-2">
              <Settings className="h-4 w-4" /> Settings
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowToolsHub(true)} className="gap-2">
              <Wrench className="h-4 w-4" /> Tools Hub
            </Button>
            {isExecuting && executionId && (
              <Badge variant="outline" className="text-xs">{executionId.slice(0,8)}...</Badge>
            )}
          </div>
        </div>

        {/* Chat + Subtask Timeline */}
        <div className="flex-1 relative overflow-hidden flex">
          {/* Subtask vertical timeline */}
          <div className="hidden lg:block w-64 border-r border-gray-200 dark:border-gray-800 p-3 overflow-y-auto">
            <div className="text-sm font-semibold mb-2">Subtask Timeline</div>
            {/* Group by parent */}
            {Array.from(new Set(subTimeline.map(t => t.parent))).map(parent => (
              <div key={parent} className="mb-4">
                <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{parent}</div>
                <div className="pl-2 border-l border-gray-300 dark:border-gray-700 space-y-1">
                  {subTimeline.filter(t => t.parent===parent).map(item => (
                    <div key={item.id} className="text-xs text-gray-700 dark:text-gray-300">
                      <span className={`inline-block w-2 h-2 rounded-full mr-2 ${item.type==='start'?'bg-blue-500':item.type==='done'?'bg-green-500':'bg-purple-500'}`}></span>
                      <span className="font-medium">{item.agent}</span>
                      {item.type==='token' && item.preview ? <span className="text-gray-500 ml-1">{item.preview}</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {subTimeline.length===0 && (
              <div className="text-xs text-gray-500">No subtasks yet</div>
            )}
          </div>
          <div className="flex-1 relative">
            <div ref={messagesContainerRef} className="messages-container absolute inset-0 overflow-y-auto p-6 space-y-4" onScroll={handleScroll}>
            {messages.length === 0 && !isExecuting && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Bot className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Ready for Execution</h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-md">Describe your task below and press Run. Agents will collaborate to complete it.</p>
              </div>
            )}

            {messages.map((m) => (
              <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                <div className={`flex ${m.agent === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <Card className={`max-w-[min(70%,42rem)] ${m.agent === 'user' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900'} shadow`}> 
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`p-1.5 rounded-md ${m.agent === 'user' ? 'bg-blue-500/40' : 'bg-gray-100 dark:bg-gray-800'}`}>
                          {m.agent === 'user' ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                        </div>
                        <div className="text-xs opacity-70">
                          {m.agent === 'user' ? 'You' : m.agent} · {m.timestamp.toLocaleTimeString()}
                        </div>
                        {m.streaming && (
                          <Badge variant="outline" className="text-[10px]">Streaming…</Badge>
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={() => copyMessage(m)}>
                          {copiedId === m.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown
                          components={{
                            code({ node, className, children, ...props }: any) {
                              const match = /language-(\w+)/.exec(className || '');
                              const inline = !match;
                              return !inline && match ? (
                                <SyntaxHighlighter style={vscDarkPlus as any} language={match[1]} PreTag="div" {...props}>
                                  {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                              ) : (
                                <code className={className} {...props}>{children}</code>
                              );
                            }
                          }}
                        >
                          {m.content}
                        </ReactMarkdown>
                        {m.streaming && <span className="inline-block w-1 h-4 bg-blue-500 ml-1 animate-pulse" />}
                      </div>
                    </div>
                  </Card>
                </div>
              </motion.div>
            ))}
            </div>
          </div>

          {!autoScroll && (
            <Button onClick={scrollToBottom} size="sm" variant="secondary" className="absolute bottom-4 right-4 rounded-full shadow-lg">
              <ArrowDown className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Bottom input bar */}
        <div className="border-t border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur p-3">
          <div className="max-w-4xl mx-auto flex items-center gap-2">
            <Input
              placeholder="Describe the task for the swarm..."
              value={task}
              onChange={(e) => setTask(e.target.value)}
              disabled={isExecuting}
              onKeyDown={(e) => { if (e.key === 'Enter' && task.trim() && !isExecuting) executeSwarm(); }}
            />
            {!isExecuting ? (
              <Button onClick={() => executeSwarm()} disabled={!task.trim()} className="gap-2">
                <Send className="h-4 w-4" /> Run
              </Button>
            ) : (
              <Button onClick={stopExecution} variant="destructive" className="gap-2">
                <StopCircle className="h-4 w-4" /> Stop
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Right: Monitor only */}
      <div className="w-96 bg-white/70 dark:bg-gray-900/70 backdrop-blur border-l border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="p-3 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4" /> Monitor
        </div>
        <div className="flex-1 overflow-hidden">
          <AgentMonitor agents={agents} events={events} isExecuting={isExecuting} executionId={executionId} />
        </div>
      </div>

      {/* Slide-over Tools Hub (mirrors /swarm/tools structure) */}
      <AnimatePresence>
        {showToolsHub && (
          <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowToolsHub(false)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'tween', duration: 0.25 }} className="absolute right-0 top-0 h-full w-[min(100%,1100px)] bg-white dark:bg-gray-900 shadow-xl border-l border-gray-200 dark:border-gray-800 flex flex-col">
              {/* Header */}
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-blue-600" />
                  <div className="font-semibold">Swarm Tools</div>
                  <div className="text-xs text-gray-500">{availableTools.length} tools</div>
                </div>
                <div className="flex items-center gap-2">
                  <Input placeholder="Search tools..." value={toolSearch} onChange={e=>setToolSearch(e.target.value)} />
                  <Button size="sm" variant="ghost" onClick={() => setToolsViewMode(toolsViewMode==='grid'?'list':'grid')}>
                    {toolsViewMode==='grid' ? <List className="h-4 w-4" /> : <Grid3x3 className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setShowToolsHub(false)}>Apply</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowToolsHub(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {/* Body */}
              <div className="flex-1 flex overflow-hidden">
                {/* Categories */}
                <div className="w-72 border-r border-gray-200 dark:border-gray-800 p-3 overflow-y-auto">
                  <div className="text-xs font-semibold mb-2">Categories</div>
                  <div className="space-y-1">
                    <button onClick={() => setSelectedCategory(null)} className={`w-full text-left px-3 py-2 rounded-lg ${selectedCategory===null?'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300':'hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                      All Tools <span className="text-xs text-gray-500">{availableTools.length}</span>
                    </button>
                    {orderedCategories.map(cat => (
                      <button key={cat} onClick={() => setSelectedCategory(cat)} className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between ${selectedCategory===cat?'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300':'hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                        <span>{cat}</span>
                        <span className="text-xs text-gray-500">{(groupedTools[cat]||[]).length}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 text-xs flex items-center gap-2">
                    <input id="restrictTools2" type="checkbox" className="rounded" checked={restrictToSelected} onChange={e=>setRestrictToSelected(e.target.checked)} />
                    <label htmlFor="restrictTools2">Restrict to selected tools</label>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={selectAllTools}>Select All</Button>
                    <Button size="sm" variant="secondary" onClick={clearAllTools}>Clear</Button>
                  </div>
                </div>
                {/* Tools list */}
                <div className="flex-1 overflow-y-auto p-4">
                  {orderedCategories.filter(cat => !selectedCategory || cat===selectedCategory).map(cat => {
                    const tools = (groupedTools[cat]||[]).filter(t=>t.toLowerCase().includes(toolSearch.toLowerCase()));
                    if (!tools.length) return null;
                    return (
                      <div key={cat} className="mb-6">
                        <div className="text-sm font-semibold mb-2">{cat} <span className="text-xs text-gray-500">{tools.length}</span></div>
                        {toolsViewMode==='grid' ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {tools.map(t => (
                              <div key={t} className={`border rounded-lg p-3 ${selectedTools.has(t)?'border-blue-500 bg-blue-50 dark:bg-blue-900/20':'border-gray-200 dark:border-gray-800'}`}>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="font-medium truncate">{t}</div>
                                  <Button size="sm" variant={selectedTools.has(t)?'default':'outline'} onClick={()=>toggleTool(t)}>{selectedTools.has(t)?'Selected':'Select'}</Button>
                                </div>
                                {toolDetails[t]?.description && (
                                  <div className="text-xs text-gray-500 mt-1 line-clamp-2">{toolDetails[t]?.description}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-200 dark:divide-gray-800">
                            {tools.map(t => (
                              <div key={t} className="py-2 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="font-medium truncate">{t}</div>
                                  {toolDetails[t]?.description && (
                                    <div className="text-xs text-gray-500 truncate">{toolDetails[t]?.description}</div>
                                  )}
                                </div>
                                <Button size="sm" variant={selectedTools.has(t)?'default':'outline'} onClick={()=>toggleTool(t)}>{selectedTools.has(t)?'Selected':'Select'}</Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slide-over Settings */}
      <AnimatePresence>
        {showSettingsHub && (
          <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowSettingsHub(false)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'tween', duration: 0.25 }} className="absolute right-0 top-0 h-full w-[min(100%,560px)] bg-white dark:bg-gray-900 shadow-xl border-l border-gray-200 dark:border-gray-800 flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  <div className="font-semibold">Event Swarm Settings</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setShowSettingsHub(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-4">
                <div>
                  <div className="text-sm font-medium mb-1">Max Concurrent Agents</div>
                  <input type="number" min={1} max={10} value={maxConcurrentAgents} onChange={e=>setMaxConcurrentAgents(parseInt(e.target.value||'1'))} className="w-full border rounded-lg px-3 py-2 bg-transparent" />
                </div>
                <div>
                  <div className="text-sm font-medium mb-1">Max Total Agents</div>
                  <input type="number" min={1} max={50} value={maxTotalAgents} onChange={e=>setMaxTotalAgents(parseInt(e.target.value||'1'))} className="w-full border rounded-lg px-3 py-2 bg-transparent" />
                </div>
                <div>
                  <div className="text-sm font-medium mb-1">Max Execution Time (seconds)</div>
                  <input type="number" min={30} max={900} value={maxExecutionTime} onChange={e=>setMaxExecutionTime(parseInt(e.target.value||'30'))} className="w-full border rounded-lg px-3 py-2 bg-transparent" />
                </div>
                <div>
                  <div className="text-sm font-medium mb-1">Max Agent Runtime (seconds)</div>
                  <input type="number" min={10} max={600} value={maxAgentRuntime} onChange={e=>setMaxAgentRuntime(parseInt(e.target.value||'60'))} className="w-full border rounded-lg px-3 py-2 bg-transparent" />
                </div>
                <div className="flex items-center gap-2">
                  <input id="hil" type="checkbox" className="rounded" checked={enableHumanLoop} onChange={e=>setEnableHumanLoop(e.target.checked)} />
                  <label htmlFor="hil" className="text-sm">Enable Human-in-the-Loop</label>
                </div>
              </div>
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setShowSettingsHub(false)}>Close</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
