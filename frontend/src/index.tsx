import React from 'react';
import ReactDOM from 'react-dom/client';
import '@radix-ui/themes/styles.css';
import './styles/globals.css';
import './styles/global-theme.css';
import './styles/enhanced-theme.css';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// Completely suppress ResizeObserver errors
const debounce = (callback: Function, delay: number) => {
  let tid: any;
  return function (...args: any[]) {
    clearTimeout(tid);
    tid = setTimeout(() => callback.apply(null, args), delay);
  };
};

// Override ResizeObserver to fix the error
const ResizeObserverOrig = window.ResizeObserver;
window.ResizeObserver = class ResizeObserver extends ResizeObserverOrig {
  constructor(callback: ResizeObserverCallback) {
    super(debounce(callback, 20));
  }
} as any;

// Also suppress console errors for ResizeObserver
const errorHandler = (e: ErrorEvent) => {
  if (e.message?.includes('ResizeObserver loop') ||
      e.message?.includes('ResizeObserver loop completed') ||
      e.message?.includes('ResizeObserver loop limit exceeded')) {
    e.stopImmediatePropagation();
    e.preventDefault();
    return true;
  }
};

window.addEventListener('error', errorHandler);

// Suppress console.error for ResizeObserver
const originalError = console.error;
console.error = (...args: any[]) => {
  if (args[0]?.toString?.()?.includes('ResizeObserver')) {
    return;
  }
  originalError.apply(console, args);
};

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
