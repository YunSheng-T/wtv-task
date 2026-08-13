import { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage, nativeTheme } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { App as CoreApp, CreateIdeaInput } from '@wtv-task/core';
import { startServer, loadOrCreateToken, hashToken } from '@wtv-task/server';
import type { QuickCaptureInput } from '../shared/ipc.js';

let core: CoreApp;
let server: { close(): Promise<unknown> } | null = null;
let mainWindow: BrowserWindow | null = null;
let quickCaptureWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function preloadPath(): string {
  return join(__dirname, '../preload/index.cjs');
}

function rendererUrl(page: 'main' | 'quick-capture'): string {
  if (process.env['ELECTRON_RENDERER_URL']) {
    return `${process.env['ELECTRON_RENDERER_URL']}/${page === 'main' ? 'index.html' : 'quick-capture.html'}`;
  }
  return pathToFileURL(join(__dirname, `../renderer/${page === 'main' ? 'index.html' : 'quick-capture.html'}`)).href;
}

async function loadInto(win: BrowserWindow, page: 'main' | 'quick-capture'): Promise<void> {
  const url = rendererUrl(page);
  try {
    if (process.env['ELECTRON_RENDERER_URL']) {
      await win.loadURL(url);
    } else {
      await win.loadFile(join(__dirname, `../renderer/${page === 'main' ? 'index.html' : 'quick-capture.html'}`));
    }
  } catch (err) {
    console.error(`[wtv-task] failed to load ${page}, retrying once:`, err);
    await new Promise((r) => setTimeout(r, 120));
    if (process.env['ELECTRON_RENDERER_URL']) await win.loadURL(url);
    else await win.loadFile(join(__dirname, `../renderer/${page === 'main' ? 'index.html' : 'quick-capture.html'}`));
  }
}

// Liquid glass is a dark material on every platform:
// - macOS:  NSVisualEffectView via `vibrancy` (+ hiddenInset traffic lights)
// - Win11:  `backgroundMaterial: 'mica'` (+ titleBarOverlay window controls)
// - Win10 / Linux: solid dark fallback; the CSS base layer keeps the look.
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

const glassWindowOptions = {
  mac: {
    titleBarStyle: 'hiddenInset' as const,
    vibrancy: 'fullscreen-ui' as const,
    visualEffectState: 'active' as const,
    backgroundColor: '#00000000',
  },
  win: {
    titleBarStyle: 'hidden' as const,
    titleBarOverlay: { color: '#00000000', symbolColor: '#ffffff', height: 44 },
    backgroundMaterial: 'mica' as const,
    backgroundColor: '#141218',
  },
  other: {
    backgroundColor: '#141218',
  },
};

function platformChrome() {
  if (IS_MAC) return glassWindowOptions.mac;
  if (IS_WIN) return glassWindowOptions.win;
  return glassWindowOptions.other;
}

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    title: 'wtv-task',
    ...platformChrome(),
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await loadInto(mainWindow, 'main');
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function showQuickCapture(): Promise<void> {
  if (quickCaptureWindow) {
    quickCaptureWindow.show();
    quickCaptureWindow.focus();
    return;
  }
  const { screen } = await import('electron');
  const display = screen.getPrimaryDisplay();
  const { width: dw } = display.workArea;
  quickCaptureWindow = new BrowserWindow({
    width: 660,
    height: 200,
    x: Math.round((dw - 660) / 2),
    y: 96,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    roundedCorners: true,
    show: false,
    ...(IS_MAC
      ? { vibrancy: 'fullscreen-ui' as const, visualEffectState: 'active' as const, backgroundColor: '#00000000' }
      : IS_WIN
        ? { backgroundMaterial: 'acrylic' as const, backgroundColor: '#141218' }
        : { backgroundColor: '#141218' }),
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  quickCaptureWindow.on('blur', () => {
    // Defer so opening the task Select / interacting inside the window doesn't hide it.
    setTimeout(() => {
      if (!quickCaptureWindow || quickCaptureWindow.isDestroyed()) return;
      if (quickCaptureWindow.isFocused()) return;
      quickCaptureWindow.hide();
    }, 180);
  });
  quickCaptureWindow.on('closed', () => {
    quickCaptureWindow = null;
  });
  await loadInto(quickCaptureWindow, 'quick-capture');
  quickCaptureWindow.show();
  quickCaptureWindow.focus();
  console.log('[wtv-task] quick-capture shown');
}

function broadcast(event: { type: string; payload: unknown }): void {
  for (const win of [mainWindow, quickCaptureWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send('app:event', event);
  }
}

function updateBadge(): void {
  const count = core.ctx.ideas.countAllUnresolved();
  if (process.platform === 'darwin') {
    app.dock.setBadge(count > 0 ? String(count) : '');
  }
  if (tray) {
    tray.setTitle(count > 0 ? String(count) : '');
    tray.setToolTip(count > 0 ? `${count} unresolved corrections` : 'wtv-task');
  }
}

function registerIpc(): void {
  ipcMain.handle('requirements:list', () => core.requirements.list());
  ipcMain.handle('requirements:create', (_e, input) => core.requirements.create(input));
  ipcMain.handle('requirements:update', (_e, { id, patch }) => core.requirements.update(id, patch));
  ipcMain.handle('requirements:delete', (_e, { id, force }) => core.requirements.delete(id, force));

  ipcMain.handle('tasks:list', (_e, requirementId: string) => core.tasks.listByRequirement(requirementId));
  ipcMain.handle('tasks:create', (_e, input) => core.tasks.create(input));
  ipcMain.handle('tasks:update', (_e, { id, patch }) => core.tasks.update(id, patch));
  ipcMain.handle('tasks:delete', (_e, id: string) => core.tasks.delete(id));
  ipcMain.handle('tasks:get', (_e, id: string) => core.tasks.get(id));
  ipcMain.handle('tasks:active:get', () => ({
    task: core.tasks.resolveActiveTask(),
    recent: core.tasks.listRecent(5),
  }));
  ipcMain.handle('tasks:active:set', (_e, id: string | null) => ({ task: core.tasks.setActiveTask(id) }));

  ipcMain.handle('ideas:list', (_e, taskId: string) => core.ideas.listByTask(taskId));
  ipcMain.handle('ideas:create', (_e, input: CreateIdeaInput) => core.ideas.create(input));
  ipcMain.handle('ideas:confirm', (_e, id: string) => core.ideas.confirm(id));
  ipcMain.handle('ideas:injected', (_e, id: string) => {
    const [idea] = core.ideas.markInjected([id]);
    return idea;
  });
  ipcMain.handle('ideas:resolve', (_e, id: string) => core.ideas.resolve(id));
  ipcMain.handle('ideas:dismiss', (_e, id: string) => core.ideas.dismiss(id));

  ipcMain.handle('sessions:mount', (_e, { taskId, input }) => core.sessions.mount(taskId, input));
  ipcMain.handle('sessions:unmount', (_e, taskId: string) => core.sessions.unmount(taskId));
  ipcMain.handle('sessions:complete', (_e, { taskId, force }) => core.sessions.complete(taskId, force));
  ipcMain.handle('events:list', (_e, taskId: string) => core.ctx.events.listByTask(taskId));

  ipcMain.handle('settings:get', () => core.ctx.settings.get());
  ipcMain.handle('settings:update', (_e, patch) => {
    const updated = core.ctx.settings.update(patch);
    core.emitter.emit('settings.updated', updated);
    return updated;
  });

  ipcMain.handle('quick-capture', async (_e, input: QuickCaptureInput) => {
    let taskId = input.taskId;
    if (!taskId) {
      const active = core.tasks.resolveActiveTask();
      if (active) taskId = active.id;
    }
    if (!taskId) throw new Error('No active task to attach the idea to; pick one in the app.');
    const idea = core.ideas.create({
      taskId,
      content: input.content,
      kind: input.correction ? 'correction' : 'idea',
      status: input.correction ? 'confirmed' : 'captured',
    });
    if (input.correction) core.emitter.emit('correction.confirmed', idea);
    return idea;
  });
  ipcMain.handle('quick-capture:close', () => {
    quickCaptureWindow?.hide();
  });
}

function registerDomainForwarding(): void {
  const forward = (type: string) => (payload: unknown) => {
    broadcast({ type, payload });
    updateBadge();
  };
  core.emitter.on('idea.created', forward('idea.created'));
  core.emitter.on('idea.updated', forward('idea.updated'));
  core.emitter.on('correction.confirmed', forward('correction.confirmed'));
  core.emitter.on('correction.injected', forward('correction.injected'));
  core.emitter.on('correction.resolved', forward('correction.resolved'));
  core.emitter.on('task.updated', forward('task.updated'));
  core.emitter.on('task.created', forward('task.created'));
  core.emitter.on('requirement.created', forward('requirement.created'));
  core.emitter.on('requirement.updated', forward('requirement.updated'));
  core.emitter.on('events.recorded', forward('events.recorded'));
}

function createTray(): void {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open wtv-task', click: () => mainWindow?.show() },
      { label: 'Quick capture', click: () => showQuickCapture() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );
}

app.whenReady().then(async () => {
  try {
    // Liquid glass is a dark material — force dark appearance so the
    // vibrancy layer renders dark regardless of the system theme.
    nativeTheme.themeSource = 'dark';

    const dbPath = join(app.getPath('userData'), 'wtv-task.db');
    core = CoreApp.fromFile(dbPath);

    const settings = core.ctx.settings.get();
    const token = loadOrCreateToken();
    core.ctx.settings.update({ tokenHash: hashToken(token) });

    try {
      server = await startServer({ app: core, token, port: settings.apiPort, host: '127.0.0.1' });
      console.log(`[wtv-task] API listening on http://127.0.0.1:${settings.apiPort}`);
    } catch (err) {
      console.error('[wtv-task] failed to start local API; harness integration unavailable:', err);
    }

    registerIpc();
    registerDomainForwarding();
    createTray();
    updateBadge();

    await createMainWindow();

    const registered = globalShortcut.register(settings.globalShortcut, () => {
      showQuickCapture().catch((err) => console.error('quick capture failed', err));
    });
    if (!registered) console.error('[wtv-task] failed to register shortcut', settings.globalShortcut);
    else console.log('[wtv-task] shortcut registered:', settings.globalShortcut);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  } catch (err) {
    console.error('[wtv-task] fatal startup error:', err);
    const { dialog } = await import('electron');
    dialog.showErrorBox(
      'wtv-task failed to start',
      err instanceof Error ? err.message : String(err),
    );
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  server?.close().catch(() => {});
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
