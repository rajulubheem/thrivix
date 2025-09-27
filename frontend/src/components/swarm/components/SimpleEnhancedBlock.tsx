import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import {
  Settings,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  Edit3,
  Trash2,
  Copy,
  GitBranch
} from 'lucide-react';

interface SimpleEnhancedBlockData {
  type: string;
  name: string;
  description?: string;
  agent_role?: string;
  tools?: string[];
  transitions?: Record<string, string>;
  onUpdate?: (id: string, updates: any) => void;
  onDelete?: (id: string) => void;
  isActive?: boolean;
  isError?: boolean;
}

const BLOCK_STYLES: Record<string, { bg: string; border: string; icon: string }> = {
  analysis: { bg: '#EBF5FF', border: '#3B82F6', icon: '🔍' },
  tool_call: { bg: '#D1FAE5', border: '#10B981', icon: '🔧' },
  decision: { bg: '#FEF3C7', border: '#F59E0B', icon: '🎯' },
  validation: { bg: '#EDE9FE', border: '#8B5CF6', icon: '✓' },
  transformation: { bg: '#FCE7F3', border: '#EC4899', icon: '🔄' },
  parallel: { bg: '#ECFCCB', border: '#84CC16', icon: '⚡' },
  loop: { bg: '#FED7AA', border: '#F97316', icon: '🔁' },
  human: { bg: '#E0E7FF', border: '#6366F1', icon: '👤' },
  final: { bg: '#FEE2E2', border: '#EF4444', icon: '🏁' },
  default: { bg: '#F3F4F6', border: '#9CA3AF', icon: '📦' }
};

export const SimpleEnhancedBlock: React.FC<NodeProps<SimpleEnhancedBlockData>> = ({
  id,
  data,
  selected
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editedName, setEditedName] = useState(data.name || 'Unnamed Block');
  const [editedDescription, setEditedDescription] = useState(data.description || '');
  const [editedAgentRole, setEditedAgentRole] = useState(data.agent_role || '');
  const [selectedTools, setSelectedTools] = useState<string[]>(data.tools || []);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const style = BLOCK_STYLES[data.type] || BLOCK_STYLES.default;

  useEffect(() => {
    if (isEditing && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = useCallback(() => {
    if (data.onUpdate) {
      data.onUpdate(id, {
        name: editedName,
        description: editedDescription,
        agent_role: editedAgentRole,
        tools: selectedTools
      });
    }
    setIsEditing(false);
  }, [id, editedName, editedDescription, editedAgentRole, selectedTools, data]);

  const handleCancel = useCallback(() => {
    setEditedName(data.name || 'Unnamed Block');
    setEditedDescription(data.description || '');
    setEditedAgentRole(data.agent_role || '');
    setSelectedTools(data.tools || []);
    setIsEditing(false);
  }, [data]);

  const handleDelete = useCallback(() => {
    if (data.onDelete) {
      data.onDelete(id);
    }
  }, [id, data]);

  return (
    <div
      style={{
        backgroundColor: style.bg,
        borderColor: style.border,
        borderWidth: '2px',
        borderStyle: 'solid',
        borderRadius: '8px',
        minWidth: '280px',
        minHeight: '100px',
        position: 'relative',
        boxShadow: selected ? '0 0 0 2px rgba(59, 130, 246, 0.5)' : '0 1px 3px rgba(0,0,0,0.1)'
      }}
    >
      {/* Connection Handles */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: '#9CA3AF',
          width: '10px',
          height: '10px',
          border: '2px solid white',
          top: '-5px'
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source"
        style={{
          background: '#10B981',
          width: '10px',
          height: '10px',
          border: '2px solid white',
          bottom: '-5px'
        }}
      />

      {/* Decision block side handles */}
      {data.type === 'decision' && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="success"
            style={{
              background: '#10B981',
              width: '10px',
              height: '10px',
              border: '2px solid white',
              right: '-5px',
              top: '30%'
            }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="failure"
            style={{
              background: '#EF4444',
              width: '10px',
              height: '10px',
              border: '2px solid white',
              right: '-5px',
              top: '70%'
            }}
          />
        </>
      )}

      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: `1px solid ${style.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'move'
        }}
        className="drag-handle"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <span style={{ fontSize: '18px' }}>{style.icon}</span>
          {isEditing ? (
            <input
              ref={nameInputRef}
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              style={{
                background: 'white',
                border: '1px solid #D1D5DB',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '14px',
                fontWeight: '500',
                flex: 1
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') handleCancel();
              }}
            />
          ) : (
            <span style={{ fontWeight: '500', fontSize: '14px' }}>
              {data.name || 'Unnamed Block'}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          {!isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(true)}
                style={{
                  padding: '4px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '4px'
                }}
                title="Edit"
              >
                <Edit3 size={14} />
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                  padding: '4px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '4px'
                }}
                title={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSave}
                style={{
                  padding: '4px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  color: '#10B981'
                }}
                title="Save"
              >
                <Check size={14} />
              </button>
              <button
                onClick={handleCancel}
                style={{
                  padding: '4px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  color: '#EF4444'
                }}
                title="Cancel"
              >
                <X size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '12px' }}>
        {/* Type Badge */}
        <div style={{ marginBottom: '8px' }}>
          <span
            style={{
              background: style.border,
              color: 'white',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: '600',
              textTransform: 'uppercase'
            }}
          >
            {data.type}
          </span>
          {data.agent_role && (
            <span style={{ marginLeft: '8px', fontSize: '12px', color: '#6B7280' }}>
              Agent: {data.agent_role}
            </span>
          )}
        </div>

        {/* Description */}
        {(data.description || isEditing) && (
          <div style={{ marginTop: '8px' }}>
            {isEditing ? (
              <textarea
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                placeholder="Add description..."
                style={{
                  width: '100%',
                  minHeight: '50px',
                  padding: '6px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '4px',
                  fontSize: '12px',
                  resize: 'vertical'
                }}
              />
            ) : (
              <p style={{ fontSize: '12px', color: '#4B5563' }}>
                {data.description}
              </p>
            )}
          </div>
        )}

        {/* Tools */}
        {data.tools && data.tools.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#6B7280', marginBottom: '4px' }}>
              TOOLS
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {data.tools.map((tool: string) => (
                <span
                  key={tool}
                  style={{
                    background: '#DBEAFE',
                    color: '#1E40AF',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '11px'
                  }}
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Expanded Content */}
        {isExpanded && (
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #E5E7EB' }}>
            {/* Agent Role Editor */}
            {isEditing && (
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', fontWeight: '600', color: '#6B7280' }}>
                  AGENT ROLE
                </label>
                <input
                  value={editedAgentRole}
                  onChange={(e) => setEditedAgentRole(e.target.value)}
                  placeholder="e.g., Data Analyst, Validator..."
                  style={{
                    width: '100%',
                    marginTop: '4px',
                    padding: '6px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                />
              </div>
            )}

            {/* Transitions */}
            {data.transitions && Object.keys(data.transitions).length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#6B7280', marginBottom: '4px' }}>
                  TRANSITIONS
                </div>
                {Object.entries(data.transitions).map(([event, target]) => (
                  <div key={event} style={{ fontSize: '11px', color: '#4B5563' }}>
                    {event} → {target || 'undefined'}
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
              <button
                onClick={handleDelete}
                style={{
                  padding: '4px 8px',
                  background: '#FEE2E2',
                  color: '#DC2626',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Delete Block"
              >
                <Trash2 size={12} />
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Status Indicators */}
      {data.isActive && (
        <div
          style={{
            position: 'absolute',
            top: '-8px',
            right: '-8px',
            width: '16px',
            height: '16px',
            background: '#10B981',
            borderRadius: '50%',
            border: '2px solid white',
            animation: 'pulse 2s infinite'
          }}
        />
      )}
      {data.isError && (
        <div
          style={{
            position: 'absolute',
            top: '-8px',
            right: '-8px',
            width: '16px',
            height: '16px',
            background: '#EF4444',
            borderRadius: '50%',
            border: '2px solid white'
          }}
        />
      )}
    </div>
  );
};