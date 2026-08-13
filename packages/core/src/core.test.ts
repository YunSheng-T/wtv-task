import { describe, it, expect, beforeEach } from 'vitest';
import { App } from './app.js';
import { StateError, ConflictError } from './errors.js';

let app: App;
beforeEach(() => {
  app = App.inMemory();
});

function seed() {
  const req = app.requirements.create({ title: 'R1' });
  const task = app.tasks.create({ requirementId: req.id, title: 'T1' });
  return { req, task };
}

describe('Idea state machine', () => {
  it('runs captured -> confirmed -> injected -> resolved', () => {
    const { task } = seed();
    const idea = app.ideas.create({ taskId: task.id, content: 'fix this' });
    expect(idea.status).toBe('captured');
    const confirmed = app.ideas.confirm(idea.id);
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.kind).toBe('correction');
    const [injected] = app.ideas.markInjected([idea.id]);
    expect(injected.status).toBe('injected');
    const resolved = app.ideas.resolve(idea.id);
    expect(resolved.status).toBe('resolved');
  });

  it('rejects captured -> injected directly', () => {
    const { task } = seed();
    const idea = app.ideas.create({ taskId: task.id, content: 'x' });
    expect(() => app.ideas.resolve(idea.id)).toThrow(StateError);
  });

  it('allows dismiss from any active state', () => {
    const { task } = seed();
    const a = app.ideas.create({ taskId: task.id, content: 'a' });
    const b = app.ideas.create({ taskId: task.id, content: 'b' });
    app.ideas.confirm(b.id);
    expect(app.ideas.dismiss(a.id).status).toBe('dismissed');
    expect(app.ideas.dismiss(b.id).status).toBe('dismissed');
  });

  it('marks injected idempotently', () => {
    const { task } = seed();
    const idea = app.ideas.create({ taskId: task.id, content: 'x' });
    app.ideas.confirm(idea.id);
    app.ideas.markInjected([idea.id]);
    const [again] = app.ideas.markInjected([idea.id]);
    expect(again.status).toBe('injected');
  });

  it('can create a directly-confirmed correction', () => {
    const { task } = seed();
    const idea = app.ideas.create({ taskId: task.id, content: 'x', kind: 'correction', status: 'confirmed' });
    expect(idea.status).toBe('confirmed');
    expect(idea.confirmedAt).toBeTruthy();
  });
});

describe('Agent sessions', () => {
  it('mounts a session, sets active task, and pulls confirmed corrections', () => {
    const { task } = seed();
    app.sessions.mount(task.id, { sessionId: 's1', agentType: 'cline', harnessName: 'test' });
    expect(app.tasks.resolveActiveTask()?.id).toBe(task.id);
    const idea = app.ideas.create({ taskId: task.id, content: 'c1' });
    app.ideas.confirm(idea.id);
    const pulled = app.sessions.pullConfirmedCorrections('s1');
    expect(pulled).toHaveLength(1);
    const injected = app.sessions.markInjected([idea.id]);
    expect(injected[0].status).toBe('injected');
    // second pull returns nothing
    expect(app.sessions.pullConfirmedCorrections('s1')).toHaveLength(0);
  });

  it('rejects double mount without force', () => {
    const { task } = seed();
    app.sessions.mount(task.id, { sessionId: 's1', agentType: 'x', harnessName: 'y' });
    expect(() =>
      app.sessions.mount(task.id, { sessionId: 's2', agentType: 'x', harnessName: 'y' }),
    ).toThrow(ConflictError);
    app.sessions.mount(task.id, { sessionId: 's2', agentType: 'x', harnessName: 'y', force: true });
  });

  it('records events against the mounted session', () => {
    const { task } = seed();
    app.sessions.mount(task.id, { sessionId: 's1', agentType: 'x', harnessName: 'y' });
    const events = app.sessions.recordEvents({
      sessionId: 's1',
      events: [{ type: 'turn_end', payload: { ok: true } }],
    });
    expect(events).toHaveLength(1);
  });

  it('blocks completing a task with unresolved corrections unless force', () => {
    const { task } = seed();
    app.sessions.mount(task.id, { sessionId: 's1', agentType: 'x', harnessName: 'y' });
    const idea = app.ideas.create({ taskId: task.id, content: 'x' });
    app.ideas.confirm(idea.id);
    expect(() => app.sessions.complete(task.id)).toThrow(ConflictError);
    const done = app.sessions.complete(task.id, true);
    expect(done.status).toBe('done');
  });
});

describe('Active task resolution', () => {
  it('falls back to most recent in_progress task with a session', () => {
    const { task } = seed();
    expect(app.tasks.resolveActiveTask()).toBeNull();
    app.sessions.mount(task.id, { sessionId: 's1', agentType: 'x', harnessName: 'y' });
    app.tasks.setActiveTask(null);
    expect(app.tasks.resolveActiveTask()?.id).toBe(task.id);
  });
});

describe('Requirements', () => {
  it('prevents deleting a requirement that has tasks unless force', () => {
    const { req, task } = seed();
    expect(() => app.requirements.delete(req.id)).toThrow(ConflictError);
    app.requirements.delete(req.id, true);
    expect(() => app.tasks.get(task.id)).toThrow();
  });
});
