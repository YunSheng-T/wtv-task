import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { App } from '@wtv-task/core';
import { createServer } from '@wtv-task/server';
import { WtvTaskClient, createHarnessIntegration } from './index.js';

const TOKEN = 'sdk-token';

function makeInjectFetch(server: Awaited<ReturnType<typeof createServer>>): typeof fetch {
  return (async (input: any, init: any = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const res = await server.inject({
      method: (init.method ?? 'GET').toUpperCase(),
      url: new URL(url, 'http://local').pathname + new URL(url, 'http://local').search,
      headers: init.headers ?? {},
      payload: init.body ? JSON.parse(init.body as string) : undefined,
    });
    return new Response(res.payload, {
      status: res.statusCode,
      headers: res.headers as Record<string, string>,
    });
  }) as typeof fetch;
}

describe('WtvTaskClient (in-process transport)', () => {
  let app: App;
  let server: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    app = App.inMemory();
    server = await createServer({ app, token: TOKEN });
    await server.ready();
  });
  afterEach(async () => {
    await server.close();
  });

  it('mounts, pulls confirmed corrections, marks injected, and resolves', async () => {
    const client = new WtvTaskClient({ baseUrl: 'http://local', token: TOKEN, fetchImpl: makeInjectFetch(server) });
    const req = await client.createRequirement({ title: 'R' });
    const task = await client.createTask({ requirementId: req.id, title: 'T' });
    await client.mountTask(task.id, { sessionId: 's-1', agentType: 'pi', harnessName: 'h' });

    expect(await client.pullCorrections('s-1')).toHaveLength(0);
    const idea = await client.createIdea({ taskId: task.id, content: 'use DI' });
    await client.confirmIdea(idea.id);
    const pulled = await client.pullCorrections('s-1');
    expect(pulled).toHaveLength(1);
    const res = await client.markInjected([idea.id]);
    expect(res.ideas[0].status).toBe('injected');
    expect(await client.pullCorrections('s-1')).toHaveLength(0);
    const resolved = await client.resolveIdea(idea.id);
    expect(resolved.status).toBe('resolved');
    client.close();
  });

  it('createHarnessIntegration tracks session and pulls a message', async () => {
    const integration = createHarnessIntegration({
      name: 'pi-harness',
      agentType: 'pi',
      realtime: false,
      baseUrl: 'http://local',
      token: TOKEN,
      fetchImpl: makeInjectFetch(server),
    });
    const req = await integration.client.createRequirement({ title: 'R' });
    const task = await integration.client.createTask({ requirementId: req.id, title: 'T' });
    await integration.mountTask(task.id, 's-3');
    const idea = await integration.client.createIdea({ taskId: task.id, content: 'correct this' });
    await integration.client.confirmIdea(idea.id);
    const message = await integration.pullCorrectionMessage();
    expect(message?.role).toBe('user');
    expect(message?.content).toContain('待纠正项');
    const items = await integration.pullCorrections();
    await integration.markInjected(items.map((i) => i.id));
    integration.close();
  });
});
