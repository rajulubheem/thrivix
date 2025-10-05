import { useEffect } from 'react';
import { FrameHandlers } from './websocket/frameHandlers';

export const useFlowSwarmEffects = (state: any, handlers: any) => {
  const {
    nodes, setNodes,
    edges, setEdges,
    agents,
    history, setHistory,
    historyIndex, setHistoryIndex,
    outputPanelWidth, setOutputPanelWidth,
    isInteracting,
    layoutDirection,
    isDarkMode,
    highlightPath,
    followActive,
    executionTrace,
    replayMode,
    replayIndex, setReplayIndex,
    selectedTools,
    selectedAgent, setSelectedAgent,
    childrenOverrides, setChildrenOverrides,
    availableTools, setAvailableTools,
    toolDetails, setToolDetails,
    setToolsLoading,
    connectionStatus, setConnectionStatus,
    showUnifiedManager, setShowUnifiedManager,
    pendingFocusIdRef,
    focusAttemptsRef,
    followActiveRef,
    layoutCache,
    preventRerender,
    updateTimer,
    wsRef,
    frameHandlersRef,
    frameHandlerContext,
    setCenter,
  } = state;

  const {
    undo,
    redo,
    updateGraph,
    clearPathHighlight,
  } = handlers;

  // Initialize history when nodes or edges are first loaded
  useEffect(() => {
    if (nodes.length > 0 || edges.length > 0) {
      if (history.length === 0) {
        setHistory([{ nodes, edges }]);
        setHistoryIndex(0);
      }
    }
  }, [nodes.length, edges.length, history.length, setHistory, setHistoryIndex]);

  // Focus loop: tries a few times until node dimensions are known
  useEffect(() => {
    let t: any;
    const tick = () => {
      const id = pendingFocusIdRef.current;
      if (!id || !followActive) return;
      const node = (layoutCache.current.nodes as any[]).find((n: any) => n.id === id) || nodes.find((n: any) => n.id === id);
      if (node) {
        const width = (node as any).width || 0;
        const height = (node as any).height || 0;
        const cx = node.position.x + (width || 280) / 2;
        const cy = node.position.y + (height || 140) / 2;
        const ready = width > 0 && height > 0;
        setCenter(cx, cy, { zoom: 0.95, duration: ready ? 320 : 200 });
        if (ready) {
          pendingFocusIdRef.current = null;
          return;
        }
      }
      focusAttemptsRef.current += 1;
      if (focusAttemptsRef.current < 10) {
        t = setTimeout(tick, 120);
      } else {
        pendingFocusIdRef.current = null;
      }
    };
    if (pendingFocusIdRef.current) {
      t = setTimeout(tick, 60);
    }
    return () => { if (t) clearTimeout(t); };
  }, [nodes, setCenter, followActive, pendingFocusIdRef, focusAttemptsRef, layoutCache]);

  // Debounced graph updates
  useEffect(() => {
    if (updateTimer.current) clearTimeout(updateTimer.current);

    updateTimer.current = setTimeout(() => {
      if (!preventRerender.current && !isInteracting) {
        updateGraph();
      }
    }, 150);

    return () => {
      if (updateTimer.current) clearTimeout(updateTimer.current);
    };
  }, [agents, updateGraph, isInteracting, preventRerender, updateTimer]);

  // Force update all nodes when theme changes
  useEffect(() => {
    setNodes((prev: any) => prev.map((node: any) => ({
      ...node,
      data: {
        ...node.data,
        isDarkMode,
        _themeUpdate: Date.now(),
      },
    })));
    setEdges((prev: any) => prev.map((edge: any) => ({
      ...edge,
      data: {
        ...edge.data,
        isDarkMode,
      },
    })));
  }, [isDarkMode, setNodes, setEdges]);

  // Load tools (once)
  useEffect(() => {
    (async () => {
      try {
        setToolsLoading(true);
        const res = await fetch(`${window.location.origin}/api/v1/dynamic-tools/available`);
        if (res.ok) {
          const data = await res.json();
          const names: string[] = (data.tools || []).map((t: any) => t.name);
          const details: Record<string, { description?: string; category?: string }> = {};
          (data.tools || []).forEach((t: any) => {
            details[t.name] = { description: t.description, category: (t.capabilities || [])[0] };
          });
          setAvailableTools(names);
          setToolDetails(details);
          try {
            const rawSel = localStorage.getItem('flowswarm_selected_tools');
            if (rawSel) state.setSelectedTools(new Set(JSON.parse(rawSel)));
          } catch {}
        }
      } finally {
        setToolsLoading(false);
      }
    })();
  }, [setToolsLoading, setAvailableTools, setToolDetails]);

  // Keyboard shortcuts for undo/redo and block manager
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + B to open Block Manager
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setShowUnifiedManager(true);
      }

      // Cmd/Ctrl + Z for undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      // Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y for redo
      if (((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') ||
          ((e.metaKey || e.ctrlKey) && e.key === 'y')) {
        e.preventDefault();
        redo();
      }
    };

    const handleResetPanelWidth = () => {
      setOutputPanelWidth(500);
    };

    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('resetPanelWidth', handleResetPanelWidth);

    return () => {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('resetPanelWidth', handleResetPanelWidth);
    };
  }, [undo, redo, setShowUnifiedManager, setOutputPanelWidth]);

  // Keyboard shortcuts for replay navigation and panel resizing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Panel resize shortcuts
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '[') {
          e.preventDefault();
          setOutputPanelWidth((prev: number) => Math.max(300, prev - 50));
        } else if (e.key === ']') {
          e.preventDefault();
          setOutputPanelWidth((prev: number) => Math.min(800, prev + 50));
        } else if (e.key === '\\') {
          e.preventDefault();
          setOutputPanelWidth((prev: number) => prev <= 350 ? 500 : 300);
        } else if (e.key === '/') {
          e.preventDefault();
          state.setShowConversationPanel((prev: boolean) => !prev);
        }
      }

      // Replay navigation
      if (!replayMode) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (executionTrace.length === 0) return;
        setReplayIndex((i: number | null) => {
          const next = Math.max(0, (i ?? 0) - 1);
          const id = executionTrace[next];
          if (id) { setSelectedAgent(id); pendingFocusIdRef.current = id; focusAttemptsRef.current = 0; }
          return next;
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (executionTrace.length === 0) return;
        setReplayIndex((i: number | null) => {
          const next = Math.min(executionTrace.length - 1, (i ?? 0) + 1);
          const id = executionTrace[next];
          if (id) { setSelectedAgent(id); pendingFocusIdRef.current = id; focusAttemptsRef.current = 0; }
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [replayMode, executionTrace, setReplayIndex, setSelectedAgent, pendingFocusIdRef, focusAttemptsRef, setOutputPanelWidth]);

  // Persist tool preferences
  useEffect(() => {
    try { localStorage.setItem('flowswarm_selected_tools', JSON.stringify(Array.from(selectedTools))); } catch {}
  }, [selectedTools]);

  // Persist chatbot panel width
  useEffect(() => {
    try { localStorage.setItem('chatbot_panel_width', outputPanelWidth.toString()); } catch {}
  }, [outputPanelWidth]);

  // Load saved parallel children overrides once
  useEffect(() => {
    try {
      const raw = localStorage.getItem('flowswarm_parallel_children');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') setChildrenOverrides(parsed);
      }
    } catch {}
  }, [setChildrenOverrides]);

  // Persist parallel children overrides on change
  useEffect(() => {
    try { localStorage.setItem('flowswarm_parallel_children', JSON.stringify(childrenOverrides)); } catch {}
  }, [childrenOverrides]);

  // Update connection status handler
  useEffect(() => {
    const checkConnection = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        setConnectionStatus('connected');
      } else if (wsRef.current?.readyState === WebSocket.CONNECTING) {
        setConnectionStatus('connecting');
      } else {
        setConnectionStatus('disconnected');
      }
    };

    const interval = setInterval(checkConnection, 1000);
    return () => clearInterval(interval);
  }, [wsRef, setConnectionStatus]);

  // Update frame handlers when context changes
  useEffect(() => {
    frameHandlersRef.current = new FrameHandlers(frameHandlerContext);
  }, [nodes, state.executionHistory, state.executionOrderCounter, layoutDirection, isDarkMode, frameHandlersRef, frameHandlerContext]);

  // Keep followActiveRef in sync
  useEffect(() => { 
    followActiveRef.current = followActive; 
  }, [followActive, followActiveRef]);

  // Enhanced path highlighting for state machine visualization
  useEffect(() => {
    if (preventRerender.current) return;

    if (!highlightPath || !selectedAgent) {
      if (!highlightPath) {
        setEdges((prev: any) => prev.map((e: any) => {
          if (!e.data?.dimmed) return e;
          return {
            ...e,
            data: { ...e.data, dimmed: false },
          };
        }));
        setNodes((prev: any) => prev.map((n: any) => {
          if (n.style?.opacity === 1) return n;
          return {
            ...n,
            style: { ...n.style, opacity: 1 },
          };
        }));
      }
      return;
    }

    const timeoutId = setTimeout(() => {
      const edgeSnapshot = layoutCache.current.edges.map((e: any) => ({
        id: e.id,
        source: e.source,
        target: e.target
      }));

      const connectedNodes = new Set<string>([selectedAgent]);
      const connectedEdges = new Set<string>();

      // Find downstream nodes
      let changed = true;
      let iterations = 0;
      while (changed && iterations < 100) {
        changed = false;
        iterations++;
        edgeSnapshot.forEach((edge: any) => {
          if (connectedNodes.has(edge.source) && !connectedNodes.has(edge.target)) {
            connectedNodes.add(edge.target);
            connectedEdges.add(edge.id);
            changed = true;
          }
        });
      }

      // Find upstream nodes
      changed = true;
      iterations = 0;
      while (changed && iterations < 100) {
        changed = false;
        iterations++;
        edgeSnapshot.forEach((edge: any) => {
          if (connectedNodes.has(edge.target) && !connectedNodes.has(edge.source)) {
            connectedNodes.add(edge.source);
            connectedEdges.add(edge.id);
            changed = true;
          }
        });
      }

      preventRerender.current = true;

      setEdges((prev: any) => prev.map((e: any) => {
        const shouldDim = !connectedEdges.has(e.id) && !(e.source === selectedAgent || e.target === selectedAgent);
        if (e.data?.dimmed === shouldDim) return e;
        return {
          ...e,
          data: {
            ...e.data,
            dimmed: shouldDim,
          },
        };
      }));

      setNodes((prev: any) => prev.map((n: any) => {
        const targetOpacity = connectedNodes.has(n.id) ? 1 : 0.4;
        if (n.style?.opacity === targetOpacity) return n;
        return {
          ...n,
          style: {
            ...n.style,
            opacity: targetOpacity,
          },
        };
      }));

      setTimeout(() => {
        preventRerender.current = false;
      }, 50);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [highlightPath, selectedAgent, setEdges, setNodes, layoutCache, preventRerender]);

  // Keyboard shortcut for clearing path highlight
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && highlightPath) {
        e.preventDefault();
        clearPathHighlight();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [highlightPath, clearPathHighlight]);

  // Cleanup - disconnect WebSocket on unmount
  useEffect(() => {
    return () => {
      state.disconnectWebSocket();
    };
  }, [state.disconnectWebSocket]);
};