import type { FastifyInstance } from 'fastify';
import {
  App,
  DomainError,
  batchInjectedSchema,
  createIdeaSchema,
  createRequirementSchema,
  createTaskSchema,
  mountSessionSchema,
  updateRequirementSchema,
  updateSettingsSchema,
  updateTaskSchema,
  type RecordEventInput,
} from '@wtv-task/core';
import { z } from 'zod';

const eventsBodySchema = z.object({
  events: z
    .array(
      z.object({
        type: z.enum([
          'turn_start',
          'turn_end',
          'tool_call',
          'tool_result',
          'yield',
          'checkpoint',
          'message',
        ]),
        payload: z.record(z.string(), z.unknown()).default({}),
        createdAt: z.string().datetime().optional(),
      }),
    )
    .min(1),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  return schema.parse(value);
}

export function registerRoutes(server: FastifyInstance, app: App): void {
  server.setErrorHandler((err, _req, reply) => {
    if (err instanceof DomainError) {
      reply.code(err.statusCode).send({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof z.ZodError) {
      reply.code(400).send({ error: 'Validation failed', code: 'VALIDATION', issues: err.issues });
      return;
    }
    server.log.error(err);
    reply.code(500).send({ error: 'Internal error', code: 'INTERNAL' });
  });

  // ---- health ----
  server.get('/health', async () => ({ ok: true }));

  // ---- requirements ----
  server.get('/api/v1/requirements', async () => app.requirements.list());
  server.post('/api/v1/requirements', async (req, reply) => {
    const input = parse(createRequirementSchema, req.body);
    reply.code(201).send(app.requirements.create(input));
  });
  server.get('/api/v1/requirements/:id', async (req) =>
    app.requirements.get((req.params as { id: string }).id),
  );
  server.patch('/api/v1/requirements/:id', async (req) => {
    const { id } = req.params as { id: string };
    return app.requirements.update(id, parse(updateRequirementSchema, req.body));
  });
  server.delete('/api/v1/requirements/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const force = (req.query as { force?: string }).force === 'true';
    app.requirements.delete(id, force);
    reply.code(204).send();
  });

  // ---- tasks ----
  server.get('/api/v1/requirements/:id/tasks', async (req) =>
    app.tasks.listByRequirement((req.params as { id: string }).id),
  );
  server.post('/api/v1/tasks', async (req, reply) => {
    const input = parse(createTaskSchema, req.body);
    reply.code(201).send(app.tasks.create(input));
  });
  server.get('/api/v1/tasks/active', async () => {
    const task = app.tasks.resolveActiveTask();
    return { task, recent: task ? [] : app.tasks.listRecent(5) };
  });
  server.put('/api/v1/tasks/active', async (req) => {
    const body = parse(z.object({ id: z.string().nullable() }), req.body);
    const task = app.tasks.setActiveTask(body.id);
    return { task };
  });
  server.get('/api/v1/tasks/recent', async () => app.tasks.listRecent(10));
  server.get('/api/v1/tasks/:id', async (req) => app.tasks.get((req.params as { id: string }).id));
  server.patch('/api/v1/tasks/:id', async (req) => {
    const { id } = req.params as { id: string };
    return app.tasks.update(id, parse(updateTaskSchema, req.body));
  });
  server.delete('/api/v1/tasks/:id', async (req, reply) => {
    app.tasks.delete((req.params as { id: string }).id);
    reply.code(204).send();
  });

  // ---- session lifecycle ----
  server.post('/api/v1/tasks/:id/mount', async (req) => {
    const { id } = req.params as { id: string };
    return app.sessions.mount(id, parse(mountSessionSchema, req.body));
  });
  server.post('/api/v1/tasks/:id/unmount', async (req) => {
    const { id } = req.params as { id: string };
    return app.sessions.unmount(id);
  });
  server.post('/api/v1/tasks/:id/complete', async (req) => {
    const { id } = req.params as { id: string };
    const force = (req.query as { force?: string }).force === 'true';
    return app.sessions.complete(id, force);
  });
  server.post('/api/v1/tasks/:id/events', async (req) => {
    const { id } = req.params as { id: string };
    const task = app.tasks.get(id);
    if (!task.agentSession) throw new DomainError('Task has no mounted session', 'NO_SESSION', 409);
    const { events } = parse(eventsBodySchema, req.body);
    return app.sessions.recordEvents({ sessionId: task.agentSession.sessionId, events });
  });
  server.get('/api/v1/tasks/:id/events', async (req) => {
    const { id } = req.params as { id: string };
    return app.ctx.events.listByTask(id);
  });

  // ---- ideas / corrections ----
  server.get('/api/v1/tasks/:id/ideas', async (req) =>
    app.ideas.listByTask((req.params as { id: string }).id),
  );
  server.post('/api/v1/ideas', async (req, reply) => {
    reply.code(201).send(app.ideas.create(parse(createIdeaSchema, req.body)));
  });
  server.get('/api/v1/ideas/:id', async (req) => app.ideas.get((req.params as { id: string }).id));
  server.post('/api/v1/ideas/:id/confirm', async (req) =>
    app.ideas.confirm((req.params as { id: string }).id),
  );
  server.post('/api/v1/ideas/:id/injected', async (req) => {
    const [idea] = app.ideas.markInjected([(req.params as { id: string }).id]);
    return idea;
  });
  server.post('/api/v1/ideas/:id/resolve', async (req) =>
    app.ideas.resolve((req.params as { id: string }).id),
  );
  server.post('/api/v1/ideas/:id/dismiss', async (req) =>
    app.ideas.dismiss((req.params as { id: string }).id),
  );
  server.post('/api/v1/corrections/batch-injected', async (req) => {
    const { ids } = parse(batchInjectedSchema, req.body);
    return { ideas: app.ideas.markInjected(ids) };
  });

  // ---- session-scoped endpoints for harness ----
  server.post('/api/v1/sessions/:sessionId/pull', async (req) =>
    app.sessions.pullConfirmedCorrections((req.params as { sessionId: string }).sessionId),
  );
  server.post('/api/v1/sessions/:sessionId/events', async (req) => {
    const { sessionId } = req.params as { sessionId: string };
    const { events } = parse(eventsBodySchema, req.body);
    const input: RecordEventInput = { sessionId, events };
    return app.sessions.recordEvents(input);
  });

  // ---- settings ----
  server.get('/api/v1/settings', async () => app.ctx.settings.get());
  server.patch('/api/v1/settings', async (req) => {
    const patch = parse(updateSettingsSchema, req.body);
    const updated = app.ctx.settings.update(patch);
    app.emitter.emit('settings.updated', updated);
    return updated;
  });
}
