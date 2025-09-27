import { useCallback, useState } from 'react';
import { Node, Edge, Connection, addEdge } from 'reactflow';
import { v4 as uuidv4 } from 'uuid';

interface BlockOperationHooks {
  nodes: Node[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  selectedTools: string[];
  availableTools: string[];
}

export const useBlockOperations = ({
  nodes,
  edges,
  setNodes,
  setEdges,
  selectedTools,
  availableTools
}: BlockOperationHooks) => {
  const [copiedBlock, setCopiedBlock] = useState<Node | null>(null);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [connectionValidation, setConnectionValidation] = useState<{
    isValid: boolean;
    message?: string;
  }>({ isValid: true });

  // Add a new block to the flow
  const addBlock = useCallback((type: string, position: { x: number; y: number }) => {
    const newNode: Node = {
      id: uuidv4(),
      type: 'enhancedBlock',
      position,
      data: {
        type,
        name: `${type} Block ${nodes.length + 1}`,
        description: '',
        agent_role: type === 'analysis' ? 'Analyst' : 'Executor',
        tools: type === 'tool_call' ? selectedTools.slice(0, 2) : [],
        transitions: {
          success: null,
          failure: null
        },
        availableTools,
        onUpdate: (updates: any) => {
          setNodes((nds) =>
            nds.map((node) =>
              node.id === newNode.id
                ? { ...node, data: { ...node.data, ...updates } }
                : node
            )
          );
        },
        onDelete: () => deleteBlock(newNode.id),
        onDuplicate: () => duplicateBlock(newNode.id)
      }
    };

    setNodes((nds) => [...nds, newNode]);
    return newNode.id;
  }, [nodes, selectedTools, availableTools, setNodes]);

  // Delete a block
  const deleteBlock = useCallback((id: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
  }, [setNodes, setEdges]);

  // Duplicate a block
  const duplicateBlock = useCallback((id: string) => {
    const nodeToDuplicate = nodes.find((n) => n.id === id);
    if (!nodeToDuplicate) return;

    const newNode: Node = {
      ...nodeToDuplicate,
      id: uuidv4(),
      position: {
        x: nodeToDuplicate.position.x + 100,
        y: nodeToDuplicate.position.y + 100
      },
      data: {
        ...nodeToDuplicate.data,
        name: `${nodeToDuplicate.data.name} (Copy)`,
        onDelete: undefined,
        onDuplicate: undefined
      }
    };

    // Re-bind the callbacks with the new ID
    newNode.data.onDelete = () => deleteBlock(newNode.id);
    newNode.data.onDuplicate = () => duplicateBlock(newNode.id);

    setNodes((nds) => [...nds, newNode]);
    return newNode.id;
  }, [nodes, setNodes, deleteBlock]);

  // Update block data
  const updateBlockData = useCallback((id: string, updates: any) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, ...updates } }
          : node
      )
    );
  }, [setNodes]);

  // Connect blocks with validation
  const onConnect = useCallback((params: Connection) => {
    // Validate connection
    const sourceNode = nodes.find((n) => n.id === params.source);
    const targetNode = nodes.find((n) => n.id === params.target);

    if (!sourceNode || !targetNode) {
      setConnectionValidation({
        isValid: false,
        message: 'Invalid connection: Node not found'
      });
      return;
    }

    // Check for circular dependencies
    if (params.source === params.target) {
      setConnectionValidation({
        isValid: false,
        message: 'Cannot connect a block to itself'
      });
      return;
    }

    // Check if connection already exists
    const existingConnection = edges.find(
      (e) => e.source === params.source && e.target === params.target
    );
    if (existingConnection) {
      setConnectionValidation({
        isValid: false,
        message: 'Connection already exists'
      });
      return;
    }

    // Add the edge with metadata
    const newEdge: Edge = {
      ...params,
      id: uuidv4(),
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#94A3B8', strokeWidth: 2 },
      data: {
        sourceType: sourceNode.data.type,
        targetType: targetNode.data.type
      }
    } as Edge;

    setEdges((eds) => addEdge(newEdge, eds));

    // Update source node transitions
    if (params.sourceHandle === 'true' || params.sourceHandle === 'false') {
      updateBlockData(params.source!, {
        transitions: {
          ...sourceNode.data.transitions,
          [params.sourceHandle]: params.target
        }
      });
    } else {
      updateBlockData(params.source!, {
        transitions: {
          ...sourceNode.data.transitions,
          success: params.target
        }
      });
    }

    setConnectionValidation({ isValid: true });
  }, [nodes, edges, setEdges, updateBlockData]);

  // Auto-connect to nearest compatible block
  const autoConnect = useCallback((nodeId: string) => {
    const currentNode = nodes.find((n) => n.id === nodeId);
    if (!currentNode) return;

    // Find nearest compatible node
    let nearestNode: Node | null = null;
    let minDistance = Infinity;

    nodes.forEach((node) => {
      if (node.id === nodeId) return;

      // Calculate distance
      const dx = node.position.x - currentNode.position.x;
      const dy = node.position.y - currentNode.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Check if this node is to the right and closer
      if (dx > 50 && distance < minDistance) {
        minDistance = distance;
        nearestNode = node;
      }
    });

    if (nearestNode && minDistance < 300) {
      const targetNode = nearestNode as Node; // Type assertion to fix TypeScript issue
      onConnect({
        source: nodeId,
        target: targetNode.id,
        sourceHandle: 'source',
        targetHandle: 'target'
      });
    }
  }, [nodes, onConnect]);

  // Rearrange blocks in a grid
  const arrangeBlocks = useCallback(() => {
    const GRID_SIZE = 200;
    const BLOCKS_PER_ROW = 4;

    const arrangedNodes = nodes.map((node, index) => {
      const row = Math.floor(index / BLOCKS_PER_ROW);
      const col = index % BLOCKS_PER_ROW;

      return {
        ...node,
        position: {
          x: col * GRID_SIZE + 100,
          y: row * GRID_SIZE + 100
        }
      };
    });

    setNodes(arrangedNodes);
  }, [nodes, setNodes]);

  // Copy block to clipboard
  const copyBlock = useCallback((id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (node) {
      setCopiedBlock(node);
      // Could also copy to system clipboard
      navigator.clipboard.writeText(JSON.stringify({
        type: node.data.type,
        name: node.data.name,
        description: node.data.description,
        tools: node.data.tools,
        transitions: node.data.transitions
      }));
    }
  }, [nodes]);

  // Paste block from clipboard
  const pasteBlock = useCallback((position: { x: number; y: number }) => {
    if (copiedBlock) {
      const newNode: Node = {
        ...copiedBlock,
        id: uuidv4(),
        position,
        data: {
          ...copiedBlock.data,
          name: `${copiedBlock.data.name} (Pasted)`
        }
      };

      // Re-bind callbacks
      newNode.data.onDelete = () => deleteBlock(newNode.id);
      newNode.data.onDuplicate = () => duplicateBlock(newNode.id);
      newNode.data.onUpdate = (updates: any) => updateBlockData(newNode.id, updates);

      setNodes((nds) => [...nds, newNode]);
      return newNode.id;
    }
    return null;
  }, [copiedBlock, setNodes, deleteBlock, duplicateBlock, updateBlockData]);

  // Group blocks into a subflow
  const groupBlocks = useCallback((blockIds: string[]) => {
    const blocksToGroup = nodes.filter((n) => blockIds.includes(n.id));
    if (blocksToGroup.length < 2) return;

    // Calculate bounding box
    const minX = Math.min(...blocksToGroup.map((n) => n.position.x));
    const minY = Math.min(...blocksToGroup.map((n) => n.position.y));
    const maxX = Math.max(...blocksToGroup.map((n) => n.position.x + 320));
    const maxY = Math.max(...blocksToGroup.map((n) => n.position.y + 120));

    // Create container node
    const containerNode: Node = {
      id: uuidv4(),
      type: 'subflowNode',
      position: { x: minX - 20, y: minY - 20 },
      data: {
        type: 'parallel',
        name: `Group ${nodes.length + 1}`,
        width: maxX - minX + 40,
        height: maxY - minY + 40,
        children: blockIds
      }
    };

    // Update children to be relative to container
    const updatedNodes = nodes.map((node) => {
      if (blockIds.includes(node.id)) {
        return {
          ...node,
          parentNode: containerNode.id,
          extent: 'parent' as const,
          position: {
            x: node.position.x - minX + 20,
            y: node.position.y - minY + 20
          }
        };
      }
      return node;
    });

    setNodes([...updatedNodes, containerNode]);
    return containerNode.id;
  }, [nodes, setNodes]);

  // Ungroup blocks from a subflow
  const ungroupBlocks = useCallback((containerId: string) => {
    const container = nodes.find((n) => n.id === containerId);
    if (!container || !container.data.children) return;

    const updatedNodes = nodes
      .filter((n) => n.id !== containerId)
      .map((node) => {
        if (container.data.children.includes(node.id)) {
          return {
            ...node,
            parentNode: undefined,
            extent: undefined,
            position: {
              x: container.position.x + node.position.x,
              y: container.position.y + node.position.y
            }
          };
        }
        return node;
      });

    setNodes(updatedNodes);
  }, [nodes, setNodes]);

  // Handle node drag for visual feedback
  const onNodeDragStart = useCallback((_: any, node: Node) => {
    setDraggedNodeId(node.id);
  }, []);

  const onNodeDragStop = useCallback(() => {
    setDraggedNodeId(null);
  }, []);

  return {
    // State
    connectionValidation,
    draggedNodeId,
    copiedBlock,

    // Operations
    addBlock,
    deleteBlock,
    duplicateBlock,
    updateBlockData,
    onConnect,
    autoConnect,
    arrangeBlocks,
    copyBlock,
    pasteBlock,
    groupBlocks,
    ungroupBlocks,
    onNodeDragStart,
    onNodeDragStop
  };
};