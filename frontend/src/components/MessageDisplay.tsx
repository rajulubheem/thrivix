import React, { useMemo, memo } from 'react';
import ToolResultDisplay from './ToolResultDisplay';
import './MessageDisplay.css';

interface MessageDisplayProps {
  content: string;
  agent?: string;
  status?: string;
  timestamp?: Date;
  onArtifactCreate?: (artifact: any) => void;
  artifacts?: any[];
}

const MessageDisplay: React.FC<MessageDisplayProps> = ({
                                                         content,
                                                         agent,
                                                         status,
                                                         timestamp,
                                                         onArtifactCreate,
                                                         artifacts = []
                                                       }) => {
  const formattedContent = useMemo(() => {
    if (!content) return { text: '', tools: [], artifacts: [] };

    let processedContent = content;
    const extractedTools: any[] = [];
    const extractedArtifacts: any[] = [];

    // Extract and process all [TOOL RESULT:...] blocks
    // Use a single pass to find all tool results
    const allResults = [];
    const toolResultRegex = /\[TOOL RESULT:\s*([^\]]+)\]/g;
    let match;
    const processedPositions = new Set<number>();

    while ((match = toolResultRegex.exec(content)) !== null) {
      const startPos = match.index;

      // Skip if we've already processed this position
      if (processedPositions.has(startPos)) {
        continue;
      }
      processedPositions.add(startPos);

      const toolName = match[1].trim();
      const fullMatchLength = match[0].length;

      // Look for the closing tag
      const closeTagRegex = new RegExp(`\\[\\/TOOL RESULT\\]`);
      const remainingContent = content.substring(startPos + fullMatchLength);
      const closeMatch = remainingContent.search(closeTagRegex);

      let resultContent = '';
      let isComplete = false;

      if (closeMatch !== -1) {
        // Found closing tag
        resultContent = remainingContent.substring(0, closeMatch).trim();
        isComplete = true;
      } else {
        // No closing tag - extract until next tool result or end
        const nextToolMatch = remainingContent.search(/\[TOOL RESULT:|$/);
        if (nextToolMatch > 0) {
          resultContent = remainingContent.substring(0, nextToolMatch).trim();
        } else {
          resultContent = remainingContent.trim();
        }
        isComplete = false;
      }

      allResults.push({
        toolName: toolName,
        content: resultContent,
        startPos: startPos,
        isComplete: isComplete
      });
    }

    // Also look for file creation patterns
    const fileCreationRegex = /(?:Creating|Writing|Saving|Generated)\s+(?:file:?\s+)?([^\s]+\.(py|js|tsx|ts|jsx|html|css|json|txt|md|yaml|yml))/gi;

    // Process and deduplicate results
    const processedResults = new Map<string, any>();

    // Sort by position to maintain order
    allResults.sort((a, b) => a.startPos - b.startPos);

    // Process each result
    for (const result of allResults) {
      const { toolName, content: resultContent, startPos, isComplete } = result;

      // Create a stable key based on tool name and position
      // This prevents duplicates at the same position
      const resultKey = `${toolName}-pos${startPos}`;

      // Check if we already processed this position
      if (processedResults.has(resultKey)) {
        // Update if this one is more complete
        const existing = processedResults.get(resultKey);
        if (!existing.isComplete && isComplete) {
          processedResults.set(resultKey, { ...existing, isComplete, display_text: resultContent });
        }
        continue;
      }

      // Check if it's a success or error
      let isSuccess = true;
      if (resultContent.includes('[TOOL ERROR:') || resultContent.includes('Error:')) {
        isSuccess = false;
      }

      // Try to extract a summary from the result
      let summary = '';
      if (!isComplete) {
        summary = '⏳ Executing...';
      } else {
        const summaryMatch = resultContent.match(/Summary[:\s]*([^\n]+)/i);
        if (summaryMatch) {
          summary = summaryMatch[1].trim();
        } else if (resultContent.includes('Search Results')) {
          // For search results, extract the summary
          const searchSummaryMatch = resultContent.match(/\*\*Summary:\*\*\s*([^\n]+)/);
          if (searchSummaryMatch) {
            summary = searchSummaryMatch[1].trim();
          }
        }

        // If still no summary, use first 150 chars
        if (!summary) {
          summary = resultContent.replace(/[#*`]/g, '').substring(0, 150).trim();
          if (resultContent.length > 150) summary += '...';
        }
      }

      // Create a unique tool result entry
      const toolResult = {
        id: resultKey,
        tool_name: toolName,
        success: isSuccess,
        display_text: resultContent || '⏳ Waiting for results...',
        timestamp: timestamp?.toISOString(),
        summary: summary,
        collapsible: true,
        isComplete: isComplete,
        defaultExpanded: !isComplete, // Expand while executing
        autoCollapse: true // Auto-collapse when complete
      };

      processedResults.set(resultKey, toolResult);
    }

    // Convert Map values to array for display (already deduplicated)
    processedResults.forEach(value => {
      extractedTools.push(value);
    });

    // Remove all tool blocks from the main content
    // IMPORTANT: Also remove [EXECUTING:...] blocks (display blocks)
    processedContent = processedContent
        .replace(/\[TOOL RESULT:[^\]]*\][\s\S]*?(?:\[\/TOOL RESULT\]|$)/g, '')
        .replace(/\[EXECUTING:[^\]]*\][\s\S]*?(?:\[\/EXECUTING\]|$)/g, '') // NEW: Remove display blocks
        .replace(/\[TOOL:[^\]]*\][\s\S]*?(?=\[TOOL:|$)/g, '')
        .replace(/\[\/TOOL\]/g, '')
        .replace(/\[\/EXECUTING\]/g, '') // NEW: Clean up closing tags
        .trim();

    // Check for file creations mentioned in the text
    let fileMatch;
    while ((fileMatch = fileCreationRegex.exec(content)) !== null) {
      const filename = fileMatch[1];

      // Try to extract code block following the file mention
      const codeBlockRegex = new RegExp(`${filename}[\\s\\S]*?\`\`\`[\\w]*\\n([\\s\\S]*?)\`\`\``, 'i');
      const codeMatch = content.match(codeBlockRegex);

      if (codeMatch) {
        extractedArtifacts.push({
          name: filename,
          content: codeMatch[1],
          type: 'code',
          language: filename.split('.').pop()
        });
      }
    }

    return {
      text: processedContent,
      tools: extractedTools,
      artifacts: extractedArtifacts
    };
  }, [content, timestamp]);
  const renderFormattedText = (text: string) => {
    // Format code blocks
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        parts.push(
            <span key={`text-${lastIndex}`}>
            {formatInlineElements(text.substring(lastIndex, match.index))}
          </span>
        );
      }

      // Add code block
      const language = match[1] || 'plaintext';
      const code = match[2];
      parts.push(
          <div key={`code-${match.index}`} className="code-block">
            <div className="code-header">
              <span className="code-language">{language}</span>
              <button
                  className="copy-button"
                  onClick={() => navigator.clipboard.writeText(code)}
              >
                📋 Copy
              </button>
            </div>
            <pre className="code-content">
            <code>{code}</code>
          </pre>
          </div>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(
          <span key={`text-${lastIndex}`}>
          {formatInlineElements(text.substring(lastIndex))}
        </span>
      );
    }

    return parts.length > 0 ? parts : formatInlineElements(text);
  };

  const formatInlineElements = (text: string) => {
    // Format inline code
    let formatted = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Format bold text
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Format italic text
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Format line breaks
    formatted = formatted.replace(/\n/g, '<br />');

    return <span dangerouslySetInnerHTML={{ __html: formatted }} />;
  };

  return (
      <div className="message-display">
        {/* Display the full content with tool results inline */}
        <div className="message-content">
          {/* If there's text before tool results, show it */}
          {formattedContent.text && (
              <div className="message-text">
                {renderFormattedText(formattedContent.text)}
              </div>
          )}
          
          {/* Display tool results inline after the text */}
          {formattedContent.tools.length > 0 && (
              <div className="message-tools-inline">
                {formattedContent.tools.map((tool, index) => (
                    <ToolResultDisplay
                        key={tool.id || `tool-${tool.tool_name}-${index}`}
                        result={tool}
                        collapsible={tool.collapsible !== false}
                        defaultExpanded={tool.defaultExpanded || false}
                    />
                ))}
              </div>
          )}
        </div>

        {/* Display detected artifacts from content */}
        {formattedContent.artifacts && formattedContent.artifacts.length > 0 && (
            <div className="message-artifacts">
              <div className="artifacts-header">
                📦 Detected Files ({formattedContent.artifacts.length})
              </div>
              {formattedContent.artifacts.map((artifact, index) => (
                  <div key={`detected-artifact-${index}`} className="artifact-item">
                    <span className="artifact-icon">📄</span>
                    <span className="artifact-name">{artifact.name}</span>
                    {onArtifactCreate && (
                        <button
                            className="artifact-action"
                            onClick={() => onArtifactCreate(artifact)}
                        >
                          View
                        </button>
                    )}
                  </div>
              ))}
            </div>
        )}

        {/* Display artifacts if any */}
        {artifacts && artifacts.length > 0 && (
            <div className="message-artifacts">
              <div className="artifacts-header">
                📦 Generated Files ({artifacts.length})
              </div>
              {artifacts.map((artifact, index) => (
                  <div key={`artifact-${index}`} className="artifact-item">
                    <span className="artifact-icon">📄</span>
                    <span className="artifact-name">{artifact.name}</span>
                    {onArtifactCreate && (
                        <button
                            className="artifact-action"
                            onClick={() => onArtifactCreate(artifact)}
                        >
                          View
                        </button>
                    )}
                  </div>
              ))}
            </div>
        )}
      </div>
  );
};

// Memoize component to prevent unnecessary re-renders
export default memo(MessageDisplay, (prevProps, nextProps) => {
  // Custom comparison function for optimization
  // Re-render only if content, agent, or status changes
  return (
    prevProps.content === nextProps.content &&
    prevProps.agent === nextProps.agent &&
    prevProps.status === nextProps.status &&
    prevProps.timestamp === nextProps.timestamp
  );
});