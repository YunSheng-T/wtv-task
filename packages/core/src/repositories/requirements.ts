import { eq, like, desc, asc } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { requirements } from '../db/schema.js';
import type { Requirement, RequirementStatus } from '../types.js';
import { newId, now } from '../util.js';
import { NotFoundError } from '../errors.js';

export interface CreateReq {
  title: string;
  description?: string;
  priority?: Requirement['priority'];
  tags?: string[];
  status?: RequirementStatus;
}

export class RequirementRepository {
  constructor(private db: DB) {}

  create(input: CreateReq): Requirement {
    const ts = now();
    const row: Requirement = {
      id: newId('req'),
      title: input.title,
      description: input.description ?? '',
      status: input.status ?? 'backlog',
      priority: input.priority ?? 'normal',
      tags: input.tags ?? [],
      createdAt: ts,
      updatedAt: ts,
    };
    this.db.insert(requirements).values(row).run();
    return row;
  }

  get(id: string): Requirement {
    const row = this.db.select().from(requirements).where(eq(requirements.id, id)).get();
    if (!row) throw new NotFoundError('Requirement', id);
    return row as Requirement;
  }

  list(filter?: { status?: RequirementStatus; query?: string }): Requirement[] {
    let q = this.db.select().from(requirements);
    const rows = q.all() as Requirement[];
    return rows
      .filter((r) => (filter?.status ? r.status === filter.status : true))
      .filter((r) => (filter?.query ? r.title.toLowerCase().includes(filter.query!.toLowerCase()) : true))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  update(id: string, patch: Partial<Omit<Requirement, 'id' | 'createdAt'>>): Requirement {
    this.get(id);
    const next = { ...patch, updatedAt: now() };
    this.db.update(requirements).set(next).where(eq(requirements.id, id)).run();
    return this.get(id);
  }

  delete(id: string): void {
    this.get(id);
    this.db.delete(requirements).where(eq(requirements.id, id)).run();
  }
}
