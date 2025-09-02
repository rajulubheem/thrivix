import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import { 
  CheckCircle, 
  XCircle, 
  MessageCircle, 
  Clock, 
  User, 
  Brain,
  AlertTriangle,
  Eye
} from 'lucide-react';

interface HumanInteraction {
  id: string;
  type: 'question' | 'approval' | 'handoff';
  agent: string;
  execution_id: string;
  message: string;
  task?: string;
  context?: any;
  timestamp: string;
  status: 'pending' | 'responded' | 'timeout';
  response?: string;
  approved?: boolean;
}

interface AgentMemory {
  agent_id: string;
  execution_id: string;
  conversation_history: Array<{
    timestamp: string;
    event_type?: string;
    task?: string;
    result?: string;
    source?: string;
  }>;
  human_interactions: Array<{
    timestamp: string;
    type: string;
    question?: string;
    response?: string;
    approved?: boolean;
  }>;
  decisions_made: Array<{
    timestamp: string;
    decision: string;
    reasoning: string;
    outcome?: string;
  }>;
  context_data: Record<string, any>;
}

interface HumanInTheLoopPanelProps {
  executionId: string;
  onInteractionUpdate?: (interaction: HumanInteraction) => void;
}

const HumanInTheLoopPanel: React.FC<HumanInTheLoopPanelProps> = ({
  executionId,
  onInteractionUpdate
}) => {
  const [pendingInteractions, setPendingInteractions] = useState<HumanInteraction[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [agentMemories, setAgentMemories] = useState<Record<string, AgentMemory>>({});
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Poll for pending interactions
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;
    let isPolling = false;
    
    const pollInteractions = async () => {
      if (isPolling) return; // Prevent concurrent polls
      isPolling = true;
      
      try {
        const response = await fetch(`http://localhost:8000/api/v1/event-swarm/human-interactions/${executionId}`);
        if (response.ok) {
          const interactions = await response.json();
          setPendingInteractions(interactions.filter((i: HumanInteraction) => i.status === 'pending'));
        }
      } catch (error) {
        console.error('Failed to fetch interactions:', error);
      } finally {
        isPolling = false;
      }
    };

    // Initial poll
    pollInteractions();
    
    // Set up interval
    pollInterval = setInterval(pollInteractions, 5000);

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [executionId]);

  // Load agent memories
  useEffect(() => {
    const loadMemories = async () => {
      try {
        const response = await fetch(`http://localhost:8000/api/v1/event-swarm/execution-memory/${executionId}`);
        if (response.ok) {
          const memoryData = await response.json();
          setAgentMemories(memoryData.agents || {});
          
          // Select first agent by default
          const agentIds = Object.keys(memoryData.agents || {});
          if (agentIds.length > 0 && !selectedAgent) {
            setSelectedAgent(agentIds[0]);
          }
        }
      } catch (error) {
        console.error('Failed to load agent memories:', error);
      }
    };

    loadMemories();
    const memoryInterval = setInterval(loadMemories, 5000);
    return () => clearInterval(memoryInterval);
  }, [executionId, selectedAgent]);

  const handleResponse = async (interaction: HumanInteraction, responseType: 'approve' | 'deny' | 'respond') => {
    setIsLoading(true);
    try {
      const responseData = {
        interaction_id: interaction.id,
        response_type: responseType,
        response_text: responses[interaction.id] || '',
        timestamp: new Date().toISOString()
      };

      const response = await fetch(`http://localhost:8000/api/v1/event-swarm/human-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(responseData)
      });

      if (response.ok) {
        // Update interaction status
        const updatedInteraction = {
          ...interaction,
          status: 'responded' as const,
          response: responses[interaction.id] || responseType,
          approved: responseType === 'approve'
        };

        setPendingInteractions(prev => prev.filter(i => i.id !== interaction.id));
        setResponses(prev => {
          const updated = { ...prev };
          delete updated[interaction.id];
          return updated;
        });

        onInteractionUpdate?.(updatedInteraction);
      }
    } catch (error) {
      console.error('Failed to send response:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getInteractionIcon = (type: string) => {
    switch (type) {
      case 'approval': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'question': return <MessageCircle className="w-4 h-4 text-blue-500" />;
      case 'handoff': return <User className="w-4 h-4 text-purple-500" />;
      default: return <Brain className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Pending Interactions */}
      {pendingInteractions.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <Clock className="w-5 h-5" />
              Human Input Required ({pendingInteractions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto">
            <ScrollArea className="h-full">
              <div className="space-y-4 pr-4">
                {pendingInteractions.slice(0, 10).map((interaction) => (
              <div key={interaction.id} className="border rounded-lg p-4 bg-white dark:bg-gray-800 dark:border-gray-700">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {getInteractionIcon(interaction.type)}
                    <Badge variant="outline">{interaction.agent}</Badge>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {formatTimestamp(interaction.timestamp)}
                    </span>
                  </div>
                  <Badge variant="secondary">{interaction.type}</Badge>
                </div>
                
                <div className="mb-4">
                  <div className="text-sm font-medium mb-2 dark:text-gray-200">Message:</div>
                  <div className="text-sm bg-gray-50 dark:bg-gray-700 p-3 rounded border dark:border-gray-600 whitespace-pre-wrap dark:text-gray-200">
                    {interaction.message}
                  </div>
                  
                  {interaction.task && (
                    <div className="mt-2">
                      <div className="text-sm font-medium mb-1 dark:text-gray-200">Task:</div>
                      <div className="text-sm text-gray-700 dark:text-gray-300">{interaction.task}</div>
                    </div>
                  )}
                </div>

                {interaction.type === 'approval' && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleResponse(interaction, 'approve')}
                      disabled={isLoading}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleResponse(interaction, 'deny')}
                      disabled={isLoading}
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Deny
                    </Button>
                    <div className="flex-1 flex gap-2">
                      <Input
                        placeholder="Optional: Provide modification instructions"
                        value={responses[interaction.id] || ''}
                        onChange={(e) => setResponses(prev => ({
                          ...prev,
                          [interaction.id]: e.target.value
                        }))}
                        className="flex-1"
                      />
                    </div>
                  </div>
                )}

                {interaction.type === 'question' && (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Your response to the agent..."
                      value={responses[interaction.id] || ''}
                      onChange={(e) => setResponses(prev => ({
                        ...prev,
                        [interaction.id]: e.target.value
                      }))}
                      rows={3}
                    />
                    <Button
                      size="sm"
                      onClick={() => handleResponse(interaction, 'respond')}
                      disabled={isLoading || !responses[interaction.id]?.trim()}
                    >
                      Send Response
                    </Button>
                  </div>
                )}

                {interaction.type === 'handoff' && (
                  <div className="space-y-2">
                    <Alert>
                      <AlertTriangle className="w-4 h-4" />
                      <AlertDescription>
                        The agent is requesting human takeover. You can provide instructions and then allow the agent to continue.
                      </AlertDescription>
                    </Alert>
                    <Textarea
                      placeholder="Instructions for the agent (optional)..."
                      value={responses[interaction.id] || ''}
                      onChange={(e) => setResponses(prev => ({
                        ...prev,
                        [interaction.id]: e.target.value
                      }))}
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleResponse(interaction, 'approve')}
                        disabled={isLoading}
                      >
                        Continue with Instructions
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResponse(interaction, 'deny')}
                        disabled={isLoading}
                      >
                        Take Complete Control
                      </Button>
                    </div>
                  </div>
                )}
                </div>
                ))}
                {pendingInteractions.length > 10 && (
                  <div className="text-center p-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded">
                    Showing 10 of {pendingInteractions.length} pending interactions
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Agent Memory Viewer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Agent Memory & Context
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedAgent} onValueChange={setSelectedAgent}>
            <TabsList className="grid w-full grid-cols-auto">
              {Object.keys(agentMemories).map((agentId) => (
                <TabsTrigger key={agentId} value={agentId} className="text-xs">
                  {agentMemories[agentId]?.agent_id?.substring(0, 8) || agentId}
                </TabsTrigger>
              ))}
            </TabsList>
            
            {Object.entries(agentMemories).map(([agentId, memory]) => (
              <TabsContent key={agentId} value={agentId}>
                <div className="space-y-4">
                  {/* Agent Overview */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/20 rounded border dark:border-blue-800">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {memory.conversation_history?.length || 0}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Tasks</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 dark:bg-green-950/20 rounded border dark:border-green-800">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {memory.human_interactions?.length || 0}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Interactions</div>
                    </div>
                    <div className="text-center p-3 bg-purple-50 dark:bg-purple-950/20 rounded border dark:border-purple-800">
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                        {memory.decisions_made?.length || 0}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Decisions</div>
                    </div>
                    <div className="text-center p-3 bg-amber-50 dark:bg-amber-950/20 rounded border dark:border-amber-800">
                      <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                        {Object.keys(memory.context_data || {}).length}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Context Items</div>
                    </div>
                  </div>

                  {/* Memory Tabs */}
                  <Tabs defaultValue="conversation">
                    <TabsList>
                      <TabsTrigger value="conversation">Conversation</TabsTrigger>
                      <TabsTrigger value="interactions">Human Interactions</TabsTrigger>
                      <TabsTrigger value="decisions">Decisions</TabsTrigger>
                      <TabsTrigger value="context">Context</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="conversation">
                      <ScrollArea className="h-64">
                        <div className="space-y-2">
                          {memory.conversation_history?.map((item, index) => (
                            <div key={index} className="border-l-2 border-blue-200 dark:border-blue-700 pl-3 py-2">
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {formatTimestamp(item.timestamp)}
                              </div>
                              {item.task && (
                                <div className="text-sm font-medium dark:text-gray-200">Task: {item.task}</div>
                              )}
                              {item.result && (
                                <div className="text-sm text-gray-700 dark:text-gray-300 mt-1">{item.result}</div>
                              )}
                            </div>
                          )) || <div className="text-gray-500 dark:text-gray-400 text-center py-4">No conversation history</div>}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                    
                    <TabsContent value="interactions">
                      <ScrollArea className="h-64">
                        <div className="space-y-2">
                          {memory.human_interactions?.map((interaction, index) => (
                            <div key={index} className="border-l-2 border-green-200 dark:border-green-700 pl-3 py-2">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs">
                                  {interaction.type}
                                </Badge>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {formatTimestamp(interaction.timestamp)}
                                </span>
                              </div>
                              {interaction.question && (
                                <div className="text-sm mb-1 dark:text-gray-200">Q: {interaction.question}</div>
                              )}
                              {interaction.response && (
                                <div className="text-sm text-gray-700 dark:text-gray-300">A: {interaction.response}</div>
                              )}
                            </div>
                          )) || <div className="text-gray-500 dark:text-gray-400 text-center py-4">No human interactions</div>}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                    
                    <TabsContent value="decisions">
                      <ScrollArea className="h-64">
                        <div className="space-y-2">
                          {memory.decisions_made?.map((decision, index) => (
                            <div key={index} className="border-l-2 border-purple-200 dark:border-purple-700 pl-3 py-2">
                              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                {formatTimestamp(decision.timestamp)}
                              </div>
                              <div className="text-sm font-medium dark:text-gray-200">{decision.decision}</div>
                              <div className="text-sm text-gray-700 dark:text-gray-300 mt-1">{decision.reasoning}</div>
                              {decision.outcome && (
                                <div className="text-sm text-green-600 dark:text-green-400 mt-1">
                                  Outcome: {decision.outcome}
                                </div>
                              )}
                            </div>
                          )) || <div className="text-gray-500 dark:text-gray-400 text-center py-4">No decisions recorded</div>}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                    
                    <TabsContent value="context">
                      <ScrollArea className="h-64">
                        <div className="space-y-2">
                          {Object.entries(memory.context_data || {}).map(([key, value]) => (
                            <div key={key} className="border border-gray-200 dark:border-gray-700 rounded p-2 bg-gray-50 dark:bg-gray-800">
                              <div className="text-sm font-medium dark:text-gray-200">{key}</div>
                              <div className="text-sm text-gray-700 dark:text-gray-300 mt-1 font-mono">
                                {JSON.stringify(value, null, 2)}
                              </div>
                            </div>
                          ))}
                          {Object.keys(memory.context_data || {}).length === 0 && (
                            <div className="text-gray-500 dark:text-gray-400 text-center py-4">No context data</div>
                          )}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default HumanInTheLoopPanel;