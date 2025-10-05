import React from 'react';
import { Node } from 'reactflow';

interface ParallelChildrenEditorProps {
  showChildrenEditor: string | null;
  nodes: Node[];
  childrenOverrides: Record<string, string[]>;
  isDarkMode: boolean;
  onClose: () => void;
  onChildrenChange: (nodeId: string, children: string[]) => void;
}

export const ParallelChildrenEditor: React.FC<ParallelChildrenEditorProps> = ({
  showChildrenEditor,
  nodes,
  childrenOverrides,
  isDarkMode,
  onClose,
  onChildrenChange,
}) => {
  if (!showChildrenEditor) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: isDarkMode ? '#0f172a' : '#fff',
          color: isDarkMode ? '#e2e8f0' : '#111',
          width: 640,
          maxHeight: '80vh',
          borderRadius: 8,
          padding: 16,
          overflow: 'auto'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12
        }}>
          <h3 style={{ margin: 0 }}>Parallel Children for: {showChildrenEditor}</h3>
          <button className="panel-button" onClick={onClose}>Close</button>
        </div>
        <p style={{ marginTop: 0, opacity: 0.8 }}>
          Select the contributor nodes whose outputs should aggregate into this parallel block.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {nodes.map(n => (
            <label
              key={n.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                border: '1px solid #334155',
                borderRadius: 8,
                padding: 8
              }}
            >
              <input
                type="checkbox"
                checked={(childrenOverrides[showChildrenEditor] || []).includes(n.id)}
                onChange={e => {
                  const current = new Set(childrenOverrides[showChildrenEditor] || []);
                  if (e.target.checked) {
                    current.add(n.id);
                  } else {
                    current.delete(n.id);
                  }
                  onChildrenChange(showChildrenEditor, Array.from(current));
                }}
              />
              <span style={{ fontWeight: 600 }}>{(n.data as any)?.label || n.id}</span>
              <span style={{ opacity: 0.7, fontSize: 12 }}>({n.id})</span>
            </label>
          ))}
        </div>
        <div style={{
          marginTop: 12,
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end'
        }}>
          <button className="panel-button" onClick={onClose}>Done</button>
        </div>
        <div style={{
          marginTop: 8,
          fontSize: 12,
          opacity: 0.7
        }}>
          Changes apply during this run for aggregation and are also sent with the start request for future runs.
        </div>
      </div>
    </div>
  );
};