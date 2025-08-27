// src/components/ConnectedThemeSwitch.tsx
import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import './ModernThemeSwitch.css';

const ConnectedThemeSwitch: React.FC = () => {
    const { isDark, toggleTheme } = useTheme();

    return (
        <button
            className="compact-theme-switch"
            onClick={toggleTheme}
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        >
            <span className="icon-light">☀️</span>
            <span className="icon-dark">🌙</span>
            <div className="switch-slider"></div>
        </button>
    );
};

export default ConnectedThemeSwitch;