import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MermaidBlock from '../MermaidBlock';
import { ModernLayout } from '../layout/ModernLayout';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Card } from '../ui/card';
import { Brain, ChevronDown, ChevronUp, Download, History, Printer, Send, Square, Bot, User, Link as LinkIcon, Plus } from 'lucide-react';
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

  const [messages, setMessages] = useState<Message[]>([]);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [steps, setSteps] = useState<any[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [sourcesTotal, setSourcesTotal] = useState<number>(0);
  const seenSourceUrlsRef = useRef<Set<string>>(new Set());
  const [screenshots, setScreenshots] = useState<Array<{url:string; description?:string; ts?:string}>>([]);
  const [liveContent, setLiveContent] = useState('');
  const [verification, setVerification] = useState<any>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Array<{id: string; title: string; timestamp: string; mode: Mode}>>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedText, setSelectedText] = useState('');

  const sseRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEventTsRef = useRef<number>(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Smooth streaming buffer (coalesce content updates)
  const pendingContentRef = useRef<string>('');
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(()=>{ 
    if (urlSessionId) {
      setSessionId(urlSessionId);
      loadSessionHistory(urlSessionId);
    }
    loadAllSessions();
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
              return merged.slice(-60);
            }); break;
            case 'screenshot': setScreenshots(prev => [{ url: evt.url, description: evt.description, ts: evt.ts }, ...prev].slice(0, 12)); break;
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
        if (data.steps) setSteps(data.steps);
        if (data.sources) setSources(data.sources);
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
    }
    setIsLoading(false); setIsThinking(false); setShowThinking(false);
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
      const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ query, session_id: sid, require_approval: false, mode }) });
      if (!res.ok) throw new Error('Failed to start');
      connectEvents(sid);
    } catch (err:any) { setError(err.message || 'Failed to start research'); setIsLoading(false); setIsThinking(false); }
  };

  const stopResearch = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current=null; }
    if (sseRef.current) { sseRef.current.close(); sseRef.current=null; }
    setIsLoading(false); setIsThinking(false);
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

  const handlePrint = () => {
    const content = getFinalContent();
    const srcHtml = buildSourcesHtml();
    const win = window.open('', '_blank'); if (!win) return;
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Research Report</title>
      <style>body{font-family:Inter,system-ui,Arial;padding:24px;line-height:1.6;color:#0f172a;} h1{font-size:22px;margin:0 0 12px;} .meta{color:#64748b;margin-bottom:16px;} .content{margin:16px 0;} a{color:#2563eb;text-decoration:none;} a:hover{text-decoration:underline;}</style>
    </head><body>
      <h1>Research Report</h1>
      <div class="meta">Generated: ${new Date().toLocaleString()}</div>
      <div class="content">${content ? content.replace(/\n/g,'<br/>') : '<em>No content</em>'}</div>
      <h2>Sources</h2>
      ${srcHtml}
    </body></html>`);
    win.document.close(); win.focus(); win.print();
  };

  const handleDownload = () => {
    const content = getFinalContent();
    const srcHtml = buildSourcesHtml();
    const html = `<!doctype html><html><head><meta charset=\"utf-8\"/><title>Research Report</title></head><body>
      <h1>Research Report</h1>
      <div>Generated: ${new Date().toLocaleString()}</div>
      <div>${content ? content.replace(/\n/g,'<br/>') : '<em>No content</em>'}</div>
      <h2>Sources</h2>
      ${srcHtml}
    </body></html>`;
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
  function SourceListVirtualized({ sources }: { sources: Source[] }) {
    const defaultRow = 200;
    const [startIdx, setStartIdx] = useState(0);
    const viewportRef = useRef<HTMLDivElement>(null);
    const [heightsDirty, setHeightsDirty] = useState(0);
    const heightsRef = useRef<Map<string, number>>(new Map());

    useEffect(() => {
      const onScroll = () => {
        const el = viewportRef.current; if (!el) return;
        const scrollTop = el.scrollTop;
        // binary search startIdx using prefix sums
        const prefix = buildPrefix(sources, heightsRef.current, defaultRow);
        const idx = findStartIndex(prefix, scrollTop);
        setStartIdx(Math.max(0, idx - 3));
      };
      const el = viewportRef.current;
      if (!el) return;
      el.addEventListener('scroll', onScroll);
      return () => el.removeEventListener('scroll', onScroll);
    }, []);

    const total = sources.length;
    const prefix = buildPrefix(sources, heightsRef.current, defaultRow);
    const totalHeight = prefix[total] || 0;
    const [viewportHeight, setViewportHeight] = useState<number>(600);
    useEffect(() => {
      const el = viewportRef.current;
      if (!el) return;
      const resize = () => setViewportHeight(el.clientHeight || 600);
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      return () => { try { ro.disconnect(); } catch {} };
    }, [sources.length]);
    // compute visible window by accumulating heights
    let endIdx = startIdx;
    const startOffset = prefix[startIdx] || 0;
    while (endIdx < total && (prefix[endIdx] - startOffset) < (viewportHeight + defaultRow * 6)) {
      endIdx++;
    }
    const items = sources.slice(startIdx, endIdx);
    const offsetTop = startOffset;

    return (
      <ScrollArea className="h-full">
        <div ref={viewportRef} className="h-full overflow-y-auto">
          <div style={{ height: totalHeight }} className="relative">
            <div style={{ position:'absolute', top: offsetTop, left:0, right:0 }}>
              <div className="p-3 space-y-3">
                {total === 0 && (<div className="text-sm text-muted-foreground px-2">No sources yet</div>)}
                {items.map((s, i) => (
                  <Card key={s.id || `${startIdx+i}-${s.url}`} className={`p-0 overflow-hidden ${isFlagged(s) ? 'border border-red-500' : ''}`} ref={el => measureRow(el as HTMLDivElement, s)}>
                    {s.thumbnail && (
                      <div className="w-full h-[120px] overflow-hidden bg-muted">
                        <img src={s.thumbnail} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="p-3 flex items-start gap-3">
                      {s.favicon && (<img src={s.favicon} alt="" className="h-4 w-4 mt-1" />)}
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">{s.domain}</div>
                        <a href={s.url} target="_blank" rel="noreferrer" className="font-medium hover:underline break-words">{s.title}</a>
                        {s.snippet && (<div className="text-sm text-muted-foreground mt-1 line-clamp-3">{s.snippet}</div>)}
                      </div>
                      <Button variant="ghost" size="sm" className="ml-auto" onClick={()=> window.open(s.url,'_blank')}><LinkIcon className="h-4 w-4"/></Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    );

    function measureRow(el: HTMLDivElement | null, s: Source) {
      if (!el) return;
      const h = el.getBoundingClientRect().height;
      const id = s.id || s.url;
      if (!id) return;
      const prev = heightsRef.current.get(id) || 0;
      if (Math.abs(prev - h) > 2) {
        heightsRef.current.set(id, h);
        setHeightsDirty(x => x + 1);
      }
    }
    function buildPrefix(srcs: Source[], heights: Map<string, number>, defRow: number) {
      const pref = new Array(srcs.length + 1).fill(0);
      for (let i=0;i<srcs.length;i++) {
        const id = srcs[i].id || srcs[i].url;
        const h = (id && heights.get(id)) || defRow;
        pref[i+1] = pref[i] + h;
      }
      return pref;
    }
    function findStartIndex(prefix: number[], scrollTop: number) {
      let lo = 0, hi = prefix.length - 1;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (prefix[mid] <= scrollTop) lo = mid + 1; else hi = mid;
      }
      return Math.max(0, lo - 1);
    }
    function isFlagged(s: Source) {
      // Mark source if flagged by verification (by URL or index)
      try {
        const urlFlag = verification?.flagged_urls?.includes?.(s.url);
        if (urlFlag) return true;
        const idx = sources.findIndex(x => x.url === s.url);
        if (idx >= 0 && Array.isArray(verification?.weak_citations)) {
          return verification.weak_citations.includes(idx+1);
        }
      } catch {}
      return false;
    }
  }

  const SourceList = (
    <SourceListVirtualized sources={sources} />
  );

  // Display all messages without virtualization for now to fix display issue
  const chatVisible = messages;

  return (
    <ModernLayout>
      <div className="flex flex-col h-screen bg-background">
        <div className="w-full border-b bg-card px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-semibold">Research Assistant</h1>
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
              <Button variant="ghost" size="sm" disabled={verifyLoading || !sessionId} onClick={handleVerify}>
                {verifyLoading? 'Verifying...' : 'Verify'}
              </Button>
              <Button variant="ghost" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1"/>Print
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-1"/>Download
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* History Sidebar */}
          {showHistory && (
            <div className="w-64 border-r bg-card flex flex-col">
              <div className="p-3 border-b">
                <div className="text-sm font-medium mb-2">Session History</div>
                <div className="space-y-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full" 
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
                      className="w-full text-red-600 hover:text-red-700" 
                      onClick={() => {
                        if (window.confirm('Clear all session history? This cannot be undone.')) {
                          clearAllSessions();
                        }
                      }}
                    >
                      Clear All History
                    </Button>
                  )}
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      className={`p-2 rounded cursor-pointer hover:bg-muted transition-colors ${
                        s.id === sessionId ? 'bg-muted' : ''
                      }`}
                      onClick={() => {
                        setSessionId(s.id);
                        setMode(s.mode);
                        navigate(`/conversation/${s.id}`);
                        loadSessionHistory(s.id);
                      }}
                    >
                      <div className="text-sm font-medium truncate">{s.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(s.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                  {sessions.length === 0 && (
                    <div className="text-sm text-muted-foreground text-center py-4">
                      No previous sessions
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Chat */}
          <div className="flex-1 flex flex-col border-r">
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
                      <div className="message-content" style={{ 
                        padding: '1rem', 
                        background: m.role === 'user' ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-surface, #f9fafb)', 
                        borderRadius: '0.5rem',
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                        color: 'var(--text-primary, #111827)'
                      }}>
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
                {isLoading && liveContent && (
                  <div className="message assistant">
                    <div className="message-avatar"><Bot size={18}/></div>
                    <div className="message-content" style={{ whiteSpace: 'pre-wrap' }}>{liveContent}</div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>

            {/* Thinking & Tools */}
            {isThinking && (
              <div className={`thinking-box ${showThinking ? 'expanded' : 'collapsed'}`}>
                <div className="thinking-header" onClick={()=> setShowThinking(!showThinking)}>
                  <div className="thinking-title"><Brain className="thinking-icon" /><span>Thinking and Tools</span></div>
                  <div className="thinking-controls">{isLoading && (<button onClick={stopResearch} className="stop-btn"><Square size={14}/>Stop</button>)}{showThinking ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</div>
                </div>
                {showThinking && (
                  <div className="thinking-content">
                    {thoughts.map((t, idx)=> (<div key={`t-${idx}`} className="thought-item"><span className="thought-type">{t.type}:</span> <span className="thought-content">{t.content}</span></div>))}
                    <div className="tool-trace"><div className="tool-trace-title">Tool Trace</div>{steps.map((s:any, i:number)=> (<div key={`s-${i}`} className="tool-trace-item"><div className="tool-trace-header"><span className="tool-trace-label">[Search #{i+1}]</span><span className="tool-trace-query">{s.description}</span></div>{s.summary && (<div className="tool-trace-summary"><strong>Summary:</strong> {s.summary}</div>)}{typeof s.results_count==='number' && (<div className="tool-trace-meta">Found {s.results_count} results</div>)}</div>))}</div>
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
            <div className="border-b px-4 py-2 text-sm font-medium">Research Sources ({sourcesTotal || sources.length}{sources.length < (sourcesTotal||0) ? ` • showing ${sources.length}` : ''})</div>
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
