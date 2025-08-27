import React, { useState } from 'react';
import './ArtifactsViewer.css';

// Icon components
const FileCode = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <line x1="16" y1="13" x2="8" y2="13"></line>
    <line x1="16" y1="17" x2="8" y2="17"></line>
    <polyline points="10 9 9 9 8 9"></polyline>
  </svg>
);

const Copy = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

const Check = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

const Download = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
);

const Maximize = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
  </svg>
);

interface CodeFile {
  name: string;
  language: string;
  content: string;
  description?: string;
}

interface ArtifactsViewerProps {
  artifacts: CodeFile[];
  title?: string;
  agentName?: string;
  onClose?: () => void;
}

const ArtifactsViewer: React.FC<ArtifactsViewerProps> = ({ 
  artifacts, 
  title = "Generated Code",
  agentName,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  if (!artifacts || artifacts.length === 0) {
    return null;
  }

  const handleCopy = (content: string, index: number) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleDownload = (file: CodeFile) => {
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = () => {
    artifacts.forEach(file => handleDownload(file));
  };

  const getLanguageColor = (language: string) => {
    const colors: Record<string, string> = {
      javascript: '#f7df1e',
      typescript: '#3178c6',
      python: '#3776ab',
      json: '#292929',
      html: '#e34c26',
      css: '#563d7c',
      sql: '#336791',
      bash: '#4eaa25',
      markdown: '#083fa1',
      yaml: '#cb171e'
    };
    return colors[language.toLowerCase()] || '#6b7280';
  };

  return (
    <div className={`artifacts-viewer ${isExpanded ? 'expanded' : ''}`}>
      {/* Header */}
      <div className="artifacts-header">
        <div className="artifacts-title">
          <FileCode size={20} />
          <span>{title}</span>
          {agentName && <span className="agent-badge">{agentName}</span>}
        </div>
        <div className="artifacts-actions">
          <button 
            className="action-btn"
            onClick={handleDownloadAll}
            title="Download all files"
          >
            <Download size={16} />
          </button>
          <button 
            className="action-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            title="Expand/Collapse"
          >
            <Maximize size={16} />
          </button>
          {onClose && (
            <button 
              className="action-btn close-btn"
              onClick={onClose}
              title="Close"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="artifacts-tabs">
        {artifacts.map((file, index) => (
          <button
            key={index}
            className={`tab ${activeTab === index ? 'active' : ''}`}
            onClick={() => setActiveTab(index)}
          >
            <span 
              className="language-dot" 
              style={{ backgroundColor: getLanguageColor(file.language) }}
            />
            <span className="tab-name">{file.name}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="artifacts-content">
        {artifacts[activeTab] && (
          <>
            {/* File Header */}
            <div className="file-header">
              <div className="file-info">
                <span className="file-name">{artifacts[activeTab].name}</span>
                <span className="file-language">{artifacts[activeTab].language}</span>
                {artifacts[activeTab].description && (
                  <span className="file-description">{artifacts[activeTab].description}</span>
                )}
              </div>
              <div className="file-actions">
                <button
                  className="copy-btn"
                  onClick={() => handleCopy(artifacts[activeTab].content, activeTab)}
                  title="Copy code"
                >
                  {copiedIndex === activeTab ? (
                    <>
                      <Check size={14} />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                <button
                  className="download-btn"
                  onClick={() => handleDownload(artifacts[activeTab])}
                  title="Download file"
                >
                  <Download size={14} />
                  <span>Download</span>
                </button>
              </div>
            </div>

            {/* Code Display */}
            <div className="code-container">
              <pre className={`language-${artifacts[activeTab].language}`}>
                <code>{artifacts[activeTab].content}</code>
              </pre>
            </div>
          </>
        )}
      </div>

      {/* Footer with file count */}
      <div className="artifacts-footer">
        <span className="file-count">
          {artifacts.length} {artifacts.length === 1 ? 'file' : 'files'} generated
        </span>
      </div>
    </div>
  );
};

export default ArtifactsViewer;