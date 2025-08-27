/**
 * Tool Registry Service
 * Manages available tools, permissions, and validation
 */

import { 
  StrandsTool, 
  ToolRegistry, 
  ToolCall, 
  StrandsAgent,
  SafetyConfig 
} from '../types/strands';

// Pre-defined Strands tools based on documentation
const STRANDS_TOOLS: StrandsTool[] = [
  // File Operations
  {
    name: 'file_read',
    description: 'Read contents of a file',
    category: 'file_ops',
    requiresApproval: false,
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'File path to read',
        required: true,
        validation: (value) => typeof value === 'string' && value.length > 0
      },
      {
        name: 'encoding',
        type: 'string',
        description: 'File encoding',
        required: false,
        default: 'utf-8'
      }
    ]
  },
  {
    name: 'file_write',
    description: 'Write content to a file',
    category: 'file_ops',
    requiresApproval: true, // Requires approval for safety
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'File path to write',
        required: true,
        validation: (value) => typeof value === 'string' && value.length > 0
      },
      {
        name: 'content',
        type: 'string',
        description: 'Content to write',
        required: true,
        validation: (value) => value !== undefined && value !== null
      },
      {
        name: 'mode',
        type: 'string',
        description: 'Write mode (write/append)',
        required: false,
        default: 'write',
        validation: (value) => ['write', 'append'].includes(value)
      }
    ]
  },
  
  // Web Operations
  {
    name: 'http_request',
    description: 'Make HTTP requests',
    category: 'web',
    requiresApproval: true,
    parameters: [
      {
        name: 'url',
        type: 'string',
        description: 'URL to request',
        required: true,
        validation: (value) => {
          try {
            new URL(value);
            return true;
          } catch {
            return false;
          }
        }
      },
      {
        name: 'method',
        type: 'string',
        description: 'HTTP method',
        required: false,
        default: 'GET',
        validation: (value) => ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(value)
      },
      {
        name: 'headers',
        type: 'object',
        description: 'Request headers',
        required: false,
        default: {}
      },
      {
        name: 'body',
        type: 'object',
        description: 'Request body',
        required: false
      }
    ]
  },
  
  // System Operations
  {
    name: 'shell',
    description: 'Execute shell commands',
    category: 'system',
    requiresApproval: true, // Always requires approval for safety
    parameters: [
      {
        name: 'command',
        type: 'string',
        description: 'Shell command to execute',
        required: true,
        validation: (value) => {
          // Block dangerous commands
          const dangerous = ['rm -rf', 'format', 'del /f', 'sudo', 'chmod 777'];
          const cmd = value.toLowerCase();
          return !dangerous.some(d => cmd.includes(d));
        }
      },
      {
        name: 'cwd',
        type: 'string',
        description: 'Working directory',
        required: false
      }
    ]
  },
  
  // Human Interaction
  {
    name: 'handoff_to_user',
    description: 'Request user input or approval',
    category: 'human',
    requiresApproval: false, // This IS the approval mechanism
    parameters: [
      {
        name: 'message',
        type: 'string',
        description: 'Message to display to user',
        required: true,
        validation: (value) => typeof value === 'string' && value.length > 0
      },
      {
        name: 'breakout_of_loop',
        type: 'boolean',
        description: 'Whether to stop execution after handoff',
        required: false,
        default: false
      },
      {
        name: 'options',
        type: 'array',
        description: 'Predefined options for user to choose',
        required: false
      }
    ]
  },
  
  // Code Operations
  {
    name: 'editor',
    description: 'Edit code files with targeted modifications',
    category: 'code',
    requiresApproval: true,
    parameters: [
      {
        name: 'file_path',
        type: 'string',
        description: 'Path to file to edit',
        required: true,
        validation: (value) => typeof value === 'string' && value.length > 0
      },
      {
        name: 'operation',
        type: 'string',
        description: 'Edit operation type',
        required: true,
        validation: (value) => ['replace', 'insert', 'delete'].includes(value)
      },
      {
        name: 'target',
        type: 'string',
        description: 'Text to target for operation',
        required: true
      },
      {
        name: 'replacement',
        type: 'string',
        description: 'Replacement text',
        required: false
      }
    ]
  }
];

class ToolRegistryService {
  private registry: ToolRegistry;
  private safetyConfig: SafetyConfig;

  constructor() {
    this.registry = {
      tools: new Map(),
      mcpServers: new Map(),
      agentTools: new Map(),
      approvalRequired: new Set(),
      autoApproved: new Set()
    };

    this.safetyConfig = {
      maxToolCallsPerAgent: 50,
      maxRecursiveHandoffs: 10,
      bannedTools: [],
      sensitiveTools: ['shell', 'file_write', 'editor'],
      toolTimeoutSeconds: 30,
      requireParameterValidation: true,
      logAllToolCalls: true
    };

    // Initialize with pre-defined tools
    this.initializeTools();
  }

  private initializeTools() {
    STRANDS_TOOLS.forEach(tool => {
      this.registerTool(tool);
    });
  }

  registerTool(tool: StrandsTool) {
    this.registry.tools.set(tool.name, tool);
    
    if (tool.requiresApproval || this.safetyConfig.sensitiveTools.includes(tool.name)) {
      this.registry.approvalRequired.add(tool.name);
    }
    
    console.log(`✅ Registered tool: ${tool.name} (${tool.category})`);
  }

  registerAgentTools(agentName: string, toolNames: string[]) {
    // Validate that all tools exist
    const validTools = toolNames.filter(name => {
      const exists = this.registry.tools.has(name);
      if (!exists) {
        console.warn(`⚠️ Tool '${name}' not found in registry for agent '${agentName}'`);
      }
      return exists;
    });

    this.registry.agentTools.set(agentName, new Set(validTools));
    console.log(`🤖 Agent '${agentName}' registered with tools:`, validTools);
  }

  canAgentUseTool(agent: StrandsAgent, toolName: string): boolean {
    // Check if tool exists
    if (!this.registry.tools.has(toolName)) {
      console.error(`❌ Tool '${toolName}' not found in registry`);
      return false;
    }

    // Check if tool is banned
    if (this.safetyConfig.bannedTools.includes(toolName)) {
      console.error(`🚫 Tool '${toolName}' is banned`);
      return false;
    }

    // Check if agent has permission
    const agentTools = this.registry.agentTools.get(agent.name);
    if (!agentTools || !agentTools.has(toolName)) {
      console.error(`❌ Agent '${agent.name}' not authorized for tool '${toolName}'`);
      return false;
    }

    return true;
  }

  requiresApproval(toolName: string, agent: StrandsAgent): boolean {
    // handoff_to_user never requires approval (it IS the approval)
    if (toolName === 'handoff_to_user') {
      return false;
    }

    // Check if tool requires approval
    if (this.registry.approvalRequired.has(toolName)) {
      // High trust agents might auto-approve some tools
      if (agent.trustLevel === 'high' && !this.safetyConfig.sensitiveTools.includes(toolName)) {
        return false;
      }
      return true;
    }

    // Check if tool is in auto-approved list
    if (this.registry.autoApproved.has(toolName)) {
      return false;
    }

    // Default to requiring approval for unknown tools
    return true;
  }

  validateToolCall(toolCall: ToolCall): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const tool = this.registry.tools.get(toolCall.toolName);

    if (!tool) {
      errors.push(`Tool '${toolCall.toolName}' not found`);
      return { valid: false, errors };
    }

    // Validate required parameters
    tool.parameters.forEach(param => {
      if (param.required && !(param.name in toolCall.parameters)) {
        errors.push(`Missing required parameter: ${param.name}`);
      }
    });

    // Validate parameter types and custom validation
    if (this.safetyConfig.requireParameterValidation) {
      tool.parameters.forEach(param => {
        const value = toolCall.parameters[param.name];
        if (value !== undefined && value !== null) {
          // Type validation
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          if (actualType !== param.type && param.type !== 'object') {
            errors.push(`Parameter '${param.name}' should be ${param.type} but got ${actualType}`);
          }

          // Custom validation
          if (param.validation && !param.validation(value)) {
            errors.push(`Parameter '${param.name}' failed validation`);
          }
        }
      });
    }

    return { valid: errors.length === 0, errors };
  }

  getTool(name: string): StrandsTool | undefined {
    return this.registry.tools.get(name);
  }

  getAllTools(): StrandsTool[] {
    return Array.from(this.registry.tools.values());
  }

  getAgentTools(agentName: string): string[] {
    const tools = this.registry.agentTools.get(agentName);
    return tools ? Array.from(tools) : [];
  }

  getSafetyConfig(): SafetyConfig {
    return { ...this.safetyConfig };
  }

  updateSafetyConfig(updates: Partial<SafetyConfig>) {
    this.safetyConfig = { ...this.safetyConfig, ...updates };
    console.log('🔒 Safety config updated:', this.safetyConfig);
  }

  // Auto-approve specific tools
  setAutoApprovedTools(toolNames: string[]) {
    this.registry.autoApproved = new Set(toolNames.filter(name => 
      this.registry.tools.has(name) && !this.safetyConfig.sensitiveTools.includes(name)
    ));
    console.log('✅ Auto-approved tools:', Array.from(this.registry.autoApproved));
  }

  // Get tools by category
  getToolsByCategory(category: string): StrandsTool[] {
    return Array.from(this.registry.tools.values()).filter(tool => tool.category === category);
  }

  // Export tool stats
  getToolStats() {
    return {
      totalTools: this.registry.tools.size,
      requireApproval: this.registry.approvalRequired.size,
      autoApproved: this.registry.autoApproved.size,
      byCategory: Array.from(this.registry.tools.values()).reduce((acc, tool) => {
        acc[tool.category] = (acc[tool.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      agentMappings: Array.from(this.registry.agentTools.entries()).map(([agent, tools]) => ({
        agent,
        toolCount: tools.size,
        tools: Array.from(tools)
      }))
    };
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistryService();

// Export for use in components
export default toolRegistry;