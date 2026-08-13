import type { DataContext } from '../context.js';
import type { CreateIdeaInput } from '../validation.js';
import { StateError } from '../errors.js';
import { now } from '../util.js';
import type { Idea } from '../types.js';

const FORWARD: Record<string, string[]> = {
  captured: ['confirmed', 'dismissed'],
  confirmed: ['injected', 'dismissed'],
  injected: ['resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
};

function assertTransition(from: Idea['status'], to: Idea['status']): void {
  if (from === to) return;
  const allowed = FORWARD[from] ?? [];
  if (!allowed.includes(to)) {
    throw new StateError(`Cannot transition idea from ${from} to ${to}`);
  }
}

export class IdeaService {
  constructor(private ctx: DataContext) {}

  create(input: CreateIdeaInput): Idea {
    this.ctx.tasks.get(input.taskId);
    const idea = this.ctx.ideas.create(input);
    this.ctx.emitter.emit('idea.created', idea);
    if (idea.status === 'confirmed') this.ctx.emitter.emit('correction.confirmed', idea);
    return idea;
  }

  get(id: string): Idea {
    return this.ctx.ideas.get(id);
  }

  listByTask(taskId: string): Idea[] {
    return this.ctx.ideas.listByTask(taskId);
  }

  confirm(id: string): Idea {
    const idea = this.ctx.ideas.get(id);
    assertTransition(idea.status, 'confirmed');
    if (idea.status === 'confirmed') return idea;
    const updated = this.ctx.ideas.update(id, {
      status: 'confirmed',
      kind: 'correction',
      confirmedAt: idea.confirmedAt ?? now(),
    });
    this.ctx.emitter.emit('idea.updated', updated);
    this.ctx.emitter.emit('correction.confirmed', updated);
    return updated;
  }

  markInjected(ids: string[]): Idea[] {
    const affected: Idea[] = [];
    for (const id of ids) {
      const idea = this.ctx.ideas.get(id);
      if (idea.status === 'injected' || idea.status === 'resolved') {
        if (idea.status === 'injected') affected.push(idea);
        continue;
      }
      assertTransition(idea.status, 'injected');
      const updated = this.ctx.ideas.update(id, {
        status: 'injected',
        injectedAt: now(),
        confirmedAt: idea.confirmedAt ?? now(),
      });
      affected.push(updated);
      this.ctx.emitter.emit('idea.updated', updated);
    }
    if (affected.length) this.ctx.emitter.emit('correction.injected', affected);
    return affected;
  }

  resolve(id: string): Idea {
    const idea = this.ctx.ideas.get(id);
    assertTransition(idea.status, 'resolved');
    if (idea.status === 'resolved') return idea;
    const updated = this.ctx.ideas.update(id, {
      status: 'resolved',
      resolvedAt: now(),
      injectedAt: idea.injectedAt ?? now(),
      confirmedAt: idea.confirmedAt ?? now(),
    });
    this.ctx.emitter.emit('idea.updated', updated);
    this.ctx.emitter.emit('correction.resolved', updated);
    return updated;
  }

  dismiss(id: string): Idea {
    const idea = this.ctx.ideas.get(id);
    if (idea.status === 'dismissed') return idea;
    const updated = this.ctx.ideas.update(id, { status: 'dismissed' });
    this.ctx.emitter.emit('idea.updated', updated);
    return updated;
  }
}
