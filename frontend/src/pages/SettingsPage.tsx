import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Save, Moon, Sun, Globe, Key, 
  Info, Check
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import PageLayout from '../components/layout/PageLayout';
import './SettingsPage.css';

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const [isSaved, setIsSaved] = useState(false);
  
  const [settings, setSettings] = useState({
    apiKeys: {
      openai: localStorage.getItem('openai_api_key') || '',
      tavily: localStorage.getItem('tavily_api_key') || ''
    },
    preferences: {
      language: localStorage.getItem('language') || 'en',
      autoSave: localStorage.getItem('auto_save') === 'true',
      notifications: localStorage.getItem('notifications') === 'true'
    }
  });

  const handleSave = () => {
    // Save to localStorage
    localStorage.setItem('openai_api_key', settings.apiKeys.openai);
    localStorage.setItem('tavily_api_key', settings.apiKeys.tavily);
    localStorage.setItem('language', settings.preferences.language);
    localStorage.setItem('auto_save', String(settings.preferences.autoSave));
    localStorage.setItem('notifications', String(settings.preferences.notifications));
    
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <PageLayout showBackButton>
      <div className="settings-page">
      {/* Settings Header */}
      <div className="settings-header">
        <div className="settings-header-content">
          <h1 className="settings-title">Settings</h1>
          
          <button 
            onClick={handleSave}
            className={`save-button ${isSaved ? 'saved' : ''}`}
          >
            {isSaved ? <Check size={20} /> : <Save size={20} />}
            {isSaved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Settings Content */}
      <div className="settings-content">
        {/* Theme Section */}
        <section className="settings-section">
          <div className="section-header">
            <h2>
              {isDark ? <Moon size={20} /> : <Sun size={20} />}
              Appearance
            </h2>
          </div>
          
          <div className="setting-item">
            <div className="setting-info">
              <h3>Theme</h3>
              <p>Choose your preferred color theme</p>
            </div>
            
            <button 
              onClick={toggleTheme}
              className="theme-switch"
            >
              <div className={`switch-track ${isDark ? 'dark' : ''}`}>
                <div className="switch-thumb" />
              </div>
              <span>{isDark ? 'Dark' : 'Light'}</span>
            </button>
          </div>
        </section>

        {/* API Keys Section */}
        <section className="settings-section">
          <div className="section-header">
            <h2>
              <Key size={20} />
              API Configuration
            </h2>
            <span className="section-badge">Required for AI features</span>
          </div>
          
          <div className="setting-item">
            <div className="setting-info">
              <h3>OpenAI API Key</h3>
              <p>Required for AI responses and analysis</p>
            </div>
            
            <input
              type="password"
              value={settings.apiKeys.openai}
              onChange={(e) => setSettings({
                ...settings,
                apiKeys: { ...settings.apiKeys, openai: e.target.value }
              })}
              placeholder="sk-..."
              className="api-input"
            />
          </div>
          
          <div className="setting-item">
            <div className="setting-info">
              <h3>Tavily API Key</h3>
              <p>Required for web search functionality</p>
            </div>
            
            <input
              type="password"
              value={settings.apiKeys.tavily}
              onChange={(e) => setSettings({
                ...settings,
                apiKeys: { ...settings.apiKeys, tavily: e.target.value }
              })}
              placeholder="tvly-..."
              className="api-input"
            />
          </div>
        </section>

        {/* Preferences Section */}
        <section className="settings-section">
          <div className="section-header">
            <h2>
              <Globe size={20} />
              Preferences
            </h2>
          </div>
          
          <div className="setting-item">
            <div className="setting-info">
              <h3>Language</h3>
              <p>Select your preferred language</p>
            </div>
            
            <select
              value={settings.preferences.language}
              onChange={(e) => setSettings({
                ...settings,
                preferences: { ...settings.preferences, language: e.target.value }
              })}
              className="language-select"
            >
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
              <option value="zh">中文</option>
            </select>
          </div>
          
          <div className="setting-item">
            <div className="setting-info">
              <h3>Auto-save</h3>
              <p>Automatically save conversations</p>
            </div>
            
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.preferences.autoSave}
                onChange={(e) => setSettings({
                  ...settings,
                  preferences: { ...settings.preferences, autoSave: e.target.checked }
                })}
              />
              <span className="toggle-slider" />
            </label>
          </div>
          
          <div className="setting-item">
            <div className="setting-info">
              <h3>Notifications</h3>
              <p>Receive notifications for completed tasks</p>
            </div>
            
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.preferences.notifications}
                onChange={(e) => setSettings({
                  ...settings,
                  preferences: { ...settings.preferences, notifications: e.target.checked }
                })}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </section>

        {/* About Section */}
        <section className="settings-section">
          <div className="section-header">
            <h2>
              <Info size={20} />
              About
            </h2>
          </div>
          
          <div className="about-content">
            <p><strong>Thrivix Platform</strong></p>
            <p>Version 2.0.0</p>
            <p>Built with React, TypeScript, and powered by Strands AI SDK</p>
            <div className="about-links">
              <a href="https://github.com" target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
              <span>•</span>
              <a href="/docs" target="_blank" rel="noopener noreferrer">
                Documentation
              </a>
              <span>•</span>
              <a href="/support" target="_blank" rel="noopener noreferrer">
                Support
              </a>
            </div>
          </div>
        </section>
      </div>
      </div>
    </PageLayout>
  );
};

export default SettingsPage;