import type { DataContext } from '../context.js';
import type { MountSessionInput, RecordEventInput } from '../validation.js';
import type { AgentEvent, AgentSession, Idea, Task } from '../types.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { now } from '../util.js';
import { IdeaService } from './ideas.js';

function isLive(session: AgentSession | null): boolean {
  return !!session && (session.status === 'mounted' || session.status === 'active');
}

export class AgentSessionService {
  constructor(private ctx: DataContext) {}

  mount(taskId: string, input: MountSessionInput): Task {
    const task = this.ctx.tasks.get(taskId);
    if (isLive(task.agentSession) && !input.force) {
      throw new ConflictError(
        `Task ${taskId} already has active session ${task.agentSession!.sessionId}; pass force=true to replace`,
        'SESSION_EXISTS',
      );
    }
    const ts = now();
    const session: AgentSession = {
      sessionId: input.sessionId,
      agentType: input.agentType ?? 'unknown',
      harnessName: input.harnessName ?? 'unknown',
      status: 'active',
      mountedAt: ts,
      lastActiveAt: ts,
    };
    const updated = this.ctx.tasks.update(taskId, {
      agentSession: session,
      status: 'in_progress',
    });
    this.ctx.settings.update({ activeTaskId: taskId });
    this.ctx.emitter.emit('session.mounted', { task: updated, session });
    this.ctx.emitter.emit('task.updated', updated);
    this.ctx.emitter.emit('settings.updated', this.ctx.settings.get());
    return updated;
  }

  unmount(taskId: string, status: AgentSession['status'] = 'unmounted'): Task {
    const task = this.ctx.tasks.get(taskId);
    if (!task.agentSession) throw new ConflictError(`Task ${taskId} has no mounted session`);
    const sessionId = task.agentSession.sessionId;
    const updated = this.ctx.tasks.update(taskId, {
      agentSession: { ...task.agentSession, status, lastActiveAt: now() },
    });
    this.ctx.emitter.emit('session.unmounted', { taskId, sessionId });
    this.ctx.emitter.emit('task.updated', updated);
    return updated;
  }

  recordEvents(input: RecordEventInput): AgentEvent[] {
    const task = this.ctx.tasks.findBySessionId(input.sessionId);
    if (!task) throw new NotFoundError('Session', input.sessionId);
    const events = this.ctx.events.insertMany(
      input.events.map((e) => ({
        taskId: task.id,
        sessionId: input.sessionId,
        type: e.type,
        payload: e.payload,
        createdAt: e.createdAt,
      })),
    );
    if (task.agentSession) {
      this.ctx.tasks.update(task.id, {
        agentSession: { ...task.agentSession, lastActiveAt: now() },
      });
    }
    this.ctx.emitter.emit('events.recorded', events);
    return events;
  }

  pullConfirmedCorrections(sessionId: string): Idea[] {
    const task = this.ctx.tasks.findBySessionId(sessionId);
    if (!task) throw new NotFoundError('Session', sessionId);
    return this.ctx.ideas.listConfirmedByTask(task.id);
  }

  markInjected(ids: string[]): Idea[] {
    return new IdeaService(this.ctx).markInjected(ids);
  }

  complete(taskId: string, force = false): Task {
    const task = this.ctx.tasks.get(taskId);
    const unresolved = this.ctx.ideas.countUnresolvedByTask(taskId);
    if (unresolved > 0 && !force) {
      throw new ConflictError(
        `Task ${taskId} has ${unresolved} unresolved correction(s); resolve them or pass force=true`,
        'TASK_HAS_UNRESOLVED',
      );
    }
    const session = task.agentSession
      ? { ...task.agentSession, status: 'completed' as const, lastActiveAt: now() }
      : null;
    const updated = this.ctx.tasks.update(taskId, { status: 'done', agentSession: session });
    this.ctx.emitter.emit('task.updated', updated);
    return updated;
  }

  findBySessionId(sessionId: string): Task | undefined {
    return this.ctx.tasks.findBySessionId(sessionId);
  }
}
