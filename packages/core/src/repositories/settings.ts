import { eq } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { appSettings } from '../db/schema.js';
import type { AppSettings } from '../types.js';

const DEFAULTS: AppSettings = {
  activeTaskId: null,
  globalShortcut: 'CommandOrControl+Shift+K',
  apiPort: 47821,
  tokenHash: null,
};

export class SettingsRepository {
  constructor(private db: DB) {}

  get(): AppSettings {
    const row = this.db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
    return { ...DEFAULTS, ...(row ?? {}) } as AppSettings;
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.db.update(appSettings).set(patch).where(eq(appSettings.id, 1)).run();
    return this.get();
  }
}
