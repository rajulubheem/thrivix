/**
 * Unified Tool Service
 * Bridges frontend tool blocks with backend Strands agents
 * Ensures consistency between UI workflow creation and agent execution
 */

import axios from 'axios';
import { API_BASE_URL } from '../config/api';

export interface UnifiedToolInfo {
  name: string;
  display_name: string;
  description: string;
  category: string;
  parameters: Record<string, any>;
  examples: Array<Record<string, any>>;
  icon?: string;
  color?: string;
  available_in_agents: boolean;
  available_in_ui: boolean;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'file';
  description?: string;
  required?: boolean;
  default?: any;
  enum?: string[];
  placeholder?: string;
}

export interface ToolSchema {
  name: string;
  display_name?: string;
  description: string;
  category?: string;
  parameters: ToolParameter[];
  examples?: any[];
  icon?: string;
  color?: string;
  available_in_agents?: boolean;
  available_in_ui?: boolean;
}

export interface WorkflowBlock {
  id: string;
  type: string;
  tool_name?: string;
  parameters: Record<string, any>;
  position?: { x: number; y: number };
  connections: string[];
}

export interface WorkflowExecutionRequest {
  workflow_id: string;
  blocks: WorkflowBlock[];
  edges: Array<{ source: string; target: string; sourceHandle?: string; targetHandle?: string }>;
  context: Record<string, any>;
  use_agents: boolean;
}

export interface ToolCategory {
  name: string;
  icon: string;
  color: string;
  description: string;
}

class UnifiedToolService {
  private toolsCache: UnifiedToolInfo[] | null = null;
  private categoriesCache: Record<string, ToolCategory> | null = null;
  private loadingPromise: Promise<void> | null = null;

  private getAuthHeaders() {
    const token = localStorage.getItem('access_token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Get all available tools from the unified endpoint
   */
  async getAvailableTools(category?: string): Promise<UnifiedToolInfo[]> {
    try {
      const url = category
        ? `${API_BASE_URL}/api/v1/unified/available?category=${category}`
        : `${API_BASE_URL}/api/v1/unified/available`;

      const response = await axios.get<UnifiedToolInfo[]>(url, {
        headers: this.getAuthHeaders()
      });

      this.toolsCache = response.data;
      return response.data;
    } catch (error) {
      console.error('Failed to fetch available tools:', error);
      // Return cached tools if available
      if (this.toolsCache) {
        return category
          ? this.toolsCache.filter(t => t.category === category)
          : this.toolsCache;
      }
      return [];
    }
  }

  /**
   * Get tool categories
   */
  async getToolCategories(): Promise<Record<string, ToolCategory>> {
    if (this.categoriesCache) {
      return this.categoriesCache;
    }

    try {
      const response = await axios.get<Record<string, ToolCategory>>(
        `${API_BASE_URL}/api/v1/unified/categories`,
        {
          headers: this.getAuthHeaders()
        }
      );

      this.categoriesCache = response.data;
      return response.data;
    } catch (error) {
      console.error('Failed to fetch tool categories:', error);
      return this.getDefaultCategories();
    }
  }

  /**
   * Convert UnifiedToolInfo to ToolSchema format for compatibility
   */
  convertToToolSchema(tool: UnifiedToolInfo): ToolSchema {
    const parameters: ToolParameter[] = [];
    const params = tool.parameters || {};
    const properties = params.properties || {};
    const required = params.required || [];

    for (const [name, prop] of Object.entries(properties)) {
      const p = prop as any;
      parameters.push({
        name,
        type: this.mapJsonSchemaType(p.type),
        description: p.description || '',
        required: required.includes(name),
        default: p.default,
        enum: p.enum,
        placeholder: p.description
      });
    }

    return {
      name: tool.name,
      display_name: tool.display_name,
      description: tool.description,
      category: tool.category,
      parameters,
      examples: tool.examples,
      icon: tool.icon,
      color: tool.color,
      available_in_agents: tool.available_in_agents,
      available_in_ui: tool.available_in_ui
    };
  }

  /**
   * Get tool schema by name
   */
  async getToolSchema(toolName: string): Promise<ToolSchema | null> {
    const tools = await this.getAvailableTools();
    const tool = tools.find(t => t.name === toolName);
    return tool ? this.convertToToolSchema(tool) : null;
  }

  /**
   * Get all tool schemas
   */
  async getAllSchemas(): Promise<ToolSchema[]> {
    const tools = await this.getAvailableTools();
    return tools.map(tool => this.convertToToolSchema(tool));
  }

  /**
   * Execute a workflow created in the UI
   */
  async executeWorkflow(request: WorkflowExecutionRequest): Promise<any> {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/v1/unified/execute-workflow`,
        request,
        {
          headers: this.getAuthHeaders()
        }
      );

      return response.data;
    } catch (error) {
      console.error('Failed to execute workflow:', error);
      throw error;
    }
  }

  /**
   * Validate a workflow before execution
   */
  async validateWorkflow(
    blocks: WorkflowBlock[],
    edges: Array<any>
  ): Promise<{ valid: boolean; issues: string[]; warnings: string[] }> {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/v1/unified/validate-workflow`,
        { blocks, edges },
        {
          headers: this.getAuthHeaders()
        }
      );

      return response.data;
    } catch (error) {
      console.error('Failed to validate workflow:', error);
      return {
        valid: false,
        issues: ['Failed to validate workflow'],
        warnings: []
      };
    }
  }

  /**
   * Get categorized tools for UI display
   */
  async getCategorizedTools(): Promise<Map<string, ToolSchema[]>> {
    const tools = await this.getAvailableTools();
    const categorized = new Map<string, ToolSchema[]>();

    tools.forEach(tool => {
      const category = tool.category || 'general';
      if (!categorized.has(category)) {
        categorized.set(category, []);
      }
      const schema = this.convertToToolSchema(tool);
      categorized.get(category)!.push(schema);
    });

    return categorized;
  }

  /**
   * Check if a tool is available in agents
   */
  async isToolAvailableInAgents(toolName: string): Promise<boolean> {
    const tools = await this.getAvailableTools();
    const tool = tools.find(t => t.name === toolName);
    return tool ? tool.available_in_agents : false;
  }

  /**
   * Check if a tool is available in UI
   */
  async isToolAvailableInUI(toolName: string): Promise<boolean> {
    const tools = await this.getAvailableTools();
    const tool = tools.find(t => t.name === toolName);
    return tool ? tool.available_in_ui : false;
  }

  private mapJsonSchemaType(type: string): ToolParameter['type'] {
    switch (type) {
      case 'integer':
        return 'number';
      case 'string':
        return 'string';
      case 'boolean':
        return 'boolean';
      case 'object':
        return 'object';
      case 'array':
        return 'array';
      default:
        return 'string';
    }
  }

  private getDefaultCategories(): Record<string, ToolCategory> {
    return {
      file_operations: {
        name: 'File Operations',
        icon: 'FileText',
        color: '#3B82F6',
        description: 'Read, write, and edit files'
      },
      web: {
        name: 'Web & Network',
        icon: 'Globe',
        color: '#F59E0B',
        description: 'Web search, HTTP requests, and APIs'
      },
      code_execution: {
        name: 'Code Execution',
        icon: 'Code',
        color: '#8B5CF6',
        description: 'Run Python, shell commands, calculations'
      },
      utilities: {
        name: 'Utilities',
        icon: 'Wrench',
        color: '#84CC16',
        description: 'Time, environment, system info'
      },
      reasoning: {
        name: 'AI & Reasoning',
        icon: 'Brain',
        color: '#F97316',
        description: 'Advanced reasoning and AI capabilities'
      },
      memory: {
        name: 'Memory & Storage',
        icon: 'Database',
        color: '#EC4899',
        description: 'Store and retrieve information'
      },
      media: {
        name: 'Media',
        icon: 'Image',
        color: '#6366F1',
        description: 'Images, speech, diagrams'
      },
      planning: {
        name: 'Planning',
        icon: 'Target',
        color: '#10B981',
        description: 'Task planning and execution'
      }
    };
  }
}

// Export singleton instance
export const unifiedToolService = new UnifiedToolService();