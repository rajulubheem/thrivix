import React from 'react';
import { Node } from 'reactflow';
import ImprovedChatbotOutput from './ImprovedChatbotOutput';
import ImprovedStateDataViewer from './ImprovedStateDataViewer';
import { BlockStatus } from '../../../types/workflow';

// Agent type definition
interface Agent {
  id: string;
  name: string;
  status: BlockStatus;
  output: string;
  startTime?: number;
  endTime?: number;
  error?: string;
  parent?: string;
  depth?: number;
}

interface AgentConversationPanelProps {
  showConversationPanel: boolean;
  outputPanelWidth: number;
  agents: Map<string, Agent>;
  nodes: Node[];
  edges: any[];
  selectedAgent: string | null;
  isDarkMode: boolean;
  showRawDataViewer: boolean;
  executionId: string | null;
  onAgentSelect: (agentId: string | null) => void;
  onNodeFocus: (nodeId: string) => void;
  onCloseRawDataViewer: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
}

export const AgentConversationPanel: React.FC<AgentConversationPanelProps> = ({
  showConversationPanel,
  outputPanelWidth,
  agents,
  nodes,
  edges,
  selectedAgent,
  isDarkMode,
  showRawDataViewer,
  executionId,
  onAgentSelect,
  onNodeFocus,
  onCloseRawDataViewer,
  onResizeStart,
}) => {
  return (
    <>
      {/* Resizable Divider - only show when panel is visible */}
      {showConversationPanel && (
        <div
          className="resize-divider"
          title="Drag to resize • Double-click to reset"
          onDoubleClick={() => {
            // Reset to default width would be handled by parent
            const event = new CustomEvent('resetPanelWidth');
            window.dispatchEvent(event);
          }}
          onMouseDown={onResizeStart}
          style={{
            position: 'absolute',
            right: `${outputPanelWidth}px`,
            top: 0,
            bottom: '70px', // Stop before the input area
            width: '6px',
            cursor: 'col-resize',
            zIndex: 50,
            background: isDarkMode
              ? 'linear-gradient(90deg, transparent, rgba(51, 65, 85, 0.5), transparent)'
              : 'linear-gradient(90deg, transparent, rgba(203, 213, 225, 0.5), transparent)',
            transition: 'background 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = isDarkMode
              ? 'linear-gradient(90deg, transparent, #3b82f6, transparent)'
              : 'linear-gradient(90deg, transparent, #3b82f6, transparent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isDarkMode
              ? 'linear-gradient(90deg, transparent, rgba(51, 65, 85, 0.5), transparent)'
              : 'linear-gradient(90deg, transparent, rgba(203, 213, 225, 0.5), transparent)';
          }}
        >
          {/* Drag Handle Indicator */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '2px',
              height: '40px',
              background: isDarkMode ? '#475569' : '#cbd5e1',
              borderRadius: '2px',
            }}
          />
        </div>
      )}

      {/* Chatbot Output Panel with Toggle */}
      <div
        className="flow-output-panel"
        style={{
          width: showConversationPanel ? `${outputPanelWidth}px` : '0px',
          overflow: showConversationPanel ? 'visible' : 'hidden',
          transition: 'width 0.3s ease-in-out'
        }}
      >
        {showConversationPanel && (
          <>
            <ImprovedChatbotOutput
              agents={agents}
              nodes={nodes}
              selectedAgent={selectedAgent}
              onAgentSelect={onAgentSelect}
              onNodeFocus={onNodeFocus}
              isDarkMode={isDarkMode}
            />

            {/* Improved Raw Data Viewer */}
            {showRawDataViewer && executionId && (
              <ImprovedStateDataViewer
                execId={executionId}
                isDarkMode={isDarkMode}
                onClose={onCloseRawDataViewer}
                nodes={nodes}
                edges={edges}
              />
            )}
          </>
        )}
      </div>
    </>
  );
};