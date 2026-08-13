import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const CONFIG_DIR = join(homedir(), '.wtv-task');
export const TOKEN_PATH = join(CONFIG_DIR, 'token');

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function loadOrCreateToken(): string {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  if (existsSync(TOKEN_PATH)) {
    return readFileSync(TOKEN_PATH, 'utf8').trim();
  }
  const token = randomBytes(32).toString('hex');
  writeFileSync(TOKEN_PATH, token, { mode: 0o600 });
  chmodSync(TOKEN_PATH, 0o600);
  return token;
}
