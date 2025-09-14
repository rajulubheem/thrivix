import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { 
  Play, 
  Pause, 
  SkipForward, 
  RotateCcw,
  ExternalLink,
  Clock,
  CheckCircle,
  Circle
} from 'lucide-react';

type Source = {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  favicon?: string;
  thumbnail?: string;
  number?: number;
};

interface SimpleTabSimulatorProps {
  sources: Source[];
  sessionId?: string;
  apiBaseUrl?: string;
}

export const SimpleTabSimulator: React.FC<SimpleTabSimulatorProps> = ({ sources, sessionId, apiBaseUrl = (process.env.REACT_APP_API_URL || '') }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(10);
  const [viewedSources, setViewedSources] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'embedded' | 'popout'>(() => {
    // Default to embedded (most reliable). Users can switch to popout.
    return 'embedded';
  });
  const [needsUserAction, setNeedsUserAction] = useState<boolean>(false);
  const [dwell, setDwell] = useState<number>(8);
  const [topN, setTopN] = useState<number>(10);

  const windowRef = useRef<Window | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const windowNameRef = useRef<string>('simple_tab_sim');

  const currentSource = sources[currentIndex];
  const progress = (currentIndex / Math.max(1, sources.length)) * 100;

  const clearTimers = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  };

  const navigateWindow = (url: string): boolean => {
    // Reuse a named window to avoid popup blockers; open from user gesture when starting
    try {
      if (!windowRef.current || windowRef.current.closed) {
        // If this call is not within a user gesture, many browsers will block it.
        // We detect failure and ask for user action to resume.
        const w = window.open(url, windowNameRef.current, 'noopener');
        if (!w) {
          setNeedsUserAction(true);
          return false;
        }
        windowRef.current = w;
      } else {
        // Navigate the same window
        windowRef.current.location.href = url;
        try { windowRef.current.focus(); } catch {}
      }
    } catch (e) {
      // As a fallback, at least open a tab
      const w = window.open(url, '_blank', 'noopener');
      if (!w) {
        setNeedsUserAction(true);
        return false;
      }
      windowRef.current = w;
    }
    setNeedsUserAction(false);
    return true;
  };

  const openAt = (index: number) => {
    if (index < 0 || index >= sources.length) {
      stopSimulation();
      return;
    }
    const source = sources[index];
    clearTimers();
    if (mode === 'popout') {
      // Navigate (or open) window to this URL; if blocked, pause and await user
      const ok = navigateWindow(source.url);
      if (!ok) {
        setIsRunning(false);
        return;
      }
    }
    // Mark as viewed
    setViewedSources(prev => { const ns = new Set(prev); ns.add(source.id); return ns; });
    // Reset countdown
    setTimeRemaining(10);
    let countdown = dwell;
    countdownRef.current = setInterval(() => {
      countdown = Math.max(0, countdown - 0.1);
      setTimeRemaining(countdown);
    }, 100);
    // Schedule next
    timerRef.current = setTimeout(() => {
      clearTimers();
      const next = index + 1;
      if (next >= sources.length) {
        stopSimulation();
      } else {
        setCurrentIndex(next);
        // Immediately open next without waiting for effect
        openAt(next);
      }
    }, dwell * 1000);
  };

  const startSimulation = () => {
    // Open/reuse the named window in direct user gesture to avoid popup blockers (popout mode only)
    if (mode === 'popout' && sources.length > 0) {
      const firstUrl = sources[0]?.url || 'about:blank';
      const w = window.open(firstUrl, windowNameRef.current, 'noopener') || null;
      if (!w) {
        setNeedsUserAction(true);
        return;
      }
      windowRef.current = w;
      setNeedsUserAction(false);
    }
    setIsRunning(true);
    setCurrentIndex(0);
    setTimeRemaining(dwell);
    setViewedSources(new Set());
    // Kick off first open immediately
    const list = sources.slice(0, Math.max(1, topN));
    if (list.length > 0) {
      if (mode === 'embedded') {
        // Ask backend to run the browsing playlist using Playwright
        try {
          if (sessionId) {
            const urls = list.map(s => s.url);
            fetch(`${apiBaseUrl}/api/v1/research/browse-playlist-strands-real/${sessionId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ urls, dwell_seconds: dwell, top_n: topN })
            }).catch(()=>{});
          }
        } catch {}
      } else {
        // Already opened and navigated to firstUrl by user gesture; start timers and schedule next
        openAt(0);
      }
    }
  };

  const stopSimulation = () => {
    setIsRunning(false);
    clearTimers();
    // Try to close the named window (will only work if it was opened by script and allowed)
    try {
      // Do not force-close; keeping it open improves reliability for next resume
    } catch {}
  };

  const skipCurrent = () => {
    if (!isRunning) return;
    clearTimers();
    const nextIndex = currentIndex + 1;
    if (nextIndex >= sources.length) {
      stopSimulation();
    } else {
      setCurrentIndex(nextIndex);
      openAt(nextIndex);
    }
  };

  const reset = () => {
    stopSimulation();
    setCurrentIndex(0);
    setTimeRemaining(10);
    setViewedSources(new Set());
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
      try {
        if (windowRef.current && !windowRef.current.closed) {
          windowRef.current.close();
        }
      } catch {}
    };
  }, []);

  function isYouTube(url: string) {
    try { const u = new URL(url); return /(^|\.)youtube\.com$/.test(u.hostname) || u.hostname === 'youtu.be'; } catch { return false; }
  }
  function toYouTubeEmbed(url: string) {
    try {
      const u = new URL(url);
      if (u.hostname === 'youtu.be') {
        const id = u.pathname.replace('/', '');
        return `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
      }
      if ((/(^|\.)youtube\.com$/).test(u.hostname)) {
        const id = u.searchParams.get('v');
        if (id) return `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
        // Fallback for shorts or embed paths
        const parts = u.pathname.split('/').filter(Boolean);
        const idx = parts.indexOf('shorts');
        if (idx >= 0 && parts[idx+1]) return `https://www.youtube-nocookie.com/embed/${parts[idx+1]}?rel=0`;
      }
    } catch {}
    return 'about:blank';
  }

  return (
    <div className="flex flex-col h-full">
      {/* Control Bar */}
      <div className="bg-gray-900 text-white p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold">Tab Simulator</h3>
            <div className="text-sm text-gray-300">
              {viewedSources.size} / {sources.length} viewed
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="mr-2 text-xs">
              Mode:
              <select
                value={mode}
                onChange={(e)=> setMode(e.target.value as any)}
                className="ml-1 bg-gray-800 border border-gray-700 rounded px-2 py-1"
              >
                <option value="embedded">Embedded (reliable)</option>
                <option value="popout">Pop-out tabs</option>
              </select>
            </div>
            <div className="mr-2 text-xs">
              Dwell:
              <select
                value={dwell}
                onChange={(e)=> setDwell(parseInt(e.target.value,10) || 8)}
                className="ml-1 bg-gray-800 border border-gray-700 rounded px-2 py-1"
              >
                <option value={5}>5s</option>
                <option value={8}>8s</option>
                <option value={10}>10s</option>
                <option value={15}>15s</option>
              </select>
            </div>
            <div className="mr-2 text-xs">
              Top N:
              <input
                type="number"
                min={1}
                max={sources.length || 1}
                value={topN}
                onChange={(e)=> setTopN(Math.max(1, Math.min(sources.length || 1, parseInt(e.target.value,10) || 1)))}
                className="w-16 ml-1 bg-gray-800 border border-gray-700 rounded px-2 py-1"
              />
            </div>
            {mode === 'popout' && (
              <Button
                onClick={() => {
                  // Give user an explicit way to (re)open the named window
                  const url = sources[currentIndex]?.url || 'about:blank';
                  const w = window.open(url, windowNameRef.current) || null;
                  if (w) {
                    windowRef.current = w;
                    setNeedsUserAction(false);
                    // If we were paused due to blocker, resume
                    if (!isRunning && sources.length > 0) {
                      setIsRunning(true);
                      openAt(currentIndex);
                    }
                  }
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Open Popout
              </Button>
            )}
            {!isRunning ? (
              <Button 
                onClick={startSimulation} 
                className="bg-green-600 hover:bg-green-700"
                disabled={sources.length === 0}
              >
                <Play className="h-4 w-4 mr-1" />
                Start
              </Button>
            ) : (
              <Button 
                onClick={stopSimulation}
                className="bg-red-600 hover:bg-red-700"
              >
                <Pause className="h-4 w-4 mr-1" />
                Stop
              </Button>
            )}
            
            <Button 
              onClick={skipCurrent}
              variant="outline"
              className="text-white border-white hover:bg-gray-800"
              disabled={!isRunning}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
            
            <Button 
              onClick={reset}
              variant="outline"
              className="text-white border-white hover:bg-gray-800"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <Progress value={progress} className="h-2 bg-gray-700" />
          <div className="flex justify-between text-xs text-gray-400">
            <span>Progress: {Math.round(progress)}%</span>
            {isRunning && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {timeRemaining.toFixed(1)}s
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Source List */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
        {/* Embedded preview area */}
        <div className="mb-3">
          {currentSource ? (
            <div className="rounded border bg-white p-3">
              <div className="flex items-center gap-2 mb-2">
                {currentSource.favicon && <img src={currentSource.favicon} alt="" className="h-4 w-4" />}
                <span className="text-xs text-gray-600">{currentSource.domain}</span>
                <span className="text-xs text-gray-400">#{currentIndex + 1}</span>
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => window.open(currentSource.url, '_blank')}>
                  Open
                </Button>
              </div>
              {mode === 'embedded' && (
                <div>
                  {isYouTube(currentSource.url) ? (
                    <div className="w-full aspect-video bg-black rounded overflow-hidden">
                      <iframe
                        title="YouTube preview"
                        src={toYouTubeEmbed(currentSource.url)}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      {currentSource.thumbnail && (
                        <img src={currentSource.thumbnail} alt="" className="w-40 h-24 object-cover rounded" />
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-sm mb-1 truncate">{currentSource.title}</div>
                        {currentSource.snippet && (
                          <div className="text-xs text-gray-600 line-clamp-3">{currentSource.snippet}</div>
                        )}
                        <div className="text-[10px] text-gray-400 mt-1">Auto-advancing {timeRemaining.toFixed(1)}s</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {mode === 'popout' && (
                <div className="text-xs text-gray-600">Navigating external tab... {timeRemaining.toFixed(1)}s</div>
              )}
            </div>
          ) : (
            <div className="rounded border bg-white p-3 text-xs text-gray-500">No source selected</div>
          )}
        </div>
        {needsUserAction && mode === 'popout' && (
          <div className="mb-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
            Pop-out was blocked by the browser. Click "Open Popout" to continue and allow pop-ups for this site.
          </div>
        )}
        <div className="space-y-2">
          {sources.map((source, index) => {
            const isViewed = viewedSources.has(source.id);
            const isCurrent = index === currentIndex && isRunning;
            
            return (
              <Card
                key={source.id}
                className={`p-3 transition-all ${
                  isCurrent ? 'border-blue-500 bg-blue-50' : ''
                } ${isViewed ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div>
                    {isViewed ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : isCurrent ? (
                      <div className="relative">
                        <Circle className="h-5 w-5 text-blue-500 animate-pulse" />
                        <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping" />
                      </div>
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {source.favicon && (
                        <img src={source.favicon} alt="" className="h-4 w-4" />
                      )}
                      <span className="text-xs text-gray-500">{source.domain}</span>
                      <span className="text-xs text-gray-400">#{index + 1}</span>
                    </div>
                    <p className="font-medium text-sm truncate">{source.title}</p>
                    {isCurrent && (
                      <div className="text-xs text-blue-600 mt-1">
                        Opening in browser tab... {timeRemaining.toFixed(1)}s remaining
                      </div>
                    )}
                  </div>
                  
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => window.open(source.url, '_blank')}
                    className="text-gray-500"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Instructions */}
      {!isRunning && sources.length > 0 && (
        <div className="bg-blue-50 border-t border-blue-200 p-3">
          <p className="text-sm text-blue-800">
            <strong>How it works:</strong> Click Start to open each website in a new tab. 
            Each tab stays open for 10 seconds, then closes and moves to the next. 
            Make sure to allow pop-ups for this site.
          </p>
        </div>
      )}
    </div>
  );
};

export default SimpleTabSimulator;
