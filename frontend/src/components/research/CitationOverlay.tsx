import React, { useState } from 'react';
import { FileText, ExternalLink, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Citation {
  id: string;
  text: string;
  sourceId: string;
  confidence: number;
}

interface Source {
  id: string;
  title: string;
  url: string;
  domain: string;
}

interface CitationOverlayProps {
  text: string;
  citations: Citation[];
  sources: Source[];
}

export default function CitationOverlay({ text, citations, sources }: CitationOverlayProps) {
  const [hoveredCitation, setHoveredCitation] = useState<string | null>(null);
  const [clickedCitation, setClickedCitation] = useState<string | null>(null);

  const renderTextWithCitations = () => {
    let processedText = text;
    const elements: React.ReactElement[] = [];
    let lastIndex = 0;

    // Sort citations by their position in the text
    const sortedCitations = [...citations].sort((a, b) => {
      const posA = text.indexOf(a.text);
      const posB = text.indexOf(b.text);
      return posA - posB;
    });

    sortedCitations.forEach((citation, index) => {
      const citationIndex = processedText.indexOf(citation.text, lastIndex);
      if (citationIndex !== -1) {
        // Add text before citation
        if (citationIndex > lastIndex) {
          elements.push(
            <span key={`text-${index}`}>
              {processedText.substring(lastIndex, citationIndex)}
            </span>
          );
        }

        // Add citation with highlight
        const source = sources.find(s => s.id === citation.sourceId);
        elements.push(
          <span
            key={`citation-${citation.id}`}
            className={`relative inline-block transition-all cursor-pointer ${
              hoveredCitation === citation.id
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
            } px-1 rounded`}
            onMouseEnter={() => setHoveredCitation(citation.id)}
            onMouseLeave={() => setHoveredCitation(null)}
            onClick={() => setClickedCitation(citation.id === clickedCitation ? null : citation.id)}
          >
            {citation.text}
            <sup className="ml-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
              [{citations.indexOf(citation) + 1}]
            </sup>
            
            {/* Hover tooltip */}
            <AnimatePresence>
              {hoveredCitation === citation.id && source && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute bottom-full left-0 mb-2 w-72 p-3 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50"
                >
                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {source.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {source.domain}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-green-500" />
                          <span className="text-xs text-gray-600 dark:text-gray-300">
                            {citation.confidence}% confidence
                          </span>
                        </div>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View source
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </span>
        );

        lastIndex = citationIndex + citation.text.length;
      }
    });

    // Add remaining text
    if (lastIndex < processedText.length) {
      elements.push(
        <span key="text-final">{processedText.substring(lastIndex)}</span>
      );
    }

    return elements;
  };

  return (
    <div className="relative">
      <div className="text-gray-900 dark:text-gray-100 leading-relaxed">
        {renderTextWithCitations()}
      </div>

      {/* Citation references at the bottom */}
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">
          Sources
        </h4>
        <div className="space-y-2">
          {citations.map((citation, index) => {
            const source = sources.find(s => s.id === citation.sourceId);
            if (!source) return null;

            return (
              <motion.div
                key={citation.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
                  clickedCitation === citation.id
                    ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700'
                    : 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-2"
                  >
                    {source.title}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {source.domain} • {citation.confidence}% confidence
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}