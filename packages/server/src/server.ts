import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { App, type DomainEvents } from '@wtv-task/core';
import { registerRoutes } from './routes.js';
import { WSHub } from './ws.js';
import { makeAuthGuard } from './auth.js';

export interface CreateServerOptions {
  app: App;
  token: string;
  logger?: boolean;
}

export async function createServer({ app, token, logger = false }: CreateServerOptions): Promise<FastifyInstance> {
  const server = Fastify({ logger });
  await server.register(websocket);

  const guard = makeAuthGuard(token);
  server.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/api/') && req.url !== '/health') {
      await guard(req, reply);
    }
  });

  const hub = new WSHub(app);
  hub.register(server, token);
  registerRoutes(server, app);

  return server;
}

export interface StartServerOptions extends CreateServerOptions {
  port: number;
  host?: string;
}

export async function startServer(opts: StartServerOptions): Promise<FastifyInstance> {
  const server = await createServer(opts);
  await server.listen({ port: opts.port, host: opts.host ?? '127.0.0.1' });
  return server;
}

export type { DomainEvents };
