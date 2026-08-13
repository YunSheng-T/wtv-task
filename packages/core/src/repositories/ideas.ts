import { eq, and, inArray, desc } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { ideas } from '../db/schema.js';
import type { Idea, IdeaKind, IdeaSource, IdeaStatus } from '../types.js';
import { newId, now } from '../util.js';
import { NotFoundError } from '../errors.js';

export interface CreateIdea {
  taskId: string;
  content: string;
  kind?: IdeaKind;
  source?: IdeaSource;
  status?: IdeaStatus;
}

export class IdeaRepository {
  constructor(private db: DB) {}

  create(input: CreateIdea): Idea {
    const ts = now();
    const status = input.status ?? 'captured';
    const row: Idea = {
      id: newId('idea'),
      taskId: input.taskId,
      content: input.content,
      kind: input.kind ?? 'idea',
      source: input.source ?? 'manual',
      status,
      createdAt: ts,
      confirmedAt: status === 'confirmed' || status === 'injected' || status === 'resolved' ? ts : null,
      injectedAt: status === 'injected' || status === 'resolved' ? ts : null,
      resolvedAt: status === 'resolved' ? ts : null,
    };
    this.db.insert(ideas).values(row).run();
    return row;
  }

  get(id: string): Idea {
    const row = this.db.select().from(ideas).where(eq(ideas.id, id)).get();
    if (!row) throw new NotFoundError('Idea', id);
    return row as Idea;
  }

  listByTask(taskId: string): Idea[] {
    return this.db
      .select()
      .from(ideas)
      .where(eq(ideas.taskId, taskId))
      .orderBy(desc(ideas.createdAt))
      .all() as Idea[];
  }

  listByStatus(status: IdeaStatus, taskId?: string): Idea[] {
    const cond = taskId ? and(eq(ideas.status, status), eq(ideas.taskId, taskId)) : eq(ideas.status, status);
    return this.db.select().from(ideas).where(cond).orderBy(desc(ideas.createdAt)).all() as Idea[];
  }

  listConfirmedByTask(taskId: string): Idea[] {
    return this.db
      .select()
      .from(ideas)
      .where(and(eq(ideas.taskId, taskId), eq(ideas.status, 'confirmed')))
      .orderBy(desc(ideas.createdAt))
      .all() as Idea[];
  }

  update(id: string, patch: Partial<Omit<Idea, 'id' | 'createdAt' | 'taskId'>>): Idea {
    this.get(id);
    this.db.update(ideas).set(patch).where(eq(ideas.id, id)).run();
    return this.get(id);
  }

  markInjected(ids: string[]): number {
    if (ids.length === 0) return 0;
    const ts = now();
    const res = this.db
      .update(ideas)
      .set({ status: 'injected', injectedAt: ts, confirmedAt: ts })
      .where(and(inArray(ideas.id, ids), eq(ideas.status, 'confirmed')))
      .run();
    return res.changes;
  }

  countUnresolvedByTask(taskId: string): number {
    const rows = this.db
      .select()
      .from(ideas)
      .where(and(eq(ideas.taskId, taskId), inArray(ideas.status, ['captured', 'confirmed', 'injected'])))
      .all();
    return rows.length;
  }

  countAllUnresolved(): number {
    const rows = this.db
      .select()
      .from(ideas)
      .where(inArray(ideas.status, ['captured', 'confirmed', 'injected']))
      .all();
    return rows.length;
  }
}
