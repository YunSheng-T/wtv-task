import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  AgentEvent,
  AgentEventType,
  Idea,
  Requirement,
  Task,
} from '@wtv-task/core';

const DEFAULT_BASE = 'http://127.0.0.1:47821';
const DEFAULT_TOKEN_PATH = join(homedir(), '.wtv-task', 'token');

export interface ClientOptions {
  baseUrl?: string;
  token?: string;
  tokenPath?: string;
  fetchImpl?: typeof fetch;
}

export interface CreateRequirementInput { title: string; description?: string; priority?: string; tags?: string[]; status?: string }
export interface CreateTaskInput { requirementId: string; title: string; goal?: string; priority?: string; status?: string }
export interface CreateIdeaInput { taskId: string; content: string; kind?: 'idea' | 'correction'; source?: 'manual' | 'agent_event'; status?: string }
export interface MountInput { sessionId: string; agentType?: string; harnessName?: string; force?: boolean }

type Listener<T> = (payload: T) => void;

export class WtvTaskClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosed = false;
  private trackedSessions = new Set<string>();
  private listeners = new Map<string, Set<Listener<any>>>();

  constructor(opts: ClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');
    this.wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/ws';
    this.fetchImpl = opts.fetchImpl ?? fetch;
    if (opts.token) {
      this.token = opts.token;
    } else {
      const path = opts.tokenPath ?? DEFAULT_TOKEN_PATH;
      if (!existsSync(path)) {
        throw new Error(
          `No wtv-task token found at ${path}. Is the desktop app running? Start wtv-task or pass { token }.`,
        );
      }
      this.token = readFileSync(path, 'utf8').trim();
    }
  }

  // ---- low level ----
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(this.baseUrl + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`wtv-task ${method} ${path} failed: ${res.status} ${text}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // ---- requirements ----
  listRequirements(): Promise<Requirement[]> { return this.request('GET', '/api/v1/requirements'); }
  createRequirement(input: CreateRequirementInput): Promise<Requirement> {
    return this.request('POST', '/api/v1/requirements', input);
  }

  // ---- tasks ----
  listTasks(requirementId: string): Promise<Task[]> {
    return this.request('GET', `/api/v1/requirements/${requirementId}/tasks`);
  }
  createTask(input: CreateTaskInput): Promise<Task> { return this.request('POST', '/api/v1/tasks', input); }
  getTask(id: string): Promise<Task> { return this.request('GET', `/api/v1/tasks/${id}`); }
  updateTask(id: string, patch: Partial<Task>): Promise<Task> { return this.request('PATCH', `/api/v1/tasks/${id}`, patch); }
  deleteTask(id: string): Promise<void> { return this.request('DELETE', `/api/v1/tasks/${id}`); }
  async getActiveTask(): Promise<{ task: Task | null; recent: Task[] }> {
    return this.request('GET', '/api/v1/tasks/active');
  }
  setActiveTask(id: string | null): Promise<{ task: Task | null }> {
    return this.request('PUT', '/api/v1/tasks/active', { id });
  }

  // ---- session lifecycle ----
  mountTask(taskId: string, input: MountInput): Promise<Task> {
    return this.request('POST', `/api/v1/tasks/${taskId}/mount`, input);
  }
  unmountTask(taskId: string): Promise<Task> {
    return this.request('POST', `/api/v1/tasks/${taskId}/unmount`, {});
  }
  completeTask(taskId: string, force = false): Promise<Task> {
    return this.request('POST', `/api/v1/tasks/${taskId}/complete?force=${force}`, {});
  }
  recordEvents(taskId: string, events: { type: AgentEventType; payload?: Record<string, unknown> }[]): Promise<AgentEvent[]> {
    return this.request('POST', `/api/v1/tasks/${taskId}/events`, { events });
  }
  recordSessionEvents(sessionId: string, events: { type: AgentEventType; payload?: Record<string, unknown> }[]): Promise<AgentEvent[]> {
    return this.request('POST', `/api/v1/sessions/${sessionId}/events`, { events });
  }

  // ---- ideas / corrections ----
  listIdeas(taskId: string): Promise<Idea[]> {
    return this.request('GET', `/api/v1/tasks/${taskId}/ideas`);
  }
  createIdea(input: CreateIdeaInput): Promise<Idea> { return this.request('POST', '/api/v1/ideas', input); }
  confirmIdea(id: string): Promise<Idea> { return this.request('POST', `/api/v1/ideas/${id}/confirm`, {}); }
  resolveIdea(id: string): Promise<Idea> { return this.request('POST', `/api/v1/ideas/${id}/resolve`, {}); }
  dismissIdea(id: string): Promise<Idea> { return this.request('POST', `/api/v1/ideas/${id}/dismiss`, {}); }
  pullCorrections(sessionId: string): Promise<Idea[]> {
    return this.request('POST', `/api/v1/sessions/${sessionId}/pull`, {});
  }
  markInjected(ids: string[]): Promise<{ ideas: Idea[] }> {
    return this.request('POST', '/api/v1/corrections/batch-injected', { ids });
  }

  // ---- settings ----
  getSettings() { return this.request('GET', '/api/v1/settings'); }

  // ---- websocket ----
  connect(sessionId?: string): void {
    if (sessionId) this.trackedSessions.add(sessionId);
    this.manuallyClosed = false;
    this.ensureSocket();
  }

  private ensureSocket(): void {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    const url = `${this.wsUrl}?token=${encodeURIComponent(this.token)}`;
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      for (const sid of this.trackedSessions) {
        this.ws!.send(JSON.stringify({ type: 'subscribe', sessionId: sid }));
      }
    };
    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
        this.dispatch(msg);
      } catch {
        /* ignore */
      }
    };
    this.ws.onclose = () => {
      this.ws = null;
      if (!this.manuallyClosed) this.scheduleReconnect();
    };
    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureSocket();
    }, delay);
  }

  private dispatch(msg: { type: string } & Record<string, unknown>): void {
    const set = this.listeners.get(msg.type);
    if (set) for (const fn of set) fn(msg);
    const all = this.listeners.get('*');
    if (all) for (const fn of all) fn(msg);
  }

  on(event: 'correction.confirmed', cb: Listener<{ idea: Idea }>): () => void;
  on(event: 'task.updated', cb: Listener<{ task: Task }>): () => void;
  on(event: 'session.unmounted', cb: Listener<{ taskId: string; sessionId: string }>): () => void;
  on(event: '*', cb: Listener<any>): () => void;
  on(event: string, cb: Listener<any>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb);
    return () => set!.delete(cb);
  }

  close(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
