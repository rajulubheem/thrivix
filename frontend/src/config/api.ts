/**
 * API Configuration
 * Automatically uses current origin in production for same-origin requests
 */

export const getApiUrl = (): string => {
  // Check if REACT_APP_API_URL is explicitly set
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }

  // In production/browser, use current origin for same-origin requests
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  // Fallback for SSR or development
  return 'http://localhost:8000';
};

export const getWsUrl = (): string => {
  // Check if REACT_APP_WS_URL is explicitly set
  if (process.env.REACT_APP_WS_URL) {
    return process.env.REACT_APP_WS_URL;
  }

  // In production/browser, derive from current origin
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }

  // Fallback for SSR or development
  return 'ws://localhost:8000';
};

export const API_BASE_URL = getApiUrl();
export const WS_BASE_URL = getWsUrl();