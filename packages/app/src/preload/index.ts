import { contextBridge, ipcRenderer } from 'electron';
import type { Api } from '../shared/ipc.js';

const invoke = (channel: string, payload?: unknown) => ipcRenderer.invoke(channel, payload);

const api: Api = {
  listRequirements: () => invoke('requirements:list'),
  createRequirement: (input) => invoke('requirements:create', input),
  updateRequirement: (id, patch) => invoke('requirements:update', { id, patch }),
  deleteRequirement: (id, force) => invoke('requirements:delete', { id, force }),

  listTasks: (requirementId) => invoke('tasks:list', requirementId),
  createTask: (input) => invoke('tasks:create', input),
  updateTask: (id, patch) => invoke('tasks:update', { id, patch }),
  deleteTask: (id) => invoke('tasks:delete', id),
  getTask: (id) => invoke('tasks:get', id),
  getActiveTask: () => invoke('tasks:active:get'),
  setActiveTask: (id) => invoke('tasks:active:set', id),

  listIdeas: (taskId) => invoke('ideas:list', taskId),
  createIdea: (input) => invoke('ideas:create', input),
  confirmIdea: (id) => invoke('ideas:confirm', id),
  markIdeaInjected: (id) => invoke('ideas:injected', id),
  resolveIdea: (id) => invoke('ideas:resolve', id),
  dismissIdea: (id) => invoke('ideas:dismiss', id),

  mountSession: (taskId, input) => invoke('sessions:mount', { taskId, input }),
  unmountSession: (taskId) => invoke('sessions:unmount', taskId),
  completeTask: (taskId, force) => invoke('sessions:complete', { taskId, force }),
  listEvents: (taskId) => invoke('events:list', taskId),

  getSettings: () => invoke('settings:get'),
  updateSettings: (patch) => invoke('settings:update', patch),

  quickCapture: (input) => invoke('quick-capture', input),
  closeQuickCapture: () => invoke('quick-capture:close'),
  onEvent: (cb) => {
    const listener = (_: unknown, event: { type: string; payload: unknown }) => cb(event);
    ipcRenderer.on('app:event', listener);
    return () => ipcRenderer.removeListener('app:event', listener);
  },
};

contextBridge.exposeInMainWorld('api', api);
