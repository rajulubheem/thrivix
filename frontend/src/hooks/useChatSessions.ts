import { useState, useEffect, useCallback } from 'react';
import { chatApi, ChatSession, ChatSessionSummary, ChatSessionWithMessages, CreateSessionRequest } from '../services/chatApi';

export interface UseChatSessionsResult {
  sessions: ChatSessionSummary[];
  currentSession: ChatSessionWithMessages | null;
  loading: boolean;
  error: string | null;
  
  // Session management
  createSession: (data: CreateSessionRequest) => Promise<ChatSession>;
  loadSession: (sessionId: string) => Promise<void>;
  updateSession: (sessionId: string, data: any) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  duplicateSession: (sessionId: string) => Promise<ChatSession>;
  archiveSession: (sessionId: string) => Promise<void>;
  restoreSession: (sessionId: string) => Promise<void>;
  
  // Data management
  refreshSessions: () => Promise<void>;
  refreshCurrentSession: () => Promise<void>;
  setCurrentSessionId: (sessionId: string | null) => void;
  
  // State
  currentSessionId: string | null;
  includeArchived: boolean;
  setIncludeArchived: (include: boolean) => void;
}

export const useChatSessions = (): UseChatSessionsResult => {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSessionWithMessages | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);

  // Load all sessions
  const refreshSessions = useCallback(async () => {
    try {
      console.log('🔄 Refreshing sessions...');
      setLoading(true);
      setError(null);
      const sessionList = await chatApi.listSessions(50, 0, includeArchived);
      console.log('📋 Sessions fetched:', sessionList.length, sessionList);
      setSessions(sessionList);
    } catch (err: any) {
      setError(err.message || 'Failed to load sessions');
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  // Load specific session with messages
  const loadSession = useCallback(async (sessionId: string) => {
    try {
      setLoading(true);
      setError(null);
      console.log(`🔄 Loading session ${sessionId}...`);
      const session = await chatApi.getSessionWithMessages(sessionId);
      console.log(`📦 Loaded session:`, {
        id: session.session_id,
        messageCount: session.message_count,
        messagesLength: session.messages?.length || 0,
        hasMessages: !!(session.messages && session.messages.length > 0)
      });
      setCurrentSession(session);
      setCurrentSessionId(sessionId);
    } catch (err: any) {
      setError(err.message || 'Failed to load session');
      console.error('Failed to load session:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh current session
  const refreshCurrentSession = useCallback(async () => {
    if (currentSessionId) {
      await loadSession(currentSessionId);
    }
  }, [currentSessionId, loadSession]);

  // Create new session
  const createSession = useCallback(async (data: CreateSessionRequest): Promise<ChatSession> => {
    try {
      setError(null);
      const newSession = await chatApi.createSession(data);
      await refreshSessions(); // Refresh the list
      return newSession;
    } catch (err: any) {
      setError(err.message || 'Failed to create session');
      throw err;
    }
  }, [refreshSessions]);

  // Update session
  const updateSession = useCallback(async (sessionId: string, data: any) => {
    try {
      setError(null);
      await chatApi.updateSession(sessionId, data);
      await refreshSessions();
      if (currentSessionId === sessionId) {
        await refreshCurrentSession();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update session');
      throw err;
    }
  }, [refreshSessions, currentSessionId, refreshCurrentSession]);

  // Delete session
  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      setError(null);
      await chatApi.deleteSession(sessionId);
      await refreshSessions();
      if (currentSessionId === sessionId) {
        setCurrentSession(null);
        setCurrentSessionId(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete session');
      throw err;
    }
  }, [refreshSessions, currentSessionId]);

  // Duplicate session
  const duplicateSession = useCallback(async (sessionId: string): Promise<ChatSession> => {
    try {
      setError(null);
      const newSession = await chatApi.duplicateSession(sessionId);
      await refreshSessions();
      return newSession;
    } catch (err: any) {
      setError(err.message || 'Failed to duplicate session');
      throw err;
    }
  }, [refreshSessions]);

  // Archive session
  const archiveSession = useCallback(async (sessionId: string) => {
    try {
      setError(null);
      await chatApi.archiveSession(sessionId);
      await refreshSessions();
      if (currentSessionId === sessionId) {
        await refreshCurrentSession();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to archive session');
      throw err;
    }
  }, [refreshSessions, currentSessionId, refreshCurrentSession]);

  // Restore session
  const restoreSession = useCallback(async (sessionId: string) => {
    try {
      setError(null);
      await chatApi.restoreSession(sessionId);
      await refreshSessions();
      if (currentSessionId === sessionId) {
        await refreshCurrentSession();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to restore session');
      throw err;
    }
  }, [refreshSessions, currentSessionId, refreshCurrentSession]);

  // Load sessions on mount and when includeArchived changes
  useEffect(() => {
    refreshSessions();
  }, [includeArchived]); // Remove refreshSessions from dependency to prevent infinite loop

  return {
    sessions,
    currentSession,
    loading,
    error,
    createSession,
    loadSession,
    updateSession,
    deleteSession,
    duplicateSession,
    archiveSession,
    restoreSession,
    refreshSessions,
    refreshCurrentSession,
    setCurrentSessionId,
    currentSessionId,
    includeArchived,
    setIncludeArchived,
  };
};