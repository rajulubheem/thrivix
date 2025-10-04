import React, { memo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  Panel,
  BackgroundVariant,
  NodeTypes,
  EdgeTypes,
  Connection,
  ConnectionLineType,
  ConnectionMode
} from 'reactflow';
import { WorkflowToolbar } from './WorkflowToolbar';

interface WorkflowCanvasProps {
  nodes: Node[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  edgeTypes: EdgeTypes;
  onNodesChange: (changes: any) => void;
  onEdgesChange: (changes: any) => void;
  onConnect: (connection: Connection) => void;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onNodeDoubleClick: (event: React.MouseEvent, node: Node) => void;
  onEdgeClick: (event: React.MouseEvent, edge: Edge) => void;
  onNodeContextMenu: (event: React.MouseEvent, node: Node) => void;
  onDrop: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  isDarkMode: boolean;
  showMinimap: boolean;
  layoutDirection: string;
  children?: React.ReactNode;
  connectionLineType?: ConnectionLineType;
  connectionMode?: ConnectionMode;
}

const WorkflowCanvas: React.FC<WorkflowCanvasProps> = memo(({
  nodes,
  edges,
  nodeTypes,
  edgeTypes,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onNodeDoubleClick,
  onEdgeClick,
  onNodeContextMenu,
  onDrop,
  onDragOver,
  isDarkMode,
  showMinimap,
  layoutDirection,
  children,
  connectionLineType = ConnectionLineType.Bezier,
  connectionMode = ConnectionMode.Loose
}) => {
  return (
    <ReactFlow
      style={{ background: isDarkMode ? '#0a0f1a' : '#ffffff' }}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      onNodeDoubleClick={onNodeDoubleClick}
      onEdgeClick={onEdgeClick}
      onNodeContextMenu={onNodeContextMenu}
      onDrop={onDrop}
      onDragOver={onDragOver}
      connectionLineType={connectionLineType}
      connectionMode={connectionMode}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      deleteKeyCode={['Backspace', 'Delete']}
      multiSelectionKeyCode={['Meta', 'Ctrl']}
      panOnScroll
      zoomOnScroll
      zoomOnDoubleClick
      preventScrolling={false}
      defaultEdgeOptions={{
        type: 'editable',
        animated: false,
        style: {
          strokeWidth: 2,
          stroke: isDarkMode ? '#52525b' : '#94a3b8',
        },
      }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color={isDarkMode ? '#1e293b' : '#e2e8f0'}
      />
      <Controls
        showZoom={true}
        showFitView={true}
        showInteractive={true}
        position="bottom-left"
        style={{
          background: isDarkMode ? '#0f172a' : '#ffffff',
          border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
          borderRadius: '8px',
        }}
      />
      {showMinimap && (
        <MiniMap
          position="bottom-right"
          nodeColor={(n: Node) => {
            const status = n.data?.status;
            if (status === 'running') return '#fbbf24';
            if (status === 'completed') return '#10b981';
            if (status === 'failed') return '#ef4444';
            return isDarkMode ? '#475569' : '#cbd5e1';
          }}
          style={{
            background: isDarkMode ? '#0f172a' : '#ffffff',
            border: `1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
            borderRadius: '8px',
            opacity: 0.9,
          }}
        />
      )}
      {children}
    </ReactFlow>
  );
});

WorkflowCanvas.displayName = 'WorkflowCanvas';

export default WorkflowCanvas;