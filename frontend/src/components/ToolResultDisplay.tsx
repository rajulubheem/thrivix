import React, { useState, useMemo } from 'react';
import './ToolResultDisplay.css';

interface ToolResult {
  tool_name: string;
  success: boolean;
  summary?: string;
  results_count?: number;
  results?: Array<any>;
  display_text?: string;
  collapsible?: boolean;
  timestamp?: string;
}

interface ToolResultDisplayProps {
  result: ToolResult & {
    isComplete?: boolean;
    autoCollapse?: boolean;
  };
  className?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

const ToolResultDisplay: React.FC<ToolResultDisplayProps> = ({
                                                               result,
                                                               className = '',
                                                               collapsible = true,
                                                               defaultExpanded = false
                                                             }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [hasAutoCollapsed, setHasAutoCollapsed] = useState(false);
  
  // Auto-collapse when tool completes
  React.useEffect(() => {
    if (result.autoCollapse && result.isComplete && !hasAutoCollapsed && isExpanded) {
      // Auto-collapse immediately when complete
      setIsExpanded(false);
      setHasAutoCollapsed(true);
    } else if (!result.isComplete && hasAutoCollapsed) {
      // Reset if it becomes incomplete again (shouldn't happen but just in case)
      setHasAutoCollapsed(false);
      setIsExpanded(true);
    }
  }, [result.isComplete, result.autoCollapse]);

  // Parse the display_text to extract tool information
  const parsedContent = useMemo(() => {
    if (!result.display_text) return null;

    // The display_text might be the raw content without [TOOL RESULT:] wrapper
    // or it might be the full formatted text
    let contentToParse = result.display_text;
    
    // Check if it has the wrapper
    const hasWrapper = contentToParse.includes('[TOOL RESULT:');
    if (hasWrapper) {
      const toolResultMatch = contentToParse.match(/\[TOOL RESULT:[^\]]*\]([\s\S]*?)(\[\/TOOL RESULT\]|$)/);
      if (toolResultMatch) {
        contentToParse = toolResultMatch[1];
      }
    }
    
    // Clean up the content
    contentToParse = contentToParse.trim();
    
    // Try to parse the content
    let parsedData = null;
    
    // First, check if it's formatted search results
    if (contentToParse.includes('Search Results') || contentToParse.includes('### 🔍')) {
      // Extract summary from search results
      const summaryMatch = contentToParse.match(/\*\*Summary:\*\*\s*([^\n]+)|Summary:\s*([^\n]+)/i);
      const resultsMatch = contentToParse.match(/\*\*Results Found:\*\*\s*(\d+)|Found\s+(\d+)\s+results/i);
      
      // Extract individual results
      const results = [];
      const resultRegex = /\*\*\d+\.\s*([^*]+)\*\*[^]*?(?:URL:|https?:\/\/)([^\n\s]+)[^]*?(?:(?=\*\*\d+\.)|$)/g;
      let match;
      while ((match = resultRegex.exec(contentToParse)) !== null) {
        let url = match[2].trim().replace(/^URL:\s*/, '');
        // Clean up the URL - remove any trailing punctuation or markdown
        url = url.replace(/[,.\]\)\*]+$/, '');
        // Validate URL format
        const isValidUrl = url.match(/^https?:\/\/.+/) || url.match(/^www\..+/);
        if (isValidUrl) {
          // Ensure URL has protocol
          if (!url.startsWith('http')) {
            url = 'https://' + url;
          }
          results.push({
            title: match[1].trim(),
            url: url,
            content: contentToParse.substring(match.index, match.index + 200).replace(/\*\*/g, '').trim()
          });
        }
      }
      
      parsedData = {
        success: true,
        answer: summaryMatch ? (summaryMatch[1] || summaryMatch[2]) : result.summary,
        results: results.length > 0 ? results : null,
        result_count: resultsMatch ? parseInt(resultsMatch[1] || resultsMatch[2]) : results.length,
        raw: contentToParse
      };
    }
    // Check if it's an error
    else if (contentToParse.includes('Error') || contentToParse.includes('error')) {
      parsedData = {
        success: false,
        error: contentToParse,
        raw: contentToParse
      };
    }
    // Try to extract structured data
    else {
      // Look for success indicators
      const successMatch = contentToParse.match(/success[:\s]*(true|false)|✅|❌/i);
      const messageMatch = contentToParse.match(/message[:\s]*"?([^"\n]+)"?/i);
      
      parsedData = {
        success: successMatch ? (successMatch[1] === 'true' || successMatch[0].includes('✅')) : true,
        message: messageMatch ? messageMatch[1] : contentToParse,
        raw: contentToParse
      };
    }

    return {
      tool: result.tool_name,
      result: parsedData
    };
  }, [result]);

  const getToolIcon = (toolName: string): string => {
    const icons: Record<string, string> = {
      'tavily_search': '🔍',
      'web_search': '🌐',
      'file_write': '📝',
      'file_read': '📖',
      'shell': '💻',
      'python_repl': '🐍',
      'code_interpreter': '⚡',
      'editor': '✏️',
      'http_request': '🌐',
      'calculator': '🧮',
      'database': '🗄️'
    };
    return icons[toolName] || '🔧';
  };

  const renderResultContent = () => {
    // If we have raw display_text but no parsed content, show the raw text
    if (!parsedContent || !parsedContent.result) {
      if (result.display_text && result.display_text.length > 0) {
        return (
            <div className="tool-result-raw">
              <pre className="raw-content">
                {result.display_text}
              </pre>
            </div>
        );
      }
      return (
          <div className="tool-result-empty">
            No result data available
          </div>
      );
    }

    const { result: data } = parsedContent;

    // Handle error cases
    if (data.error || data.success === false) {
      return (
          <div className="tool-result-error">
            <div className="error-icon">⚠️</div>
            <div className="error-content">
              <div className="error-title">Tool Execution Failed</div>
              <div className="error-message">
                {data.error || data.message || 'An error occurred during execution'}
              </div>
            </div>
          </div>
      );
    }

    // Handle search results
    if (data.results && Array.isArray(data.results)) {
      return (
          <div className="tool-result-search">
            {data.answer && (
                <div className="search-summary">
                  <strong>Summary:</strong> {data.answer}
                </div>
            )}
            <div className="search-results">
              <div className="results-header">
                Found {data.results.length} results
              </div>
              {data.results.slice(0, 3).map((item: any, index: number) => (
                  <div key={index} className="search-result-item">
                    <div className="result-title">
                      {item.title || 'Untitled'}
                    </div>
                    {item.url && (
                        <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="result-url"
                        >
                          {(() => {
                            try {
                              return new URL(item.url).hostname;
                            } catch {
                              // If URL is invalid, extract domain from string
                              const match = item.url.match(/(?:https?:\/\/)?([^\/\s]+)/);
                              return match ? match[1] : item.url;
                            }
                          })()}
                        </a>
                    )}
                    {item.content && (
                        <div className="result-snippet">
                          {item.content.substring(0, 150)}...
                        </div>
                    )}
                  </div>
              ))}
            </div>
          </div>
      );
    }

    // Handle generic success with message
    if (data.message || data.answer) {
      return (
          <div className="tool-result-success">
            <div className="success-icon">✅</div>
            <div className="success-content">
              {data.message || data.answer}
            </div>
          </div>
      );
    }

    // Fallback to showing raw data in a formatted way
    return (
        <div className="tool-result-data">
        <pre className="json-display">
          {JSON.stringify(data, null, 2)}
        </pre>
        </div>
    );
  };

  return (
      <div className={`tool-result-display ${className} ${result.success ? 'success' : 'error'} ${!result.isComplete ? 'in-progress' : ''}`}>
        <div
            className="tool-result-header"
            onClick={() => collapsible && setIsExpanded(!isExpanded)}
            style={{ cursor: collapsible ? 'pointer' : 'default' }}
        >
          <div className="tool-info">
            <span className="tool-icon">{getToolIcon(result.tool_name)}</span>
            <span className="tool-name">{result.tool_name.replace(/_/g, ' ')}</span>
            {!result.isComplete ? (
                <span className="tool-status in-progress">⏳ Executing...</span>
            ) : result.success ? (
                <span className="tool-status success">✓ Success</span>
            ) : (
                <span className="tool-status error">✗ Failed</span>
            )}
          </div>
          {collapsible && (
              <div className="expand-indicator">
                {isExpanded ? '▼' : '▶'}
              </div>
          )}
        </div>

        {(!collapsible || isExpanded) && (
            <div className="tool-result-body">
              {renderResultContent()}
              {result.timestamp && (
                  <div className="tool-timestamp">
                    Executed at {new Date(result.timestamp).toLocaleTimeString()}
                  </div>
              )}
            </div>
        )}
      </div>
  );
};

export default ToolResultDisplay;