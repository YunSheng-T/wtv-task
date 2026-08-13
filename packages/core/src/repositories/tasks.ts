import { eq, and, desc, isNotNull, sql } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { tasks } from '../db/schema.js';
import type { Task, TaskStatus } from '../types.js';
import { newId, now } from '../util.js';
import { NotFoundError } from '../errors.js';

export interface CreateTask {
  requirementId: string;
  title: string;
  goal?: string;
  priority?: Task['priority'];
  status?: TaskStatus;
}

export class TaskRepository {
  constructor(private db: DB) {}

  create(input: CreateTask): Task {
    const ts = now();
    const orderRow = this.db
      .select({ max: sql<number>`coalesce(max("order"), -1)` })
      .from(tasks)
      .where(eq(tasks.requirementId, input.requirementId))
      .get();
    const row: Task = {
      id: newId('task'),
      requirementId: input.requirementId,
      title: input.title,
      goal: input.goal ?? '',
      status: input.status ?? 'pending',
      priority: input.priority ?? 'normal',
      order: (orderRow?.max ?? -1) + 1,
      agentSession: null,
      createdAt: ts,
      updatedAt: ts,
    };
    this.db.insert(tasks).values(row).run();
    return row;
  }

  get(id: string): Task {
    const row = this.db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (!row) throw new NotFoundError('Task', id);
    return row as Task;
  }

  listByRequirement(requirementId: string): Task[] {
    return this.db
      .select()
      .from(tasks)
      .where(eq(tasks.requirementId, requirementId))
      .all() as Task[];
  }

  listByStatus(status: TaskStatus): Task[] {
    return this.db.select().from(tasks).where(eq(tasks.status, status)).all() as Task[];
  }

  listRecentInProgress(limit = 10): Task[] {
    return this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.status, 'in_progress'), isNotNull(tasks.agentSession)))
      .orderBy(desc(tasks.updatedAt))
      .limit(limit)
      .all() as Task[];
  }

  listRecent(limit = 5): Task[] {
    return this.db.select().from(tasks).orderBy(desc(tasks.updatedAt)).limit(limit).all() as Task[];
  }


  findBySessionId(sessionId: string): Task | undefined {
    return (this.db.select().from(tasks).all() as Task[]).find(
      (t) => t.agentSession?.sessionId === sessionId,
    );
  }

  update(id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>): Task {
    this.get(id);
    const next = { ...patch, updatedAt: now() };
    this.db.update(tasks).set(next).where(eq(tasks.id, id)).run();
    return this.get(id);
  }

  delete(id: string): void {
    this.get(id);
    this.db.delete(tasks).where(eq(tasks.id, id)).run();
  }
}

