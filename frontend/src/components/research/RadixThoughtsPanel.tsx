import React, { useState } from 'react';
import { Box, Flex, Text, Badge, IconButton, ScrollArea, Separator } from '@radix-ui/themes';
import { ChevronDownIcon, ChevronUpIcon, ActivityLogIcon, CrossCircledIcon } from '@radix-ui/react-icons';
import { Brain, Sparkles, Search, FileText, Globe, CheckCircle, Code } from 'lucide-react';

interface Thought {
  type: string;
  content: string;
  timestamp: string;
}

interface RadixThoughtsPanelProps {
  thoughts: Thought[];
  isSearching: boolean;
}

const RadixThoughtsPanel: React.FC<RadixThoughtsPanelProps> = ({ thoughts, isSearching }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const getThoughtIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'searching':
      case 'search':
        return <Search size={14} />;
      case 'analyzing':
      case 'analysis':
        return <Brain size={14} />;
      case 'found':
      case 'result':
        return <CheckCircle size={14} />;
      case 'reading':
      case 'document':
        return <FileText size={14} />;
      case 'browsing':
      case 'web':
        return <Globe size={14} />;
      case 'code':
      case 'project':
        return <Code size={14} />;
      default:
        return <Sparkles size={14} />;
    }
  };

  const getThoughtColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'searching':
      case 'search':
        return 'blue';
      case 'analyzing':
      case 'analysis':
        return 'purple';
      case 'found':
      case 'result':
        return 'green';
      case 'error':
        return 'red';
      default:
        return 'gray';
    }
  };

  return (
    <Box
      style={{
        width: '100%',
        borderTop: '1px solid var(--gray-5)',
        backgroundColor: 'var(--gray-2)',
        transition: 'all 0.3s ease',
        maxHeight: isCollapsed ? '48px' : '280px',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Flex
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{
          padding: '12px 16px',
          cursor: 'pointer',
          userSelect: 'none',
          backgroundColor: 'var(--gray-3)',
          borderBottom: isCollapsed ? 'none' : '1px solid var(--gray-5)',
        }}
        align="center"
        justify="between"
      >
        <Flex align="center" gap="2">
          <Brain size={16} style={{ color: 'var(--violet-9)' }} />
          <Text size="2" weight="medium" style={{ color: 'var(--violet-11)' }}>
            Thinking Process
          </Text>
          <Badge color="violet" variant="soft" size="1">
            {thoughts.length}
          </Badge>
          {isSearching && (
            <Badge color="red" variant="solid" size="1">
              LIVE
            </Badge>
          )}
        </Flex>

        <IconButton
          size="1"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            setIsCollapsed(!isCollapsed);
          }}
        >
          {isCollapsed ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </IconButton>
      </Flex>

      {/* Content */}
      {!isCollapsed && (
        <ScrollArea
          type="auto"
          scrollbars="vertical"
          style={{
            height: '230px',
            padding: '12px',
          }}
        >
          <Flex direction="column" gap="2">
            {thoughts.length === 0 ? (
              <Flex align="center" justify="center" style={{ height: '100px' }}>
                <Text size="2" color="gray" style={{ fontStyle: 'italic' }}>
                  {isSearching ? 'Thinking...' : 'No thoughts yet'}
                </Text>
              </Flex>
            ) : (
              thoughts.map((thought, index) => (
                <Box
                  key={index}
                  style={{
                    padding: '10px',
                    backgroundColor: 'var(--gray-1)',
                    borderRadius: '8px',
                    border: '1px solid var(--gray-4)',
                  }}
                >
                  <Flex align="start" gap="2">
                    <Box
                      style={{
                        marginTop: '2px',
                        color: `var(--${getThoughtColor(thought.type)}-9)`,
                      }}
                    >
                      {getThoughtIcon(thought.type)}
                    </Box>
                    <Box style={{ flex: 1 }}>
                      <Flex align="center" gap="2" mb="1">
                        <Badge color={getThoughtColor(thought.type)} variant="soft" size="1">
                          {thought.type}
                        </Badge>
                        <Text size="1" color="gray">
                          {new Date(thought.timestamp).toLocaleTimeString()}
                        </Text>
                      </Flex>
                      <Text size="2" style={{ lineHeight: 1.5, color: 'var(--gray-12)' }}>
                        {thought.content}
                      </Text>
                    </Box>
                  </Flex>
                </Box>
              ))
            )}
          </Flex>
        </ScrollArea>
      )}
    </Box>
  );
};

export default RadixThoughtsPanel;