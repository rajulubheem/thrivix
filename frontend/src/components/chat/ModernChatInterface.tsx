import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  memo,
  useMemo,
  Fragment,
} from "react";
import {
  Bot,
  User,
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Sparkles,
  X,
  XCircle,
  Loader2,
  ArrowDown,
  Wrench,
  Eye,
  EyeOff,
  Terminal,
} from "lucide-react";
import { LightweightChatInput } from "./LightweightChatInput";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
// import { ScrollArea } from '../ui/scroll-area';
import { Separator } from "../ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../ui/hover-card";
import { cn } from "../../lib/utils";
import ReactMarkdown from "react-markdown";
import "../../styles/streaming.css";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  status?: "sending" | "sent" | "error" | "streaming";
  tools?: any[];
  thinking?: boolean;
  metadata?: {
    agent?: string;
    type?: string;
    from?: string;
    to?: string;
  };
}

interface ModernChatInterfaceProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  showTools?: boolean;
  onToolApprove?: (toolId: string) => void;
  onToolReject?: (toolId: string) => void;
  highlightAgent?: string | null;
}

// Tool Details Modal
const ToolDetailsModal = memo(
  ({
    tools,
    onClose,
  }: {
    tools: any[];
    onClose: () => void;
  }) => {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div 
          className="bg-background rounded-lg max-w-3xl w-full max-h-[80vh] overflow-hidden shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-semibold">Tool Execution Details</h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-muted rounded-md transition-colors"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>
          
          <div className="p-4 overflow-y-auto max-h-[calc(80vh-8rem)]">
            <div className="space-y-4">
              {tools.map((tool, idx) => (
                <div key={tool.id || idx} className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{getToolIcon(tool.name)}</span>
                    <span className="font-medium">{tool.name}</span>
                    {tool.status === 'completed' && (
                      <Check className="h-4 w-4 text-green-500" />
                    )}
                  </div>
                  
                  {tool.parameters && (
                    <div className="mb-3">
                      <div className="text-sm font-medium text-muted-foreground mb-1">Parameters:</div>
                      <pre className="text-xs bg-muted/50 p-3 rounded-md overflow-x-auto">
                        {typeof tool.parameters === 'string' 
                          ? tool.parameters 
                          : JSON.stringify(tool.parameters, null, 2)}
                      </pre>
                    </div>
                  )}
                  
                  {(tool.output || tool.result) && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1">Output:</div>
                      <pre className="text-xs bg-muted/50 p-3 rounded-md overflow-x-auto max-h-64 overflow-y-auto">
                        {typeof (tool.output || tool.result) === 'string'
                          ? (tool.output || tool.result)
                          : JSON.stringify(tool.output || tool.result, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

// Helper function for tool icons
const getToolIcon = (name?: string) => {
  const toolName = name?.toLowerCase() || '';
  if (toolName.includes('fetch') || toolName.includes('webpage')) return '🌐';
  if (toolName.includes('search') || toolName.includes('tavily')) return '🔍';
  if (toolName.includes('code') || toolName.includes('execute')) return '💻';
  if (toolName.includes('file') || toolName.includes('write')) return '📄';
  if (toolName.includes('api')) return '🔌';
  return '🔧';
};

// Tool Output Display Component - Horizontal Bar Style
const ToolOutputBar = memo(
  ({
    tools,
    onClick,
  }: {
    tools: any[];
    onClick: () => void;
  }) => {
    if (!tools || tools.length === 0) return null;
    
    const completedCount = tools.filter(t => t.status === 'completed').length;
    const totalCount = tools.length;
    
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-3 w-full px-3 py-2 bg-muted/10 hover:bg-muted/20 rounded-lg transition-all group"
      >
        <div className="flex items-center gap-2 flex-1">
          <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            {completedCount === totalCount 
              ? `Used ${totalCount} tool${totalCount > 1 ? 's' : ''}`
              : `Running tools... (${completedCount}/${totalCount})`}
          </span>
          
          <div className="flex items-center gap-1.5">
            {Array.from(new Set(tools.map(t => t.name))).slice(0, 4).map((name, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1 px-2 py-0.5 bg-background/50 rounded text-xs"
              >
                <span>{getToolIcon(name)}</span>
                <span className="text-muted-foreground">{name}</span>
                {tools.filter(t => t.name === name).length > 1 && (
                  <span className="text-muted-foreground/60">
                    ×{tools.filter(t => t.name === name).length}
                  </span>
                )}
              </div>
            ))}
            {Array.from(new Set(tools.map(t => t.name))).length > 4 && (
              <span className="text-xs text-muted-foreground">
                +{Array.from(new Set(tools.map(t => t.name))).length - 4} more
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {completedCount < totalCount && (
            <div className="h-3 w-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          )}
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </div>
      </button>
    );
  }
);

// Move MessageContent outside the main component
const MessageContent = memo(
  ({
    message,
    copiedId,
    copyToClipboard,
  }: {
    message: Message;
    copiedId: string | null;
    copyToClipboard: (text: string, id: string) => void;
  }) => {
    const [showThinking, setShowThinking] = useState(false);
    const [showToolDetails, setShowToolDetails] = useState(false);
    
    // Parse tool outputs from message content
    const parseToolsFromContent = (content: string) => {
      const tools: any[] = [];
      
      // Extract all tool mentions
      const toolMentions = new Map<string, string[]>();
      const lines = content.split('\n');
      let currentTool: string | null = null;
      let currentContent: string[] = [];
      
      for (const line of lines) {
        // Check for tool start
        const toolMatch = line.match(/Tool:\s*(\w+)/);
        const completedMatch = line.match(/✅\s*(\w+)\s+completed/);
        
        if (toolMatch || completedMatch) {
          // Save previous tool if exists
          if (currentTool) {
            const existing = toolMentions.get(currentTool) || [];
            existing.push(currentContent.join('\n'));
            toolMentions.set(currentTool, existing);
          }
          
          // Start new tool
          currentTool = toolMatch ? toolMatch[1] : (completedMatch ? completedMatch[1] : null);
          currentContent = [line];
        } else if (currentTool) {
          currentContent.push(line);
        }
      }
      
      // Save last tool
      if (currentTool) {
        const existing = toolMentions.get(currentTool) || [];
        existing.push(currentContent.join('\n'));
        toolMentions.set(currentTool, existing);
      }
      
      // Convert to tool objects
      toolMentions.forEach((contents, toolName) => {
        const combinedContent = contents.join('\n');
        tools.push({
          id: `${message.id}_${toolName}_${tools.length}`,
          name: toolName,
          parameters: extractParameters(combinedContent),
          output: extractOutput(combinedContent),
          status: combinedContent.includes('✅') ? 'completed' : 'running',
          count: contents.filter((c: string) => c.includes('Tool:')).length || 1
        });
      });
      
      return tools;
    };
    
    const extractParameters = (content: string) => {
      const paramMatch = content.match(/Parameters:([\s\S]*?)(?=\n(?:Output:|Raw Output:|$))/i);
      if (paramMatch) {
        try {
          const paramText = paramMatch[1].trim();
          // Try to parse as JSON
          if (paramText.startsWith('{')) {
            return JSON.parse(paramText);
          }
          return paramText;
        } catch {
          return paramMatch[1].trim();
        }
      }
      return null;
    };
    
    const extractOutput = (content: string) => {
      const outputMatch = content.match(/(?:Raw Output:|Output:)([\s\S]*?)(?=\n(?:Tool:|$))/i);
      if (outputMatch) {
        return outputMatch[1].trim();
      }
      return null;
    };
    
    if (message.role === "assistant") {
      // Use tools from message.tools array if available, otherwise parse from content
      // Only parse from content if no tools array exists (for backward compatibility)
      const allTools = message.tools && message.tools.length > 0 
        ? message.tools 
        : parseToolsFromContent(message.content);
      
      // Split message into planning and response sections
      const planningMarker = '📋 **Planning Task Execution**';
      const responseMarker = '## Response:';
      
      let planningContent = '';
      let responseContent = message.content;
      
      // Tool output sections are no longer sent from backend, so no need to filter
      
      if (message.content.includes(planningMarker)) {
        const parts = message.content.split(responseMarker);
        if (parts.length > 1) {
          planningContent = parts[0];
          responseContent = responseMarker + parts.slice(1).join(responseMarker);
        } else {
          // If no response marker, check for other patterns
          const lines = message.content.split('\n');
          const planningEndIndex = lines.findIndex(line => 
            line.trim() === '' && 
            lines[lines.indexOf(line) + 1] && 
            !lines[lines.indexOf(line) + 1].startsWith(' ') &&
            !lines[lines.indexOf(line) + 1].startsWith('-') &&
            !lines[lines.indexOf(line) + 1].startsWith('*')
          );
          
          if (planningEndIndex > 0) {
            planningContent = lines.slice(0, planningEndIndex).join('\n');
            responseContent = lines.slice(planningEndIndex + 1).join('\n');
          }
        }
      }
      
      return (
        <div className="space-y-3">
          {/* Tool Outputs Section - Horizontal Bar */}
          {allTools.length > 0 && (
            <>
              <ToolOutputBar 
                tools={allTools}
                onClick={() => setShowToolDetails(true)}
              />
              {showToolDetails && (
                <ToolDetailsModal
                  tools={allTools}
                  onClose={() => setShowToolDetails(false)}
                />
              )}
            </>
          )}
          
          {planningContent && (
            <div className="border border-muted/50 rounded-lg p-3 bg-muted/10">
              <button
                onClick={() => setShowThinking(!showThinking)}
                className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors w-full text-left"
              >
                <ChevronDown 
                  className={cn(
                    "h-4 w-4 transition-transform",
                    showThinking && "rotate-180"
                  )}
                />
                <Sparkles className="h-4 w-4" />
                AI Thinking Process
              </button>
              
              {showThinking && (
                <div className="mt-3 prose prose-sm dark:prose-invert max-w-none opacity-70">
                  <ReactMarkdown>
                    {planningContent}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}
          
          {/* Main response content */}
          <div className="prose prose-sm dark:prose-invert max-w-none break-words">
            <ReactMarkdown
              components={{
                code({ className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || "");
                  const inline = !className;
                  return !inline && match ? (
                    <div className="relative group">
                      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            copyToClipboard(String(children), message.id)
                          }
                        >
                          {copiedId === message.id ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <pre className="bg-muted p-3 rounded-lg overflow-x-auto">
                        <code className="text-sm">
                          {String(children).replace(/\n$/, "")}
                        </code>
                      </pre>
                    </div>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
                h2: ({ children }: any) => (
                  <h2 className="text-lg font-semibold mt-4 mb-2 text-primary">
                    {children}
                  </h2>
                ),
                h3: ({ children }: any) => (
                  <h3 className="text-base font-medium mt-3 mb-2">
                    {children}
                  </h3>
                ),
                ul: ({ children }: any) => (
                  <ul className="list-disc list-inside space-y-1 my-2">
                    {children}
                  </ul>
                ),
                li: ({ children }: any) => (
                  <li className="text-sm leading-relaxed">
                    {children}
                  </li>
                ),
                p: ({ children }: any) => (
                  <p className="text-sm leading-relaxed mb-2">
                    {children}
                  </p>
                ),
                strong: ({ children }: any) => (
                  <strong className="font-semibold text-primary">
                    {children}
                  </strong>
                ),
              }}
            >
              {responseContent}
            </ReactMarkdown>
          </div>
        </div>
      );
    }
    return <p className="text-sm">{message.content}</p>;
  },
);

const ModernChatInterfaceComponent: React.FC<ModernChatInterfaceProps> = ({
  messages,
  onSendMessage,
  isLoading = false,
  placeholder = "Type your message...",
  showTools = false,
  onToolApprove,
  onToolReject,
  highlightAgent,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<any>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Smart auto-scroll with performance optimization
  useEffect(() => {
    if (!scrollAreaRef.current) return;

    const scrollContainer = scrollAreaRef.current;
    const lastMessage = messages[messages.length - 1];
    const shouldAutoScroll = !isUserScrolling || lastMessage?.role === "user";

    if (shouldAutoScroll && lastMessage) {
      // Use RAF for smooth scrolling
      requestAnimationFrame(() => {
        if (scrollContainer) {
          const scrollOptions: ScrollToOptions = {
            top: scrollContainer.scrollHeight,
            behavior:
              lastMessage.status === "streaming"
                ? "auto"
                : ("smooth" as ScrollBehavior),
          };
          scrollContainer.scrollTo(scrollOptions);
        }
      });
    }
  }, [messages.length, isUserScrolling]); // Only depend on message count, not content

  // Optimized scroll detection with debouncing
  useEffect(() => {
    const scrollContainer = scrollAreaRef.current;
    if (!scrollContainer) return;

    let rafId: number | null = null;

    const handleScroll = () => {
      if (rafId) return; // Skip if already scheduled

      rafId = requestAnimationFrame(() => {
        rafId = null;

        // Clear existing timeout
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }

        // Check if user is near bottom (within 100px)
        const isNearBottom =
          scrollContainer.scrollHeight -
            scrollContainer.scrollTop -
            scrollContainer.clientHeight <
          100;

        if (!isNearBottom) {
          setIsUserScrolling(true);
        }

        // Reset after user stops scrolling
        scrollTimeoutRef.current = setTimeout(() => {
          if (isNearBottom) {
            setIsUserScrolling(false);
          }
        }, 500); // Reduced from 1000ms for better responsiveness
      });
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  // Memoize handlers
  const handleSendMessage = useCallback(
    (message: string) => {
      onSendMessage(message);
    },
    [onSendMessage],
  );

  // Scroll to first message from specific agent
  useEffect(() => {
    if (highlightAgent && messageRefs.current.size > 0) {
      // Find first message from this agent
      const agentMessage = messages.find(
        (m) => (m as any).metadata?.agent === highlightAgent,
      );

      if (agentMessage && messageRefs.current.has(agentMessage.id)) {
        const element = messageRefs.current.get(agentMessage.id);
        element?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [highlightAgent, messages.length]);

  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  // MessageContent is now defined outside the component

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full bg-background relative">
        {/* Messages Area */}
        <div
          className="flex-1 p-4 smooth-scroll overflow-auto"
          ref={scrollAreaRef}
        >
          <div className="space-y-4 max-w-4xl mx-auto">
            {messages.map((message) => {
              // Check if this message should be highlighted or dimmed
              const messageAgent = (message as any).metadata?.agent;
              const isHighlighted =
                highlightAgent && messageAgent === highlightAgent;
              const isDimmed =
                highlightAgent &&
                messageAgent &&
                messageAgent !== highlightAgent &&
                message.role !== "user";

              return (
                <div
                  key={message.id}
                  ref={(el) => {
                    if (el) messageRefs.current.set(message.id, el);
                    else messageRefs.current.delete(message.id);
                  }}
                  className={cn(
                    "flex gap-3 transition-all duration-200",
                    message.role === "user" ? "justify-end" : "justify-start",
                    isDimmed && "opacity-40",
                    isHighlighted && "scale-[1.02]",
                  )}
                >
                  {message.role !== "user" && (
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        <Bot className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div
                    className={cn(
                      "flex flex-col gap-1 max-w-[85%]",
                      message.role === "user" ? "items-end" : "items-start",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {message.role === "assistant" && (
                        <span className="text-xs text-muted-foreground font-medium">
                          {(message as any).metadata?.agent
                            ? `🤖 ${(message as any).metadata.agent}`
                            : "AI Assistant"}
                        </span>
                      )}
                      {message.thinking && (
                        <Badge variant="secondary" className="text-xs">
                          <Sparkles className="h-3 w-3 mr-1" />
                          Thinking...
                        </Badge>
                      )}
                    </div>

                    <Card
                      className={cn(
                        "shadow-sm transition-all duration-200 max-w-full overflow-hidden",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card",
                        isHighlighted && "ring-2 ring-primary shadow-lg",
                        message.status === "streaming" && "streaming-message",
                      )}
                    >
                      <CardContent className="p-3 overflow-x-auto">
                        <div className="message-content">
                          <MessageContent
                            message={message}
                            copiedId={copiedId}
                            copyToClipboard={copyToClipboard}
                          />
                        </div>

                      </CardContent>
                    </Card>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </span>
                      {message.status === "error" && (
                        <Badge variant="destructive" className="text-xs">
                          Error
                        </Badge>
                      )}
                    </div>
                  </div>

                  {message.role === "user" && (
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              );
            })}

            {isLoading && (
              <div className="flex gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <Card className="bg-card animate-pulse">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex space-x-1">
                        <div
                          className="w-2 h-2 bg-primary rounded-full animate-bounce"
                          style={{ animationDelay: "0ms" }}
                        ></div>
                        <div
                          className="w-2 h-2 bg-primary rounded-full animate-bounce"
                          style={{ animationDelay: "150ms" }}
                        ></div>
                        <div
                          className="w-2 h-2 bg-primary rounded-full animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        ></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>

        {/* Scroll to bottom button */}
        {isUserScrolling && (
          <div className="absolute bottom-20 right-4 z-10">
            <Button
              onClick={() => {
                if (scrollAreaRef.current) {
                  scrollAreaRef.current.scrollTo({
                    top: scrollAreaRef.current.scrollHeight,
                    behavior: "smooth",
                  });
                  setIsUserScrolling(false);
                }
              }}
              size="sm"
              variant="secondary"
              className="rounded-full shadow-lg"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
        )}

        <Separator />

        {/* Use the lightweight input component */}
        <LightweightChatInput
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          placeholder={placeholder}
        />
      </div>
    </TooltipProvider>
  );
};

// Memoize the component to prevent unnecessary re-renders
export const ModernChatInterface = memo(ModernChatInterfaceComponent);
