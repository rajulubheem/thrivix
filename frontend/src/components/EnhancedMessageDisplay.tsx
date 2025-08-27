// components/EnhancedMessageDisplay.tsx
import React, { useMemo } from 'react';
import { ToolExecutionDisplay } from './ToolCallDisplay'; // Changed from ToolCallDisplay to ToolExecutionDisplay
import './EnhancedMessageDisplay.css';

interface EnhancedMessageDisplayProps {
    content: string;
    agent?: string;
    status?: 'thinking' | 'working' | 'streaming' | 'complete' | 'error';
    timestamp: Date;
    onArtifactCreate?: (artifact: any) => void;
    artifacts?: any[];
}

// Updated ToolCall interface with all possible status values
interface ToolCall {
    id: string;
    name: string;
    parameters?: any;
    result?: any;
    rawData?: any; // Add rawData field
    status: 'pending' | 'awaiting_approval' | 'approved' | 'rejected' | 'executing' | 'success' | 'error';
    timestamp?: string;
    approvalRequired?: boolean;
    approvalId?: string;
    error?: string;
}

interface ParsedContent {
    text: string;
    toolCalls: ToolCall[];
    codeBlocks: Array<{
        language: string;
        code: string;
    }>;
}

export const EnhancedMessageDisplay: React.FC<EnhancedMessageDisplayProps> = ({
                                                                                  content,
                                                                                  agent,
                                                                                  status,
                                                                                  timestamp,
                                                                                  onArtifactCreate,
                                                                                  artifacts
                                                                              }) => {
    const parsedContent = useMemo(() => parseContentForTools(content), [content]);

    // Function to extract raw tool results from the console log format
    function extractToolResults(text: string): Map<string, any> {
        const toolResults = new Map();

        // Pattern to match the console log format from your logs
        const logPattern = /📊 TOOL RESULT.*?data:\s*({[\s\S]*?})(?=\n(?:📊|✔|🔄|$))/g;
        let match;

        while ((match = logPattern.exec(text)) !== null) {
            try {
                const data = JSON.parse(match[1]);
                if (data.tool && data.results) {
                    toolResults.set(data.tool, data.results);
                }
            } catch (e) {
                // Continue parsing
            }
        }

        return toolResults;
    }

    function parseContentForTools(text: string): ParsedContent {
        const toolCallMap = new Map<string, ToolCall>();
        const codeBlocks: ParsedContent['codeBlocks'] = [];
        let cleanText = text;

        // Extract code blocks first
        const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
        let codeMatch;
        while ((codeMatch = codeBlockRegex.exec(text)) !== null) {
            codeBlocks.push({
                language: codeMatch[1] || 'text',
                code: codeMatch[2].trim()
            });
            cleanText = cleanText.replace(codeMatch[0], `[CODE_BLOCK_${codeBlocks.length - 1}]`);
        }

        // Track tool executions and their results
        const toolExecutions = new Map<string, any>();

        // Enhanced patterns for tool detection
        const patterns = [
            // Match the search execution and capture the query
            {
                regex: /🔍\s*\*\*Searching:\*\*\s*"([^"]+)"/g,
                handler: (match: RegExpExecArray, fullText: string): ToolCall => {
                    const query = match[1];
                    const toolId = `search_${Date.now()}_${match.index}`;

                    // Look for the "Found X results" pattern after this search
                    const afterSearch = fullText.substring(match.index || 0);
                    const resultsMatch = afterSearch.match(/📋\s*\*\*Found\s+(\d+)\s+results?\*\*/);

                    let result = null;
                    let status: ToolCall['status'] = 'executing';

                    if (resultsMatch) {
                        const numResults = resultsMatch[1];

                        // Try to extract the actual results list that follows
                        // Look for numbered list items after "Found X results"
                        const resultsSection = afterSearch.substring(resultsMatch.index || 0);
                        const resultItems: any[] = [];

                        // Pattern to match each result item (numbered list)
                        const itemPattern = /(\d+)\.\s*\*\*\[?([^\]]*?)\]?\*\*(?:\(([^)]+)\))?\s*-?\s*([^:]*?):\s*([^\n]+)/g;
                        let itemMatch;
                        let count = 0;

                        while ((itemMatch = itemPattern.exec(resultsSection)) !== null && count < parseInt(numResults)) {
                            // Extract URL from markdown link if present
                            const urlMatch = itemMatch[3] || '';
                            const titleMatch = itemMatch[2] || '';

                            resultItems.push({
                                index: parseInt(itemMatch[1]),
                                title: titleMatch.trim(),
                                url: urlMatch,
                                content: itemMatch[5]?.trim() || '',
                                // Mock score since it's not in the displayed text
                                score: 0.5 + Math.random() * 0.5
                            });
                            count++;
                        }

                        // If we found items, use them as the result
                        if (resultItems.length > 0) {
                            result = resultItems;
                            status = 'success';
                        } else {
                            // Fallback: just indicate number of results
                            result = `Found ${numResults} results`;
                            status = 'success';
                        }
                    }

                    return {
                        id: toolId,
                        name: 'tavily_search',
                        parameters: { query },
                        result,
                        status,
                        timestamp: new Date().toISOString()
                    };
                }
            },
            // Match the Found results pattern and link to previous search
            {
                regex: /📋\s*\*\*Found\s+(\d+)\s+results?\*\*/g,
                handler: (match: RegExpExecArray, fullText: string): ToolCall | null => {
                    // Check if we already have a search tool for this
                    const beforeResult = fullText.substring(0, match.index || 0);
                    const searchMatch = beforeResult.match(/🔍\s*\*\*Searching:\*\*\s*"([^"]+)"/g);

                    if (!searchMatch || searchMatch.length === 0) {
                        // This is a standalone result, create a new tool call
                        const numResults = match[1];

                        // Extract the results that follow
                        const afterMatch = fullText.substring(match.index || 0);
                        const resultItems: any[] = [];

                        // Try to extract actual result items
                        const itemPattern = /(\d+)\.\s*\*\*\[?([^\]]*?)\]?\*\*(?:\(([^)]+)\))?\s*-?\s*([^:]*?):\s*([^\n]+)/g;
                        let itemMatch;
                        let count = 0;

                        while ((itemMatch = itemPattern.exec(afterMatch)) !== null && count < parseInt(numResults)) {
                            resultItems.push({
                                index: parseInt(itemMatch[1]),
                                title: itemMatch[2]?.trim() || '',
                                url: itemMatch[3] || '',
                                content: itemMatch[5]?.trim() || '',
                                score: 0.5 + Math.random() * 0.5
                            });
                            count++;
                        }

                        return {
                            id: `results_${Date.now()}_${match.index}`,
                            name: 'search_results',
                            result: resultItems.length > 0 ? resultItems : `Found ${numResults} results`,
                            status: 'success',
                            timestamp: new Date().toISOString()
                        };
                    }

                    return null; // Already handled by search pattern
                }
            }
        ];

        // Process all patterns
        patterns.forEach(({ regex, handler }) => {
            let match;
            regex.lastIndex = 0;
            while ((match = regex.exec(text)) !== null) {
                try {
                    const toolCall = handler(match, text);
                    if (toolCall) {
                        if (!toolCallMap.has(toolCall.id)) {
                            toolCallMap.set(toolCall.id, toolCall);
                        }
                    }
                } catch (e) {
                    console.error('Error parsing tool call:', e);
                }
            }
        });

        // Remove tool patterns from display text
        const patternsToRemove = [
            /🔍\s*\*\*Searching:\*\*\s*"[^"]+"/g,
            /📋\s*\*\*Found\s+\d+\s+results?\*\*/g,
        ];

        patternsToRemove.forEach(pattern => {
            cleanText = cleanText.replace(pattern, '');
        });

        // Clean up whitespace
        cleanText = cleanText.replace(/\n{3,}/g, '\n\n').trim();

        return {
            text: cleanText,
            toolCalls: Array.from(toolCallMap.values()),
            codeBlocks
        };
    }

    const renderFormattedText = (text: string) => {
        let formatted = text;

        // Replace code block placeholders
        parsedContent.codeBlocks.forEach((block, index) => {
            const placeholder = `[CODE_BLOCK_${index}]`;
            const codeHtml = `<pre class="code-block"><code class="language-${block.language}">${escapeHtml(block.code)}</code></pre>`;
            formatted = formatted.replace(placeholder, codeHtml);
        });

        // Headers
        formatted = formatted.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        formatted = formatted.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        formatted = formatted.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // Bold
        formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // Italic
        formatted = formatted.replace(/\*([^*]+?)\*/g, '<em>$1</em>');

        // Inline code
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Links
        formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

        // Paragraphs
        formatted = formatted.split('\n\n').map(para => {
            if (para.startsWith('<h') || para.startsWith('<ul') || para.startsWith('<ol') || para.startsWith('<pre')) {
                return para;
            }
            return para.trim() ? `<p>${para}</p>` : '';
        }).filter(p => p).join('\n');

        return formatted;
    };

    const escapeHtml = (text: string) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    return (
        <div className="enhanced-message-display">
            {/* Tool Calls Section - Using ToolExecutionDisplay now */}
            {parsedContent.toolCalls.length > 0 && (
                <div className="tool-calls-section">
                    {parsedContent.toolCalls.map((toolCall) => (
                        <ToolExecutionDisplay
                            key={toolCall.id}
                            toolName={toolCall.name}
                            parameters={toolCall.parameters}
                            result={toolCall.result}
                            status={toolCall.status}
                            timestamp={timestamp.toISOString()}
                            rawData={toolCall.rawData}
                        />
                    ))}
                </div>
            )}

            {/* Main Content */}
            {parsedContent.text && parsedContent.text.trim() && (
                <div
                    className="message-content"
                    dangerouslySetInnerHTML={{ __html: renderFormattedText(parsedContent.text) }}
                />
            )}

            {/* Artifacts Section */}
            {artifacts && artifacts.length > 0 && (
                <div className="artifacts-section">
                    <div className="artifacts-header">
                        <span className="artifacts-icon">📦</span>
                        <span className="artifacts-label">Generated Files</span>
                        <span className="artifacts-count">{artifacts.length}</span>
                    </div>
                    <div className="artifacts-list">
                        {artifacts.map((artifact, index) => (
                            <div key={index} className="artifact-item">
                                <span className="artifact-icon">📄</span>
                                <span className="artifact-name">{artifact.name}</span>
                                <button
                                    className="artifact-view"
                                    onClick={() => onArtifactCreate?.(artifact)}
                                >
                                    View
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};