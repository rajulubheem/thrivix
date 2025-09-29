import { useCallback } from 'react';
import { Node, Edge } from 'reactflow';

interface UseWorkflowExecutionProps {
  nodes: Node[];
  edges: Edge[];
  sendMessage: (message: any) => void;
  clearFrames: () => void;
  setIsExecuting: (value: boolean) => void;
  setExecutionState: (value: any) => void;
  setNodes: (value: any) => void;
  isConnected: boolean;
}

export const useWorkflowExecution = ({
  nodes,
  edges,
  sendMessage,
  clearFrames,
  setIsExecuting,
  setExecutionState,
  setNodes,
  isConnected,
}: UseWorkflowExecutionProps) => {
  const handleExecute = useCallback(() => {
    if (!isConnected) {
      console.warn('WebSocket not connected');
      return;
    }

    setIsExecuting(true);
    clearFrames();

    const workflowData = {
      nodes: nodes.map((node) => ({
        id: node.id,
        type: node.data.type || node.data.nodeType,
        data: {
          ...node.data,
          position: node.position,
        },
      })),
      edges: edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        data: edge.data,
      })),
    };

    sendMessage({
      type: 'execute_workflow',
      workflow: workflowData,
    });
  }, [isConnected, nodes, edges, sendMessage, clearFrames, setIsExecuting]);

  const handlePause = useCallback(() => {
    setIsExecuting(false);
    sendMessage({
      type: 'pause_workflow',
    });
  }, [sendMessage, setIsExecuting]);

  const handleReset = useCallback(() => {
    setIsExecuting(false);
    clearFrames();
    setExecutionState({
      currentState: '',
      status: 'idle',
      states: {},
      transitions: [],
    });
    // Reset node states
    setNodes((nds: Node[]) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          status: 'idle',
        },
      }))
    );
  }, [clearFrames, setExecutionState, setNodes, setIsExecuting]);

  const handleSave = useCallback(() => {
    const data = {
      nodes,
      edges,
      timestamp: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflow.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges]);

  const handleLoad = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target?.result as string);
            if (data.nodes && data.edges) {
              setNodes(data.nodes);
              // setEdges would be called from parent
            }
          } catch (error) {
            console.error('Error loading workflow:', error);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, [setNodes]);

  return {
    handleExecute,
    handlePause,
    handleReset,
    handleSave,
    handleLoad,
  };
};