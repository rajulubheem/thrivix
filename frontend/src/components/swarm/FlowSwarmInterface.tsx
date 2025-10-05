import React from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ConnectionMode,
  Connection,
  ConnectionLineType,
  BackgroundVariant,
  MarkerType,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './FlowSwarmInterface.css';
import { useFlowSwarmState } from './FlowSwarmState';
import { useFlowSwarmHandlers } from './FlowSwarmHandlers';
import { useFlowSwarmEffects } from './FlowSwarmEffects';
import { useFlowSwarmWorkflow } from './FlowSwarmWorkflow';
import { WorkflowToolbar } from './components/WorkflowToolbar';
import UnifiedBlockManager from './components/UnifiedBlockManager';
import BlockSettingsPanel from './components/BlockSettingsPanel';
import { FlowControlsPanel } from './components/FlowControlsPanel';
import { ExecutionControlBar } from './components/ExecutionControlBar';
import { ImportStateMachineDialog } from './components/ImportStateMachineDialog';
import { ParallelGroupOverlay } from './components/ParallelGroupOverlay';
import { ParallelChildrenEditor } from './components/ParallelChildrenEditor';
import { AgentConversationPanel } from './components/AgentConversationPanel';
import { AIWorkflowChat } from './components/AIWorkflowChat';
import { v4 as uuidv4 } from 'uuid';

const FlowSwarmInterface: React.FC = () => {
  // Initialize all state
  const state = useFlowSwarmState();
  
  // Initialize all handlers
  const handlers = useFlowSwarmHandlers(state);
  
  // Initialize workflow operations
  const workflow = useFlowSwarmWorkflow(state, handlers);
  
  // Initialize all effects
  useFlowSwarmEffects(state, handlers);

  // Destructure what we need for JSX
  const {
    nodes, setNodes, onNodesChange,
    edges, setEdges, onEdgesChange,
    task, setTask,
    isRunning,
    executionId,
    connectionStatus,
    executionMode, setExecutionMode,
    outputPanelWidth,
    layoutDirection,
    showGrid,
    showMinimap,
    showConversationPanel,
    highlightPath,
    showToolsHub, setShowToolsHub,
    showAIChat, setShowAIChat,
    decisionPrompt, setDecisionPrompt,
    inputPrompt, setInputPrompt,
    inputValue, setInputValue,
    showAddNode, setShowAddNode,
    showImportDialog, setShowImportDialog,
    showUnifiedManager, setShowUnifiedManager,
    selectedNodeForSettings, setSelectedNodeForSettings,
    showChildrenEditor, setShowChildrenEditor,
    editMode,
    nodeDraft, setNodeDraft,
    edgeEdit, setEdgeEdit,
    executionHistory,
    history,
    historyIndex,
    executionTrace,
    replayMode, setReplayMode,
    replayIndex, setReplayIndex,
    showRawDataViewer, setShowRawDataViewer,
    availableTools,
    selectedTools, setSelectedTools,
    toolSearch, setToolSearch,
    toolDetails,
    toolsLoading,
    toolPrefs,
    childrenOverrides, setChildrenOverrides,
    collapsedGroups, setCollapsedGroups,
    selectedAgent, setSelectedAgent,
    reactFlowWrapper,
    pendingFocusIdRef,
    focusAttemptsRef,
    isDarkMode,
    project,
    zoomIn, zoomOut,
    fitView,
    isExecuting,
  } = state;

  const {
    nodeTypes,
    edgeTypes,
    saveToHistory,
    undo,
    redo,
    updateGraph,
    onNodeClick,
    onNodeContextMenu,
    handleEdgePathHighlight,
    clearPathHighlight,
    handleAgentSelect,
    handleNodeFocus,
    stableAgents,
    stopExecution,
    rerunFromSelected,
    addAgentAndRerun,
    addUnifiedBlock,
  } = handlers;

  const {
    startExecution,
    importStateMachine,
    enhanceFlow,
    saveAsTemplate,
    loadTemplate,
    runPlannedWorkflow,
  } = workflow;

  return (
    <div className={`flow-swarm-container ${isDarkMode ? 'dark-mode' : 'light-mode'} ${isExecuting ? 'execution-mode' : ''}`}>
      {/* Tools Hub Modal */}
      {showToolsHub && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center'}} onClick={() => setShowToolsHub(false)}>
          <div style={{
            background: isDarkMode ? '#0f172a' : '#ffffff',
            color: isDarkMode ? '#e2e8f0' : '#1e293b',
            width: 720,
            maxHeight: '85vh',
            borderRadius: 12,
            padding: 24,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column' as const
          }} onClick={(e)=>e.stopPropagation()} onMouseDown={(e)=>e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Tool Selection</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: 14, color: isDarkMode ? '#94a3b8' : '#64748b' }}>
                  Choose which tools the AI can use. Leave empty to allow all tools.
                </p>
              </div>
              <button
                className="panel-button"
                onClick={()=>setShowToolsHub(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
                  background: isDarkMode ? '#1e293b' : '#f8fafc'
                }}
              >
                ✕ Close
              </button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <input
                className="task-input"
                placeholder="Search tools..."
                value={toolSearch}
                onChange={e=>setToolSearch(e.target.value)}
                style={{ width: '100%', marginBottom: 12 }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ color: '#64748b', fontSize: 14 }}>
                  {selectedTools.size > 0 ? `${selectedTools.size} tool${selectedTools.size === 1 ? '' : 's'} selected` : 'No tools selected (AI will use all available tools)'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="panel-button"
                    onClick={()=>setSelectedTools(new Set(availableTools))}
                    style={{ padding: '6px 12px', fontSize: 13 }}
                  >
                    Select All
                  </button>
                  <button
                    className="panel-button"
                    onClick={()=>setSelectedTools(new Set())}
                    style={{ padding: '6px 12px', fontSize: 13 }}
                  >
                    Clear All
                  </button>
                </div>
              </div>
            {(() => {
              const unknownSel = Array.from(selectedTools).filter(s => !availableTools.includes(s));
              if (unknownSel.length === 0) return null;
              return (
                <div style={{
                  marginBottom: 8,
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: '#3f1d1d',
                  color: '#fecaca',
                  border: '1px solid #7f1d1d'
                }}>
                  <div style={{ fontSize: 12 }}>These selected names are not registered tools and will be ignored at runtime:</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>{unknownSel.join(', ')}</div>
                </div>
              );
            })()}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              marginBottom: 16,
              border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
              borderRadius: 8,
              padding: 12
            }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 10 }}>
                {availableTools.filter(t => t.toLowerCase().includes(toolSearch.toLowerCase())).map(t => {
                  const isSelected = selectedTools.has(t);
                  return (
                    <div
                      key={t}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedTools(prev => {
                          const n = new Set(prev);
                          if (n.has(t)) n.delete(t); else n.add(t);
                          return n;
                        });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedTools(prev => {
                            const n = new Set(prev);
                            if (n.has(t)) n.delete(t); else n.add(t);
                            return n;
                          });
                        }
                      }}
                      style={{
                        border: `2px solid ${isSelected ? '#3b82f6' : isDarkMode ? '#334155' : '#e2e8f0'}`,
                        borderRadius: 10,
                        padding: 12,
                        display: 'flex',
                        gap: 12,
                        cursor: 'pointer',
                        background: isSelected
                          ? (isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)')
                          : 'transparent',
                        transition: 'all 0.2s',
                        position: 'relative' as const
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      <div style={{
                        width: 20,
                        height: 20,
                        border: `2px solid ${isSelected ? '#3b82f6' : isDarkMode ? '#475569' : '#cbd5e1'}`,
                        borderRadius: 4,
                        background: isSelected ? '#3b82f6' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'all 0.2s'
                      }}>
                        {isSelected && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{
                          fontWeight: 600,
                          fontSize: 14,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          color: isSelected ? '#3b82f6' : (isDarkMode ? '#f1f5f9' : '#1e293b')
                        }}>
                          {t}
                        </div>
                        {toolDetails[t]?.description && (
                          <div style={{
                            fontSize: 12,
                            color: isDarkMode ? '#94a3b8' : '#64748b',
                            marginTop: 2,
                            lineHeight: 1.4
                          }}>
                            {toolDetails[t]?.description}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {toolsLoading && <div>Loading tools…</div>}
              </div>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Decision Prompt Modal */}
      {decisionPrompt && (
        <div style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <div style={{ background: '#0f172a', color: '#e2e8f0', padding: 20, borderRadius: 8, width: 420 }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Choose next event</h3>
            <div style={{ fontWeight: 600 }}>{decisionPrompt.name}</div>
            {decisionPrompt.description && (
              <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>{decisionPrompt.description}</div>
            )}
            <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {decisionPrompt.allowed.map(ev => (
                <button key={ev} className="panel-button" onClick={async () => {
                  try {
                    if (!executionId) return;
                    await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/${executionId}/decision`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ state_id: decisionPrompt.stateId, event: ev })
                    });
                    setDecisionPrompt(null);
                  } catch (e) {
                    console.error('Failed to submit decision', e);
                  }
                }}>{ev}</button>
              ))}
            </div>
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <button className="panel-button" onClick={() => setDecisionPrompt(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Input Prompt Modal */}
      {inputPrompt && (
        <div style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <div style={{ background: '#0f172a', color: '#e2e8f0', padding: 20, borderRadius: 8, width: 520 }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Provide Input</h3>
            <div style={{ fontWeight: 600 }}>{inputPrompt.name}</div>
            {inputPrompt.description && (
              <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>{inputPrompt.description}</div>
            )}
            <div style={{ marginTop: 12 }}>
              <textarea
                className="task-input"
                style={{ width: '100%', height: 120 }}
                value={inputValue}
                onChange={(e)=>setInputValue(e.target.value)}
                placeholder="Type your input here..."
              />
            </div>
            <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {(inputPrompt.allowed || ['submitted']).map(ev => (
                  <button key={ev} className="panel-button" onClick={async () => {
                    try {
                      if (!executionId) return;
                      await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/${executionId}/decision`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ state_id: inputPrompt.stateId, event: ev, data: inputValue })
                      });
                      setInputPrompt(null);
                      setInputValue('');
                    } catch (e) {
                      console.error('Failed to submit input', e);
                    }
                  }}>{ev}</button>
                ))}
              </div>
              <div>
                <button className="panel-button" onClick={()=>{ setInputPrompt(null); setInputValue(''); }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flow-header">
        <div className="header-brand">
          <div className="brand-icon">⚡</div>
          <h1>Dynamic Agent Flow</h1>
          <div className={`connection-status ${connectionStatus}`}>
            <span className="status-dot" />
            <span>{connectionStatus}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flow-content">
        {/* Tool preferences banner */}
        {toolPrefs && (toolPrefs.unknown.length > 0) && (
          <div style={{
            margin: '4px 12px',
            padding: '4px 10px',
            borderRadius: 4,
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#fca5a5',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <span style={{ color: '#f87171' }}>⚠</span>
            <span>Unknown tools: <strong>{toolPrefs.unknown.join(', ')}</strong></span>
          </div>
        )}

        {/* Main Content Area */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* React Flow Graph */}
          <div className="flow-graph-panel" ref={reactFlowWrapper} onDrop={(event)=>{
            event.preventDefault();
            if (!editMode) return;

            const blockData = event.dataTransfer.getData('application/reactflow');
            const jsonData = event.dataTransfer.getData('application/json');

            if (!blockData) return;

            const bounds = reactFlowWrapper.current?.getBoundingClientRect();
            const pos = project({ x: event.clientX - (bounds?.left || 0), y: event.clientY - (bounds?.top || 0) });

            let parsedData: any = {};
            try {
              parsedData = JSON.parse(blockData);
            } catch (e) {
              parsedData = { type: blockData };
            }

            if (parsedData?.source === 'unified-block-manager' && parsedData.block) {
              addUnifiedBlock(parsedData.block, pos);
              return;
            }

            if (jsonData) {
              try {
                const additionalData = JSON.parse(jsonData);
                parsedData = { ...parsedData, ...additionalData };
              } catch (e) {}
            }

            if (parsedData.type === 'tool' && parsedData.toolName) {
              handlers.addToolBlock(parsedData.toolName, parsedData.schema, pos);
            } else if (parsedData.useEnhanced || jsonData) {
              handlers.addProfessionalBlock(parsedData.type || blockData, pos);
            } else {
              const blockType = parsedData.type || blockData;
              const id = `node_${Math.random().toString(36).slice(2,8)}`;
              const newNode: any = {
                id,
                type: 'agent',
                position: pos,
                data: { label: blockType, name: blockType, status:'pending', nodeType: blockType, direction: state.layoutDirection, toolsPlanned: [], isDarkMode },
                targetPosition: state.layoutDirection==='LR'? 'left': 'top',
                sourcePosition: state.layoutDirection==='LR'? 'right': 'bottom',
              };
              setNodes(nds=>nds.concat(newNode));
            }
          }} onDragOver={(e)=>{ e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}>
            <ReactFlow
              style={{ background: isDarkMode ? '#0a0f1a' : '#ffffff' }}
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={async (connection: Connection) => {
                if (!connection.source || !connection.target) return;

                let ev = 'success';
                if (connection.sourceHandle === 'failure' || connection.sourceHandle === 'false') {
                  ev = 'failure';
                } else if (connection.sourceHandle === 'retry') {
                  ev = 'retry';
                } else if (connection.sourceHandle === 'timeout') {
                  ev = 'timeout';
                } else if (connection.sourceHandle && connection.sourceHandle !== 'source' && connection.sourceHandle !== 'true') {
                  ev = connection.sourceHandle;
                }

                if (editMode) {
                  const customLabel = window.prompt('Enter connection label (e.g., success, failure, retry, timeout, or custom):', ev);
                  if (customLabel !== null) {
                    ev = customLabel || ev;
                  }
                }

                const existingEdge = edges.find(
                  e => e.source === connection.source &&
                       e.target === connection.target &&
                       (e as any).label === ev
                );
                if (existingEdge) {
                  console.warn('Edge already exists');
                  return;
                }

                const newEdge: any = {
                  id: `${connection.source}-${connection.target}-${ev}`,
                  source: connection.source,
                  target: connection.target,
                  sourceHandle: connection.sourceHandle,
                  targetHandle: connection.targetHandle,
                  type: 'editable',
                  animated: ev === 'success',
                  label: ev !== 'success' ? ev : '',
                  labelStyle: { fill: '#94a3b8', fontSize: 11 },
                  labelBgStyle: { fill: '#1e293b', fillOpacity: 0.8 },
                  style: {
                    stroke: ev === 'failure' ? '#ef4444' : ev === 'retry' ? '#f59e0b' : '#10b981',
                    strokeWidth: 2
                  },
                  markerEnd: {
                    type: MarkerType.ArrowClosed,
                    width: 20,
                    height: 20,
                    color: ev === 'failure' ? '#ef4444' : ev === 'retry' ? '#f59e0b' : '#10b981'
                  },
                };

                setEdges(eds => [...eds, newEdge]);

                if (executionId) {
                  try {
                    await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/${executionId}/update_graph`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ edges: [{ source: connection.source, target: connection.target, event: ev }] })
                    });
                  } catch (e) {
                    console.error('Failed to update backend graph', e);
                  }
                }
              }}
              onEdgeClick={(e, edge) => {
                e.stopPropagation();
                if (editMode && e.shiftKey) {
                  setEdgeEdit({ id: edge.id, source: edge.source, target: edge.target, event: (edge as any).label || 'success' });
                } else {
                  handleEdgePathHighlight(edge.id, edge.source, edge.target);
                }
              }}
              onNodeClick={onNodeClick}
              onNodeContextMenu={onNodeContextMenu}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              connectionMode={ConnectionMode.Loose}
              fitView={false}
              attributionPosition="bottom-left"
              minZoom={0.2}
              maxZoom={1.5}
              nodesDraggable={true}
              nodesConnectable={editMode}
              elementsSelectable={true}
              panOnScroll={true}
              panOnDrag={true}
              elevateNodesOnSelect={false}
              snapToGrid={true}
              snapGrid={[15, 15]}
              proOptions={{ hideAttribution: true }}
              deleteKeyCode={['Delete','Backspace']}
              onEdgeUpdate={async (oldEdge, newCon)=>{
                if (!editMode) return false;

                const ev = (oldEdge as any).label || 'success';

                setEdges(prev=>prev.filter(e=>e.id!==oldEdge.id).concat([{
                  ...oldEdge,
                  id: `${newCon.source}-${newCon.target}-${ev}`,
                  source: newCon.source!,
                  target: newCon.target!,
                  label: ev,
                  type: 'editable',
                  style: { ...oldEdge.style },
                  animated: false
                }] as any));

                if (executionId){
                  try{
                    await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/${executionId}/update_graph`, {
                      method:'POST',
                      headers:{'Content-Type':'application/json'},
                      body: JSON.stringify({
                        remove_edges:[{ source: oldEdge.source, target: oldEdge.target, event: ev }],
                        edges:[{ source: newCon.source, target: newCon.target, event: ev }]
                      })
                    });
                  }catch(e){ console.error('Edge update failed', e); }
                }
                return true;
              }}
              onNodeDragStart={() => {
                state.preventRerender.current = true;
                state.setIsInteracting(true);
              }}
              onNodeDragStop={() => {
                state.setIsInteracting(false);
                setTimeout(() => { state.preventRerender.current = false; }, 100);
              }}
              onMoveStart={() => {
                state.preventRerender.current = true;
                state.setIsInteracting(true);
              }}
              onMoveEnd={() => {
                state.setIsInteracting(false);
                setTimeout(() => { state.preventRerender.current = false; }, 100);
              }}
              defaultViewport={{ x: 0, y: 0, zoom: 0.75 }}
              onlyRenderVisibleElements
              edgeUpdaterRadius={10}
              edgesUpdatable={editMode}
              onNodesDelete={async (nds) => {
                if (!nds || !Array.isArray(nds) || nds.length === 0) return;

                try {
                  saveToHistory(nodes, edges);

                  const nodeIds = nds.map(n => n.id);

                  setNodes((currentNodes) => {
                    if (!currentNodes || !Array.isArray(currentNodes)) return [];
                    return currentNodes.filter(node => !nodeIds.includes(node.id));
                  });

                  setEdges((currentEdges) => {
                    if (!currentEdges || !Array.isArray(currentEdges)) return [];
                    return currentEdges.filter(edge =>
                      !nodeIds.includes(edge.source) && !nodeIds.includes(edge.target)
                    );
                  });

                  setSelectedAgent(null);
                  setSelectedNodeForSettings(null);

                  if (executionId) {
                    fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/${executionId}/update_graph`, {
                      method:'POST',
                      headers:{'Content-Type':'application/json'},
                      body: JSON.stringify({ remove_states: nodeIds })
                    }).catch(e => {
                      console.error('Remove states from backend failed', e);
                    });
                  }
                } catch (error) {
                  console.error('Error during node deletion:', error);
                  state.setEditMode(true);
                }
              }}
              onEdgesDelete={async (eds) => {
                if (!eds || !Array.isArray(eds) || eds.length === 0) return;

                try {
                  saveToHistory(nodes, edges);

                  const edgeIds = eds.map(e => e.id);

                  setEdges((currentEdges) => {
                    if (!currentEdges || !Array.isArray(currentEdges)) return [];
                    return currentEdges.filter(edge => !edgeIds.includes(edge.id));
                  });

                  if (executionId) {
                    const payload = {
                      remove_edges: eds.map((e:any) => ({
                        source: e.source,
                        target: e.target,
                        event: (e.label && typeof e.label === 'string' && e.label.length > 0) ? e.label : 'success'
                      }))
                    };

                    fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/${executionId}/update_graph`, {
                      method:'POST',
                      headers:{'Content-Type':'application/json'},
                      body: JSON.stringify(payload)
                    }).catch(e => {
                      console.error('Remove edges from backend failed', e);
                    });
                  }
                } catch (error) {
                  console.error('Error during edge deletion:', error);
                  state.setEditMode(true);
                }
              }}
              noDragClassName="nodrag"
              noPanClassName="nopan"
              defaultEdgeOptions={{
                type: 'animated',
                animated: false,
                style: {
                  stroke: isDarkMode ? '#475569' : '#cbd5e1',
                  strokeWidth: 2,
                },
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  width: 20,
                  height: 20,
                  color: isDarkMode ? '#475569' : '#cbd5e1',
                  orient: 'auto',
                },
              }}
              fitViewOptions={{
                padding: 0.3,
                maxZoom: 1.0,
                minZoom: 0.2,
                includeHiddenNodes: false,
              }}
              connectionLineType={ConnectionLineType.Bezier}
              connectionLineStyle={{
                stroke: isDarkMode ? '#4b5563' : '#d1d5db',
                strokeWidth: 2,
              }}
            >
              <ParallelGroupOverlay
                nodes={nodes}
                collapsedGroups={collapsedGroups}
                isDarkMode={isDarkMode}
              />
              <Background
                variant={showGrid ? BackgroundVariant.Lines : BackgroundVariant.Dots}
                gap={showGrid ? 16 : 24}
                size={showGrid ? 1.25 : 1.5}
                color={isDarkMode ? '#334155' : '#e5e7eb'}
              />
              <Controls showInteractive={true} position="bottom-left" />
              {showMinimap && <MiniMap position="bottom-right" pannable zoomable style={{ background: isDarkMode? '#0b1220':'#f8fafc' }} />}

              <ParallelChildrenEditor
                showChildrenEditor={showChildrenEditor}
                nodes={nodes}
                childrenOverrides={childrenOverrides}
                isDarkMode={isDarkMode}
                onClose={() => setShowChildrenEditor(null)}
                onChildrenChange={(nodeId, children) => {
                  setChildrenOverrides(prev => ({ ...prev, [nodeId]: children }));
                }}
              />

              <WorkflowToolbar
                onAddBlock={() => setShowUnifiedManager(true)}
                onArrangeBlocks={() => updateGraph(true)}
                onRunWorkflow={runPlannedWorkflow}
                onStopWorkflow={stopExecution}
                onClearHistory={handlers.clearExecutionHistory}
                onExportWorkflow={saveAsTemplate}
                onImportWorkflow={loadTemplate}
                onZoomIn={() => zoomIn()}
                onZoomOut={() => zoomOut()}
                onFitView={() => fitView({ padding: 0.3, duration: 400, maxZoom: 1.0 })}
                isRunning={isRunning}
                hasExecutionHistory={executionHistory.size > 0}
                availableTools={availableTools}
                selectedTools={selectedTools}
                onToolsChange={setSelectedTools}
                onEnhanceFlow={enhanceFlow}
                selectedNodes={nodes.filter(n => n.selected)}
                onImportTemplate={(template) => {
                  importStateMachine(template.machine, true);
                }}
              />

              <UnifiedBlockManager
                isOpen={showUnifiedManager}
                onClose={() => setShowUnifiedManager(false)}
                onAddBlock={addUnifiedBlock}
                isDarkMode={isDarkMode}
                selectedTools={selectedTools}
                onToolsChange={setSelectedTools}
              />

              <FlowControlsPanel
                historyIndex={historyIndex}
                historyLength={history.length}
                highlightPath={highlightPath}
                layoutDirection={layoutDirection}
                showGrid={showGrid}
                showMinimap={showMinimap}
                showConversationPanel={showConversationPanel}
                showRawDataViewer={showRawDataViewer}
                followActive={state.followActive}
                replayMode={replayMode}
                executionTraceLength={executionTrace.length}
                replayIndex={replayIndex}
                selectedAgent={selectedAgent}
                isDarkMode={isDarkMode}
                onUndo={undo}
                onRedo={redo}
                onClearPathHighlight={clearPathHighlight}
                onFitView={() => fitView({ padding: 0.3, duration: 400, maxZoom: 1.0 })}
                onRelayout={() => updateGraph(true)}
                onOpenBlockManager={() => setShowUnifiedManager(true)}
                onToggleLayoutDirection={() => {
                  state.setLayoutDirection(layoutDirection === 'LR' ? 'TB' : 'LR');
                  setTimeout(() => updateGraph(true), 50);
                }}
                onToggleGrid={() => state.setShowGrid(!showGrid)}
                onToggleMinimap={() => state.setShowMinimap(!showMinimap)}
                onToggleConversationPanel={() => state.setShowConversationPanel(!showConversationPanel)}
                onResetView={handlers.resetView}
                onOpenToolsHub={() => setShowToolsHub(true)}
                onToggleRawDataViewer={() => setShowRawDataViewer(!showRawDataViewer)}
                onToggleFollowActive={() => state.setFollowActive(prev => !prev)}
                onToggleReplayMode={() => {
                  setReplayMode(!replayMode);
                  setReplayIndex((prev: number | null) => (prev == null ? 0 : prev));
                }}
                onReplayPrevious={() => {
                  if (!replayMode || executionTrace.length === 0) return;
                  setReplayIndex((i: number | null) => {
                    const next = Math.max(0, (i ?? 0) - 1);
                    const id = executionTrace[next];
                    if (id) { setSelectedAgent(id); pendingFocusIdRef.current = id; focusAttemptsRef.current = 0; }
                    return next;
                  });
                }}
                onReplayNext={() => {
                  if (!replayMode || executionTrace.length === 0) return;
                  setReplayIndex((i: number | null) => {
                    const next = Math.min(executionTrace.length - 1, (i ?? 0) + 1);
                    const id = executionTrace[next];
                    if (id) { setSelectedAgent(id); pendingFocusIdRef.current = id; focusAttemptsRef.current = 0; }
                    return next;
                  });
                }}
                onToggleHighlightPath={() => {
                  state.preventRerender.current = true;
                  state.setHighlightPath(!highlightPath);
                  setTimeout(() => { state.preventRerender.current = false; }, 100);
                }}
                onRerunFromSelected={rerunFromSelected}
                onAddAgentAndRerun={addAgentAndRerun}
                executionId={executionId}
                nodes={nodes}
                collapsedGroups={collapsedGroups}
                onToggleCollapsedGroup={(id: string) => {
                  setCollapsedGroups(prev => ({ ...prev, [id]: !prev[id] }));
                  const children = (nodes.find(n => n.id === id)?.data as any)?.parallelChildren || [];
                  const childSet = new Set(children);
                  setNodes(nds => nds.map(n => childSet.has(n.id) ? ({ ...n, hidden: !collapsedGroups[id] ? true : false }) : n));
                  setEdges(eds => eds.map(e => childSet.has(e.source) || childSet.has(e.target) ? ({ ...e, style: { ...e.style, opacity: !collapsedGroups[id] ? 0.08 : 1 } }) : e));
                }}
                onShowChildrenEditor={(id: string) => setShowChildrenEditor(id)}
              />

              <ImportStateMachineDialog
                isOpen={showImportDialog}
                isDarkMode={isDarkMode}
                onClose={() => {
                  setShowImportDialog(false);
                }}
                onImport={(machine, isProfessional) => {
                  importStateMachine(machine, isProfessional);
                }}
              />
            </ReactFlow>
          </div>

          <AgentConversationPanel
            showConversationPanel={showConversationPanel}
            outputPanelWidth={outputPanelWidth}
            agents={stableAgents}
            nodes={nodes}
            edges={edges}
            selectedAgent={selectedAgent}
            isDarkMode={isDarkMode}
            showRawDataViewer={showRawDataViewer}
            executionId={executionId}
            onAgentSelect={handleAgentSelect}
            onNodeFocus={handleNodeFocus}
            onCloseRawDataViewer={() => setShowRawDataViewer(false)}
            onResizeStart={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startWidth = outputPanelWidth;

              const handleMouseMove = (e: MouseEvent) => {
                const deltaX = startX - e.clientX;
                const newWidth = Math.min(
                  Math.max(startWidth + deltaX, 300),
                  Math.min(800, window.innerWidth - 500)
                );
                state.setOutputPanelWidth(newWidth);
                localStorage.setItem('chatbot_panel_width', newWidth.toString());
              };

              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                document.body.classList.remove('resizing');
              };

              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
              document.body.classList.add('resizing');
            }}
          />
        </div>
      </div>

      {/* Add Node Modal */}
      {false && showAddNode && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200}} onClick={()=>setShowAddNode(false)}>
          <div style={{ background: isDarkMode?'#0f172a':'#fff', color: isDarkMode?'#e2e8f0':'#0f172a', width:480, margin:'10vh auto', padding:16, borderRadius:8 }} onClick={(e)=>e.stopPropagation()}>
            <div style={{ fontWeight:600, marginBottom:8 }}>Add Block</div>
            <div style={{ display:'grid', gap:8 }}>
              <input className="task-input" placeholder="id (slug_case)" value={nodeDraft.id} onChange={e=>setNodeDraft({...nodeDraft, id:e.target.value})} />
              <input className="task-input" placeholder="name" value={nodeDraft.name} onChange={e=>setNodeDraft({...nodeDraft, name:e.target.value})} />
              <select className="task-input" value={nodeDraft.type} onChange={e=>setNodeDraft({...nodeDraft, type: e.target.value as any})}>
                <option value="analysis">analysis</option>
                <option value="tool_call">tool_call</option>
                <option value="decision">decision</option>
                <option value="parallel">parallel</option>
                <option value="final">final</option>
              </select>
              <input className="task-input" placeholder="agent role (optional)" value={nodeDraft.agent_role} onChange={e=>setNodeDraft({...nodeDraft, agent_role:e.target.value})} />
              <textarea className="task-input" rows={3} placeholder="description/prompt" value={nodeDraft.description} onChange={e=>setNodeDraft({...nodeDraft, description:e.target.value})} />
              <div style={{ border:`1px dashed ${isDarkMode?'#334155':'#e2e8f0'}`, padding:6, borderRadius:6, maxHeight:120, overflow:'auto' }}>
                <div style={{ fontSize:12, marginBottom:4 }}>Tools</div>
                {availableTools.map(t=>{
                  const checked = nodeDraft.tools.includes(t);
                  return (
                    <label key={t} style={{ display:'inline-flex', alignItems:'center', gap:4, marginRight:8, marginBottom:6 }}>
                      <input type="checkbox" checked={checked} onChange={(e)=>{
                        const set = new Set(nodeDraft.tools);
                        if (e.target.checked) set.add(t); else set.delete(t);
                        setNodeDraft({...nodeDraft, tools: Array.from(set)});
                      }} />
                      <span>{t}</span>
                    </label>
                  );
                })}
              </div>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                <button className="panel-button" onClick={()=>setShowAddNode(false)}>Cancel</button>
                <button className="panel-button" onClick={async()=>{
                  if (!executionId) return;
                  if (!nodeDraft.id || !nodeDraft.name) return;
                  try {
                    const patch: any = { states: [{ id: nodeDraft.id, name: nodeDraft.name, type: nodeDraft.type, description: nodeDraft.description, agent_role: nodeDraft.agent_role, tools: nodeDraft.tools }] };
                    await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/${executionId}/update_graph`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(patch) });
                    const newNode: any = {
                      id: nodeDraft.id,
                      type: 'agent',
                      position: { x: 100, y: 100 },
                      data: { label: nodeDraft.name, name: nodeDraft.name, status:'pending', nodeType: nodeDraft.type, task: nodeDraft.description, tools: nodeDraft.tools, toolsPlanned: nodeDraft.tools, description: nodeDraft.description, agentRole: nodeDraft.agent_role, direction: layoutDirection },
                      targetPosition: layoutDirection === 'LR' ? 'left' : 'top',
                      sourcePosition: layoutDirection === 'LR' ? 'right' : 'bottom',
                    };
                    setNodes(prev=>[...prev, newNode]);
                    setShowAddNode(false);
                  } catch (e) { console.error('Failed to add block', e); }
                }}>Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edge Editor */}
      {editMode && edgeEdit && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200}} onClick={()=>setEdgeEdit(null)}>
          <div style={{ background: isDarkMode?'#0f172a':'#fff', color: isDarkMode?'#e2e8f0':'#0f172a', width:420, margin:'15vh auto', padding:16, borderRadius:8 }} onClick={(e)=>e.stopPropagation()}>
            <div style={{ fontWeight:600, marginBottom:8 }}>Edit Connection</div>
            <div style={{ fontSize:12, marginBottom:8 }}>From <b>{edgeEdit.source}</b> to <b>{edgeEdit.target}</b></div>
            <label>
              <div className="label">Event</div>
              <input className="task-input" defaultValue={edgeEdit.event || 'success'} onBlur={(e)=>setEdgeEdit({...edgeEdit, event: e.target.value})} />
            </label>
            <div style={{ display:'flex', gap:8, justifyContent:'space-between', marginTop:12 }}>
              <button className="panel-button" onClick={async()=>{
                if (!executionId) return;
                try {
                  await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/${executionId}/update_graph`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ remove_edges: [{ source: edgeEdit.source, target: edgeEdit.target, event: edgeEdit.event }] }) });
                  setEdges(prev=>prev.filter(e=>!(e.source===edgeEdit.source && e.target===edgeEdit.target && ((e as any).label || 'success')===edgeEdit.event)));
                  setEdgeEdit(null);
                } catch (e) { console.error('Failed to delete edge', e); }
              }}>Delete</button>
              <span />
              <button className="panel-button" onClick={()=>setEdgeEdit(null)}>Cancel</button>
              <button className="panel-button" onClick={async()=>{
                if (!executionId || !edgeEdit) return;
                try {
                  await fetch(`${window.location.origin}/api/v1/streaming/stream/state-machine/${executionId}/update_graph`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ remove_edges: [{ source: edgeEdit.source, target: edgeEdit.target, event: edgeEdit.event }], edges: [{ source: edgeEdit.source, target: edgeEdit.target, event: edgeEdit.event }] }) });
                  setEdges(prev=>{
                    const rest = prev.filter(e=>!(e.source===edgeEdit.source && e.target===edgeEdit.target));
                    const newE: any = { id: `${edgeEdit.source}-${edgeEdit.target}-${edgeEdit.event}`, source: edgeEdit.source, target: edgeEdit.target, type:'smoothstep', animated:false, label: edgeEdit.event && edgeEdit.event!=='success'? edgeEdit.event : '', labelStyle:{ fill:'#94a3b8', fontSize:11 }, labelBgStyle:{ fill:'#1e293b', fillOpacity:0.8 }, style:{ stroke:'#52525b', strokeWidth:1.5 }, markerEnd:{ type: MarkerType.ArrowClosed, width:20, height:20, color:'#52525b' } };
                    return [...rest, newE];
                  });
                  setEdgeEdit(null);
                } catch (e) { console.error('Failed to update edge', e); }
              }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Block Settings Panel */}
      {selectedNodeForSettings && (
        <BlockSettingsPanel
          node={nodes.find(n => n.id === selectedNodeForSettings!.id) || selectedNodeForSettings}
          isDarkMode={isDarkMode}
          onClose={() => setSelectedNodeForSettings(null)}
          onUpdate={(nodeId: string, data: any) => {
            setNodes((nds) => {
              if (data && data.isStart) {
                return nds.map(n => ({
                  ...n,
                  data: {
                    ...n.data,
                    ...(n.id === nodeId ? data : {}),
                    isStart: n.id === nodeId
                  }
                }));
              }
              return nds.map((n) =>
                n.id === nodeId
                  ? { ...n, data: { ...n.data, ...data } }
                  : n
              );
            });
            setSelectedNodeForSettings(prev =>
              prev && prev.id === nodeId
                ? { ...prev, data: { ...prev.data, ...data } }
                : prev
            );
          }}
          onDelete={(nodeId: string) => {
            setNodes((nds) => nds.filter((n) => n.id !== nodeId));
            setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
            setSelectedNodeForSettings(null);
            setSelectedAgent(null);
          }}
          onDuplicate={(nodeId: string) => {
            const nodeToDuplicate = nodes.find((n) => n.id === nodeId);
            if (nodeToDuplicate) {
              const newNode = {
                ...nodeToDuplicate,
                id: uuidv4(),
                position: {
                  x: nodeToDuplicate.position.x + 50,
                  y: nodeToDuplicate.position.y + 50
                }
              };
              setNodes((nds) => [...nds, newNode]);
            }
          }}
          availableTools={availableTools}
        />
      )}

      {/* Command Bar */}
      <ExecutionControlBar
        executionMode={executionMode as any}
        task={task}
        isRunning={isRunning}
        onExecutionModeChange={(mode) => setExecutionMode(mode)}
        onTaskChange={setTask}
        onStartExecution={startExecution}
        onStopExecution={stopExecution}
        onToggleAIChat={() => setShowAIChat(!showAIChat)}
      />

      {/* AI Workflow Chat */}
      <AIWorkflowChat
        isOpen={showAIChat}
        onToggle={() => setShowAIChat(!showAIChat)}
        currentNodes={nodes}
        currentEdges={edges}
        onOperations={(operations, aiNodes, aiEdges) => {
          console.log('🤖 AI Operations:', operations.length, 'operations');

          operations.forEach((op: any, idx: number) => {
            console.log(`  ${idx + 1}. ${op.type}:`, op);

            if (op.type === 'add_node') {
              const nodeData = op.node;

              // Use the professional handler with proper position
              const position = nodeData.position || {
                x: 100 + (idx * 300),
                y: 200
              };

              // Create a complete professional node using the same structure as handlers
              const newNode = {
                id: nodeData.id || uuidv4(),
                type: 'professional',
                position: position,
                data: {
                  type: nodeData.type || 'analysis',
                  name: nodeData.name || 'New Node',
                  description: nodeData.description || '',
                  agent_role: nodeData.agent_role || 'Agent',
                  tools: nodeData.tools || [],
                  toolsPlanned: nodeData.tools || [],
                  transitions: {},
                  enabled: true,
                  advancedMode: false,
                  isWide: false,
                  isDarkMode,
                  nodeType: nodeData.type,
                  availableTools: availableTools,
                  isStart: nodeData.id === 'start' || nodeData.name?.toLowerCase() === 'start',
                  onUpdate: (id: string, updates: any) => {
                    setNodes((nds) =>
                      nds.map((node) =>
                        node.id === id ? { ...node, data: { ...node.data, ...updates } } : node
                      )
                    );
                  },
                  onDelete: (id: string) => {
                    setNodes((nds) => nds.filter((n) => n.id !== id));
                    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
                  },
                  onDuplicate: (id: string) => {
                    const nodeToDup = nodes.find((n) => n.id === id);
                    if (nodeToDup) {
                      const newId = uuidv4();
                      const newNode = {
                        ...nodeToDup,
                        id: newId,
                        position: {
                          x: nodeToDup.position.x + 50,
                          y: nodeToDup.position.y + 50,
                        },
                        data: {
                          ...nodeToDup.data,
                          name: `${nodeToDup.data.name} (Copy)`,
                        },
                      };
                      setNodes((nds) => [...nds, newNode]);
                    }
                  },
                },
              };

              setNodes((nds) => {
                // If this is a start node, remove isStart from other nodes
                if (newNode.data.isStart) {
                  return nds
                    .map((n) => ({ ...n, data: { ...n.data, isStart: false } }))
                    .concat(newNode);
                }
                return [...nds, newNode];
              });

            } else if (op.type === 'remove_node') {
              const nodeId = op.node_id;
              setNodes((nds) => nds.filter((n) => n.id !== nodeId));
              setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));

            } else if (op.type === 'modify_node') {
              const nodeId = op.node_id;
              const updates = op.updates || {};
              setNodes((nds) =>
                nds.map((node) =>
                  node.id === nodeId
                    ? {
                        ...node,
                        data: {
                          ...node.data,
                          ...updates,
                          // Update toolsPlanned if tools are updated
                          toolsPlanned: updates.tools || node.data.toolsPlanned,
                        },
                      }
                    : node
                )
              );

            } else if (op.type === 'connect_nodes') {
              const edgeId = `e-${op.source}-${op.target}-${op.event || 'success'}`;
              const newEdge = {
                id: edgeId,
                source: op.source,
                target: op.target,
                sourceHandle: op.event === 'failure' ? 'failure' : 'success',
                targetHandle: 'target',
                type: 'smoothstep',
                animated: op.event !== 'failure',
                label: op.event && op.event !== 'success' ? op.event : '',
                style: {
                  stroke: op.event === 'failure' ? '#ef4444' : isDarkMode ? '#10b981' : '#059669',
                  strokeWidth: 2,
                },
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  width: 20,
                  height: 20,
                  color: op.event === 'failure' ? '#ef4444' : isDarkMode ? '#10b981' : '#059669',
                },
              };

              setEdges((eds) => {
                // Don't add duplicate edges
                const exists = eds.some(
                  (e) => e.source === op.source && e.target === op.target && (e.label || 'success') === (op.event || 'success')
                );
                return exists ? eds : [...eds, newEdge];
              });

            } else if (op.type === 'disconnect_nodes') {
              const source = op.source;
              const target = op.target;
              const event = op.event;
              setEdges((eds) =>
                eds.filter((e) => !(
                  e.source === source &&
                  e.target === target &&
                  (!event || (e.label || 'success') === event)
                ))
              );

            } else if (op.type === 'clear_all') {
              setNodes([]);
              setEdges([]);

            } else if (op.type === 'auto_layout') {
              // Trigger auto-layout
              setTimeout(() => handlers.updateGraph(true), 100);
            }
          });

          // Auto-layout after all operations
          setTimeout(() => {
            handlers.updateGraph(true);
          }, 150);
        }}
        isDarkMode={isDarkMode}
        wsRef={state.wsRef}
      />
    </div>
  );
};

// Wrapper Component with Provider
const FlowSwarmInterfaceWrapper: React.FC = () => {
  return (
    <ReactFlowProvider>
      <FlowSwarmInterface />
    </ReactFlowProvider>
  );
};

export default FlowSwarmInterfaceWrapper;