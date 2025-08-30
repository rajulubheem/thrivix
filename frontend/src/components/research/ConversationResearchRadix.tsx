/**
 * ConversationResearch with Unified Theme System
 */
import React from 'react';
import ConversationResearchFixed from './ConversationResearchFixed';

const ConversationResearchRadix: React.FC = () => {
  // Simply use the fixed version with unified theme
  // No Radix Theme wrapper needed as we're using our unified theme system
  return <ConversationResearchFixed />;
};

export default ConversationResearchRadix;