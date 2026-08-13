import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { App } from '@wtv-task/core';
import { createServer } from './server.js';
import type { FastifyInstance } from 'fastify';

const TOKEN = 'test-token';
let app: App;
let server: FastifyInstance;

beforeEach(async () => {
  app = App.inMemory();
  server = await createServer({ app, token: TOKEN });
  await server.ready();
});
afterEach(async () => {
  await server.close();
});

function auth(headers: Record<string, string> = {}) {
  return { Authorization: `Bearer ${TOKEN}`, ...headers };
}

describe('auth', () => {
  it('rejects requests without a token', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/requirements' });
    expect(res.statusCode).toBe(401);
  });
  it('accepts requests with a bearer token', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/requirements',
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('requirements + tasks flow', () => {
  it('creates a requirement and a task', async () => {
    const reqRes = await server.inject({
      method: 'POST',
      url: '/api/v1/requirements',
      headers: auth({ 'content-type': 'application/json' }),
      payload: { title: 'R1' },
    });
    expect(reqRes.statusCode).toBe(201);
    const req = reqRes.json();
    const taskRes = await server.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: auth({ 'content-type': 'application/json' }),
      payload: { requirementId: req.id, title: 'T1' },
    });
    expect(taskRes.statusCode).toBe(201);
    expect(taskRes.json().status).toBe('pending');
  });
});

describe('corrections pull loop', () => {
  it('pull returns only confirmed and not re-returned after injected', async () => {
    const req = app.requirements.create({ title: 'R' });
    const task = app.tasks.create({ requirementId: req.id, title: 'T' });

    const mount = await server.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/mount`,
      headers: auth({ 'content-type': 'application/json' }),
      payload: { sessionId: 'sess-1', agentType: 'cline', harnessName: 'h' },
    });
    expect(mount.statusCode).toBe(200);

    const idea = app.ideas.create({ taskId: task.id, content: 'fix X' });
    // not confirmed yet -> pull empty
    let pull = await server.inject({
      method: 'POST',
      url: '/api/v1/sessions/sess-1/pull',
      headers: auth(),
    });
    expect(pull.json()).toHaveLength(0);

    app.ideas.confirm(idea.id);
    pull = await server.inject({ method: 'POST', url: '/api/v1/sessions/sess-1/pull', headers: auth() });
    const items = pull.json();
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('confirmed');

    const injected = await server.inject({
      method: 'POST',
      url: '/api/v1/corrections/batch-injected',
      headers: auth({ 'content-type': 'application/json' }),
      payload: { ids: [idea.id] },
    });
    expect(injected.statusCode).toBe(200);
    expect(injected.json().ideas[0].status).toBe('injected');

    pull = await server.inject({ method: 'POST', url: '/api/v1/sessions/sess-1/pull', headers: auth() });
    expect(pull.json()).toHaveLength(0);
  });

  it('prevents deleting a requirement with tasks unless force', async () => {
    const req = app.requirements.create({ title: 'R' });
    app.tasks.create({ requirementId: req.id, title: 'T' });
    const del = await server.inject({
      method: 'DELETE',
      url: `/api/v1/requirements/${req.id}`,
      headers: auth(),
    });
    expect(del.statusCode).toBe(409);
  });
});

describe('events', () => {
  it('records events in batches', async () => {
    const req = app.requirements.create({ title: 'R' });
    const task = app.tasks.create({ requirementId: req.id, title: 'T' });
    app.sessions.mount(task.id, { sessionId: 'sess-1', agentType: 'x', harnessName: 'y' });
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/tasks/${task.id}/events`,
      headers: auth({ 'content-type': 'application/json' }),
      payload: { events: [{ type: 'turn_end' }, { type: 'checkpoint', payload: { n: 1 } }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
  });
});
