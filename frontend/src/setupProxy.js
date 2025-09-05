const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  console.log('🔧 Setting up proxy middleware');
  
  // Proxy all API requests with special handling for SSE
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:8000',
      changeOrigin: true,
      ws: true, // Enable websocket proxy
      logLevel: 'info',
      onProxyReq: (proxyReq, req, res) => {
        if (req.url?.includes('/events')) {
          console.log('🌊 SSE Proxy request:', req.method, req.url);
          proxyReq.setHeader('Accept', 'text/event-stream');
          proxyReq.setHeader('Cache-Control', 'no-cache');
          proxyReq.setHeader('Connection', 'keep-alive');
        } else {
          console.log('📡 API Proxy request:', req.method, req.url);
        }
      },
      onProxyRes: (proxyRes, req, res) => {
        if (req.url?.includes('/events')) {
          console.log('🌊 SSE Proxy response:', proxyRes.statusCode, req.url);
          console.log('🌊 SSE Response headers:', proxyRes.headers);
          
          // Ensure proper SSE headers
          if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
            proxyRes.headers['access-control-allow-origin'] = '*';
            proxyRes.headers['access-control-allow-headers'] = '*';
            console.log('✅ SSE headers configured');
          }
        } else {
          console.log('📡 API Proxy response:', proxyRes.statusCode, req.url);
        }
      }
    })
  );
};