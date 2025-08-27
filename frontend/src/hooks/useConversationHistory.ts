import { useState, useEffect, useCallback } from 'react';

interface ConversationSession {
  id: string;
  title: string;
  timestamp: Date;
  messages: any[];
  agents: string[];
  status: 'active' | 'completed';
}

const STORAGE_KEY = 'swarm_conversation_history';
const MAX_SESSIONS = 50;

export const useConversationHistory = () => {
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Load sessions from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSessions(parsed.map((s: any) => ({
          ...s,
          timestamp: new Date(s.timestamp)
        })));
      } catch (e) {
        console.error('Failed to load conversation history:', e);
      }
    }
  }, []);

  // Save sessions to localStorage
  const saveSessions = useCallback((sessionsToSave: ConversationSession[]) => {
    try {
      // Keep only the most recent sessions
      const trimmed = sessionsToSave.slice(-MAX_SESSIONS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      setSessions(trimmed);
    } catch (e) {
      console.error('Failed to save conversation history:', e);
    }
  }, []);

  // Create a new session
  const createSession = useCallback((title: string) => {
    const newSession: ConversationSession = {
      id: `session-${Date.now()}`,
      title,
      timestamp: new Date(),
      messages: [],
      agents: [],
      status: 'active'
    };

    const updated = [...sessions, newSession];
    saveSessions(updated);
    setCurrentSessionId(newSession.id);
    return newSession.id;
  }, [sessions, saveSessions]);

  // Update current session
  const updateSession = useCallback((
    sessionId: string,
    updates: Partial<ConversationSession>
  ) => {
    const updated = sessions.map(s => 
      s.id === sessionId 
        ? { ...s, ...updates, timestamp: new Date() }
        : s
    );
    saveSessions(updated);
  }, [sessions, saveSessions]);

  // Add message to current session
  const addMessage = useCallback((sessionId: string, message: any) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    const updated = sessions.map(s => 
      s.id === sessionId 
        ? { 
            ...s, 
            messages: [...s.messages, message],
            timestamp: new Date()
          }
        : s
    );
    saveSessions(updated);
  }, [sessions, saveSessions]);

  // Add agent to session
  const addAgent = useCallback((sessionId: string, agentName: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session || session.agents.includes(agentName)) return;

    const updated = sessions.map(s => 
      s.id === sessionId 
        ? { 
            ...s, 
            agents: [...s.agents, agentName],
            timestamp: new Date()
          }
        : s
    );
    saveSessions(updated);
  }, [sessions, saveSessions]);

  // Get session by ID
  const getSession = useCallback((sessionId: string) => {
    return sessions.find(s => s.id === sessionId);
  }, [sessions]);

  // Delete session
  const deleteSession = useCallback((sessionId: string) => {
    const updated = sessions.filter(s => s.id !== sessionId);
    saveSessions(updated);
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
    }
  }, [sessions, saveSessions, currentSessionId]);

  // Clear all history
  const clearHistory = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSessions([]);
    setCurrentSessionId(null);
  }, []);

  // Get recent sessions
  const getRecentSessions = useCallback((limit: number = 10) => {
    return sessions
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }, [sessions]);

  return {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    createSession,
    updateSession,
    addMessage,
    addAgent,
    getSession,
    deleteSession,
    clearHistory,
    getRecentSessions
  };
};