/**
 * Tool Schema Service
 * Fetches and manages tool schemas from the backend
 */

import axios from 'axios';

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
  parameters: ToolParameter[];
  examples?: any[];
  icon?: string;
  color?: string;
  category?: string;
  available_in_agents?: boolean;
  available_in_ui?: boolean;
}

// Convert backend schema to frontend format
const convertBackendSchema = (backendSchema: any): ToolSchema => {
  const parameters: ToolParameter[] = [];

  if (backendSchema.parameters && backendSchema.parameters.properties) {
    const required = backendSchema.parameters.required || [];

    for (const [name, prop] of Object.entries(backendSchema.parameters.properties) as [string, any][]) {
      parameters.push({
        name,
        type: prop.type === 'integer' ? 'number' : prop.type,
        description: prop.description,
        required: required.includes(name),
        default: prop.default,
        enum: prop.enum,
        placeholder: prop.description
      });
    }
  }

  return {
    name: backendSchema.name,
    display_name: backendSchema.display_name || backendSchema.name,
    description: backendSchema.description,
    parameters,
    examples: backendSchema.examples || [],
    category: backendSchema.category,
    icon: backendSchema.icon,
    color: backendSchema.color,
    available_in_agents: backendSchema.available_in_agents !== false,
    available_in_ui: backendSchema.available_in_ui !== false
  };
};

class ToolSchemaService {
  private baseUrl: string;
  private schemas: Map<string, ToolSchema> = new Map();
  private loading = false;
  private loaded = false;

  constructor() {
    this.baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1';
  }

  async loadSchemas(): Promise<void> {
    if (this.loading || this.loaded) return;

    this.loading = true;
    try {
      // Try multiple endpoints to find available tools
      const endpoints = [
        '/tools',
        '/settings/tools',
        '/tools/available',
        '/swarm/tools'
      ];

      let tools: any[] = [];

      for (const endpoint of endpoints) {
        try {
          const response = await axios.get(`${this.baseUrl}${endpoint}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
            }
          });

          if (response.data) {
            // Handle different response formats
            if (Array.isArray(response.data)) {
              tools = response.data;
            } else if (response.data.tools && Array.isArray(response.data.tools)) {
              tools = response.data.tools;
            } else if (typeof response.data === 'object') {
              // Convert object to array
              tools = Object.values(response.data);
            }

            if (tools.length > 0) break;
          }
        } catch (error) {
          console.log(`Failed to fetch from ${endpoint}, trying next...`);
        }
      }

      // If no tools found from API, use default schemas
      if (tools.length === 0) {
        tools = this.getDefaultSchemas();
      }

      // Convert and store schemas
      for (const tool of tools) {
        const schema = this.normalizeToolSchema(tool);
        this.schemas.set(schema.name, schema);
      }

      this.loaded = true;
    } catch (error) {
      console.error('Failed to load tool schemas:', error);
      // Load default schemas as fallback
      this.loadDefaultSchemas();
      this.loaded = true;
    } finally {
      this.loading = false;
    }
  }

  private normalizeToolSchema(tool: any): ToolSchema {
    // If tool already has the correct structure
    if (tool.parameters && Array.isArray(tool.parameters)) {
      return tool;
    }

    // If tool has backend structure
    if (tool.parameters && tool.parameters.properties) {
      return convertBackendSchema(tool);
    }

    // If tool has minimal structure
    return {
      name: tool.name || tool.id,
      display_name: tool.display_name || tool.name || tool.id,
      description: tool.description || '',
      parameters: this.extractParameters(tool),
      examples: tool.examples || tool.example_usage || [],
      category: tool.category || tool.categories?.[0] || 'utility',
      icon: tool.icon,
      color: tool.color,
      available_in_agents: tool.available_in_agents !== false,
      available_in_ui: tool.available_in_ui !== false
    };
  }

  private extractParameters(tool: any): ToolParameter[] {
    const parameters: ToolParameter[] = [];

    // Try to extract from different formats
    if (tool.parameters?.properties) {
      const required = tool.parameters.required || [];
      for (const [name, prop] of Object.entries(tool.parameters.properties) as [string, any][]) {
        parameters.push({
          name,
          type: prop.type === 'integer' ? 'number' : prop.type,
          description: prop.description,
          required: required.includes(name),
          default: prop.default,
          enum: prop.enum,
          placeholder: prop.description
        });
      }
    } else if (tool.default_parameters) {
      // Extract from default_parameters
      for (const [name, value] of Object.entries(tool.default_parameters)) {
        parameters.push({
          name,
          type: typeof value === 'number' ? 'number' :
                typeof value === 'boolean' ? 'boolean' :
                Array.isArray(value) ? 'array' :
                typeof value === 'object' ? 'object' : 'string',
          description: '',
          required: false,
          default: value
        });
      }
    }

    return parameters;
  }

  private loadDefaultSchemas(): void {
    const defaultSchemas = this.getDefaultSchemas();
    for (const schema of defaultSchemas) {
      const converted = convertBackendSchema(schema);
      this.schemas.set(converted.name, converted);
    }
  }

  private getDefaultSchemas(): any[] {
    return [
      {
        name: 'python_repl',
        description: 'Execute Python code in a REPL environment',
        parameters: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'Python code to execute'
            }
          },
          required: ['code']
        },
        examples: [
          { code: "import pandas as pd\ndf = pd.read_csv('data.csv')\nprint(df.head())" },
          { code: "2 + 2" }
        ],
        category: 'compute',
        color: '#8B5CF6'
      },
      {
        name: 'file_read',
        description: 'Read contents of a file',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file to read'
            }
          },
          required: ['path']
        },
        examples: [
          { path: 'config.json' },
          { path: './src/main.py' }
        ],
        category: 'file',
        color: '#3B82F6'
      },
      {
        name: 'file_write',
        description: 'Write content to a file',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file to write'
            },
            content: {
              type: 'string',
              description: 'Content to write to the file'
            }
          },
          required: ['path', 'content']
        },
        examples: [
          { path: 'output.txt', content: 'Hello, world!' }
        ],
        category: 'file',
        color: '#3B82F6'
      },
      {
        name: 'http_request',
        description: 'Make HTTP requests to external services',
        parameters: {
          type: 'object',
          properties: {
            method: {
              type: 'string',
              description: 'HTTP method',
              enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
              default: 'GET'
            },
            url: {
              type: 'string',
              description: 'URL to request'
            },
            headers: {
              type: 'object',
              description: 'Request headers',
              default: {}
            },
            body: {
              type: 'string',
              description: 'Request body for POST/PUT/PATCH'
            }
          },
          required: ['url']
        },
        examples: [
          { method: 'GET', url: 'https://api.example.com/data' },
          { method: 'POST', url: 'https://api.example.com/resource', headers: {'Content-Type': 'application/json'}, body: '{"key": "value"}' }
        ],
        category: 'network',
        color: '#F59E0B'
      },
      {
        name: 'shell',
        description: 'Execute shell commands on the system',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Shell command to execute'
            },
            ignore_errors: {
              type: 'boolean',
              description: 'Continue if command fails',
              default: false
            }
          },
          required: ['command']
        },
        examples: [
          { command: 'ls -la' },
          { command: 'pwd' }
        ],
        category: 'system',
        color: '#10B981'
      },
      {
        name: 'calculator',
        description: 'Perform mathematical calculations',
        parameters: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: 'Mathematical expression to evaluate'
            }
          },
          required: ['expression']
        },
        examples: [
          { expression: '2 * sin(pi/4) + log(e**2)' },
          { expression: 'sqrt(144) + 5**2' }
        ],
        category: 'utility',
        color: '#84CC16'
      },
      {
        name: 'current_time',
        description: 'Get the current time in ISO format',
        parameters: {
          type: 'object',
          properties: {
            timezone: {
              type: 'string',
              description: 'Timezone (e.g., US/Pacific)',
              default: 'UTC'
            }
          },
          required: []
        },
        examples: [
          { timezone: 'US/Pacific' },
          { timezone: 'Europe/London' }
        ],
        category: 'utility',
        color: '#84CC16'
      },
      {
        name: 'tavily_search',
        description: 'Real-time web search optimized for AI',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query'
            },
            search_depth: {
              type: 'string',
              description: 'Search depth',
              enum: ['basic', 'advanced'],
              default: 'basic'
            },
            max_results: {
              type: 'number',
              description: 'Maximum results',
              default: 5
            }
          },
          required: ['query']
        },
        examples: [
          { query: 'What is artificial intelligence?', search_depth: 'advanced' }
        ],
        category: 'ai',
        color: '#F97316'
      }
    ];
  }

  async getSchema(toolName: string): Promise<ToolSchema | undefined> {
    if (!this.loaded) {
      await this.loadSchemas();
    }
    return this.schemas.get(toolName);
  }

  async getAllSchemas(): Promise<ToolSchema[]> {
    if (!this.loaded) {
      await this.loadSchemas();
    }
    return Array.from(this.schemas.values());
  }

  getAvailableTools(): string[] {
    return Array.from(this.schemas.keys());
  }

  getCategorizedTools(): Map<string, ToolSchema[]> {
    const categorized = new Map<string, ToolSchema[]>();

    Array.from(this.schemas.values()).forEach(schema => {
      const category = schema.category || 'other';
      if (!categorized.has(category)) {
        categorized.set(category, []);
      }
      categorized.get(category)!.push(schema);
    });

    return categorized;
  }
}

// Export singleton instance
export const toolSchemaService = new ToolSchemaService();