const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  console.log('🚀 SETUPPROXY.JS IS LOADED!');
  
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:8000',
      changeOrigin: true,
      secure: false,
      logLevel: 'debug'
    })
  );
  
  console.log('✅ Proxy configured: /api -> http://localhost:8000');
};