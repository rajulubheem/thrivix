/**
 * Scholarly Research View Component
 * Academic paper-style presentation with citations, references, and professional layout
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTheme } from '../../contexts/ThemeContext';
import { 
  Send, Loader2, User, Bot, 
  Globe, Brain, CheckCircle,
  Clock, ExternalLink, ChevronDown, ChevronUp,
  Zap, Copy, RefreshCw,
  ThumbsUp, ThumbsDown, AlertCircle, X, Square,
  Plus, MessageSquare, BookOpen, GraduationCap,
  Bookmark, BookmarkCheck, FileText, Download,
  Printer, ChevronLeft, ChevronRight, Maximize2,
  Quote, Link2, Hash, ArrowUpRight, History
} from 'lucide-react';
import ResearchSourcesFeed from './ResearchSourcesFeed';
import '../../styles/unified-theme.css';
import '../../styles/scholarly-research.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  sources?: Source[];
  citations?: Citation[];
  thoughts?: Thought[];
  feedback?: 'positive' | 'negative' | null;
  mode?: 'fast' | 'deep' | 'scholar';
  status?: string;
  progress?: number;
  id?: string;
}

interface Source {
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

interface Citation {
  id: number;
  text: string;
  source: Source;
  context?: string;
}

interface Thought {
  type: string;
  content: string;
  timestamp: string;
}

interface Session {
  id: string;
  mode: 'fast' | 'deep' | 'scholar';
  title: string;
  timestamp: string;
  messages: Message[];
}

const ScholarlyResearchView: React.FC = () => {
  const { sessionId: urlSessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { isDark } = useTheme();
  
  const [sessionId, setSessionId] = useState<string | null>(urlSessionId || null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [currentSources, setCurrentSources] = useState<Source[]>([]);
  const [mode, setMode] = useState<'fast' | 'deep' | 'scholar'>('scholar');
  const [showThinking, setShowThinking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookmarkedSources, setBookmarkedSources] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['abstract', 'findings']));
  const [viewMode, setViewMode] = useState<'chat' | 'paper'>('paper');
  const [showCitations, setShowCitations] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showModeConfirm, setShowModeConfirm] = useState(false);
  const [pendingMode, setPendingMode] = useState<'fast' | 'deep' | 'scholar' | null>(null);
  const [isContinuation, setIsContinuation] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  // Mode configuration for scholarly view
  const modeConfig = {
    fast: {
      name: 'Quick Summary',
      icon: Zap,
      color: '#22c55e',
      description: 'Brief overview with key points',
      endpoint: '/api/v1/research/start',
      statusEndpoint: '/api/v1/research/status',
      continueEndpoint: null, // Fast mode doesn't support continuation
      useConversation: false
    },
    deep: {
      name: 'Research Paper',
      icon: Brain,
      color: '#6366f1',
      description: 'Comprehensive analysis with citations',
      endpoint: '/api/v1/research/start-strands-real',
      statusEndpoint: '/api/v1/research/status-strands-real',
      continueEndpoint: '/api/v1/research/continue-strands-real', // Deep mode now supports continuation
      useConversation: true
    },
    scholar: {
      name: 'Academic Review',
      icon: GraduationCap,
      color: '#f59e0b',
      description: 'Scholarly article with full references',
      endpoint: '/api/v1/research/start-strands-real',
      statusEndpoint: '/api/v1/research/status-strands-real',
      continueEndpoint: '/api/v1/research/continue-strands-real', // Scholar mode now supports continuation
      useConversation: true
    }
  };

  // Load sessions from localStorage
  useEffect(() => {
    const savedSessions = localStorage.getItem('research_sessions');
    if (savedSessions) {
      setSessions(JSON.parse(savedSessions));
    }
  }, []);
  
  // Load current session when sessionId changes
  useEffect(() => {
    if (sessionId) {
      const savedSession = localStorage.getItem(`research_session_${sessionId}`);
      if (savedSession) {
        const session = JSON.parse(savedSession);
        setMessages(session.messages || []);
        setMode(session.mode || 'scholar');
      } else {
        // New session, extract mode from sessionId if possible
        const modeMatch = sessionId.match(/_([^_]+)$/);
        if (modeMatch && ['fast', 'deep', 'scholar'].includes(modeMatch[1])) {
          setMode(modeMatch[1] as 'fast' | 'deep' | 'scholar');
        }
      }
    }
  }, [sessionId]);

  // Save sessions to localStorage
  const saveSession = useCallback(() => {
    if (sessionId && messages.length > 0) {
      const session = {
        id: sessionId,
        mode,
        title: messages[0]?.content?.substring(0, 50) || 'New Research',
        timestamp: new Date().toISOString(),
        messages
      };
      
      localStorage.setItem(`research_session_${sessionId}`, JSON.stringify(session));
      
      // Update sessions list
      setSessions(prev => {
        const updated = prev.filter(s => s.id !== sessionId);
        updated.unshift(session);
        localStorage.setItem('research_sessions', JSON.stringify(updated));
        return updated;
      });
    }
  }, [sessionId, messages, mode]);

  // Save session when messages change
  useEffect(() => {
    if (messages.length > 0) {
      saveSession();
    }
  }, [messages, saveSession]);

  // Handle mode change with confirmation
  const handleModeChange = (newMode: 'fast' | 'deep' | 'scholar') => {
    if (mode !== newMode) {
      if (messages.length > 0) {
        // Show confirmation if there are existing messages
        setPendingMode(newMode);
        setShowModeConfirm(true);
      } else {
        // No messages, just switch mode and create new session
        setMode(newMode);
        const newSessionId = `session_${Date.now()}_${newMode}`;
        setSessionId(newSessionId);
        navigate(`/conversation/${newSessionId}`);
      }
    }
  };

  // Confirm mode change and create new session
  const confirmModeChange = () => {
    if (pendingMode) {
      // Save current session
      saveSession();
      
      // Clear current state
      setMessages([]);
      setCurrentSources([]);
      setThoughts([]);
      setBookmarkedSources(new Set());
      
      // Create new session with new mode
      const newSessionId = `session_${Date.now()}_${pendingMode}`;
      setSessionId(newSessionId);
      setMode(pendingMode);
      navigate(`/conversation/${newSessionId}`);
      
      setPendingMode(null);
      setShowModeConfirm(false);
    }
  };
  
  // Create entirely new session
  const createNewSession = () => {
    // Save current session if it has messages
    if (messages.length > 0) {
      saveSession();
    }
    
    // Clear all state
    setMessages([]);
    setCurrentSources([]);
    setThoughts([]);
    setBookmarkedSources(new Set());
    setInput('');
    
    // Create new session
    const newSessionId = `session_${Date.now()}_${mode}`;
    setSessionId(newSessionId);
    navigate(`/conversation/${newSessionId}`);
  };

  // Cancel mode change
  const cancelModeChange = () => {
    setPendingMode(null);
    setShowModeConfirm(false);
  };

  // Parse content and create clickable references
  const parseContentWithReferences = (content: string, sources: Source[]) => {
    if (!sources || sources.length === 0) return content;

    // Replace [1], [2], etc. with clickable links
    let processedContent = content;
    sources.forEach((source, index) => {
      const refNumber = index + 1;
      const pattern = new RegExp(`\\[${refNumber}\\]`, 'g');
      processedContent = processedContent.replace(
        pattern,
        `<a href="#ref-${refNumber}" class="citation-link" onclick="event.preventDefault(); document.getElementById('ref-${refNumber}')?.scrollIntoView({behavior: 'smooth'});">[${refNumber}]</a>`
      );
    });

    return processedContent;
  };

  // Format markdown content properly for display
  const formatMarkdownContent = (content: string) => {
    // Convert markdown links to HTML
    content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Convert headers
    content = content.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    content = content.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    content = content.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    
    // Convert bold text
    content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Convert lists
    content = content.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    content = content.replace(/(<li>.*<\/li>\n?)+/g, '<ol>$&</ol>');
    content = content.replace(/^- (.+)$/gm, '<li>$1</li>');
    content = content.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    
    // Convert line breaks
    content = content.replace(/\n\n/g, '</p><p>');
    content = '<p>' + content + '</p>';
    
    return content;
  };

  // Parse content into scholarly sections
  const parseScholarlyContent = (content: string, sources?: Source[]) => {
    const sections = {
      abstract: '',
      introduction: '',
      methodology: '',
      findings: '',
      discussion: '',
      conclusion: '',
      references: [] as string[]
    };

    // Process content with references first
    const processedContent = sources ? parseContentWithReferences(content, sources) : content;

    // Extract sections based on markdown headers
    const abstractMatch = processedContent.match(/#{1,3}\s*(?:Executive Summary|Abstract|Summary)(.*?)(?=#{1,3}|$)/si);
    const introMatch = processedContent.match(/#{1,3}\s*(?:Introduction|Background|Current Situation)(.*?)(?=#{1,3}|$)/si);
    const methodMatch = processedContent.match(/#{1,3}\s*(?:Methodology|Approach|Analysis)(.*?)(?=#{1,3}|$)/si);
    const findingsMatch = processedContent.match(/#{1,3}\s*(?:Findings|Results|Key Insights)(.*?)(?=#{1,3}|$)/si);
    const discussionMatch = processedContent.match(/#{1,3}\s*(?:Discussion|Implications|Analysis)(.*?)(?=#{1,3}|$)/si);
    const conclusionMatch = processedContent.match(/#{1,3}\s*(?:Conclusion|Recommendations|Summary)(.*?)(?=#{1,3}|$)/si);

    if (abstractMatch) sections.abstract = abstractMatch[1].trim();
    if (introMatch) sections.introduction = introMatch[1].trim();
    if (methodMatch) sections.methodology = methodMatch[1].trim();
    if (findingsMatch) sections.findings = findingsMatch[1].trim();
    if (discussionMatch) sections.discussion = discussionMatch[1].trim();
    if (conclusionMatch) sections.conclusion = conclusionMatch[1].trim();

    // If no sections found, treat entire content as findings
    if (!Object.values(sections).some(v => v && v.length > 0)) {
      sections.findings = processedContent;
    }
    
    return sections;
  };

  // Format citation with proper academic style
  const formatCitation = (source: Source, index: number) => {
    const author = source.author || source.domain;
    const year = source.publishDate ? new Date(source.publishDate).getFullYear() : 2025;
    const title = source.title;
    
    return `[${index}] ${author} (${year}). ${title}. Retrieved from ${source.url}`;
  };

  // Get research groups for the feed component
  const getResearchGroups = () => {
    // Group sources by message/conversation
    const groups = messages
      .filter(msg => msg.sources && msg.sources.length > 0)
      .map(msg => ({
        id: msg.id || `msg-${messages.indexOf(msg)}`,
        messageId: msg.id || `msg-${messages.indexOf(msg)}`,
        query: messages[messages.indexOf(msg) - 1]?.content || 'Research Query',
        timestamp: msg.timestamp || new Date().toISOString(),
        researchType: (msg.mode || mode) as 'fast' | 'deep' | 'academic' | 'scholar',
        sources: msg.sources || [],
        totalSources: msg.sources?.length || 0,
        status: (msg.status === 'thinking' ? 'active' : 'completed') as 'active' | 'completed'
      }));
    
    return groups;
  };

  // Handle source click
  const handleSourceClick = (source: Source) => {
    // Open source in new tab
    window.open(source.url, '_blank');
  };

  // Toggle bookmark for source
  const toggleBookmark = (sourceId: string) => {
    setBookmarkedSources(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sourceId)) {
        newSet.delete(sourceId);
      } else {
        newSet.add(sourceId);
      }
      return newSet;
    });
  };

  // Toggle section expansion
  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  // Scroll to reference
  const scrollToReference = (refId: string) => {
    const element = document.getElementById(refId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('highlight');
      setTimeout(() => element.classList.remove('highlight'), 2000);
    }
  };

  // Convert markdown to HTML
  const markdownToHtml = (markdown: string): string => {
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

  // Export to PDF/Print with full content
  const handlePrint = () => {
    // Create a print-friendly version with all messages and sources
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    // Build HTML content for printing
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Research Report - ${new Date().toLocaleDateString()}</title>
        <style>
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
        </style>
      </head>
      <body>
        <h1>Research Report</h1>
        <div class="metadata">
          <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Mode:</strong> ${modeConfig[mode].name}</p>
          <p><strong>Total Messages:</strong> ${messages.length}</p>
          <p><strong>Session ID:</strong> ${sessionId || 'New Session'}</p>
        </div>
        
        <h2>Conversation History</h2>
        ${messages.map((msg, idx) => `
          <div class="message-section">
            ${msg.role === 'user' ? `
              <div class="user-message">
                <strong>Question ${Math.floor(idx / 2) + 1}:</strong><br/>
                ${msg.content}
              </div>
            ` : `
              <div class="assistant-message">
                <strong>Research Response:</strong><br/>
                ${markdownToHtml(msg.content)}
              </div>
              ${msg.thoughts && msg.thoughts.length > 0 ? `
                <div class="thinking-section">
                  <strong>Research Process:</strong><br/>
                  ${msg.thoughts.map(t => `• ${t.content}`).join('<br/>')}
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
        
        <h2>All Research Sources</h2>
        <div class="sources-section">
          ${getAllSources().map((source, idx) => `
            <div class="source-item">
              <div class="source-title">[${idx + 1}] ${source.title}</div>
              <div class="source-url">${source.url}</div>
              ${source.domain ? `<div><strong>Domain:</strong> ${source.domain}</div>` : ''}
              ${source.publishDate ? `<div><strong>Published:</strong> ${source.publishDate}</div>` : ''}
              ${source.snippet ? `<div class="source-snippet">${source.snippet}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </body>
      </html>
    `;
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // Wait for content to load then print
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  // Export as downloadable HTML file
  const handleDownloadReport = () => {
    // Build the same HTML content for downloading
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Research Report - ${new Date().toLocaleDateString()}</title>
        <meta charset="UTF-8">
        <style>
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
        </style>
      </head>
      <body>
        <h1>Research Report</h1>
        <div class="metadata">
          <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Mode:</strong> ${modeConfig[mode].name}</p>
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
      </body>
      </html>
    `;
    
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

  // Copy with citations
  const copyWithCitations = (text: string, sources: Source[]) => {
    // Add reference numbers to copied text
    const textWithRefs = text + '\n\nReferences:\n' + 
      sources.map((s, i) => formatCitation(s, i + 1)).join('\n');
    navigator.clipboard.writeText(textWithRefs);
  };

  const stopResearch = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    setIsLoading(false);
    setIsThinking(false);
    setShowThinking(false);
  };

  const handleSubmit = async (e: React.FormEvent, isNewSession: boolean = false) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Determine if this is a continuation or new session
    const shouldContinue = sessionId && messages.length > 0 && !isNewSession;
    
    // Create or update session
    let currentSessionId = sessionId;
    if (!sessionId || isNewSession) {
      const newSessionId = `session_${Date.now()}_${mode}`;
      setSessionId(newSessionId);
      currentSessionId = newSessionId;
      navigate(`/conversation/${newSessionId}`);
      setIsContinuation(false);
    } else {
      setIsContinuation(shouldContinue);
    }

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
      mode,
      id: `msg_${Date.now()}`
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setIsThinking(true);
    setShowThinking(true);
    setThoughts([]);
    setCurrentSources([]);
    setError(null);

    abortControllerRef.current = new AbortController();

    try {
      let endpoint: string;
      let body: any;
      
      // Determine endpoint and body based on mode and continuation
      const useConversation = modeConfig[mode].useConversation;
      
      if (shouldContinue && modeConfig[mode].continueEndpoint) {
        // Use continue endpoint for deep/scholar modes
        endpoint = modeConfig[mode].continueEndpoint;
        body = {
          query: input,
          session_id: currentSessionId,
          require_approval: false,
          continue_session: true
        };
      } else {
        // Use start endpoint
        endpoint = modeConfig[mode].endpoint;
        
        if (mode === 'fast') {
          // Fast mode uses simple research
          body = {
            query: input,
            session_id: currentSessionId
          };
        } else {
          // Deep and Scholar modes use strands real
          body = {
            query: input,
            session_id: currentSessionId,
            require_approval: false,
            continue_session: false
          };
        }
      }

      const response = await fetch(`${apiUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to start research');
      }

      const data = await response.json();
      startPolling(data.session_id);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Request aborted');
      } else {
        console.error('Error starting research:', error);
        setError(error.message || 'Failed to start research');
        setIsLoading(false);
        setIsThinking(false);
      }
    }
  };

  const startPolling = (researchId: string) => {
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const statusEndpoint = modeConfig[mode].statusEndpoint;
        const endpoint = `${statusEndpoint}/${researchId}`;

        const response = await fetch(`${apiUrl}${endpoint}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch research status');
        }

        const data = await response.json();

        // Update thoughts
        if (data.thoughts && data.thoughts.length > 0) {
          setThoughts(data.thoughts);
          setIsThinking(true);
        }

        // Update current sources (for display during research)
        if (data.sources && data.sources.length > 0) {
          setCurrentSources(data.sources);
        }

        // Check for completion
        if (data.status === 'completed' || data.status === 'error') {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }

          if (data.status === 'error') {
            setError(data.error || 'Research failed');
            setIsLoading(false);
            setIsThinking(false);
            return;
          }

          // Process final content
          if (data.content && data.content.trim()) {
            const assistantMessage: Message = {
              role: 'assistant',
              content: data.content,
              sources: data.sources || [],
              thoughts: data.thoughts || [],
              timestamp: new Date().toISOString(),
              mode,
              id: `msg_${researchId}_${Date.now()}`
            };

            setMessages(prev => [...prev, assistantMessage]);
            setCurrentSources([]); // Clear current sources after adding to message
          }

          setIsLoading(false);
          setIsThinking(false);
          setShowThinking(false);
        }
      } catch (error) {
        console.error('Error polling research status:', error);
        setError('Failed to get research status');
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setIsLoading(false);
        setIsThinking(false);
      }
    }, 1000);
  };

  // Load session from history
  const loadSession = (session: Session) => {
    // Save current session if it has messages
    if (messages.length > 0) {
      saveSession();
    }
    
    // Load the selected session
    setSessionId(session.id);
    setMessages(session.messages || []);
    setMode(session.mode);
    setCurrentSources([]);
    setThoughts([]);
    setShowHistory(false);
    navigate(`/conversation/${session.id}`);
  };

  // Get all sources from all messages
  const getAllSources = () => {
    const allSources: Source[] = [];
    messages.forEach(msg => {
      if (msg.sources) {
        allSources.push(...msg.sources);
      }
    });
    return allSources;
  };

  return (
    <div className="scholarly-research-container">
      {/* Header with View Toggle */}
      <div className="scholarly-header">
        <div className="header-left">
          <h1 className="research-title">Research Assistant</h1>
          <div className="mode-selector">
            {(['fast', 'deep', 'scholar'] as const).map(m => (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                className={`mode-btn ${mode === m ? 'active' : ''}`}
              >
                {React.createElement(modeConfig[m].icon, { size: 16 })}
                <span>{modeConfig[m].name}</span>
              </button>
            ))}
          </div>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={createNewSession}
            className="action-btn new-session-btn"
            title="Start a new research session"
          >
            <Plus size={16} />
            <span>New Session</span>
          </button>
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="action-btn"
          >
            <History size={16} />
            <span>History ({sessions.length})</span>
          </button>
          <button 
            onClick={() => setViewMode(viewMode === 'chat' ? 'paper' : 'chat')}
            className="view-toggle-btn"
          >
            {viewMode === 'chat' ? <FileText size={16} /> : <MessageSquare size={16} />}
            <span>{viewMode === 'chat' ? 'Paper View' : 'Chat View'}</span>
          </button>
          <button onClick={handlePrint} className="action-btn">
            <Printer size={16} />
            <span>Print</span>
          </button>
          <button onClick={handleDownloadReport} className="action-btn">
            <Download size={16} />
            <span>Download Report</span>
          </button>
        </div>
      </div>

      {/* Mode Change Confirmation Dialog */}
      {showModeConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Switch Research Mode?</h3>
            <p>
              Switching from <strong>{modeConfig[mode].name}</strong> to <strong>{modeConfig[pendingMode!].name}</strong> will create a new session.
            </p>
            <p>Your current conversation will be saved to history.</p>
            <div className="modal-actions">
              <button onClick={cancelModeChange} className="btn-secondary">
                Cancel
              </button>
              <button onClick={confirmModeChange} className="btn-primary">
                Create New Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Panel */}
      {showHistory && (
        <div className="history-panel">
          <div className="history-header">
            <h3>Research History</h3>
            <button onClick={() => setShowHistory(false)} className="close-btn">
              <X size={20} />
            </button>
          </div>
          <div className="history-list">
            {sessions.map(session => (
              <div 
                key={session.id} 
                className="history-item"
                onClick={() => loadSession(session)}
              >
                <div className="history-mode">
                  {React.createElement(modeConfig[session.mode].icon, { size: 16 })}
                  <span>{modeConfig[session.mode].name}</span>
                </div>
                <div className="history-title">{session.title}</div>
                <div className="history-date">
                  {new Date(session.timestamp).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="scholarly-content">
        {/* Main Content Area */}
        <div className="research-main">
          {viewMode === 'paper' ? (
            /* Paper View */
            <div className="paper-view">
              {messages.filter(m => m.role === 'assistant').map((message, idx) => {
                const sections = parseScholarlyContent(message.content, message.sources);
                return (
                  <article key={idx} className="research-paper">
                    {/* Paper Header */}
                    <header className="paper-header">
                      <div className="paper-meta">
                        <span className="paper-date">
                          {new Date(message.timestamp || '').toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </span>
                        <span className="paper-mode">{modeConfig[message.mode || 'deep'].name}</span>
                      </div>
                    </header>

                    {/* Abstract Section */}
                    {sections.abstract && (
                      <section className="paper-section">
                        <div 
                          className="section-header"
                          onClick={() => toggleSection('abstract')}
                        >
                          <h2>Abstract</h2>
                          {expandedSections.has('abstract') ? 
                            <ChevronUp size={20} /> : <ChevronDown size={20} />
                          }
                        </div>
                        {expandedSections.has('abstract') && (
                          <div className="section-content abstract">
                            <div dangerouslySetInnerHTML={{ __html: sections.abstract }} />
                          </div>
                        )}
                      </section>
                    )}

                    {/* Main Sections */}
                    {['introduction', 'methodology', 'findings', 'discussion', 'conclusion'].map(section => {
                      const content = sections[section as keyof typeof sections];
                      if (!content || typeof content !== 'string') return null;
                      
                      return (
                        <section key={section} className="paper-section">
                          <div 
                            className="section-header"
                            onClick={() => toggleSection(section)}
                          >
                            <h2>{section.charAt(0).toUpperCase() + section.slice(1)}</h2>
                            {expandedSections.has(section) ? 
                              <ChevronUp size={20} /> : <ChevronDown size={20} />
                            }
                          </div>
                          {expandedSections.has(section) && (
                            <div 
                              className="section-content"
                              dangerouslySetInnerHTML={{ __html: content }}
                            />
                          )}
                        </section>
                      );
                    })}

                    {/* References Section */}
                    {message.sources && message.sources.length > 0 && (
                      <section className="paper-section references">
                        <div className="section-header">
                          <h2>References</h2>
                        </div>
                        <div className="references-list">
                          {message.sources.map((source, idx) => (
                            <div key={source.id} id={`ref-${idx + 1}`} className="reference-item">
                              <span className="ref-number">[{idx + 1}]</span>
                              <div className="ref-content">
                                <div className="ref-text">
                                  {formatCitation(source, idx + 1)}
                                </div>
                                <div className="ref-actions">
                                  <button
                                    onClick={() => toggleBookmark(source.id)}
                                    className={`bookmark-btn ${bookmarkedSources.has(source.id) ? 'bookmarked' : ''}`}
                                  >
                                    {bookmarkedSources.has(source.id) ? 
                                      <BookmarkCheck size={14} /> : <Bookmark size={14} />
                                    }
                                  </button>
                                  <a href={source.url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink size={14} />
                                  </a>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            /* Chat View - With message history */
            <div className="chat-view">
              {messages.map((message, index) => (
                <div key={message.id || index} className={`message ${message.role}`}>
                  <div className="message-avatar">
                    {message.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                  </div>
                  <div className="message-content">
                    {message.role === 'assistant' && message.sources ? (
                      <div className="formatted-content">
                        <div 
                          dangerouslySetInnerHTML={{ 
                            __html: formatMarkdownContent(parseContentWithReferences(message.content, message.sources))
                          }}
                        />
                      </div>
                    ) : (
                      <div className="formatted-content">
                        {message.role === 'assistant' ? (
                          <div dangerouslySetInnerHTML={{ __html: formatMarkdownContent(message.content) }} />
                        ) : (
                          <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a: ({ node, ...props }) => (
                                <a {...props} target="_blank" rel="noopener noreferrer" />
                              ),
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        )}
                      </div>
                    )}
                    
                    {/* Show sources for this message */}
                    {message.sources && message.sources.length > 0 && (
                      <div className="message-sources">
                        <h4>Sources ({message.sources.length})</h4>
                        <div className="message-sources-list">
                          {message.sources.map((source, idx) => (
                            <div key={source.id} className="message-source-item">
                              <span className="source-ref">[{idx + 1}]</span>
                              <a href={source.url} target="_blank" rel="noopener noreferrer">
                                {source.title}
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Thinking Box */}
          {isThinking && (
            <div className={`thinking-box ${showThinking ? 'expanded' : 'collapsed'}`}>
              <div 
                className="thinking-header"
                onClick={() => setShowThinking(!showThinking)}
              >
                <div className="thinking-title">
                  <Brain className="thinking-icon" />
                  <span>Research in Progress...</span>
                </div>
                <div className="thinking-controls">
                  {isLoading && (
                    <button onClick={stopResearch} className="stop-btn">
                      <Square size={14} />
                      Stop
                    </button>
                  )}
                  {showThinking ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>
              
              {showThinking && (
                <div className="thinking-content">
                  {thoughts.map((thought, idx) => (
                    <div key={idx} className="thought-item">
                      <span className="thought-type">{thought.type}:</span>
                      <span className="thought-content">{thought.content}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="error-message">
              <AlertCircle size={20} />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="error-close">
                <X size={16} />
              </button>
            </div>
          )}
        </div>

        {/* New TikTok-style Research Sources Feed */}
        <div className="sources-sidebar">
          <ResearchSourcesFeed
            groups={getResearchGroups()}
            currentSources={currentSources}
            onSourceClick={handleSourceClick}
            onBookmark={toggleBookmark}
            bookmarkedSources={bookmarkedSources}
            activeMessageId={messages[messages.length - 1]?.id}
            showGroupHeaders={true}
            compactMode={false}
          />
        </div>
      </div>

      {/* Input Form */}
      <form onSubmit={(e) => handleSubmit(e, false)} className="research-input-form">
        <div className="input-wrapper">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`${messages.length > 0 ? 'Continue the conversation...' : `Ask for ${modeConfig[mode].name.toLowerCase()}...`}`}
            className="research-input"
            disabled={isLoading}
          />
          <div className="input-actions">
            {isLoading ? (
              <button type="button" onClick={stopResearch} className="stop-button">
                <Square size={20} />
                <span>Stop</span>
              </button>
            ) : (
              <button type="submit" className="send-button" disabled={!input.trim()}>
                <Send size={20} />
                <span>{messages.length > 0 && modeConfig[mode].continueEndpoint ? 'Continue' : 'Research'}</span>
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

export default ScholarlyResearchView;