import { useEffect, useRef, useCallback } from 'react';
import { useReactFlow, Node } from 'reactflow';
import { NodeData } from '../types/FlowTypes';

interface CameraFollowOptions {
  enabled: boolean;
  padding?: number;
  duration?: number;
  maxZoom?: number;
}

export const useCameraFollow = (options: CameraFollowOptions) => {
  const { enabled, padding = 0.3, duration = 400, maxZoom = 1.2 } = options;
  const { fitView, setCenter, getZoom, getNode } = useReactFlow();
  const lastFocusedNode = useRef<string | null>(null);

  const focusNode = useCallback(
    (nodeId: string, animate = true) => {
      const node = getNode(nodeId);
      if (!node) return;

      const currentZoom = getZoom();
      const targetZoom = Math.min(currentZoom, maxZoom);

      setCenter(
        node.position.x + (node.width || 200) / 2,
        node.position.y + (node.height || 100) / 2,
        {
          zoom: targetZoom,
          duration: animate ? duration : 0,
        }
      );

      // Add pulse effect to the focused node
      const nodeElement = document.querySelector(`[data-id="${nodeId}"]`);
      if (nodeElement) {
        nodeElement.classList.add('node-pulse');
        setTimeout(() => {
          nodeElement.classList.remove('node-pulse');
        }, 1000);
      }

      lastFocusedNode.current = nodeId;
    },
    [setCenter, getZoom, getNode, duration, maxZoom]
  );

  const followRunningNode = useCallback(
    (nodes: Node<NodeData>[]) => {
      if (!enabled) return;

      // Find the first running node
      const runningNode = nodes.find(node => node.data?.status === 'running');
      
      if (runningNode && runningNode.id !== lastFocusedNode.current) {
        focusNode(runningNode.id);
      }
    },
    [enabled, focusNode]
  );

  const fitViewToNodes = useCallback(
    (nodeIds?: string[]) => {
      if (nodeIds && nodeIds.length > 0) {
        fitView({
          padding,
          duration,
          maxZoom,
          nodes: nodeIds.map(id => ({ id })) as any,
        });
      } else {
        fitView({ padding, duration, maxZoom });
      }
    },
    [fitView, padding, duration, maxZoom]
  );

  return {
    focusNode,
    followRunningNode,
    fitViewToNodes,
  };
};