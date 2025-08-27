/**
 * ConversationResearch with Enhanced Radix UI Interface
 */
import React from 'react';
import { Theme } from '@radix-ui/themes';
import ConversationResearchEnhanced from './ConversationResearchEnhanced';
import '@radix-ui/themes/styles.css';

const ConversationResearchRadix: React.FC = () => {
  return (
    <Theme appearance="dark" accentColor="violet" radius="medium" scaling="95%">
      <ConversationResearchEnhanced />
    </Theme>
  );
};

export default ConversationResearchRadix;