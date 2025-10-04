import React from 'react';

interface ToolsHubModalProps {
  show: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  selectedTools: Set<string>;
  setSelectedTools: (tools: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  availableTools: string[];
  toolSearch: string;
  setToolSearch: (search: string) => void;
}

const ToolsHubModal: React.FC<ToolsHubModalProps> = ({
  show,
  onClose,
  isDarkMode,
  selectedTools,
  setSelectedTools,
  availableTools,
  toolSearch,
  setToolSearch
}) => {
  if (!show) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: isDarkMode ? '#0f172a' : '#ffffff',
          color: isDarkMode ? '#e2e8f0' : '#1e293b',
          width: 720,
          maxHeight: '85vh',
          borderRadius: 12,
          padding: 24,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          flexDirection: 'column' as const
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Tool Selection</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: 14, color: isDarkMode ? '#94a3b8' : '#64748b' }}>
              Choose which tools the AI can use. Leave empty to allow all tools.
            </p>
          </div>
          <button
            className="panel-button"
            onClick={onClose}
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
            onChange={e => setToolSearch(e.target.value)}
            style={{ width: '100%', marginBottom: 12 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ color: '#64748b', fontSize: 14 }}>
              {selectedTools.size > 0
                ? `${selectedTools.size} tool${selectedTools.size === 1 ? '' : 's'} selected`
                : 'No tools selected (AI will use all available tools)'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="panel-button"
                onClick={() => setSelectedTools(new Set(availableTools))}
                style={{ padding: '6px 12px', fontSize: 13 }}
              >
                Select All
              </button>
              <button
                className="panel-button"
                onClick={() => setSelectedTools(new Set())}
                style={{ padding: '6px 12px', fontSize: 13 }}
              >
                Clear All
              </button>
            </div>
          </div>
        </div>

        {/* Unknown selection warning */}
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {availableTools
              .filter(t => t.toLowerCase().includes(toolSearch.toLowerCase()))
              .map(t => {
                const isSelected = selectedTools.has(t);
                return (
                  <div
                    key={t}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedTools(prev => {
                        const next = new Set(prev);
                        if (isSelected) {
                          next.delete(t);
                        } else {
                          next.add(t);
                        }
                        return next;
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedTools(prev => {
                          const next = new Set(prev);
                          if (isSelected) {
                            next.delete(t);
                          } else {
                            next.add(t);
                          }
                          return next;
                        });
                      }
                    }}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      transition: 'all 0.15s ease',
                      border: `1px solid ${isSelected
                        ? (isDarkMode ? '#3b82f6' : '#2563eb')
                        : (isDarkMode ? '#334155' : '#e2e8f0')}`,
                      background: isSelected
                        ? (isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(37, 99, 235, 0.05)')
                        : (isDarkMode ? '#1e293b' : '#f8fafc'),
                      color: isSelected
                        ? (isDarkMode ? '#93bbfc' : '#2563eb')
                        : (isDarkMode ? '#cbd5e1' : '#475569')
                    }}
                  >
                    <div style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: `2px solid ${isSelected ? (isDarkMode ? '#3b82f6' : '#2563eb') : (isDarkMode ? '#475569' : '#cbd5e1')}`,
                      background: isSelected ? (isDarkMode ? '#3b82f6' : '#2563eb') : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {isSelected && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path
                            d="M2.5 6L4.5 8L9.5 3"
                            stroke="white"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{t}</span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolsHubModal;