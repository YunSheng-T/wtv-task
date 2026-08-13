import { formatCorrectionsAsMessage, type AgentEventType, type Idea, type Task } from '@wtv-task/core';
import { WtvTaskClient, type ClientOptions, type MountInput } from './client.js';

export interface HarnessOptions extends ClientOptions {
  name: string;
  agentType?: string;
  realtime?: boolean;
}

export interface HarnessIntegration {
  client: WtvTaskClient;
  mountTask(taskId: string, sessionId: string, opts?: Partial<MountInput>): Promise<Task>;
  unmountTask(taskId: string): Promise<Task>;
  completeTask(taskId: string, force?: boolean): Promise<Task>;
  emitEvent(type: AgentEventType, payload?: Record<string, unknown>): Promise<void>;
  pullCorrections(): Promise<Idea[]>;
  pullCorrectionMessage(): Promise<{ role: 'user'; content: string } | null>;
  markInjected(ids: string[]): Promise<Idea[]>;
  onCorrectionConfirmed(cb: (idea: Idea) => void): () => void;
  close(): void;
  readonly sessionId: string | null;
  readonly taskId: string | null;
}

export function createHarnessIntegration(opts: HarnessOptions): HarnessIntegration {
  const client = new WtvTaskClient(opts);
  let taskId: string | null = null;
  let sessionId: string | null = null;

  return {
    client,
    get sessionId() {
      return sessionId;
    },
    get taskId() {
      return taskId;
    },
    async mountTask(tId, sId, extra) {
      const task = await client.mountTask(tId, {
        sessionId: sId,
        agentType: opts.agentType ?? 'unknown',
        harnessName: opts.name,
        ...extra,
      });
      taskId = tId;
      sessionId = sId;
      if (opts.realtime !== false) client.connect(sId);
      return task;
    },
    async unmountTask(tId) {
      const task = await client.unmountTask(tId);
      taskId = null;
      sessionId = null;
      return task;
    },
    async completeTask(tId, force) {
      return client.completeTask(tId, force);
    },
    async emitEvent(type, payload) {
      if (!taskId) throw new Error('No mounted task; call mountTask first');
      await client.recordEvents(taskId, [{ type, payload }]);
    },
    async pullCorrections() {
      if (!sessionId) throw new Error('No mounted session; call mountTask first');
      return client.pullCorrections(sessionId);
    },
    async pullCorrectionMessage() {
      const items = await this.pullCorrections();
      return formatCorrectionsAsMessage(items);
    },
    async markInjected(ids) {
      const res = await client.markInjected(ids);
      return res.ideas;
    },
    onCorrectionConfirmed(cb) {
      return client.on('correction.confirmed', (msg) => cb((msg as { idea: Idea }).idea));
    },
    close() {
      client.close();
    },
  };
}
