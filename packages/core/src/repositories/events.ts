import { eq, desc } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { agentEvents } from '../db/schema.js';
import type { AgentEvent, AgentEventType } from '../types.js';
import { newId, now } from '../util.js';

export interface EventInput {
  taskId: string;
  sessionId: string;
  type: AgentEventType;
  payload?: Record<string, unknown>;
  createdAt?: string;
}

export class AgentEventRepository {
  constructor(private db: DB) {}

  insertMany(inputs: EventInput[]): AgentEvent[] {
    const rows: AgentEvent[] = inputs.map((i) => ({
      id: newId('evt'),
      taskId: i.taskId,
      sessionId: i.sessionId,
      type: i.type,
      payload: i.payload ?? {},
      createdAt: i.createdAt ?? now(),
    }));
    const stmt = this.db.insert(agentEvents);
    for (const row of rows) stmt.values(row).run();
    return rows;
  }

  listByTask(taskId: string, limit = 100): AgentEvent[] {
    return this.db
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.taskId, taskId))
      .orderBy(desc(agentEvents.createdAt))
      .limit(limit)
      .all() as AgentEvent[];
  }

  listBySession(sessionId: string, limit = 200): AgentEvent[] {
    return this.db
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.sessionId, sessionId))
      .orderBy(desc(agentEvents.createdAt))
      .limit(limit)
      .all() as AgentEvent[];
  }
}
