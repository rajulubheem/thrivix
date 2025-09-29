import React, { useEffect, useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import {
  Bot,
  BrainCircuit,
  Search,
  Wrench,
  Settings,
  CheckCircle,
  AlertCircle,
  Loader,
  ChevronDown,
  ChevronRight,
  Play,
  Pause,
  MoreVertical
} from 'lucide-react';

const AgentNode: React.FC<NodeProps> = ({ data, selected }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [pulseAnimation, setPulseAnimation] = useState(false);

  const getNodeStyle = () => {
    const baseStyle: React.CSSProperties = {
      padding: '16px',
      borderRadius: '12px',
      border: '2px solid',
      background: data.isDarkMode
        ? 'linear-gradient(135deg, #1e293b 0%, #334155 100%)'
        : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
      borderColor: selected ? '#3b82f6' : data.isDarkMode ? '#475569' : '#e2e8f0',
      boxShadow: selected
        ? '0 0 0 3px rgba(59, 130, 246, 0.15), 0 10px 25px rgba(0,0,0,0.1)'
        : '0 4px 12px rgba(0,0,0,0.05)',
      minWidth: '280px',
      maxWidth: '350px',
      transition: 'all 0.3s ease',
      position: 'relative' as const,
      cursor: 'pointer',
    };

    if (data.status === 'running' || data.status === 'active') {
      baseStyle.borderColor = '#fbbf24';
      baseStyle.boxShadow = '0 0 20px rgba(251, 191, 36, 0.3)';
      baseStyle.animation = 'pulse 2s infinite';
    } else if (data.status === 'completed') {
      baseStyle.borderColor = '#10b981';
      baseStyle.boxShadow = '0 0 15px rgba(16, 185, 129, 0.2)';
    } else if (data.status === 'error') {
      baseStyle.borderColor = '#ef4444';
      baseStyle.boxShadow = '0 0 15px rgba(239, 68, 68, 0.2)';
    }

    return baseStyle;
  };

  const getStatusIcon = () => {
    switch (data.status) {
      case 'running':
      case 'active':
        return <Loader className="animate-spin" size={16} color="#fbbf24" />;
      case 'completed':
        return <CheckCircle size={16} color="#10b981" />;
      case 'error':
        return <AlertCircle size={16} color="#ef4444" />;
      default:
        return null;
    }
  };

  const getAgentIcon = () => {
    const iconProps = {
      size: 20,
      color: data.isDarkMode ? '#60a5fa' : '#3b82f6'
    };

    switch (data.agent_role?.toLowerCase()) {
      case 'analyzer':
      case 'analysis':
        return <BrainCircuit {...iconProps} />;
      case 'researcher':
      case 'search':
        return <Search {...iconProps} />;
      case 'executor':
      case 'tool':
        return <Wrench {...iconProps} />;
      default:
        return <Bot {...iconProps} />;
    }
  };

  useEffect(() => {
    if (data.status === 'running' || data.status === 'active') {
      setPulseAnimation(true);
    } else {
      setPulseAnimation(false);
    }
  }, [data.status]);

  const toolsToDisplay = data.tools || data.toolsPlanned || data.selected_tools || [];

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: data.isDarkMode ? '#60a5fa' : '#3b82f6',
          width: '10px',
          height: '10px',
          border: '2px solid white',
          top: '-5px',
        }}
      />

      <div style={getNodeStyle()} onClick={() => setIsExpanded(!isExpanded)}>
        {/* Status Badge */}
        {data.status && (
          <div
            style={{
              position: 'absolute',
              top: '-10px',
              right: '-10px',
              background: data.isDarkMode ? '#1e293b' : 'white',
              borderRadius: '12px',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              border: `1px solid ${data.isDarkMode ? '#475569' : '#e2e8f0'}`,
            }}
          >
            {getStatusIcon()}
          </div>
        )}

        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {getAgentIcon()}
            <div>
              <div style={{
                fontWeight: '600',
                fontSize: '14px',
                color: data.isDarkMode ? '#f1f5f9' : '#1e293b',
              }}>
                {data.name || data.label || 'Agent'}
              </div>
              {data.agent_role && (
                <div style={{
                  fontSize: '11px',
                  color: data.isDarkMode ? '#94a3b8' : '#64748b',
                  textTransform: 'capitalize',
                }}>
                  {data.agent_role}
                </div>
              )}
            </div>
          </div>

          <button
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              color: data.isDarkMode ? '#64748b' : '#94a3b8',
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (data.onSettings) {
                data.onSettings();
              }
            }}
          >
            <MoreVertical size={16} />
          </button>
        </div>

        {/* Description */}
        {data.description && (
          <div style={{
            fontSize: '12px',
            color: data.isDarkMode ? '#cbd5e1' : '#64748b',
            marginBottom: '12px',
            lineHeight: '1.4',
            display: '-webkit-box',
            WebkitLineClamp: isExpanded ? 'unset' : 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {data.description}
          </div>
        )}

        {/* Tools Section */}
        {toolsToDisplay.length > 0 && (
          <div style={{
            marginTop: '8px',
            paddingTop: '8px',
            borderTop: `1px solid ${data.isDarkMode ? '#334155' : '#e2e8f0'}`,
          }}>
            <div
              style={{
                fontSize: '11px',
                color: data.isDarkMode ? '#94a3b8' : '#64748b',
                marginBottom: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Tools ({toolsToDisplay.length})
            </div>

            {(isExpanded || toolsToDisplay.length <= 3) && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px',
              }}>
                {toolsToDisplay.slice(0, isExpanded ? undefined : 3).map((tool: string, idx: number) => (
                  <span
                    key={idx}
                    style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      background: data.isDarkMode ? '#1e3a8a' : '#dbeafe',
                      color: data.isDarkMode ? '#93c5fd' : '#1e40af',
                      borderRadius: '4px',
                      border: `1px solid ${data.isDarkMode ? '#1e40af' : '#93c5fd'}`,
                    }}
                  >
                    {tool}
                  </span>
                ))}
                {!isExpanded && toolsToDisplay.length > 3 && (
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      color: data.isDarkMode ? '#64748b' : '#94a3b8',
                    }}
                  >
                    +{toolsToDisplay.length - 3} more
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {data.showControls && (
          <div style={{
            marginTop: '12px',
            paddingTop: '12px',
            borderTop: `1px solid ${data.isDarkMode ? '#334155' : '#e2e8f0'}`,
            display: 'flex',
            gap: '8px',
          }}>
            <button
              style={{
                flex: 1,
                padding: '6px 12px',
                background: data.isDarkMode ? '#1e40af' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (data.onExecute) {
                  data.onExecute();
                }
              }}
            >
              {data.status === 'running' ? <Pause size={12} /> : <Play size={12} />}
              {data.status === 'running' ? 'Pause' : 'Execute'}
            </button>
            <button
              style={{
                padding: '6px',
                background: 'transparent',
                color: data.isDarkMode ? '#64748b' : '#94a3b8',
                border: `1px solid ${data.isDarkMode ? '#334155' : '#e2e8f0'}`,
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (data.onSettings) {
                  data.onSettings();
                }
              }}
            >
              <Settings size={12} />
            </button>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: data.isDarkMode ? '#60a5fa' : '#3b82f6',
          width: '10px',
          height: '10px',
          border: '2px solid white',
          bottom: '-5px',
        }}
      />
    </>
  );
};

export default AgentNode;