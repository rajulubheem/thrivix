import React, { useState, useEffect } from 'react';
import { X, Download, ExternalLink, FileText, Copy, Check } from 'lucide-react';
import './FileViewer.css';

interface FileViewerProps {
  fileName: string;
  onClose?: () => void;
}

export const FileViewer: React.FC<FileViewerProps> = ({ fileName, onClose }) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fileInfo, setFileInfo] = useState<{
    size: number;
    lines: number;
  } | null>(null);

  useEffect(() => {
    fetchFileContent();
  }, [fileName]);

  const fetchFileContent = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(
        `http://localhost:8000/api/v1/file-viewer/view/${fileName}?format=json`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to load file: ${response.statusText}`);
      }
      
      const data = await response.json();
      setContent(data.content);
      setFileInfo({
        size: data.size,
        lines: data.lines
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    window.open(`http://localhost:8000/api/v1/file-viewer/download/${fileName}`, '_blank');
  };

  const handleViewInNewTab = () => {
    window.open(`http://localhost:8000/api/v1/file-viewer/view/${fileName}?format=html`, '_blank');
  };

  const handleCopyContent = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="file-viewer-overlay">
      <div className="file-viewer-container">
        <div className="file-viewer-header">
          <div className="file-info">
            <FileText size={20} />
            <h2>{fileName}</h2>
            {fileInfo && (
              <span className="file-meta">
                {fileInfo.size} bytes • {fileInfo.lines} lines
              </span>
            )}
          </div>
          
          <div className="file-actions">
            <button 
              className="action-btn"
              onClick={handleCopyContent}
              title="Copy content"
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            
            <button 
              className="action-btn"
              onClick={handleViewInNewTab}
              title="Open in new tab"
            >
              <ExternalLink size={18} />
              New Tab
            </button>
            
            <button 
              className="action-btn primary"
              onClick={handleDownload}
              title="Download file"
            >
              <Download size={18} />
              Download
            </button>
            
            {onClose && (
              <button 
                className="close-btn"
                onClick={onClose}
                title="Close viewer"
              >
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        <div className="file-viewer-content">
          {loading && (
            <div className="loading-state">
              <div className="spinner" />
              <p>Loading file content...</p>
            </div>
          )}
          
          {error && (
            <div className="error-state">
              <p>❌ {error}</p>
              <button onClick={fetchFileContent}>Retry</button>
            </div>
          )}
          
          {!loading && !error && (
            <pre className="file-content">{content}</pre>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileViewer;