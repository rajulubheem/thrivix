import React from 'react';
import { Clock, Search, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface TimelineResult {
  id: string;
  query: string;
  summary: string;
  timestamp: Date;
  confidence: number;
  sources?: any[];
  images?: any[];
  followUpQuestions?: string[];
  citations?: any[];
  verificationStatus?: string;
}

interface ResearchTimelineProps {
  history: TimelineResult[];
  onSelectResult: (result: TimelineResult) => void;
}

export default function ResearchTimeline({ history, onSelectResult }: ResearchTimelineProps) {
  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return new Date(date).toLocaleDateString();
  };

  return (
    <div className="relative">
      <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
      
      <div className="space-y-4">
        {history.map((result, index) => (
          <motion.div
            key={result.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="relative flex items-start gap-4"
          >
            <div className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center ${
              index === 0
                ? 'bg-blue-600 shadow-lg shadow-blue-600/30'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}>
              <Search className={`w-6 h-6 ${
                index === 0 ? 'text-white' : 'text-gray-500 dark:text-gray-400'
              }`} />
            </div>
            
            <div
              className={`flex-1 p-4 rounded-xl cursor-pointer transition-all ${
                index === 0
                  ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                  : 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              onClick={() => onSelectResult(result)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 dark:text-white">
                    {result.query}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                    {result.summary}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTime(result.timestamp)}
                    </span>
                    <span>
                      {result.confidence}% confidence
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}