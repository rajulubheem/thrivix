import React, { useState, useEffect } from 'react';
import './ModernThemeSwitch.css';

interface ModernThemeSwitchProps {
    defaultTheme?: 'light' | 'dark';
    onThemeChange?: (theme: 'light' | 'dark') => void;
}

const ModernThemeSwitch: React.FC<ModernThemeSwitchProps> = ({
                                                                 defaultTheme = 'light',
                                                                 onThemeChange
                                                             }) => {
    const [theme, setTheme] = useState<'light' | 'dark'>(defaultTheme);

    useEffect(() => {
        // Load saved theme from localStorage
        const savedTheme = localStorage.getItem('app-theme') as 'light' | 'dark';
        if (savedTheme) {
            setTheme(savedTheme);
            document.documentElement.setAttribute('data-theme', savedTheme);
        }
    }, []);

    const toggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('app-theme', newTheme);
        onThemeChange?.(newTheme);
    };

    return (
        <button
            className="modern-theme-switch"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
            <div className="theme-switch-track">
                <div className="theme-switch-thumb">
          <span className="theme-icon">
            {theme === 'light' ? '☀️' : '🌙'}
          </span>
                </div>
                <span className="theme-label light">Light</span>
                <span className="theme-label dark">Dark</span>
            </div>
        </button>
    );
};

// Alternative Compact Version
export const CompactThemeSwitch: React.FC<ModernThemeSwitchProps> = ({
                                                                         defaultTheme = 'light',
                                                                         onThemeChange
                                                                     }) => {
    const [theme, setTheme] = useState<'light' | 'dark'>(defaultTheme);

    useEffect(() => {
        const savedTheme = localStorage.getItem('app-theme') as 'light' | 'dark';
        if (savedTheme) {
            setTheme(savedTheme);
            document.documentElement.setAttribute('data-theme', savedTheme);
        }
    }, []);

    const toggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('app-theme', newTheme);
        onThemeChange?.(newTheme);
    };

    return (
        <button
            className="compact-theme-switch"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
            <span className="icon-light">☀️</span>
            <span className="icon-dark">🌙</span>
            <div className="switch-slider"></div>
        </button>
    );
};

// Icon-Only Version (Most Minimal)
export const IconThemeSwitch: React.FC<ModernThemeSwitchProps> = ({
                                                                      defaultTheme = 'light',
                                                                      onThemeChange
                                                                  }) => {
    const [theme, setTheme] = useState<'light' | 'dark'>(defaultTheme);

    useEffect(() => {
        const savedTheme = localStorage.getItem('app-theme') as 'light' | 'dark';
        if (savedTheme) {
            setTheme(savedTheme);
            document.documentElement.setAttribute('data-theme', savedTheme);
        }
    }, []);

    const toggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('app-theme', newTheme);
        onThemeChange?.(newTheme);
    };

    return (
        <button
            className="icon-theme-switch"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
            <div className="icon-wrapper">
        <span className="theme-icon-animated">
          {theme === 'light' ? '☀️' : '🌙'}
        </span>
            </div>
        </button>
    );
};

export default ModernThemeSwitch;