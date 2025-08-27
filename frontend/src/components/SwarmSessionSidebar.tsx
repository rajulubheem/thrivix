import React, { useState } from 'react';
import { useChatSessions } from '../hooks/useChatSessions';
import { formatDistanceToNow } from 'date-fns';
import './SwarmSessionSidebar.css';

interface SwarmSessionSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionSelect: (sessionId: string) => void;
  currentSessionId: string | null;
}

const SwarmSessionSidebar: React.FC<SwarmSessionSidebarProps> = ({
  isOpen,
  onClose,
  onSessionSelect,
  currentSessionId,
}) => {
  const {
    sessions,
    loading,
    createSession,
    deleteSession,
    archiveSession,
  } = useChatSessions();

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const filteredSessions = sessions.filter(session =>
    session.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleNewChat = async () => {
    setIsCreating(true);
    try {
      const newSession = await createSession({
        title: 'New Chat',
        description: 'A new conversation with Swarm AI',
      });
      onSessionSelect(newSession.session_id);
      onClose();
    } catch (error) {
      console.error('Failed to create session:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this chat?')) {
      try {
        await deleteSession(sessionId);
      } catch (error) {
        console.error('Failed to delete session:', error);
      }
    }
  };

  const handleSessionClick = (sessionId: string) => {
    onSessionSelect(sessionId);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`session-sidebar-backdrop ${isOpen ? 'open' : ''}`}
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <div className={`session-sidebar-overlay ${isOpen ? 'open' : ''}`}>
        <div className="session-sidebar">
          {/* Header */}
          <div className="session-sidebar-header">
            <div className="session-sidebar-title">
              <span className="sidebar-icon">🚀</span>
              <h2>Swarm AI</h2>
            </div>
            <button 
              className="new-chat-btn"
              onClick={handleNewChat}
              disabled={isCreating}
            >
              {isCreating ? '⏳' : '✏️'} New Chat
            </button>
          </div>

          {/* Search */}
          <div className="session-search">
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>
          </div>

          {/* Sessions List */}
          <div className="sessions-list">
            {loading ? (
              <div className="sessions-loading">
                <div className="loading-spinner"></div>
                <span>Loading chats...</span>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="sessions-empty">
                {searchQuery ? (
                  <>
                    <span className="empty-icon">🔍</span>
                    <p>No chats found matching "{searchQuery}"</p>
                  </>
                ) : (
                  <>
                    <span className="empty-icon">💬</span>
                    <p>No chat history yet</p>
                    <small>Start a new conversation!</small>
                  </>
                )}
              </div>
            ) : (
              filteredSessions.map((session) => (
                <div
                  key={session.session_id}
                  className={`session-item ${currentSessionId === session.session_id ? 'active' : ''}`}
                  onClick={() => handleSessionClick(session.session_id)}
                >
                  <div className="session-content">
                    <div className="session-title">
                      {session.title || 'Untitled Chat'}
                    </div>
                    <div className="session-preview">
                      {session.title ? `Chat about ${session.title.toLowerCase()}` : 'No messages yet'}
                    </div>
                    <div className="session-meta">
                      <span className="session-time">
                        {formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}
                      </span>
                      <span className="session-count">
                        {session.message_count} messages
                      </span>
                    </div>
                  </div>
                  <div className="session-actions">
                    <button
                      className="session-action-btn delete"
                      onClick={(e) => handleDeleteSession(session.session_id, e)}
                      title="Delete chat"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="session-sidebar-footer">
            <div className="footer-info">
              <small>
                {sessions.length} chat{sessions.length !== 1 ? 's' : ''} total
              </small>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SwarmSessionSidebar;