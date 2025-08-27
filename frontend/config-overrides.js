module.exports = function override(config, env) {
  // Disable WebSocket connections for hot reloading to prevent conflicts
  if (env === 'development') {
    // Find the webpack-dev-server entry
    const devServerEntry = config.entry.find(entry => 
      entry && entry.includes && entry.includes('webpack-dev-server/client')
    );
    
    // Remove the problematic WebSocket client
    if (config.entry && Array.isArray(config.entry)) {
      config.entry = config.entry.filter(entry => 
        !entry.includes('webpack-dev-server/client')
      );
    }
  }
  
  return config;
};