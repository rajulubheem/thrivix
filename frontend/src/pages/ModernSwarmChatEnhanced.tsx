import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Users, 
  Bot, 
  Activity, 
  Zap, 
  Brain,
  Settings,
  Loader2,
  UserPlus,
  History,
  Code2,
  FileText,
  Copy,
  Download,
  Check,
  CheckCircle,
  MessageSquare,
  Calendar,
  ArrowRight,
  Terminal,
  TrendingUp,
  RefreshCw,
  X,
  Send,
  Play,
  Clock,
  ExternalLink,
  Trash2,
  Sparkles
} from 'lucide-react';
import { ModernLayout } from '../components/layout/ModernLayout';
import { ModernChatInterface } from '../components/chat/ModernChatInterface';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
// import { ScrollArea } from '../components/ui/scroll-area';
import { Separator } from '../components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '../components/ui/dialog';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '../components/ui/dropdown-menu';
import { cn } from '../lib/utils';
import { ActivityTimeline, TimelineEvent } from '../components/ActivityTimeline';
import { StreamEventParser } from '../utils/streamParser';
import { EnhancedStreamParser } from '../utils/enhancedStreamParser';

// Import styles
import '../styles/enhanced-sidebar.css';

// Import hooks
import { useStreamingPolling } from '../hooks/useStreamingPolling';
import { useChatSessions } from '../hooks/useChatSessions';
import { chatApi } from '../services/chatApi';

interface LocalAgent {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'thinking' | 'executing' | 'completed' | 'waiting';
  progress: number;
  icon: React.ElementType;
  color: string;
  tasks: number;
  successRate: number;
  currentTask?: string;
  toolsUsed?: string[];
  lastUpdate?: string;
}

interface ToolExecution {
  id: string;
  agent: string;
  tool: string;
  parameters?: any;
  result?: any;
  status: 'executing' | 'success' | 'error';
  timestamp: Date;
}

interface Artifact {
  id: string;
  type: 'code' | 'document' | 'data';
  title: string;
  content: string;
  language?: string;
  agent: string;
  timestamp: Date;
}

const availableAgents: LocalAgent[] = [
  {
    id: 'research_agent',
    name: 'Research Agent',
    role: 'Information gathering',
    status: 'idle',
    progress: 0,
    icon: Brain,
    color: 'text-purple-500',
    tasks: 0,
    successRate: 98.5
  },
  {
    id: 'code_assistant',
    name: 'Code Assistant',
    role: 'Programming support',
    status: 'idle',
    progress: 0,
    icon: Bot,
    color: 'text-blue-500',
    tasks: 0,
    successRate: 96.2
  },
  {
    id: 'data_analyst',
    name: 'Data Analyst',
    role: 'Data processing',
    status: 'idle',
    progress: 0,
    icon: Activity,
    color: 'text-green-500',
    tasks: 0,
    successRate: 97.8
  },
  {
    id: 'ux_researcher',
    name: 'UX Researcher',
    role: 'User experience',
    status: 'idle',
    progress: 0,
    icon: Zap,
    color: 'text-yellow-500',
    tasks: 0,
    successRate: 94.5
  }
];

export const ModernSwarmChatEnhanced: React.FC = () => {
  const { sessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  const location = window.location;
  
  // Session management hook
  const {
    sessions,
    currentSession,
    loading: sessionLoading,
    createSession,
    loadSession,
    updateSession,
    deleteSession,
    refreshSessions,
    refreshCurrentSession
  } = useChatSessions();

  // State management
  const [messages, setMessages] = useState<any[]>([]);
  const [activeAgents, setActiveAgents] = useState<LocalAgent[]>([]);
  const [sessionAgentsMap, setSessionAgentsMap] = useState<Map<string, LocalAgent[]>>(new Map());
  const [streamingSessionId, setStreamingSessionId] = useState<string | null>(null);
  const [selectedAgentFilter, setSelectedAgentFilter] = useState<string | null>(null);
  const [agentUpdateThrottle, setAgentUpdateThrottle] = useState<Map<string, number>>(new Map());
  const [orchestratorAgentConfigs, setOrchestratorAgentConfigs] = useState<any[]>([]);
  const [hasAutoExecuted, setHasAutoExecuted] = useState(false);  // Prevent duplicate auto-executions
  const [lastExecutedAgents, setLastExecutedAgents] = useState<any[]>([]);  // Store agents from last execution
  const [useDynamicAgents, setUseDynamicAgents] = useState(true);  // Default to dynamic agents
  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [isSwarmActive, setIsSwarmActive] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<string[]>(['research_agent', 'ux_researcher']);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedArtifact, setCopiedArtifact] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [sidebarView, setSidebarView] = useState<'tabs' | 'timeline'>('tabs');
  
  // Refs for stream parsing
  const streamParser = useRef(new StreamEventParser());
  const enhancedParser = useRef(new EnhancedStreamParser());
  const processedEventsRef = useRef(new Set<string>());
  const lastProcessedContentRef = useRef<Map<string, string>>(new Map());
  const activeSessionIdRef = useRef<string | null>(null);
  
  // Metrics
  const [swarmMetrics, setSwarmMetrics] = useState({
    totalTasks: 0,
    completedTasks: 0,
    avgResponseTime: 0,
    efficiency: 0,
    activeTime: '0m'
  });

  // Debug sessions loading
  useEffect(() => {
    console.log('Sessions loaded:', sessions?.length || 0, sessions);
  }, [sessions]);

  // Load streaming session ID and agents on mount - ONLY for the current chat session
  useEffect(() => {
    // Clear any old streaming session when chat session changes
    if (sessionId) {
      const storedStreamingSession = sessionStorage.getItem(`streamingSession_${sessionId}`);
      if (storedStreamingSession) {
        setStreamingSessionId(storedStreamingSession);
        console.log('🔄✅ Restored streaming session for current chat:', storedStreamingSession);
      } else {
        // Clear any stale streaming session ID when starting a new chat
        setStreamingSessionId(null);
        console.log('🔄🆕 New chat session, clearing streaming session for:', sessionId);
      }
      
      // Also load last executed agents for this session
      const storedAgents = sessionStorage.getItem(`lastAgents_${sessionId}`);
      if (storedAgents) {
        try {
          const agents = JSON.parse(storedAgents);
          setLastExecutedAgents(agents);
          console.log('🤖 Loaded last executed agents:', agents);
        } catch (e) {
          console.error('Failed to parse stored agents:', e);
        }
      } else {
        // Clear agents when starting a new chat
        setLastExecutedAgents([]);
      }
    }
    
    // Cleanup on unmount or session change
    return () => {
      // Clear the global streaming session storage to prevent cross-session pollution
      sessionStorage.removeItem('currentStreamingSession');
      sessionStorage.removeItem('currentStreamingSessionTime');
    };
  }, [sessionId]);

  // Initialize or load session
  useEffect(() => {
    // Skip if already processing or has auto-executed
    if (hasAutoExecuted) {
      return;
    }
    
    const initSession = async () => {
      // Check if coming from enhanced orchestrator
      const orchestratorTask = sessionStorage.getItem('orchestratorTask');
      const orchestratorAgents = sessionStorage.getItem('orchestratorAgents');
      const orchestratorAutoStart = sessionStorage.getItem('orchestratorAutoStart');
      
      if (orchestratorTask && orchestratorAgents && orchestratorAutoStart === 'true') {
        // Clear the session storage IMMEDIATELY to prevent re-execution
        sessionStorage.removeItem('orchestratorTask');
        sessionStorage.removeItem('orchestratorAgents');
        sessionStorage.removeItem('orchestratorAutoStart');
        
        // Parse the agents
        const agents = JSON.parse(orchestratorAgents);
        
        // Create a new session for this enhanced orchestrator workflow
        const newSession = await createSession({
          title: `Enhanced: ${orchestratorTask.substring(0, 50)}`,
          agents_config: {
            agents: agents.map((agent: any) => ({
              id: agent.name.toLowerCase().replace(/\s+/g, '_'),
              name: agent.name,
              role: agent.description || agent.role || ''
            }))
          }
        });
        
        if (newSession?.id) {
          const sessionIdToUse = (newSession as any).session_id || newSession.id;
          
          // Store the orchestrator agents for reuse
          setOrchestratorAgentConfigs(agents);
          
          // Clear any existing streaming session to ensure fresh start with new agents
          setStreamingSessionId(null);
          sessionStorage.removeItem(`streamingSession_${sessionIdToUse}`);
          
          // Persist agents to sessionStorage so they survive refresh
          sessionStorage.setItem(`orchestratorAgents_${sessionIdToUse}`, JSON.stringify(agents));
          sessionStorage.setItem(`orchestratorTask_${sessionIdToUse}`, orchestratorTask);
          
          // Auto-execute with the orchestrator task and agents (only once)
          if (!hasAutoExecuted) {
            console.log('✅ Orchestrator agents ready. Auto-executing with task:', orchestratorTask);
            console.log('📦 Agents to execute:', agents);
            setHasAutoExecuted(true);
            
            // Wait a moment for state to settle, then execute
            setTimeout(() => {
              console.log('🚀 Auto-executing orchestrator task with agents');
              executeSwarm(orchestratorTask, agents);
            }, 500);
          }
        }
        return;
      }
      
      // Check if coming from regular orchestrator
      const urlParams = new URLSearchParams(location.search);
      if (urlParams.get('orchestrator') === 'true') {
        const workflowData = sessionStorage.getItem('orchestratorWorkflow');
        if (workflowData) {
          const workflow = JSON.parse(workflowData);
          sessionStorage.removeItem('orchestratorWorkflow');
          
          // Execute with orchestrator agents
          if (workflow.agents && workflow.agents.length > 0) {
            const agentConfigs = workflow.agents.map((agent: any) => ({
              name: agent.name,
              system_prompt: agent.system_prompt,
              tools: agent.tools || ['tavily_search']
            }));
            
            // Create a new session for this orchestrator workflow
            const newSession = await createSession({
              title: `Orchestrator: ${workflow.task?.substring(0, 50) || 'Workflow'}`,
              agents_config: {
                agents: workflow.agents.map((agent: any) => ({
                  id: agent.name.toLowerCase().replace(/\s+/g, '_'),
                  name: agent.name,
                  role: agent.role || ''
                }))
              }
            });
            
            if (newSession) {
              const sessionIdToUse = (newSession as any).session_id || newSession.id;
              
              // Store the orchestrator agents for reuse
              setOrchestratorAgentConfigs(agentConfigs);
              
              // Navigate to the new session
              navigate(`/swarm/${sessionIdToUse}`, { replace: true });
              
              // Store the task and agents for persistence across refresh
              if (workflow.task) {
                sessionStorage.setItem(`plannedTask_${sessionIdToUse}`, workflow.task);
              }
              if (agentConfigs) {
                sessionStorage.setItem(`orchestratorAgents_${sessionIdToUse}`, JSON.stringify(agentConfigs));
              }
              
              // Auto-execute with the orchestrator task and agents (only once)
              if (!hasAutoExecuted && workflow.task) {
                console.log('✅ Orchestrator workflow ready. Auto-executing with task:', workflow.task);
                console.log('📦 Agents to execute:', agentConfigs);
                setHasAutoExecuted(true);
                
                // Wait a moment for navigation and state to settle, then execute
                setTimeout(() => {
                  console.log('🚀 Auto-executing orchestrator workflow with agents');
                  executeSwarm(workflow.task, agentConfigs);
                }, 500);
              }
            }
          }
        }
        return;
      }
      
      if (sessionId) {
        // Load existing session with all messages
        console.log(`🔄 About to load session: ${sessionId}`);
        await loadSession(sessionId);
        console.log(`✅ Loaded session ${sessionId}`);
        
        // Store session ID in ref for callbacks
        activeSessionIdRef.current = sessionId;
        
        // Check if streaming session matches this chat session
        const savedStreamingSession = sessionStorage.getItem('currentStreamingSession');
        const savedStreamingSessionTime = sessionStorage.getItem('currentStreamingSessionTime');
        
        // Clear streaming session if it's stale (older than 30 minutes) or doesn't match
        if (savedStreamingSession && savedStreamingSessionTime) {
          const timeDiff = Date.now() - parseInt(savedStreamingSessionTime);
          const thirtyMinutes = 30 * 60 * 1000;
          
          if (timeDiff > thirtyMinutes) {
            console.log('🧹 Clearing stale streaming session (older than 30 minutes)');
            sessionStorage.removeItem('currentStreamingSession');
            sessionStorage.removeItem('currentStreamingSessionTime');
            setStreamingSessionId(null);
          }
        }
        
        // First try to restore session-specific agents
        const savedSessionAgents = sessionStorage.getItem(`sessionAgents_${sessionId}`);
        if (savedSessionAgents) {
          try {
            const sessionAgentsList = JSON.parse(savedSessionAgents);
            // Restore icon property which can't be serialized
            const restoredAgents = sessionAgentsList.map((agent: any) => ({
              ...agent,
              icon: Bot // Icons can't be serialized, so restore Bot icon
            }));
            setActiveAgents(restoredAgents);
            setSessionAgentsMap(prev => {
              const updated = new Map(prev);
              updated.set(sessionId, restoredAgents);
              return updated;
            });
            console.log(`✅ Restored ${restoredAgents.length} session agents for ${sessionId}`);
          } catch (e) {
            console.error('Failed to restore session agents:', e);
          }
        }
        
        // Also restore orchestrator agents if they exist
        const savedAgents = sessionStorage.getItem(`orchestratorAgents_${sessionId}`);
        const savedTask = sessionStorage.getItem(`orchestratorTask_${sessionId}`);
        if (savedAgents) {
          try {
            const agents = JSON.parse(savedAgents);
            setOrchestratorAgentConfigs(agents);
            
            // Only set active agents if we haven't already loaded session agents
            if (!savedSessionAgents) {
              const activeAgentsList = agents.map((agent: any) => ({
                id: agent.name.toLowerCase().replace(/\s+/g, '_'),
                name: agent.name,
                role: agent.description || agent.system_prompt?.substring(0, 100) || 'Agent',
                icon: Bot,
                color: 'text-blue-500',
                status: 'idle' as const,
                tasks: 0,
                successRate: 95,
                currentTask: savedTask ? 'Ready to execute planned task' : 'Ready',
                toolsUsed: agent.tools || [],
                lastUpdate: new Date().toLocaleTimeString()
              }));
              setActiveAgents(activeAgentsList);
              setSessionAgentsMap(prev => {
                const updated = new Map(prev);
                updated.set(sessionId, activeAgentsList);
                return updated;
              });
              console.log(`Restored ${agents.length} orchestrator agents from session`);
            }
          } catch (e) {
            console.error('Failed to restore orchestrator agents:', e);
          }
        }
      } else {
        // Don't create a session immediately - wait for first message
        console.log('No session ID provided. Will create session on first message.');
        
        // Clear any stale data for new session
        setMessages([]);
        setActiveAgents([]);
        setStreamingSessionId(null);
        setLastExecutedAgents([]);
        setOrchestratorAgentConfigs([]);  // Clear orchestrator agents
        
        // Clear ALL session storage to prevent cross-contamination
        sessionStorage.removeItem('currentStreamingSession');
        sessionStorage.removeItem('currentStreamingSessionTime');
        sessionStorage.removeItem('orchestratorAgents');  // Clear stored orchestrator data
        
        // Clear any session-specific agent storage
        const keys = Object.keys(sessionStorage);
        keys.forEach(key => {
          if (key.startsWith('lastAgents_')) {
            sessionStorage.removeItem(key);
          }
        });
        
        console.log('🧹 Cleared all session data for fresh start');
        
        // Don't create session here - executeSwarm will create it when needed
      }
    };
    
    initSession();
  }, [sessionId, hasAutoExecuted, createSession, navigate, loadSession, refreshSessions]);  // Added dependencies

  // Parse agents from planning messages
  const parseAgentsFromMessage = useCallback((content: string): LocalAgent[] => {
    const agents: LocalAgent[] = [];
    
    // More flexible regex to capture agents in various formats
    // Try to match "Agent N: Name" followed by role and tools info
    const agentSections = content.split(/Agent \d+:/);
    
    agentSections.forEach((section, index) => {
      if (index === 0 || !section.trim()) return; // Skip empty or pre-agent content
      
      // Extract agent name (first word/phrase after Agent N:)
      const nameMatch = section.match(/^\s*(\w+)/);
      const name = nameMatch ? nameMatch[1] : `Agent${index}`;
      
      // Extract role
      const roleMatch = section.match(/Role:\s*([^\n]+)/i);
      const role = roleMatch ? roleMatch[1].trim() : 'Specialist';
      
      // Extract tools
      const toolsMatch = section.match(/Tools:\s*([^\n]+)/i);
      const toolsString = toolsMatch ? toolsMatch[1].trim() : '';
      const tools = toolsString ? toolsString.split(/[,;]/).map(t => t.trim()).filter(t => t) : [];
      
      agents.push({
        id: name.toLowerCase(),
        name,
        role: role.replace(/[^\w\s]/g, '').trim(), // Clean up role text
        status: 'idle' as const,
        progress: 0,
        icon: Bot,
        color: 'text-blue-500',
        tasks: 0,
        successRate: 95,
        currentTask: 'Waiting to start',
        toolsUsed: tools,
        lastUpdate: new Date().toLocaleTimeString()
      });
    });
    
    // Log what we found for debugging
    console.log(`📋 Parsed ${agents.length} agents from message:`, agents.map(a => ({
      name: a.name,
      role: a.role,
      tools: a.toolsUsed
    })));
    
    return agents;
  }, []);


  // Load messages from current session
  useEffect(() => {
    console.log('🔍 Loading messages effect triggered');
    console.log('currentSession:', currentSession);
    console.log('Has messages?', currentSession?.messages?.length);
    console.log('Full currentSession object:', JSON.stringify(currentSession, null, 2));
    
    // Only proceed if we have a valid session with an ID
    if (!currentSession?.session_id) {
      console.log('⏳ Waiting for session to load...');
      return;
    }
    
    if (currentSession?.messages && currentSession.messages.length > 0) {
      const formattedMessages = currentSession.messages.map(msg => ({
        id: msg.message_id,
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.created_at),
        status: 'sent' as const,
        metadata: msg.message_metadata
      }));
      
      // Always load messages from session when currentSession changes
      console.log(`✅ Loaded ${formattedMessages.length} messages from session ${currentSession.session_id}`);
      console.log('Messages:', formattedMessages.map(m => ({ role: m.role, content: m.content.substring(0, 50) })));
      
      // Only set messages if they're different from current messages (to avoid clearing during streaming)
      setMessages(prev => {
        console.log('🔄 Setting messages, prev:', prev.length, 'new:', formattedMessages.length);
        // Always update messages from session on refresh
        // Check if this is a fresh load (no messages) or a different session
        if (prev.length === 0 || 
            prev[0]?.id !== formattedMessages[0]?.id ||
            prev.length !== formattedMessages.length) {
          console.log('✅ Updating messages from session');
          return formattedMessages;
        }
        // Otherwise keep the current messages (might be streaming)
        console.log('⏸️ Keeping current messages (streaming or same)');
        return prev;
      });
      
      // Extract artifacts from messages
      extractArtifacts(formattedMessages);
      
      // Parse and restore agents from planning messages
      const planningMessages = formattedMessages.filter(m => 
        m.content.includes('Planning Task Execution') && 
        m.content.includes('Agent 1:')
      );
      
      if (planningMessages.length > 0 && activeAgents.length === 0) {
        // Get agents from the most recent planning message
        const latestPlanningMsg = planningMessages[planningMessages.length - 1];
        const parsedAgents = parseAgentsFromMessage(latestPlanningMsg.content);
        
        if (parsedAgents.length > 0) {
          console.log(`📋 Restored ${parsedAgents.length} agents from planning message`);
          setActiveAgents(parsedAgents);
          
          // Save to session storage and map
          if (currentSession.session_id) {
            sessionStorage.setItem(`sessionAgents_${currentSession.session_id}`, JSON.stringify(parsedAgents));
            setSessionAgentsMap(prev => {
              const updated = new Map(prev);
              updated.set(currentSession.session_id, parsedAgents);
              return updated;
            });
          }
        }
      }
      
      // Also try to restore from sessionStorage if we still have no agents
      if (activeAgents.length === 0 && currentSession?.session_id) {
        const savedAgents = sessionStorage.getItem(`sessionAgents_${currentSession.session_id}`);
        if (savedAgents) {
          try {
            const parsedAgents = JSON.parse(savedAgents);
            // Restore icon property which can't be serialized
            const restoredAgents = parsedAgents.map((agent: any) => ({
              ...agent,
              icon: Bot // Icons can't be serialized, so restore Bot icon
            }));
            if (restoredAgents.length > 0) {
              console.log(`💾 Restored ${restoredAgents.length} agents from storage`);
              setActiveAgents(restoredAgents);
            }
          } catch (e) {
            console.error('Failed to parse saved agents:', e);
          }
        }
      }
      
      // Mark that we have loaded the session context
      console.log('📚 Session context fully loaded and ready for continuation');
    } else if (currentSession && !isLoading) {
      // Session exists but has no messages yet (only if not loading)
      console.log(`📭 Session ${currentSession.session_id} has no messages yet`);
      // Don't clear messages if we're still loading
    }
    
    // Check if there's a planned task from the orchestrator
    if (currentSession?.session_id) {
      const plannedTask = sessionStorage.getItem(`plannedTask_${currentSession.session_id}`);
      if (plannedTask) {
        // Show the planned task as a system message
        console.log(`Planned task ready: ${plannedTask}`);
        // Clean up after reading
        sessionStorage.removeItem(`plannedTask_${currentSession.session_id}`);
      }
    } else if (currentSession?.session_id) {
      // Only log as empty if we have a session but no messages
      console.log('📭 Session has no messages yet:', {
        sessionId: currentSession.session_id,
        messageCount: currentSession?.messages?.length || 0
      });
    }
  }, [currentSession, activeAgents.length, isLoading, parseAgentsFromMessage]);

  // Extract artifacts from messages
  const extractArtifacts = (msgs: any[]) => {
    const newArtifacts: Artifact[] = [];
    
    msgs.forEach(msg => {
      // Look for code blocks
      const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
      let match;
      
      while ((match = codeBlockRegex.exec(msg.content)) !== null) {
        const language = match[1] || 'plaintext';
        const code = match[2];
        
        if (code.trim().length > 50) { // Only save substantial code blocks
          newArtifacts.push({
            id: `artifact-${Date.now()}-${Math.random()}`,
            type: 'code',
            title: `${language} code from ${msg.metadata?.agent || 'Assistant'}`,
            content: code,
            language,
            agent: msg.metadata?.agent || 'Assistant',
            timestamp: msg.timestamp
          });
        }
      }
    });
    
    setArtifacts(newArtifacts);
  };

  // Streaming hook with callbacks
  const {
    startStream,
    stopStream,
    isStreaming,
    error: streamError,
    sessionId: streamSessionId
  } = useStreamingPolling({
    onPollingData: (data: any) => {
      // Parse polling response with enhanced parser for tool execution transparency
      const events = enhancedParser.current.parsePollingResponse(data);
      if (events.length > 0) {
        setTimelineEvents(prev => {
          // Deduplicate events
          const newEvents = events.filter(e => {
            const eventKey = `${e.title}-${e.agent}-${e.type}-${e.timestamp.getTime()}`;
            if (processedEventsRef.current.has(eventKey)) {
              return false;
            }
            processedEventsRef.current.add(eventKey);
            return true;
          });
          
          // Limit total events to prevent memory issues
          const combined = [...prev, ...newEvents];
          if (combined.length > 500) {
            return combined.slice(-500);
          }
          return combined;
        });
      }
    },
    onToken: (agent: string, token: string) => {
      appendStreamingMessage(agent, token);
      // Agent parsing moved to onComplete for better performance
    },
    onAgentStart: (agent: string) => {
      updateAgentStatus(agent, 'thinking', 'Analyzing request...');
      
      // Track agents being used (for when orchestrator generates them)
      setLastExecutedAgents(prev => {
        // Check if agent already exists
        const exists = prev.some(a => a.name === agent);
        if (!exists && sessionId) {
          const newAgents = [...prev, { name: agent, role: 'Generated by orchestrator' }];
          // Save to sessionStorage for this chat session
          sessionStorage.setItem(`lastAgents_${sessionId}`, JSON.stringify(newAgents));
          console.log('📝 Captured orchestrator-generated agent:', agent);
          return newAgents;
        }
        return prev;
      });
    },
    onAgentComplete: (agent: string, content: string) => {
      updateAgentStatus(agent, 'completed', 'Task completed');
      finalizeStreamingMessage(agent);
      
      // Parse final events from complete content
      const events = streamParser.current.parseStreamContent(content, agent);
      if (events.length > 0) {
        setTimelineEvents(prev => {
          const newEvents = events.filter(e => {
            const eventKey = `${e.title}-${e.agent}-${e.type}`;
            if (processedEventsRef.current.has(eventKey)) {
              return false;
            }
            processedEventsRef.current.add(eventKey);
            return true;
          });
          return [...prev, ...newEvents];
        });
      }
      
      // Don't save empty messages - the content should be in the finalized streaming message
      // The message has already been created during streaming
      console.log(`Agent ${agent} completed. Content length: ${content?.length || 0}`);
    },
    onTool: (agent: string, tool: string, filename?: string) => {
      const toolExec: ToolExecution = {
        id: `tool-${Date.now()}`,
        agent,
        tool,
        parameters: filename ? { filename } : {},
        status: 'executing',
        timestamp: new Date()
      };
      setToolExecutions(prev => [...prev, toolExec]);
      updateAgentStatus(agent, 'executing', `Using ${tool}...`);
      
      // Track tool usage for agents
      setActiveAgents(prev => prev.map(a => {
        if (a.name === agent) {
          const updatedTools = a.toolsUsed ? [...a.toolsUsed, tool] : [tool];
          return {
            ...a,
            toolsUsed: Array.from(new Set(updatedTools)) // Remove duplicates
          };
        }
        return a;
      }));
      
      // Add detailed tool execution event to timeline with enhanced transparency
      const toolEvent: TimelineEvent = {
        id: `evt-tool-${Date.now()}-${Math.random()}`,
        type: 'tool',
        agent,
        title: `${tool} executing`,
        description: filename ? `Processing ${filename}` : `Executing ${tool}`,
        timestamp: new Date(),
        status: 'running',
        details: {
          tool,
          purpose: tool === 'tavily_search' ? 'Web search for current information' : `Using ${tool}`,
          parameters: filename ? { filename } : {},
          code: filename ? JSON.stringify({ filename }, null, 2) : undefined
        },
        expanded: false
      };
      setTimelineEvents(prev => {
        const combined = [...prev, toolEvent];
        return combined.length > 500 ? combined.slice(-500) : combined;
      });
    },
    onToolExecuted: (agent: string, data: any) => {
      setToolExecutions(prev => {
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].agent === agent && updated[i].status === 'executing') {
            updated[i] = {
              ...updated[i],
              result: data.result || data.output || data,
              status: data.error ? 'error' : 'success',
              parameters: data.parameters || updated[i].parameters
            };
            break;
          }
        }
        return updated;
      });
      
      // Create detailed tool execution event with full transparency
      const resultEvent: TimelineEvent = {
        id: `evt-tool-result-${Date.now()}-${Math.random()}`,
        type: 'tool',
        agent,
        title: `${data.tool || 'Tool'} ${data.error ? 'failed' : 'completed'}`,
        description: data.purpose || (data.error ? `Error: ${data.error}` : 'Execution completed'),
        timestamp: new Date(),
        status: data.error ? 'error' : 'success',
        details: {
          tool: data.tool || 'unknown',
          parameters: data.parameters,
          result: data.result || data.output || data,
          error: data.error,
          code: data.parameters ? JSON.stringify(data.parameters, null, 2) : undefined,
          output: data.result ? (typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2)) : undefined
        },
        expanded: false,
        children: data.result ? [{
          id: `evt-tool-output-${Date.now()}-${Math.random()}`,
          type: 'action',
          title: 'Output',
          description: typeof data.result === 'string' ? 
            data.result.substring(0, 100) + (data.result.length > 100 ? '...' : '') :
            'Complex result',
          timestamp: new Date(),
          status: 'success',
          details: { 
            code: typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2),
            language: 'json'
          }
        }] : undefined
      };
      setTimelineEvents(prev => {
        const combined = [...prev, resultEvent];
        return combined.length > 500 ? combined.slice(-500) : combined;
      });
    },
    onHandoff: (from: string, to: string, reason?: string) => {
      updateAgentStatus(from, 'completed', 'Task completed');
      updateAgentStatus(to, 'thinking', `Taking over from ${from}`);
      
      // Create enhanced handoff message with better formatting
      const handoffMsg = `🔄 **Agent Handoff**\n👤 ${from} → ${to}\n${reason ? `💬 Reason: ${reason}` : ''}`;
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: handoffMsg,
        timestamp: new Date(),
        status: 'info',
        metadata: {
          type: 'handoff',
          from,
          to,
          reason
        }
      }]);
      
      // Add detailed handoff to timeline with context
      setTimelineEvents(prev => [...prev, {
        id: `evt-handoff-${Date.now()}-${Math.random()}`,
        type: 'handoff',
        title: `Handoff: ${from} → ${to}`,
        description: reason || 'Task delegation between agents',
        timestamp: new Date(),
        status: 'success',
        details: {
          from,
          to,
          reason,
          context: `Agent ${from} completed their task and handed off to ${to}`
        },
        expanded: false
      }]);
      
      // Update agent tools tracking
      setActiveAgents(prev => prev.map(agent => {
        if (agent.name === to) {
          return {
            ...agent,
            tasks: (agent.tasks || 0) + 1
          };
        }
        return agent;
      }));
    },
    onComplete: () => {
      setIsLoading(false);
      
      // Flush any remaining buffered content
      flushStreamingBuffer();
      
      // Clear any pending timer
      if (streamingTimerRef.current) {
        clearTimeout(streamingTimerRef.current);
        streamingTimerRef.current = null;
      }
      
      // Mark streaming messages as complete
      setMessages(msgPrev => {
        const updated = msgPrev.map(msg => 
          msg.status === 'streaming' 
            ? { ...msg, status: 'sent' as const }
            : msg
        );
        
        const planningMsg = updated.find(m => 
          m.content.includes('Planning Task Execution') && 
          m.content.includes('Agent ')
        );
        
        // Parse agents from planning message after streaming completes
        if (planningMsg && activeAgents.length === 0) {
          const parsedAgents = parseAgentsFromMessage(planningMsg.content);
          if (parsedAgents.length > 0) {
            console.log(`📋 Parsed ${parsedAgents.length} agents from completed planning message`);
            
            // Update agents with parsed ones if we have more
            setActiveAgents(agentsPrev => {
              if (parsedAgents.length > agentsPrev.length) {
                // Mark them as completed since streaming is done
                const completedAgents = parsedAgents.map(a => ({
                  ...a,
                  status: 'completed' as const,
                  progress: 100,
                  lastUpdate: new Date().toLocaleTimeString()
                }));
                
                // Persist to session
                if (sessionId) {
                  setSessionAgentsMap(mapPrev => {
                    const updated = new Map(mapPrev);
                    updated.set(sessionId, completedAgents);
                    return updated;
                  });
                  sessionStorage.setItem(`sessionAgents_${sessionId}`, JSON.stringify(completedAgents));
                  console.log(`💾 Saved ${completedAgents.length} parsed agents to session ${sessionId}`);
                }
                
                return completedAgents;
              }
              
              // Otherwise just mark existing agents as completed
              const completedAgents = agentsPrev.map(a => ({
                ...a,
                status: 'completed' as const,
                progress: 100,
                lastUpdate: new Date().toLocaleTimeString()
              }));
              
              // Persist completed agents to session
              if (sessionId) {
                setSessionAgentsMap(mapPrev => {
                  const updated = new Map(mapPrev);
                  updated.set(sessionId, completedAgents);
                  return updated;
                });
                sessionStorage.setItem(`sessionAgents_${sessionId}`, JSON.stringify(completedAgents));
                console.log(`💾 Saved ${completedAgents.length} completed agents to session ${sessionId}`);
              }
              
              return completedAgents;
            });
          }
        }
        
        return updated;
      });
      
      // Clear throttle map
      setAgentUpdateThrottle(new Map());
      
      // Don't refresh immediately - keep the agents visible
      if (currentSession?.session_id) {
        console.log('✅ Streaming complete, agents preserved for review');
      }
    },
    onError: (error: string) => {
      console.error('Stream error:', error);
      setIsLoading(false);
    }
  });

  // Update streaming session ID from hook and persist it
  useEffect(() => {
    if (streamSessionId) {
      // streamSessionId is from the hook - it's the actual active session
      setStreamingSessionId(streamSessionId);
      sessionStorage.setItem(`streamingSession_${sessionId || 'default'}`, streamSessionId);
      console.log('💾 Updated streaming session from hook:', streamSessionId);
    }
  }, [streamSessionId, sessionId]);

  // Helper functions
  const updateAgentStatus = (agentName: string, status: LocalAgent['status'], task?: string) => {
    // Throttle updates to reduce flashing
    const now = Date.now();
    const lastUpdate = agentUpdateThrottle.get(agentName) || 0;
    
    // Only update progress every 3000ms to stop flashing
    if (status === 'executing' && now - lastUpdate < 3000) {
      return;
    }
    
    setAgentUpdateThrottle(prev => {
      const updated = new Map(prev);
      updated.set(agentName, now);
      return updated;
    });
    
    setActiveAgents(prev => {
      // Check if agent exists
      const agentExists = prev.some(agent => agent.name === agentName);
      
      if (!agentExists) {
        // Add new agent if it doesn't exist - preserve existing agents
        console.log(`➕ Adding new agent: ${agentName} to existing ${prev.length} agents`);
        const newAgent: LocalAgent = {
          id: agentName.toLowerCase().replace(/\s+/g, '_'),
          name: agentName,
          role: 'Dynamically generated for task',
          status,
          progress: status === 'thinking' ? 25 : 0,
          icon: Bot,
          color: 'text-blue-500',
          tasks: 0,
          successRate: 95,
          currentTask: task || 'Processing...',
          toolsUsed: [],
          lastUpdate: new Date().toLocaleTimeString()
        };
        console.log(`➕ Adding new agent to active list: ${agentName}`);
        
        // Also update session agents map
        if (sessionId) {
          setSessionAgentsMap(mapPrev => {
            const updated = new Map(mapPrev);
            const sessionAgents = updated.get(sessionId) || [];
            if (!sessionAgents.some(a => a.name === agentName)) {
              updated.set(sessionId, [...sessionAgents, newAgent]);
              // Persist to storage
              sessionStorage.setItem(`sessionAgents_${sessionId}`, JSON.stringify([...sessionAgents, newAgent]));
            }
            return updated;
          });
        }
        
        return [...prev, newAgent];
      }
      
      // Update existing agent
      return prev.map(agent => {
        if (agent.name === agentName) {
          return {
            ...agent,
            status,
            progress: status === 'completed' ? 100 :
                     status === 'executing' ? Math.min(75, agent.progress + 25) :
                     status === 'thinking' ? 25 : 0,
            currentTask: task || agent.currentTask,
            lastUpdate: new Date().toLocaleTimeString(),
            tasks: status === 'completed' ? agent.tasks + 1 : agent.tasks
          };
        }
        return agent;
      });
    });
  };

  // Use refs for streaming optimization
  const streamingBufferRef = useRef<Map<string, string>>(new Map());
  const streamingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  
  // Batch streaming updates for smoother performance
  const flushStreamingBuffer = useCallback(() => {
    if (streamingBufferRef.current.size === 0) return;
    
    const bufferCopy = new Map(streamingBufferRef.current);
    streamingBufferRef.current.clear();
    
    setMessages(prev => {
      let updated = [...prev];
      
      bufferCopy.forEach((content, agent) => {
        const lastMsgIndex = updated.findIndex(
          m => m.metadata?.agent === agent && m.status === 'streaming'
        );
        
        if (lastMsgIndex >= 0) {
          // Update existing streaming message
          updated[lastMsgIndex] = {
            ...updated[lastMsgIndex],
            content: updated[lastMsgIndex].content + content
          };
        } else {
          // Create new streaming message
          updated.push({
            id: `msg-${Date.now()}-${agent}`,
            role: 'assistant' as const,
            content,
            timestamp: new Date(),
            status: 'streaming' as const,
            metadata: { agent }
          });
        }
      });
      
      return updated;
    });
  }, []);
  
  const appendStreamingMessage = useCallback((agent: string, token: string) => {
    // Buffer tokens
    const current = streamingBufferRef.current.get(agent) || '';
    streamingBufferRef.current.set(agent, current + token);
    
    // Throttle updates to every 16ms (60fps) for smooth streaming
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
    
    if (timeSinceLastUpdate >= 16) {
      // Immediate flush for smooth streaming
      lastUpdateTimeRef.current = now;
      flushStreamingBuffer();
    } else {
      // Schedule flush if not already scheduled
      if (!streamingTimerRef.current) {
        streamingTimerRef.current = setTimeout(() => {
          streamingTimerRef.current = null;
          lastUpdateTimeRef.current = Date.now();
          flushStreamingBuffer();
        }, 16 - timeSinceLastUpdate);
      }
    }
  }, [flushStreamingBuffer]);

  const finalizeStreamingMessage = useCallback((agent: string) => {
    setMessages(prev => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg?.metadata?.agent === agent && lastMsg?.status === 'streaming') {
        const finalizedMsg = { ...lastMsg, status: 'sent' as const };
        
        // Extract artifacts asynchronously to avoid blocking
        setTimeout(() => extractArtifacts([finalizedMsg]), 0);
        
        // Save the complete message to the session
        if (finalizedMsg.content) {
          saveMessageToSession('assistant', finalizedMsg.content, { agent });
        }
        
        return [...prev.slice(0, -1), finalizedMsg];
      }
      return prev;
    });
  }, []);

  const saveMessageToSession = async (role: 'user' | 'assistant' | 'system', content: string, metadata?: any, sessionIdOverride?: string) => {
    const sessionToUse = sessionIdOverride || activeSessionIdRef.current || currentSession?.session_id || sessionId;
    if (sessionToUse) {
      try {
        await chatApi.addMessage(sessionToUse, {
          role,
          content,
          message_metadata: metadata
        });
        // Don't refresh immediately as it might clear streaming messages
        // The messages are already in the UI, just saved to backend
        console.log(`✅ Saved ${role} message to session ${sessionToUse}`);
      } catch (error) {
        console.error('❌ Failed to save message:', error);
      }
    } else {
      console.warn('⚠️ No session ID available to save message');
    }
  };

  const executeSwarm = async (query: string, customAgentConfigs?: any[]) => {
    setIsLoading(true);
    setToolExecutions([]);
    
    // Create session if it doesn't exist yet
    // Important: Check both sessionId from URL and currentSession
    // If we're at /swarm (no sessionId), always create new session
    let activeSessionId = sessionId || currentSession?.session_id;
    let isNewSession = false;
    
    // Force new session if we're at /swarm without a session ID
    if (!activeSessionId || (!sessionId && window.location.pathname === '/swarm')) {
      console.log('Creating new session for first message...');
      isNewSession = true;
      const newSession = await createSession({
        title: query.substring(0, 50) || `Swarm Session ${new Date().toLocaleDateString()}`,
        agents_config: {
          agents: selectedAgents.map(id => {
            const agent = availableAgents.find(a => a.id === id);
            return {
              id,
              name: agent?.name || id,
              role: agent?.role || ''
            };
          })
        }
      });
      
      if (newSession?.session_id) {
        activeSessionId = newSession.session_id;
        
        // Clear streaming session for new chat session
        setStreamingSessionId(null);
        sessionStorage.removeItem('currentStreamingSession');
        
        // Clear existing agents for fresh start
        setActiveAgents([]);
        setLastExecutedAgents([]);
        setOrchestratorAgentConfigs([]);  // Clear orchestrator agents for new session
        
        console.log('🆕 New session created, cleared streaming session and all agents');
        
        // Navigate to the new session URL
        navigate(`/swarm/${newSession.session_id}`, { replace: true });
        // Load the session immediately
        await loadSession(newSession.session_id);
        // Wait a bit for state to update
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Store active session ID in ref for callbacks
    activeSessionIdRef.current = activeSessionId || null;
    
    // Only preserve agents if it's not a new session
    if (!isNewSession) {
      console.log(`📋 Preserving ${activeAgents.length} existing agents across execution`);
    } else {
      console.log(`🆕 New session - starting with fresh agents`);
    }
    
    // Store existing agents to merge with new ones
    const existingAgentsMap = new Map<string, LocalAgent>();
    activeAgents.forEach(agent => {
      existingAgentsMap.set(agent.name, agent);
    });
    
    // Clear previous parsing state
    processedEventsRef.current.clear();
    lastProcessedContentRef.current.clear();
    
    // Limit timeline events and add start event
    setTimelineEvents(prev => {
      // Keep only last 100 events from previous executions
      const recentEvents = prev.slice(-100);
      return [...recentEvents, {
        id: `evt-${Date.now()}-${Math.random()}`,
        type: 'start',
        title: 'Swarm execution started',
        description: query,
        timestamp: new Date(),
        status: 'running'
      }];
    });
    
    // Save user message to session
    await saveMessageToSession('user', query, undefined, activeSessionId);
    
    // Add user message to UI
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      timestamp: new Date(),
      status: 'sent'
    }]);
    
    // Use custom agents if provided, otherwise use selected agents
    let agentConfigs;
    if (customAgentConfigs && customAgentConfigs.length > 0) {
      // Use orchestrator-generated agents
      agentConfigs = customAgentConfigs;
      console.log(`🎯 Using ${customAgentConfigs.length} custom/orchestrator agents in executeSwarm:`, customAgentConfigs);
      
      // Create LocalAgent representations for UI
      const agents = customAgentConfigs.map((config, index) => ({
        id: `agent_${index}`,
        name: config.name,
        role: config.system_prompt?.substring(0, 50) || 'Custom agent',
        status: 'thinking' as const,
        progress: 10,
        icon: Bot,
        color: 'text-blue-500',
        tasks: 0,
        successRate: 95
      }));
      setActiveAgents(agents);
    } else if (useDynamicAgents || selectedAgents.length === 0) {
      // Let backend dynamically generate agents based on the task
      console.log('🎯 Using dynamic agents - backend will generate task-specific agents');
      agentConfigs = [];  // Empty array signals backend to generate agents
      
      // Clear active agents - they'll be populated when backend creates them
      setActiveAgents([]);
    } else {
      // Use predefined agents if user prefers them
      console.log(`📋 Using ${selectedAgents.length} predefined agents`);
      const agents = selectedAgents.map(id => {
        const agent = availableAgents.find(a => a.id === id)!;
        return { ...agent, status: 'thinking' as const, progress: 10 };
      });
      setActiveAgents(agents);
      
      agentConfigs = agents.map(agent => ({
        name: agent.name,
        system_prompt: `You are ${agent.name}. ${agent.role}. Be concise and effective.`,
        tools: ['tavily_search', 'file_write', 'file_read']
      }));
    }
    
    setIsSwarmActive(true);

    try {
      // Store agents for future use - tied to the current chat session
      if (agentConfigs && agentConfigs.length > 0 && sessionId) {
        console.log('💾 Storing agents for chat session:', sessionId, agentConfigs);
        setLastExecutedAgents(agentConfigs);
        // Store agents tied to the specific chat session
        sessionStorage.setItem(`lastAgents_${sessionId}`, JSON.stringify(agentConfigs));
      } else if (!streamingSessionId) {
        // Starting fresh - clear any existing agents to let orchestrator generate new ones
        setLastExecutedAgents([]);
        sessionStorage.removeItem(`lastAgents_${sessionId}`);
        console.log('🧹 Cleared agents for fresh orchestrator generation');
      }
      
      // Pass existing session ID and messages to continue the conversation
      const existingSessionId = currentSession?.session_id || sessionId;
      
      // Include messages from current session if they're loaded
      // This ensures context is preserved even after page refresh
      let previousMessages = messages.map(m => ({
        role: m.role,
        content: m.content
      }));
      
      // If messages are empty but we have a current session with messages, use those
      if (previousMessages.length === 0 && currentSession?.messages) {
        console.log(`Loading ${currentSession.messages.length} messages from session for context`);
        previousMessages = currentSession.messages.map((msg: any) => ({
          role: msg.role,
          content: msg.content
        }));
      }
      
      // Use the streaming session ID if we have one (for continuation)
      // Otherwise let the backend create a new one
      // BUT: If we have orchestrator agents OR it's a new session, always start fresh (no continuation)
      // ALSO: If we're at /swarm without a sessionId, force new streaming session
      const shouldStartFresh = orchestratorAgentConfigs.length > 0 || 
                               isNewSession || 
                               (!sessionId && window.location.pathname === '/swarm');
      const sessionToUse = shouldStartFresh ? null : streamingSessionId;
      
      // Clear streaming session if starting fresh
      if (shouldStartFresh && streamingSessionId) {
        console.log('🧹 Clearing old streaming session for fresh start');
        setStreamingSessionId(null);
        sessionStorage.removeItem('currentStreamingSession');
        sessionStorage.removeItem('currentStreamingSessionTime');
      }
      
      console.log('🚀 Executing swarm with:', {
        chatSessionId: sessionId,
        streamingSessionId,
        sessionToUse,
        agentCount: agentConfigs?.length,
        messageCount: previousMessages?.length,
        isContinuation: !!streamingSessionId,
        agents: agentConfigs
      });
      
      console.log('📡 Passing agents to startStream:', agentConfigs);
      
      // Start or continue streaming
      // Pass the streaming session ID to continue the same context
      await startStream(query, agentConfigs, 10, sessionToUse || undefined, previousMessages);
      
      // The streaming session ID will be updated via the useEffect that watches streamSessionId
      
      setSwarmMetrics(prev => ({
        ...prev,
        totalTasks: prev.totalTasks + 1
      }));
    } catch (error) {
      console.error('Swarm execution failed:', error);
      setIsLoading(false);
    }
  };

  // Copy artifact to clipboard
  const copyArtifact = (artifact: Artifact) => {
    navigator.clipboard.writeText(artifact.content);
    setCopiedArtifact(artifact.id);
    setTimeout(() => setCopiedArtifact(null), 2000);
  };

  // Download artifact
  const downloadArtifact = (artifact: Artifact) => {
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title.replace(/\s+/g, '_')}.${artifact.language || 'txt'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Compact Agent Card
  const CompactAgentCard = memo(({ agent }: { agent: LocalAgent }) => {
    const Icon = agent.icon || Bot; // Fallback to Bot if icon is undefined
    const isSelected = selectedAgentFilter === agent.name;
    
    return (
      <div 
        className={cn(
          "p-3 rounded-lg border transition-all duration-300 relative overflow-hidden cursor-pointer hover:shadow-md",
          agent.status === 'executing' && "border-primary bg-primary/5 shadow-sm",
          agent.status === 'thinking' && "border-blue-500/50 bg-blue-500/5",
          agent.status === 'completed' && "border-green-500/50 bg-green-500/5",
          agent.status === 'idle' && "border-muted",
          isSelected && "ring-2 ring-primary shadow-lg bg-primary/10"
        )}
        onClick={() => {
          setSelectedAgentFilter(isSelected ? null : agent.name);
          console.log(`${isSelected ? 'Unfiltered' : 'Filtering'} messages by agent: ${agent.name}`);
        }}
        title={`Click to ${isSelected ? 'show all' : 'filter by'} ${agent.name} messages`}
      >
        {/* Progress indicator bar at top */}
        {agent.status !== 'idle' && agent.status !== 'completed' && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent animate-shimmer" />
        )}
        
        <div className="flex items-center gap-3 mb-2">
          <div className={cn(
            "p-1.5 rounded-md transition-all",
            agent.status === 'executing' && "bg-primary/20 animate-pulse",
            agent.status === 'thinking' && "bg-blue-500/20",
            agent.status === 'completed' && "bg-green-500/20",
            agent.status === 'idle' && "bg-muted"
          )}>
            <Icon className={cn(
              "h-4 w-4",
              agent.color,
              agent.status === 'executing' && "animate-spin"
            )} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{agent.name}</div>
            <div className="text-xs text-muted-foreground truncate">{agent.role}</div>
          </div>
          <div className="flex items-center gap-1">
            {agent.status === 'executing' && agent.toolsUsed && agent.toolsUsed.length > 0 && (
              <Badge variant="outline" className="text-xs px-1.5">
                🔧 {agent.toolsUsed.length}
              </Badge>
            )}
            <Badge variant={
              agent.status === 'completed' ? 'default' :
              agent.status === 'executing' ? 'secondary' :
              agent.status === 'thinking' ? 'outline' : 'outline'
            } className="text-xs">
              {agent.status === 'thinking' ? '🤔' : ''}
              {agent.status === 'executing' ? '⚡' : ''}
              {agent.status === 'completed' ? '✅' : ''}
              {agent.status === 'idle' ? '💤' : ''}
              {' '}{agent.status}
            </Badge>
          </div>
        </div>
        
        {agent.currentTask && (
          <div className="text-xs text-muted-foreground mb-2 px-1 py-0.5 bg-muted/30 rounded">
            🎯 {agent.currentTask}
          </div>
        )}
        
        {agent.toolsUsed && agent.toolsUsed.length > 0 && (
          <div className="text-xs text-muted-foreground mb-1">
            Tools: {agent.toolsUsed.slice(-3).join(', ')}
          </div>
        )}
        
        <div className="flex items-center gap-2">
          <Progress 
            value={agent.progress} 
            className={cn(
              "flex-1 h-1.5 transition-all duration-500",
              agent.status === 'executing' && "animate-pulse"
            )} 
          />
          <span className="text-xs text-muted-foreground">{agent.progress}%</span>
        </div>
        
        {agent.lastUpdate && (
          <div className="text-xs text-muted-foreground mt-1 text-right">
            {agent.lastUpdate}
          </div>
        )}
      </div>
    );
  });

  return (
    <ModernLayout>
      <div className="flex h-full">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Enhanced Header */}
          <div className="border-b bg-gradient-to-r from-background via-card/50 to-background px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-primary" />
                <h1 className="text-lg font-semibold">Swarm Intelligence</h1>
                <Badge variant={isSwarmActive ? "default" : "outline"} className="text-xs">
                  {isSwarmActive ? "Active" : "Standby"}
                </Badge>
                {isStreaming && (
                  <Badge variant="secondary" className="text-xs animate-pulse">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Processing
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                
                {/* Session History */}
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <History className="h-4 w-4 mr-1" />
                      History
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl max-h-[85vh]">
                    <DialogHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <DialogTitle className="text-lg font-semibold">Conversation History</DialogTitle>
                          <DialogDescription className="mt-1">
                            {sessions?.filter(s => s.message_count > 0).length || 0} sessions • {sessions?.reduce((acc, s) => acc + (s.message_count || 0), 0) || 0} total messages
                          </DialogDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => refreshSessions()}
                            disabled={sessionLoading}
                            title="Refresh sessions"
                          >
                            {sessionLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                          {sessions && sessions.length > 0 && (
                            <>
                              {sessions.filter(s => s.message_count === 0).length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={async () => {
                                    const emptySessions = sessions.filter(s => s.message_count === 0);
                                    if (window.confirm(`Delete ${emptySessions.length} empty session${emptySessions.length > 1 ? 's' : ''}?`)) {
                                      for (const session of emptySessions) {
                                        await deleteSession(session.session_id);
                                      }
                                      refreshSessions();
                                    }
                                  }}
                                  className="text-orange-600 hover:text-orange-700"
                                  title="Delete empty sessions"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span className="ml-1 text-xs">{sessions.filter(s => s.message_count === 0).length}</span>
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  if (window.confirm('Delete all sessions? This cannot be undone.')) {
                                    for (const session of sessions) {
                                      await deleteSession(session.session_id);
                                    }
                                    refreshSessions();
                                  }
                                }}
                                className="text-destructive hover:text-destructive"
                                title="Delete all sessions"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </DialogHeader>
                    <div className="mt-4 h-[60vh] overflow-y-auto">
                      <div className="space-y-2 pr-4">
                        {sessions && sessions.filter(s => s.message_count > 0).length > 0 ? (
                          sessions
                            .filter(session => session.message_count > 0)  // Only show sessions with messages
                            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                            .map(session => (
                            <Card 
                              key={session.session_id} 
                              className={cn(
                                "group hover:shadow-md transition-all duration-200",
                                session.session_id === currentSession?.session_id && "border-primary shadow-sm bg-primary/5"
                              )}
                            >
                              <CardHeader className="p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div 
                                    className="flex-1 cursor-pointer"
                                    onClick={() => navigate(`/swarm/${session.session_id}`)}
                                  >
                                    <CardTitle className="text-sm font-medium line-clamp-1">
                                      {session.title || `Session ${session.session_id.slice(0, 8)}`}
                                    </CardTitle>
                                    <div className="text-xs mt-1 space-y-1 text-muted-foreground">
                                      <div className="flex items-center gap-2">
                                        <Clock className="h-3 w-3" />
                                        {session.last_message_at ? 
                                          `Last: ${new Date(session.last_message_at).toLocaleString()}` : 
                                          `Created: ${new Date(session.created_at).toLocaleString()}`}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge 
                                      variant={session.message_count > 0 ? "default" : "secondary"} 
                                      className="text-xs"
                                    >
                                      {session.message_count} {session.message_count === 1 ? 'msg' : 'msgs'}
                                    </Badge>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigate(`/swarm/${session.session_id}`);
                                        }}
                                        className="h-7 w-7 p-0"
                                        title="Open session"
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          if (window.confirm(`Delete session "${session.title || 'Untitled'}"?`)) {
                                            await deleteSession(session.session_id);
                                            refreshSessions();
                                            if (session.session_id === currentSession?.session_id) {
                                              navigate('/swarm');
                                            }
                                          }
                                        }}
                                        className="h-7 w-7 p-0 hover:text-destructive"
                                        title="Delete session"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                                {session.message_count > 0 && (
                                  <div className="mt-2 pt-2 border-t">
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                      <div className="flex items-center gap-3">
                                        <span className="flex items-center gap-1">
                                          <Calendar className="h-3 w-3" />
                                          {new Date(session.created_at).toLocaleDateString()}
                                        </span>
                                        {session.is_active && (
                                          <Badge variant="outline" className="text-xs bg-green-500/10">
                                            Active
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </CardHeader>
                            </Card>
                          ))
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
                            <p className="text-sm">No conversations yet</p>
                            <p className="text-xs mt-1">Send a message to start a conversation</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                
                {/* Dynamic Agents Toggle */}
                <div className="flex items-center gap-2">
                  <Button
                    variant={useDynamicAgents ? "default" : "outline"}
                    size="sm"
                    onClick={() => setUseDynamicAgents(!useDynamicAgents)}
                    title={useDynamicAgents ? "Using dynamic task-specific agents" : "Using predefined agents"}
                  >
                    {useDynamicAgents ? (
                      <>
                        <Sparkles className="h-4 w-4 mr-1" />
                        Dynamic
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 mr-1" />
                        Predefined
                      </>
                    )}
                  </Button>
                  {useDynamicAgents && (
                    <Badge variant="secondary" className="text-xs">
                      AI creates task-specific agents
                    </Badge>
                  )}
                </div>
                
                {/* Agent Selector - only show when not using dynamic agents */}
                {!useDynamicAgents && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <UserPlus className="h-4 w-4 mr-1" />
                        Agents ({selectedAgents.length})
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end">
                    <div className="px-2 py-1.5 text-sm font-semibold">Select Agents</div>
                    {availableAgents.map(agent => (
                      <DropdownMenuCheckboxItem
                        key={agent.id}
                        checked={selectedAgents.includes(agent.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedAgents(prev => [...prev, agent.id]);
                          } else {
                            setSelectedAgents(prev => prev.filter(id => id !== agent.id));
                          }
                        }}
                      >
                        <div>
                          <div className="font-medium">{agent.name}</div>
                          <div className="text-xs text-muted-foreground">{agent.role}</div>
                        </div>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                )}
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/orchestrator')}
                >
                  <Brain className="h-4 w-4 mr-1" />
                  AI Orchestrator
                </Button>
                
                {(lastExecutedAgents.length > 0 || orchestratorAgentConfigs.length > 0) && (
                  <>
                    {orchestratorAgentConfigs.length > 0 && (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        {orchestratorAgentConfigs.length} agents ready
                      </Badge>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setLastExecutedAgents([]);
                        setOrchestratorAgentConfigs([]);
                        setStreamingSessionId(null);  // Clear streaming session too
                        if (sessionId) {
                          sessionStorage.removeItem(`streamingSession_${sessionId}`);
                        }
                        console.log('🧹 Cleared all agents and session - next task will start fresh');
                      }}
                      className="border-orange-500/50 hover:bg-orange-50 dark:hover:bg-orange-950"
                      title="Clear agents and let orchestrator create new ones for next task"
                    >
                      <RefreshCw className="h-4 w-4 mr-1 text-orange-600" />
                      Clear Agents
                    </Button>
                  </>
                )}
                
              </div>
            </div>
          </div>

          {/* Chat Interface */}
          <div className="flex-1 overflow-hidden">
            <ModernChatInterface
              messages={messages}
              highlightAgent={selectedAgentFilter}
              onSendMessage={useCallback((query: string) => {
                  // INTELLIGENT AGENT SELECTION: Let backend decide based on task and context
                  // Backend will analyze the task and conversation history to create optimal agents
                  
                  console.log(`Sending task to backend for intelligent agent selection: "${query.substring(0, 50)}..."`);
                  
                  // Use orchestrator-generated agents if available, otherwise let backend decide
                  // Backend will:
                  // 1. Analyze if this is a continuation or new task
                  // 2. Check conversation history and domain changes
                  // 3. Create optimal agents for the specific task
                  // 4. Reuse existing agents only if truly relevant
                  
                  // Use orchestrator agents if they were generated, otherwise let backend decide
                  let agentConfigs: any[] = [];
                  
                  if (orchestratorAgentConfigs && orchestratorAgentConfigs.length > 0) {
                    // Use pre-generated orchestrator agents
                    agentConfigs = orchestratorAgentConfigs;
                    console.log(`🎯 Using ${orchestratorAgentConfigs.length} orchestrator agents from UI`);
                  } else {
                    // Let backend orchestrator decide
                    agentConfigs = [];
                    console.log('📡 No pre-generated agents, letting backend orchestrator decide');
                  }
                  
                  // Log what we're doing for transparency
                  if (orchestratorAgentConfigs.length > 0) {
                    console.log(`🤖 Using ${orchestratorAgentConfigs.length} pre-generated orchestrator agents:`, orchestratorAgentConfigs);
                  } else if (messages.length > 0) {
                    console.log('Continuing session - backend will analyze if new agents are needed');
                  } else {
                    console.log('New session - backend will create optimal agents');
                  }
                  
                  console.log('📤 Sending agents to executeSwarm:', agentConfigs);
                  executeSwarm(query, agentConfigs);
              }, [messages.length, lastExecutedAgents, orchestratorAgentConfigs, activeAgents, executeSwarm])}
              isLoading={isLoading || isStreaming}
              placeholder="Ask the swarm to help with any task..."
            />
          </div>
        </div>

        {/* Enhanced Right Sidebar */}
        <div className="sidebar-container">
          {/* Toggle View Button */}
          <div className="p-3 border-b flex items-center justify-between bg-card/50">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              {sidebarView === 'timeline' ? (
                <><Activity className="h-4 w-4" /> Activity Timeline</>
              ) : (
                <><FileText className="h-4 w-4" /> Resources</>
              )}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarView(sidebarView === 'tabs' ? 'timeline' : 'tabs')}
            >
              {sidebarView === 'timeline' ? (
                <><FileText className="h-4 w-4 mr-1" /> Resources</>
              ) : (
                <><Activity className="h-4 w-4 mr-1" /> Timeline</>
              )}
            </Button>
          </div>
          
          {sidebarView === 'timeline' ? (
            <ActivityTimeline 
              events={timelineEvents}
              className="flex-1"
              onEventClick={(event) => console.log('Event clicked:', event)}
            />
          ) : (
          <Tabs defaultValue="agents" className="sidebar-tabs">
            <TabsList className="m-3">
              <TabsTrigger value="agents" className="flex-1">
                <Users className="h-3 w-3 mr-1" />
                Agents ({activeAgents.length})
              </TabsTrigger>
              <TabsTrigger value="artifacts" className="flex-1">
                <Code2 className="h-3 w-3 mr-1" />
                Artifacts ({artifacts.length})
              </TabsTrigger>
              <TabsTrigger value="tools" className="flex-1">
                <Terminal className="h-3 w-3 mr-1" />
                Tools ({toolExecutions.length})
              </TabsTrigger>
            </TabsList>
            
            <div className="flex-1 overflow-y-auto">
              {/* Artifacts Tab */}
              <TabsContent value="artifacts" className="px-3 pb-3 space-y-2">
                {artifacts.length > 0 ? (
                  artifacts.map(artifact => (
                    <Card key={artifact.id} className="overflow-hidden">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-sm">{artifact.title}</CardTitle>
                            <CardDescription className="text-xs mt-1">
                              by {artifact.agent} • {artifact.timestamp.toLocaleTimeString()}
                            </CardDescription>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyArtifact(artifact)}
                            >
                              {copiedArtifact === artifact.id ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => downloadArtifact(artifact)}
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="max-h-48 overflow-auto rounded bg-muted">
                          {artifact.type === 'code' ? (
                            <pre className="p-2 text-xs">
                              <code>{artifact.content}</code>
                            </pre>
                          ) : (
                            <pre className="text-xs p-2 whitespace-pre-wrap">
                              {artifact.content}
                            </pre>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No artifacts generated yet. Code and documents will appear here.
                  </div>
                )}
              </TabsContent>
              
              {/* Agents Tab */}
              <TabsContent value="agents" className="px-3 pb-3 space-y-2">
                {/* Agent Management Header */}
                <div className="mb-3 p-3 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Agent Workspace</span>
                      {isStreaming && (
                        <Badge variant="secondary" className="text-xs animate-pulse">
                          <Zap className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      )}
                    </div>
                    {selectedAgentFilter && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedAgentFilter(null)}
                        className="text-xs h-6 px-2"
                      >
                        <X className="h-3 w-3 mr-1" />
                        Clear Filter
                      </Button>
                    )}
                  </div>
                  
                  {/* Status Overview */}
                  <div className="flex items-center gap-2 text-xs">
                    <Badge 
                      variant={activeAgents.filter(a => a.status === 'executing').length > 0 ? "default" : "outline"} 
                      className="text-xs"
                    >
                      ⚡ {activeAgents.filter(a => a.status === 'executing').length} Active
                    </Badge>
                    <Badge 
                      variant={activeAgents.filter(a => a.status === 'completed').length > 0 ? "outline" : "outline"} 
                      className="text-xs bg-green-500/10 border-green-500/50"
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {activeAgents.filter(a => a.status === 'completed').length} Completed
                    </Badge>
                    <Badge 
                      variant={activeAgents.filter(a => a.status === 'thinking').length > 0 ? "secondary" : "outline"} 
                      className="text-xs"
                    >
                      🤔 {activeAgents.filter(a => a.status === 'thinking').length} Thinking
                    </Badge>
                  </div>
                  
                  {selectedAgentFilter && (
                    <div className="mt-2 p-2 bg-primary/5 rounded text-xs flex items-center gap-2">
                      <span className="text-muted-foreground">Filtering by:</span>
                      <Badge variant="secondary" className="text-xs">
                        {selectedAgentFilter}
                      </Badge>
                    </div>
                  )}
                </div>
                
                {/* Agent Cards - Keep all agents visible */}
                {activeAgents.length > 0 ? (
                  <div className="space-y-2">
                    {/* Active/Working Agents */}
                    {activeAgents.filter(a => a.status === 'executing' || a.status === 'thinking').length > 0 && (
                      <>
                        <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-2">
                          <Zap className="h-3 w-3" />
                          Active Agents
                        </div>
                        {activeAgents
                          .filter(a => a.status === 'executing' || a.status === 'thinking')
                          .map(agent => (
                            <CompactAgentCard key={agent.id} agent={agent} />
                          ))}
                      </>
                    )}
                    
                    {/* Completed Agents - Always keep visible for review */}
                    {activeAgents.filter(a => a.status === 'completed').length > 0 && (
                      <>
                        <div className="text-xs font-medium text-muted-foreground mb-1 mt-3 flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          Completed Agents
                        </div>
                        {activeAgents
                          .filter(a => a.status === 'completed')
                          .map(agent => (
                            <CompactAgentCard key={agent.id} agent={agent} />
                          ))}
                      </>
                    )}
                    
                    {/* Idle Agents */}
                    {activeAgents.filter(a => a.status === 'idle').length > 0 && (
                      <>
                        <div className="text-xs font-medium text-muted-foreground mb-1 mt-3 flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          Idle Agents
                        </div>
                        {activeAgents
                          .filter(a => a.status === 'idle')
                          .map(agent => (
                            <CompactAgentCard key={agent.id} agent={agent} />
                          ))}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No agents active yet</p>
                    <p className="text-xs mt-1">Start a conversation to see agents in action</p>
                  </div>
                )}
                
                {/* Handoff History */}
                {timelineEvents.filter(e => e.type === 'handoff').length > 0 && (
                  <div className="mt-4 pt-3 border-t">
                    <div className="text-xs font-medium mb-2 text-muted-foreground">Recent Handoffs</div>
                    <div className="space-y-1">
                      {timelineEvents
                        .filter(e => e.type === 'handoff')
                        .slice(-3)
                        .reverse()
                        .map(event => (
                          <div key={event.id} className="text-xs p-2 bg-muted/30 rounded flex items-center gap-2">
                            <RefreshCw className="h-3 w-3 text-muted-foreground" />
                            <span>{event.title}</span>
                            {event.details?.reason && (
                              <span className="text-muted-foreground ml-auto truncate">
                                {event.details.reason}
                              </span>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </TabsContent>
              
              {/* Tools Tab */}
              <TabsContent value="tools" className="px-3 pb-3 space-y-2">
                {toolExecutions.length > 0 ? (
                  toolExecutions.slice(-10).reverse().map(exec => (
                    <div key={exec.id} className={cn(
                      "p-2 rounded-md border text-xs",
                      exec.status === 'executing' && "border-primary/50 bg-primary/5 animate-pulse",
                      exec.status === 'success' && "border-green-500/50 bg-green-500/5",
                      exec.status === 'error' && "border-red-500/50 bg-red-500/5"
                    )}>
                      <div className="flex items-center gap-2 mb-1">
                        <Terminal className={cn(
                          "h-3 w-3",
                          exec.status === 'executing' && "text-primary animate-spin",
                          exec.status === 'success' && "text-green-500",
                          exec.status === 'error' && "text-red-500"
                        )} />
                        <span className="font-medium">{exec.tool}</span>
                        <span className="text-muted-foreground">by {exec.agent}</span>
                      </div>
                      {exec.result && (
                        <div className="text-xs text-muted-foreground truncate">
                          {typeof exec.result === 'string' ? 
                            exec.result.substring(0, 50) + '...' : 
                            'Result available'}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No tools executed yet.
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
          )}
        </div>
      </div>
    </ModernLayout>
  );
};