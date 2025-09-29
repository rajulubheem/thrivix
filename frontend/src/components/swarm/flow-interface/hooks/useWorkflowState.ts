import { useState, useCallback, useEffect } from 'react';
import { Node, Edge, Connection, addEdge, MarkerType } from 'reactflow';
import { v4 as uuidv4 } from 'uuid';
import { Agent, ExecutionState, WorkflowTemplate } from '../types';

export const useWorkflowState = (isDarkMode: boolean) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedNodeForSettings, setSelectedNodeForSettings] = useState<any>(null);
  const [executionState, setExecutionState] = useState<ExecutionState>({
    currentState: '',
    status: 'idle',
    states: {},
    transitions: [],
  });

  // Node operations
  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdge = {
        ...connection,
        id: `${connection.source}-${connection.target}`,
        type: 'interactiveEdge',
        animated: false,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: isDarkMode ? '#475569' : '#cbd5e1',
          orient: 'auto' as const,
        },
        data: {
          isDarkMode,
          label: '',
        },
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [isDarkMode]
  );

  const addNode = useCallback((type: string = 'analysis', position?: { x: number; y: number }) => {
    const newNode: Node = {
      id: uuidv4(),
      type: 'agentNode',
      position: position || { x: Math.random() * 500, y: Math.random() * 300 },
      data: {
        label: `${type.charAt(0).toUpperCase() + type.slice(1)} Node`,
        name: `${type.charAt(0).toUpperCase() + type.slice(1)} Node`,
        type,
        nodeType: type,
        agent_role: type === 'analysis' ? 'Analyzer' : type === 'tool_call' ? 'Executor' : 'Agent',
        description: '',
        tools: [],
        isDarkMode,
        status: 'idle',
        onSettings: () => setSelectedNodeForSettings(newNode),
        onExecute: () => {
          // Execution logic will be handled by the parent
        },
      },
    };
    setNodes((nds) => [...nds, newNode]);
    return newNode;
  }, [isDarkMode]);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeForSettings(null);
    setSelectedAgent(null);
  }, []);

  const duplicateNode = useCallback((nodeId: string) => {
    const nodeToDuplicate = nodes.find((n) => n.id === nodeId);
    if (nodeToDuplicate) {
      const newNode = {
        ...nodeToDuplicate,
        id: uuidv4(),
        position: {
          x: nodeToDuplicate.position.x + 50,
          y: nodeToDuplicate.position.y + 50,
        },
      };
      setNodes((nds) => [...nds, newNode]);
    }
  }, [nodes]);

  const updateNode = useCallback((nodeId: string, data: any) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, ...data } }
          : n
      )
    );
    // Update the selectedNodeForSettings to reflect the changes
    setSelectedNodeForSettings((prev: any) =>
      prev && prev.id === nodeId
        ? { ...prev, data: { ...prev.data, ...data } }
        : prev
    );
  }, []);

  const clearWorkflow = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setExecutionState({
      currentState: '',
      status: 'idle',
      states: {},
      transitions: [],
    });
    setSelectedAgent(null);
    setSelectedNodeForSettings(null);
  }, []);

  // Edge operations
  const updateEdge = useCallback((edgeId: string, data: any) => {
    setEdges((eds) =>
      eds.map((e) =>
        e.id === edgeId
          ? { ...e, data: { ...e.data, ...data } }
          : e
      )
    );
  }, []);

  const deleteEdge = useCallback((edgeId: string) => {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
  }, []);

  // Template operations
  const saveAsTemplate = useCallback((name: string, description?: string): WorkflowTemplate => {
    const template: WorkflowTemplate = {
      id: uuidv4(),
      name,
      description,
      nodes: nodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          onSettings: undefined,
          onExecute: undefined,
        }
      })),
      edges: edges.map(edge => ({
        ...edge,
        data: {
          ...edge.data,
        }
      })),
      createdAt: new Date().toISOString(),
      tags: [],
    };

    // Save to localStorage
    const existingTemplates = JSON.parse(localStorage.getItem('workflowTemplates') || '[]');
    existingTemplates.push(template);
    localStorage.setItem('workflowTemplates', JSON.stringify(existingTemplates));

    return template;
  }, [nodes, edges]);

  const loadTemplate = useCallback((template: WorkflowTemplate) => {
    clearWorkflow();

    // Load nodes with their full visual properties
    const loadedNodes = template.nodes.map((node: any) => ({
      ...node,
      data: {
        ...node.data,
        isDarkMode,
        onSettings: () => setSelectedNodeForSettings(node),
        onExecute: () => {
          // Execution logic will be handled by the parent
        },
      }
    }));

    // Load edges with their full visual properties
    const loadedEdges = template.edges.map((edge: any) => ({
      ...edge,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 20,
        height: 20,
        color: isDarkMode ? '#475569' : '#cbd5e1',
        orient: 'auto' as const,
      },
      data: {
        ...edge.data,
        isDarkMode,
      }
    }));

    setNodes(loadedNodes);
    setEdges(loadedEdges);
  }, [isDarkMode, clearWorkflow]);

  const getTemplates = useCallback((): WorkflowTemplate[] => {
    return JSON.parse(localStorage.getItem('workflowTemplates') || '[]');
  }, []);

  const deleteTemplate = useCallback((templateId: string) => {
    const templates = getTemplates().filter(t => t.id !== templateId);
    localStorage.setItem('workflowTemplates', JSON.stringify(templates));
  }, [getTemplates]);

  return {
    nodes,
    setNodes,
    edges,
    setEdges,
    selectedAgent,
    setSelectedAgent,
    selectedNodeForSettings,
    setSelectedNodeForSettings,
    executionState,
    setExecutionState,
    onConnect,
    addNode,
    deleteNode,
    duplicateNode,
    updateNode,
    clearWorkflow,
    updateEdge,
    deleteEdge,
    saveAsTemplate,
    loadTemplate,
    getTemplates,
    deleteTemplate,
  };
};