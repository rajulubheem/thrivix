import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  MessageSquare,
  Plus,
  Search,
  Clock,
  Star,
  Archive,
  Trash2,
  MoreVertical,
  Hash,
  Filter,
  Download,
  Share2,
  BookOpen,
  Sparkles
} from 'lucide-react';
import { ModernLayout } from '../components/layout/ModernLayout';
import { ModernChatInterface } from '../components/chat/ModernChatInterface';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { cn } from '../lib/utils';
import axios from 'axios';

interface Conversation {
  id: string;
  title: string;
  preview: string;
  timestamp: Date;
  messages: number;
  starred: boolean;
  tags: string[];
}

interface ConversationStats {
  totalConversations: number;
  totalMessages: number;
  avgResponseTime: string;
  topTopics: string[];
}

export const ModernConversation: React.FC = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<any[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(sessionId || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [stats, setStats] = useState<ConversationStats>({
    totalConversations: 24,
    totalMessages: 342,
    avgResponseTime: '1.2s',
    topTopics: ['Research', 'Coding', 'Analysis', 'Writing']
  });

  useEffect(() => {
    // Load mock conversations
    const mockConversations: Conversation[] = [
      {
        id: '1',
        title: 'Market Research Analysis',
        preview: 'Can you help me analyze the latest trends in...',
        timestamp: new Date(Date.now() - 1000 * 60 * 5),
        messages: 12,
        starred: true,
        tags: ['Research', 'Business']
      },
      {
        id: '2',
        title: 'Python Code Review',
        preview: 'I need help optimizing this function for...',
        timestamp: new Date(Date.now() - 1000 * 60 * 30),
        messages: 8,
        starred: false,
        tags: ['Coding', 'Python']
      },
      {
        id: '3',
        title: 'Content Strategy Discussion',
        preview: 'Let\'s brainstorm ideas for the upcoming...',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
        messages: 15,
        starred: true,
        tags: ['Writing', 'Strategy']
      },
      {
        id: '4',
        title: 'Data Visualization Help',
        preview: 'How can I create an interactive dashboard...',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
        messages: 6,
        starred: false,
        tags: ['Data', 'Visualization']
      }
    ];
    
    setConversations(mockConversations);
    
    if (sessionId) {
      setSelectedConversation(sessionId);
      loadConversation(sessionId);
    }
  }, [sessionId]);

  const loadConversation = (id: string) => {
    // Load messages for selected conversation
    const mockMessages = [
      {
        id: '1',
        role: 'user',
        content: 'Can you help me understand the latest market trends?',
        timestamp: new Date(Date.now() - 1000 * 60 * 10)
      },
      {
        id: '2',
        role: 'assistant',
        content: 'I\'d be happy to help you analyze market trends. Could you specify which market or industry you\'re interested in?',
        timestamp: new Date(Date.now() - 1000 * 60 * 9)
      }
    ];
    setMessages(mockMessages);
  };

  const handleSendMessage = async (message: string) => {
    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: message,
      timestamp: new Date(),
      status: 'sent' as const
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Simulate AI response
    setTimeout(() => {
      const response = {
        id: (Date.now() + 1).toString(),
        role: 'assistant' as const,
        content: `I understand you're asking about: "${message}". Let me provide you with detailed insights...`,
        timestamp: new Date(),
        status: 'sent' as const
      };
      setMessages(prev => [...prev, response]);
    }, 1000);
  };

  const createNewConversation = () => {
    const newId = Date.now().toString();
    navigate(`/conversation/${newId}`);
    setSelectedConversation(newId);
    setMessages([]);
  };

  const deleteConversation = (id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id));
    if (selectedConversation === id) {
      setSelectedConversation(null);
      setMessages([]);
    }
  };

  const toggleStar = (id: string) => {
    setConversations(prev => 
      prev.map(c => c.id === id ? { ...c, starred: !c.starred } : c)
    );
  };

  const filteredConversations = conversations.filter(conv => {
    if (searchQuery) {
      return conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
             conv.preview.toLowerCase().includes(searchQuery.toLowerCase());
    }
    if (activeTab === 'starred') {
      return conv.starred;
    }
    return true;
  });

  const ConversationItem = ({ conversation }: { conversation: Conversation }) => {
    const isSelected = selectedConversation === conversation.id;
    
    return (
      <div
        className={cn(
          "p-3 rounded-lg cursor-pointer transition-colors",
          isSelected ? "bg-accent" : "hover:bg-accent/50"
        )}
        onClick={() => {
          setSelectedConversation(conversation.id);
          loadConversation(conversation.id);
          navigate(`/conversation/${conversation.id}`);
        }}
      >
        <div className="flex items-start justify-between mb-1">
          <h4 className="font-medium text-sm truncate flex-1">{conversation.title}</h4>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => toggleStar(conversation.id)}>
                <Star className="h-4 w-4 mr-2" />
                {conversation.starred ? 'Unstar' : 'Star'}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Archive className="h-4 w-4 mr-2" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="text-destructive"
                onClick={() => deleteConversation(conversation.id)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <p className="text-xs text-muted-foreground truncate mb-2">
          {conversation.preview}
        </p>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {conversation.starred && (
              <Star className="h-3 w-3 fill-current text-yellow-500" />
            )}
            <span className="text-xs text-muted-foreground">
              {conversation.messages} messages
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(conversation.timestamp).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </span>
        </div>
        
        {conversation.tags.length > 0 && (
          <div className="flex gap-1 mt-2">
            {conversation.tags.map(tag => (
              <Badge key={tag} variant="secondary" className="text-xs py-0">
                <Hash className="h-2 w-2 mr-1" />
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <ModernLayout>
      <div className="flex h-screen">
        {/* Sidebar - Conversation List */}
        <div className="w-80 border-r bg-card/50">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Conversations</h2>
              <Button size="sm" onClick={createNewConversation}>
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
            </div>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
            <TabsList className="grid w-full grid-cols-3 p-1">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="starred">
                <Star className="h-3 w-3 mr-1" />
                Starred
              </TabsTrigger>
              <TabsTrigger value="recent">
                <Clock className="h-3 w-3 mr-1" />
                Recent
              </TabsTrigger>
            </TabsList>
            
            <ScrollArea className="h-[calc(100vh-180px)]">
              <div className="p-2 space-y-1">
                {filteredConversations.map(conversation => (
                  <ConversationItem key={conversation.id} conversation={conversation} />
                ))}
              </div>
            </ScrollArea>
          </Tabs>
          
          {/* Stats Section */}
          <div className="p-4 border-t bg-muted/30">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground">Total</div>
                <div className="font-medium">{stats.totalConversations} chats</div>
              </div>
              <div>
                <div className="text-muted-foreground">Messages</div>
                <div className="font-medium">{stats.totalMessages}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="border-b bg-card/50 px-6 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        <MessageSquare className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-medium">
                        {conversations.find(c => c.id === selectedConversation)?.title || 'New Conversation'}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Sparkles className="h-3 w-3" />
                        AI Assistant ready
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon">
                      <Share2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <BookOpen className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Chat Interface */}
              <div className="flex-1 overflow-hidden">
                <ModernChatInterface
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  placeholder="Ask me anything..."
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No conversation selected</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Choose a conversation from the sidebar or start a new one
                </p>
                <Button onClick={createNewConversation}>
                  <Plus className="h-4 w-4 mr-2" />
                  Start New Conversation
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModernLayout>
  );
};