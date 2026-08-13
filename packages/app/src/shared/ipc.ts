import type {
  AgentEvent,
  AppSettings,
  CreateIdeaInput,
  CreateRequirementInput,
  CreateTaskInput,
  Idea,
  MountSessionInput,
  Requirement,
  Task,
  UpdateRequirementInput,
  UpdateSettingsInput,
  UpdateTaskInput,
} from '@wtv-task/core';

export interface QuickCaptureInput {
  content: string;
  taskId?: string;
  correction?: boolean;
}

export interface Api {
  listRequirements(): Promise<Requirement[]>;
  createRequirement(input: CreateRequirementInput): Promise<Requirement>;
  updateRequirement(id: string, patch: UpdateRequirementInput): Promise<Requirement>;
  deleteRequirement(id: string, force?: boolean): Promise<void>;

  listTasks(requirementId: string): Promise<Task[]>;
  createTask(input: CreateTaskInput): Promise<Task>;
  updateTask(id: string, patch: UpdateTaskInput): Promise<Task>;
  deleteTask(id: string): Promise<void>;
  getTask(id: string): Promise<Task>;
  getActiveTask(): Promise<{ task: Task | null; recent: Task[] }>;
  setActiveTask(id: string | null): Promise<{ task: Task | null }>;

  listIdeas(taskId: string): Promise<Idea[]>;
  createIdea(input: CreateIdeaInput): Promise<Idea>;
  confirmIdea(id: string): Promise<Idea>;
  markIdeaInjected(id: string): Promise<Idea>;
  resolveIdea(id: string): Promise<Idea>;
  dismissIdea(id: string): Promise<Idea>;

  mountSession(taskId: string, input: MountSessionInput): Promise<Task>;
  unmountSession(taskId: string): Promise<Task>;
  completeTask(taskId: string, force?: boolean): Promise<Task>;
  listEvents(taskId: string): Promise<AgentEvent[]>;

  getSettings(): Promise<AppSettings>;
  updateSettings(patch: UpdateSettingsInput): Promise<AppSettings>;

  quickCapture(input: QuickCaptureInput): Promise<Idea>;
  closeQuickCapture(): Promise<void>;
  onEvent(cb: (event: { type: string; payload: unknown }) => void): () => void;
}

declare global {
  interface Window {
    api: Api;
  }
}
