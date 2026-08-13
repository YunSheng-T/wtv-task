export const REQUIREMENT_STATUSES = ['backlog', 'active', 'done', 'archived'] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const TASK_STATUSES = ['pending', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const IDEA_KINDS = ['idea', 'correction'] as const;
export type IdeaKind = (typeof IDEA_KINDS)[number];

export const IDEA_STATUSES = ['captured', 'confirmed', 'injected', 'resolved', 'dismissed'] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const IDEA_SOURCES = ['manual', 'agent_event'] as const;
export type IdeaSource = (typeof IDEA_SOURCES)[number];

export const AGENT_EVENT_TYPES = [
  'turn_start',
  'turn_end',
  'tool_call',
  'tool_result',
  'yield',
  'checkpoint',
  'message',
] as const;
export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number];

export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export interface AgentSession {
  sessionId: string;
  agentType: string;
  harnessName: string;
  status: 'mounted' | 'active' | 'completed' | 'unmounted';
  mountedAt: string;
  lastActiveAt: string;
}

export interface Requirement {
  id: string;
  title: string;
  description: string;
  status: RequirementStatus;
  priority: Priority;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  requirementId: string;
  title: string;
  goal: string;
  status: TaskStatus;
  priority: Priority;
  order: number;
  agentSession: AgentSession | null;
  createdAt: string;
  updatedAt: string;
}

export interface Idea {
  id: string;
  taskId: string;
  content: string;
  kind: IdeaKind;
  status: IdeaStatus;
  source: IdeaSource;
  createdAt: string;
  confirmedAt: string | null;
  injectedAt: string | null;
  resolvedAt: string | null;
}

export interface AgentEvent {
  id: string;
  taskId: string;
  sessionId: string;
  type: AgentEventType;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AppSettings {
  activeTaskId: string | null;
  globalShortcut: string;
  apiPort: number;
  tokenHash: string | null;
}

export type Unsubscribe = () => void;
export type Listener<T = unknown> = (payload: T) => void;
