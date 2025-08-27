import React from 'react';
import './ProfessionalWelcome.css';

interface QuickAction {
    icon: string;
    title: string;
    description: string;
    gradient: string;
    action: () => void;
}

interface ProfessionalWelcomeProps {
    onActionSelect: (action: string) => void;
}

const ProfessionalWelcome: React.FC<ProfessionalWelcomeProps> = ({ onActionSelect }) => {
    const quickActions: QuickAction[] = [
        {
            icon: '🔬',
            title: 'Deep Research & Analysis',
            description: 'Multi-agent research with citations, fact-checking, and comprehensive reports',
            gradient: 'linear-gradient(135deg, #667eea, #764ba2)',
            action: () => onActionSelect('Conduct deep research on quantum computing breakthroughs in 2024-2025 with market analysis and investment opportunities')
        },
        {
            icon: '🏗️',
            title: 'Full-Stack Application',
            description: 'Build production-ready apps with frontend, backend, database, and deployment',
            gradient: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
            action: () => onActionSelect('Build a full-stack real-time collaborative task management app with React, Node.js, PostgreSQL, and WebSocket support')
        },
        {
            icon: '🎯',
            title: 'Microservices Architecture',
            description: 'Design scalable distributed systems with proper patterns and best practices',
            gradient: 'linear-gradient(135deg, #f093fb, #f5576c)',
            action: () => onActionSelect('Design a microservices architecture for an e-commerce platform with service mesh, API gateway, and event-driven communication')
        },
        {
            icon: '🤖',
            title: 'AI/ML Pipeline',
            description: 'Create end-to-end machine learning solutions with data processing and deployment',
            gradient: 'linear-gradient(135deg, #4facfe, #00f2fe)',
            action: () => onActionSelect('Build an ML pipeline for sentiment analysis with data preprocessing, model training, evaluation, and REST API deployment')
        },
        {
            icon: '📊',
            title: 'Data Analysis & Visualization',
            description: 'Complex data analysis with interactive dashboards and insights',
            gradient: 'linear-gradient(135deg, #43e97b, #38f9d7)',
            action: () => onActionSelect('Analyze and visualize global climate data trends with interactive charts, predictive models, and actionable insights')
        },
        {
            icon: '🔒',
            title: 'Security Audit & Hardening',
            description: 'Comprehensive security analysis with vulnerability assessment and fixes',
            gradient: 'linear-gradient(135deg, #fa709a, #fee140)',
            action: () => onActionSelect('Perform a security audit for a web application including OWASP top 10, penetration testing approach, and hardening recommendations')
        }
    ];

    const capabilities = [
        { icon: '🧠', label: 'Deep Reasoning', value: '∞' },
        { icon: '🔧', label: 'Tools Available', value: '50+' },
        { icon: '👥', label: 'Agent Types', value: '12' },
        { icon: '⚡', label: 'Real-time', value: 'Yes' }
    ];

    return (
        <div className="professional-welcome">
        <div className="welcome-header">
        <div className="welcome-badge">AGENTIC AI PLATFORM</div>
    <h1 className="welcome-title">
        Welcome to <span className="gradient-text">Swarm AI</span>
    </h1>
    <p className="welcome-subtitle">
        Experience the power of collaborative AI agents working together to solve complex problems,
        conduct deep research, and build sophisticated solutions in real-time.
    </p>
    </div>

    <div className="capabilities-grid">
        {capabilities.map((cap, index) => (
                <div key={index} className="capability-card">
            <div className="capability-icon">{cap.icon}</div>
                <div className="capability-info">
            <div className="capability-value">{cap.value}</div>
                <div className="capability-label">{cap.label}</div>
            </div>
            </div>
))}
    </div>

    <div className="quick-actions-grid">
    <h3 className="section-title">Start with a Complex Task</h3>
    <div className="actions-container">
        {quickActions.map((action, index) => (
                <button
                    key={index}
            className="action-card"
            onClick={action.action}
            style={{ '--gradient': action.gradient } as React.CSSProperties}
>
    <div className="action-icon">{action.icon}</div>
        <div className="action-content">
    <h4 className="action-title">{action.title}</h4>
        <p className="action-description">{action.description}</p>
        </div>
        <div className="action-arrow">→</div>
    </button>
))}
    </div>
    </div>

    <div className="custom-prompt-section">
    <div className="prompt-hint">
    <span className="hint-icon">💡</span>
    <span>Or type your own complex task below to see multiple specialized agents collaborate</span>
    </div>
    </div>
    </div>
);
};

export default ProfessionalWelcome;