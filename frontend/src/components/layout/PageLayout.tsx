import React from 'react';
import Navigation from './Navigation';
import './PageLayout.css';

interface PageLayoutProps {
  children: React.ReactNode;
  showBackButton?: boolean;
  className?: string;
}

const PageLayout: React.FC<PageLayoutProps> = ({ 
  children, 
  showBackButton = false,
  className = ''
}) => {
  return (
    <div className={`page-layout ${className}`}>
      <Navigation showBackButton={showBackButton} />
      <main className="page-content">
        {children}
      </main>
    </div>
  );
};

export default PageLayout;