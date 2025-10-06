// Node type icon mappings to match professional workflow tools
export const NODE_TYPE_ICONS: Record<string, string> = {
  // Core
  agent: '🤖',
  start: '▶️',
  end: '🏁',
  note: '📝',

  // Tools
  file_search: '📁',
  guardrails: '🛡️',
  mcp: '🔌',

  // Logic
  if_else: '🔀',
  while: '🔁',
  user_approval: '✋',

  // Data
  transform: '⚡',
  set_state: '💾',

  // Default
  default: '⚙️'
};

export const getNodeIcon = (nodeType: string): string => {
  return NODE_TYPE_ICONS[nodeType] || NODE_TYPE_ICONS.default;
};

// Node type colors to match professional design
export const NODE_TYPE_COLORS: Record<string, {bg: string, border: string, icon: string}> = {
  agent: {
    bg: '#8B5CF6',  // Purple
    border: '#7C3AED',
    icon: '#ffffff'
  },
  start: {
    bg: '#10B981',  // Green
    border: '#059669',
    icon: '#ffffff'
  },
  end: {
    bg: '#EF4444',  // Red
    border: '#DC2626',
    icon: '#ffffff'
  },
  file_search: {
    bg: '#F59E0B',  // Yellow/Orange
    border: '#D97706',
    icon: '#ffffff'
  },
  guardrails: {
    bg: '#F59E0B',  // Yellow/Orange
    border: '#D97706',
    icon: '#ffffff'
  },
  mcp: {
    bg: '#F59E0B',  // Yellow/Orange
    border: '#D97706',
    icon: '#ffffff'
  },
  if_else: {
    bg: '#F59E0B',  // Yellow/Orange
    border: '#D97706',
    icon: '#ffffff'
  },
  while: {
    bg: '#6B7280',  // Gray
    border: '#4B5563',
    icon: '#ffffff'
  },
  user_approval: {
    bg: '#F59E0B',  // Yellow/Orange
    border: '#D97706',
    icon: '#ffffff'
  },
  transform: {
    bg: '#8B5CF6',  // Purple
    border: '#7C3AED',
    icon: '#ffffff'
  },
  set_state: {
    bg: '#8B5CF6',  // Purple
    border: '#7C3AED',
    icon: '#ffffff'
  },
  default: {
    bg: '#6B7280',
    border: '#4B5563',
    icon: '#ffffff'
  }
};

export const getNodeColors = (nodeType: string) => {
  return NODE_TYPE_COLORS[nodeType] || NODE_TYPE_COLORS.default;
};
