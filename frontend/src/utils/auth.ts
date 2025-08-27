// Simple auth utility for development
export const initAuth = () => {
  // Set a demo token if not present
  if (!localStorage.getItem('access_token')) {
    localStorage.setItem('access_token', 'demo-token');
  }
};

export const getToken = () => {
  return localStorage.getItem('access_token') || 'demo-token';
};

export const setToken = (token: string) => {
  localStorage.setItem('access_token', token);
};

export const clearToken = () => {
  localStorage.removeItem('access_token');
};

// Initialize auth on import
initAuth();