import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './utils/auth'; // Initialize authentication
import HomePage from './pages/HomePage';
import { ModernHomePage } from './pages/ModernHomePage';
import ProfessionalHomePage from './pages/ProfessionalHomePage';
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
import EventDrivenSwarmInterface from './components/swarm/EventDrivenSwarmInterface';
import EfficientSwarmInterface from './components/swarm/EfficientSwarmInterface';
import ModernFlowInterface from './components/swarm/ModernFlowInterface';
import FlowSwarmInterface from './components/swarm/FlowSwarmInterface';
import { ReactFlowProvider } from 'reactflow';
import StateMachineInterface from './components/swarm/StateMachineInterface';
import ProfessionalStateMachine from './components/swarm/ProfessionalStateMachine';
import MessengerSwarmInterface from './components/swarm/MessengerSwarmInterface';
import CleanSwarmDashboard from './components/swarm/CleanSwarmDashboard';
import { TrueDynamicSwarmChatInterface } from './components/swarm/TrueDynamicSwarmChatInterface';
import { ThemeProvider } from './contexts/ThemeContext';
import './App.css';
import OrchestratorConfig from './pages/OrchestratorConfig';
import SwarmToolsHub from './pages/SwarmToolsHub';

function App() {
  return (
      <ThemeProvider>
        <Router>
          <Routes>
            {/* Main landing page - using Professional UI */}
            <Route path="/" element={<ProfessionalHomePage />} />

            {/* Swarm Chat - Clean UI (SSE version) */}
            <Route path="/swarm" element={<CleanSwarmChat />} />
            <Route path="/swarm/:sessionId" element={<CleanSwarmChat />} />
            
            {/* Unified Orchestrator - Single powerful orchestrator with MCP and custom agents */}
            <Route path="/orchestrator" element={<UnifiedOrchestratorV2 />} />
            <Route path="/orchestrator/config" element={<OrchestratorConfig />} />
            <Route path="/swarm/tools" element={<SwarmToolsHub />} />
            
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
            
            {/* New Efficient WebSocket-based Swarm */}
            <Route path="/efficient-swarm" element={<EfficientSwarmInterface />} />
            
            {/* Modern Flow-Based Interface */}
            <Route path="/flow" element={<ModernFlowInterface />} />
            
            {/* React Flow Based Professional Interface */}
            <Route path="/flow-pro" element={<ReactFlowProvider><FlowSwarmInterface /></ReactFlowProvider>} />
            
            {/* State Machine Workflow Interface */}
            <Route path="/state-machine" element={<StateMachineInterface />} />
            
            {/* Professional State Machine Designer */}
            <Route path="/state-designer" element={<ProfessionalStateMachine />} />

            {/* Messenger-Style Swarm Interface with Enhanced Visualization */}
            <Route path="/messenger-swarm" element={<MessengerSwarmInterface />} />

            {/* Clean, Simple Swarm Dashboard */}
            <Route path="/clean-swarm" element={<CleanSwarmDashboard />} />

            {/* Redirect any other routes to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </ThemeProvider>
  );
}

export default App;
