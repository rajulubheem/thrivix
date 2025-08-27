import React, { useEffect, useRef, useState } from 'react';
import './SwarmVisualization.css';

interface SwarmNode {
  id: string;
  name: string;
  type: string;
  status: 'idle' | 'working' | 'complete';
  contributions: number;
}

interface SwarmEdge {
  from: string;
  to: string;
  count: number;
}

interface SwarmVisualizationProps {
  agents: SwarmNode[];
  handoffs: SwarmEdge[];
  currentAgent?: string;
  sharedMemory?: {
    completedTasks: number;
    totalTasks: number;
    artifacts: number;
    knowledge: number;
  };
}

const SwarmVisualization: React.FC<SwarmVisualizationProps> = ({
  agents,
  handoffs,
  currentAgent,
  sharedMemory
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Calculate positions for agents in a circle
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 80;
    
    const nodePositions: Record<string, { x: number; y: number }> = {};
    
    agents.forEach((agent, index) => {
      const angle = (index * 2 * Math.PI) / agents.length - Math.PI / 2;
      nodePositions[agent.id] = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      };
    });
    
    // Draw connections (handoffs)
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
    ctx.lineWidth = 2;
    
    handoffs.forEach(edge => {
      const from = nodePositions[edge.from];
      const to = nodePositions[edge.to];
      
      if (from && to) {
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        
        // Draw curved line
        const cp1x = (from.x + to.x) / 2 + (to.y - from.y) / 4;
        const cp1y = (from.y + to.y) / 2 - (to.x - from.x) / 4;
        ctx.quadraticCurveTo(cp1x, cp1y, to.x, to.y);
        
        // Thicker line for more handoffs
        ctx.lineWidth = Math.min(edge.count * 2, 8);
        ctx.stroke();
        
        // Draw arrow
        const angle = Math.atan2(to.y - cp1y, to.x - cp1x);
        ctx.save();
        ctx.translate(to.x, to.y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(-10, -5);
        ctx.lineTo(0, 0);
        ctx.lineTo(-10, 5);
        ctx.stroke();
        ctx.restore();
      }
    });
    
    // Draw nodes (agents)
    agents.forEach(agent => {
      const pos = nodePositions[agent.id];
      if (!pos) return;
      
      // Node circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 30, 0, 2 * Math.PI);
      
      // Color based on status
      if (agent.id === currentAgent) {
        ctx.fillStyle = '#10b981'; // Green for active
      } else if (agent.status === 'complete') {
        ctx.fillStyle = '#6366f1'; // Blue for complete
      } else {
        ctx.fillStyle = '#e5e7eb'; // Gray for idle
      }
      
      ctx.fill();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Agent emoji/icon
      ctx.font = '20px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const icons: Record<string, string> = {
        researcher: '🔬',
        architect: '🏗️',
        developer: '💻',
        api_specialist: '🔌',
        reviewer: '✅',
        tester: '🧪'
      };
      ctx.fillText(icons[agent.type] || '🤖', pos.x, pos.y);
      
      // Agent name
      ctx.fillStyle = '#1e293b';
      ctx.font = '12px Arial';
      ctx.fillText(agent.name, pos.x, pos.y + 45);
      
      // Contribution count
      if (agent.contributions > 0) {
        ctx.fillStyle = '#6366f1';
        ctx.font = 'bold 10px Arial';
        ctx.fillText(`${agent.contributions} tasks`, pos.x, pos.y + 60);
      }
    });
    
    // Draw shared memory status in center
    if (sharedMemory) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillRect(centerX - 80, centerY - 40, 160, 80);
      ctx.strokeStyle = '#e5e7eb';
      ctx.strokeRect(centerX - 80, centerY - 40, 160, 80);
      
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Shared Memory', centerX, centerY - 20);
      
      ctx.font = '12px Arial';
      ctx.fillText(`Tasks: ${sharedMemory.completedTasks}/${sharedMemory.totalTasks}`, centerX, centerY);
      ctx.fillText(`Artifacts: ${sharedMemory.artifacts}`, centerX, centerY + 15);
      ctx.fillText(`Knowledge: ${sharedMemory.knowledge}`, centerX, centerY + 30);
    }
    
  }, [agents, handoffs, currentAgent, sharedMemory]);
  
  return (
    <div className="swarm-visualization">
      <div className="visualization-header">
        <h3>🐝 Swarm Intelligence Visualization</h3>
        <p>Agents collaborating with shared context and autonomous handoffs</p>
      </div>
      <canvas 
        ref={canvasRef}
        width={600}
        height={400}
        className="swarm-canvas"
      />
      <div className="visualization-legend">
        <div className="legend-item">
          <span className="legend-dot active"></span>
          <span>Active Agent</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot complete"></span>
          <span>Completed Work</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot idle"></span>
          <span>Idle</span>
        </div>
      </div>
    </div>
  );
};

export default SwarmVisualization;