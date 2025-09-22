import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';

interface HomeButtonProps {
  variant?: 'icon' | 'text' | 'both';
  className?: string;
}

export const HomeButton: React.FC<HomeButtonProps> = ({ 
  variant = 'icon',
  className = '' 
}) => {
  const navigate = useNavigate();

  const baseStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: variant === 'icon' ? '10px' : '8px 16px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
    border: 'none',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
    e.currentTarget.style.boxShadow = '0 4px 16px rgba(59, 130, 246, 0.4)';
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.transform = 'translateY(0) scale(1)';
    e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.3)';
  };

  return (
    <button
      className={`home-button ${className}`}
      onClick={() => navigate('/')}
      style={baseStyles}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title="Return to Home"
    >
      {variant === 'icon' && <Home size={18} />}
      {variant === 'text' && (
        <>
          <ArrowLeft size={16} />
          <span>Home</span>
        </>
      )}
      {variant === 'both' && (
        <>
          <Home size={18} />
          <span>Home</span>
        </>
      )}
    </button>
  );
};

export default HomeButton;