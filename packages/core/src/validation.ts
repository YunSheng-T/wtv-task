import { z } from 'zod';
import {
  AGENT_EVENT_TYPES,
  IDEA_KINDS,
  IDEA_SOURCES,
  IDEA_STATUSES,
  REQUIREMENT_STATUSES,
  TASK_STATUSES,
} from './types.js';

export const prioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

export const createRequirementSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(20000).default(''),
  priority: prioritySchema.default('normal'),
  tags: z.array(z.string().max(100)).default([]),
  status: z.enum(REQUIREMENT_STATUSES).default('backlog'),
});
export type CreateRequirementInput = z.input<typeof createRequirementSchema>;

export const updateRequirementSchema = createRequirementSchema.partial();
export type UpdateRequirementInput = z.input<typeof updateRequirementSchema>;

export const createTaskSchema = z.object({
  requirementId: z.string().min(1),
  title: z.string().min(1).max(500),
  goal: z.string().max(20000).default(''),
  priority: prioritySchema.default('normal'),
  status: z.enum(TASK_STATUSES).default('pending'),
});
export type CreateTaskInput = z.input<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  goal: z.string().max(20000).optional(),
  priority: prioritySchema.optional(),
  status: z.enum(TASK_STATUSES).optional(),
  order: z.number().int().optional(),
});
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;

export const createIdeaSchema = z.object({
  taskId: z.string().min(1),
  content: z.string().min(1).max(20000),
  kind: z.enum(IDEA_KINDS).default('idea'),
  source: z.enum(IDEA_SOURCES).default('manual'),
  status: z.enum(IDEA_STATUSES).default('captured'),
});
export type CreateIdeaInput = z.input<typeof createIdeaSchema>;

export const mountSessionSchema = z.object({
  sessionId: z.string().min(1),
  agentType: z.string().min(1).default('unknown'),
  harnessName: z.string().min(1).default('unknown'),
  force: z.boolean().default(false),
});
export type MountSessionInput = z.input<typeof mountSessionSchema>;

export const recordEventSchema = z.object({
  sessionId: z.string().min(1),
  events: z
    .array(
      z.object({
        type: z.enum(AGENT_EVENT_TYPES),
        payload: z.record(z.string(), z.unknown()).default({}),
        createdAt: z.string().datetime().optional(),
      }),
    )
    .min(1),
});
export type RecordEventInput = z.input<typeof recordEventSchema>;

export const batchInjectedSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  sessionId: z.string().optional(),
});
export type BatchInjectedInput = z.input<typeof batchInjectedSchema>;

export const updateSettingsSchema = z.object({
  activeTaskId: z.string().nullable().optional(),
  globalShortcut: z.string().min(1).optional(),
  apiPort: z.number().int().min(1).max(65535).optional(),
});

export type UpdateSettingsInput = z.input<typeof updateSettingsSchema>;
