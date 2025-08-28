import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { IconButton, Snackbar, Alert } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { Menu as MenuIcon, Close as CloseIcon } from '@mui/icons-material';
import { useSwarmExecution } from '../hooks/useSwarmExecution';
import { useStreamingPolling } from '../hooks/useStreamingPolling';
import { useMessageBatcher } from '../hooks/useMessageBatcher';
import { EnhancedMessageDisplay } from '../components/EnhancedMessageDisplay';
import { useChatSessions } from '../hooks/useChatSessions';
import { chatApi } from '../services/chatApi';
import ChatHistory from '../components/research/ChatHistory';
import AgentPanel from '../components/AgentPanel';
import ArtifactsPanel from '../components/ArtifactsPanel';
import ExecutionTimeline from '../components/swarm/ExecutionTimeline';
import { OrchestratorPanel } from '../components/OrchestratorPanel';
import CleanApprovalOverlay from '../components/CleanApprovalOverlay';
import { ToolResultDisplay } from '../components/BottomApprovalOverlay';
import ProfessionalWelcome from '../components/ProfessionalWelcome';
import AgentIterationDisplay from '../components/AgentIterationDisplay';
import { Artifact, createArtifact } from '../types/artifacts';
import ConnectedThemeSwitch from '../components/ConnectedThemeSwitch';
import PageLayout from '../components/layout/PageLayout';
import './SwarmChat.css';

// [Keep all your existing interfaces as they are]
interface Message {
  id: string;
  type: 'user' | 'agent' | 'system' | 'handoff' | 'execution_start' | 'tool_result';
  agent?: string;
  content: string;
  timestamp: Date;
  status?: 'thinking' | 'working' | 'streaming' | 'complete' | 'error';
  artifacts?: Artifact[];
  metadata?: any;
  toolResult?: {
    tool_name: string;
    success: boolean;
    summary?: string;
    results_count?: number;
    results?: Array<any>;
    display_text?: string;
    collapsible?: boolean;
    timestamp?: string;
  };
}

interface AgentIteration {
  agentName: string;
  iteration: number;
  maxIterations: number;
  status: 'reasoning' | 'using_tools' | 'completing' | 'finished';
  tools: string[];
  timestamp: Date;
}

// [Keep all other interfaces...]
type PollingEventType =
    | 'execution_started'
    | 'agent_started'
    | 'agent_iteration'
    | 'text_generation'
    | 'tool_approval_required'
    | 'tool_approval_response'
    | 'tool_rejected'
    | 'tool_executed'
    | 'tool_result'
    | 'tool_execution'
    | 'tool_use'
    | 'tool_called'
    | 'agent_completed'
    | 'handoff'
    | 'orchestration_complete'
    | 'execution_completed'
    | 'execution_failed';

interface PollingEvent {
  type: PollingEventType;
  agent?: string;
  timestamp: string;
  data?: any;
}

interface Agent {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  status: 'idle' | 'thinking' | 'working' | 'streaming' | 'complete' | 'error';
  contributions: number;
  lastActivity?: string;
  currentTask?: string;
  tokensUsed?: number;
  toolsUsed?: string[];
}

interface AgentActivity {
  agentName: string;
  action: string;
  timestamp: Date;
  type: 'handoff' | 'tool' | 'message' | 'complete' | 'error';
  details?: any;
}

interface OrchestratorAgent {
  id: string;
  name: string;
  role: string;
  tools: string[];
  model: string;
  temperature: number;
  system_prompt: string;
  color: string;
}

interface OrchestratorState {
  taskInput: string;
  agents: OrchestratorAgent[];
  selectedTools: { [agentId: string]: string[] };
  expandedAgent: string | null;
  showToolLibrary: boolean;
  selectedCategory: string;
}

type ViewMode = 'chat' | 'timeline' | 'orchestrator';

const MESSAGE_BATCH_SIZE = 1000;

// Professional Execution Start Component - Enhanced
const ExecutionStartMessage = memo(({ task, agents, timestamp, completed }: {
  task: string;
  agents: any[];
  timestamp: Date;
  completed?: boolean;
}) => {
  return (
      <div className="execution-start-card">
        <div className="execution-header">
          <div className={`execution-icon ${completed ? 'completed' : 'active'}`}>
            {completed ? '✅' : '🚀'}
          </div>
          <div className="execution-info">
            <h3 className="execution-title">
              {completed ? 'Swarm Execution Completed' : 'Swarm Execution Started'}
            </h3>
            <p className="execution-subtitle">
              {completed ? 'All agents have finished their tasks' : 'Agents connecting in real-time...'}
            </p>
          </div>
          <div className="execution-time">
            {timestamp.toLocaleTimeString()}
          </div>
        </div>

        <div className="execution-task">
          <div className="task-label">Task</div>
          <p className="task-text">{task}</p>
        </div>

        {agents && agents.length > 0 && (
            <div className="execution-agents">
              <div className="agents-label">Agents ({agents.length})</div>
              <div className="agents-list">
                {agents.map((agent, index) => (
                    <div key={index} className="agent-item">
                      <div className="agent-number">{index + 1}</div>
                      <div className="agent-details">
                        <div className="agent-name">{agent.name || agent}</div>
                        {agent.role && <div className="agent-role">{agent.role}</div>}
                      </div>
                      {agent.model && (
                          <div className="agent-model">{agent.model}</div>
                      )}
                    </div>
                ))}
              </div>
            </div>
        )}

        {!completed && (
            <div className="execution-status active">
              <div className="loading-spinner"></div>
              <p className="status-text">Connecting to agents and starting execution...</p>
              <p className="status-hint">Responses will stream in real-time as agents work</p>
            </div>
        )}

        {completed && (
            <div className="execution-status completed">
              <p className="status-text">✅ Execution completed successfully</p>
              <p className="status-hint">All agent responses are ready below</p>
            </div>
        )}
      </div>
  );
});

// Enhanced Handoff Message Component
const HandoffMessage = memo(({ content, timestamp, metadata }: {
  content: string;
  timestamp: Date;
  metadata?: any;
}) => {
  const { from_agent, to_agent, reason } = metadata || {};

  return (
      <div className="handoff-message-card">
        <div className="handoff-icon">🔄</div>
        <div className="handoff-content">
          <span className="handoff-label">Handoff:</span>
          <div className="handoff-agents">
            <div className="agent-chip from">{from_agent?.replace(/_/g, ' ')}</div>
            <div className="handoff-arrow">→</div>
            <div className="agent-chip to">{to_agent?.replace(/_/g, ' ')}</div>
          </div>
        </div>
        <div className="handoff-meta">
          <div className="handoff-time">{timestamp.toLocaleTimeString()}</div>
          {reason && <div className="handoff-reason">{reason}</div>}
        </div>
      </div>
  );
});

// Enhanced Message Component with Professional Styling
const MemoizedMessage = React.forwardRef<HTMLDivElement, {
  msg: Message;
  onArtifactCreate: (artifact: any, messageId?: string) => void;
  getAgentProfile: (name: string) => { emoji: string; color: string };
  globalExpanded: boolean;
  streamingContent?: string;
  isBookmarked?: boolean;
  onToggleBookmark?: (messageId: string) => void;
  agentIterations: Map<string, AgentIteration>;
}>(({ msg, onArtifactCreate, getAgentProfile, globalExpanded, streamingContent, isBookmarked, onToggleBookmark, agentIterations }, ref) => {
  const [localExpanded, setLocalExpanded] = useState(true);
  const isExpanded = localExpanded;

  if (msg.type === 'user') {
    return (
        <div ref={ref} className="message user-message" id={`message-${msg.id}`}>
          <div className="user-message-content">
            <p>{msg.content}</p>
            <span className="message-time">{msg.timestamp.toLocaleTimeString()}</span>
          </div>
        </div>
    );
  }

  if (msg.type === 'execution_start') {
    const { task, agents, completed } = msg.metadata || {};
    return (
        <ExecutionStartMessage
            task={task || msg.content}
            agents={agents || []}
            timestamp={msg.timestamp}
            completed={completed}
        />
    );
  }

  if (msg.type === 'handoff') {
    return (
        <HandoffMessage
            content={msg.content}
            timestamp={msg.timestamp}
            metadata={msg.metadata}
        />
    );
  }

  if (msg.type === 'tool_result' && msg.toolResult) {
    return (
        <div ref={ref} className="message tool-result-message" id={`message-${msg.id}`}>
          <ToolResultDisplay
              result={msg.toolResult}
              className="mt-2"
              collapsible={true}
              defaultExpanded={false}
          />
        </div>
    );
  }

  if (msg.type === 'agent' && msg.agent) {
    const profile = getAgentProfile(msg.agent);
    const isComplete = msg.status === 'complete';
    const displayContent = msg.content || streamingContent || '';
    const hasContent = displayContent && displayContent.trim().length > 0;
    const isStreaming = (
        (streamingContent && streamingContent.length > 0) ||
        msg.status === 'streaming' ||
        (msg.status === 'thinking' && !isComplete)
    );

    return (
        <div ref={ref} className={`message agent-message ${isBookmarked ? 'bookmarked' : ''}`} id={`message-${msg.id}`}>
          <div className="agent-avatar" style={{ background: `linear-gradient(135deg, ${profile.color}, ${profile.color}dd)` }}>
            {profile.emoji}
          </div>
          <div className="agent-message-wrapper">
            <div className="agent-message-card">
              <div className="agent-message-header" onClick={() => setLocalExpanded(!localExpanded)}>
            <span className="agent-message-name">
              {msg.agent.replace(/_/g, ' ')}
            </span>
                <div className="agent-message-status">
                  {msg.status === 'thinking' && !hasContent && (
                      <span className="status-chip thinking">Thinking</span>
                  )}
                  {isStreaming && (
                      <span className="status-chip streaming">
                  Streaming Live <span className="streaming-dot">●</span>
                </span>
                  )}
                  {msg.status === 'complete' && !isStreaming && (
                      <span className="status-chip complete">Complete</span>
                  )}
                  {msg.status === 'working' && (
                      <span className="status-chip working">Working</span>
                  )}
                  {onToggleBookmark && (
                      <button
                          className={`bookmark-btn ${isBookmarked ? 'bookmarked' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleBookmark(msg.id);
                          }}
                          title={isBookmarked ? 'Remove bookmark' : 'Bookmark message'}
                      >
                        {isBookmarked ? '★' : '☆'}
                      </button>
                  )}
                  <div className={`expand-toggle ${isExpanded ? 'expanded' : ''}`}>
                    ▶
                  </div>
                </div>
              </div>

              {!isExpanded && hasContent && (
                  <div className="message-summary">
                    {displayContent.substring(0, 150)}
                    {displayContent.length > 150 ? '...' : ''}
                    {msg.metadata?.toolsUsed?.length > 0 && (
                        <span> • Used {msg.metadata.toolsUsed.length} tools</span>
                    )}
                  </div>
              )}

              {(isExpanded || (isStreaming && !isComplete)) && (
                  <div className="agent-message-body">
                    {msg.status === 'thinking' && !hasContent && (
                        <div className="thinking-indicator">
                          <span></span><span></span><span></span>
                        </div>
                    )}

                    {/* Render agent iteration displays */}
                    {Array.from(agentIterations.values())
                        .filter(iteration => iteration.agentName === msg.agent)
                        .sort((a, b) => a.iteration - b.iteration)
                        .map(iteration => (
                            <AgentIterationDisplay
                                key={`${iteration.agentName}_${iteration.iteration}`}
                                agentName={iteration.agentName}
                                iteration={iteration.iteration}
                                maxIterations={iteration.maxIterations}
                                status={iteration.status}
                                tools={iteration.tools}
                                timestamp={iteration.timestamp}
                            />
                        ))
                    }

                    {/* Use EnhancedMessageDisplay for better tool parsing */}
                    {hasContent && (
                        <EnhancedMessageDisplay
                            content={displayContent}
                            agent={msg.agent}
                            status={msg.status}
                            timestamp={msg.timestamp}
                            onArtifactCreate={(artifact) => onArtifactCreate(artifact, msg.id)}
                            artifacts={msg.artifacts || []}
                        />
                    )}

                    {isStreaming && !isComplete && (
                        <span className="typing-cursor"></span>
                    )}
                  </div>
              )}

              {isExpanded && msg.metadata?.toolsUsed?.length > 0 && (
                  <div className="agent-tools-used">
                    <span className="tools-label">Tools Used:</span>
                    {msg.metadata.toolsUsed.slice(0, 3).map((tool: string, idx: number) => (
                        <span key={idx} className="tool-badge">
                  {tool.replace(/_/g, ' ')}
                </span>
                    ))}
                    {msg.metadata.toolsUsed.length > 3 && (
                        <span className="tool-badge">+{msg.metadata.toolsUsed.length - 3}</span>
                    )}
                  </div>
              )}
            </div>
          </div>
        </div>
    );
  }

  if (msg.type === 'system') {
    return (
        <div ref={ref} className="system-message" id={`message-${msg.id}`}>
          <span>{msg.content}</span>
        </div>
    );
  }

  return null;
});

const SwarmChat: React.FC = () => {
  // URL and navigation
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  
  // Session management state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notification, setNotification] = useState<{ message: string; severity: 'success' | 'error' | 'info' } | null>(null);
  
  // Chat sessions hook
  const {
    sessions,
    currentSession,
    currentSessionId,
    loadSession,
    refreshCurrentSession,
    createSession,
    deleteSession,
    refreshSessions,
    setCurrentSessionId,
  } = useChatSessions();

  // Load session from URL on mount
  useEffect(() => {
    if (urlSessionId && urlSessionId !== currentSessionId) {
      loadSession(urlSessionId);
    }
  }, [urlSessionId, currentSessionId, loadSession]);

  // [Keep all your existing state and hooks...]
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [pollingEvents, setPollingEvents] = useState<PollingEvent[]>([]);
  const [sharedContext, setSharedContext] = useState<Record<string, any>>({});
  const [currentAgent, setCurrentAgent] = useState<string | undefined>();
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [showArtifacts, setShowArtifacts] = useState(true);
  const [allArtifacts, setAllArtifacts] = useState<Artifact[]>([]);
  const [globalExpanded, setGlobalExpanded] = useState(true);
  const [bookmarkedMessages, setBookmarkedMessages] = useState<Set<string>>(new Set());
  const [messageStreamingContent, setMessageStreamingContent] = useState<Map<string, string>>(new Map());
  const [toolApprovalRequests, setToolApprovalRequests] = useState<any[]>([]);
  const [agentIterations, setAgentIterations] = useState<Map<string, AgentIteration>>(new Map());
  const [orchestratorState, setOrchestratorState] = useState<OrchestratorState>({
    taskInput: '',
    agents: [],
    selectedTools: {},
    expandedAgent: null,
    showToolLibrary: false,
    selectedCategory: 'all'
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const processedEventsRef = useRef<Set<string>>(new Set());

  // [Keep all your existing hooks and functions exactly as they are...]
  const {
    execute,
    events,
    isExecuting,
    isConnected,
    result,
    error,
    agentStates,
    isComplete,
    streamingMessages,
    streamUpdateCounter
  } = useSwarmExecution();

  // Use message batcher for smoother streaming
  const handleBatchedUpdates = useCallback((updates: Map<string, string>) => {
    setMessages(prev => {
      let newMessages = [...prev];
      
      updates.forEach((content, agent) => {
        const existingIndex = newMessages.findIndex(
          msg => msg.agent === agent && (msg.status === 'streaming' || msg.status === 'thinking')
        );
        
        if (existingIndex !== -1) {
          // Update existing message
          const existingMsg = newMessages[existingIndex];
          newMessages[existingIndex] = {
            ...existingMsg,
            content: existingMsg.content + content,
            status: 'streaming'
          };
          
          // Update agent stats less frequently
          const updatedContent = newMessages[existingIndex].content;
          if (updatedContent.length % 200 === 0) { // Update every 200 chars instead of 50
            const wordCount = updatedContent.split(/\s+/).filter(w => w.length > 0).length;
            const tokenCount = Math.ceil(updatedContent.length / 4);
            setAgents(prevAgents => prevAgents.map(a =>
                a.name === agent ? {
                  ...a,
                  tokensUsed: tokenCount,
                  currentTask: `Generated ${wordCount} words...`,
                  status: 'streaming' as const
                } : a
            ));
          }
        } else {
          // Create new message
          const newMessage: Message = {
            id: `agent-${agent}-${Date.now()}`,
            type: 'agent',
            agent: agent,
            content: content,
            timestamp: new Date(),
            status: 'streaming'
          };
          newMessages.push(newMessage);
        }
      });
      
      return newMessages;
    });
  }, []);

  const messageBatcher = useMessageBatcher(handleBatchedUpdates, 30); // Batch every 30ms for ~33fps

  const streaming = useStreamingPolling({
    onToken: (agent, token) => {
      // Log tool patterns for debugging (less frequently)
      if ((token.includes('[TOOL:') || token.includes('[TOOL RESULT:')) && Math.random() < 0.1) {
        console.log(`🔍 Tool pattern detected for ${agent}`);
      }
      
      // Add to batch instead of updating immediately
      messageBatcher.addToBatch(agent, token);
    },
    onAgentStart: (agent) => {
      console.log(`🚀 Agent started: ${agent}`);

      const startEvent: PollingEvent = {
        type: 'agent_started' as PollingEventType,
        agent: agent,
        timestamp: new Date().toISOString(),
        data: {}
      };
      setPollingEvents(prev => [...prev, startEvent]);

      setActivities(prev => [...prev, {
        agentName: agent,
        action: 'Started processing',
        timestamp: new Date(),
        type: 'message',
        details: {}
      }]);

      setMessages(prev => {
        const existingMessage = prev.find(m => m.agent === agent && m.status === 'thinking');
        if (!existingMessage) {
          const agentMessage: Message = {
            id: `agent-${agent}-${Date.now()}`,
            type: 'agent',
            agent: agent,
            content: '',
            timestamp: new Date(),
            status: 'thinking'
          };
          return [...prev, agentMessage];
        }
        return prev;
      });

      setAgents(prev => {
        const existing = prev.find(a => a.name === agent);
        if (existing) {
          return prev.map(a => a.name === agent ? {
            ...a,
            status: 'thinking' as const,
            currentTask: 'Starting...',
            contributions: existing.contributions + 1
          } : a);
        } else {
          return [...prev, {
            id: agent,
            name: agent,
            description: agent.replace(/_/g, ' '),
            capabilities: [],
            status: 'thinking' as const,
            contributions: 1,
            currentTask: 'Starting...',
            tokensUsed: 0,
            toolsUsed: []
          }];
        }
      });
    },
    onAgentComplete: (agent, content, providedTokens) => {
      // Flush any remaining batched messages for this agent
      messageBatcher.flush();
      console.log(`✅ Agent completed: ${agent}`);
      console.log(`📄 Final content length:`, content.length);
      console.log(`📄 Final content (first 500 chars):`, content.substring(0, 500));
      
      // Check if content has any tool indicators
      if (content.includes('###') && content.includes('Tool Result')) {
        console.log('🔍 Content contains Tool Result markers');
      }
      if (content.includes('[TOOL:')) {
        console.log('🔍 Content contains [TOOL: markers');
      }

      // Check if the content contains tool results that weren't displayed yet
      // Look for markdown ### format tool results
      const toolResultRegex = /###\s*[✅❌]\s*Tool Result:\s*`([\w_]+)`([\s\S]*?)(?=###|$)/g;
      let toolMatch;
      while ((toolMatch = toolResultRegex.exec(content)) !== null) {
        const toolName = toolMatch[1];
        const toolResult = toolMatch[2].trim();
        console.log(`📊 Found tool result in final content: ${toolName}`);
        
        // Add tool result as a separate message for visibility
        setMessages(prev => {
          // Check if we already have this tool result
          const hasResult = prev.some(msg => 
            msg.type === 'tool_result' && 
            msg.toolResult?.tool_name === toolName
          );
          
          if (!hasResult) {
            return [...prev, {
              id: `tool-result-${toolName}-${Date.now()}`,
              type: 'tool_result',
              content: '',
              timestamp: new Date(),
              toolResult: {
                tool_name: toolName,
                success: !toolResult.includes('Error'),
                display_text: toolResult,
                summary: toolResult.substring(0, 200) + (toolResult.length > 200 ? '...' : ''),
                collapsible: true,
                timestamp: new Date().toISOString()
              }
            }];
          }
          return prev;
        });
      }

      const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
      const tokenCount = providedTokens || Math.ceil(content.length / 4);

      // [Keep all your artifact creation logic...]
      const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
      const fileRegex = /(?:file_write|creating|writing|saving|filename).*?[:\s]+([^\s,]+\.(py|js|html|css|txt|json|yml|yaml|md|tsx|ts|jsx))/gi;

      let codeBlocks: { content: string; lang?: string }[] = [];
      let match;
      const codeBlockRegexWithLang = /```([\w]*)\n([\s\S]*?)```/g;
      while ((match = codeBlockRegexWithLang.exec(content)) !== null) {
        codeBlocks.push({
          lang: match[1] || undefined,
          content: match[2].trim()
        });
      }

      let fileMatches: string[] = [];
      while ((match = fileRegex.exec(content)) !== null) {
        if (!fileMatches.includes(match[1])) {
          fileMatches.push(match[1]);
        }
      }

      fileMatches.forEach((filename, index) => {
        let artifactContent = '';

        const filenameIndex = content.indexOf(filename);
        if (filenameIndex !== -1) {
          const afterFilename = content.substring(filenameIndex);
          const immediateCodeMatch = afterFilename.match(/^[^`]*?```[\w]*\n([\s\S]*?)```/);
          if (immediateCodeMatch) {
            artifactContent = immediateCodeMatch[1].trim();
          }
        }

        if (!artifactContent && index < codeBlocks.length) {
          artifactContent = codeBlocks[index].content;
        }

        if (artifactContent) {
          const artifact: Artifact = createArtifact({
            name: filename,
            type: filename.endsWith('.html') ? 'html' : 'code',
            content: artifactContent,
            agent: agent,
            metadata: {
              tool: 'file_write',
              timestamp: new Date().toISOString(),
              hasContent: true,
              fileSize: artifactContent.length,
              lineCount: artifactContent.split('\n').length
            }
          });

          setAllArtifacts(prev => {
            const existingIndex = prev.findIndex(a =>
                a.name === filename && a.metadata?.agent === agent
            );

            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = artifact;
              return updated;
            }
            return [...prev, artifact];
          });
        }
      });

      setActivities(prev => [...prev, {
        agentName: agent,
        action: `Completed task (${wordCount} words, ${tokenCount} tokens)`,
        timestamp: new Date(),
        type: 'complete',
        details: { tokens: tokenCount, words: wordCount }
      }]);

      const completedEvent: PollingEvent = {
        type: 'agent_completed' as PollingEventType,
        agent: agent,
        timestamp: new Date().toISOString(),
        data: {
          tokens: tokenCount,
          wordCount: wordCount,
          duration: 0
        }
      };
      setPollingEvents(prev => [...prev, completedEvent]);

      setMessages(prev => prev.map(msg => {
        if (msg.agent === agent) {
          return { ...msg, status: 'complete', content };
        }
        return msg;
      }));

      setAgents(prev => prev.map(a =>
          a.name === agent ? {
            ...a,
            status: 'complete' as const,
            tokensUsed: tokenCount,
            currentTask: `Completed: ${wordCount} words (${tokenCount} tokens)`
          } : a
      ));

      // Save agent message to current session
      if (currentSessionId && content.trim()) {
        chatApi.addMessage(currentSessionId, {
          content: content,
          role: 'assistant',
          message_type: 'text',
          agent_name: agent,
          message_metadata: {
            wordCount,
            tokenCount,
            codeBlocks: codeBlocks.length,
            artifacts: fileMatches.length
          }
        }).then(() => {
          // Refresh sessions to update message count and latest message
          refreshSessions();
        }).catch(error => {
          console.error('Failed to save agent message to session:', error);
        });
      }
    },
    onHandoff: (from, to, reason) => {
      console.log(`🔄 Handoff from ${from} to ${to}`);

      setActivities(prev => [...prev, {
        agentName: from,
        action: `Handed off to ${to}`,
        timestamp: new Date(),
        type: 'handoff',
        details: { to, reason }
      }]);

      setMessages(prev => [...prev, {
        id: `handoff-${Date.now()}`,
        type: 'handoff',
        content: `${from} → ${to}`,
        timestamp: new Date(),
        metadata: { from_agent: from, to_agent: to, reason }
      }]);
    },
    onTool: (agent, tool, filename) => {
      console.log(`🔧 ${agent} using tool: ${tool}`);
      
      // Don't add a separate message here - tool info is already in the agent's message stream
      // This reduces redundant notifications

      // Don't create duplicate approval requests here since onToolApprovalRequired handles it
      const sensitiveTools = ['file_write', 'shell', 'editor', 'python_repl', 'code_interpreter', 'tavily_web_search', 'tavily_search', 'http_request'];

      if (!sensitiveTools.includes(tool)) {
        const toolEvent: PollingEvent = {
          type: 'tool_execution' as PollingEventType,
          agent: agent,
          timestamp: new Date().toISOString(),
          data: { tool, filename }
        };
        setPollingEvents(prev => [...prev, toolEvent]);

        setActivities(prev => [...prev, {
          agentName: agent,
          action: `Used tool: ${tool}`,
          timestamp: new Date(),
          type: 'tool',
          details: { tool, filename }
        }]);

        setAgents(prev => prev.map(a => {
          if (a.name === agent) {
            const toolsUsed = a.toolsUsed || [];
            if (!toolsUsed.includes(tool)) {
              toolsUsed.push(tool);
            }
            return { ...a, toolsUsed, currentTask: `Using ${tool}...` };
          }
          return a;
        }));
      }
    },
    onToolApprovalRequired: (agent, data) => {
      console.log('🛑 TOOL APPROVAL REQUIRED:', { agent, data });
      
      // Don't add verbose messages - the approval UI is enough
      // This keeps the chat clean and focused on content
      
      // Create the approval request with proper data
      const approvalRequest = {
        id: `approval-${Date.now()}-${Math.random()}`,
        approval_id: data.approval_id,
        agent: agent,
        tool: data.tool,
        parameters: data.parameters || {},
        message: data.message || `Agent "${agent}" requests permission to use ${data.tool}`,
        timestamp: new Date(),
        execution_paused: data.execution_paused || false
      };

      setToolApprovalRequests(prev => {
        // Check if this approval_id already exists
        const exists = prev.some(r => r.approval_id === data.approval_id);
        if (exists) {
          console.log('⚠️ Duplicate approval request prevented');
          return prev;
        }
        return [...prev, approvalRequest];
      });

      const approvalEvent: PollingEvent = {
        type: 'tool_approval_required',
        agent: agent,
        timestamp: new Date().toISOString(),
        data: data
      };

      setPollingEvents(prev => {
        const exists = prev.some(e =>
            e.type === 'tool_approval_required' &&
            e.agent === agent &&
            e.data?.approval_id === data.approval_id
        );

        if (exists) {
          console.log('⚠️ Duplicate tool_approval_required event prevented');
          return prev;
        }

        return [...prev, approvalEvent];
      });
    },
    onToolApprovalResponse: (agent, data) => {
      console.log('✅ TOOL APPROVAL RESPONSE:', { agent, data });

      // Don't add redundant messages - tool results will appear in the agent's message stream
      // This prevents duplicate notifications

      const responseEvent: PollingEvent = {
        type: 'tool_approval_response',
        agent: agent,
        timestamp: new Date().toISOString(),
        data: data
      };

      setPollingEvents(prev => {
        const exists = prev.some(e =>
            e.type === 'tool_approval_response' &&
            e.agent === agent &&
            e.data?.approval_id === data.approval_id
        );

        if (exists) {
          return prev;
        }

        return [...prev, responseEvent];
      });
    },
    onToolRejected: (agent, data) => {
      console.log('❌ TOOL REJECTED:', { agent, data });

      const rejectEvent: PollingEvent = {
        type: 'tool_rejected',
        agent: agent,
        timestamp: new Date().toISOString(),
        data: data
      };
      setPollingEvents(prev => [...prev, rejectEvent]);
    },
    onToolExecuted: (agent, data) => {
      console.log('✔ TOOL EXECUTED:', { agent, data });
      
      // Don't add a separate system message for tool results
      // The results are already being streamed as part of the agent's message
      // This prevents duplicate "Result:" messages
      
      const executedEvent: PollingEvent = {
        type: 'tool_executed',
        agent: agent,
        timestamp: new Date().toISOString(),
        data: data
      };
      setPollingEvents(prev => [...prev, executedEvent]);
    },
    onArtifact: (agent, artifact) => {
      console.log('🎨 ARTIFACT received:', { agent, artifact });
      
      // Handle single artifact
      handleArtifactCreate(artifact);
    },
    onArtifactsCreated: (agent, artifacts) => {
      console.log('📦 ARTIFACTS CREATED:', { agent, artifacts });
      
      // Handle multiple artifacts
      if (artifacts && Array.isArray(artifacts)) {
        artifacts.forEach(artifact => {
          handleArtifactCreate(artifact);
        });
      }
    },
    onComplete: (metrics) => {
      console.log('✨ Execution complete', metrics);

      setMessages(prev => prev.map(msg => {
        if (msg.type === 'execution_start') {
          return {
            ...msg,
            metadata: {
              ...msg.metadata,
              completed: true
            }
          };
        }
        return msg;
      }));

      if (metrics) {
        setAgents(prev => prev.map(a => ({
          ...a,
          status: 'complete' as const
        })));
      }
    },
    onError: (error) => {
      console.error('Stream error:', error);
      setActivities(prev => [...prev, {
        agentName: 'system',
        action: `Error: ${error}`,
        timestamp: new Date(),
        type: 'error',
        details: { error }
      }]);
    }
  });

  // [Keep all your existing functions exactly as they are...]
  const toggleBookmark = useCallback((messageId: string) => {
    setBookmarkedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  }, []);

  const handleAgentSelect = useCallback((agentName: string) => {
    const agentMessage = messages.find(m => m.agent === agentName);
    if (agentMessage) {
      const messageElement = document.getElementById(`message-${agentMessage.id}`);
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageElement.style.background = '#fef3c7';
        setTimeout(() => {
          messageElement.style.background = '';
        }, 2000);
      }
    }
  }, [messages]);

  const getAgentProfile = useCallback((name: string) => {
    const rolePatterns = {
      developer: { emoji: '💻', color: '#06b6d4' },
      designer: { emoji: '🎨', color: '#ec4899' },
      ui: { emoji: '🎨', color: '#ec4899' },
      tester: { emoji: '🧪', color: '#f59e0b' },
      specialist: { emoji: '🎯', color: '#6b7280' },
      deployment: { emoji: '🚀', color: '#dc2626' },
      research: { emoji: '🔬', color: '#8b5cf6' },
      analyst: { emoji: '📊', color: '#10b981' },
      architect: { emoji: '🏗️', color: '#3b82f6' }
    };

    const cleanName = name.toLowerCase().replace(/[_-]/g, ' ');

    for (const [pattern, profile] of Object.entries(rolePatterns)) {
      if (cleanName.includes(pattern)) {
        return profile;
      }
    }

    return { emoji: '🤖', color: '#6366f1' };
  }, []);

  // Smart auto-scroll that respects user's scroll position
  const isNearBottom = useCallback(() => {
    const container = messagesEndRef.current?.parentElement;
    if (!container) return true;
    
    const { scrollTop, scrollHeight, clientHeight } = container;
    const threshold = 100; // pixels from bottom
    
    return scrollHeight - scrollTop - clientHeight < threshold;
  }, []);

  // Smart auto-scroll that only triggers when user is near bottom
  useEffect(() => {
    if (messagesEndRef.current && isNearBottom()) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, streaming, isExecuting, currentAgent, isNearBottom]);

  // Smart streaming auto-scroll with user scroll position awareness
  useEffect(() => {
    let scrollInterval: NodeJS.Timeout;
    
    if (streaming) {
      // Set up continuous scrolling during streaming only if user is near bottom
      scrollInterval = setInterval(() => {
        if (messagesEndRef.current && streaming && isNearBottom()) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 300); // Check every 300ms during streaming
    }
    
    return () => {
      if (scrollInterval) {
        clearInterval(scrollInterval);
      }
    };
  }, [streaming, isNearBottom]);

  // Smart scroll trigger for message content changes
  useEffect(() => {
    if (messagesEndRef.current && isNearBottom()) {
      const scrollTimer = setTimeout(() => {
        if (messagesEndRef.current && isNearBottom()) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
      return () => clearTimeout(scrollTimer);
    }
  }, [messages, isNearBottom]);

  const resetExecutionState = useCallback(() => {
    setMessages([]);
    setAgents([]);
    setActivities([]);
    setPollingEvents([]);
    setSharedContext({});
    setCurrentAgent(undefined);
    setAllArtifacts([]);
    processedEventsRef.current.clear();
  }, []);

  const handleArtifactSelect = useCallback((artifact: Artifact) => {
    console.log('Selected artifact:', artifact);
  }, []);

  const handleArtifactDelete = useCallback((artifactId: string) => {
    setAllArtifacts(prev => prev.filter(a => a.id !== artifactId));
    setMessages(prev => prev.map(msg => ({
      ...msg,
      artifacts: msg.artifacts?.filter(a => a.id !== artifactId) || []
    })));
  }, []);

  const handleArtifactCreate = useCallback((artifact: any, messageId?: string) => {
    let actualContent = artifact.content || '';

    if (!actualContent && messageId) {
      const message = messages.find(m => m.id === messageId);
      if (message && message.content) {
        const codeBlockMatch = message.content.match(/```(?:\w+)?\n([\s\S]*?)```/);
        if (codeBlockMatch) {
          actualContent = codeBlockMatch[1].trim();
        }
      }
    }

    if (!actualContent && artifact.metadata?.agent) {
      // Get content from messages instead of streamingMessages
      const agentMessage = messages.find(m =>
          m.agent === artifact.metadata.agent &&
          (m.status === 'streaming' || m.status === 'complete')
      );
      if (agentMessage && agentMessage.content) {
        const codeBlockMatch = agentMessage.content.match(/```(?:\w+)?\n([\s\S]*?)```/);
        if (codeBlockMatch) {
          actualContent = codeBlockMatch[1].trim();
        }
      }
    }

    const newArtifact: Artifact = createArtifact({
      name: artifact.title || artifact.filename || artifact.name || 'Untitled',
      type: artifact.type === 'html' ? 'html' : artifact.type || 'code',
      content: actualContent,
      language: artifact.language,
      agent: currentAgent,
      metadata: {
        ...artifact.metadata,
        agent: artifact.metadata?.agent || currentAgent,
        timestamp: new Date().toISOString(),
        fileSize: actualContent.length,
        lineCount: actualContent.split('\n').length
      }
    });

    setAllArtifacts(prev => {
      const isDuplicate = prev.some(existing =>
          existing.content === newArtifact.content &&
          existing.type === newArtifact.type &&
          existing.name === newArtifact.name
      );

      if (isDuplicate) {
        return prev;
      }

      return [...prev, newArtifact];
    });

    if (messageId) {
      setMessages(prev => prev.map(msg =>
          msg.id === messageId
              ? { ...msg, artifacts: [...(msg.artifacts || []), newArtifact] }
              : msg
      ));
    }
  }, [currentAgent, messages]);

  const handleOrchestratorStateUpdate = useCallback((updates: Partial<OrchestratorState>) => {
    setOrchestratorState(prev => ({ ...prev, ...updates }));
  }, []);

  const processEventsForDisplay = useCallback(() => {
    const events = pollingEvents;
    const unprocessedEvents = events.filter(event => {
      const eventKey = `${event.type}-${event.timestamp}-${event.agent || 'system'}`;
      return !processedEventsRef.current.has(eventKey);
    });

    if (unprocessedEvents.length === 0) return;

    unprocessedEvents.forEach(event => {
      const eventKey = `${event.type}-${event.timestamp}-${event.agent || 'system'}`;
      processedEventsRef.current.add(eventKey);

      switch (event.type) {
        case 'execution_started':
          const executionStartMessage: Message = {
            id: `execution-start-${Date.now()}`,
            type: 'execution_start',
            content: event.data?.task || 'Starting execution...',
            timestamp: new Date(),
            metadata: { task: event.data?.task, agents: event.data?.agents || [] }
          };

          setMessages(prev => {
            const hasStartMessage = prev.some(m => m.type === 'execution_start');
            if (!hasStartMessage) {
              return [...prev, executionStartMessage];
            }
            return prev;
          });
          break;

        case 'agent_iteration':
          if (event.agent && event.data) {
            const agentName = event.agent;
            setAgentIterations(prev => {
              const newIterations = new Map(prev);
              const agentKey = `${agentName}_${event.data.iteration}`;
              newIterations.set(agentKey, {
                agentName: agentName,
                iteration: event.data.iteration,
                maxIterations: event.data.max_iterations,
                status: event.data.status || 'reasoning',
                tools: event.data.tools || [],
                timestamp: new Date(event.timestamp)
              });
              return newIterations;
            });
          }
          break;

        case 'orchestration_complete':
          if (event.data) {
            setMessages(prev => [...prev, {
              id: `orchestration-${Date.now()}`,
              type: 'system',
              content: `Orchestration complete: ${event.data.agent_count || 0} agents created`,
              timestamp: new Date()
            }]);
          }
          break;

        case 'tool_result':
          if (event.agent && event.data) {
            // Check if we should add a tool result message
            const toolName = event.data.tool || event.data.name || 'unknown';
            const toolResult = event.data.result || event.data.output || '';

            setMessages(prev => {
              // Check if this tool result already exists
              const exists = prev.some(m =>
                  m.type === 'tool_result' &&
                  m.toolResult?.tool_name === toolName &&
                  m.agent === event.agent
              );

              if (!exists && toolResult) {
                return [...prev, {
                  id: `tool-result-${Date.now()}`,
                  type: 'tool_result',
                  agent: event.agent,
                  content: '',
                  timestamp: new Date(),
                  toolResult: {
                    tool_name: toolName,
                    success: true,
                    display_text: toolResult,
                    summary: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
                    collapsible: true,
                    timestamp: new Date().toISOString()
                  }
                }];
              }
              return prev;
            });
          }
          break;

        case 'handoff':
          if (event.data) {
            const { from_agent, to_agent, reason } = event.data;
            setMessages(prev => [...prev, {
              id: `handoff-${Date.now()}`,
              type: 'handoff',
              content: `${from_agent} → ${to_agent}`,
              timestamp: new Date(),
              metadata: { from_agent, to_agent, reason }
            }]);
          }
          break;

        case 'execution_completed':
          setMessages(prev => prev.map(msg => {
            if (msg.type === 'execution_start') {
              return {
                ...msg,
                metadata: {
                  ...msg.metadata,
                  completed: true
                }
              };
            }
            return msg;
          }));
          break;

        case 'execution_failed':
          if (event.data?.error) {
            setMessages(prev => [...prev, {
              id: `error-${Date.now()}`,
              type: 'system',
              content: `Execution failed: ${event.data.error}`,
              timestamp: new Date()
            }]);
          }
          break;

        case 'agent_started':
        case 'agent_completed':
        case 'text_generation':
        case 'tool_approval_required':
        case 'tool_approval_response':
        case 'tool_rejected':
        case 'tool_executed':
        case 'tool_execution':
        case 'tool_use':
        case 'tool_called':
          // These are handled elsewhere or don't need display processing
          break;

        default:
          console.log('Unhandled event type:', event.type);
      }
    });
  }, [pollingEvents]);

  useEffect(() => {
    if (pollingEvents.length > 0) {
      processEventsForDisplay();
    }
  }, [pollingEvents, processEventsForDisplay]);

  // Session management functions
  const handleSessionSelect = useCallback(async (sessionId: string) => {
    try {
      // Navigate to the session URL
      navigate(`/swarm/${sessionId}`);
      setNotification({ message: 'Session loaded successfully', severity: 'success' });
    } catch (error) {
      console.error('Failed to load session:', error);
      setNotification({ message: 'Failed to load session', severity: 'error' });
    }
  }, [navigate]);

  // Handle URL session parameter on component mount and URL changes
  useEffect(() => {
    if (urlSessionId && urlSessionId !== currentSessionId) {
      // Load session from URL parameter
      loadSession(urlSessionId).catch((error) => {
        console.error('Failed to load session from URL:', error);
        setNotification({ 
          message: 'Session not found. Redirecting to new chat.', 
          severity: 'info' 
        });
        // Redirect to base chat if session doesn't exist
        navigate('/swarm', { replace: true });
      });
    } else if (!urlSessionId && currentSessionId) {
      // Update URL when we have a current session but no URL param
      navigate(`/swarm/${currentSessionId}`, { replace: true });
    }
  }, [urlSessionId, currentSessionId, loadSession, navigate]);

  // Load session messages when session changes
  useEffect(() => {
    if (currentSession) {
      // Convert session messages to local message format
      const sessionMessages: Message[] = currentSession.messages.map(msg => ({
        id: msg.message_id,
        messageId: msg.message_id,
        type: msg.role === 'user' ? 'user' : 'agent',
        agent: msg.agent_name,
        content: msg.content,
        timestamp: new Date(msg.created_at),
        status: 'complete',
        metadata: msg.message_metadata,
        executionId: msg.execution_id || undefined,
      }));
      setMessages(sessionMessages);
    } else {
      setMessages([]);
    }
  }, [currentSession]);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleSend = useCallback(async () => {
    if (!input.trim() || (isExecuting || streaming.isStreaming)) return;

    const task = input;
    setInput('');

    try {
      let sessionId = currentSessionId;

      // Auto-create session if none exists
      if (!sessionId) {
        const newSession = await createSession({
          title: task.length > 50 ? task.substring(0, 50) + '...' : task,
          description: 'Chat with Swarm AI',
        });
        sessionId = newSession.session_id;
        setCurrentSessionId(sessionId); // Update current session state
        navigate(`/swarm/${sessionId}`, { replace: true }); // Update URL
        await refreshSessions(); // Refresh session list
      }

      // Add user message to session
      await chatApi.addMessage(sessionId, {
        content: task,
        role: 'user',
        message_type: 'text',
      });

      resetExecutionState();

      const userMessage: Message = {
        id: `user-${Date.now()}`,
        type: 'user',
        content: task,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, userMessage]);

      // Start swarm execution
      await streaming.startStream(task, []);

      // Refresh session after execution to get agent responses
      setTimeout(() => {
        refreshCurrentSession();
      }, 1000);

      setNotification({ message: 'Message sent successfully', severity: 'success' });
    } catch (error) {
      console.error('Failed to send message:', error);
      setNotification({ message: 'Failed to send message', severity: 'error' });
    }
  }, [input, isExecuting, streaming, resetExecutionState, currentSessionId, refreshCurrentSession, createSession, setCurrentSessionId, refreshSessions, navigate]);

  const handleWorkflowStart = useCallback(async (workflow: any) => {
    resetExecutionState();

    const initialMessages: Message[] = [];

    const systemMessage: Message = {
      id: `system-${Date.now()}`,
      type: 'system',
      content: `🚀 Starting workflow: ${workflow.name || workflow.description}`,
      timestamp: new Date()
    };
    initialMessages.push(systemMessage);

    if (workflow.agents && workflow.agents.length > 0) {
      const executionStartMessage: Message = {
        id: `execution-start-${Date.now()}`,
        type: 'execution_start',
        content: workflow.task || workflow.description || workflow.name,
        timestamp: new Date(),
        metadata: {
          task: workflow.task || workflow.description || workflow.name,
          agents: workflow.agents,
          completed: false
        }
      };
      initialMessages.push(executionStartMessage);
    }

    setMessages(initialMessages);

    await streaming.startStream(
        workflow.task || workflow.description || workflow.name,
        workflow.agents || []
    );

    setViewMode('chat');
  }, [resetExecutionState, streaming]);

  const displayMessages = useMemo(() => {
    return messages.slice(-MESSAGE_BATCH_SIZE);
  }, [messages]);

  const executionStatus = useMemo(() => {
    if (isComplete && !isExecuting) return 'complete';
    if (error) return 'error';
    if (isExecuting) return 'executing';
    return 'idle';
  }, [isComplete, isExecuting, error]);

  const handleToolApprove = useCallback(async (requestId: string, modifiedParams?: any) => {
    const request = toolApprovalRequests.find(r => r.id === requestId);

    setToolApprovalRequests(prev => prev.filter(r => r.id !== requestId));

    if (request) {
      try {
        // Use simple approval endpoint
        const response = await fetch(`http://localhost:8000/api/v1/simple-approval/approve-tool`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tool: request.tool,
            parameters: modifiedParams || request.parameters,
            approved: true
          })
        });

        if (response.ok) {
          console.log('✅ Tool approved:', request.tool);
          // Show notification
          setNotification({ 
            message: `Tool ${request.tool} approved. Automatically retrying...`, 
            severity: 'success' 
          });
          
          // Auto-retry the last request after a short delay
          setTimeout(() => {
            if (messages.length > 0) {
              const lastUserMessage = [...messages].reverse().find(m => m.type === 'user');
              if (lastUserMessage) {
                // Retry the last user request by setting input and triggering send
                setInput(lastUserMessage.content);
                setTimeout(() => handleSend(), 100);
              }
            }
          }, 1000);
        } else {
          console.error('Failed to send approval to backend');
        }
      } catch (error) {
        console.error('Error sending approval:', error);
      }

      setAgents(prev => prev.map(agent => {
        if (agent.name === request.agent) {
          const updatedToolsUsed = [...(agent.toolsUsed || [])];
          if (!updatedToolsUsed.includes(request.tool)) {
            updatedToolsUsed.push(request.tool);
          }
          return {
            ...agent,
            status: 'working',
            currentTask: `Using ${request.tool}...`,
            contributions: agent.contributions + 1,
            toolsUsed: updatedToolsUsed
          };
        }
        return agent;
      }));
    }
  }, [toolApprovalRequests]);

  const handleToolReject = useCallback(async (requestId: string, reason?: string) => {
    const request = toolApprovalRequests.find(r => r.id === requestId);

    setToolApprovalRequests(prev => prev.filter(r => r.id !== requestId));

    if (request?.approval_id) {
      try {
        const response = await fetch(`http://localhost:8000/api/v1/approval/tool-approval/${request.approval_id}/respond`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            approved: false,
            rejection_reason: reason
          })
        });

        if (!response.ok) {
          console.error('Failed to send rejection to backend');
        }
      } catch (error) {
        console.error('Error sending rejection:', error);
      }
    }

    if (request) {
      setMessages(prev => [...prev, {
        id: `msg-rejected-${Date.now()}`,
        type: 'system',
        content: `❌ Rejected ${request?.agent} from using ${request?.tool}: ${reason || 'No reason provided'}`,
        timestamp: new Date()
      }]);
    }
  }, [toolApprovalRequests]);

  // Enhanced Professional Render
  return (
    <PageLayout>
      <div className="swarm-chat-app">
        {/* Modern Chat History Sidebar */}
        {sidebarOpen && (
          <div className="chat-history-wrapper">
            <button 
              className="chat-history-close"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <CloseIcon />
            </button>
            <ChatHistory
              sessions={sessions.map(s => ({
                session_id: s.session_id,
                title: s.title || 'Untitled Chat',
                preview: s.title ? `Chat about ${s.title.toLowerCase()}` : 'No messages yet',
                timestamp: s.last_message_at || s.created_at,
                conversation_count: s.message_count,
                active: s.is_active
              }))}
              currentSessionId={currentSessionId}
              onSelectSession={(sessionId) => {
                handleSessionSelect(sessionId);
                setSidebarOpen(false);
              }}
              onDeleteSession={deleteSession}
              onNewChat={async () => {
                const newSession = await createSession({
                  title: 'New Chat',
                  description: 'A new conversation with Swarm AI'
                });
                handleSessionSelect(newSession.session_id);
                setSidebarOpen(false);
              }}
            />
          </div>
        )}

        {/* Main Chat Area */}
        <div className="swarm-chat">
          {/* Status Header */}
          <div className="chat-status-header">
            <div className="header-left">
              <IconButton onClick={toggleSidebar} size="small" style={{ marginRight: '12px' }}>
                {sidebarOpen ? <CloseIcon /> : <MenuIcon />}
              </IconButton>
              <div className="status-indicators">
                {isConnected && <span className="status-badge connected">● Connected</span>}
                {executionStatus === 'executing' && <span className="status-badge executing">⚡ Executing</span>}
                {executionStatus === 'complete' && <span className="status-badge complete">✅ Complete</span>}
                {executionStatus === 'error' && <span className="status-badge error">❌ Error</span>}
                {agents.filter(a => a.status === 'working' || a.status === 'streaming').length > 0 && (
                    <span className="status-badge active">
                      {agents.filter(a => a.status === 'working' || a.status === 'streaming').length} Active
                    </span>
                )}
                {streamingMessages.size > 0 && (
                    <span className="status-badge streaming">🔴 Live ({streamingMessages.size})</span>
                )}
              </div>
            </div>

          <div className="header-right">
            <div className="view-switcher">
              <button
                  className={`view-btn ${viewMode === 'chat' ? 'active' : ''}`}
                  onClick={() => setViewMode('chat')}
              >
                💬 Chat
              </button>
              <button
                  className={`view-btn ${viewMode === 'timeline' ? 'active' : ''}`}
                  onClick={() => setViewMode('timeline')}
              >
                📊 Timeline
              </button>
              <button
                  className={`view-btn ${viewMode === 'orchestrator' ? 'active' : ''}`}
                  onClick={() => setViewMode('orchestrator')}
              >
                🎯 Orchestrator
              </button>
            </div>

            <ConnectedThemeSwitch />

            <button
                className={`artifacts-toggle ${showArtifacts ? 'active' : ''}`}
                onClick={() => setShowArtifacts(!showArtifacts)}
            >
              📦 Artifacts {allArtifacts.length > 0 && `(${allArtifacts.length})`}
            </button>

            <a
                href="/settings/tools"
                className="view-btn settings-btn"
                title="Tool Configuration"
            >
              ⚙️
            </a>
          </div>
        </div>

        <div className="chat-layout">
          {/* Left Panel - Enhanced Agent Panel */}
          <div className="left-panel">
            <div className="agent-panel-header">
              <div className="agent-panel-title">
                🤖 Agent Network
              </div>
              <div className="agent-stats-grid">
                <div className="stat-card">
                  <div className="stat-value">{agents.length}</div>
                  <div className="stat-label">Agents</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">
                    {agents.filter(a => a.status === 'working' || a.status === 'streaming').length}
                  </div>
                  <div className="stat-label">Active</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">
                    {agents.filter(a => a.status === 'complete').length}
                  </div>
                  <div className="stat-label">Done</div>
                </div>
              </div>
            </div>
            <AgentPanel
                agents={agents}
                currentAgent={currentAgent}
                activities={activities}
                sharedContext={sharedContext}
                isExecuting={isExecuting}
                onAgentSelect={handleAgentSelect}
            />
          </div>

          {/* Center Panel - Main Content */}
          <div className="center-panel">
            {viewMode === 'chat' && (
                <div className="chat-view">
                  {/* Messages Container */}
                  <div className="messages-container">
                    {displayMessages.length === 0 && (
                        <ProfessionalWelcome
                            onActionSelect={(action) => {
                              setInput(action);
                              handleSend();
                            }}
                        />
                    )}

                    {displayMessages.map(msg => {
                      const isBookmarked = bookmarkedMessages.has(msg.id);

                      // Handle tool result messages
                      if (msg.type === 'tool_result' && msg.toolResult) {
                        return (
                            <div className="message tool-result-message" id={`message-${msg.id}`} key={msg.id}>
                              <ToolResultDisplay
                                  result={msg.toolResult}
                                  className="mt-2"
                                  collapsible={true}
                                  defaultExpanded={false}
                              />
                            </div>
                        );
                      }

                      // Handle other message types
                      return (
                          <MemoizedMessage
                              key={msg.id}
                              msg={msg}
                              onArtifactCreate={handleArtifactCreate}
                              getAgentProfile={getAgentProfile}
                              globalExpanded={globalExpanded}
                              streamingContent={msg.content}
                              isBookmarked={isBookmarked}
                              onToggleBookmark={toggleBookmark}
                              agentIterations={agentIterations}
                          />
                      );
                    })}

                    <div ref={messagesEndRef} />
                  </div>

                  {/* Approval Overlay - Positioned above input */}
                  {toolApprovalRequests.length > 0 && (
                      <CleanApprovalOverlay
                          requests={toolApprovalRequests}
                          onApprove={handleToolApprove}
                          onReject={handleToolReject}
                      />
                  )}

                  {/* Chat Input Container */}
                  <div className={`chat-input-container ${toolApprovalRequests.length > 0 ? 'paused' : ''}`}>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                        placeholder={
                          toolApprovalRequests.length > 0 ? "Chat paused - approval required..." :
                              executionStatus === 'executing' ? "Agents working in real-time..." :
                                  executionStatus === 'complete' ? "Task completed - Ask anything else..." :
                                      executionStatus === 'error' ? "Error occurred - Try again..." :
                                          "Message Swarm AI..."
                        }
                        disabled={isExecuting || toolApprovalRequests.length > 0}
                        className="chat-input"
                    />
                    {(isExecuting || streaming.isStreaming) ? (
                        <button
                            onClick={() => streaming.stopStream()}
                            className="send-button stop-button"
                            title="Stop streaming"
                        >
                          ⏹️
                        </button>
                    ) : (
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || toolApprovalRequests.length > 0}
                            className="send-button"
                        >
                          {executionStatus === 'complete' ? '🔄' : '➤'}
                        </button>
                    )}
                  </div>
                </div>
            )}

            {viewMode === 'timeline' && (
                <div className="timeline-view-container" style={{ height: '100%', overflow: 'hidden' }}>
                  <ExecutionTimeline
                      events={[...events, ...pollingEvents]}
                      activities={activities}
                      agents={agents}
                      currentAgent={currentAgent}
                      streamingMessages={messageStreamingContent}
                      autoScroll={true}
                  />
                </div>
            )}

            {viewMode === 'orchestrator' && (
                <div className="orchestrator-view-container" style={{ height: '100%', overflow: 'auto' }}>
                  <OrchestratorPanel
                      onWorkflowStart={handleWorkflowStart}
                      currentWorkflow={null}
                      persistentState={orchestratorState}
                      onStateUpdate={handleOrchestratorStateUpdate}
                  />
                </div>
            )}
          </div>

          {/* Right Panel - Artifacts */}
          {showArtifacts && (
              <div className="right-panel">
                <ArtifactsPanel
                    artifacts={allArtifacts}
                    onArtifactSelect={handleArtifactSelect}
                    onArtifactDelete={handleArtifactDelete}
                    title="Generated Artifacts"
                    showActions={true}
                />
              </div>
          )}
        </div>
        </div>

        {/* Notification Snackbar */}
        <Snackbar
            open={!!notification}
            autoHideDuration={4000}
            onClose={() => setNotification(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert onClose={() => setNotification(null)} severity={notification?.severity || 'info'}>
            {notification?.message || ''}
          </Alert>
        </Snackbar>
      </div>
    </PageLayout>
  );
};

export default SwarmChat;