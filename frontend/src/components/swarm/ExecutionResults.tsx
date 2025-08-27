// ExecutionResults.tsx - Better display for results and artifacts
import React, { useState } from 'react';
import { SwarmExecutionResult, Artifact } from '../../types/swarm';
import './ExecutionResults.css';

interface ExecutionResultsProps {
  result: SwarmExecutionResult;
}

const ExecutionResults: React.FC<ExecutionResultsProps> = ({ result }) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'artifacts' | 'raw'>('summary');
  const [copiedArtifact, setCopiedArtifact] = useState<string | null>(null);

  const copyToClipboard = async (content: string, name: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedArtifact(name);
      setTimeout(() => setCopiedArtifact(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const downloadArtifact = (artifact: Artifact) => {
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = artifact.title || (artifact as any).name || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getLanguageFromFilename = (filename: string): string => {
    const extension = filename.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'py': 'python',
      'python': 'python',
      'js': 'javascript',
      'javascript': 'javascript',
      'ts': 'typescript',
      'typescript': 'typescript',
      'jsx': 'javascript',
      'tsx': 'typescript',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'go': 'go',
      'rs': 'rust',
      'rb': 'ruby',
      'php': 'php',
      'swift': 'swift',
      'kt': 'kotlin',
      'html': 'html',
      'css': 'css',
      'sql': 'sql',
      'sh': 'bash',
      'bash': 'bash',
      'json': 'json',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'md': 'markdown',
      'txt': 'plaintext'
    };
    return languageMap[extension || ''] || 'plaintext';
  };

  const formatResult = (text: string): string => {
    // Remove excessive newlines and clean up formatting
    return text
      .replace(/\n{3,}/g, '\n\n')  // Replace 3+ newlines with 2
      .trim();
  };

  return (
    <div className="execution-results">
      <div className="results-header">
        <h3>✅ Execution Results</h3>
        <div className="results-stats">
          <span className="stat-item">
            <span className="stat-label">Agents:</span>
            <span className="stat-value">{result.agent_sequence.length}</span>
          </span>
          <span className="stat-item">
            <span className="stat-label">Handoffs:</span>
            <span className="stat-value">{result.handoffs}</span>
          </span>
          <span className="stat-item">
            <span className="stat-label">Tokens:</span>
            <span className="stat-value">{result.tokens_used || 0}</span>
          </span>
          {result.artifacts.length > 0 && (
            <span className="stat-item">
              <span className="stat-label">Artifacts:</span>
              <span className="stat-value">{result.artifacts.length}</span>
            </span>
          )}
        </div>
      </div>

      <div className="results-tabs">
        <button
          className={`tab-button ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          Summary
        </button>
        {result.artifacts.length > 0 && (
          <button
            className={`tab-button ${activeTab === 'artifacts' ? 'active' : ''}`}
            onClick={() => setActiveTab('artifacts')}
          >
            Artifacts ({result.artifacts.length})
          </button>
        )}
        <button
          className={`tab-button ${activeTab === 'raw' ? 'active' : ''}`}
          onClick={() => setActiveTab('raw')}
        >
          Raw Output
        </button>
      </div>

      <div className="results-content">
        {activeTab === 'summary' && (
          <div className="summary-tab">
            <div className="result-text">
              {formatResult(result.result || '').split('\n').map((paragraph, index) => {
                // Check if this is a code block
                if (paragraph.startsWith('```')) {
                  return null; // Skip code blocks in summary
                }
                
                // Check for headers (lines starting with #)
                if (paragraph.startsWith('#')) {
                  const level = paragraph.match(/^#+/)?.[0].length || 1;
                  const text = paragraph.replace(/^#+\s*/, '');
                  const HeaderTag = `h${Math.min(level + 2, 6)}` as keyof JSX.IntrinsicElements;
                  return <HeaderTag key={index}>{text}</HeaderTag>;
                }
                
                // Check for bullet points
                if (paragraph.trim().startsWith('-') || paragraph.trim().startsWith('*') || /^\d+\./.test(paragraph.trim())) {
                  return (
                    <ul key={index} className="result-list">
                      <li>{paragraph.replace(/^[-*\d.]+\s*/, '')}</li>
                    </ul>
                  );
                }
                
                // Regular paragraph
                if (paragraph.trim()) {
                  return <p key={index} className="result-paragraph">{paragraph}</p>;
                }
                
                return null;
              })}
            </div>
            
            <div className="agent-flow">
              <h4>Agent Execution Flow</h4>
              <div className="flow-chain">
                {result.agent_sequence.map((agent, index) => (
                  <React.Fragment key={index}>
                    <div className="flow-agent">
                      <span className="agent-icon">
                        {agent === 'researcher' && '🔍'}
                        {agent === 'developer' && '💻'}
                        {agent === 'architect' && '🏗️'}
                        {agent === 'tester' && '🧪'}
                        {agent === 'documenter' && '📝'}
                        {agent === 'reviewer' && '✅'}
                      </span>
                      <span className="agent-name">{agent}</span>
                    </div>
                    {index < result.agent_sequence.length - 1 && (
                      <span className="flow-arrow">→</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'artifacts' && (
          <div className="artifacts-tab">
            {result.artifacts.length === 0 ? (
              <p className="no-artifacts">No artifacts generated</p>
            ) : (
              <div className="artifacts-grid">
                {result.artifacts.map((artifact, index) => (
                  <div key={index} className="artifact-card">
                    <div className="artifact-header">
                      <div className="artifact-info">
                        <span className="artifact-icon">
                          {artifact.type === 'code' ? '📄' : '📋'}
                        </span>
                        <span className="artifact-name">{artifact.title || (artifact as any).name}</span>
                      </div>
                      <div className="artifact-actions">
                        <button
                          className="action-button"
                          onClick={() => copyToClipboard(artifact.content, artifact.title || (artifact as any).name)}
                          title="Copy to clipboard"
                        >
                          {copiedArtifact === (artifact.title || (artifact as any).name) ? '✓' : '📋'}
                        </button>
                        <button
                          className="action-button"
                          onClick={() => downloadArtifact(artifact)}
                          title="Download"
                        >
                          ⬇️
                        </button>
                      </div>
                    </div>
                    <div className="artifact-content">
                    <pre className={`code-block language-${getLanguageFromFilename(artifact.title || (artifact as any).name || '')}`}>
                        <code>{artifact.content}</code>
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'raw' && (
          <div className="raw-tab">
            <pre className="raw-output">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExecutionResults;