import React, { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    mermaid?: any;
  }
}

let mermaidLoader: Promise<any> | null = null;
let mermaidInitialized = false;

function loadMermaid(): Promise<any> {
  if (window.mermaid && mermaidInitialized) return Promise.resolve(window.mermaid);
  if (mermaidLoader) return mermaidLoader;
  
  mermaidLoader = new Promise((resolve, reject) => {
    if (window.mermaid) {
      if (!mermaidInitialized) {
        window.mermaid.initialize({ 
          startOnLoad: false, 
          theme: 'default',
          securityLevel: 'loose',
          flowchart: {
            htmlLabels: true,
            curve: 'linear',
            padding: 15
          },
          themeVariables: {
            primaryColor: '#f0f9ff',
            primaryTextColor: '#1e293b',
            primaryBorderColor: '#0ea5e9',
            lineColor: '#64748b',
            secondaryColor: '#e0f2fe',
            background: '#ffffff',
            mainBkg: '#f0f9ff',
            secondBkg: '#e0f2fe',
            tertiaryColor: '#ffffff'
          }
        });
        mermaidInitialized = true;
      }
      resolve(window.mermaid);
    } else {
      const script = document.createElement('script');
      // Pin to a stable version to reduce syntax/runtime surprises
      script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.4/dist/mermaid.min.js';
      script.async = true;
      script.onload = () => {
        try {
          window.mermaid?.initialize?.({ 
            startOnLoad: false, 
            theme: 'default',
            securityLevel: 'loose',
            flowchart: {
              htmlLabels: true,
              curve: 'linear',
              padding: 15
            },
            themeVariables: {
              primaryColor: '#f0f9ff',
              primaryTextColor: '#1e293b',
              primaryBorderColor: '#0ea5e9',
              lineColor: '#64748b',
              secondaryColor: '#e0f2fe',
              background: '#ffffff',
              mainBkg: '#f0f9ff',
              secondBkg: '#e0f2fe',
              tertiaryColor: '#ffffff'
            }
          });
          mermaidInitialized = true;
          resolve(window.mermaid);
        } catch (e) {
          reject(e);
        }
      };
      script.onerror = () => reject(new Error('Failed to load mermaid'));
      document.head.appendChild(script);
    }
  });
  return mermaidLoader;
}

export default function MermaidBlock({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [zoom, setZoom] = useState<number>(1);
  const [expanded, setExpanded] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    
    const renderDiagram = async () => {
      try {
        const mermaid = await loadMermaid();
        if (cancelled) return;
        
        // Render diagram
        if (ref.current) {
          const mainId = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
          
          try {
            // Use mermaid.render for better quality
            const { svg } = await mermaid.render(mainId, chart);
            if (ref.current) {
              ref.current.innerHTML = svg;
              setSvgContent(svg);
              // Make SVG responsive
              const svgElement = ref.current.querySelector('svg');
              if (svgElement) {
                svgElement.style.maxWidth = '100%';
                svgElement.style.height = 'auto';
              }
            }
          } catch (e) {
            console.error('Mermaid render error:', e);
            // Try fallback with init
            if (ref.current) {
              ref.current.innerHTML = '';
              const div = document.createElement('div');
              div.id = mainId;
              div.textContent = chart;
              ref.current.appendChild(div);
              try {
                await mermaid.init(undefined, div);
                setSvgContent(div.innerHTML);
              } catch (e2) {
                // Final fallback
                ref.current.innerHTML = `<pre style="padding: 10px; background: #f5f5f5; border-radius: 4px; overflow: auto;">${chart}</pre>`;
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to load mermaid:', error);
      }
    };
    
    renderDiagram();
    
    return () => { cancelled = true; };
  }, [chart]);

  const handleOpenNewTab = () => {
    // Create a full HTML page with the diagram
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Mermaid Diagram</title>
        <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
        <style>
          body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f9fafb;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
          }
          .diagram-container {
            background: white;
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
            max-width: 95vw;
            overflow: auto;
          }
          .diagram-container svg {
            max-width: 100%;
            height: auto;
          }
          .controls {
            position: fixed;
            top: 20px;
            right: 20px;
            display: flex;
            gap: 10px;
          }
          .btn {
            padding: 8px 16px;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
          }
          .btn:hover {
            background: #2563eb;
          }
        </style>
      </head>
      <body>
        <div class="controls">
          <button class="btn" onclick="window.print()">Print</button>
          <button class="btn" onclick="downloadSVG()">Download SVG</button>
        </div>
        <div class="diagram-container">
          ${svgContent || `<div class="mermaid">${chart}</div>`}
        </div>
        <script>
          if (!${!!svgContent}) {
            mermaid.initialize({ startOnLoad: true, theme: 'default' });
          }
          
          function downloadSVG() {
            const svg = document.querySelector('svg');
            if (svg) {
              const svgData = new XMLSerializer().serializeToString(svg);
              const blob = new Blob([svgData], { type: 'image/svg+xml' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'diagram.svg';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }
          }
        </script>
      </body>
      </html>
    `;
    
    // Open in new tab
    const newWindow = window.open('', '_blank');
    if (newWindow) {
      newWindow.document.write(htmlContent);
      newWindow.document.close();
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(chart).then(() => {
      const btn = document.querySelector('.copy-btn');
      if (btn) {
        btn.textContent = '✓ Copied!';
        setTimeout(() => {
          btn.textContent = '📋 Copy Code';
        }, 2000);
      }
    });
  };

  return (
    <div 
      className="mermaid-container" 
      style={{ 
        position: 'relative',
        border: '2px solid #e0f2fe',
        borderRadius: '12px',
        padding: '1.5rem',
        background: 'linear-gradient(to bottom, #f0f9ff, #ffffff)',
        marginBottom: '1rem',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden'
      }}
    >
      {/* Diagram viewport with zoom */}
      <div 
        style={{ display:'flex', justifyContent:'center', alignItems:'center', overflow:'auto', maxHeight: expanded ? '720px' : '460px', padding:'8px' }}
      >
        <div ref={ref} style={{ transform: `scale(${zoom})`, transformOrigin:'top left', width:'100%' }} />
      </div>
      
      {/* Action row */}
      <div style={{ 
        display: 'flex',
        gap: '10px',
        marginTop: '8px',
        padding: '8px 10px',
        borderTop: '1px solid #e0f2fe',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
          <span style={{fontSize:'12px', color:'#6b7280'}}>Diagram</span>
          {errorMsg && <span style={{fontSize:'11px', color:'#b91c1c'}}>Syntax error detected</span>}
        </div>
        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
          <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
            <span style={{fontSize:'11px', color:'#6b7280'}}>Zoom</span>
            <input type="range" min={0.6} max={1.6} step={0.1} value={zoom} onChange={e=> setZoom(Number((e.target as any).value))} />
            <button onClick={()=> setZoom(1)} style={{fontSize:'11px', border:'1px solid #d1d5db', padding:'2px 6px', borderRadius:4, background:'#fff'}}>Reset</button>
          </div>
        <button
          onClick={handleOpenNewTab}
          style={{
            background: '#f3f4f6',
            color: '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            padding: '4px 10px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.background = '#e5e7eb';
            e.currentTarget.style.borderColor = '#9ca3af';
          }}
          onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.background = '#f3f4f6';
            e.currentTarget.style.borderColor = '#d1d5db';
          }}
        >
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M11 3C10.4477 3 10 3.44772 10 4C10 4.55228 10.4477 5 11 5H13.5858L7.29289 11.2929C6.90237 11.6834 6.90237 12.3166 7.29289 12.7071C7.68342 13.0976 8.31658 13.0976 8.70711 12.7071L15 6.41421V9C15 9.55228 15.4477 10 16 10C16.5523 10 17 9.55228 17 9V4C17 3.44772 16.5523 3 16 3H11Z" fill="currentColor"/>
            <path d="M5 5C3.89543 5 3 5.89543 3 7V15C3 16.1046 3.89543 17 5 17H13C14.1046 17 15 16.1046 15 15V12C15 11.4477 14.5523 11 14 11C13.4477 11 13 11.4477 13 12V15H5V7H8C8.55228 7 9 6.55228 9 6C9 5.44772 8.55228 5 8 5H5Z" fill="currentColor"/>
          </svg>
          Open in New Tab
        </button>
        <button
          className="copy-btn"
          onClick={handleCopyCode}
          style={{
            background: '#f3f4f6',
            color: '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            padding: '4px 10px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.background = '#e5e7eb';
            e.currentTarget.style.borderColor = '#9ca3af';
          }}
          onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.background = '#f3f4f6';
            e.currentTarget.style.borderColor = '#d1d5db';
          }}
        >
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 3C8 2.44772 8.44772 2 9 2H11C11.5523 2 12 2.44772 12 3V4H14C14.5523 4 15 4.44772 15 5V7C15 7.55228 14.5523 8 14 8H13V16C13 17.1046 12.1046 18 11 18H5C3.89543 18 3 17.1046 3 16V8H2C1.44772 8 1 7.55228 1 7V5C1 4.44772 1.44772 4 2 4H4V3C4 2.44772 4.44772 2 5 2H7C7.55228 2 8 2.44772 8 3ZM6 4H10V3H6V4ZM3 6V7H13V6H3ZM5 8V16H11V8H5Z" fill="currentColor"/>
            <rect x="7" y="3" width="8" height="10" rx="1" fill="currentColor" opacity="0.3"/>
            <rect x="9" y="5" width="8" height="10" rx="1" stroke="currentColor" strokeWidth="2" fill="white"/>
          </svg>
          Copy Code
        </button>
        <button
          onClick={()=> setExpanded(v=>!v)}
          style={{
            background: '#eef2ff', color:'#3730a3', border:'1px solid #c7d2fe', borderRadius:4,
            padding:'4px 10px', cursor:'pointer', fontSize:'12px', fontWeight:500
          }}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
        </div>
      </div>
    </div>
  );
}
