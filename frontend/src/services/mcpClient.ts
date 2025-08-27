/**
 * MCP (Model Context Protocol) Client Service
 * Manages connections to MCP servers and tool discovery
 */

import { MCPServer, MCPToolCall, StrandsTool } from '../types/strands';
import toolRegistry from './toolRegistry';

interface MCPToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

interface MCPResponse {
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

class MCPClientService {
  private servers: Map<string, MCPServer> = new Map();
  private activeConnections: Map<string, WebSocket | null> = new Map();
  private pendingRequests: Map<string, (response: any) => void> = new Map();

  async connectToServer(server: MCPServer): Promise<boolean> {
    try {
      console.log(`🔌 Connecting to MCP server: ${server.name} at ${server.url}`);
      
      // Update server status
      server.status = 'connecting';
      this.servers.set(server.id, server);

      if (server.transport === 'websocket') {
        return await this.connectWebSocket(server);
      } else if (server.transport === 'http') {
        return await this.connectHTTP(server);
      } else {
        throw new Error(`Unsupported transport: ${server.transport}`);
      }
    } catch (error) {
      console.error(`❌ Failed to connect to MCP server ${server.name}:`, error);
      server.status = 'error';
      this.servers.set(server.id, server);
      return false;
    }
  }

  private async connectWebSocket(server: MCPServer): Promise<boolean> {
    return new Promise((resolve) => {
      const ws = new WebSocket(server.url);

      ws.onopen = async () => {
        console.log(`✅ WebSocket connected to ${server.name}`);
        server.status = 'connected';
        server.lastConnected = new Date();
        this.activeConnections.set(server.id, ws);
        
        // Discover available tools
        await this.discoverTools(server);
        resolve(true);
      };

      ws.onerror = (error) => {
        console.error(`❌ WebSocket error for ${server.name}:`, error);
        server.status = 'error';
        resolve(false);
      };

      ws.onmessage = (event) => {
        this.handleWebSocketMessage(server.id, event.data);
      };

      ws.onclose = () => {
        console.log(`🔌 WebSocket disconnected from ${server.name}`);
        server.status = 'disconnected';
        this.activeConnections.set(server.id, null);
      };
    });
  }

  private async connectHTTP(server: MCPServer): Promise<boolean> {
    try {
      // Test connection with a simple request
      const response = await fetch(`${server.url}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        console.log(`✅ HTTP connection established to ${server.name}`);
        server.status = 'connected';
        server.lastConnected = new Date();
        this.activeConnections.set(server.id, null); // HTTP doesn't maintain connection
        
        // Discover available tools
        await this.discoverTools(server);
        return true;
      }
      
      throw new Error(`HTTP connection failed: ${response.status}`);
    } catch (error) {
      console.error(`❌ HTTP connection error for ${server.name}:`, error);
      server.status = 'error';
      return false;
    }
  }

  async discoverTools(server: MCPServer): Promise<string[]> {
    try {
      console.log(`🔍 Discovering tools from ${server.name}...`);
      
      const tools = await this.callServerMethod(server, 'tools/list', {});
      
      if (tools && Array.isArray(tools)) {
        server.availableTools = tools.map((tool: MCPToolDefinition) => {
          // Register each MCP tool in the tool registry
          this.registerMCPTool(server, tool);
          return tool.name;
        });
        
        console.log(`✅ Discovered ${server.availableTools.length} tools from ${server.name}:`, server.availableTools);
        return server.availableTools;
      }
      
      return [];
    } catch (error) {
      console.error(`❌ Failed to discover tools from ${server.name}:`, error);
      return [];
    }
  }

  private registerMCPTool(server: MCPServer, toolDef: MCPToolDefinition) {
    const mcpTool: StrandsTool = {
      name: `mcp_${server.id}_${toolDef.name}`,
      description: toolDef.description || `MCP tool from ${server.name}`,
      category: 'mcp',
      requiresApproval: true, // MCP tools always require approval by default
      parameters: this.convertMCPParameters(toolDef.parameters),
      mcpEndpoint: server.url
    };

    toolRegistry.registerTool(mcpTool);
    console.log(`📦 Registered MCP tool: ${mcpTool.name}`);
  }

  private convertMCPParameters(mcpParams: any): any[] {
    const params: any[] = [];
    
    if (mcpParams?.properties) {
      Object.entries(mcpParams.properties).forEach(([name, schema]: [string, any]) => {
        params.push({
          name,
          type: this.mapJSONSchemaType(schema.type),
          description: schema.description || '',
          required: mcpParams.required?.includes(name) || false,
          default: schema.default
        });
      });
    }
    
    return params;
  }

  private mapJSONSchemaType(jsonType: string): string {
    const typeMap: Record<string, string> = {
      'string': 'string',
      'number': 'number',
      'integer': 'number',
      'boolean': 'boolean',
      'object': 'object',
      'array': 'array'
    };
    return typeMap[jsonType] || 'string';
  }

  async callTool(serverId: string, toolName: string, parameters: any): Promise<any> {
    const server = this.servers.get(serverId);
    
    if (!server || server.status !== 'connected') {
      throw new Error(`MCP server ${serverId} is not connected`);
    }

    const toolCall: MCPToolCall = {
      server: serverId,
      tool: toolName,
      parameters,
      requestId: this.generateRequestId()
    };

    console.log(`🔧 Calling MCP tool ${toolName} on ${server.name}:`, parameters);

    try {
      const result = await this.callServerMethod(server, 'tools/call', {
        name: toolName,
        arguments: parameters
      });

      console.log(`✅ MCP tool ${toolName} executed successfully`);
      return result;
    } catch (error) {
      console.error(`❌ MCP tool ${toolName} failed:`, error);
      throw error;
    }
  }

  private async callServerMethod(server: MCPServer, method: string, params: any): Promise<any> {
    if (server.transport === 'websocket') {
      return this.callWebSocketMethod(server, method, params);
    } else if (server.transport === 'http') {
      return this.callHTTPMethod(server, method, params);
    }
    throw new Error(`Unsupported transport: ${server.transport}`);
  }

  private async callWebSocketMethod(server: MCPServer, method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const ws = this.activeConnections.get(server.id);
      
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const requestId = this.generateRequestId();
      const request = {
        jsonrpc: '2.0',
        method,
        params,
        id: requestId
      };

      // Store the resolver for this request
      this.pendingRequests.set(requestId, resolve);

      // Send the request
      ws.send(JSON.stringify(request));

      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, 30000); // 30 second timeout
    });
  }

  private async callHTTPMethod(server: MCPServer, method: string, params: any): Promise<any> {
    const response = await fetch(`${server.url}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: this.generateRequestId()
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP request failed: ${response.status}`);
    }

    const data: MCPResponse = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }

    return data.result;
  }

  private handleWebSocketMessage(serverId: string, data: string) {
    try {
      const message = JSON.parse(data);
      
      // Handle response to a pending request
      if (message.id && this.pendingRequests.has(message.id)) {
        const resolver = this.pendingRequests.get(message.id);
        this.pendingRequests.delete(message.id);
        
        if (resolver) {
          if (message.error) {
            console.error('MCP error response:', message.error);
            resolver(null);
          } else {
            resolver(message.result);
          }
        }
      }
      
      // Handle server-initiated messages (notifications, etc.)
      if (!message.id && message.method) {
        console.log(`📨 MCP notification from ${serverId}:`, message);
        // Handle notifications as needed
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  disconnectServer(serverId: string) {
    const server = this.servers.get(serverId);
    
    if (server) {
      if (server.transport === 'websocket') {
        const ws = this.activeConnections.get(serverId);
        if (ws) {
          ws.close();
        }
      }
      
      server.status = 'disconnected';
      this.activeConnections.delete(serverId);
      console.log(`🔌 Disconnected from MCP server: ${server.name}`);
    }
  }

  getServers(): MCPServer[] {
    return Array.from(this.servers.values());
  }

  getServer(serverId: string): MCPServer | undefined {
    return this.servers.get(serverId);
  }

  isConnected(serverId: string): boolean {
    const server = this.servers.get(serverId);
    return server?.status === 'connected';
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Add common MCP servers
  async addCommonServers() {
    const commonServers: MCPServer[] = [
      {
        id: 'calculator',
        name: 'Calculator MCP',
        url: 'ws://localhost:8765',
        transport: 'websocket',
        status: 'disconnected',
        availableTools: []
      },
      {
        id: 'file_system',
        name: 'File System MCP',
        url: 'http://localhost:3001/mcp',
        transport: 'http',
        status: 'disconnected',
        availableTools: []
      }
    ];

    for (const server of commonServers) {
      await this.connectToServer(server);
    }
  }
}

// Singleton instance
export const mcpClient = new MCPClientService();

export default mcpClient;