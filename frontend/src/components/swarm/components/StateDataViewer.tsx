import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, Eye, EyeOff, Activity, Database, Layers, GitBranch, Clock, AlertCircle } from 'lucide-react';
import './StateDataViewer.css';

interface StateExecutionData {
  stateId: string;
  stateName: string;
  timestamp: number;
  input: any;
  output: any;
  context: any;
  transitions: Record<string, string>;
  nextEvent?: string;
  error?: any;
  duration?: number;
  memoryUsage?: number;
}

interface WorkflowContext {
  globalContext: any;
  stateContexts: Record<string, any>;
  memorySnapshots: Array<{
    timestamp: number;
    memory: any;
  }>;
}

interface StateDataViewerProps {
  execId: string;
  websocketUrl?: string;
  initialData?: StateExecutionData[];
  isDarkMode?: boolean;
  onClose?: () => void;
}

const StateDataViewer: React.FC<StateDataViewerProps> = ({
  execId,
  websocketUrl,
  initialData = [],
  isDarkMode = false,
  onClose
}) => {
  const [executionData, setExecutionData] = useState<StateExecutionData[]>(initialData);
  const [workflowContext, setWorkflowContext] = useState<WorkflowContext>({
    globalContext: {},
    stateContexts: {},
    memorySnapshots: []
  });
  const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['input', 'output', 'context']));
  const [showRawJson, setShowRawJson] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'timeline' | 'context' | 'raw'>('timeline');
  const [filterState, setFilterState] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (websocketUrl) {
      connectWebSocket();
    }
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [websocketUrl]);

  const connectWebSocket = () => {
    if (!websocketUrl) return;

    const ws = new WebSocket(websocketUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data);
        handleWebSocketFrame(frame);
      } catch (error) {
        console.error('Failed to parse WebSocket frame:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
    };
  };

  const handleWebSocketFrame = (frame: any) => {
    const { type, agent_id, payload, ts } = frame;

    if (type === 'state_entered' || type === 'state_exited') {
      const newData: StateExecutionData = {
        stateId: agent_id || payload.state?.id,
        stateName: payload.state?.name || agent_id,
        timestamp: ts || Date.now() / 1000,
        input: type === 'state_entered' ? payload : null,
        output: type === 'state_exited' ? payload.result : null,
        context: payload.state || {},
        transitions: payload.state?.transitions || {},
        nextEvent: payload.next_event,
        duration: type === 'state_exited' ? (payload.timestamp - (executionData.find(d => d.stateId === agent_id)?.timestamp || 0)) * 1000 : undefined
      };

      setExecutionData(prev => {
        const existingIndex = prev.findIndex(d => d.stateId === agent_id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            ...newData,
            output: newData.output || updated[existingIndex].output
          };
          return updated;
        }
        return [...prev, newData];
      });

      // Update workflow context
      if (type === 'state_exited' && payload.result) {
        setWorkflowContext(prev => ({
          ...prev,
          stateContexts: {
            ...prev.stateContexts,
            [agent_id]: payload.result
          },
          memorySnapshots: [
            ...prev.memorySnapshots,
            {
              timestamp: ts,
              memory: { state: agent_id, data: payload.result }
            }
          ]
        }));
      }
    }

    if (type === 'workflow_completed') {
      setWorkflowContext(prev => ({
        ...prev,
        globalContext: payload.results || {}
      }));
    }
  };

  const toggleStateExpansion = (stateId: string) => {
    setExpandedStates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stateId)) {
        newSet.delete(stateId);
      } else {
        newSet.add(stateId);
      }
      return newSet;
    });
  };

  const toggleSectionExpansion = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const copyToClipboard = async (data: any, id: string) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const renderJsonValue = (value: any, depth: number = 0): React.ReactNode => {
    if (value === null) return <span className="json-null">null</span>;
    if (value === undefined) return <span className="json-undefined">undefined</span>;
    if (typeof value === 'boolean') return <span className="json-boolean">{value.toString()}</span>;
    if (typeof value === 'number') return <span className="json-number">{value}</span>;
    if (typeof value === 'string') {
      if (value.length > 100) {
        return <span className="json-string">"{value.substring(0, 100)}..."</span>;
      }
      return <span className="json-string">"{value}"</span>;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="json-bracket">[]</span>;
      return (
        <div className="json-array" style={{ marginLeft: depth * 12 }}>
          <span className="json-bracket">[</span>
          {value.map((item, idx) => (
            <div key={idx} className="json-item">
              {renderJsonValue(item, depth + 1)}
              {idx < value.length - 1 && <span>,</span>}
            </div>
          ))}
          <span className="json-bracket">]</span>
        </div>
      );
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value);
      if (entries.length === 0) return <span className="json-bracket">{'{}'}</span>;
      return (
        <div className="json-object" style={{ marginLeft: depth * 12 }}>
          <span className="json-bracket">{'{'}</span>
          {entries.map(([key, val], idx) => (
            <div key={key} className="json-property">
              <span className="json-key">"{key}"</span>: {renderJsonValue(val, depth + 1)}
              {idx < entries.length - 1 && <span>,</span>}
            </div>
          ))}
          <span className="json-bracket">{'}'}</span>
        </div>
      );
    }

    return <span className="json-unknown">{String(value)}</span>;
  };

  const renderStateBlock = (data: StateExecutionData) => {
    const isExpanded = expandedStates.has(data.stateId);
    const hasError = !!data.error;

    return (
      <div key={data.stateId} className={`state-block ${hasError ? 'error' : ''}`}>
        <div className="state-header" onClick={() => toggleStateExpansion(data.stateId)}>
          <div className="state-header-left">
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span className="state-name">{data.stateName}</span>
            <span className="state-id">({data.stateId})</span>
            {hasError && <AlertCircle size={14} className="error-icon" />}
          </div>
          <div className="state-header-right">
            <span className="state-timestamp">{formatTimestamp(data.timestamp)}</span>
            {data.duration && <span className="state-duration">{formatDuration(data.duration)}</span>}
            <button
              className="copy-button"
              onClick={(e) => {
                e.stopPropagation();
                copyToClipboard(data, data.stateId);
              }}
            >
              {copiedId === data.stateId ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="state-content">
            {data.input && (
              <div className="data-section">
                <div
                  className="section-header"
                  onClick={() => toggleSectionExpansion(`${data.stateId}-input`)}
                >
                  <GitBranch size={14} />
                  <span>Input</span>
                  {expandedSections.has(`${data.stateId}-input`) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                {expandedSections.has(`${data.stateId}-input`) && (
                  <div className="section-content">
                    {showRawJson ? (
                      <pre className="raw-json">{JSON.stringify(data.input, null, 2)}</pre>
                    ) : (
                      renderJsonValue(data.input)
                    )}
                  </div>
                )}
              </div>
            )}

            {data.output && (
              <div className="data-section">
                <div
                  className="section-header"
                  onClick={() => toggleSectionExpansion(`${data.stateId}-output`)}
                >
                  <Activity size={14} />
                  <span>Output</span>
                  {expandedSections.has(`${data.stateId}-output`) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                {expandedSections.has(`${data.stateId}-output`) && (
                  <div className="section-content">
                    {showRawJson ? (
                      <pre className="raw-json">{JSON.stringify(data.output, null, 2)}</pre>
                    ) : (
                      renderJsonValue(data.output)
                    )}
                  </div>
                )}
              </div>
            )}

            {data.context && Object.keys(data.context).length > 0 && (
              <div className="data-section">
                <div
                  className="section-header"
                  onClick={() => toggleSectionExpansion(`${data.stateId}-context`)}
                >
                  <Database size={14} />
                  <span>Context</span>
                  {expandedSections.has(`${data.stateId}-context`) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                {expandedSections.has(`${data.stateId}-context`) && (
                  <div className="section-content">
                    {showRawJson ? (
                      <pre className="raw-json">{JSON.stringify(data.context, null, 2)}</pre>
                    ) : (
                      renderJsonValue(data.context)
                    )}
                  </div>
                )}
              </div>
            )}

            {data.transitions && Object.keys(data.transitions).length > 0 && (
              <div className="data-section">
                <div className="section-header">
                  <Layers size={14} />
                  <span>Transitions</span>
                </div>
                <div className="transitions-list">
                  {Object.entries(data.transitions).map(([event, target]) => (
                    <div key={event} className={`transition-item ${event === data.nextEvent ? 'active' : ''}`}>
                      <span className="transition-event">{event}</span>
                      <span className="transition-arrow">→</span>
                      <span className="transition-target">{target}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.error && (
              <div className="data-section error-section">
                <div className="section-header">
                  <AlertCircle size={14} />
                  <span>Error</span>
                </div>
                <div className="section-content error-content">
                  <pre>{JSON.stringify(data.error, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const filteredData = filterState
    ? executionData.filter(d =>
        d.stateName.toLowerCase().includes(filterState.toLowerCase()) ||
        d.stateId.toLowerCase().includes(filterState.toLowerCase())
      )
    : executionData;

  return (
    <div className={`state-data-viewer ${isDarkMode ? 'dark' : 'light'}`} ref={containerRef}>
      <div className="viewer-header">
        <div className="header-left">
          <h3>State Execution Data Viewer</h3>
          <span className="exec-id">Execution: {execId}</span>
        </div>
        <div className="header-controls">
          <button
            className={`tab-button ${activeTab === 'timeline' ? 'active' : ''}`}
            onClick={() => setActiveTab('timeline')}
          >
            <Clock size={14} />
            Timeline
          </button>
          <button
            className={`tab-button ${activeTab === 'context' ? 'active' : ''}`}
            onClick={() => setActiveTab('context')}
          >
            <Database size={14} />
            Context Flow
          </button>
          <button
            className={`tab-button ${activeTab === 'raw' ? 'active' : ''}`}
            onClick={() => setActiveTab('raw')}
          >
            <Layers size={14} />
            Raw Data
          </button>
          <button
            className="toggle-button"
            onClick={() => setShowRawJson(!showRawJson)}
            title={showRawJson ? 'Show formatted' : 'Show raw JSON'}
          >
            {showRawJson ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          {onClose && (
            <button className="close-button" onClick={onClose}>×</button>
          )}
        </div>
      </div>

      <div className="viewer-toolbar">
        <input
          type="text"
          className="filter-input"
          placeholder="Filter states..."
          value={filterState}
          onChange={(e) => setFilterState(e.target.value)}
        />
        <div className="stats">
          <span>States: {executionData.length}</span>
          <span>Context Size: {Object.keys(workflowContext.stateContexts).length}</span>
          <span>Memory Snapshots: {workflowContext.memorySnapshots.length}</span>
        </div>
      </div>

      <div className="viewer-content">
        {activeTab === 'timeline' && (
          <div className="timeline-view">
            {filteredData.length === 0 ? (
              <div className="empty-state">No execution data available</div>
            ) : (
              filteredData.map(renderStateBlock)
            )}
          </div>
        )}

        {activeTab === 'context' && (
          <div className="context-view">
            <div className="context-section">
              <h4>Global Context</h4>
              <div className="context-content">
                {showRawJson ? (
                  <pre className="raw-json">{JSON.stringify(workflowContext.globalContext, null, 2)}</pre>
                ) : (
                  renderJsonValue(workflowContext.globalContext)
                )}
              </div>
            </div>

            <div className="context-section">
              <h4>State Contexts</h4>
              <div className="state-contexts">
                {Object.entries(workflowContext.stateContexts).map(([stateId, context]) => (
                  <div key={stateId} className="context-item">
                    <div className="context-item-header">{stateId}</div>
                    <div className="context-item-content">
                      {showRawJson ? (
                        <pre className="raw-json">{JSON.stringify(context, null, 2)}</pre>
                      ) : (
                        renderJsonValue(context)
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="context-section">
              <h4>Memory Timeline</h4>
              <div className="memory-timeline">
                {workflowContext.memorySnapshots.map((snapshot, idx) => (
                  <div key={idx} className="memory-snapshot">
                    <span className="snapshot-time">{formatTimestamp(snapshot.timestamp)}</span>
                    <span className="snapshot-state">{snapshot.memory.state}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'raw' && (
          <div className="raw-view">
            <pre className="raw-json">
              {JSON.stringify({
                executionData,
                workflowContext,
                metadata: {
                  execId,
                  timestamp: Date.now(),
                  stateCount: executionData.length
                }
              }, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default StateDataViewer;