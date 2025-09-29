import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronDown, ChevronRight, Copy, Check, Eye, EyeOff,
  Activity, Database, Layers, GitBranch, Clock, AlertCircle,
  ArrowRight, Link, Package, Zap, Info, FileText,
  Network, Share2, GitMerge, Cpu
} from 'lucide-react';
import './EnhancedStateDataViewer.css';

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
  parentContext?: any;
  inheritedData?: any;
  producedData?: any;
  toolsUsed?: string[];
  depth?: number;
}

interface WorkflowContext {
  globalContext: any;
  stateContexts: Record<string, any>;
  memorySnapshots: Array<{
    timestamp: number;
    stateId: string;
    memory: any;
    deltaChanges?: any;
  }>;
  dataFlow: Array<{
    from: string;
    to: string;
    data: any;
    timestamp: number;
  }>;
  contextInheritance: Record<string, {
    parent?: string;
    children: string[];
    sharedData: any;
  }>;
}

interface EnhancedStateDataViewerProps {
  execId: string;
  websocketUrl?: string;
  initialData?: StateExecutionData[];
  isDarkMode?: boolean;
  onClose?: () => void;
  nodes?: any[];
  edges?: any[];
}

const EnhancedStateDataViewer: React.FC<EnhancedStateDataViewerProps> = ({
  execId,
  websocketUrl,
  initialData = [],
  isDarkMode = false,
  onClose,
  nodes = [],
  edges = []
}) => {
  const [executionData, setExecutionData] = useState<StateExecutionData[]>(initialData);
  const [workflowContext, setWorkflowContext] = useState<WorkflowContext>({
    globalContext: {},
    stateContexts: {},
    memorySnapshots: [],
    dataFlow: [],
    contextInheritance: {}
  });
  const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['output', 'context']));
  const [showRawJson, setShowRawJson] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'timeline' | 'context' | 'flow' | 'raw'>('timeline');
  const [filterState, setFilterState] = useState('');
  const [selectedStateForDetail, setSelectedStateForDetail] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contextAccumulator = useRef<any>({});

  // Build state relationships from edges
  const stateRelationships = useMemo(() => {
    const relationships: Record<string, { parents: string[], children: string[] }> = {};

    // Initialize all states
    executionData.forEach(state => {
      relationships[state.stateId] = { parents: [], children: [] };
    });

    // Build relationships from edges
    edges.forEach(edge => {
      if (relationships[edge.source]) {
        relationships[edge.source].children.push(edge.target);
      }
      if (relationships[edge.target]) {
        relationships[edge.target].parents.push(edge.source);
      }
    });

    return relationships;
  }, [edges, executionData]);

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

  const extractDataFromOutput = (output: any): any => {
    if (!output) return {};

    // Try to extract structured data from the output
    if (typeof output === 'string') {
      // Look for JSON-like structures in the string
      try {
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch {}

      // Extract key information patterns
      const extracted: any = {};

      // Extract URLs
      const urlMatches = output.match(/https?:\/\/[^\s\)]+/g);
      if (urlMatches) {
        extracted.urls = urlMatches;
      }

      // Extract NEXT_EVENT
      const nextEventMatch = output.match(/NEXT_EVENT:\s*(\w+)/);
      if (nextEventMatch) {
        extracted.nextEvent = nextEventMatch[1];
      }

      // Extract numbered lists or bullet points
      const listItems = output.match(/^\d+\.\s*.+$/gm);
      if (listItems) {
        extracted.listItems = listItems;
      }

      return extracted;
    }

    return output;
  };

  const handleWebSocketFrame = (frame: any) => {
    const { type, agent_id, payload, ts } = frame;

    if (type === 'state_entered') {
      // Capture inherited context from parent states
      const parentStates = stateRelationships[agent_id]?.parents || [];
      const inheritedContext = {};

      parentStates.forEach(parentId => {
        const parentData = workflowContext.stateContexts[parentId];
        if (parentData) {
          Object.assign(inheritedContext, parentData);
        }
      });

      const newData: StateExecutionData = {
        stateId: agent_id || payload.state?.id,
        stateName: payload.state?.name || agent_id,
        timestamp: ts || Date.now() / 1000,
        input: payload,
        output: null,
        context: payload.state || {},
        transitions: payload.state?.transitions || {},
        parentContext: inheritedContext,
        inheritedData: contextAccumulator.current,
        toolsUsed: payload.state?.tools || [],
        depth: payload.depth
      };

      setExecutionData(prev => {
        const existingIndex = prev.findIndex(d => d.stateId === agent_id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            ...newData,
            output: updated[existingIndex].output // Preserve existing output
          };
          return updated;
        }
        return [...prev, newData];
      });

      // Update context inheritance
      setWorkflowContext(prev => ({
        ...prev,
        contextInheritance: {
          ...prev.contextInheritance,
          [agent_id]: {
            parent: parentStates[0],
            children: stateRelationships[agent_id]?.children || [],
            sharedData: inheritedContext
          }
        }
      }));
    }

    if (type === 'state_exited') {
      const producedData = extractDataFromOutput(payload.result);

      // Update accumulated context
      contextAccumulator.current = {
        ...contextAccumulator.current,
        [agent_id]: producedData
      };

      setExecutionData(prev => {
        const existingIndex = prev.findIndex(d => d.stateId === agent_id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          const startTime = updated[existingIndex].timestamp;
          updated[existingIndex] = {
            ...updated[existingIndex],
            output: payload.result,
            nextEvent: payload.next_event,
            duration: ((ts || Date.now() / 1000) - startTime) * 1000,
            producedData: producedData
          };
          return updated;
        }
        return prev;
      });

      // Update workflow context with state output
      setWorkflowContext(prev => ({
        ...prev,
        stateContexts: {
          ...prev.stateContexts,
          [agent_id]: producedData
        },
        memorySnapshots: [
          ...prev.memorySnapshots,
          {
            timestamp: ts,
            stateId: agent_id,
            memory: {
              state: agent_id,
              data: producedData,
              accumulated: { ...contextAccumulator.current }
            },
            deltaChanges: producedData
          }
        ],
        dataFlow: [
          ...prev.dataFlow,
          ...((stateRelationships[agent_id]?.children || []).map(childId => ({
            from: agent_id,
            to: childId,
            data: producedData,
            timestamp: ts
          })))
        ]
      }));
    }

    if (type === 'workflow_completed') {
      setWorkflowContext(prev => ({
        ...prev,
        globalContext: {
          results: payload.results || {},
          task: payload.task,
          totalStates: executionData.length,
          completedAt: ts
        }
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

  const renderJsonValue = (value: any, depth: number = 0, compact: boolean = false): React.ReactNode => {
    if (value === null) return <span className="json-null">null</span>;
    if (value === undefined) return <span className="json-undefined">undefined</span>;
    if (typeof value === 'boolean') return <span className="json-boolean">{value.toString()}</span>;
    if (typeof value === 'number') return <span className="json-number">{value}</span>;
    if (typeof value === 'string') {
      if (compact && value.length > 50) {
        return (
          <span className="json-string" title={value}>
            "{value.substring(0, 50)}..."
          </span>
        );
      }
      return <span className="json-string">"{value}"</span>;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="json-bracket">[]</span>;
      if (compact) {
        return <span className="json-bracket">[{value.length} items]</span>;
      }
      return (
        <div className="json-array" style={{ marginLeft: depth * 12 }}>
          <span className="json-bracket">[</span>
          {value.map((item, idx) => (
            <div key={idx} className="json-item">
              {renderJsonValue(item, depth + 1, compact)}
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
      if (compact) {
        return <span className="json-bracket">{`{${entries.length} props}`}</span>;
      }
      return (
        <div className="json-object" style={{ marginLeft: depth * 12 }}>
          <span className="json-bracket">{'{'}</span>
          {entries.map(([key, val], idx) => (
            <div key={key} className="json-property">
              <span className="json-key">"{key}"</span>: {renderJsonValue(val, depth + 1, compact)}
              {idx < entries.length - 1 && <span>,</span>}
            </div>
          ))}
          <span className="json-bracket">{'}'}</span>
        </div>
      );
    }

    return <span className="json-unknown">{String(value)}</span>;
  };

  const renderStateBlock = (data: StateExecutionData, index: number) => {
    const isExpanded = expandedStates.has(data.stateId);
    const hasError = !!data.error;
    const hasOutput = data.output !== null && data.output !== undefined;
    const relationships = stateRelationships[data.stateId] || { parents: [], children: [] };
    const isSelected = selectedStateForDetail === data.stateId;

    return (
      <div
        key={data.stateId}
        className={`state-block ${hasError ? 'error' : ''} ${!hasOutput ? 'no-output' : ''} ${isSelected ? 'selected' : ''}`}
      >
        <div className="state-header" onClick={() => toggleStateExpansion(data.stateId)}>
          <div className="state-header-left">
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span className="state-number">#{index + 1}</span>
            <span className="state-name">{data.stateName}</span>
            <span className="state-id">({data.stateId})</span>
            {hasError && <AlertCircle size={14} className="error-icon" />}
            {!hasOutput && (
              <span title="Output pending or null">
                <Info size={14} className="pending-icon" />
              </span>
            )}
            {data.toolsUsed && data.toolsUsed.length > 0 && (
              <span className="tools-badge">
                <Package size={12} />
                {data.toolsUsed.length}
              </span>
            )}
          </div>
          <div className="state-header-right">
            <span className="state-timestamp">{formatTimestamp(data.timestamp)}</span>
            {data.duration && <span className="state-duration">{formatDuration(data.duration)}</span>}
            <button
              className="detail-button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedStateForDetail(data.stateId === selectedStateForDetail ? null : data.stateId);
              }}
              title="View detailed flow"
            >
              <Network size={14} />
            </button>
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
            {/* Context Flow Indicator */}
            {(relationships.parents.length > 0 || relationships.children.length > 0) && (
              <div className="context-flow-indicator">
                <div className="flow-header">
                  <Share2 size={14} />
                  <span>Context Flow</span>
                </div>
                <div className="flow-connections">
                  {relationships.parents.length > 0 && (
                    <div className="flow-item">
                      <span className="flow-label">Inherits from:</span>
                      {relationships.parents.map(p => (
                        <span key={p} className="flow-badge parent">{p}</span>
                      ))}
                    </div>
                  )}
                  {relationships.children.length > 0 && (
                    <div className="flow-item">
                      <span className="flow-label">Passes to:</span>
                      {relationships.children.map(c => (
                        <span key={c} className="flow-badge child">{c}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Inherited Context */}
            {data.parentContext && Object.keys(data.parentContext).length > 0 && (
              <div className="data-section inherited">
                <div
                  className="section-header"
                  onClick={() => toggleSectionExpansion(`${data.stateId}-inherited`)}
                >
                  <GitMerge size={14} />
                  <span>Inherited Context</span>
                  {expandedSections.has(`${data.stateId}-inherited`) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                {expandedSections.has(`${data.stateId}-inherited`) && (
                  <div className="section-content">
                    {showRawJson ? (
                      <pre className="raw-json">{JSON.stringify(data.parentContext, null, 2)}</pre>
                    ) : (
                      renderJsonValue(data.parentContext, 0, true)
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Input */}
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

            {/* Output */}
            <div className="data-section">
              <div
                className="section-header"
                onClick={() => toggleSectionExpansion(`${data.stateId}-output`)}
              >
                <Activity size={14} />
                <span>Output</span>
                {!hasOutput && <span className="no-data-badge">No output yet</span>}
                {expandedSections.has(`${data.stateId}-output`) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </div>
              {expandedSections.has(`${data.stateId}-output`) && (
                <div className="section-content">
                  {hasOutput ? (
                    showRawJson ? (
                      <pre className="raw-json">{JSON.stringify(data.output, null, 2)}</pre>
                    ) : (
                      <div className="output-display">
                        {typeof data.output === 'string' ? (
                          <div className="output-text">{data.output}</div>
                        ) : (
                          renderJsonValue(data.output)
                        )}
                      </div>
                    )
                  ) : (
                    <div className="no-output-message">
                      Output is pending or was not captured for this state.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Produced Data */}
            {data.producedData && Object.keys(data.producedData).length > 0 && (
              <div className="data-section produced">
                <div
                  className="section-header"
                  onClick={() => toggleSectionExpansion(`${data.stateId}-produced`)}
                >
                  <Zap size={14} />
                  <span>Produced Data (Extracted)</span>
                  {expandedSections.has(`${data.stateId}-produced`) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                {expandedSections.has(`${data.stateId}-produced`) && (
                  <div className="section-content">
                    {renderJsonValue(data.producedData, 0, true)}
                  </div>
                )}
              </div>
            )}

            {/* Tools Used */}
            {data.toolsUsed && data.toolsUsed.length > 0 && (
              <div className="data-section">
                <div className="section-header">
                  <Package size={14} />
                  <span>Tools Available</span>
                </div>
                <div className="tools-list">
                  {data.toolsUsed.map(tool => (
                    <span key={tool} className="tool-badge">{tool}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Transitions */}
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
                      <ArrowRight size={14} className="transition-arrow" />
                      <span className="transition-target">{target}</span>
                      {event === data.nextEvent && <span className="active-badge">taken</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
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

  const renderFlowDiagram = () => {
    const flowData = workflowContext.dataFlow;

    return (
      <div className="flow-diagram">
        <h4>Data Flow Visualization</h4>
        <div className="flow-chart">
          {executionData.map((state, idx) => {
            const incomingFlow = flowData.filter(f => f.to === state.stateId);
            const outgoingFlow = flowData.filter(f => f.from === state.stateId);

            return (
              <div key={state.stateId} className="flow-node">
                <div className="flow-node-header">
                  <span className="flow-node-number">#{idx + 1}</span>
                  <span className="flow-node-name">{state.stateName}</span>
                </div>

                {incomingFlow.length > 0 && (
                  <div className="flow-incoming">
                    <span className="flow-direction">← Receives from:</span>
                    {incomingFlow.map((flow, i) => (
                      <div key={i} className="flow-connection">
                        <span className="flow-source">{flow.from}</span>
                        <span className="flow-data-preview">
                          {renderJsonValue(flow.data, 0, true)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flow-state-data">
                  {state.producedData && Object.keys(state.producedData).length > 0 && (
                    <div className="flow-produced">
                      <span className="flow-label">Produces:</span>
                      {renderJsonValue(state.producedData, 0, true)}
                    </div>
                  )}
                </div>

                {outgoingFlow.length > 0 && (
                  <div className="flow-outgoing">
                    <span className="flow-direction">→ Sends to:</span>
                    {outgoingFlow.map((flow, i) => (
                      <div key={i} className="flow-connection">
                        <span className="flow-target">{flow.to}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
    <div className={`enhanced-state-viewer ${isDarkMode ? 'dark' : 'light'}`} ref={containerRef}>
      <div className="viewer-header">
        <div className="header-left">
          <h3>Enhanced State Execution Viewer</h3>
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
            Context
          </button>
          <button
            className={`tab-button ${activeTab === 'flow' ? 'active' : ''}`}
            onClick={() => setActiveTab('flow')}
          >
            <Network size={14} />
            Flow
          </button>
          <button
            className={`tab-button ${activeTab === 'raw' ? 'active' : ''}`}
            onClick={() => setActiveTab('raw')}
          >
            <FileText size={14} />
            Raw
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
          <span className="stat-item">
            <Cpu size={12} />
            States: {executionData.length}
          </span>
          <span className="stat-item">
            <Database size={12} />
            Context Keys: {Object.keys(workflowContext.stateContexts).length}
          </span>
          <span className="stat-item">
            <Activity size={12} />
            Snapshots: {workflowContext.memorySnapshots.length}
          </span>
          <span className="stat-item">
            <Link size={12} />
            Flows: {workflowContext.dataFlow.length}
          </span>
        </div>
      </div>

      <div className="viewer-content">
        {activeTab === 'timeline' && (
          <div className="timeline-view">
            {filteredData.length === 0 ? (
              <div className="empty-state">
                <Info size={24} />
                <span>No execution data available yet. Run a workflow to see the data flow.</span>
              </div>
            ) : (
              <>
                <div className="timeline-header">
                  <h4>Execution Timeline</h4>
                  <span className="timeline-hint">
                    Click on states to expand details. States with no output are marked with an info icon.
                  </span>
                </div>
                {filteredData.map((data, idx) => renderStateBlock(data, idx))}
              </>
            )}
          </div>
        )}

        {activeTab === 'context' && (
          <div className="context-view">
            <div className="context-section">
              <h4>Global Context</h4>
              <div className="context-content">
                {Object.keys(workflowContext.globalContext).length > 0 ? (
                  showRawJson ? (
                    <pre className="raw-json">{JSON.stringify(workflowContext.globalContext, null, 2)}</pre>
                  ) : (
                    renderJsonValue(workflowContext.globalContext)
                  )
                ) : (
                  <div className="no-data">No global context data yet</div>
                )}
              </div>
            </div>

            <div className="context-section">
              <h4>Accumulated State Contexts</h4>
              <div className="state-contexts">
                {Object.entries(workflowContext.stateContexts).length > 0 ? (
                  Object.entries(workflowContext.stateContexts).map(([stateId, context]) => (
                    <div key={stateId} className="context-item">
                      <div className="context-item-header">
                        <span className="context-state-id">{stateId}</span>
                        <button
                          className="copy-button small"
                          onClick={() => copyToClipboard(context, `context-${stateId}`)}
                        >
                          {copiedId === `context-${stateId}` ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                      </div>
                      <div className="context-item-content">
                        {showRawJson ? (
                          <pre className="raw-json">{JSON.stringify(context, null, 2)}</pre>
                        ) : (
                          renderJsonValue(context, 0, true)
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="no-data">No state context data captured yet</div>
                )}
              </div>
            </div>

            <div className="context-section">
              <h4>Memory Snapshots Over Time</h4>
              <div className="memory-timeline">
                {workflowContext.memorySnapshots.length > 0 ? (
                  workflowContext.memorySnapshots.map((snapshot, idx) => (
                    <div key={idx} className="memory-snapshot">
                      <div className="snapshot-header">
                        <span className="snapshot-time">{formatTimestamp(snapshot.timestamp)}</span>
                        <span className="snapshot-state">{snapshot.stateId}</span>
                      </div>
                      {snapshot.deltaChanges && (
                        <div className="snapshot-delta">
                          <span className="delta-label">Changes:</span>
                          {renderJsonValue(snapshot.deltaChanges, 0, true)}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="no-data">No memory snapshots captured yet</div>
                )}
              </div>
            </div>

            <div className="context-section">
              <h4>Context Inheritance Map</h4>
              <div className="inheritance-map">
                {Object.entries(workflowContext.contextInheritance).length > 0 ? (
                  Object.entries(workflowContext.contextInheritance).map(([stateId, inheritance]) => (
                    <div key={stateId} className="inheritance-item">
                      <div className="inheritance-header">{stateId}</div>
                      {inheritance.parent && (
                        <div className="inheritance-parent">
                          <span className="inheritance-label">Parent:</span>
                          <span className="inheritance-value">{inheritance.parent}</span>
                        </div>
                      )}
                      {inheritance.children.length > 0 && (
                        <div className="inheritance-children">
                          <span className="inheritance-label">Children:</span>
                          {inheritance.children.map(child => (
                            <span key={child} className="inheritance-value">{child}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="no-data">No inheritance data available</div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'flow' && (
          <div className="flow-view">
            {renderFlowDiagram()}

            <div className="flow-section">
              <h4>Data Flow Details</h4>
              <div className="flow-details">
                {workflowContext.dataFlow.length > 0 ? (
                  workflowContext.dataFlow.map((flow, idx) => (
                    <div key={idx} className="flow-detail-item">
                      <div className="flow-detail-header">
                        <span className="flow-from">{flow.from}</span>
                        <ArrowRight size={14} />
                        <span className="flow-to">{flow.to}</span>
                        <span className="flow-time">{formatTimestamp(flow.timestamp)}</span>
                      </div>
                      <div className="flow-detail-data">
                        {renderJsonValue(flow.data, 0, true)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="no-data">No data flow captured yet. Execute a workflow to see data movement.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'raw' && (
          <div className="raw-view">
            <div className="raw-controls">
              <button
                className="copy-button"
                onClick={() => copyToClipboard({
                  executionData,
                  workflowContext,
                  metadata: {
                    execId,
                    timestamp: Date.now(),
                    stateCount: executionData.length
                  }
                }, 'raw-data')}
              >
                <Copy size={14} />
                Copy All Data
              </button>
            </div>
            <pre className="raw-json">
              {JSON.stringify({
                executionData,
                workflowContext,
                metadata: {
                  execId,
                  timestamp: Date.now(),
                  stateCount: executionData.length,
                  contextSize: Object.keys(workflowContext.stateContexts).length,
                  flowCount: workflowContext.dataFlow.length
                }
              }, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Detail Panel for Selected State */}
      {selectedStateForDetail && (
        <div className="detail-panel">
          <div className="detail-header">
            <h4>State Flow Details: {selectedStateForDetail}</h4>
            <button onClick={() => setSelectedStateForDetail(null)}>×</button>
          </div>
          <div className="detail-content">
            {(() => {
              const state = executionData.find(s => s.stateId === selectedStateForDetail);
              const relationships = stateRelationships[selectedStateForDetail];
              const incomingData = workflowContext.dataFlow.filter(f => f.to === selectedStateForDetail);
              const outgoingData = workflowContext.dataFlow.filter(f => f.from === selectedStateForDetail);

              return (
                <>
                  <div className="detail-section">
                    <h5>Incoming Data</h5>
                    {incomingData.length > 0 ? (
                      incomingData.map((flow, idx) => (
                        <div key={idx} className="detail-flow">
                          <span className="detail-source">From: {flow.from}</span>
                          <div className="detail-data">{renderJsonValue(flow.data, 0, true)}</div>
                        </div>
                      ))
                    ) : (
                      <span className="no-data">No incoming data</span>
                    )}
                  </div>

                  <div className="detail-section">
                    <h5>State Processing</h5>
                    <div className="detail-processing">
                      <div>Input: {state?.input ? renderJsonValue(state.input, 0, true) : 'None'}</div>
                      <div>Output: {state?.output ? renderJsonValue(state.output, 0, true) : 'None'}</div>
                      <div>Duration: {formatDuration(state?.duration)}</div>
                    </div>
                  </div>

                  <div className="detail-section">
                    <h5>Outgoing Data</h5>
                    {outgoingData.length > 0 ? (
                      outgoingData.map((flow, idx) => (
                        <div key={idx} className="detail-flow">
                          <span className="detail-target">To: {flow.to}</span>
                        </div>
                      ))
                    ) : (
                      <span className="no-data">No outgoing data</span>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedStateDataViewer;