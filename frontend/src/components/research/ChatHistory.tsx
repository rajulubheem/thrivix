import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Trash2, 
  Search,
  Calendar,
  MoreVertical,
  ChevronDown,
  ChevronUp,
  Clock,
  Plus
} from 'lucide-react';
import './ChatHistory.css';

interface Session {
  session_id: string;
  title?: string;
  preview?: string;
  timestamp: string;
  conversation_count: number;
  active: boolean;
}

interface ChatHistoryProps {
  sessions: Session[];
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onNewChat: () => void;
}

const ChatHistory: React.FC<ChatHistoryProps> = ({
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onNewChat
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [groupedSessions, setGroupedSessions] = useState<{
    today: Session[];
    yesterday: Session[];
    thisWeek: Session[];
    thisMonth: Session[];
    older: Session[];
  }>({
    today: [],
    yesterday: [],
    thisWeek: [],
    thisMonth: [],
    older: []
  });
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);

  useEffect(() => {
    groupSessionsByDate();
  }, [sessions]);

  const groupSessionsByDate = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const groups = {
      today: [] as Session[],
      yesterday: [] as Session[],
      thisWeek: [] as Session[],
      thisMonth: [] as Session[],
      older: [] as Session[]
    };

    sessions.forEach(session => {
      const sessionDate = new Date(session.timestamp);
      
      if (sessionDate >= today) {
        groups.today.push(session);
      } else if (sessionDate >= yesterday) {
        groups.yesterday.push(session);
      } else if (sessionDate >= weekAgo) {
        groups.thisWeek.push(session);
      } else if (sessionDate >= monthAgo) {
        groups.thisMonth.push(session);
      } else {
        groups.older.push(session);
      }
    });

    setGroupedSessions(groups);
  };

  const toggleGroup = (group: string) => {
    const newCollapsed = new Set(collapsedGroups);
    if (newCollapsed.has(group)) {
      newCollapsed.delete(group);
    } else {
      newCollapsed.add(group);
    }
    setCollapsedGroups(newCollapsed);
  };

  const getSessionTitle = (session: Session) => {
    if (session.title) return session.title;
    if (session.preview) {
      return session.preview.length > 30 
        ? session.preview.substring(0, 30) + '...'
        : session.preview;
    }
    return `Chat ${session.session_id.substring(0, 8)}`;
  };

  const formatRelativeTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const filteredSessions = (sessionList: Session[]) => {
    if (!searchQuery) return sessionList;
    return sessionList.filter(session => 
      getSessionTitle(session).toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.session_id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const renderSessionGroup = (title: string, sessions: Session[], groupKey: string) => {
    const filtered = filteredSessions(sessions);
    if (filtered.length === 0) return null;

    const isCollapsed = collapsedGroups.has(groupKey);

    return (
      <div key={groupKey} className="session-group">
        <div 
          className="session-group-header"
          onClick={() => toggleGroup(groupKey)}
        >
          <span className="group-title">{title}</span>
          <div className="group-controls">
            <span className="group-count">{filtered.length}</span>
            {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </div>
        </div>
        
        {!isCollapsed && (
          <div className="session-group-items">
            {filtered.map(session => (
              <div
                key={session.session_id}
                className={`session-item ${currentSessionId === session.session_id ? 'active' : ''}`}
                onMouseEnter={() => setHoveredSession(session.session_id)}
                onMouseLeave={() => setHoveredSession(null)}
                onClick={() => onSelectSession(session.session_id)}
              >
                <MessageSquare size={16} className="session-icon" />
                <div className="session-content">
                  <div className="session-title">{getSessionTitle(session)}</div>
                  <div className="session-meta">
                    <Clock size={12} />
                    <span>{formatRelativeTime(session.timestamp)}</span>
                    {session.conversation_count > 0 && (
                      <>
                        <span className="separator">•</span>
                        <span>{session.conversation_count} messages</span>
                      </>
                    )}
                  </div>
                </div>
                {hoveredSession === session.session_id && (
                  <div className="session-actions">
                    <button
                      className="session-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.session_id);
                      }}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="chat-history">
      <div className="chat-history-header">
        <button className="new-chat-btn" onClick={onNewChat}>
          <Plus size={18} />
          <span>New Chat</span>
        </button>
      </div>

      <div className="chat-history-search">
        <Search size={16} />
        <input
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="chat-history-sessions">
        {renderSessionGroup('Today', groupedSessions.today, 'today')}
        {renderSessionGroup('Yesterday', groupedSessions.yesterday, 'yesterday')}
        {renderSessionGroup('This Week', groupedSessions.thisWeek, 'thisWeek')}
        {renderSessionGroup('This Month', groupedSessions.thisMonth, 'thisMonth')}
        {renderSessionGroup('Older', groupedSessions.older, 'older')}
        
        {sessions.length === 0 && (
          <div className="no-sessions">
            <MessageSquare size={32} />
            <p>No conversations yet</p>
            <span>Start a new chat to begin</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatHistory;