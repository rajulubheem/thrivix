const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Proxy API requests to backend
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:8000',
      changeOrigin: true,
      ws: true,
      // Disable buffering for streaming responses
      selfHandleResponse: false,
      onProxyReq: (proxyReq, req, res) => {
        // Add authentication header if not present
        if (!proxyReq.getHeader('Authorization')) {
          proxyReq.setHeader('Authorization', 'Bearer demo-token');
        }
        // Disable buffering headers
        proxyReq.setHeader('X-Accel-Buffering', 'no');
      },
      onProxyRes: (proxyRes, req, res) => {
        // Ensure streaming headers are preserved
        if (proxyRes.headers['content-type']?.includes('stream') || 
            proxyRes.headers['content-type']?.includes('ndjson')) {
          res.setHeader('X-Accel-Buffering', 'no');
          res.setHeader('Cache-Control', 'no-cache');
          
          // Remove content-length to allow chunked transfer
          delete proxyRes.headers['content-length'];
        }
      }
    })
  );
  
  // DO NOT proxy /ws to backend - this is for webpack dev server
  // The webpack dev server needs this for hot module replacement
  // By not proxying it, it stays on port 3000
};