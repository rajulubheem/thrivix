import React, { useState } from 'react';

interface ImportStateMachineDialogProps {
  isOpen: boolean;
  isDarkMode: boolean;
  onClose: () => void;
  onImport: (machine: any, isProfessional: boolean) => void;
}

export const ImportStateMachineDialog: React.FC<ImportStateMachineDialogProps> = ({
  isOpen,
  isDarkMode,
  onClose,
  onImport,
}) => {
  const [importJsonText, setImportJsonText] = useState('');

  if (!isOpen) return null;

  const handleImport = (isProfessional: boolean) => {
    try {
      const machine = JSON.parse(importJsonText);
      onImport(machine, isProfessional);
      setImportJsonText('');
      onClose();
    } catch (e) {
      alert('Invalid JSON format. Please check your input.');
      console.error('JSON parse error:', e);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      <div style={{
        background: isDarkMode ? '#1e293b' : 'white',
        borderRadius: 12,
        padding: 24,
        width: '90%',
        maxWidth: 800,
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{
          margin: '0 0 16px 0',
          fontSize: 18,
          fontWeight: 600,
          color: isDarkMode ? '#e5e7eb' : '#111827'
        }}>
          Import State Machine
        </h3>

        <p style={{
          margin: '0 0 16px 0',
          fontSize: 14,
          color: isDarkMode ? '#9ca3af' : '#6b7280'
        }}>
          Paste your state machine JSON from the backend. The structure should include states and edges arrays.
        </p>

        <textarea
          value={importJsonText}
          onChange={(e) => setImportJsonText(e.target.value)}
          placeholder={`{
  "name": "Dynamic Workflow",
  "initial_state": "initialization",
  "states": [
    {
      "id": "state1",
      "name": "State Name",
      "type": "analysis",
      "description": "Description",
      "agent_role": "Role",
      "tools": ["tool1", "tool2"],
      "transitions": {...}
    }
  ],
  "edges": [
    {
      "source": "state1",
      "target": "state2",
      "event": "success"
    }
  ]
}`}
          style={{
            flex: 1,
            width: '100%',
            minHeight: 300,
            padding: 12,
            borderRadius: 8,
            border: `1px solid ${isDarkMode ? '#475569' : '#e5e7eb'}`,
            background: isDarkMode ? '#0f172a' : '#f9fafb',
            color: isDarkMode ? '#e5e7eb' : '#111827',
            fontFamily: 'monospace',
            fontSize: 12,
            resize: 'vertical'
          }}
        />

        <div style={{
          display: 'flex',
          gap: 8,
          marginTop: 16,
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: `1px solid ${isDarkMode ? '#475569' : '#e5e7eb'}`,
              background: 'transparent',
              color: isDarkMode ? '#e5e7eb' : '#374151',
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            Cancel
          </button>

          <button
            onClick={() => handleImport(true)}
            disabled={!importJsonText.trim()}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              cursor: importJsonText.trim() ? 'pointer' : 'not-allowed',
              opacity: importJsonText.trim() ? 1 : 0.5,
              fontSize: 14
            }}
          >
            Import as Professional Blocks
          </button>

          <button
            onClick={() => handleImport(false)}
            disabled={!importJsonText.trim()}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              background: '#10b981',
              color: 'white',
              border: 'none',
              cursor: importJsonText.trim() ? 'pointer' : 'not-allowed',
              opacity: importJsonText.trim() ? 1 : 0.5,
              fontSize: 14
            }}
          >
            Import as Simple Blocks
          </button>
        </div>
      </div>
    </div>
  );
};