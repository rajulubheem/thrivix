// types/artifacts.ts - Unified artifact types

// Base artifact interface that all components should use
export interface BaseArtifact {
    id: string;
    name: string;
    title: string; // Required for EnhancedMessage compatibility
    type: 'code' | 'document' | 'data' | 'image' | 'test_result' | 'html';
    content: string; // Required, not optional
    path?: string;
    size?: number;
    metadata?: {
        language?: string;
        agent?: string;
        timestamp?: string;
        lines?: number;
        [key: string]: any;
    };
}

// Main artifact interface (used everywhere)
export interface Artifact extends BaseArtifact {}

// Legacy support for ArtifactRef (backward compatibility)
export interface ArtifactRef {
    id: string;
    name: string;
    type: 'code' | 'document' | 'data' | 'image' | 'test_result' | 'html';
    content?: string;
    path?: string;
    size?: number;
    metadata?: {
        language?: string;
        agent?: string;
        timestamp?: string;
        lines?: number;
        [key: string]: any;
    };
}

// Conversion utilities
export const convertArtifactRefToArtifact = (artifactRef: ArtifactRef): Artifact => ({
    id: artifactRef.id,
    name: artifactRef.name,
    title: artifactRef.name, // Use name as title
    type: artifactRef.type,
    content: artifactRef.content || '', // Ensure content is never undefined
    path: artifactRef.path,
    size: artifactRef.size,
    metadata: artifactRef.metadata
});

export const convertArtifactToArtifactRef = (artifact: Artifact): ArtifactRef => ({
    id: artifact.id,
    name: artifact.name,
    type: artifact.type,
    content: artifact.content,
    path: artifact.path,
    size: artifact.size,
    metadata: artifact.metadata
});

// Type guards
export const isValidArtifact = (artifact: any): artifact is Artifact => {
    return artifact &&
        typeof artifact.id === 'string' &&
        typeof artifact.name === 'string' &&
        typeof artifact.title === 'string' &&
        typeof artifact.content === 'string' &&
        artifact.type &&
        ['code', 'document', 'data', 'image', 'test_result', 'html'].includes(artifact.type);
};

export const isValidArtifactRef = (artifact: any): artifact is ArtifactRef => {
    return artifact &&
        typeof artifact.id === 'string' &&
        typeof artifact.name === 'string' &&
        artifact.type &&
        ['code', 'document', 'data', 'image', 'test_result', 'html'].includes(artifact.type);
};

// Factory functions
export const createArtifact = (params: {
    id?: string;
    name: string;
    type: Artifact['type'];
    content: string;
    language?: string;
    agent?: string;
    path?: string;
    size?: number;
    metadata?: Record<string, any>;
}): Artifact => ({
    id: params.id || `artifact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: params.name,
    title: params.name,
    type: params.type,
    content: params.content,
    path: params.path,
    size: params.size || new Blob([params.content]).size,
    metadata: {
        language: params.language,
        agent: params.agent,
        timestamp: new Date().toISOString(),
        lines: params.content.split('\n').length,
        ...params.metadata
    }
});

// =============================================================================
// Updated Component Props Interfaces
// =============================================================================

// EnhancedMessage artifact interface (now uses main Artifact)
export interface EnhancedMessageArtifact extends Artifact {}

// ArtifactsPanel props interface
export interface ArtifactsPanelProps {
    artifacts: Artifact[]; // Changed from ArtifactRef[] to Artifact[]
    onArtifactSelect?: (artifact: Artifact) => void;
    onArtifactDelete?: (artifactId: string) => void;
    title?: string;
    showActions?: boolean;
}

// =============================================================================
// Fix for SwarmExecutor.tsx
// =============================================================================

// Update SwarmExecution interface in types/swarm-v2.ts
export interface SwarmExecution {
    id: string;
    goal: any; // Your existing Goal type
    plan: any[]; // Your existing PlanStep[] type
    runCaps: any; // Your existing RunCaps type
    actions: any[]; // Your existing action types
    artifacts: Artifact[]; // Changed from ArtifactRef[] to Artifact[]
    agentStates: Record<string, any>;
    handoffHistory: any[];
    safetyFlags: any[];
    metrics: any;
    status: string;
    startTime: Date;
    endTime?: Date;
    pausedAt?: Date;
    error?: string;
}

// =============================================================================
// Fix for UnifiedSwarmChat.tsx
// =============================================================================

// Update Message interface
export interface Message {
    id: string;
    type: 'user' | 'agent' | 'system' | 'handoff';
    agent?: string;
    content: string;
    timestamp: Date;
    status?: 'idle' | 'thinking' | 'working' | 'streaming' | 'complete' | 'error';
    artifacts?: Artifact[]; // Changed from ArtifactRef[] to Artifact[]
    metadata?: any;
}

// =============================================================================
// Component Updates Required
// =============================================================================

/*
1. Update ArtifactsPanel.tsx - Change interface from ArtifactRef to Artifact:

export interface NewArtifactsPanelProps {
  artifacts: Artifact[]; // Changed from ArtifactRef[]
  onArtifactSelect?: (artifact: Artifact) => void; // Changed from ArtifactRef
  onArtifactDelete?: (artifactId: string) => void;
  title?: string;
  showActions?: boolean;
}

2. Update SwarmExecutor.tsx - Fix artifacts prop:

{activePanel === 'artifacts' && (
  <ArtifactsPanel
    artifacts={execution?.artifacts?.map(convertArtifactRefToArtifact) || []}
    title="Execution Artifacts"
    showActions={true}
  />
)}

3. Update UnifiedSwarmChat.tsx - Fix artifacts prop in EnhancedMessage:

artifacts={msg.artifacts || []} // Remove the mapping since artifacts is now Artifact[]

4. Update artifact creation in UnifiedSwarmChat.tsx:

const handleArtifactCreate = useCallback((artifact: any, messageId?: string) => {
  const newArtifact: Artifact = createArtifact({
    name: artifact.title || artifact.filename || 'Untitled',
    type: artifact.type === 'html' ? 'html' : artifact.type || 'code',
    content: artifact.content || '',
    language: artifact.language,
    agent: currentAgent,
    metadata: artifact.metadata
  });

  setAllArtifacts(prev => [...prev, newArtifact]);

  if (messageId) {
    setMessages(prev => prev.map(msg =>
      msg.id === messageId
        ? { ...msg, artifacts: [...(msg.artifacts || []), newArtifact] }
        : msg
    ));
  }
}, [currentAgent]);

5. Update artifact extraction in UnifiedSwarmChat.tsx:

const extractArtifactsFromContent = useCallback((content: string, agentName: string): Artifact[] => {
  const artifacts: Artifact[] = [];

  // ... existing regex logic ...

  // When creating artifacts, use createArtifact function:
  artifacts.push(createArtifact({
    name: filename,
    type,
    content: fileContent,
    language,
    agent: agentName
  }));

  return artifacts;
}, []);
*/