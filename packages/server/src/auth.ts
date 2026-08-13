import type { FastifyReply, FastifyRequest } from 'fastify';

export function extractToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const q = req.query as Record<string, unknown> | undefined;
  if (typeof q?.token === 'string') return q.token;
  return null;
}

export function makeAuthGuard(token: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const provided = extractToken(req);
    if (!provided || provided !== token) {
      reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }
  };
}
