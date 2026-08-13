import type { DataContext } from '../context.js';
import type { CreateRequirementInput, UpdateRequirementInput } from '../validation.js';
import { ConflictError } from '../errors.js';

export class RequirementService {
  constructor(private ctx: DataContext) {}

  create(input: CreateRequirementInput) {
    const req = this.ctx.requirements.create(input);
    this.ctx.emitter.emit('requirement.created', req);
    return req;
  }

  get(id: string) {
    return this.ctx.requirements.get(id);
  }

  list(filter?: { status?: never; query?: string }) {
    return this.ctx.requirements.list(filter);
  }

  update(id: string, patch: UpdateRequirementInput) {
    const req = this.ctx.requirements.update(id, patch);
    this.ctx.emitter.emit('requirement.updated', req);
    return req;
  }

  delete(id: string, force = false): void {
    const tasks = this.ctx.tasks.listByRequirement(id);
    if (tasks.length > 0 && !force) {
      throw new ConflictError(
        `Requirement has ${tasks.length} task(s); pass force=true to delete them too`,
        'REQUIREMENT_HAS_TASKS',
      );
    }
    for (const task of tasks) this.ctx.tasks.delete(task.id);
    this.ctx.requirements.delete(id);
    this.ctx.emitter.emit('requirement.deleted', { id });
  }
}
