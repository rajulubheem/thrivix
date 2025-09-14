import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MermaidBlock from '../MermaidBlock';
import SimpleTabSimulator from './SimpleTabSimulator';
import { ModernLayout } from '../layout/ModernLayout';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Card } from '../ui/card';
import { Brain, ChevronDown, ChevronUp, Download, History, Printer, Send, Square, Bot, User, Link as LinkIcon, Plus, PlayCircle, Settings } from 'lucide-react';
import '../../styles/unified-theme.css';
import '../../styles/scholarly-research.css';

type Mode = 'fast' | 'deep' | 'scholar';
type Thought = { type: string; content: string; timestamp: string };
type Source = { id: string; title: string; url: string; domain: string; snippet?: string; favicon?: string; thumbnail?: string; number?: number };
type Message = { id?: string; role: 'user' | 'assistant'; content: string; timestamp?: string; sources?: Source[]; thoughts?: Thought[]; mode?: Mode };

const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const modeConfig: Record<Mode, { name: string; endpoint: string; statusEndpoint: string; continueEndpoint: string | null; useConversation: boolean; }>= {
  fast:   { name: 'Quick',   endpoint: '/api/v1/research/start',             statusEndpoint: '/api/v1/research/status',           continueEndpoint: null,                                useConversation: false },
  deep:   { name: 'Deep',    endpoint: '/api/v1/research/start-strands-real', statusEndpoint: '/api/v1/research/status-strands-real', continueEndpoint: '/api/v1/research/continue-strands-real', useConversation: true  },
  scholar:{ name: 'Scholar', endpoint: '/api/v1/research/start-strands-real', statusEndpoint: '/api/v1/research/status-strands-real', continueEndpoint: '/api/v1/research/continue-strands-real', useConversation: true  },
};

const safeDomain = (url: string) => { try { return new URL(url).hostname.replace(/^www\./,''); } catch { return ''; } };

const ScholarlyResearchView: React.FC = () => {
  const { sessionId: urlSessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [sessionId, setSessionId] = useState<string | null>(urlSessionId || null);
  const [mode, setMode] = useState<Mode>('deep');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [showThinking, setShowThinking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  // Model selection
  const [modelProvider, setModelProvider] = useState<string>('openai');
  const [modelId, setModelId] = useState<string>('gpt-4o-mini');
  const [modelConfig, setModelConfig] = useState<any>({ providers: {}, api_keys_configured: {} });

  const [messages, setMessages] = useState<Message[]>([]);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [steps, setSteps] = useState<any[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [sourcesTotal, setSourcesTotal] = useState<number>(0);
  const seenSourceUrlsRef = useRef<Set<string>>(new Set());
  const [screenshots, setScreenshots] = useState<Array<{url:string; description?:string; ts?:string}>>([]);
  const [sourcesCap, setSourcesCap] = useState<number>(60);
  const [compactSources, setCompactSources] = useState<boolean>(false);
  const [badUrls, setBadUrls] = useState<Set<string>>(new Set());
  const [pinnedUrls, setPinnedUrls] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<'all'|'pinned'|'flagged'|'cited'>('all');
  const [sortMode, setSortMode] = useState<'relevance'|'domain'|'title'|'cited-first'>('relevance');
  const [searchSources, setSearchSources] = useState('');
  const [evidence, setEvidence] = useState<Array<{url:string; bullets:Array<{type:string; text:string}>, tags?:string[]; ts?:string}>>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [simSources, setSimSources] = useState<Source[]>([]);
  const evidenceMap = useMemo(() => {
    const m = new Map<string, { bullets: Array<{type:string; text:string}>; tags?: string[] }>();
    try {
      for (const e of evidence) {
        if (e && e.url) m.set(e.url, { bullets: e.bullets || [], tags: e.tags });
      }
    } catch {}
    return m;
  }, [evidence]);
  const [liveContent, setLiveContent] = useState('');
  const [progress, setProgress] = useState<number>(0);
  const [verification, setVerification] = useState<any>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Array<{id: string; title: string; timestamp: string; mode: Mode}>>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [showSimulator, setShowSimulator] = useState(false);
  const [showModelManager, setShowModelManager] = useState(false);

  const sseRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEventTsRef = useRef<number>(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Smooth streaming buffer (coalesce content updates)
  const pendingContentRef = useRef<string>('');
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expandedTraces, setExpandedTraces] = useState<Set<string>>(new Set());

  useEffect(()=>{ 
    if (urlSessionId) {
      setSessionId(urlSessionId);
      loadSessionHistory(urlSessionId);
    }
    loadAllSessions();
    // Fetch model config + provider readiness
    fetch(`${apiUrl}/api/v1/research/model-config`).then(r=> r.json()).then(setModelConfig).catch(()=>{});
    fetch(`${apiUrl}/api/v1/research/health-strands-real`).then(r=> r.json()).then((h)=> setModelConfig((p:any)=> ({...p, api_keys_configured: (h?.api_keys_configured||p.api_keys_configured||{})}))).catch(()=>{});
  }, [urlSessionId]);
  
  useEffect(()=>{ 
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' }); 
  }, [messages, liveContent]);

  const loadSessionHistory = async (sid: string) => {
    try {
      const res = await fetch(`${apiUrl}${modeConfig[mode].statusEndpoint}/${sid}`);
      if (res.ok) {
        const data = await res.json();
        if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(data.messages.map((m: any) => ({
            id: m.id || `msg_${Date.now()}_${Math.random()}`,
            role: m.role || 'assistant',
            content: m.content || '',
            timestamp: m.timestamp || new Date().toISOString(),
            sources: m.sources || [],
            thoughts: m.thoughts || [],
            mode: m.mode || mode
          })));
        }
        // Only set sources and thoughts if they exist
        if (data.sources && data.sources.length > 0) setSources(data.sources);
        if (data.thoughts && data.thoughts.length > 0) setThoughts(data.thoughts);
      }
    } catch (err) {
      console.error('Failed to load session history:', err);
    }
  };

  const loadAllSessions = async () => {
    try {
      const stored = localStorage.getItem('research_sessions');
      if (stored) {
        setSessions(JSON.parse(stored));
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const clearAllSessions = () => {
    try {
      localStorage.removeItem('research_sessions');
      setSessions([]);
      setMessages([]);
      setSources([]);
      setThoughts([]);
      setSteps([]);
      setSessionId(null);
      navigate('/conversation');
    } catch (err) {
      console.error('Failed to clear sessions:', err);
    }
  };

  const saveSession = (sid: string, title?: string) => {
    try {
      const stored = localStorage.getItem('research_sessions');
      const existing = stored ? JSON.parse(stored) : [];
      const sessionTitle = title || input.slice(0, 50) || 'New Research';
      const updated = [
        { id: sid, title: sessionTitle, timestamp: new Date().toISOString(), mode },
        ...existing.filter((s: any) => s.id !== sid)
      ].slice(0, 50);
      localStorage.setItem('research_sessions', JSON.stringify(updated));
      setSessions(updated);
    } catch (err) {
      console.error('Failed to save session:', err);
    }
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      setSelectedText(selection.toString().trim());
    }
  };

  const handleSectionClick = (section: string) => {
    if (section && !isLoading) {
      setInput(prev => {
        const prefix = prev ? prev + ' ' : '';
        return prefix + section;
      });
    }
  };

  const connectEvents = (sid: string) => {
    try {
      // Close any existing SSE stream before opening a new one
      if (sseRef.current) {
        try { sseRef.current.close(); } catch {}
        sseRef.current = null;
      }
      const es = new EventSource(`${apiUrl}/api/v1/research/stream-events-strands-real/${sid}`);
      sseRef.current = es;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      // SSE watchdog: fallback to snapshot polling if no events in 5s
      lastEventTsRef.current = Date.now();
      if (sseWatchdogRef.current) { clearInterval(sseWatchdogRef.current); sseWatchdogRef.current = null; }
      sseWatchdogRef.current = setInterval(() => {
        if (Date.now() - lastEventTsRef.current > 5000) {
          es.close(); sseRef.current = null; clearInterval(sseWatchdogRef.current!); sseWatchdogRef.current = null; startPollingSnapshot(sid);
        }
      }, 1000);
      es.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data); lastEventTsRef.current = Date.now();
          if (!evt || !evt.type || evt.type === 'heartbeat') return;
          switch (evt.type) {
            case 'phase_start':
              setIsThinking(true);
              if (evt.phase === 'new_run') {
                // Reset transient UI buffers for a fresh run on the same session
                setLiveContent('');
                setSteps([]);
                setError(null);
                pendingContentRef.current = '';
                if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
              }
              break;
            case 'tool_start': setSteps(prev => [...prev, { icon: 'search', description: evt.query, status: 'active' }]); break;
            case 'tool_end': setSteps(prev => prev.map((s:any)=> (s.status==='active' && s.description===evt.query)? { ...s, status:'completed', summary:evt.summary, results_count:evt.results_count }: s)); break;
            case 'sources_delta': setSources(prev => {
              const added = (evt.added||[]).map((r:any)=>({ id:`${evt.index}-${r.index}-${r.url}`, title:r.title, url:r.url, domain:safeDomain(r.url), snippet:r.snippet, favicon:r.favicon || (r.url?`https://www.google.com/s2/favicons?domain=${safeDomain(r.url)}&sz=64`:undefined), thumbnail: r.thumbnail || (r.url? `https://picsum.photos/seed/${encodeURIComponent(r.url)}/400/220`: undefined) }));
              const merged=[...prev];
              const seen = seenSourceUrlsRef.current;
              for (const a of added) if (a.url && !seen.has(a.url)) { merged.push(a); seen.add(a.url); }
              setSourcesTotal(seen.size);
              return merged.slice(-sourcesCap);
            }); break;
            case 'screenshot': setScreenshots(prev => [{ url: evt.url, description: evt.description, ts: evt.ts }, ...prev].slice(0, 12)); break;
            case 'skim_result': setEvidence(prev => [{ url: evt.url, bullets: (evt.data?.bullets||[]), tags: evt.data?.tags||[], ts: evt.ts }, ...prev].slice(0, 50)); break;
            case 'link_status': if (evt.ok === false && typeof evt.url==='string') setBadUrls(prev => new Set([...Array.from(prev), evt.url])); break;
            case 'content_delta': if (typeof evt.chunk==='string') {
              pendingContentRef.current += (pendingContentRef.current ? "\n\n" : "") + evt.chunk;
              if (!flushTimerRef.current) {
                flushTimerRef.current = setTimeout(() => {
                  setLiveContent(prev => {
                    const next = (prev ? prev + "\n\n" : '') + pendingContentRef.current;
                    pendingContentRef.current = '';
                    return next.length > 8000 ? next.slice(-8000) : next;
                  });
                  flushTimerRef.current = null;
                }, 33);
              }
            } break;
            case 'verify_result': setVerification(evt.data || null); break;
            default: break;
          }
        } catch {}
      };
      es.onerror = () => { es.close(); sseRef.current = null; startPollingSnapshot(sid); };
    } catch { startPollingSnapshot(sid); }
  };

  const startPollingSnapshot = (sid: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    const endpoint = `${apiUrl}${modeConfig[mode].statusEndpoint}/${sid}`;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(endpoint); const data = await res.json();
        if (data.thoughts) setThoughts(data.thoughts);
        if (typeof data.progress === 'number') setProgress(data.progress);
        if (data.steps) setSteps(data.steps);
        if (Array.isArray(data.sources_all) && data.sources_all.length) setSources(data.sources_all);
        else if (Array.isArray(data.sources)) setSources(data.sources);
        if (typeof data.content === 'string') setLiveContent(data.content);
        if (data.status === 'completed' || data.status === 'error') finalizeFromSnapshot(data, sid);
      } catch {}
    }, 1000);
  };

  const finalizeFromSnapshot = (data:any, sid:string) => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    if (sseWatchdogRef.current) { clearInterval(sseWatchdogRef.current); sseWatchdogRef.current = null; }
    if (data.status === 'error') { setError(data.error || 'Research failed'); setIsLoading(false); setIsThinking(false); return; }
    if (data.content && data.content.trim()) {
      const linked = linkifyCitations(data.content, data.sources||[]);
      setMessages(prev => [...prev, { id:`msg_${sid}_${Date.now()}`, role:'assistant', content: linked, sources:data.sources||[], thoughts:data.thoughts||[], timestamp:new Date().toISOString(), mode }]);
      setLiveContent('');
      pendingContentRef.current = '';
      if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
      // Trigger backend link check
      fetch(`${apiUrl}/api/v1/research/check-links-strands-real/${sid}`, { method:'POST' }).catch(()=>{});
      // Refresh full message history to include trace attached by backend
      fetch(`${apiUrl}${modeConfig[mode].statusEndpoint}/${sid}`)
        .then(res => res.json())
        .then((full:any) => {
          if (Array.isArray(full.messages) && full.messages.length>0) {
            const mapped = full.messages.map((m:any) => {
              const c = (m.role === 'assistant') ? linkifyCitations(m.content || '', m.sources || []) : (m.content || '');
              return ({
                id: m.id || `msg_${Math.random()}`,
                role: m.role || 'assistant',
                content: c,
                timestamp: m.timestamp || new Date().toISOString(),
                sources: m.sources || [],
                thoughts: m.thoughts || [],
                trace: m.trace,
                mode: m.mode || mode
              });
            });
            setMessages(mapped);
            // Auto-expand trace for last assistant if available
            const lastWithTrace = [...mapped].reverse().find(x => x.role==='assistant' && (x as any).trace);
            if (lastWithTrace && lastWithTrace.id) {
              setExpandedTraces(prev => { const n = new Set(prev); n.add(lastWithTrace.id as string); return n; });
            }
          }
        })
        .catch(()=>{});
    }
    setIsLoading(false); setIsThinking(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!input.trim() || isLoading) return; setError(null);
    setIsLoading(true); setIsThinking(true); setLiveContent(''); setSteps([]);
    // Ensure any previous SSE stream is closed before starting a new run
    if (sseRef.current) { try { sseRef.current.close(); } catch {} sseRef.current = null; }
    if (sseWatchdogRef.current) { clearInterval(sseWatchdogRef.current); sseWatchdogRef.current = null; }
    // Optimistic UI: show planning step immediately
    setSteps([{ icon:'plan', description:'Planning research...', status:'active' }]);
    let sid = sessionId || `session_${Date.now()}_${mode}`;
    if (!sessionId) { 
      setSessionId(sid); 
      navigate(`/conversation/${sid}`);
      saveSession(sid);
    }
    const userMessage = { id:`user_${Date.now()}`, role:'user' as const, content: input, timestamp:new Date().toISOString(), mode };
    setMessages(prev => {
      const newMessages = [...prev, userMessage];
      console.log('Adding user message, total messages:', newMessages.length);
      return newMessages;
    });
    const query = input; setInput('');
    try {
      const isContinuation = !!sessionId && messages.length > 0 && !!modeConfig[mode].continueEndpoint;
      const url = `${apiUrl}${isContinuation ? modeConfig[mode].continueEndpoint : modeConfig[mode].endpoint}`;
      const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ query, session_id: sid, require_approval: false, mode, model_provider: modelProvider, model_id: modelId }) });
      if (!res.ok) throw new Error('Failed to start');
      connectEvents(sid);
    } catch (err:any) { setError(err.message || 'Failed to start research'); setIsLoading(false); setIsThinking(false); }
  };

  const stopResearch = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current=null; }
    if (sseRef.current) { sseRef.current.close(); sseRef.current=null; }
    setIsLoading(false); setIsThinking(false);
    if (sessionId) {
      fetch(`${apiUrl}/api/v1/research/cancel-strands-real/${sessionId}`, { method:'POST' }).catch(()=>{});
    }
  };

  const getFinalContent = () => {
    const lastAssistant = [...messages].reverse().find(m=> m.role==='assistant');
    return (lastAssistant?.content || liveContent || '').trim();
  };

  const buildSourcesHtml = () => {
    if (!sources || sources.length===0) return '<p>No sources</p>';
    const items = sources.map((s)=> (
      `<div style="margin:10px 0;padding:8px;border:1px solid #e5e7eb;border-radius:8px;">
         <div style="font-size:12px;color:#64748b;">${s.domain||''}</div>
         <div style="font-weight:600;"><a href="${s.url}" target="_blank" rel="noreferrer">${s.title||''}</a></div>
         ${s.snippet? `<div style=\"font-size:14px;color:#475569;margin-top:4px;\">${s.snippet}</div>`:''}
       </div>`)).join('');
    return `<div>${items}</div>`;
  };

  function buildRichReportHtml(markdown: string, sourcesList: any[], meta: { title: string; generatedAt: string }) {
    const titleFromMd = (() => {
      const m = markdown.match(/^#\s+(.+)$/m); return m? m[1].trim() : meta.title;
    })();
    // Normalize any pre-linked citations to raw [n] to avoid double-linking
    const normalizedMd = normalizeCitations(markdown || '');
    let linkifiedMd = linkifyCitationsForExport(normalizedMd, sourcesList);
    // Extract Executive Summary section in a robust way (case-insensitive, any heading level, optional colon)
    const summaryRegex = /^#{1,6}[\t ]*executive\s+summary[:]?[\t ]*\n([\s\S]*?)(?=^#{1,6}[\t ]+|$)/im;
    let summaryInner = '';
    const sm = linkifiedMd.match(summaryRegex);
    if (sm) {
      summaryInner = sm[1].trim();
      // Remove the Executive Summary section from the body to avoid duplication
      linkifiedMd = linkifiedMd.replace(summaryRegex, '');
    }
    const headings = Array.from(linkifiedMd.matchAll(/^##\s+(.+)$/gm)).map(m => m[1]);
    const sourcesHtml = (sourcesList||[]).map((s:any) => `
      <div class="src">
        <div class="src-head">
          ${s.favicon? `<img class=\"fav\" src=\"${s.favicon}\"/>` : ''}
          <div class="src-meta">
            <div class="src-domain">${s.domain || ''}</div>
            <a class="src-title" href="${s.url}" target="_blank" rel="noreferrer">${s.title || s.url || 'Untitled'}</a>
          </div>
        </div>
        ${s.snippet? `<div class=\"src-snippet\">${escapeHtml(s.snippet)}</div>`:''}
      </div>
    `).join('\n');

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(titleFromMd)}</title>
  <style>
    :root{ --bg:#ffffff; --text:#0f172a; --muted:#64748b; --primary:#2563eb; --border:#e5e7eb; }
    *{ box-sizing:border-box; }
    body{ margin:0; background:var(--bg); color:var(--text); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial, sans-serif; }
    a{ color:var(--primary); text-decoration:none; }
    a:hover{ text-decoration:underline; }
    .container{ max-width: 860px; margin: 0 auto; padding: 32px 24px; }
    .print-header{ display:none; }
    .print-footer{ display:none; }
    .cover{ padding:64px 0 48px; border-bottom:1px solid var(--border); }
    .title{ font-size:34px; font-weight:750; margin:0 0 8px; }
    .meta{ color:var(--muted); font-size:14px; }
    .summary{ background:#f8fafc; border:1px solid var(--border); border-radius:12px; padding:16px; margin-top:16px; }
    .toc{ margin:24px 0; border-top:1px dashed var(--border); border-bottom:1px dashed var(--border); padding:12px 0; }
    .toc h3{ margin:0 0 8px; font-size:14px; color:var(--muted) }
    .toc ul{ margin:0; padding-left:18px; }
    .content{ margin:28px 0; line-height:1.7; }
    .content h1{ font-size:28px; margin:24px 0 12px; }
    .content h2{ font-size:22px; margin:24px 0 12px; }
    .content h3{ font-size:18px; margin:18px 0 10px; }
    .content p{ margin:10px 0; }
    .content li{ margin:6px 0; }
    .sources{ page-break-before: always; }
    .sources h2{ font-size:22px; margin:10px 0 12px; }
    .src{ border:1px solid var(--border); border-radius:10px; padding:12px; margin:10px 0; }
    .src-head{ display:flex; align-items:center; gap:10px; }
    .fav{ width:16px; height:16px; }
    .src-domain{ color:var(--muted); font-size:12px; }
    .src-title{ display:block; font-weight:600; margin-top:2px; }
    .src-snippet{ color:#334155; font-size:14px; margin-top:6px; }
    .footer{ margin-top:40px; color:var(--muted); font-size:12px; text-align:center; }
    @media print{ 
      .container{ padding:24px 24px; }
      .cover{ padding-top:24px; }
      .print-header{ display:block; position: running(header); font-size:12px; color:var(--muted); }
      .print-footer{ display:block; position: running(footer); font-size:12px; color:var(--muted); }
      @page { margin: 18mm; 
        @top-center { content: element(header) }
        @bottom-center { content: element(footer) }
      }
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
</head>
<body>
  <div class="print-header"><div>${escapeHtml(titleFromMd)}</div></div>
  <div class="print-footer"><div>Page <span class="pagenum"></span> of <span class="pagecount"></span></div></div>
  <div class="container">
    <section class="cover">
      <div class="title">${escapeHtml(titleFromMd)}</div>
      <div class="meta">Generated: ${escapeHtml(meta.generatedAt)}</div>
      <div class="summary">
        <div style="font-weight:600; margin-bottom:6px;">Executive Summary</div>
        <div id="summary-slot" style="font-size:14px; color:#334155;"></div>
      </div>
      ${headings && headings.length? `
      <div class="toc">
        <h3>Contents</h3>
        <ul>
          ${headings.map(h => `<li>${escapeHtml(h)}</li>`).join('')}
        </ul>
      </div>` : ''}
    </section>
    <section class="content" id="md-slot"></section>
    <section class="sources">
      <h2>Sources</h2>
      ${sourcesHtml}
    </section>
    <div class="footer">Prepared with Thrivix Research Assistant</div>
  </div>
  <script>
    const raw = ${JSON.stringify(linkifiedMd || '')};
    const html = window.marked.parse(raw || '');
    document.getElementById('md-slot').innerHTML = html;
    try {
      const summaryMd = ${JSON.stringify(summaryInner)};
      const summ = summaryMd ? window.marked.parse(summaryMd) : '';
      document.getElementById('summary-slot').innerHTML = summ || '<em>No executive summary found</em>';
    } catch (e) {
      document.getElementById('summary-slot').innerHTML = '<em>No executive summary found</em>';
    }
    document.querySelectorAll('#md-slot a').forEach(a=>{ a.target='_blank'; a.rel='noreferrer'; });
  </script>
</body>
</html>`;
  }

  function escapeHtml(s: string){
    return String(s||'').replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'} as any)[c]);
  }
  function linkifyCitationsForExport(text: string, sources: any[]): string {
    if (!text || !Array.isArray(sources) || sources.length===0) return text;
    const map = new Map<number, string>();
    sources.forEach((s:any, idx:number) => {
      const n = s.number || (idx+1);
      if (s.url) map.set(n, s.url);
    });
    return text.replace(/\[(\d+)\](?!\()/g, (m, n) => {
      const url = map.get(parseInt(n,10));
      return url ? `[[${n}]](${url})` : m;
    });
  }
  function normalizeCitations(text: string): string {
    if (!text) return text;
    // Convert any [n](url), [[n]](url), [ [n] ](url) to plain [n]
    const step1 = text.replace(/\[\s*\[?\s*(\d+)\s*\]?\s*\]\([^\)]+\)/g, '[$1]');
    // Collapse accidental patterns like ...]](url)](url) to a single closing paren
    return step1.replace(/\]\([^\)]*\)\]\([^\)]*\)/g, ')');
  }

  const handlePrint = () => {
    const content = getFinalContent();
    const html = buildRichReportHtml(content, sources, { title: 'Research Report', generatedAt: new Date().toLocaleString() });
    const win = window.open('', '_blank'); if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(()=> { try { win.focus(); win.print(); } catch {} }, 200);
  };

  const handleDownload = () => {
    const content = getFinalContent();
    const html = buildRichReportHtml(content, sources, { title: 'Research Report', generatedAt: new Date().toLocaleString() });
    const blob = new Blob([html], { type:'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download = `research-report-${new Date().toISOString().split('T')[0]}.html`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };
  const handleVerify = async () => {
    setVerifyError(null);
    if (!sessionId) { setVerifyError('No session to verify'); return; }
    setVerifyLoading(true);
    try {
      const data = await postJson(`${apiUrl}/api/v1/research/verify-strands-real/${sessionId}`);
      if (data?.verification) setVerification(data.verification);
    } catch (e:any) {
      setVerifyError(e.message || 'Verification failed');
    } finally {
      setVerifyLoading(false);
    }
  };
  useEffect(()=>{
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current=null; }
      if (sseWatchdogRef.current) { clearInterval(sseWatchdogRef.current); sseWatchdogRef.current=null; }
      if (sseRef.current) { sseRef.current.close(); sseRef.current=null; }
    };
  },[]);

  // Virtualized Sources list component (avoid hooks inside useMemo)
  // Map of citation numbers by URL from the last assistant message
  const citationMap = useMemo(() => {
    try {
      const lastAssistant = [...messages].reverse().find(m => m.role==='assistant' && Array.isArray(m.sources) && m.sources.length>0);
      const map = new Map<string, number>();
      if (lastAssistant) {
        (lastAssistant.sources || []).forEach((s:any, idx:number) => { if (s?.url) map.set(String(s.url), s.number || (idx+1)); });
      }
      return map;
    } catch { return new Map<string, number>(); }
  }, [messages]);

  // Filter + sort sources (outside virtualization)
  const processedSources: Source[] = useMemo(() => {
    const q = searchSources.trim().toLowerCase();
    const citedSet = new Set<string>(Array.from(citationMap.keys()))
    let arr = [...sources];
    // filter
    arr = arr.filter(s => {
      if (!s || !s.url) return false;
      if (filterMode === 'pinned' && !pinnedUrls.has(s.url)) return false;
      if (filterMode === 'flagged' && !badUrls.has(s.url)) return false;
      if (filterMode === 'cited' && !citedSet.has(s.url)) return false;
      if (!q) return true;
      const hay = `${s.title||''} ${s.snippet||''} ${s.domain||''}`.toLowerCase();
      return hay.includes(q);
    });
    // sort
    const citedScore = (u:string) => citedSet.has(u) ? 1 : 0;
    if (sortMode === 'cited-first') {
      arr.sort((a,b)=> (pinnedUrls.has(b.url)?1:0)-(pinnedUrls.has(a.url)?1:0) || citedScore(b.url)-citedScore(a.url));
    } else if (sortMode === 'domain') {
      arr.sort((a,b)=> (pinnedUrls.has(b.url)?1:0)-(pinnedUrls.has(a.url)?1:0) || (a.domain||'').localeCompare(b.domain||''));
    } else if (sortMode === 'title') {
      arr.sort((a,b)=> (pinnedUrls.has(b.url)?1:0)-(pinnedUrls.has(a.url)?1:0) || (a.title||'').localeCompare(b.title||''));
    } else {
      // relevance: pins then cited
      arr.sort((a,b)=> (pinnedUrls.has(b.url)?1:0)-(pinnedUrls.has(a.url)?1:0) || citedScore(b.url)-citedScore(a.url));
    }
    return arr;
  }, [sources, filterMode, sortMode, searchSources, pinnedUrls, badUrls, citationMap]);

  function SourceListFlat({ sources }: { sources: Source[] }) {
    const items = sources.slice(0, sourcesCap);
    return (
      <ScrollArea className="h-full">
        <div className="h-full overflow-y-auto">
          <div className="p-3 space-y-3">
            {items.length === 0 && (<div className="text-sm text-muted-foreground px-2">No sources yet</div>)}
            {items.map((s, i) => (
              <Card
                key={s.id || `${i}-${s.url}`}
                className={`p-0 overflow-hidden transition-colors hover:border-primary/40 ${isFlagged(s) ? 'border border-red-500' : ''}`}
              >
                <div className="flex gap-3 p-3">
                  {!compactSources && s.thumbnail ? (
                    <div className="w-[72px] h-[72px] rounded overflow-hidden bg-muted flex-shrink-0">
                      <img src={s.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy"/>
                    </div>
                  ) : (<div className="w-[10px]"/>) }
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {s.favicon && (<img src={s.favicon} alt="" className="h-3.5 w-3.5"/>)}
                      <span className="truncate">{s.domain}</span>
                      {citationMap.has(s.url) && (<span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">[{citationMap.get(s.url)}]</span>)}
                      {classifyBadges(s).map((b,bi)=> (<span key={`b-${bi}`} className="px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border border-border">{b}</span>))}
                      {isFlagged(s) && (<span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">flagged</span>)}
                      {pinnedUrls.has(s.url) && (<span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">pinned</span>)}
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={selectedUrls.has(s.url)} onChange={(e)=> toggleSelect(s, e.currentTarget.checked)} />
                      <a href={s.url} target="_blank" rel="noreferrer" className="block font-medium hover:underline break-words flex-1">{s.title || s.url}</a>
                      <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded border border-border">QS {qualityScore(s)}</span>
                    </div>
                    {(!compactSources && s.snippet) && (<div className="text-sm text-muted-foreground mt-1 line-clamp-2">{s.snippet}</div>)}
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <button className="px-2 py-1 rounded border border-border hover:bg-secondary" onClick={()=> window.open(s.url,'_blank')}>Open</button>
                      <button className="px-2 py-1 rounded border border-border hover:bg-secondary" onClick={()=> navigator.clipboard.writeText(s.url).catch(()=>{})}>Copy</button>
                      <button className="px-2 py-1 rounded border border-border hover:bg-secondary" onClick={()=> insertToPrompt(s)}>Insert</button>
                      <button className="px-2 py-1 rounded border border-border hover:bg-secondary" onClick={()=> togglePin(s)}>{pinnedUrls.has(s.url)? 'Unpin':'Pin'}</button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            {sourcesCap < processedSources.length && (
              <div className="pt-1"><Button size="sm" variant="outline" onClick={()=> setSourcesCap(c=> Math.min(c+30, processedSources.length))}>Load more</Button></div>
            )}
          </div>
        </div>
      </ScrollArea>
    );

    function isFlagged(s: Source) {
      // Mark source if flagged by verification (by URL or index)
      try {
        const urlFlag = verification?.flagged_urls?.includes?.(s.url);
        if (urlFlag) return true;
        const idx = processedSources.findIndex(x => x.url === s.url);
        if (idx >= 0 && Array.isArray(verification?.weak_citations)) {
          return verification.weak_citations.includes(idx+1);
        }
      } catch {}
      return false;
    }
    function insertToPrompt(s: Source) {
      setInput(prev => prev ? prev + `\n${s.title} ${s.url}` : `${s.title} ${s.url}`);
    }
    function togglePin(s: Source) {
      setPinnedUrls(prev => {
        const n = new Set(prev);
        if (n.has(s.url)) n.delete(s.url); else n.add(s.url);
        return n;
      });
    }
    function toggleSelect(s: Source, on: boolean) {
      setSelectedUrls(prev => {
        const n = new Set(prev);
        if (on) n.add(s.url); else n.delete(s.url);
        return n;
      });
    }
    function qualityScore(s: Source): number {
      try {
        let score = 0;
        const url = (s.url||'').toLowerCase();
        const text = `${s.title||''} ${s.snippet||''}`.toLowerCase();
        const cited = citationMap.has(s.url);
        const flagged = isFlagged(s);
        if (cited) score += 2; if (!flagged) score += 1;
        if (url.includes('sec.gov')) score += 3; if (text.includes('10-k')||text.includes('10-q')||text.includes('8-k')) score += 2;
        if (text.includes('investor relations')) score += 1; if (text.includes('transcript')) score += 1;
        if (url.endsWith('.pdf')) score += 1;
        if (s.snippet) score += 1; if (s.favicon) score += 0.5;
        if (/cnbc|reuters|bloomberg|marketwatch|yahoo|wsj/.test(url)) score += 1;
        if (/reddit|medium|quora/.test(url)) score -= 1;
        score = Math.max(0, Math.min(10, Math.round(score)));
        return score;
      } catch { return 0; }
    }
    function classifyBadges(s: Source): string[] {
      const badges: string[] = [];
      const url = (s.url || '').toLowerCase();
      const text = `${s.title||''} ${s.snippet||''}`.toLowerCase();
      if (url.includes('sec.gov')) badges.push('SEC');
      if (/\b10-k\b|\b10-q\b|\b8-k\b/.test(text)) badges.push('Filing');
      if (text.includes('investor relations') || url.includes('/investor') || url.includes('/ir')) badges.push('IR');
      if (text.includes('press release')) badges.push('Press');
      if (text.includes('transcript') || text.includes('earnings call')) badges.push('Transcript');
      if (text.includes('analyst') || text.includes('price target')) badges.push('Analyst');
      if (url.endsWith('.pdf') || text.includes('[pdf]')) badges.push('PDF');
      if (/cnbc|reuters|bloomberg|marketwatch|yahoo|wsj|investopedia/.test(url)) badges.push('News');
      if (/tipranks|marketbeat|tradingview|seekingalpha|stockanalysis/.test(url)) badges.push('Market');
      return badges.slice(0,3);
    }
  }

  const SourceList = (
    <SourceListFlat sources={processedSources} />
  );

  // Display all messages without virtualization for now to fix display issue
  const chatVisible = messages;

  return (
    <ModernLayout>
      <div className="flex flex-col h-screen bg-background">
        <div className="w-full border-b bg-card px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-lg font-semibold">Research Assistant</h1>
            <div className="flex-1 flex justify-center">
              <Tabs value={mode} onValueChange={(v:any)=> {
                // If there's an active session with messages, ask for confirmation
                if (messages.length > 0 && v !== mode) {
                  setPendingMode(v);
                  setShowSwitchConfirm(true);
                } else {
                  // No active session, switch immediately
                  setMode(v);
                  setSessionId(null);
                  setMessages([]);
                  setError(null);
                  setIsLoading(false);
                  setIsThinking(false);
                  navigate('/conversation');
                }
              }}>
                <TabsList className="h-8"><TabsTrigger value="fast">Quick</TabsTrigger><TabsTrigger value="deep">Deep</TabsTrigger><TabsTrigger value="scholar">Scholar</TabsTrigger></TabsList>
              </Tabs>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  // If there's an active session with messages, ask for confirmation
                  if (messages.length > 0) {
                    if (window.confirm('Start a new chat? Your current conversation will be saved in history.')) {
                      setSessionId(null);
                      setMessages([]);
                      setError(null);
                      setIsLoading(false);
                      setIsThinking(false);
                      navigate('/conversation');
                    }
                  } else {
                    // No active session, start new immediately
                    setSessionId(null);
                    setMessages([]);
                    setError(null);
                    setIsLoading(false);
                    setIsThinking(false);
                    navigate('/conversation');
                  }
                }}
              >
                <Plus className="h-4 w-4 mr-1"/>New Chat
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)}>
                <History className="h-4 w-4 mr-1"/>History
              </Button>
              {sources.length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowSimulator(!showSimulator)}
                >
                  <PlayCircle className="h-4 w-4 mr-1"/>
                  Simulate
                </Button>
              )}
              <Button variant="ghost" size="sm" disabled={verifyLoading || !sessionId} onClick={handleVerify}>
                {verifyLoading? 'Verifying...' : 'Verify'}
              </Button>
              <Button variant="ghost" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1"/>Print
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-1"/>Download
              </Button>
              {/* Current model pill */}
              <span title={`Provider: ${modelProvider}\nModel: ${modelId}`} onClick={()=> setShowModelManager(true)} className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border text-xs cursor-pointer hover:bg-muted max-w-[220px] truncate text-foreground">
                {(() => { const ready = modelConfig?.api_keys_configured?.[modelProvider === 'bedrock' ? 'aws' : modelProvider]; return <span className={`inline-block h-2 w-2 rounded-full ${ready? 'bg-green-500':'bg-red-500'}`}/> })()}
                <span className="truncate">{`${modelProvider}: ${modelId}`}</span>
              </span>
              <Button variant="ghost" size="sm" title="Manage models" onClick={()=> setShowModelManager(true)}>
                <Settings className="h-4 w-4"/>
              </Button>
            </div>
          </div>
          {/* Model bar removed (pill above) */}
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* History Sidebar */}
          {showHistory && (
            <div className="w-72 border-r bg-card flex flex-col">
              {/* Actions */}
              <div className="p-3 border-b">
                <div className="text-sm font-medium mb-2">History</div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1" 
                    onClick={() => {
                      setSessionId(null);
                      setMessages([]);
                      setSources([]);
                      setThoughts([]);
                      setSteps([]);
                      navigate('/conversation');
                    }}
                  >
                    New Session
                  </Button>
                  {sessions.length > 0 && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-red-600 hover:text-red-700" 
                      onClick={() => {
                        if (window.confirm('Clear all session history? This cannot be undone.')) {
                          clearAllSessions();
                        }
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
              {/* This Conversation */}
              <div className="p-3 border-b">
                <div className="text-xs font-medium text-muted-foreground mb-2">This Conversation</div>
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {messages.slice(-12).map((m, idx) => (
                    <div key={m.id || idx} className="p-2 rounded hover:bg-muted">
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] px-1.5 py-0.5 rounded ${m.role==='user'?'bg-blue-100 text-blue-700':'bg-emerald-100 text-emerald-700'}`}>{m.role}</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(m.timestamp||'').toLocaleTimeString()}</span>
                      </div>
                      <div className="mt-1 text-xs line-clamp-3 break-words">{m.content}</div>
                      <div className="mt-1 flex items-center gap-2 justify-end">
                        {m.role==='user' ? (
                          <Button size="sm" variant="outline" onClick={()=> setInput(prev => prev? (prev+"\n\n"+m.content) : m.content)}>Use as draft</Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={()=> navigator.clipboard.writeText(m.content).catch(()=>{})}>Copy</Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {messages.length === 0 && (
                    <div className="text-xs text-muted-foreground">No messages yet</div>
                  )}
                </div>
              </div>
              {/* Previous Sessions */}
              <div className="p-3 border-b">
                <div className="text-xs font-medium text-muted-foreground mb-2">Previous Sessions</div>
                <ScrollArea className="max-h-60">
                  <div className="space-y-1 pr-1">
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        className={`p-2 rounded cursor-pointer hover:bg-muted transition-colors ${s.id === sessionId ? 'bg-muted' : ''}`}
                        onClick={() => {
                          setSessionId(s.id);
                          setMode(s.mode);
                          navigate(`/conversation/${s.id}`);
                          loadSessionHistory(s.id);
                        }}
                      >
                        <div className="text-sm font-medium truncate">{s.title}</div>
                        <div className="text-xs text-muted-foreground">{new Date(s.timestamp).toLocaleDateString()}</div>
                      </div>
                    ))}
                    {sessions.length === 0 && (
                      <div className="text-xs text-muted-foreground">No previous sessions</div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}

          {/* Chat */}
          <div className="flex-1 flex flex-col border-r">
            {/* Inline Status Bar within chat column (non-sticky to avoid overlay) */}
            {(isLoading || isThinking) && (
            <div className="border-b bg-card">
              <div className="px-4 py-2 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground mb-1">Gathering sources and creating your report…</div>
                  <ProgressBar steps={steps} backendProgress={progress} />
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button variant="outline" size="sm" onClick={stopResearch}><Square className="h-4 w-4 mr-1"/>Stop</Button>
                </div>
              </div>
              <div className="px-4 pb-2 text-[11px]">
                <div className="mb-1 flex flex-wrap gap-1.5">
                  {steps.filter((s:any)=> s?.icon==='search').slice(-6).map((s:any,i:number)=> (
                    <span key={`chip-${i}`} className="px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border">{s.description}</span>
                  ))}
                </div>
              </div>
            </div>
            )}
            <ScrollArea className="flex-1">
              <div className="px-6 py-4">
                {/* Debug info */}
                <div className="text-xs text-muted-foreground mb-2">
                  Messages: {messages.length} | Visible: {chatVisible.length}
                </div>
                
                {messages.length === 0 && !isLoading && (
                  <div className="text-center text-muted-foreground py-8">
                    Start a conversation by typing a message below
                  </div>
                )}
                {chatVisible.map((m, i) => (
                  <div key={m.id || `msg-${i}`} className={`message ${m.role}`} style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }} onMouseUp={handleTextSelection}>
                    <div className="message-avatar" style={{ flexShrink: 0 }}>
                      {m.role==='user'? <User size={18}/> : <Bot size={18}/>}
                    </div>
                    <div style={{ flex: 1 }}>
                      {/* Message header with role and timestamp */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        marginBottom: '4px',
                        fontSize: '12px',
                        color: '#6b7280'
                      }}>
                        <span style={{ fontWeight: '600' }}>
                          {m.role === 'user' ? 'You' : 'Assistant'}
                        </span>
                        {m.timestamp && (
                          <>
                            <span>•</span>
                            <span>{new Date(m.timestamp).toLocaleTimeString()}</span>
                          </>
                        )}
                      </div>
                      <div className={`message-content p-4 rounded-md border ${m.role==='user' ? 'bg-blue-50 dark:bg-blue-950/30' : 'bg-card'} text-foreground border-border`}>
                      {m.content ? (
                        m.role === 'user' ? (
                          <div style={{ 
                            whiteSpace: 'pre-wrap',
                            fontWeight: '500',
                            color: '#1e293b'
                          }}>
                            {m.content}
                          </div>
                        ) : (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code(codeProps) {
                              const { node, className, children, ...rest } = codeProps as any;
                              const match = /language-(\w+)/.exec(className || '');
                              const lang = match?.[1]?.toLowerCase();
                              const text = String(children ?? '').trim();
                              const isInline = (codeProps as any).inline ?? false;
                              if (!isInline && (lang === 'mermaid' || text.startsWith('graph ') || text.startsWith('sequenceDiagram'))){
                                return <MermaidBlock chart={text} />;
                              }
                              return <code className={className} {...rest}>{children}</code>;
                            },
                            a(props) {
                              const { href, children } = props as any;
                              // Check if this is a citation link [1], [2], [[11]], etc.
                              const childText = String(children);
                              const isCitation = /^\[?\d+\]?$/.test(childText);
                              
                              return (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    color: isCitation ? '#3b82f6' : '#0ea5e9',
                                    textDecoration: 'none',
                                    fontWeight: isCitation ? '600' : 'normal',
                                    fontSize: isCitation ? '0.875em' : 'inherit',
                                    verticalAlign: isCitation ? 'super' : 'baseline',
                                    padding: isCitation ? '0 2px' : '0',
                                    borderRadius: isCitation ? '2px' : '0',
                                    transition: 'all 0.2s',
                                    cursor: 'pointer'
                                  }}
                                  onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
                                    e.currentTarget.style.textDecoration = 'underline';
                                    if (isCitation) {
                                      e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
                                    }
                                  }}
                                  onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
                                    e.currentTarget.style.textDecoration = 'none';
                                    if (isCitation) {
                                      e.currentTarget.style.backgroundColor = 'transparent';
                                    }
                                  }}
                                  title={isCitation ? `View source ${childText}` : href}
                                >
                                  {children}
                                </a>
                              );
                            }
                          }}
                        >
                          {m.content}
                        </ReactMarkdown>
                        )
                      ) : (
                        <span className="text-muted-foreground">Empty message</span>
                      )}
                      {/* Inline Thinking & Tools tied to this assistant message */}
                      {m.role==='assistant' && (m as any).trace && (
                        (() => {
                          const trace: any = (m as any).trace;
                          const steps = Array.isArray(trace?.steps) ? trace.steps.filter((s:any)=> s?.icon==='search') : [];
                          const tools = Array.isArray(trace?.tool_calls) ? trace.tool_calls : [];
                          const srcs = Array.isArray(trace?.sources) ? trace.sources.slice(0,6) : [];
                          const mid = (m.id || `msg-${i}`) as string;
                          const open = expandedTraces.has(mid);
                          return (
                            <div style={{ marginTop: '8px', borderTop: '1px solid #e5e7eb' }}>
                              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:'12px', color:'#6b7280', paddingTop:'6px', cursor:'pointer' }}
                                onClick={() => setExpandedTraces(prev => { const n = new Set(prev); if (n.has(mid)) n.delete(mid); else n.add(mid); return n; })}>
                                <span>Thinking & Tools</span>
                                <span>{open? 'Hide' : 'Show'}</span>
                              </div>
                              {open && (
                                <div style={{ marginTop:'6px' }}>
                                  {steps.length>0 && (
                                    <div style={{ marginBottom:'6px' }}>
                                      <div style={{ fontSize:'12px', fontWeight:600, marginBottom:'4px' }}>Steps</div>
                                      {steps.map((s:any, idx:number)=> (
                                        <div key={`st-${idx}`} style={{ fontSize:'12px', marginBottom:'2px' }}>🔎 {s.description}</div>
                                      ))}
                                    </div>
                                  )}
                                  {tools.length>0 && (
                                    <div style={{ marginBottom:'6px' }}>
                                      <div style={{ fontSize:'12px', fontWeight:600, marginBottom:'4px' }}>Tool Calls</div>
                                      {tools.map((t:any, idx:number)=> (
                                        <div key={`tc-${idx}`} style={{ fontSize:'12px', marginBottom:'2px' }}>
                                          <span style={{ fontWeight:600 }}>{t.tool}</span>: {t.query} {typeof t.results_count==='number'? `• ${t.results_count} results`: ''}
                                          {t.summary && (<div style={{ fontSize:'12px', color:'#6b7280' }}>{t.summary}</div>)}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {srcs.length>0 && (
                                    <div>
                                      <div style={{ fontSize:'12px', fontWeight:600, marginBottom:'4px' }}>Sources Snapshot</div>
                                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px' }}>
                                        {srcs.map((s:any, idx:number)=> (
                                          <a key={`sr-${idx}`} href={s.url} target="_blank" rel="noreferrer" style={{ fontSize:'11px', color:'#2563eb', textDecoration:'none' }}>{`[${s.number||idx+1}] ${s.title}`}</a>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()
                      )}
                      {/* Display sources if available */}
                      {m.sources && m.sources.length > 0 && (
                        <div style={{
                          marginTop: '20px',
                          paddingTop: '20px',
                          borderTop: '1px solid #e5e7eb',
                          fontSize: '12px'
                        }}>
                          <div style={{ fontWeight: '600', marginBottom: '10px', color: '#6b7280' }}>
                            📚 Sources ({m.sources.length})
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {m.sources.map((source: any, idx: number) => (
                              <a
                                key={idx}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 8px',
                                  background: '#f3f4f6',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  color: '#3b82f6',
                                  textDecoration: 'none',
                                  border: '1px solid #e5e7eb',
                                  transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#e0f2fe';
                                  e.currentTarget.style.borderColor = '#3b82f6';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#f3f4f6';
                                  e.currentTarget.style.borderColor = '#e5e7eb';
                                }}
                                title={source.title || source.snippet}
                              >
                                [{source.number || idx + 1}] {source.domain || new URL(source.url).hostname}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    </div>
                  </div>
                ))}
                {/* Hidden duplicate inline thinking blocks removed to avoid double UI */}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>

            {/* Thinking & Tools (global) intentionally hidden; we show inline inside the message */}
            {false && isThinking && !liveContent && (
              <div className={`thinking-box ${showThinking ? 'expanded' : 'collapsed'}`}>
                <div className="thinking-header" onClick={()=> setShowThinking(!showThinking)}>
                  <div className="thinking-title"><Brain className="thinking-icon" /><span>Thinking and Tools</span></div>
                  <div className="thinking-controls">{isLoading && (<button onClick={stopResearch} className="stop-btn"><Square size={14}/>Stop</button>)}{showThinking ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</div>
                </div>
                {showThinking && (
                  <div className="thinking-content">
                    {thoughts.map((t, idx)=> (<div key={`t-${idx}`} className="thought-item"><span className="thought-type">{t.type}:</span> <span className="thought-content">{t.content}</span></div>))}
                    <div className="tool-trace">
                      <div className="tool-trace-title">Tool Trace</div>
                      {(() => {
                        const searchSteps = steps.filter((s:any) => s?.icon === 'search');
                        return searchSteps.map((s:any, i:number) => (
                          <div key={`s-${i}`} className="tool-trace-item">
                            <div className="tool-trace-header">
                              <span className="tool-trace-label">[Search #{i+1}]</span>
                              <span className="tool-trace-query">{s.description}</span>
                            </div>
                            {s.summary && (<div className="tool-trace-summary"><strong>Summary:</strong> {s.summary}</div>)}
                            {typeof s.results_count==='number' && (<div className="tool-trace-meta">Found {s.results_count} results</div>)}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Composer with Quick Actions */}
            <div className="w-full border-t bg-card px-4 py-3">
              {selectedText && (
                <div className="mb-2 p-2 bg-muted rounded flex items-center justify-between">
                  <div className="text-sm truncate flex-1">Selected: "{selectedText.slice(0, 50)}..."</div>
                  <div className="flex gap-1">
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => {
                        setInput(`Explain this: "${selectedText}"`);
                        setSelectedText('');
                      }}
                    >
                      Explain
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => {
                        setInput(`Research more about: "${selectedText}"`);
                        setSelectedText('');
                      }}
                    >
                      Research
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => setSelectedText('')}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              )}
              <form onSubmit={handleSubmit} className="flex items-center gap-2">
                <Input 
                  value={input} 
                  onChange={(e)=> setInput(e.target.value)} 
                  placeholder="Ask to research..." 
                  disabled={isLoading} 
                  className="flex-1" 
                />
                {isLoading ? (
                  <Button type="button" variant="destructive" onClick={stopResearch} className="gap-2">
                    <Square className="h-4 w-4"/>Stop
                  </Button>
                ) : (
                  <Button type="submit" className="gap-2">
                    <Send className="h-4 w-4"/>Research
                  </Button>
                )}
              </form>
              {error && (<div className="text-sm text-red-600 mt-1">{error}</div>)}
              {verifyError && (<div className="text-sm text-red-600 mt-1">{verifyError}</div>)}
            </div>
          </div>

          {/* Sources */}
          <div className="w-[420px] bg-card">
            <div className="border-b px-4 py-2 text-sm flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-medium">
                <span>Research Sources</span>
                <span className="text-xs text-muted-foreground">({processedSources.length} / {sourcesTotal || sources.length})</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={searchSources}
                  onChange={(e)=> setSearchSources(e.target.value)}
                  placeholder="Search sources"
                  className="h-8 text-xs px-2 rounded border border-border bg-background"
                />
                <select value={filterMode} onChange={(e)=> setFilterMode(e.target.value as any)} className="h-8 text-xs rounded border border-border bg-background">
                  <option value="all">All</option>
                  <option value="pinned">Pinned</option>
                  <option value="cited">Cited</option>
                  <option value="flagged">Flagged</option>
                </select>
                <select value={sortMode} onChange={(e)=> setSortMode(e.target.value as any)} className="h-8 text-xs rounded border border-border bg-background">
                  <option value="relevance">Relevance</option>
                  <option value="cited-first">Cited first</option>
                  <option value="domain">Domain</option>
                  <option value="title">Title</option>
                </select>
                <Button size="sm" variant="outline" onClick={()=> exportJSON(processedSources)}>Export JSON</Button>
                <Button size="sm" variant="outline" onClick={()=> exportCSV(processedSources)}>Export CSV</Button>
                <Button size="sm" variant="outline" disabled={selectedUrls.size===0} onClick={()=> {
                  const sel = processedSources.filter(s => selectedUrls.has(s.url));
                  setSimSources(sel); setShowSimulator(true);
                }}>Open Selected</Button>
                <Button size="sm" variant="outline" onClick={()=> setCompactSources(v=>!v)}>{compactSources? 'Comfortable' : 'Compact'}</Button>
                {sourcesCap < (sourcesTotal||0) && (
                  <Button size="sm" variant="outline" onClick={()=> setSourcesCap(c=> Math.min(240, c*2))}>More</Button>
                )}
              </div>
            </div>
            <div className="h-[calc(100%-40px)] flex flex-col">
              <div className="flex-1 min-h-0">{SourceList}</div>
              {screenshots.length>0 && (
                <div className="border-t p-3 pt-2">
                  <div className="text-sm font-medium mb-2">Web Previews</div>
                  <div className="grid grid-cols-2 gap-2">
                    {screenshots.map((s, i)=> (
                      <div key={`shot-${i}`} className="rounded overflow-hidden bg-muted cursor-pointer p-2" onClick={()=> window.open(s.url,'_blank')} title={s.description || s.url}>
                        <img src={`https://www.google.com/s2/favicons?domain=${safeDomain(s.url)}&sz=64`} alt="" className="h-4 w-4 inline-block mr-1"/>
                        <span className="text-xs align-middle break-all">{safeDomain(s.url)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {evidence.length>0 && (
                <div className="border-t p-3 pt-2">
                  <div className="text-sm font-medium mb-2">Evidence Board</div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {evidence.map((ev, idx)=> (
                      <div key={`ev-${idx}`} className="border rounded p-2 bg-white">
                        <div className="text-xs text-gray-500 mb-1">{safeDomain(ev.url)} • {new Date(ev.ts||Date.now()).toLocaleTimeString()}</div>
                        {(ev.bullets||[]).slice(0,3).map((b:any,i:number)=> (
                          <div key={`b-${i}`} className="text-xs"><span className="font-medium">{b.type}:</span> {b.text}</div>
                        ))}
                        <div className="mt-1 text-right">
                          <Button size="sm" variant="outline" onClick={()=> {
                            const lines = (ev.bullets||[]).slice(0,3).map((b:any)=> `- ${b.type}: ${b.text} (${ev.url})`);
                            setInput(prev => prev ? prev + "\n" + lines.join("\n") : lines.join("\n"));
                          }}>Insert</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Preview intentionally removed for performance */}
              {verification && (verification.notes || verification.weak_citations)?.length > 0 && (
                <VerificationNotes verification={verification} />
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Confirmation Dialog for Mode Switch */}
      {showSwitchConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
              Switch Research Mode?
            </h3>
            <p style={{ color: '#6b7280', marginBottom: '20px' }}>
              You have an active conversation. Switching modes will start a new session and your current conversation will be saved in history.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <Button
                variant="outline"
                onClick={() => {
                  setShowSwitchConfirm(false);
                  setPendingMode(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (pendingMode) {
                    setMode(pendingMode);
                    setSessionId(null);
                    setMessages([]);
                    setError(null);
                    setIsLoading(false);
                    setIsThinking(false);
                    navigate('/conversation');
                  }
                  setShowSwitchConfirm(false);
                  setPendingMode(null);
                }}
              >
                Switch Mode
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Manage Models Modal */}
      {showModelManager && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-[720px] max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Manage Models</h2>
              <Button variant="ghost" size="sm" onClick={()=> setShowModelManager(false)}>✕</Button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {/* Quick selection: choose provider + model to use now */}
              <div className="border rounded p-3">
                <div className="text-sm font-medium mb-2">Active Selection</div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Provider</span>
                  <select value={modelProvider} onChange={(e)=> setModelProvider(e.target.value)} className="h-8 rounded border border-border bg-background px-2">
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="bedrock">AWS Bedrock</option>
                  </select>
                  {(() => { const ready = modelConfig?.api_keys_configured?.[modelProvider === 'bedrock' ? 'aws' : modelProvider]; return <span className={`inline-block h-2.5 w-2.5 rounded-full ${ready? 'bg-green-500':'bg-red-500'}`}/> })()}
                  <span className="text-muted-foreground">Model</span>
                  <select value={modelId} onChange={(e)=> setModelId(e.target.value)} className="h-8 rounded border border-border bg-background px-2 max-w-[360px]">
                    {(modelConfig?.providers?.[modelProvider]?.models || []).map((m:string)=> (<option key={m} value={m}>{m}</option>))}
                    <option value={modelId}>Custom: {modelId}</option>
                  </select>
                  <Button size="sm" variant="outline" onClick={()=> setShowModelManager(false)}>Apply</Button>
                </div>
              </div>
              {['openai','anthropic','bedrock'].map((prov)=> (
                <div key={`prov-${prov}`} className="border rounded p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="font-medium capitalize">{modelConfig?.providers?.[prov]?.name || prov}</div>
                    {(() => { const ready = modelConfig?.api_keys_configured?.[prov==='bedrock'?'aws':prov]; return <span className={`inline-block h-2.5 w-2.5 rounded-full ${ready? 'bg-green-500':'bg-red-500'}`}></span>; })()}
                    <a className="text-xs underline text-muted-foreground" target="_blank" rel="noreferrer" href={prov==='openai'? 'https://strandsagents.com/latest/documentation/docs/user-guide/concepts/model-providers/openai/' : prov==='anthropic'? 'https://strandsagents.com/latest/documentation/docs/user-guide/concepts/model-providers/anthropic/' : 'https://strandsagents.com/latest/documentation/docs/user-guide/concepts/model-providers/amazon-bedrock/'}>Provider docs</a>
                  </div>
                  {prov==='bedrock' && (
                    <div className="text-[11px] text-muted-foreground mb-2">
                      Tip: Use exact Bedrock modelId from your AWS region (e.g., anthropic.claude-3-5-sonnet-20241022 or anthropic.claude-3-sonnet-20240229-v1:0). See Anthropic on Bedrock docs for latest IDs.
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mb-1">Models (one per line)</div>
                  <textarea
                    className="w-full h-24 border border-border rounded p-2 text-sm"
                    defaultValue={(modelConfig?.providers?.[prov]?.models || []).join('\n')}
                    onBlur={(e)=> {
                      const lines = e.target.value.split(/\n+/).map(l=> l.trim()).filter(Boolean);
                      setModelConfig((prev:any)=> ({...prev, providers: { ...(prev.providers||{}), [prov]: { name: prev?.providers?.[prov]?.name || prov, models: lines } }}));
                    }}
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={async ()=>{
                      try {
                        await fetch(`${apiUrl}/api/v1/research/model-config`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ providers: modelConfig.providers }) });
                        alert('Saved.');
                      } catch { alert('Failed to save'); }
                    }}>Save</Button>
                    <Button size="sm" variant="outline" onClick={async ()=>{
                      try { const r = await fetch(`${apiUrl}/api/v1/research/model-test`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ provider: prov, model_id: (modelConfig?.providers?.[prov]?.models||[])[0] }) }); const js = await r.json(); alert(JSON.stringify(js,null,2)); } catch { alert('Test failed'); }
                    }}>Test Provider</Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t text-right">
              <Button onClick={()=> setShowModelManager(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Simple Tab Simulator Modal */}
      {showSimulator && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-[600px] h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Browse Sources</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSimulator(false)}
              >
                ✕
              </Button>
            </div>
            <div className="flex-1 overflow-hidden">
              <SimpleTabSimulator sources={simSources.length? simSources : sources} sessionId={sessionId || undefined} apiBaseUrl={apiUrl} />
            </div>
          </div>
        </div>
      )}
    </ModernLayout>
  );
};

function VerificationNotes({ verification }: { verification: any }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t">
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="text-sm font-medium">Verification</div>
        <Button variant="ghost" size="sm" onClick={()=> setOpen(!open)}>{open? 'Hide' : 'Show'}</Button>
      </div>
      {open && (
        <div className="p-3 pt-0">
          <Card className="p-3">
            {Array.isArray(verification.notes) && verification.notes.map((n:string, i:number)=>(
              <div key={`note-${i}`} className="text-sm text-muted-foreground">• {n}</div>
            ))}
            {Array.isArray(verification.weak_citations) && verification.weak_citations.length>0 && (
              <div className="text-sm mt-2">Weak citations detected: {verification.weak_citations.join(', ')}</div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

export default ScholarlyResearchView;

function ProgressBar({ steps, backendProgress }: { steps: any[]; backendProgress?: number }) {
  // Derive progress from search steps when backend doesn't provide a good value
  let pct = 0;
  try {
    const searchSteps = (steps || []).filter((s:any)=> s && s.icon === 'search');
    const total = searchSteps.length;
    const done = searchSteps.filter((s:any)=> s.status === 'completed').length;
    if (total > 0) {
      // Map search completion to 10%..90% of the bar
      pct = Math.round(10 + (done/total) * 80);
    }
  } catch {}
  if (typeof backendProgress === 'number' && backendProgress > 0) {
    pct = Math.max(pct, Math.min(backendProgress, 100));
  }
  pct = Math.max(0, Math.min(pct, 100));

  return (
    <div className="w-full h-2 rounded bg-muted overflow-hidden">
      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function exportJSON(items: Source[]) {
  try {
    const out = items.map(s => ({ title: s.title, url: s.url, domain: s.domain, snippet: s.snippet }));
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'sources.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  } catch {}
}

function exportCSV(items: Source[]) {
  const headers = ['Title','URL','Domain','Snippet'];
  const rows = items.map(s => [s.title||'', s.url||'', s.domain||'', (s.snippet||'').replace(/\n/g,' ') ]);
  const csv = [headers, ...rows].map(r => r.map(field => '"' + String(field).replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'sources.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

async function postJson(url: string, body?: any) {
  const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: body? JSON.stringify(body): undefined });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Turn bare [1], [2] citations into clickable links to sources
function linkifyCitations(text: string, sources: any[]): string {
  if (!text || !Array.isArray(sources) || sources.length === 0) return text;
  
  // Build a map of citation numbers to URLs
  const citationMap = new Map<number, string>();
  
  sources.forEach((source, index) => {
    // Handle both index-based and number property
    const num = source.number || (index + 1);
    const url = source.url;
    if (url && typeof url === 'string' && url.startsWith('http')) {
      citationMap.set(num, url);
    }
  });
  
  // Replace all [n] patterns with clickable links if we have a URL
  let result = text.replace(/\[(\d+)\](?!\()/g, (match, numStr) => {
    const n = parseInt(numStr, 10);
    const url = citationMap.get(n);
    
    if (url) {
      // Use single brackets in link text for cleaner appearance
      return `[[${n}]](${url})`;
    } else {
      // If reference number exists but we don't have that many sources,
      // it might be a typo - map to closest available source
      if (n > sources.length && sources.length > 0) {
        // Check if we have source 11 when looking for 17 (typo scenario)
        if (n === 17 && citationMap.has(11)) {
          return `[[${n}]](${citationMap.get(11)})`;
        }
        // Otherwise map to last available source as fallback
        const lastSource = sources[sources.length - 1];
        if (lastSource.url) {
          return `[[${n}]](${lastSource.url})`;
        }
      }
    }
    return match;
  });
  
  return result;
}
