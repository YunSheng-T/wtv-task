# wtv-task

Local-first desktop TODO app for **Requirements → Tasks → Ideas/Corrections**, with agent-harness intervention. Tasks can mount an external agent session (Cline/Pi/your own harness); thoughts captured during a conversation become confirmed corrections that are pulled and injected at the next agent safety point, forming a `captured → confirmed → injected → resolved` loop.

## Monorepo

- `packages/core` — domain model, SQLite (better-sqlite3 + Drizzle), services & state machine
- `packages/server` — Fastify HTTP + WebSocket API (bound to `127.0.0.1`, bearer-token auth)
- `packages/sdk` — TypeScript client + `createHarnessIntegration` for agent harnesses
- `packages/cli` — `wtv-task` command-line client
- `packages/app` — Electron + React + Mantine desktop app (main window + global quick-capture)

## Setup

```bash
pnpm install
pnpm -r test     # run core/server/sdk tests (uses Node-ABI native build)
pnpm -r build    # build all packages
```

## Liquid glass UI engine

The renderer implements an Apple-style liquid glass material in three layers:

- `packages/app/src/renderer/src/glass.css` — design tokens (ink, tint, radii, motion) and the
  surface classes. Use `.lens` for static glass panels, `.lens-interactive` for hoverable/pressable
  ones, `.lens-selected` for selection, `.glass-btn` / `.accent-btn` for buttons, `.glass-input`
  for form fields, and `.row` / `.row-selected` for text-first list items (glass only on
  hover/selection).
- `packages/app/src/renderer/src/liquidGlass.ts` — true refraction. A rounded-rect SDF +
  smoothstep displacement field (center magnifies, rim bends) is rendered to a canvas, encoded as
  an RGBA map (R = horizontal shift, G = vertical), and fed to an SVG `feDisplacementMap`
  referenced from `backdrop-filter: url(#id)`. Maps are cached per element size (LRU, 30 max) and
  kept in sync via `ResizeObserver` + `MutationObserver`. If `url()` backdrop filters are
  unsupported it rolls back to the plain CSS blur automatically.
- `packages/app/src/renderer/src/specular.ts` — pointer-tracked specular highlight. Writes
  `--mx` / `--my` custom properties on the hovered `.lens` / `.glass-btn` / `.accent-btn` so the
  sheen follows the cursor; rAF-throttled.

To enable both on any window, import and call once at entry:

```ts
import { attachSpecularTracking } from './specular.js';
import { attachLiquidGlass } from './liquidGlass.js';

attachSpecularTracking();
attachLiquidGlass();
```

The main process pins the material to dark (`nativeTheme.themeSource = 'dark'`, main window
`vibrancy: 'fullscreen-ui'`, quick-capture `vibrancy: 'hud'`), so the glass renders consistently
regardless of the system appearance or wallpaper.


## Run the desktop app

```bash
pnpm --filter @wtv-task/app dev      # rebuilds native module for Electron, then electron-vite dev
# or build + start:
pnpm -r build
pnpm --filter @wtv-task/app start
```

The app:
- stores data in Electron `userData/wtv-task.db`
- serves the API on `http://127.0.0.1:47821`
- writes the harness token to `~/.wtv-task/token` (0600)
- registers a global quick-capture shortcut (default `Cmd/Ctrl+Shift+K`)
- shows an unresolved-corrections count on the Dock/tray

## Use the CLI (app must be running)

```bash
node packages/cli/dist/index.js req add "Ship auth"
node packages/cli/dist/index.js task add "Implement login" --requirement <reqId>
node packages/cli/dist/index.js task active <taskId>
node packages/cli/dist/index.js idea add "Avoid coupling to framework X" --active --correction
node packages/cli/dist/index.js idea list --active
```

## Integrate a harness

```ts
import { createHarnessIntegration, formatCorrectionsAsMessage } from '@wtv-task/sdk';

const wt = createHarnessIntegration({ name: 'my-harness', agentType: 'pi' });
await wt.mountTask(taskId, sessionId);

// at each safe point (turn end / await-input / stage boundary):
const items = await wt.pullCorrections();
const msg = formatCorrectionsAsMessage(items); // { role:'user', content:'[待纠正项] ...' }
if (msg) {
  await agent.send(msg);
  await wt.markInjected(items.map(i => i.id));
}
wt.onCorrectionConfirmed((idea) => console.log('new correction queued', idea));
```

WebSocket events (`/ws?token=...&sessionId=...`): `correction.confirmed`, `correction.injected`, `task.updated`, `session.unmounted`.

## Native module ABI note

`better-sqlite3` must match the runtime ABI:
- Tests (Node/Vitest): `pnpm --filter @wtv-task/app rebuild:node`
- Electron: `pnpm --filter @wtv-task/app rebuild:electron` (run automatically by `dev`/`start`)

Switching back and forth between `pnpm test` and running Electron may require the matching rebuild.
