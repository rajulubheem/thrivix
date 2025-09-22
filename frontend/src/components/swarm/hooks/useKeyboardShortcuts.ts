import { useEffect, useCallback } from 'react';
import { useReactFlow } from 'reactflow';

interface KeyboardShortcutsProps {
  onToggleGrid?: () => void;
  onToggleMinimap?: () => void;
  onToggleFollowExecution?: () => void;
  onAutoLayout?: () => void;
  onDeleteSelected?: () => void;
  onClearSelection?: () => void;
}

export const useKeyboardShortcuts = ({
  onToggleGrid,
  onToggleMinimap,
  onToggleFollowExecution,
  onAutoLayout,
  onDeleteSelected,
  onClearSelection,
}: KeyboardShortcutsProps) => {
  const { fitView, getNodes, setNodes } = useReactFlow();

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement
    ) {
      return;
    }

    const key = event.key.toLowerCase();
    const isMeta = event.metaKey || event.ctrlKey;
    const isShift = event.shiftKey;

    // F - Fit view
    if (key === 'f' && !isMeta && !isShift) {
      event.preventDefault();
      fitView({ padding: 0.3, duration: 400, maxZoom: 1 });
    }

    // L - Auto-layout
    if (key === 'l' && !isMeta && !isShift) {
      event.preventDefault();
      onAutoLayout?.();
    }

    // G - Toggle grid
    if (key === 'g' && !isMeta && !isShift) {
      event.preventDefault();
      onToggleGrid?.();
    }

    // M - Toggle minimap
    if (key === 'm' && !isMeta && !isShift) {
      event.preventDefault();
      onToggleMinimap?.();
    }

    // Escape - Clear selection
    if (key === 'escape') {
      event.preventDefault();
      onClearSelection?.();
      // Also clear React Flow selection
      setNodes((nodes) =>
        nodes.map((node) => ({
          ...node,
          selected: false,
        }))
      );
    }

    // Delete/Backspace - Delete selected (with confirmation)
    if ((key === 'delete' || key === 'backspace') && !isMeta) {
      const selectedNodes = getNodes().filter((node) => node.selected);
      if (selectedNodes.length > 0) {
        event.preventDefault();
        onDeleteSelected?.();
      }
    }

    // Space - Toggle follow execution
    if (key === ' ' && !isMeta && !isShift) {
      const activeElement = document.activeElement;
      // Don't prevent space in buttons or interactive elements
      if (
        activeElement?.tagName !== 'BUTTON' &&
        activeElement?.tagName !== 'A' &&
        !activeElement?.classList.contains('react-flow__node')
      ) {
        event.preventDefault();
        onToggleFollowExecution?.();
      }
    }

    // Cmd/Ctrl + A - Select all nodes
    if (key === 'a' && isMeta) {
      event.preventDefault();
      setNodes((nodes) =>
        nodes.map((node) => ({
          ...node,
          selected: true,
        }))
      );
    }

    // Cmd/Ctrl + D - Deselect all
    if (key === 'd' && isMeta) {
      event.preventDefault();
      setNodes((nodes) =>
        nodes.map((node) => ({
          ...node,
          selected: false,
        }))
      );
    }

    // ? or H - Show help (future feature)
    if ((key === '?' || key === 'h') && !isMeta) {
      event.preventDefault();
      console.log(`
        Keyboard Shortcuts:
        F - Fit view
        L - Auto-layout
        G - Toggle grid
        M - Toggle minimap
        Space - Toggle follow execution
        Escape - Clear selection
        Delete - Delete selected nodes
        Cmd/Ctrl + A - Select all
        Cmd/Ctrl + D - Deselect all
      `);
    }
  }, [
    fitView,
    getNodes,
    setNodes,
    onToggleGrid,
    onToggleMinimap,
    onToggleFollowExecution,
    onAutoLayout,
    onDeleteSelected,
    onClearSelection,
  ]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return {
    shortcuts: {
      fitView: 'F',
      autoLayout: 'L',
      toggleGrid: 'G',
      toggleMinimap: 'M',
      toggleFollow: 'Space',
      clearSelection: 'Esc',
      deleteSelected: 'Delete',
      selectAll: 'Cmd/Ctrl+A',
      deselectAll: 'Cmd/Ctrl+D',
    },
  };
};