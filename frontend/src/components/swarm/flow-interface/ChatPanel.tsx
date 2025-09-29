import React from 'react';
import ImprovedChatbotOutput from '../components/ImprovedChatbotOutput';
import ImprovedStateDataViewer from '../components/ImprovedStateDataViewer';
import { ChatMessage, ExecutionState, Frame } from './types';

interface ChatPanelProps {
  isDarkMode: boolean;
  messages: ChatMessage[];
  onAgentClick: (agentId: string) => void;
  userInput: string;
  setUserInput: (input: string) => void;
  onSendMessage: () => void;
  chatWidth: number;
  setChatWidth: (width: number) => void;
  executionState: ExecutionState;
  frames: Frame[];
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  isDarkMode,
  messages,
  onAgentClick,
  userInput,
  setUserInput,
  onSendMessage,
  chatWidth,
  setChatWidth,
  executionState,
  frames,
}) => {
  return (
    <div
      className="chat-panel"
      style={{
        width: `${chatWidth}px`,
        backgroundColor: isDarkMode ? '#0f172a' : '#ffffff',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: `1px solid ${isDarkMode ? '#1e293b' : '#e5e7eb'}`,
      }}
    >
      <ImprovedChatbotOutput
        agents={new Map()}
        nodes={[]}
        selectedAgent={null}
        onAgentSelect={() => {}}
        onNodeFocus={onAgentClick}
        isDarkMode={isDarkMode}
      />

      <ImprovedStateDataViewer
        execId={executionState.currentState || 'default'}
        isDarkMode={isDarkMode}
        nodes={[]}
        edges={[]}
      />
    </div>
  );
};

export default ChatPanel;