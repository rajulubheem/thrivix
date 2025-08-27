import React, { useState, useRef, memo, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';

interface LightweightChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

// Completely isolated input component - NOT affected by message updates
export const LightweightChatInput = memo(({ 
  onSendMessage, 
  isLoading = false,
  placeholder = "Type your message..."
}: LightweightChatInputProps) => {
  // Local state ONLY for this input
  const [localInput, setLocalInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = localInput.trim();
    if (trimmed && !isLoading) {
      onSendMessage(trimmed);
      setLocalInput(''); // Clear immediately for responsiveness
      
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  }, [localInput, isLoading, onSendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Auto-resize textarea
  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const target = e.target;
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 200) + 'px';
    setLocalInput(target.value);
  }, []);

  return (
    <div className="flex items-end gap-2 p-4 border-t bg-background">
      <Textarea
        ref={textareaRef}
        value={localInput}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isLoading}
        className="min-h-[56px] max-h-[200px] resize-none"
        rows={1}
      />
      <Button
        onClick={handleSend}
        disabled={!localInput.trim() || isLoading}
        size="lg"
        className="px-4"
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Send className="h-5 w-5" />
        )}
      </Button>
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if loading state or callback changes
  return prevProps.isLoading === nextProps.isLoading &&
         prevProps.placeholder === nextProps.placeholder;
});

LightweightChatInput.displayName = 'LightweightChatInput';