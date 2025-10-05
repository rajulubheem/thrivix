import React from 'react';
import { Panel } from 'reactflow';

interface FlowControlsPanelProps {
  historyIndex: number;
  historyLength: number;
  highlightPath: boolean;
  layoutDirection: 'LR' | 'TB';
  showGrid: boolean;
  showMinimap: boolean;
  showConversationPanel: boolean;
  showRawDataViewer: boolean;
  followActive: boolean;
  replayMode: boolean;
  executionTraceLength: number;
  replayIndex: number | null;
  selectedAgent: string | null;
  isDarkMode: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClearPathHighlight: () => void;
  onFitView: () => void;
  onRelayout: () => void;
  onOpenBlockManager: () => void;
  onToggleLayoutDirection: () => void;
  onToggleGrid: () => void;
  onToggleMinimap: () => void;
  onToggleConversationPanel: () => void;
  onResetView: () => void;
  onOpenToolsHub: () => void;
  onToggleRawDataViewer: () => void;
  onToggleFollowActive: () => void;
  onToggleReplayMode: () => void;
  onReplayPrevious: () => void;
  onReplayNext: () => void;
  onToggleHighlightPath: () => void;
  onRerunFromSelected: () => void;
  onAddAgentAndRerun: () => void;
  executionId: string | null;
  nodes: any[];
  collapsedGroups: Record<string, boolean>;
  onToggleCollapsedGroup: (id: string) => void;
  onShowChildrenEditor: (id: string) => void;
}

export const FlowControlsPanel: React.FC<FlowControlsPanelProps> = ({
  historyIndex,
  historyLength,
  highlightPath,
  layoutDirection,
  showGrid,
  showMinimap,
  showConversationPanel,
  showRawDataViewer,
  followActive,
  replayMode,
  executionTraceLength,
  replayIndex,
  selectedAgent,
  isDarkMode,
  onUndo,
  onRedo,
  onClearPathHighlight,
  onFitView,
  onRelayout,
  onOpenBlockManager,
  onToggleLayoutDirection,
  onToggleGrid,
  onToggleMinimap,
  onToggleConversationPanel,
  onResetView,
  onOpenToolsHub,
  onToggleRawDataViewer,
  onToggleFollowActive,
  onToggleReplayMode,
  onReplayPrevious,
  onReplayNext,
  onToggleHighlightPath,
  onRerunFromSelected,
  onAddAgentAndRerun,
  executionId,
  nodes,
  collapsedGroups,
  onToggleCollapsedGroup,
  onShowChildrenEditor,
}) => {
  const selectedNode = selectedAgent ? nodes.find(n => n.id === selectedAgent) : null;
  const isParallelNode = selectedNode && ((selectedNode.data as any)?.parallelRunning ||
    ['parallel','parallel_load'].includes((selectedNode.data as any)?.nodeType));

  return (
    <>
      <Panel position="top-left" style={{ top: '80px' }}>
        <div className="panel-controls" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Undo/Redo buttons */}
          <button
            className="panel-button"
            onClick={onUndo}
            disabled={historyIndex <= 0}
            title="Undo (Ctrl/Cmd + Z)"
            style={{
              opacity: historyIndex <= 0 ? 0.5 : 1,
              cursor: historyIndex <= 0 ? 'not-allowed' : 'pointer'
            }}
          >
            ↶ Undo
          </button>
          <button
            className="panel-button"
            onClick={onRedo}
            disabled={historyIndex >= historyLength - 1}
            title="Redo (Ctrl/Cmd + Y)"
            style={{
              opacity: historyIndex >= historyLength - 1 ? 0.5 : 1,
              cursor: historyIndex >= historyLength - 1 ? 'not-allowed' : 'pointer'
            }}
          >
            ↷ Redo
          </button>
          <div style={{
            width: '1px',
            height: '24px',
            background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
            margin: '0 4px'
          }} />
          {highlightPath && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
              border: '1px solid #3b82f6',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#1e40af'
            }}>
              <span>🔍 Path Highlighted</span>
              <button
                onClick={onClearPathHighlight}
                style={{
                  padding: '2px 6px',
                  background: 'white',
                  border: '1px solid #3b82f6',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
              >
                Clear (ESC)
              </button>
            </div>
          )}
          <button onClick={onFitView} className="panel-button">
            Fit View
          </button>

          <button onClick={onRelayout} className="panel-button">
            Re-layout
          </button>

          <button onClick={onOpenBlockManager} className="panel-button">
            📦 Block Manager
          </button>

          <button
            className={`panel-button ${layoutDirection === 'LR' ? 'active' : ''}`}
            onClick={onToggleLayoutDirection}
          >
            {layoutDirection === 'LR' ? '→ Horizontal' : '↓ Vertical'}
          </button>

          <button
            className={`panel-button ${showGrid ? 'active' : ''}`}
            onClick={onToggleGrid}
          >
            Grid: {showGrid ? 'On' : 'Off'}
          </button>

          <button
            className={`panel-button ${showMinimap ? 'active' : ''}`}
            onClick={onToggleMinimap}
          >
            Minimap: {showMinimap ? 'On' : 'Off'}
          </button>

          <button
            className={`panel-button ${showConversationPanel ? 'active' : ''}`}
            onClick={onToggleConversationPanel}
            title="Toggle conversation panel"
          >
            💬 Chat: {showConversationPanel ? 'On' : 'Off'}
          </button>

          <button onClick={onResetView} className="panel-button">
            Clear
          </button>

          <button onClick={onOpenToolsHub} className="panel-button">
            Tools
          </button>

          <button
            onClick={onToggleRawDataViewer}
            className={`panel-button ${showRawDataViewer ? 'active' : ''}`}
            title="View raw state execution data"
          >
            Raw Data
          </button>

          <button
            className="panel-button"
            onClick={onToggleFollowActive}
            title="Follow active node"
          >
            Follow: {followActive ? 'On' : 'Off'}
          </button>

          {/* Replay Controls */}
          <button
            className={`panel-button ${replayMode ? 'active' : ''}`}
            onClick={onToggleReplayMode}
            title="Toggle replay mode"
          >
            Replay: {replayMode ? 'On' : 'Off'}
          </button>
          <button
            className="panel-button"
            onClick={onReplayPrevious}
            title="Previous (←)"
            disabled={!replayMode || executionTraceLength === 0}
          >Prev</button>
          <button
            className="panel-button"
            onClick={onReplayNext}
            title="Next (→)"
            disabled={!replayMode || executionTraceLength === 0}
          >Next</button>

          <button
            className={`panel-button ${highlightPath ? 'active' : ''}`}
            onClick={onToggleHighlightPath}
            title="Highlight Active Path"
          >
            Path: {highlightPath ? 'On' : 'Off'}
          </button>

          {/* Rerun from selected node */}
          <button
            className="panel-button"
            disabled={!selectedAgent || !executionId}
            onClick={onRerunFromSelected}
            title="Rerun from the selected node"
          >
            Rerun From Here
          </button>

          {/* Add agent and connect, then rerun */}
          <button
            className="panel-button"
            disabled={!selectedAgent || !executionId}
            onClick={onAddAgentAndRerun}
            title="Add an agent and connect from selected, then rerun"
          >
            Add Agent + Rerun
          </button>

          {/* Collapse / Expand for selected parallel */}
          {isParallelNode && (
            <button
              className="panel-button"
              onClick={() => onToggleCollapsedGroup(selectedAgent!)}
              title="Collapse/Expand selected parallel group"
            >
              {collapsedGroups[selectedAgent!] ? 'Expand Group' : 'Collapse Group'}
            </button>
          )}

          {/* Edit Children for selected parallel */}
          {isParallelNode && (
            <button
              className="panel-button"
              onClick={() => onShowChildrenEditor(selectedAgent!)}
              title="Edit parallel children"
            >
              Edit Children
            </button>
          )}
        </div>
      </Panel>
    </>
  );
};