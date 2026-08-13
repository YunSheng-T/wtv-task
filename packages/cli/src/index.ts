#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { WtvTaskClient } from '@wtv-task/sdk';

const BASE_URL = process.env.WTV_TASK_URL ?? 'http://127.0.0.1:47821';

function fail(message: string, code = 1): never {
  console.error(`wtv-task: ${message}`);
  process.exit(code);
}

async function main(): Promise<void> {
  const [command, sub, ...rest] = process.argv.slice(2);

  if (!command || command === '-h' || command === '--help' || command === 'help') {
    printHelp();
    return;
  }

  let client: WtvTaskClient;
  try {
    client = new WtvTaskClient({ baseUrl: BASE_URL });
  } catch (err) {
    fail(`could not load token: ${(err as Error).message}. Start the wtv-task desktop app.`);
  }

  try {
    switch (command) {
      case 'req':
        await handleReq(client, sub, rest);
        break;
      case 'task':
        await handleTask(client, sub, rest);
        break;
      case 'idea':
        await handleIdea(client, sub, rest);
        break;
      default:
        fail(`unknown command: ${command}`);
    }
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
      fail('could not connect to the wtv-task app. Is it running?');
    }
    fail(msg);
  }
}

function printHelp(): void {
  console.log(`wtv-task — local TODO + agent correction client

Usage:
  wtv-task req list
  wtv-task req add <title>
  wtv-task task list --requirement <id>
  wtv-task task add <title> --requirement <id> [--goal <text>]
  wtv-task task active            # show active task
  wtv-task task active <id>       # pin active task
  wtv-task idea list [--task <id> | --active]
  wtv-task idea add <text> [--task <id> | --active] [--correction]

Environment:
  WTV_TASK_URL   API base URL (default ${BASE_URL})
`);
}

async function resolveTaskId(client: WtvTaskClient, opts: { task?: string; active?: boolean }): Promise<string> {
  if (opts.task) return opts.task;
  if (opts.active) {
    const { task } = await client.getActiveTask();
    if (!task) fail('no active task; start a mounted task or pass --task <id>');
    return task.id;
  }
  fail('pass --task <id> or --active');
}

async function handleReq(client: WtvTaskClient, sub: string | undefined, rest: string[]): Promise<void> {
  if (sub === 'list') {
    const reqs = await client.listRequirements();
    for (const r of reqs) console.log(`${r.id}\t[${r.status}]\t${r.title}`);
    return;
  }
  if (sub === 'add') {
    const { positionals } = parseArgs({ args: rest, options: {}, allowPositionals: true, strict: false });
    const title = positionals.join(' ');
    if (!title) fail('usage: wtv-task req add <title>');
    const req = await client.createRequirement({ title: String(title) });
    console.log(req.id);
    return;
  }
  fail('usage: wtv-task req <list|add>');
}

async function handleTask(client: WtvTaskClient, sub: string | undefined, rest: string[]): Promise<void> {
  if (sub === 'list') {
    const { values } = parseArgs({
      args: rest,
      options: { requirement: { type: 'string' } },
      allowPositionals: true,
    });
    if (!values.requirement) fail('usage: wtv-task task list --requirement <id>');
    const tasks = await client.listTasks(values.requirement as string);
    for (const t of tasks) {
      const mount = t.agentSession ? ` (${t.agentSession.sessionId})` : '';
      console.log(`${t.id}\t[${t.status}]${mount}\t${t.title}`);
    }
    return;
  }
  if (sub === 'add') {
    const { values, positionals } = parseArgs({
      args: rest,
      options: { requirement: { type: 'string' }, goal: { type: 'string' } },
      allowPositionals: true,
      strict: false,
    });
    const title = positionals.join(' ');
    if (!title || !values.requirement) fail('usage: wtv-task task add <title> --requirement <id>');
    const task = await client.createTask({
      requirementId: values.requirement as string,
      title,
      goal: values.goal as string | undefined,
    });
    console.log(task.id);
    return;
  }
  if (sub === 'active') {
    const id = rest[0];
    if (id) {
      const { task } = await client.setActiveTask(id);
      console.log(`${task!.id}\t${task!.title}`);
    } else {
      const { task, recent } = await client.getActiveTask();
      if (task) console.log(`${task.id}\t${task.title}`);
      else {
        console.log('no active task. recent tasks:');
        for (const t of recent) console.log(`${t.id}\t${t.title}`);
      }
    }
    return;
  }
  fail('usage: wtv-task task <list|add|active>');
}

async function handleIdea(client: WtvTaskClient, sub: string | undefined, rest: string[]): Promise<void> {
  if (sub === 'list') {
    const { values } = parseArgs({
      args: rest,
      options: { task: { type: 'string' }, active: { type: 'boolean' } },
      allowPositionals: true,
    });
    const taskId = await resolveTaskId(client, { task: values.task as string | undefined, active: !!values.active });
    const ideas = await client.listIdeas(taskId);
    for (const i of ideas) console.log(`${i.id}\t[${i.kind}/${i.status}]\t${i.content}`);
    return;
  }
  if (sub === 'add') {
    const { values, positionals } = parseArgs({
      args: rest,
      options: {
        task: { type: 'string' },
        active: { type: 'boolean' },
        correction: { type: 'boolean' },
        confirm: { type: 'boolean' },
      },
      allowPositionals: true,
      strict: false,
    });
    const content = positionals.join(' ');
    if (!content) fail('usage: wtv-task idea add <text> [--task <id>|--active] [--correction]');
    const taskId = await resolveTaskId(client, { task: values.task as string | undefined, active: !!values.active });
    const idea = await client.createIdea({
      taskId,
      content,
      kind: values.correction ? 'correction' : 'idea',
      status: values.confirm || values.correction ? 'confirmed' : 'captured',
    });
    console.log(idea.id);
    return;
  }
  fail('usage: wtv-task idea <list|add>');
}

main().catch((err) => fail((err as Error).message));
