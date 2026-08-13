import type { DB } from './db/client.js';
import { EventEmitter } from './events.js';
import { RequirementRepository } from './repositories/requirements.js';
import { TaskRepository } from './repositories/tasks.js';
import { IdeaRepository } from './repositories/ideas.js';
import { AgentEventRepository } from './repositories/events.js';
import { SettingsRepository } from './repositories/settings.js';
import type {
  AgentEvent,
  AgentSession,
  AppSettings,
  Idea,
  Requirement,
  Task,
} from './types.js';

export interface DomainEvents {
  'requirement.created': Requirement;
  'requirement.updated': Requirement;
  'requirement.deleted': { id: string };
  'task.created': Task;
  'task.updated': Task;
  'task.deleted': { id: string };
  'idea.created': Idea;
  'idea.updated': Idea;
  'correction.confirmed': Idea;
  'correction.injected': Idea[];
  'correction.resolved': Idea;
  'session.mounted': { task: Task; session: AgentSession };
  'session.unmounted': { taskId: string; sessionId: string };
  'events.recorded': AgentEvent[];
  'settings.updated': AppSettings;
}

export class DataContext {
  readonly requirements: RequirementRepository;
  readonly tasks: TaskRepository;
  readonly ideas: IdeaRepository;
  readonly events: AgentEventRepository;
  readonly settings: SettingsRepository;
  readonly emitter = new EventEmitter<DomainEvents>();

  constructor(readonly db: DB) {
    this.requirements = new RequirementRepository(db);
    this.tasks = new TaskRepository(db);
    this.ideas = new IdeaRepository(db);
    this.events = new AgentEventRepository(db);
    this.settings = new SettingsRepository(db);
  }
}
