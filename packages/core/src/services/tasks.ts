import type { DataContext } from '../context.js';
import type { CreateTaskInput, UpdateTaskInput } from '../validation.js';
import type { Task } from '../types.js';
import { now } from '../util.js';

export class TaskService {
  constructor(private ctx: DataContext) {}

  create(input: CreateTaskInput): Task {
    this.ctx.requirements.get(input.requirementId);
    const task = this.ctx.tasks.create(input);
    this.ctx.emitter.emit('task.created', task);
    return task;
  }

  get(id: string): Task {
    return this.ctx.tasks.get(id);
  }

  listByRequirement(requirementId: string): Task[] {
    return this.ctx.tasks.listByRequirement(requirementId);
  }

  listRecent(limit = 5): Task[] {
    return this.ctx.tasks.listRecent(limit);
  }

  update(id: string, patch: UpdateTaskInput): Task {
    const task = this.ctx.tasks.update(id, patch);
    this.ctx.emitter.emit('task.updated', task);
    return task;
  }

  delete(id: string): void {
    this.ctx.tasks.delete(id);
    const settings = this.ctx.settings.get();
    if (settings.activeTaskId === id) {
      this.ctx.settings.update({ activeTaskId: null });
    }
    this.ctx.emitter.emit('task.deleted', { id });
  }

  resolveActiveTask(): Task | null {
    const settings = this.ctx.settings.get();
    if (settings.activeTaskId) {
      try {
        return this.ctx.tasks.get(settings.activeTaskId);
      } catch {
        /* pinned task deleted; fall through */
      }
    }
    const [active] = this.ctx.tasks.listRecentInProgress(1);
    return active ?? null;
  }

  setActiveTask(id: string | null): Task | null {
    if (id) this.ctx.tasks.get(id);
    const updated = this.ctx.settings.update({ activeTaskId: id });
    this.ctx.emitter.emit('settings.updated', updated);
    return id ? this.ctx.tasks.get(id) : null;
  }

  touch(id: string): Task {
    return this.ctx.tasks.update(id, { updatedAt: now() });
  }
}
