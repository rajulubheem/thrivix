import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './utils/auth'; // Initialize authentication
import HomePage from './pages/HomePage';
import { ModernHomePage } from './pages/ModernHomePage';
import { EnhancedSwarmChat } from './pages/EnhancedSwarmChat';
import { ModernSwarmChat } from './pages/ModernSwarmChat';
import { ModernSwarmChatFixed } from './pages/ModernSwarmChatFixed';
import { ModernSwarmChatEnhanced } from './pages/ModernSwarmChatEnhanced';
import { UnifiedOrchestratorV2 } from './pages/UnifiedOrchestratorV2';
import UnifiedOrchestratorV3 from './pages/UnifiedOrchestratorV3';
import ConversationResearch from './components/research/ConversationResearch';
import ConversationResearchRadix from './components/research/ConversationResearchRadix';
import ScholarlyResearchView from './components/research/ScholarlyResearchView';
import CleanSwarmChat from './pages/CleanSwarmChat';
import TrueSwarmChat from './pages/TrueSwarmChat';
import TrueSwarmRadix from './pages/TrueSwarmRadix';
import ToolSettingsV2 from './pages/ToolSettingsV2';
import SettingsPage from './pages/SettingsPage';
import VercelResearch from './components/research/VercelResearch';
import { EventDrivenSwarmInterface } from './components/swarm/EventDrivenSwarmInterface';
import { TrueDynamicSwarmChatInterface } from './components/swarm/TrueDynamicSwarmChatInterface';
import { ThemeProvider } from './contexts/ThemeContext';
import './App.css';

function App() {
  return (
      <ThemeProvider>
        <Router>
          <Routes>
            {/* Main landing page - using new Modern UI */}
            <Route path="/" element={<ModernHomePage />} />

            {/* Swarm Chat - Clean UI (SSE version) */}
            <Route path="/swarm" element={<CleanSwarmChat />} />
            <Route path="/swarm/:sessionId" element={<CleanSwarmChat />} />
            
            {/* Unified Orchestrator - Single powerful orchestrator with MCP and custom agents */}
            <Route path="/orchestrator" element={<UnifiedOrchestratorV2 />} />
            
            {/* Enhanced Swarm for demo */}
            <Route path="/enhanced" element={<EnhancedSwarmChat />} />

            {/* Settings Pages */}
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/tools" element={<ToolSettingsV2 />} />

            {/* Research Interfaces */}
            <Route path="/research" element={<VercelResearch />} />
            <Route path="/conversation" element={<ScholarlyResearchView />} />
            <Route path="/conversation/:sessionId" element={<ScholarlyResearchView />} />
            
            {/* True Swarm Chat */}
            <Route path="/true-swarm" element={<TrueSwarmRadix />} />
            <Route path="/true-swarm/:sessionId" element={<TrueSwarmRadix />} />
            <Route path="/true-swarm-old" element={<TrueSwarmChat />} />
            
            {/* Event-Driven Swarm with Human-in-Loop */}
            <Route path="/event-swarm" element={<EventDrivenSwarmInterface />} />
            
            {/* True Dynamic Swarm with Session-Based Architecture */}
            <Route path="/true-dynamic-swarm" element={<TrueDynamicSwarmChatInterface />} />

            {/* Redirect any other routes to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </ThemeProvider>
  );
}

export default App;
