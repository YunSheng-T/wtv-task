import type { FastifyInstance } from 'fastify';
import type { App } from '@wtv-task/core';
import type { RawData, WebSocket } from 'ws';
import { hashToken } from './token.js';

interface Client {
  socket: WebSocket;
  sessions: Set<string>;
}

export class WSHub {
  private clients = new Set<Client>();

  constructor(private app: App) {
    app.emitter.on('correction.confirmed', (idea) => {
      const task = app.tasks.get(idea.taskId);
      const sessionId = task.agentSession?.sessionId;
      if (sessionId) this.send(sessionId, { type: 'correction.confirmed', idea });
    });
    app.emitter.on('correction.injected', (ideas) => {
      this.broadcast({ type: 'correction.injected', ideas });
    });
    app.emitter.on('task.updated', (task) => {
      if (task.agentSession) {
        this.send(task.agentSession.sessionId, { type: 'task.updated', task });
      }
    });
    app.emitter.on('session.unmounted', (payload) => {
      this.send(payload.sessionId, { type: 'session.unmounted', ...payload });
    });
  }

  register(app: FastifyInstance, token: string): void {
    app.get('/ws', { websocket: true }, (socket, req) => {
      const provided =
        (req.query as Record<string, string> | undefined)?.token ??
        (req.headers['sec-websocket-protocol'] as string | undefined);
      if (provided !== token) {
        socket.close(4401, 'unauthorized');
        return;
      }
      const client: Client = { socket, sessions: new Set() };
      this.clients.add(client);
      const initialSession = (req.query as Record<string, string> | undefined)?.sessionId;
      if (initialSession) client.sessions.add(initialSession);

      socket.on('message', (raw: RawData) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'subscribe' && typeof msg.sessionId === 'string') {
            client.sessions.add(msg.sessionId);
          } else if (msg.type === 'unsubscribe' && typeof msg.sessionId === 'string') {
            client.sessions.delete(msg.sessionId);
          } else if (msg.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong' }));
          }
        } catch {
          /* ignore malformed frames */
        }
      });
      socket.on('close', () => this.clients.delete(client));
      socket.send(JSON.stringify({ type: 'ready', tokenHash: hashToken(token).slice(0, 8) }));
    });
  }

  private send(sessionId: string, message: unknown): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.sessions.has(sessionId)) client.socket.send(data);
    }
  }

  private broadcast(message: unknown): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) client.socket.send(data);
  }
}
