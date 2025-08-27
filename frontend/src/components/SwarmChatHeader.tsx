import React from 'react';

interface SwarmChatHeaderProps {
  viewMode: 'chat' | 'timeline' | 'orchestrator';
  setViewMode: (mode: 'chat' | 'timeline' | 'orchestrator') => void;
  isConnected: boolean;
  executionStatus: string;
  activeAgents: number;
  streamingCount: number;
  showArtifacts: boolean;
  toggleArtifacts: () => void;
}

const SwarmChatHeader: React.FC<SwarmChatHeaderProps> = ({
  viewMode,
  setViewMode,
  isConnected,
  executionStatus,
  activeAgents,
  streamingCount,
  showArtifacts,
  toggleArtifacts
}) => {
  return (
    <header className="chat-header-v2">
      <div className="header-container">
        <div className="header-left">
          <div className="app-logo">
            <div className="logo-icon">🚀</div>
            <h1 className="app-title">Swarm AI</h1>
          </div>
          
          <div className="status-bar">
            {isConnected && (
              <div className="status-item active">
                <span className="ds-status-dot ds-status-online"></span>
                Connected
              </div>
            )}
            
            {executionStatus === 'executing' && (
              <div className="status-item active">
                <div className="ds-spinner"></div>
                Executing
              </div>
            )}
            
            {executionStatus === 'complete' && (
              <div className="status-item success">
                ✓ Complete
              </div>
            )}
            
            {executionStatus === 'error' && (
              <div className="status-item error">
                ✗ Error
              </div>
            )}
            
            {activeAgents > 0 && (
              <div className="status-item">
                {activeAgents} Active
              </div>
            )}
            
            {streamingCount > 0 && (
              <div className="status-item active">
                <span className="ds-status-dot ds-status-online"></span>
                Streaming ({streamingCount})
              </div>
            )}
          </div>
        </div>

        <div className="header-right">
          <div className="view-tabs">
            <button
              className={`view-tab ${viewMode === 'chat' ? 'active' : ''}`}
              onClick={() => setViewMode('chat')}
            >
              💬 Chat
            </button>
            <button
              className={`view-tab ${viewMode === 'timeline' ? 'active' : ''}`}
              onClick={() => setViewMode('timeline')}
            >
              📊 Timeline
            </button>
            <button
              className={`view-tab ${viewMode === 'orchestrator' ? 'active' : ''}`}
              onClick={() => setViewMode('orchestrator')}
            >
              🎯 Orchestrator
            </button>
          </div>

          <div className="header-actions">
            <button
              className={`icon-button ${showArtifacts ? 'active' : ''}`}
              onClick={toggleArtifacts}
              title="Toggle Artifacts"
            >
              📁
            </button>
            
            <a
              href="/settings/tools"
              className="icon-button"
              title="Tool Configuration"
            >
              ⚙️
            </a>
          </div>
        </div>
      </div>
    </header>
  );
};

export default SwarmChatHeader;