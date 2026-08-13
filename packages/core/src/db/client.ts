import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type DB = BetterSQLite3Database<typeof schema>;

const MIGRATION = `
CREATE TABLE IF NOT EXISTS requirements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'backlog',
  priority TEXT NOT NULL DEFAULT 'normal',
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  requirement_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'normal',
  "order" INTEGER NOT NULL DEFAULT 0,
  agent_session TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_requirement_idx ON tasks(requirement_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status);

CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'idea',
  status TEXT NOT NULL DEFAULT 'captured',
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  injected_at TEXT,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS ideas_task_idx ON ideas(task_id);
CREATE INDEX IF NOT EXISTS ideas_status_idx ON ideas(status);

CREATE TABLE IF NOT EXISTS agent_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_task_idx ON agent_events(task_id);
CREATE INDEX IF NOT EXISTS events_session_idx ON agent_events(session_id);

CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  active_task_id TEXT,
  global_shortcut TEXT NOT NULL DEFAULT 'CommandOrControl+Shift+K',
  api_port INTEGER NOT NULL DEFAULT 47821,
  token_hash TEXT
);
INSERT OR IGNORE INTO app_settings (id, active_task_id, global_shortcut, api_port, token_hash)
  VALUES (1, NULL, 'CommandOrControl+Shift+K', 47821, NULL);
`;

export function createDatabase(filename: string): DB {
  const sqlite = new Database(filename);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(MIGRATION);
  return drizzle(sqlite, { schema });
}

export function createInMemoryDatabase(): DB {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(MIGRATION);
  return drizzle(sqlite, { schema });
}

export { schema };
