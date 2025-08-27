# Modern UI Components Integration Guide

## Overview
This guide explains how to integrate the new modern UI components into the existing Swarm Agent application.

## New Components Created

### 1. Modern Theme (`/styles/modern-theme.css`)
A comprehensive CSS variable system with:
- Light/Dark mode support
- Consistent color palette
- Animation timings
- Glass morphism effects
- Custom scrollbars

### 2. ModernChat Component
Location: `/components/ModernChat/`
Features:
- Beautiful message bubbles with animations
- Syntax highlighted code blocks
- Real-time streaming indicators
- Dark mode toggle
- Agent avatars and status indicators

### 3. ModernAgentCard Component  
Location: `/components/ModernAgentCard/`
Features:
- Expandable card design
- Interactive tool selection
- Model configuration
- Temperature control
- Real-time status updates

## Integration Steps

### Step 1: Import Modern Theme
Add to your main App.tsx or index.tsx:
```tsx
import './styles/modern-theme.css';
```

### Step 2: Use ModernChat in SwarmChat.tsx

Replace the existing chat rendering with:

```tsx
import { ModernChat } from '../components/ModernChat/ModernChat';

// In your SwarmChat component:
const SwarmChatModern = () => {
  // Convert existing messages to ModernChat format
  const modernMessages = messages.map(msg => ({
    id: msg.id,
    type: msg.type as 'user' | 'agent' | 'system',
    content: msg.content || streamingMessages.get(msg.agent) || '',
    agent: msg.agent,
    timestamp: msg.timestamp,
    status: msg.status as 'thinking' | 'typing' | 'complete',
    artifacts: allArtifacts.filter(a => a.metadata?.agent === msg.agent).map(a => ({
      id: a.id,
      name: a.name,
      type: 'code' as const,
      content: a.content || '',
      language: a.language
    }))
  }));

  const modernAgents = agents.map(a => ({
    id: a.id || a.name,
    name: a.name,
    avatar: '🤖', // Can customize per agent
    status: a.status || 'idle',
    color: a.color || '#6366f1'
  }));

  return (
    <ModernChat
      messages={modernMessages}
      agents={modernAgents}
      onSendMessage={handleSend}
      isStreaming={isStreaming}
      theme="light"
    />
  );
};
```

### Step 3: Use ModernAgentCard in AgentPanel

```tsx
import { ModernAgentCard } from '../components/ModernAgentCard/ModernAgentCard';

// In your AgentPanel component:
{agents.map(agent => (
  <ModernAgentCard
    key={agent.id}
    agent={{
      id: agent.id,
      name: agent.name,
      role: agent.role || 'AI Assistant',
      color: agent.color || '#6366f1',
      status: agent.status || 'idle',
      model: agent.model || 'gpt-4o',
      temperature: 0.7,
      tools: agent.tools || [],
      tokensUsed: agent.tokensUsed,
      systemPrompt: agent.system_prompt
    }}
    onUpdate={(updated) => {
      // Handle agent updates
    }}
    onDelete={() => {
      // Handle agent deletion
    }}
  />
))}
```

## Features Highlights

### 1. Animations with Framer Motion
All components use smooth animations:
- Entrance/exit animations
- Hover effects
- Loading states
- Micro-interactions

### 2. Dark Mode Support
Toggle between light and dark themes:
```tsx
document.documentElement.setAttribute('data-theme', 'dark');
```

### 3. Responsive Design
Components adapt to different screen sizes:
- Mobile-first approach
- Tablet optimizations
- Desktop enhancements

### 4. Accessibility
- ARIA labels
- Keyboard navigation
- Focus indicators
- Color contrast compliance

## Customization

### Colors
Edit `/styles/modern-theme.css`:
```css
:root {
  --primary: #your-color;
  --accent: #your-accent;
}
```

### Component Props
All components accept customization props:
```tsx
<ModernChat
  theme="dark"
  // ... other props
/>
```

## Performance Optimizations

1. **Memoization**: Components use React.memo for performance
2. **Virtual Scrolling**: Can be added for large message lists
3. **Code Splitting**: Components are modular and can be lazy-loaded
4. **Animation Performance**: Uses transform and opacity for 60fps animations

## Migration Checklist

- [ ] Backup existing code
- [ ] Install dependencies (framer-motion, react-syntax-highlighter)
- [ ] Import modern theme CSS
- [ ] Replace chat interface with ModernChat
- [ ] Update agent cards with ModernAgentCard
- [ ] Test dark mode toggle
- [ ] Verify animations work smoothly
- [ ] Check responsive design on mobile
- [ ] Test with real agent workflows

## Troubleshooting

### Issue: Animations not working
Solution: Ensure framer-motion is installed:
```bash
npm install framer-motion
```

### Issue: Syntax highlighting not showing
Solution: Install syntax highlighter:
```bash
npm install react-syntax-highlighter @types/react-syntax-highlighter
```

### Issue: Dark mode not persisting
Solution: Store theme preference in localStorage:
```tsx
localStorage.setItem('theme', 'dark');
```

## Next Steps

1. **Enhanced Features**:
   - Voice input/output
   - File drag & drop
   - Real-time collaboration cursors
   - Advanced filtering and search

2. **Additional Components**:
   - Timeline visualization
   - Metrics dashboard
   - Settings panel
   - Notification system

3. **Performance**:
   - Implement virtual scrolling for messages
   - Add service worker for offline support
   - Optimize bundle size

## Support

For questions or issues with the modern UI components, check:
1. Component source files for inline documentation
2. React DevTools for prop inspection
3. Browser console for any errors
4. Network tab for performance metrics