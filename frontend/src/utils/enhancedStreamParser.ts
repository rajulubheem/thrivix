import { TimelineEvent } from '../components/ActivityTimeline';

export interface ToolCallDetails {
  tool: string;
  purpose?: string;
  parameters?: any;
  result?: any;
  output?: string;
  error?: string;
  duration?: number;
  timestamp: Date;
}

export class EnhancedStreamParser {
  // Pattern to detect tool execution from backend
  private toolExecutionPattern = /Tool:\s*([^\n]+)\nParameters:\s*({[^}]+})/g;
  private toolResultPattern = /Result:\s*({[^}]+}|\[[^\]]+\]|"[^"]+"|[^\n]+)/g;
  
  parsePollingResponse(response: any): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    
    if (!response || !response.chunks) return events;
    
    response.chunks.forEach((chunk: any) => {
      // Parse different event types from backend
      if (chunk.type === 'tool_call' || chunk.type === 'tool_execution' || chunk.type === 'tool_use') {
        events.push(this.createToolExecutionEvent(chunk));
      } else if (chunk.type === 'tool_result') {
        // Handle tool result events from backend
        events.push(this.createToolResultEvent(chunk));
      } else if (chunk.type === 'agent_start') {
        events.push(this.createAgentStartEvent(chunk));
      } else if (chunk.type === 'handoff') {
        events.push(this.createHandoffEvent(chunk));
      } else if (chunk.type === 'delta' && chunk.content) {
        // Parse tool calls from content
        const toolEvents = this.parseToolsFromContent(chunk.content, chunk.agent);
        events.push(...toolEvents);
      }
    });
    
    return events;
  }
  
  private createToolResultEvent(chunk: any): TimelineEvent {
    const agent = chunk.agent || 'unknown_agent';
    const data = chunk.data || {};
    const tool = data.tool || 'unknown_tool';
    const result = data.result;
    const success = data.success !== false;
    
    // Format result for display
    let resultDisplay = '';
    if (result) {
      try {
        if (typeof result === 'object') {
          resultDisplay = JSON.stringify(result, null, 2);
        } else {
          resultDisplay = String(result).substring(0, 1000);
        }
      } catch (e) {
        resultDisplay = 'Complex result';
      }
    }
    
    return {
      id: `evt-tool-result-${Date.now()}-${Math.random()}`,
      type: 'tool',
      agent,
      title: `${tool} ${success ? 'completed' : 'failed'}`,
      description: success ? 'Tool execution successful' : 'Tool execution failed',
      timestamp: new Date(chunk.timestamp || Date.now()),
      status: success ? 'success' : 'error',
      details: {
        tool,
        result,
        output: resultDisplay,
        success
      },
      expanded: false,
      children: result ? [{
        id: `evt-result-detail-${Date.now()}-${Math.random()}`,
        type: 'action',
        title: 'Result',
        description: resultDisplay.substring(0, 100) + (resultDisplay.length > 100 ? '...' : ''),
        timestamp: new Date(chunk.timestamp || Date.now()),
        status: 'success',
        details: { code: resultDisplay, language: 'json' }
      }] : undefined
    };
  }
  
  private createToolExecutionEvent(chunk: any): TimelineEvent {
    const toolName = chunk.tool || chunk.data?.tool || 'unknown_tool';
    const parameters = chunk.parameters || chunk.data?.parameters || {};
    const result = chunk.result || chunk.data?.result;
    const agent = chunk.agent || 'unknown_agent';
    
    // Format parameters for display
    let paramDisplay = '';
    try {
      if (typeof parameters === 'object') {
        paramDisplay = JSON.stringify(parameters, null, 2);
      } else {
        paramDisplay = String(parameters);
      }
    } catch (e) {
      paramDisplay = 'Complex parameters';
    }
    
    // Format result for display
    let resultDisplay = '';
    if (result) {
      try {
        if (typeof result === 'object') {
          resultDisplay = JSON.stringify(result, null, 2);
        } else {
          resultDisplay = String(result).substring(0, 500);
        }
      } catch (e) {
        resultDisplay = 'Complex result';
      }
    }
    
    const details: any = {
      tool: toolName,
      parameters,
      code: paramDisplay // For syntax highlighting
    };
    
    if (result) {
      details.result = result;
      details.output = resultDisplay;
    }
    
    return {
      id: `evt-tool-${Date.now()}-${Math.random()}`,
      type: 'tool',
      agent,
      title: `${toolName} ${result ? 'completed' : 'executing'}`,
      description: chunk.purpose || `Tool execution with parameters`,
      timestamp: new Date(chunk.timestamp || Date.now()),
      status: result ? 'success' : 'running',
      details,
      expanded: false, // Can be expanded to see full details
      children: result ? [{
        id: `evt-tool-result-${Date.now()}-${Math.random()}`,
        type: 'action',
        title: 'Output',
        description: resultDisplay.substring(0, 100) + (resultDisplay.length > 100 ? '...' : ''),
        timestamp: new Date(chunk.timestamp || Date.now()),
        status: 'success',
        details: { code: resultDisplay, language: 'json' }
      }] : undefined
    };
  }
  
  private createAgentStartEvent(chunk: any): TimelineEvent {
    return {
      id: `evt-agent-${Date.now()}-${Math.random()}`,
      type: 'thought',
      agent: chunk.agent || 'unknown_agent',
      title: `${chunk.agent || 'Agent'} started`,
      description: chunk.task || 'Processing request',
      timestamp: new Date(chunk.timestamp || Date.now()),
      status: 'running'
    };
  }
  
  private createHandoffEvent(chunk: any): TimelineEvent {
    return {
      id: `evt-handoff-${Date.now()}-${Math.random()}`,
      type: 'handoff',
      title: `Handoff: ${chunk.from || '?'} → ${chunk.to || '?'}`,
      description: chunk.reason || 'Task delegation',
      timestamp: new Date(chunk.timestamp || Date.now()),
      status: 'success'
    };
  }
  
  private parseToolsFromContent(content: string, agent: string): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    
    // Look for tool execution patterns in content
    const toolPatterns = [
      /(?:executing|calling|using)\s+(?:tool\s+)?([a-z_]+)(?:\s+with\s+)?(?:parameters)?:?\s*({[^}]+})?/gi,
      /Tool:\s*([a-z_]+).*?Parameters:\s*({[^}]+})/gi,
      /🔧\s*Tool:\s*`([^`]+)`.*?Parameters:\s*```json\s*({[^`]+})```/gis
    ];
    
    for (const pattern of toolPatterns) {
      let match;
      let count = 0;
      
      while ((match = pattern.exec(content)) !== null && count < 5) {
        count++;
        const toolName = match[1];
        let parameters: any = {};
        
        if (match[2]) {
          try {
            parameters = JSON.parse(match[2]);
          } catch (e) {
            // If not valid JSON, store as string
            parameters = { raw: match[2] };
          }
        }
        
        // Check if we already have this tool call
        const duplicate = events.find(e => 
          e.details?.tool === toolName && 
          JSON.stringify(e.details?.parameters) === JSON.stringify(parameters)
        );
        
        if (!duplicate) {
          events.push({
            id: `evt-tool-content-${Date.now()}-${Math.random()}`,
            type: 'tool',
            agent,
            title: `${toolName} executing`,
            description: parameters?.query || parameters?.filename || 'Tool execution detected',
            timestamp: new Date(),
            status: 'running',
            details: {
              tool: toolName,
              parameters,
              source: 'content_parse',
              code: Object.keys(parameters).length > 0 ? JSON.stringify(parameters, null, 2) : undefined
            },
            expanded: false
          });
        }
      }
    }
    
    // Look for tool results in content
    const resultPattern = /Result:\s*```(?:json)?\s*({[^`]+})```/gis;
    let resultMatch;
    while ((resultMatch = resultPattern.exec(content)) !== null) {
      try {
        const result = JSON.parse(resultMatch[1]);
        events.push({
          id: `evt-result-${Date.now()}-${Math.random()}`,
          type: 'action',
          agent,
          title: 'Tool result',
          description: 'Result received',
          timestamp: new Date(),
          status: 'success',
          details: {
            result,
            code: JSON.stringify(result, null, 2),
            language: 'json'
          }
        });
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    return events;
  }
  
  formatToolOutput(tool: string, parameters: any, result?: any): string {
    let output = `🔧 **Tool:** \`${tool}\`\n`;
    
    if (parameters && Object.keys(parameters).length > 0) {
      output += `📥 **Parameters:**\n\`\`\`json\n${JSON.stringify(parameters, null, 2)}\n\`\`\`\n`;
    }
    
    if (result) {
      output += `📤 **Output:**\n`;
      if (typeof result === 'object') {
        output += `\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``;
      } else {
        output += `\`\`\`\n${result}\n\`\`\``;
      }
    }
    
    return output;
  }
}