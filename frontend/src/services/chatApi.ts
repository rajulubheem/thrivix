import axios from 'axios';

export interface ChatSession {
  id: number;
  session_id: string;
  user_id: string;
  title?: string;
  description?: string;
  agents_config?: any;
  max_handoffs: number;
  max_iterations: number;
  is_active: boolean;
  is_archived: boolean;
  last_message_at?: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: number;
  message_id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  message_type: 'text' | 'tool_use' | 'tool_result' | 'agent_handoff';
  content: string;
  message_metadata?: any;
  agent_name?: string;
  agent_role?: string;
  execution_id?: string;
  parent_message_id?: string;
  is_deleted: boolean;
  is_edited: boolean;
  edit_count: number;
  tokens_used: number;
  processing_time?: number;
  created_at: string;
  updated_at: string;
}

export interface ChatSessionSummary {
  id: number;
  session_id: string;
  title?: string;
  last_message_at?: string;
  message_count: number;
  is_active: boolean;
  is_archived: boolean;
  created_at: string;
}

export interface ChatSessionWithMessages extends ChatSession {
  messages: ChatMessage[];
}

export interface CreateSessionRequest {
  session_id?: string;
  title?: string;
  description?: string;
  agents_config?: any;
  max_handoffs?: number;
  max_iterations?: number;
}

export interface UpdateSessionRequest {
  title?: string;
  description?: string;
  agents_config?: any;
  max_handoffs?: number;
  max_iterations?: number;
  is_active?: boolean;
  is_archived?: boolean;
}

export interface CreateMessageRequest {
  content: string;
  role: 'user' | 'assistant' | 'system';
  message_type?: 'text' | 'tool_use' | 'tool_result' | 'agent_handoff';
  message_metadata?: any;
  agent_name?: string;
  agent_role?: string;
  execution_id?: string;
  parent_message_id?: string;
}

export interface ExecuteChatRequest {
  session_id: string;
  message: string;
  agents_config?: any;
  execution_mode?: string;
  max_handoffs?: number;
  max_iterations?: number;
}

export interface MessageSearchRequest {
  query: string;
  session_id?: string;
  role?: 'user' | 'assistant' | 'system';
  message_type?: 'text' | 'tool_use' | 'tool_result' | 'agent_handoff';
  agent_name?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

export interface SessionSearchRequest {
  query?: string;
  is_active?: boolean;
  is_archived?: boolean;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResponse<T> {
  total: number;
  limit: number;
  offset: number;
  data: T[];
}

class ChatApiService {
  private baseUrl = '/api/v1/chat';

  // Session Management
  async createSession(data: CreateSessionRequest): Promise<ChatSession> {
    const response = await axios.post(`${this.baseUrl}/sessions`, data);
    return response.data;
  }

  async listSessions(
    limit: number = 50,
    offset: number = 0,
    includeArchived: boolean = false
  ): Promise<ChatSessionSummary[]> {
    const response = await axios.get(`${this.baseUrl}/sessions`, {
      params: { limit, offset, include_archived: includeArchived }
    });
    return response.data;
  }

  async getSession(sessionId: string): Promise<ChatSession> {
    const response = await axios.get(`${this.baseUrl}/sessions/${sessionId}`);
    return response.data;
  }

  async getSessionWithMessages(
    sessionId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<ChatSessionWithMessages> {
    const response = await axios.get(`${this.baseUrl}/sessions/${sessionId}/messages`, {
      params: { limit, offset }
    });
    console.log(`🌐 API Response for session ${sessionId}:`, {
      status: response.status,
      hasData: !!response.data,
      messageCount: response.data?.message_count,
      messagesLength: response.data?.messages?.length || 0,
      firstMessage: response.data?.messages?.[0]?.content?.substring(0, 50)
    });
    console.log('📦 Full response data:', response.data);
    
    // If messages is empty but message_count > 0, there's a problem
    if (response.data?.message_count > 0 && (!response.data?.messages || response.data.messages.length === 0)) {
      console.error('❌ Message count mismatch! Count:', response.data.message_count, 'but messages array is empty');
    }
    
    return response.data;
  }

  async updateSession(sessionId: string, data: UpdateSessionRequest): Promise<ChatSession> {
    const response = await axios.put(`${this.baseUrl}/sessions/${sessionId}`, data);
    return response.data;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await axios.delete(`${this.baseUrl}/sessions/${sessionId}`);
  }

  async duplicateSession(sessionId: string): Promise<ChatSession> {
    const response = await axios.post(`${this.baseUrl}/sessions/${sessionId}/duplicate`);
    return response.data;
  }

  async archiveSession(sessionId: string): Promise<void> {
    await axios.post(`${this.baseUrl}/sessions/${sessionId}/archive`);
  }

  async restoreSession(sessionId: string): Promise<void> {
    await axios.post(`${this.baseUrl}/sessions/${sessionId}/restore`);
  }

  // Message Management
  async addMessage(sessionId: string, data: CreateMessageRequest): Promise<ChatMessage> {
    const response = await axios.post(`${this.baseUrl}/sessions/${sessionId}/messages`, data);
    return response.data;
  }

  async updateMessage(messageId: string, data: Partial<CreateMessageRequest>): Promise<ChatMessage> {
    const response = await axios.put(`${this.baseUrl}/messages/${messageId}`, data);
    return response.data;
  }

  async deleteMessage(messageId: string): Promise<void> {
    await axios.delete(`${this.baseUrl}/messages/${messageId}`);
  }

  // Execute Chat
  async executeChat(data: ExecuteChatRequest): Promise<any> {
    const response = await axios.post(`${this.baseUrl}/sessions/${data.session_id}/execute`, data);
    return response.data;
  }

  // Search
  async searchMessages(data: MessageSearchRequest): Promise<SearchResponse<ChatMessage>> {
    const response = await axios.post(`${this.baseUrl}/messages/search`, data);
    return {
      data: response.data.messages,
      total: response.data.total,
      limit: response.data.limit,
      offset: response.data.offset
    };
  }

  async searchSessions(data: SessionSearchRequest): Promise<SearchResponse<ChatSessionSummary>> {
    const response = await axios.post(`${this.baseUrl}/sessions/search`, data);
    return {
      data: response.data.sessions,
      total: response.data.total,
      limit: response.data.limit,
      offset: response.data.offset
    };
  }

  // Statistics
  async getChatStats(): Promise<any> {
    const response = await axios.get(`${this.baseUrl}/stats`);
    return response.data;
  }

  // Get all sessions - wrapper for listSessions with messages
  async getSessions(): Promise<ChatSessionWithMessages[]> {
    const sessions = await this.listSessions(50, 0, false);
    const sessionsWithMessages: ChatSessionWithMessages[] = [];
    
    for (const session of sessions) {
      try {
        const fullSession = await this.getSessionWithMessages(session.session_id);
        sessionsWithMessages.push(fullSession);
      } catch (error) {
        console.error(`Failed to load session ${session.session_id}:`, error);
      }
    }
    
    return sessionsWithMessages;
  }
}

export const chatApi = new ChatApiService();