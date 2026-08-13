import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const requirements = sqliteTable('requirements', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('backlog'),
  priority: text('priority').notNull().default('normal'),
  tags: text('tags', { mode: 'json' }).notNull().$type<string[]>().default([]),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    requirementId: text('requirement_id')
      .notNull()
      .references(() => requirements.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    goal: text('goal').notNull().default(''),
    status: text('status').notNull().default('pending'),
    priority: text('priority').notNull().default('normal'),
    order: integer('order').notNull().default(0),
    agentSession: text('agent_session', { mode: 'json' }).$type<{
      sessionId: string;
      agentType: string;
      harnessName: string;
      status: string;
      mountedAt: string;
      lastActiveAt: string;
    } | null>(),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => ({
    reqIdx: index('tasks_requirement_idx').on(t.requirementId),
    statusIdx: index('tasks_status_idx').on(t.status),
  }),
);

export const ideas = sqliteTable(
  'ideas',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    kind: text('kind').notNull().default('idea'),
    status: text('status').notNull().default('captured'),
    source: text('source').notNull().default('manual'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    confirmedAt: text('confirmed_at'),
    injectedAt: text('injected_at'),
    resolvedAt: text('resolved_at'),
  },
  (t) => ({ taskIdx: index('ideas_task_idx').on(t.taskId), statusIdx: index('ideas_status_idx').on(t.status) }),
);

export const agentEvents = sqliteTable(
  'agent_events',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    type: text('type').notNull(),
    payload: text('payload', { mode: 'json' }).notNull().$type<Record<string, unknown>>().default({}),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => ({
    taskIdx: index('events_task_idx').on(t.taskId),
    sessionIdx: index('events_session_idx').on(t.sessionId),
  }),
);

export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  activeTaskId: text('active_task_id'),
  globalShortcut: text('global_shortcut').notNull().default('CommandOrControl+Shift+K'),
  apiPort: integer('api_port').notNull().default(47821),
  tokenHash: text('token_hash'),
});
