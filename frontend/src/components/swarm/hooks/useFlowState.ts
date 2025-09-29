import { useState, useCallback, useRef } from 'react';
import { Node, Edge, useNodesState, useEdgesState, Connection, addEdge } from 'reactflow';
import { v4 as uuidv4 } from 'uuid';
import { Position, MarkerType } from 'reactflow';

export const useFlowState = (isDarkMode: boolean, layoutDirection: string = 'TB') => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedNodeForSettings, setSelectedNodeForSettings] = useState<any>(null);
  const [highlightPath, setHighlightPath] = useState(false);
  const preventRerender = useRef(false);

  const onConnect = useCallback((connection: Connection) => {
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
        orient: 'auto',
      },
      data: {
        isDarkMode,
        label: '',
        event: 'success'
      },
    };
    setEdges((eds) => addEdge(newEdge, eds));
  }, [isDarkMode, setEdges]);

  const addNode = useCallback((type: string = 'analysis', position?: { x: number; y: number }) => {
    const newNode: Node = {
      id: uuidv4(),
      type: 'agent',
      position: position || { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
      data: {
        label: `${type} Node`,
        name: `${type} Node`,
        type,
        nodeType: type,
        status: 'pending',
        isDarkMode,
        toolsPlanned: [],
        description: '',
        agentRole: type === 'analysis' ? 'Analyzer' : 'Agent',
        targetPosition: layoutDirection === 'LR' ? Position.Left : Position.Top,
        sourcePosition: layoutDirection === 'LR' ? Position.Right : Position.Bottom,
      },
    };
    setNodes((nds) => [...nds, newNode]);
    return newNode;
  }, [isDarkMode, layoutDirection, setNodes]);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, [setNodes, setEdges]);

  const updateNodeData = useCallback((nodeId: string, data: any) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, ...data } }
          : n
      )
    );
  }, [setNodes]);

  const updateEdgeData = useCallback((edgeId: string, data: any) => {
    setEdges((eds) =>
      eds.map((e) =>
        e.id === edgeId
          ? { ...e, data: { ...e.data, ...data } }
          : e
      )
    );
  }, [setEdges]);

  const clearFlow = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelectedAgent(null);
    setSelectedNodeForSettings(null);
  }, [setNodes, setEdges]);

  const softReset = useCallback(() => {
    // Reset node statuses without clearing
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          status: 'pending',
          output: '',
          error: null,
        },
      }))
    );
    // Reset edge animations
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        animated: false,
        data: {
          ...e.data,
          isActive: false,
        },
      }))
    );
  }, [setNodes, setEdges]);

  const handleEdgePathHighlight = useCallback((edgeId: string, source: string, target: string) => {
    const connectedNodes = new Set<string>([source, target]);
    const connectedEdges = new Set<string>([edgeId]);

    // Find all connected nodes and edges
    let changed = true;
    while (changed) {
      changed = false;
      edges.forEach((edge) => {
        if (connectedNodes.has(edge.source) && !connectedNodes.has(edge.target)) {
          connectedNodes.add(edge.target);
          connectedEdges.add(edge.id);
          changed = true;
        } else if (connectedNodes.has(edge.target) && !connectedNodes.has(edge.source)) {
          connectedNodes.add(edge.source);
          connectedEdges.add(edge.id);
          changed = true;
        }
      });
    }

    // Highlight connected, dim others
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          highlighted: connectedNodes.has(n.id),
        },
        style: {
          ...n.style,
          opacity: connectedNodes.has(n.id) ? 1 : 0.3,
        },
      }))
    );

    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        data: {
          ...e.data,
          highlighted: connectedEdges.has(e.id),
        },
        style: {
          ...e.style,
          opacity: connectedEdges.has(e.id) ? 1 : 0.3,
        },
      }))
    );

    // Clear highlights after 3 seconds
    setTimeout(() => {
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: { ...n.data, highlighted: false },
          style: { ...n.style, opacity: 1 },
        }))
      );
      setEdges((eds) =>
        eds.map((e) => ({
          ...e,
          data: { ...e.data, highlighted: false },
          style: { ...e.style, opacity: 1 },
        }))
      );
    }, 3000);
  }, [edges, setNodes, setEdges]);

  return {
    nodes,
    setNodes,
    onNodesChange,
    edges,
    setEdges,
    onEdgesChange,
    selectedAgent,
    setSelectedAgent,
    selectedNodeForSettings,
    setSelectedNodeForSettings,
    highlightPath,
    setHighlightPath,
    preventRerender,
    onConnect,
    addNode,
    deleteNode,
    updateNodeData,
    updateEdgeData,
    clearFlow,
    softReset,
    handleEdgePathHighlight,
  };
};