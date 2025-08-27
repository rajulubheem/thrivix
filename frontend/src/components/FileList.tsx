import React, { useState, useEffect } from 'react';
import { FileText, Download, Eye, Trash2, RefreshCw } from 'lucide-react';
import { FileViewer } from './FileViewer';
import './FileList.css';

interface FileItem {
  path: string;
  size: number;
  lines: number;
  preview: string;
}

export const FileList: React.FC = () => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8000/api/v1/file-viewer/list');
      const data = await response.json();
      setFiles(data.files || []);
    } catch (error) {
      console.error('Failed to fetch files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (path: string) => {
    if (!confirm(`Delete file ${path}?`)) return;
    
    try {
      const response = await fetch(
        `http://localhost:8000/api/v1/file-viewer/delete/${path}`,
        { method: 'DELETE' }
      );
      
      if (response.ok) {
        await fetchFiles();
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Delete all files? This cannot be undone.')) return;
    
    try {
      const response = await fetch(
        'http://localhost:8000/api/v1/file-viewer/clear',
        { method: 'DELETE' }
      );
      
      if (response.ok) {
        setFiles([]);
      }
    } catch (error) {
      console.error('Failed to clear files:', error);
    }
  };

  return (
    <div className="file-list-container">
      <div className="file-list-header">
        <h3>
          <FileText size={20} />
          Generated Files ({files.length})
        </h3>
        <div className="file-list-actions">
          <button className="refresh-btn" onClick={fetchFiles} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
            Refresh
          </button>
          {files.length > 0 && (
            <button className="clear-btn" onClick={handleClearAll}>
              <Trash2 size={16} />
              Clear All
            </button>
          )}
        </div>
      </div>

      {files.length === 0 ? (
        <div className="empty-state">
          <FileText size={48} />
          <p>No files generated yet</p>
          <span>Files created by agents will appear here</span>
        </div>
      ) : (
        <div className="file-list">
          {files.map((file) => (
            <div key={file.path} className="file-item">
              <div className="file-item-info">
                <div className="file-name">
                  <FileText size={16} />
                  <span>{file.path}</span>
                </div>
                <div className="file-meta">
                  {file.size} bytes • {file.lines} lines
                </div>
                <div className="file-preview">
                  {file.preview.substring(0, 100)}...
                </div>
              </div>
              
              <div className="file-item-actions">
                <button
                  className="view-btn"
                  onClick={() => setSelectedFile(file.path)}
                  title="View full content"
                >
                  <Eye size={16} />
                </button>
                
                <a
                  href={`http://localhost:8000/api/v1/file-viewer/download/${file.path}`}
                  className="download-btn"
                  download
                  title="Download file"
                >
                  <Download size={16} />
                </a>
                
                <button
                  className="delete-btn"
                  onClick={() => handleDelete(file.path)}
                  title="Delete file"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedFile && (
        <FileViewer
          fileName={selectedFile}
          onClose={() => setSelectedFile(null)}
        />
      )}
    </div>
  );
};

export default FileList;