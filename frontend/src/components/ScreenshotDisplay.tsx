import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Monitor, Camera } from 'lucide-react';

interface Screenshot {
  url: string;
  description: string;
  data: string; // base64 image data
  type: string;
  timestamp: string;
}

interface ScreenshotDisplayProps {
  screenshots: Screenshot[];
  thoughts?: any[];
}

export const ScreenshotDisplay: React.FC<ScreenshotDisplayProps> = ({ screenshots, thoughts }) => {
  const [expandedImages, setExpandedImages] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);

  if (!screenshots || screenshots.length === 0) {
    return null;
  }

  const toggleImage = (index: number) => {
    const newExpanded = new Set(expandedImages);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedImages(newExpanded);
  };

  const displayScreenshots = showAll ? screenshots : screenshots.slice(0, 2);

  // Find related thoughts for each screenshot
  const getRelatedThought = (screenshot: Screenshot) => {
    if (!thoughts) return null;
    
    // Find thoughts that occurred around the same time as the screenshot
    const screenshotTime = new Date(screenshot.timestamp).getTime();
    const relatedThought = thoughts.find(thought => {
      const thoughtTime = new Date(thought.timestamp).getTime();
      const timeDiff = Math.abs(thoughtTime - screenshotTime);
      return timeDiff < 5000 && thought.type === 'visual_analysis'; // Within 5 seconds
    });
    
    return relatedThought;
  };

  return (
    <div className="mt-4 space-y-3 bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        <Monitor className="w-4 h-4" />
        <span className="font-medium">🌐 Browser Activity - {screenshots.length} Screenshots Captured</span>
        {screenshots.length > 2 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="ml-auto flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
          >
            {showAll ? 'Show less' : `Show all ${screenshots.length}`}
            {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      <div className="grid gap-3">
        {displayScreenshots.map((screenshot, index) => {
          const isExpanded = expandedImages.has(index);
          const thought = getRelatedThought(screenshot);
          
          return (
            <div
              key={index}
              className="border rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            >
              {/* Screenshot Header */}
              <div className="p-3 bg-white dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Camera className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {screenshot.description || `Screenshot ${index + 1}`}
                      </span>
                    </div>
                    {screenshot.url && (
                      <a
                        href={screenshot.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 block truncate"
                      >
                        {screenshot.url}
                      </a>
                    )}
                  </div>
                  <button
                    onClick={() => toggleImage(index)}
                    className="ml-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  >
                    {isExpanded ? <ChevronUp /> : <ChevronDown />}
                  </button>
                </div>

                {/* AI Thought about the screenshot */}
                {thought && (
                  <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 italic">
                    💭 {thought.content}
                  </div>
                )}
              </div>

              {/* Screenshot Image with better thumbnail */}
              <div className={`relative ${isExpanded ? '' : 'max-h-64'} overflow-hidden cursor-pointer`}
                   onClick={() => toggleImage(index)}>
                <img
                  src={screenshot.data}
                  alt={screenshot.description}
                  className={`w-full ${isExpanded ? '' : 'object-cover object-top'}`}
                  style={{ maxHeight: isExpanded ? 'none' : '16rem' }}
                />
                {!isExpanded && (
                  <>
                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-gray-50 dark:from-gray-800 to-transparent pointer-events-none" />
                    <div className="absolute bottom-2 right-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
                      Click to expand
                    </div>
                  </>
                )}
              </div>

              {/* Click to expand hint */}
              {!isExpanded && (
                <div className="p-2 text-center bg-gray-100 dark:bg-gray-750 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => toggleImage(index)}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    Click to expand full screenshot
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};