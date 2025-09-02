import React, { useState, useEffect, useRef } from "react";
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
    setMessages([]);
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
          data.status === "failed"
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
                    progress: 50,
                    tasks: 0,
                    recentActions: [],
                    progressHistory: [],
                    totalTokens: 0,
                    executionTime: 0,
                    successRate: 95
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
    return "text-gray-500";
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Enhanced Header with Stats */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Event-Driven Swarm
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Intelligent multi-agent execution platform
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Real-time Stats */}
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4 text-blue-500" />
                <span className="font-medium">{agents.size}</span>
                <span className="text-gray-500">agents</span>
              </div>
              <div className="flex items-center gap-1">
                <Activity className="h-4 w-4 text-green-500" />
                <span className="font-medium">{activeAgentCount}</span>
                <span className="text-gray-500">active</span>
              </div>
              <div className="flex items-center gap-1">
                <BarChart3 className="h-4 w-4 text-purple-500" />
                <span className="font-medium">{totalEvents}</span>
                <span className="text-gray-500">events</span>
              </div>
            </div>

            {/* Execution Status */}
            {isExecuting && (
              <div className="flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900 rounded-full">
                <RefreshCw className="h-4 w-4 text-green-600 animate-spin" />
                <span className="text-sm font-medium text-green-700 dark:text-green-300">
                  Executing
                </span>
              </div>
            )}

            {executionId && (
              <Badge variant="outline" className="text-xs">
                {executionId.slice(0, 8)}...
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Task Input & Controls */}
        <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          {/* Task Input */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Task Description
                </label>
                <Textarea
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder="Describe what you want the swarm to accomplish..."
                  className="mt-1 min-h-[80px] resize-none"
                  disabled={isExecuting}
                />
              </div>
              
              <div className="flex gap-2">
                <Button
                  onClick={() => executeSwarm()}
                  disabled={isExecuting || !task.trim()}
                  className="flex-1"
                >
                  {isExecuting ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Running
                    </>
                  ) : (
                    <>
                      <PlayCircle className="h-4 w-4 mr-2" />
                      Execute
                    </>
                  )}
                </Button>

                {isExecuting && executionId && (
                  <Button
                    onClick={stopExecution}
                    variant="destructive"
                    size="icon"
                  >
                    <StopCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Configuration */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <Button
              onClick={() => setShowConfig(!showConfig)}
              variant="ghost"
              className="w-full justify-between"
            >
              <span className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Configuration
              </span>
              {showConfig ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>

            {showConfig && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Max Concurrent ({maxConcurrentAgents})
                  </label>
                  <Input
                    type="range"
                    min="1"
                    max="10"
                    value={maxConcurrentAgents}
                    onChange={(e) => setMaxConcurrentAgents(parseInt(e.target.value) || 3)}
                    disabled={isExecuting}
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Max Total Agents ({maxTotalAgents})
                  </label>
                  <Input
                    type="range"
                    min="1"
                    max="20"
                    value={maxTotalAgents}
                    onChange={(e) => setMaxTotalAgents(parseInt(e.target.value) || 8)}
                    disabled={isExecuting}
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Execution Timeout ({maxExecutionTime}s)
                  </label>
                  <Input
                    type="range"
                    min="30"
                    max="600"
                    value={maxExecutionTime}
                    onChange={(e) => setMaxExecutionTime(parseInt(e.target.value) || 180)}
                    disabled={isExecuting}
                    className="mt-1"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="humanLoop"
                    checked={enableHumanLoop}
                    onChange={(e) => setEnableHumanLoop(e.target.checked)}
                    disabled={isExecuting}
                    className="rounded"
                  />
                  <label htmlFor="humanLoop" className="text-xs font-medium">
                    Human-in-the-Loop
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="p-4 space-y-2">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
              Current Session
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded">
                <div className="font-medium text-blue-600 dark:text-blue-400">Active</div>
                <div className="text-lg font-bold">{activeAgentCount}</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded">
                <div className="font-medium text-green-600 dark:text-green-400">Complete</div>
                <div className="text-lg font-bold">{completedAgentCount}</div>
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded">
              <div className="font-medium text-purple-600 dark:text-purple-400">Total Events</div>
              <div className="text-lg font-bold">{totalEvents}</div>
            </div>
          </div>
        </div>

        {/* Center - Messages/Output */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-gray-900 dark:text-gray-100">Agent Output</h2>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{messages.length} messages</span>
                {recentEvents > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {recentEvents} new
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 relative overflow-hidden">
            <div
              ref={messagesContainerRef}
              className="messages-container absolute inset-0 overflow-y-auto p-4"
              onScroll={handleScroll}
            >
              {messages.length === 0 && !isExecuting && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Bot className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                    Ready for Execution
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 max-w-md">
                    Enter a task description and click Execute to start the swarm. 
                    Agents will collaborate to complete your task.
                  </p>
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "mb-4 group",
                    message.type === "handoff" && "text-center",
                    message.type === "system" && "text-center",
                  )}
                >
                  {message.type === "message" && (
                    <div className="flex items-start gap-3 max-w-4xl">
                      <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {message.agent}
                          </span>
                          <span className="text-xs text-gray-500">
                            {message.timestamp.toLocaleTimeString()}
                          </span>
                          {message.streaming && (
                            <Badge variant="outline" className="text-xs">
                              Streaming...
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => copyMessage(message)}
                          >
                            {copiedId === message.id ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                        <div className="prose prose-sm dark:prose-invert max-w-none bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                          {message.streaming && (
                            <span className="inline-block w-1 h-4 bg-blue-500 ml-1 animate-pulse" />
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {(message.type === "handoff" || message.type === "system") && (
                    <div className="flex justify-center mb-4">
                      <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-full text-sm">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Scroll to bottom button */}
            {!autoScroll && (
              <Button
                onClick={scrollToBottom}
                size="sm"
                variant="secondary"
                className="absolute bottom-4 right-4 rounded-full shadow-lg"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Right Sidebar - Agent Monitor */}
        <div className="w-96 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">
          <AgentMonitor
            agents={agents}
            events={events}
            isExecuting={isExecuting}
            executionId={executionId}
          />
        </div>
      </div>
    </div>
  );
};