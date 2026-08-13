import { createDatabase, createInMemoryDatabase, type DB } from './db/client.js';
import { DataContext } from './context.js';
import { RequirementService } from './services/requirements.js';
import { TaskService } from './services/tasks.js';
import { IdeaService } from './services/ideas.js';
import { AgentSessionService } from './services/sessions.js';

export class App {
  readonly ctx: DataContext;
  readonly requirements: RequirementService;
  readonly tasks: TaskService;
  readonly ideas: IdeaService;
  readonly sessions: AgentSessionService;

  constructor(db: DB) {
    this.ctx = new DataContext(db);
    this.requirements = new RequirementService(this.ctx);
    this.tasks = new TaskService(this.ctx);
    this.ideas = new IdeaService(this.ctx);
    this.sessions = new AgentSessionService(this.ctx);
  }

  static fromFile(filename: string): App {
    return new App(createDatabase(filename));
  }

  static inMemory(): App {
    return new App(createInMemoryDatabase());
  }

  get emitter() {
    return this.ctx.emitter;
  }

  close(): void {
    const anyDb = this.ctx.db as unknown as { $client?: { close?: () => void } };
    anyDb.$client?.close?.();
  }
}
