import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import './MessengerSwarmInterface.css';
import { HomeButton } from '../ui/HomeButton';
import { Download, Send, Maximize2, Minimize2, Users, Bot, Activity, MessageCircle, FileText, Pause, Play, RotateCcw } from 'lucide-react';

// Override any global styles
const styleOverride = `
  .messenger-swarm-container,
  .messenger-swarm-container * {
    color-scheme: light !important;
  }
  .messenger-swarm-container .message-text {
    color: #2c3e50 !important;
    background: white !important;
  }
  .messenger-swarm-container .message.user .message-text {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
    color: white !important;
  }
  .messenger-swarm-container .agent-name {
    color: #1a1a1a !important;
  }
  .messenger-swarm-container .timestamp {
    color: #6b7280 !important;
  }
  .messenger-swarm-container .chat-panel {
    background: white !important;
    color: #1a1a1a !important;
  }
  .messenger-swarm-container .messages-container {
    background: #f8f9fa !important;
  }
  .messenger-swarm-container input {
    color: #1a1a1a !important;
    background: white !important;
  }
`;

interface TokenFrame {
  exec_id: string;
  agent_id: string;
  seq: number;
  text: string;
  ts: number;
  final: boolean;
  frame_type: 'token';
}

interface ControlFrame {
  exec_id: string;
  type: string;
  agent_id?: string;
  payload?: any;
  ts: number;
  frame_type: 'control';
}

type Frame = TokenFrame | ControlFrame;

interface Agent {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output: string;
  startTime?: number;
  endTime?: number;
  error?: string;
  parent?: string;
  children: string[];
  depth: number;
  color: string;
  avatar?: string;
}

interface Message {
  id: string;
  agentId: string;
  agentName: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'status' | 'error' | 'completion';
  avatar?: string;
  color: string;
  isComplete?: boolean;
}

interface SwarmNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
  agent: Agent;
}

const AGENT_AVATARS = ['🤖', '🔧', '⚡', '🎯', '🔍', '📊', '💡', '🚀', '🎨', '🔮', '🌟', '⚙️'];
const AGENT_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD',
  '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788'
];

export default function MessengerSwarmInterface() {
  // Inject style overrides
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = styleOverride;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const wsRef = useRef<WebSocket | null>(null);

  const [agents, setAgents] = useState<Map<string, Agent>>(new Map());
  const [messages, setMessages] = useState<Message[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [userInput, setUserInput] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [showVisualization, setShowVisualization] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const agentMessagesRef = useRef<Map<string, string>>(new Map());

  const swarmNodesRef = useRef<SwarmNode[]>([]);
  const simulationRef = useRef<any>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const connectWebSocket = (execId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.hostname}:8000/api/v1/ws/${execId}`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      addMessage({
        id: `msg-${Date.now()}`,
        agentId: 'system',
        agentName: 'System',
        content: '🟢 Connected to swarm network',
        timestamp: new Date(),
        type: 'status',
        avatar: '🌐',
        color: '#52B788'
      });
    };

    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data) as Frame;
        handleFrame(frame);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      addMessage({
        id: `msg-${Date.now()}`,
        agentId: 'system',
        agentName: 'System',
        content: '🔴 Connection error',
        timestamp: new Date(),
        type: 'error',
        avatar: '⚠️',
        color: '#FF6B6B'
      });
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      // Don't auto-reconnect for execution-specific connections
    };

    wsRef.current = ws;
  };

  const handleFrame = (frame: Frame) => {
    console.log('Received frame:', frame);

    if (frame.frame_type === 'token') {
      const tokenFrame = frame as TokenFrame;

      // Accumulate agent output
      const currentContent = agentMessagesRef.current.get(tokenFrame.agent_id) || '';
      const newContent = currentContent + tokenFrame.text;
      agentMessagesRef.current.set(tokenFrame.agent_id, newContent);

      console.log(`Agent ${tokenFrame.agent_id} output:`, newContent);

      // Update agent's output
      setAgents(prev => {
        const updated = new Map(prev);
        const agent = updated.get(tokenFrame.agent_id);
        if (agent) {
          agent.output = newContent;
          updated.set(tokenFrame.agent_id, agent);
        }
        return updated;
      });

      // Update messages - find or create message for this agent
      setMessages(prev => {
        const existingIndex = prev.findIndex(
          msg => msg.agentId === tokenFrame.agent_id && msg.type === 'text' && !msg.isComplete
        );

        const agent = agents.get(tokenFrame.agent_id);
        const messageContent = newContent;

        if (existingIndex >= 0) {
          // Update existing message
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            content: messageContent,
            timestamp: new Date(tokenFrame.ts),
            isComplete: tokenFrame.final
          };
          return updated;
        } else if (tokenFrame.text.trim().length > 0) {
          // Create new message for this agent
          return [...prev, {
            id: `msg-${tokenFrame.agent_id}-text`,
            agentId: tokenFrame.agent_id,
            agentName: agent?.name || tokenFrame.agent_id,
            content: messageContent,
            timestamp: new Date(tokenFrame.ts),
            type: 'text' as const,
            avatar: agent?.avatar,
            color: agent?.color || '#45B7D1',
            isComplete: tokenFrame.final
          }];
        }
        return prev;
      });
    } else if (frame.frame_type === 'control') {
      handleControlFrame(frame as ControlFrame);
    }
  };

  const handleControlFrame = (frame: ControlFrame) => {
    const { type, agent_id, payload } = frame;

    switch (type) {
      case 'agent_started':
        if (agent_id) {
          registerAgent(agent_id, payload);
          // Don't add status message, wait for actual content
        }
        break;

      case 'agent_spawned':
        if (payload?.id) {
          registerAgent(payload.id, payload);
          // Don't add spawn message, too noisy
        }
        break;

      case 'agent_completed':
        if (agent_id) {
          updateAgentStatus(agent_id, 'completed');

          // Mark the agent's message as complete
          setMessages(prev => {
            const updated = [...prev];
            const msgIndex = updated.findIndex(m => m.agentId === agent_id && m.type === 'text');
            if (msgIndex >= 0) {
              updated[msgIndex].isComplete = true;
            }
            return updated;
          });
        }
        break;

      case 'task_completed':
      case 'session_end':
        setIsExecuting(false);
        addMessage({
          id: `msg-${Date.now()}-end`,
          agentId: 'system',
          agentName: 'System',
          content: '🏁 All agents have completed their tasks',
          timestamp: new Date(),
          type: 'completion',
          avatar: '🌐',
          color: '#52B788'
        });
        break;

      case 'error':
        if (agent_id) {
          updateAgentStatus(agent_id, 'failed');
          addMessage({
            id: `msg-${Date.now()}-error`,
            agentId: agent_id,
            agentName: agents.get(agent_id)?.name || agent_id,
            content: `❌ Error: ${payload?.message || 'Unknown error'}`,
            timestamp: new Date(frame.ts),
            type: 'error',
            avatar: '⚠️',
            color: '#FF6B6B'
          });
        }
        break;
    }
  };

  const registerAgent = (agentId: string, payload: any) => {
    setAgents(prev => {
      const colorIndex = prev.size % AGENT_COLORS.length;
      const avatarIndex = prev.size % AGENT_AVATARS.length;

      const newAgent: Agent = {
        id: agentId,
        name: payload?.name || agentId,
        status: 'running',
        output: '',
        parent: payload?.parent,
        children: [],
        depth: payload?.depth || 0,
        color: AGENT_COLORS[colorIndex],
        avatar: AGENT_AVATARS[avatarIndex],
        startTime: Date.now()
      };

      const updated = new Map(prev);
      updated.set(agentId, newAgent);

      // Update parent's children
      if (newAgent.parent && updated.has(newAgent.parent)) {
        const parent = updated.get(newAgent.parent)!;
        parent.children.push(agentId);
      }

      // Add node to swarm
      const canvas = canvasRef.current;
      if (canvas) {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const angle = Math.random() * Math.PI * 2;
        const radius = 150 + Math.random() * 100;

        const node: SwarmNode = {
          id: agentId,
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          agent: newAgent
        };

        swarmNodesRef.current.push(node);
      }

      return updated;
    });
  };

  const updateAgentStatus = (agentId: string, status: Agent['status']) => {
    setAgents(prev => {
      const updated = new Map(prev);
      const agent = updated.get(agentId);
      if (agent) {
        agent.status = status;
        if (status === 'running') agent.startTime = Date.now();
        if (status === 'completed' || status === 'failed') agent.endTime = Date.now();
      }
      return updated;
    });
  };

  const updateAgentOutput = (agentId: string, text: string) => {
    setAgents(prev => {
      const updated = new Map(prev);
      const agent = updated.get(agentId);
      if (agent) {
        agent.output += text;
      }
      return updated;
    });
  };

  const addMessage = (message: Message) => {
    setMessages(prev => [...prev, message]);
  };


  // Handle canvas click
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check which node was clicked
    swarmNodesRef.current.forEach(node => {
      const dx = x - node.x;
      const dy = y - node.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 30) {
        setSelectedAgent(node.id === selectedAgent ? null : node.id);

        // Scroll to agent's message in chat
        const messageEl = document.querySelector(`[data-agent-id="${node.id}"]`);
        messageEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }, [selectedAgent]);

  // Handle canvas hover
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let foundHover = false;
    swarmNodesRef.current.forEach(node => {
      const dx = x - node.x;
      const dy = y - node.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 30) {
        setHoveredNode(node.id);
        canvas.style.cursor = 'pointer';
        foundHover = true;
      }
    });

    if (!foundHover) {
      setHoveredNode(null);
      canvas.style.cursor = 'default';
    }
  }, []);

  // Self-organizing swarm physics animation
  useEffect(() => {
    if (!canvasRef.current || !showVisualization || !containerRef.current) return;

    // Initialize canvas size immediately
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width || 600;
    canvas.height = rect.height || 400;

    console.log('Canvas initialized:', canvas.width, 'x', canvas.height, 'Agents:', agents.size);

    const animate = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear canvas with dark background
      ctx.fillStyle = '#0d0f17';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw subtle grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      for (let i = 0; i < canvas.width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
      }
      for (let j = 0; j < canvas.height; j += 40) {
        ctx.beginPath();
        ctx.moveTo(0, j);
        ctx.lineTo(canvas.width, j);
        ctx.stroke();
      }

      // Sync swarm nodes with current agents
      const currentAgents = Array.from(agents.values());
      const currentAgentIds = new Set(currentAgents.map(a => a.id));

      // Remove nodes for agents that no longer exist
      swarmNodesRef.current = swarmNodesRef.current.filter(node =>
        currentAgentIds.has(node.id)
      );

      // Draw waiting message when no agents
      if (currentAgents.length === 0) {
        ctx.fillStyle = 'rgba(102, 126, 234, 0.5)';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Waiting for agents...', canvas.width / 2, canvas.height / 2);

        // Draw animated circle
        const time = Date.now() * 0.001;
        ctx.strokeStyle = 'rgba(102, 126, 234, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(
          canvas.width / 2 + Math.cos(time) * 50,
          canvas.height / 2 + Math.sin(time) * 50,
          20,
          0,
          Math.PI * 2
        );
        ctx.stroke();

        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      // Add nodes for new agents using hierarchical layout
      currentAgents.forEach((agent, index) => {
        const existingNode = swarmNodesRef.current.find(n => n.id === agent.id);

        if (!existingNode) {
          const centerX = canvas.width / 2;
          const centerY = canvas.height / 2;

          let x, y;

          // Hierarchical positioning based on depth
          if (agent.depth === 0) {
            // Root agents in center area
            const angle = (index / currentAgents.filter(a => a.depth === 0).length) * Math.PI * 2;
            x = centerX + Math.cos(angle) * 100;
            y = centerY + Math.sin(angle) * 100;
          } else if (agent.depth === 1) {
            // Level 1 agents in middle ring
            const level1Agents = currentAgents.filter(a => a.depth === 1);
            const indexInLevel = level1Agents.indexOf(agent);
            const angle = (indexInLevel / level1Agents.length) * Math.PI * 2;
            x = centerX + Math.cos(angle) * 200;
            y = centerY + Math.sin(angle) * 200;
          } else {
            // Deeper agents in outer ring
            const deepAgents = currentAgents.filter(a => a.depth > 1);
            const indexInLevel = deepAgents.indexOf(agent);
            const angle = (indexInLevel / Math.max(1, deepAgents.length)) * Math.PI * 2;
            x = centerX + Math.cos(angle) * 300;
            y = centerY + Math.sin(angle) * 300;
          }

          swarmNodesRef.current.push({
            id: agent.id,
            x: x + (Math.random() - 0.5) * 20, // Small random offset
            y: y + (Math.random() - 0.5) * 20,
            vx: 0,
            vy: 0,
            agent
          });
        } else {
          // Update existing node's agent reference
          existingNode.agent = agent;
        }
      });

      // Update node positions with swarm behavior
      const nodes = swarmNodesRef.current;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      nodes.forEach((node, i) => {
        // Skip physics if paused
        if (isPaused) return;

        // Apply forces based on hierarchy
        let fx = 0, fy = 0;

        // Target position based on depth
        const targetRadius = 100 + (node.agent.depth * 100);
        const angle = Math.atan2(node.y - centerY, node.x - centerX);
        const targetX = centerX + Math.cos(angle) * targetRadius;
        const targetY = centerY + Math.sin(angle) * targetRadius;

        // Attraction to target position
        const dxTarget = targetX - node.x;
        const dyTarget = targetY - node.y;
        fx += dxTarget * 0.002;
        fy += dyTarget * 0.002;

        // Repulsion from other nodes at same depth
        nodes.forEach((other, j) => {
          if (i === j) return;

          const dx = other.x - node.x;
          const dy = other.y - node.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Stronger repulsion for nodes at same depth
          if (Math.abs(node.agent.depth - other.agent.depth) <= 1) {
            if (dist < 100 && dist > 0) {
              fx -= (dx / dist) * 80 / dist;
              fy -= (dy / dist) * 80 / dist;
            }
          }

          // Connection force between parent-child
          if (node.agent.parent === other.id || other.agent.parent === node.id) {
            const idealDist = 100;
            if (dist > idealDist) {
              fx += (dx / dist) * (dist - idealDist) * 0.001;
              fy += (dy / dist) * (dist - idealDist) * 0.001;
            }
          }
        });

        // Apply forces with strong damping
        node.vx = (node.vx + fx) * 0.85;
        node.vy = (node.vy + fy) * 0.85;

        // Limit velocity
        const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
        if (speed > 3) {
          node.vx = (node.vx / speed) * 3;
          node.vy = (node.vy / speed) * 3;
        }

        // Update position
        if (!isPaused) {
          node.x += node.vx;
          node.y += node.vy;
        }

        // Keep within bounds
        node.x = Math.max(40, Math.min(canvas.width - 40, node.x));
        node.y = Math.max(40, Math.min(canvas.height - 40, node.y));
      });

      // Draw connections with gradient
      nodes.forEach(node => {
        if (node.agent.parent) {
          const parent = nodes.find(n => n.id === node.agent.parent);
          if (parent) {
            const gradient = ctx.createLinearGradient(node.x, node.y, parent.x, parent.y);
            gradient.addColorStop(0, `${node.agent.color}44`);
            gradient.addColorStop(1, `${parent.agent.color}44`);

            ctx.strokeStyle = gradient;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(parent.x, parent.y);
            ctx.stroke();
          }
        }
      });

      // Draw nodes
      nodes.forEach(node => {
        const { agent } = node;
        const isHovered = hoveredNode === node.id;
        const isSelected = selectedAgent === node.id;

        // Node shadow for depth
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        // Node circle with status-based styling
        const baseRadius = 20 + (5 * (2 - Math.min(2, agent.depth))); // Bigger nodes for higher level
        const radius = isHovered ? baseRadius + 5 : baseRadius;

        // Background circle
        ctx.fillStyle = agent.status === 'running' ? agent.color :
                       agent.status === 'completed' ? `${agent.color}CC` :
                       `${agent.color}66`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Selection ring
        if (isSelected) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + 5, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Pulse effect for running agents
        if (agent.status === 'running') {
          ctx.strokeStyle = agent.color;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.5 + Math.sin(Date.now() * 0.003) * 0.3;
          ctx.beginPath();
          ctx.arc(node.x, node.y, 30 + Math.sin(Date.now() * 0.003) * 5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Agent avatar
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'white';
        ctx.fillText(agent.avatar || '🤖', node.x, node.y);

        // Agent name with better styling
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        const name = agent.name.length > 15 ? agent.name.substring(0, 12) + '...' : agent.name;
        const textWidth = ctx.measureText(name).width;

        // Name background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.beginPath();
        ctx.roundRect(node.x - textWidth/2 - 5, node.y + radius + 5, textWidth + 10, 18, 4);
        ctx.fill();

        // Name text
        ctx.fillStyle = '#fff';
        ctx.fillText(name, node.x, node.y + radius + 18);

        // Status indicator
        if (agent.status === 'running') {
          ctx.fillStyle = '#10b981';
          ctx.beginPath();
          ctx.arc(node.x + radius - 5, node.y - radius + 5, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [agents, showVisualization, isPaused, hoveredNode, selectedAgent]);

  // Resize canvas
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        canvasRef.current.width = rect.width;
        canvasRef.current.height = rect.height;

        // Trigger re-render
        canvasRef.current.style.width = `${rect.width}px`;
        canvasRef.current.style.height = `${rect.height}px`;
      }
    };

    handleResize();
    // Small delay to ensure container is properly sized
    setTimeout(handleResize, 100);

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [showVisualization]);

  const startExecution = async () => {
    if (!userInput.trim()) return;

    // Clear everything for fresh start
    setIsExecuting(true);
    setAgents(new Map());
    swarmNodesRef.current = [];
    agentMessagesRef.current.clear();
    setMessages([]);
    setSelectedAgent(null);
    setHoveredNode(null);

    addMessage({
      id: `msg-user-${Date.now()}`,
      agentId: 'user',
      agentName: 'You',
      content: userInput,
      timestamp: new Date(),
      type: 'text',
      avatar: '👤',
      color: '#4A5568',
      isComplete: true
    });

    try {
      const response = await fetch('http://localhost:8000/api/v1/streaming/stream/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: userInput,
          stream: true,
          use_mock: false,
          max_parallel: 5
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Execution failed: ${error}`);
      }

      const data = await response.json();
      const execId = data.exec_id;
      setExecutionId(execId);

      addMessage({
        id: `msg-system-exec-${Date.now()}`,
        agentId: 'system',
        agentName: 'System',
        content: `🚀 Execution started: ${execId}`,
        timestamp: new Date(),
        type: 'status',
        avatar: '🌐',
        color: '#52B788'
      });

      // Connect WebSocket after getting execution ID
      setTimeout(() => connectWebSocket(execId), 100);

      setUserInput('');
    } catch (error) {
      console.error('Execution error:', error);
      setIsExecuting(false);
      addMessage({
        id: `msg-error-${Date.now()}`,
        agentId: 'system',
        agentName: 'System',
        content: `Error: ${error}`,
        timestamp: new Date(),
        type: 'error',
        avatar: '⚠️',
        color: '#FF6B6B'
      });
    }
  };

  const exportToHTML = () => {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Swarm Agent Conversation - ${new Date().toLocaleString()}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 { margin-bottom: 10px; }
    .header p { opacity: 0.9; }
    .messages {
      padding: 30px;
      max-height: 70vh;
      overflow-y: auto;
    }
    .message {
      display: flex;
      gap: 15px;
      margin-bottom: 25px;
      animation: slideIn 0.3s ease;
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      flex-shrink: 0;
    }
    .content {
      flex: 1;
    }
    .agent-name {
      font-weight: 600;
      margin-bottom: 5px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .timestamp {
      font-size: 12px;
      color: #666;
    }
    .message-text {
      background: #f7f7f7;
      padding: 12px 16px;
      border-radius: 12px;
      margin-top: 5px;
      white-space: pre-wrap;
    }
    .user-message .message-text {
      background: #667eea;
      color: white;
    }
    .status-message .message-text {
      background: #e8f5e9;
      color: #2e7d32;
    }
    .error-message .message-text {
      background: #ffebee;
      color: #c62828;
    }
    .completion-message .message-text {
      background: #e3f2fd;
      color: #1565c0;
    }
    .agents-summary {
      padding: 30px;
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
    }
    .agent-card {
      background: white;
      padding: 15px;
      border-radius: 10px;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 15px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .agent-status {
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      margin-left: auto;
    }
    .status-completed { background: #c8e6c9; color: #2e7d32; }
    .status-failed { background: #ffcdd2; color: #c62828; }
    .status-running { background: #fff9c4; color: #f57c00; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🤖 Swarm Agent Conversation</h1>
      <p>Generated on ${new Date().toLocaleString()}</p>
      <p>${agents.size} agents participated • ${messages.length} messages exchanged</p>
    </div>

    <div class="messages">
      ${messages.map(msg => `
        <div class="message ${msg.agentId === 'user' ? 'user-message' : ''} ${msg.type}-message">
          <div class="avatar" style="background: ${msg.color}22; color: ${msg.color}">
            ${msg.avatar || '🤖'}
          </div>
          <div class="content">
            <div class="agent-name">
              ${msg.agentName}
              <span class="timestamp">${msg.timestamp.toLocaleTimeString()}</span>
            </div>
            <div class="message-text">${msg.content}</div>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="agents-summary">
      <h2 style="margin-bottom: 20px;">Agent Summary</h2>
      ${Array.from(agents.values()).map(agent => `
        <div class="agent-card">
          <div class="avatar" style="background: ${agent.color}22; color: ${agent.color}">
            ${agent.avatar || '🤖'}
          </div>
          <div style="flex: 1">
            <div style="font-weight: 600">${agent.name}</div>
            <div style="font-size: 12px; color: #666">
              ${agent.startTime && agent.endTime ?
                `Duration: ${((agent.endTime - agent.startTime) / 1000).toFixed(1)}s` :
                'Not executed'}
            </div>
          </div>
          <div class="agent-status status-${agent.status}">
            ${agent.status.toUpperCase()}
          </div>
        </div>
      `).join('')}
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `swarm-conversation-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="messenger-swarm-container" data-theme="light">
      <HomeButton />

      <div className="messenger-layout">
        {/* Visualization Panel */}
        <div className={`visualization-panel ${!showVisualization ? 'hidden' : ''}`}>
          <div className="panel-header">
            <h2><Users size={18} /> Agent Swarm Network</h2>
            <div className="panel-controls">
              <button
                onClick={() => setIsPaused(!isPaused)}
                className="control-btn"
                title={isPaused ? 'Resume animation' : 'Pause animation'}
              >
                {isPaused ? <Play size={16} /> : <Pause size={16} />}
              </button>
              <button
                onClick={() => {
                  swarmNodesRef.current = [];
                  setSelectedAgent(null);
                }}
                className="control-btn"
                title="Reset positions"
              >
                <RotateCcw size={16} />
              </button>
              <button
                onClick={() => setShowVisualization(!showVisualization)}
                className="toggle-btn"
              >
                {showVisualization ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </div>
          </div>

          <div ref={containerRef} className="canvas-container">
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              onMouseMove={handleCanvasMouseMove}
            />
          </div>

          <div className="stats-bar">
            <div className="stat">
              <Bot size={16} />
              <span>{agents.size} Agents</span>
            </div>
            <div className="stat">
              <Activity size={16} />
              <span>{Array.from(agents.values()).filter(a => a.status === 'running').length} Active</span>
            </div>
            <div className="stat">
              <MessageCircle size={16} />
              <span>{messages.length} Messages</span>
            </div>
          </div>
        </div>

        {/* Chat Panel */}
        <div className="chat-panel">
          <div className="chat-header">
            <h2><MessageCircle size={18} /> Agent Communication Hub</h2>
            <button onClick={exportToHTML} className="export-btn">
              <FileText size={16} />
              Export HTML
            </button>
          </div>

          <div className="messages-container">
            {messages.filter(msg => msg.content && msg.content.trim().length > 0).map((msg, index) => (
              <div
                key={msg.id}
                className={`message ${msg.agentId === 'user' ? 'user' : 'agent'} ${msg.type} ${selectedAgent === msg.agentId ? 'selected' : ''}`}
                data-agent-id={msg.agentId}
              >
                <div className="message-avatar" style={{ background: `${msg.color}22`, color: msg.color }}>
                  {msg.avatar || '🤖'}
                </div>
                <div className="message-content">
                  <div className="message-header">
                    <span className="agent-name">{msg.agentName}</span>
                    <span className="timestamp">{msg.timestamp.toLocaleTimeString()}</span>
                    {msg.isComplete && <span className="complete-badge">✓</span>}
                  </div>
                  <div className="message-text">
                    {msg.content || 'Processing...'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="input-container">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !isExecuting && startExecution()}
              placeholder="Type your command for the swarm..."
              disabled={isExecuting}
            />
            <button
              onClick={startExecution}
              disabled={isExecuting || !userInput.trim()}
              className="send-btn"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}