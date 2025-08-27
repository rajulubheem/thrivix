import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  memo,
  useMemo,
} from "react";
import {
  Bot,
  User,
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  Sparkles,
  X,
  Loader2,
  ArrowDown,
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
    if (message.role === "assistant") {
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none">
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
            }}
          >
            {message.content}
          </ReactMarkdown>
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
                      "flex flex-col gap-1 max-w-[70%]",
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
                        "shadow-sm transition-all duration-200",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card",
                        isHighlighted && "ring-2 ring-primary shadow-lg",
                        message.status === "streaming" && "streaming-message",
                      )}
                    >
                      <CardContent className="p-3">
                        <div className="message-content">
                          <MessageContent
                            message={message}
                            copiedId={copiedId}
                            copyToClipboard={copyToClipboard}
                          />
                        </div>

                        {/* Tool Calls Display */}
                        {message.tools && message.tools.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {message.tools.map((tool) => (
                              <div
                                key={tool.id}
                                className="p-2 bg-muted rounded-md"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium">
                                    {tool.name}
                                  </span>
                                  {tool.status === "pending" && showTools && (
                                    <div className="flex gap-1">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => onToolApprove?.(tool.id)}
                                      >
                                        <Check className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => onToolReject?.(tool.id)}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  )}
                                  {tool.status === "approved" && (
                                    <Badge
                                      variant="default"
                                      className="text-xs"
                                    >
                                      Approved
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
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
