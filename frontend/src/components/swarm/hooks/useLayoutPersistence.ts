import { useCallback, useEffect } from 'react';
import { Node, useReactFlow } from 'reactflow';
import { PersistedLayout } from '../types/FlowTypes';

const STORAGE_KEY = 'flow-swarm-layouts';
const MAX_STORED_LAYOUTS = 10;

export const useLayoutPersistence = (executionId: string | null) => {
  const { getNodes, setNodes, getViewport, setViewport } = useReactFlow();

  // Save current layout to localStorage
  const saveLayout = useCallback(() => {
    if (!executionId) return;

    const nodes = getNodes();
    const viewport = getViewport();
    
    const layout: PersistedLayout = {
      executionId,
      nodes: nodes.map(node => ({
        id: node.id,
        position: node.position,
      })),
      viewport,
      timestamp: Date.now(),
    };

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const layouts: PersistedLayout[] = stored ? JSON.parse(stored) : [];
      
      // Remove old layout for same execution
      const filtered = layouts.filter(l => l.executionId !== executionId);
      
      // Add new layout
      filtered.unshift(layout);
      
      // Keep only recent layouts
      const trimmed = filtered.slice(0, MAX_STORED_LAYOUTS);
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (error) {
      console.error('Failed to save layout:', error);
    }
  }, [executionId, getNodes, getViewport]);

  // Load layout from localStorage
  const loadLayout = useCallback(() => {
    if (!executionId) return false;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return false;

      const layouts: PersistedLayout[] = JSON.parse(stored);
      const layout = layouts.find(l => l.executionId === executionId);
      
      if (!layout) return false;

      // Apply positions to existing nodes
      setNodes((nodes) =>
        nodes.map(node => {
          const saved = layout.nodes.find(n => n.id === node.id);
          if (saved) {
            return {
              ...node,
              position: saved.position,
            };
          }
          return node;
        })
      );

      // Restore viewport if available
      if (layout.viewport) {
        setTimeout(() => {
          setViewport(layout.viewport!);
        }, 100);
      }

      return true;
    } catch (error) {
      console.error('Failed to load layout:', error);
      return false;
    }
  }, [executionId, setNodes, setViewport]);

  // Clear stored layouts
  const clearLayouts = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear layouts:', error);
    }
  }, []);

  // Auto-save on node position changes
  useEffect(() => {
    const handleNodeDragStop = () => {
      saveLayout();
    };

    // Listen for node drag events
    const nodeElements = document.querySelectorAll('.react-flow__node');
    nodeElements.forEach(node => {
      node.addEventListener('mouseup', handleNodeDragStop);
      node.addEventListener('touchend', handleNodeDragStop);
    });

    return () => {
      nodeElements.forEach(node => {
        node.removeEventListener('mouseup', handleNodeDragStop);
        node.removeEventListener('touchend', handleNodeDragStop);
      });
    };
  }, [saveLayout]);

  return {
    saveLayout,
    loadLayout,
    clearLayouts,
  };
};