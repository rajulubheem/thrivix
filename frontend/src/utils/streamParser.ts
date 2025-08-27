import { TimelineEvent } from '../components/ActivityTimeline';

export interface ParsedToolCall {
  tool: string;
  purpose?: string;
  target?: string;
  status: 'pending' | 'success' | 'error';
  result?: any;
  error?: string;
  fileInfo?: {
    path: string;
    size?: number;
    lines?: number;
    exists: boolean;
  };
}

export interface ParsedHandoff {
  from: string;
  to: string;
  reason?: string;
  timestamp: Date;
}

export interface AgentActivity {
  agent: string;
  action: string;
  details?: string;
  timestamp: Date;
}

export class StreamEventParser {
  private toolCallPattern = /🔧\s*\*\*Tool Called:\*\*\s*`([^`]+)`/g;
  private purposePattern = /\*\*Purpose:\*\*\s*([^\n]+)/;
  private targetPattern = /\*\*Target (?:File|Directory):\*\*\s*`([^`]+)`/;
  private fileFoundPattern = /✅\s*\*\*File Found:\*\*\s*`([^`]+)`/;
  private fileNotFoundPattern = /❌\s*\*\*File Not Found:\*\*\s*`([^`]+)`/;
  private fileWrittenPattern = /✅\s*\*\*File Written Successfully:\*\*\s*`([^`]+)`/;
  private sizePattern = /\*\*Size:\*\*\s*(\d+)\s*bytes/;
  private linesPattern = /\*\*Lines:\*\*\s*(\d+)/;
  private handoffPattern = /🤝\s*Handoff:\s*(\w+)\s*→\s*(\w+)/;
  private writingPattern = /✍️\s*\*\*Writing file:\*\*\s*`([^`]+)`/;
  private readingPattern = /⏳\s*Reading\.\.\./;

  parseStreamContent(content: string, agent: string): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    
    // Limit content size to prevent performance issues
    if (content.length > 100000) {
      content = content.slice(-50000); // Keep last 50k chars
    }
    
    try {
      // Parse tool calls
      const toolCalls = this.parseToolCalls(content);
      toolCalls.slice(0, 20).forEach(tool => { // Limit to 20 tools
        events.push(this.createToolEvent(tool, agent));
      });

      // Parse handoffs
      const handoffs = this.parseHandoffs(content);
      handoffs.slice(0, 10).forEach(handoff => { // Limit to 10 handoffs
        events.push(this.createHandoffEvent(handoff));
      });

      // Parse file operations
      const fileOps = this.parseFileOperations(content, agent);
      events.push(...fileOps.slice(0, 20)); // Limit to 20 file ops
    } catch (error) {
      console.error('Error parsing stream content:', error);
    }

    return events.slice(0, 50); // Return max 50 events per parse
  }

  private parseToolCalls(content: string): ParsedToolCall[] {
    const tools: ParsedToolCall[] = [];
    const sections = content.split(/(?=🔧\s*\*\*Tool Called:\*\*)/).slice(0, 30); // Limit sections
    
    sections.forEach(section => {
      if (!section.includes('Tool Called:') || section.length > 5000) return; // Skip large sections
      
      const toolMatch = section.match(/🔧\s*\*\*Tool Called:\*\*\s*`([^`]+)`/);
      if (!toolMatch) return;
      
      const tool: ParsedToolCall = {
        tool: toolMatch[1],
        status: 'pending'
      };
      
      // Extract purpose
      const purposeMatch = section.match(this.purposePattern);
      if (purposeMatch) {
        tool.purpose = purposeMatch[1].trim();
      }
      
      // Extract target
      const targetMatch = section.match(this.targetPattern);
      if (targetMatch) {
        tool.target = targetMatch[1];
      }
      
      // Check status
      if (section.includes('✅')) {
        tool.status = 'success';
        
        // Extract file info for successful operations
        const fileMatch = section.match(this.fileFoundPattern) || section.match(this.fileWrittenPattern);
        if (fileMatch) {
          tool.fileInfo = {
            path: fileMatch[1],
            exists: true
          };
          
          const sizeMatch = section.match(this.sizePattern);
          if (sizeMatch) {
            tool.fileInfo.size = parseInt(sizeMatch[1]);
          }
          
          const linesMatch = section.match(this.linesPattern);
          if (linesMatch) {
            tool.fileInfo.lines = parseInt(linesMatch[1]);
          }
        }
      } else if (section.includes('❌')) {
        tool.status = 'error';
        
        const errorMatch = section.match(this.fileNotFoundPattern);
        if (errorMatch) {
          tool.error = `File not found: ${errorMatch[1]}`;
          tool.fileInfo = {
            path: errorMatch[1],
            exists: false
          };
        }
      }
      
      tools.push(tool);
    });
    
    return tools;
  }

  private parseHandoffs(content: string): ParsedHandoff[] {
    const handoffs: ParsedHandoff[] = [];
    let match;
    
    while ((match = this.handoffPattern.exec(content)) !== null) {
      handoffs.push({
        from: match[1],
        to: match[2],
        timestamp: new Date()
      });
    }
    
    return handoffs;
  }

  private parseFileOperations(content: string, agent: string): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    
    // Parse file writes (with limit)
    const writeRegex = /✍️\s*\*\*Writing file:\*\*\s*`([^`]+)`/g;
    let writeMatch;
    let writeCount = 0;
    while ((writeMatch = writeRegex.exec(content)) !== null && writeCount < 20) {
      writeCount++;
      events.push({
        id: `evt-write-${Date.now()}-${Math.random()}`,
        type: 'action',
        agent,
        title: `Writing ${writeMatch[1]}`,
        description: 'Creating or updating file',
        timestamp: new Date(),
        status: 'running'
      });
    }
    
    // Parse successful writes (with limit)
    const successRegex = /✅\s*\*\*File Written Successfully:\*\*\s*`([^`]+)`/g;
    let successMatch;
    let successCount = 0;
    while ((successMatch = successRegex.exec(content)) !== null && successCount < 20) {
      successCount++;
      const fileName = successMatch[1];
      const sizeMatch = content.match(new RegExp(`${fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^]*?\\*\\*Size:\\*\\*\\s*(\\d+)\\s*bytes`));
      const linesMatch = content.match(new RegExp(`${fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^]*?\\*\\*Lines:\\*\\*\\s*(\\d+)`));
      
      events.push({
        id: `evt-write-success-${Date.now()}-${Math.random()}`,
        type: 'complete',
        agent,
        title: `File written: ${fileName}`,
        description: `Size: ${sizeMatch ? sizeMatch[1] : 'unknown'} bytes, Lines: ${linesMatch ? linesMatch[1] : 'unknown'}`,
        timestamp: new Date(),
        status: 'success'
      });
    }
    
    return events;
  }

  private createToolEvent(tool: ParsedToolCall, agent: string): TimelineEvent {
    const statusMap = {
      pending: 'running' as const,
      success: 'success' as const,
      error: 'error' as const
    };

    const details: any = {
      tool: tool.tool,
      purpose: tool.purpose
    };

    if (tool.target) details.target = tool.target;
    if (tool.fileInfo) details.fileInfo = tool.fileInfo;
    if (tool.error) details.error = tool.error;

    return {
      id: `evt-tool-${Date.now()}-${Math.random()}`,
      type: 'tool',
      agent,
      title: `${tool.tool} ${tool.status === 'success' ? 'completed' : tool.status === 'error' ? 'failed' : 'executing'}`,
      description: tool.purpose || tool.error || `Target: ${tool.target || 'unknown'}`,
      timestamp: new Date(),
      status: statusMap[tool.status],
      details
    };
  }

  private createHandoffEvent(handoff: ParsedHandoff): TimelineEvent {
    return {
      id: `evt-handoff-${Date.now()}-${Math.random()}`,
      type: 'handoff',
      title: `Handoff: ${handoff.from} → ${handoff.to}`,
      description: handoff.reason || 'Task delegation',
      timestamp: handoff.timestamp,
      status: 'success'
    };
  }

  extractAgentActivities(chunks: any[]): Map<string, AgentActivity[]> {
    const activities = new Map<string, AgentActivity[]>();
    
    chunks.forEach(chunk => {
      if (chunk.type === 'delta' && chunk.agent && chunk.content) {
        const agent = chunk.agent;
        if (!activities.has(agent)) {
          activities.set(agent, []);
        }
        
        // Check for specific activities in content
        const content = chunk.accumulated || chunk.content;
        
        if (content.includes('🔧 **Tool Called:**')) {
          activities.get(agent)!.push({
            agent,
            action: 'tool_execution',
            details: 'Executing tool',
            timestamp: new Date(chunk.timestamp)
          });
        }
        
        if (content.includes('✍️ **Writing file:**')) {
          activities.get(agent)!.push({
            agent,
            action: 'file_write',
            details: 'Writing file',
            timestamp: new Date(chunk.timestamp)
          });
        }
        
        if (content.includes('⏳ Reading...')) {
          activities.get(agent)!.push({
            agent,
            action: 'file_read',
            details: 'Reading file',
            timestamp: new Date(chunk.timestamp)
          });
        }
      }
    });
    
    return activities;
  }

  detectAgentHandoffs(chunks: any[]): ParsedHandoff[] {
    const handoffs: ParsedHandoff[] = [];
    let lastAgent: string | null = null;
    
    chunks.forEach(chunk => {
      if (chunk.type === 'delta' && chunk.agent) {
        if (lastAgent && lastAgent !== chunk.agent) {
          handoffs.push({
            from: lastAgent,
            to: chunk.agent,
            timestamp: new Date(chunk.timestamp)
          });
        }
        lastAgent = chunk.agent;
      }
    });
    
    return handoffs;
  }
}