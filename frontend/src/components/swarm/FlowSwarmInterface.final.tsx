import React, { useState, useCallback, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';

// Component imports
import AgentNode from './flow-interface/AgentNode';
import AnimatedEdge from './flow-interface/AnimatedEdge';
import InteractiveEdge from './components/InteractiveEdge';
import WorkflowToolbar from './flow-interface/WorkflowToolbar';
import ChatPanel from './flow-interface/ChatPanel';
import BlockSettingsPanel from './components/BlockSettingsPanel';
import UnifiedBlockManager from './components/UnifiedBlockManager';

// Hook imports
import { useWorkflowState } from './flow-interface/hooks/useWorkflowState';
import { useWebSocket } from './flow-interface/hooks/useWebSocket';
import { useWorkflowExecution } from './flow-interface/hooks/useWorkflowExecution';

// Style and type imports
import './FlowSwarmInterface.css';
import { ChatMessage } from './flow-interface/types';

const nodeTypes = { agentNode: AgentNode };
const edgeTypes = { animated: AnimatedEdge, interactiveEdge: InteractiveEdge };

const FlowSwarmInterface: React.FC = () => {
  // Theme state
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('swarm-theme');
    return saved ? saved === 'dark' : true;
  });

  // UI state
  const [isChatVisible, setIsChatVisible] = useState(true);
  const [chatWidth, setChatWidth] = useState(400);
  const [isExecuting, setIsExecuting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');

  // Workflow state
  const {
    nodes, setNodes, edges, setEdges,
    selectedAgent, setSelectedAgent,
    selectedNodeForSettings, setSelectedNodeForSettings,
    executionState, setExecutionState,
    onConnect, addNode, deleteNode, duplicateNode,
    updateNode, clearWorkflow, saveAsTemplate, loadTemplate, getTemplates,
  } = useWorkflowState(isDarkMode);

  // WebSocket connection
  const { isConnected, frames, sendMessage, clearFrames } = useWebSocket('ws://localhost:8000/ws');

  // Workflow execution handlers
  const { handleExecute, handlePause, handleReset, handleSave } = useWorkflowExecution({
    nodes, edges, sendMessage, clearFrames,
    setIsExecuting, setExecutionState, setNodes, isConnected,
  });

  // Theme toggle
  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => {
      const newTheme = !prev;
      localStorage.setItem('swarm-theme', newTheme ? 'dark' : 'light');
      return newTheme;
    });
  }, []);

  // Chat handlers
  const handleSendMessage = useCallback(() => {
    if (!userInput.trim()) return;

    const newMessage: ChatMessage = {
      role: 'user',
      content: userInput,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setUserInput('');

    if (isConnected) {
      sendMessage({ type: 'user_message', content: userInput });
    }
  }, [userInput, isConnected, sendMessage]);

  const handleAgentClick = useCallback((agentId: string) => {
    const node = nodes.find((n) => n.id === agentId || n.data.name === agentId);
    if (node) {
      setSelectedAgent({
        id: node.id,
        name: node.data.name || 'Agent',
        status: node.data.status || 'idle',
      });
    }
  }, [nodes]);

  // Process WebSocket frames
  useEffect(() => {
    if (frames.length > 0) {
      const latestFrame = frames[frames.length - 1];
      if (latestFrame.type === 'token' && latestFrame.content) {
        const message: ChatMessage = {
          role: 'assistant',
          content: latestFrame.content,
          timestamp: new Date().toISOString(),
          agentId: latestFrame.agent_id,
          agentName: latestFrame.sender,
        };
        setMessages((prev) => [...prev, message]);
      }
    }
  }, [frames]);

  // Update node/edge appearance with theme
  useEffect(() => {
    setNodes((nds) => nds.map((node) => ({
      ...node, data: { ...node.data, isDarkMode },
    })));
    setEdges((eds) => eds.map((edge) => ({
      ...edge, data: { ...edge.data, isDarkMode },
    })));
  }, [isDarkMode, setNodes, setEdges]);

  return (
    <div className={`flow-swarm-container ${isDarkMode ? 'dark' : 'light'}`}>
      <div className="workflow-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={(changes) => {
            const updated = changes.reduce((acc, change) => {
              if (change.type === 'position' && change.position) {
                return acc.map((n) => n.id === change.id ? { ...n, position: change.position! } : n);
              }
              return acc;
            }, nodes);
            setNodes(updated);
          }}
          onEdgesChange={(changes) => {
            const updated = changes.reduce((acc, change) => {
              if (change.type === 'remove') return acc.filter((e) => e.id !== change.id);
              return acc;
            }, edges);
            setEdges(updated);
          }}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} gap={12} size={1}
            color={isDarkMode ? '#334155' : '#e2e8f0'} />
          <Controls />
          <MiniMap style={{ backgroundColor: isDarkMode ? '#1e293b' : '#f8fafc' }}
            nodeColor={isDarkMode ? '#475569' : '#cbd5e1'} />
        </ReactFlow>

        <WorkflowToolbar
          isDarkMode={isDarkMode}
          onToggleDarkMode={toggleDarkMode}
          onExecute={handleExecute}
          onPause={handlePause}
          onReset={handleReset}
          onSave={handleSave}
          onLoad={() => {
            const templates = getTemplates();
            if (templates.length > 0) loadTemplate(templates[0]);
          }}
          onExport={handleSave}
          onAddNode={() => addNode('analysis')}
          onClearWorkflow={clearWorkflow}
          isExecuting={isExecuting}
          isChatVisible={isChatVisible}
          onToggleChat={() => setIsChatVisible(!isChatVisible)}
          selectedNodeId={selectedNodeForSettings?.id}
          onDeleteNode={() => selectedNodeForSettings && deleteNode(selectedNodeForSettings.id)}
        />

        <UnifiedBlockManager
          isOpen={true}
          onClose={() => {}}
          onAddBlock={(blockConfig) => {
            addNode(blockConfig.subType || 'analysis', { x: 100, y: 100 });
          }}
          isDarkMode={isDarkMode}
        />
      </div>

      {isChatVisible && (
        <ChatPanel
          isDarkMode={isDarkMode}
          messages={messages}
          onAgentClick={handleAgentClick}
          userInput={userInput}
          setUserInput={setUserInput}
          onSendMessage={handleSendMessage}
          chatWidth={chatWidth}
          setChatWidth={setChatWidth}
          executionState={executionState}
          frames={frames}
        />
      )}

      {selectedNodeForSettings && (
        <BlockSettingsPanel
          node={nodes.find((n) => n.id === selectedNodeForSettings.id) || selectedNodeForSettings}
          isDarkMode={isDarkMode}
          onClose={() => setSelectedNodeForSettings(null)}
          onUpdate={updateNode}
          onDelete={deleteNode}
          onDuplicate={duplicateNode}
          availableTools={['tavily_search', 'web_search', 'file_write', 'file_read', 'python_repl', 'calculator']}
        />
      )}
    </div>
  );
};

const FlowSwarmInterfaceWrapper: React.FC = () => (
  <ReactFlowProvider><FlowSwarmInterface /></ReactFlowProvider>
);

export default FlowSwarmInterfaceWrapper;