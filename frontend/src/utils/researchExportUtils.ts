/**
 * Research Export Utilities
 * Shared utilities for exporting research content across all research views
 */

export interface Source {
  id: string;
  number?: number;
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  favicon?: string;
  thumbnail?: string;
  publishDate?: string;
  author?: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  sources?: Source[];
  thoughts?: any[];
  id?: string;
  mode?: string;
}

/**
 * Convert markdown to HTML with proper formatting
 */
export const markdownToHtml = (markdown: string): string => {
  let html = markdown;
  
  // Escape HTML entities first to prevent XSS
  html = html.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // Headers (must come before other replacements)
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Bold (before italic to handle **text** correctly)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  
  // Italic (use negative lookahead to avoid matching bold markers)
  html = html.replace(/\*(?!\*)(.+?)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/_(?!_)(.+?)_(?!_)/g, '<em>$1</em>');
  
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  
  // Lists
  html = html.replace(/^\* (.+)$/gim, '<li>$1</li>');
  html = html.replace(/^- (.+)$/gim, '<li>$1</li>');
  html = html.replace(/^\d+\. (.+)$/gim, '<li>$1</li>');
  
  // Wrap consecutive list items in ul/ol tags
  html = html.replace(/(<li>.*<\/li>\s*)+/g, (match) => {
    if (match.includes('1.')) {
      return '<ol>' + match + '</ol>';
    }
    return '<ul>' + match + '</ul>';
  });
  
  // Code blocks
  html = html.replace(/```([^`]*)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Line breaks
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  
  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<h[1-6]>)/g, '$1');
  html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>|<ol>)/g, '$1');
  html = html.replace(/(<\/ul>|<\/ol>)<\/p>/g, '$1');
  
  return html;
};

/**
 * Get common print styles for research reports
 */
export const getPrintStyles = (): string => `
  body {
    font-family: 'Georgia', 'Times New Roman', serif;
    line-height: 1.6;
    color: #333;
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 20px;
  }
  h1 {
    color: #1a1a1a;
    border-bottom: 2px solid #333;
    padding-bottom: 10px;
    margin-bottom: 30px;
    font-size: 2em;
  }
  h2 {
    color: #2c3e50;
    margin-top: 30px;
    margin-bottom: 15px;
    font-size: 1.5em;
    border-bottom: 1px solid #e0e0e0;
    padding-bottom: 5px;
  }
  h3 {
    color: #34495e;
    margin-top: 20px;
    margin-bottom: 10px;
    font-size: 1.2em;
  }
  ul, ol {
    margin: 15px 0;
    padding-left: 30px;
  }
  li {
    margin: 8px 0;
    line-height: 1.6;
  }
  strong {
    font-weight: bold;
    color: #2c3e50;
  }
  em {
    font-style: italic;
  }
  code {
    background: #f4f4f4;
    padding: 2px 4px;
    border-radius: 3px;
    font-family: monospace;
    font-size: 0.9em;
  }
  pre {
    background: #f4f4f4;
    padding: 15px;
    border-radius: 5px;
    overflow-x: auto;
  }
  a {
    color: #1976d2;
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
  .metadata {
    background: #f8f9fa;
    padding: 15px;
    border-radius: 5px;
    margin-bottom: 30px;
  }
  .message-section {
    margin-bottom: 40px;
    padding-bottom: 20px;
    border-bottom: 1px solid #e0e0e0;
  }
  .user-message {
    background: #e3f2fd;
    padding: 15px;
    border-left: 4px solid #2196f3;
    margin-bottom: 20px;
  }
  .assistant-message {
    background: #f5f5f5;
    padding: 15px;
    border-left: 4px solid #4caf50;
    margin-bottom: 20px;
    white-space: pre-wrap;
  }
  .sources-section {
    margin-top: 30px;
    padding: 20px;
    background: #fafafa;
    border: 1px solid #ddd;
  }
  .source-item {
    margin-bottom: 15px;
    padding: 10px;
    background: white;
    border: 1px solid #e0e0e0;
  }
  .source-title {
    font-weight: bold;
    color: #1976d2;
    margin-bottom: 5px;
  }
  .source-url {
    color: #666;
    font-size: 0.9em;
    word-break: break-all;
  }
  .source-snippet {
    margin-top: 8px;
    color: #555;
    font-style: italic;
  }
  .thinking-section {
    background: #fff3e0;
    padding: 15px;
    margin: 15px 0;
    border-left: 4px solid #ff9800;
  }
  .citation-link {
    color: #1976d2;
    text-decoration: none;
    font-weight: bold;
  }
  @media print {
    body {
      padding: 20px;
    }
    .message-section {
      page-break-inside: avoid;
    }
    .source-item {
      page-break-inside: avoid;
    }
  }
`;

/**
 * Generate HTML content for print/export
 */
export const generatePrintHTML = (
  messages: Message[],
  sessionId: string | null,
  mode: string = 'research',
  allSources: Source[] = []
): string => {
  const uniqueSources = allSources.length > 0 ? allSources : 
    messages.flatMap(m => m.sources || [])
      .filter((source, index, self) => 
        index === self.findIndex(s => s.id === source.id)
      );

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Research Report - ${new Date().toLocaleDateString()}</title>
      <meta charset="UTF-8">
      <style>${getPrintStyles()}</style>
    </head>
    <body>
      <h1>Research Report</h1>
      <div class="metadata">
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Mode:</strong> ${mode}</p>
        <p><strong>Total Messages:</strong> ${messages.length}</p>
        <p><strong>Session ID:</strong> ${sessionId || 'New Session'}</p>
      </div>
      
      <h2>Conversation History</h2>
      ${messages.map((msg, idx) => `
        <div class="message-section">
          ${msg.role === 'user' ? `
            <div class="user-message">
              <strong>Question ${Math.floor(idx / 2) + 1}:</strong><br/>
              ${msg.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
            </div>
          ` : `
            <div class="assistant-message">
              <strong>Research Response:</strong><br/>
              ${markdownToHtml(msg.content)}
            </div>
            ${msg.thoughts && msg.thoughts.length > 0 ? `
              <div class="thinking-section">
                <strong>Research Process:</strong><br/>
                ${msg.thoughts.map((t: any) => `• ${t.content || t}`).join('<br/>')}
              </div>
            ` : ''}
            ${msg.sources && msg.sources.length > 0 ? `
              <div class="sources-section">
                <h3>Sources (${msg.sources.length})</h3>
                ${msg.sources.map((source, sIdx) => `
                  <div class="source-item">
                    <div class="source-title">[${sIdx + 1}] ${source.title}</div>
                    <div class="source-url">${source.url}</div>
                    ${source.snippet ? `<div class="source-snippet">${source.snippet}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            ` : ''}
          `}
        </div>
      `).join('')}
      
      ${uniqueSources.length > 0 ? `
        <h2>All Research Sources</h2>
        <div class="sources-section">
          ${uniqueSources.map((source, idx) => `
            <div class="source-item">
              <div class="source-title">[${idx + 1}] ${source.title}</div>
              <div class="source-url">${source.url}</div>
              ${source.domain ? `<div><strong>Domain:</strong> ${source.domain}</div>` : ''}
              ${source.publishDate ? `<div><strong>Published:</strong> ${source.publishDate}</div>` : ''}
              ${source.snippet ? `<div class="source-snippet">${source.snippet}</div>` : ''}
            </div>
          `).join('')}
        </div>
      ` : ''}
    </body>
    </html>
  `;
};

/**
 * Handle print action - opens new window with formatted content
 */
export const handlePrint = (
  messages: Message[],
  sessionId: string | null,
  mode: string = 'research',
  allSources: Source[] = []
): void => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  
  const printContent = generatePrintHTML(messages, sessionId, mode, allSources);
  
  printWindow.document.write(printContent);
  printWindow.document.close();
  
  // Wait for content to load then print
  printWindow.onload = () => {
    printWindow.print();
  };
};

/**
 * Handle download as HTML file
 */
export const handleDownloadReport = (
  messages: Message[],
  sessionId: string | null,
  mode: string = 'research',
  allSources: Source[] = []
): void => {
  const htmlContent = generatePrintHTML(messages, sessionId, mode, allSources);
  
  // Create a Blob and download link
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `research-report-${new Date().toISOString().split('T')[0]}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};