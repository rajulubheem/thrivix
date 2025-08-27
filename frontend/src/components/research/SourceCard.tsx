import React from 'react';
import { ExternalLink, Calendar, User, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import './SourceCard.css';

interface Source {
  id: string;
  title: string;
  url: string;
  snippet: string;
  favicon: string;
  domain: string;
  publishedDate?: string;
  author?: string;
  relevanceScore: number;
  type: 'web' | 'academic' | 'news' | 'social';
  preview?: string;
}

interface SourceCardProps {
  source: Source;
  onClick: () => void;
}

export default function SourceCard({ source, onClick }: SourceCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className="source-card"
    >
      <div className="source-header">
        <div className="source-info">
          {source.favicon && (
            <img src={source.favicon} alt="" className="source-favicon" />
          )}
          <div style={{ flex: 1 }}>
            <h4 className="source-title">
              {source.title}
            </h4>
            <p className="source-domain">{source.domain}</p>
          </div>
        </div>
        <ExternalLink className="w-4 h-4" style={{ color: '#6b7280', flexShrink: 0 }} />
      </div>

      <p className="source-snippet">
        {source.snippet}
      </p>

      {source.preview && (
        <div className="source-preview">
          <img src={source.preview} alt="" />
        </div>
      )}

      <div className="source-footer">
        <div className="source-meta">
          {source.publishedDate && (
            <span className="source-meta-item">
              <Calendar className="w-3 h-3" />
              {new Date(source.publishedDate).toLocaleDateString()}
            </span>
          )}
          {source.author && (
            <span className="source-meta-item">
              <User className="w-3 h-3" />
              {source.author}
            </span>
          )}
        </div>
        
        <div className="source-badges">
          <span className={`source-type-badge ${source.type}`}>
            {source.type}
          </span>
          <span className="source-relevance">
            <TrendingUp className="w-3 h-3" />
            {Math.round(source.relevanceScore * 100)}%
          </span>
        </div>
      </div>
    </motion.div>
  );
}