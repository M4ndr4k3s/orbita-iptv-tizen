// Backup da configuração: listas cadastradas e ajustes, num JSON gravado no pendrive
// (ou na pasta Downloads da TV). O arquivo contém senhas das contas Xtream em texto:
// a tela avisa antes de exportar. O PIN parental não entra no backup.
// Na importação tudo é revalidado como se viesse do formulário.

import { validateSource, REFRESH_OPTIONS, type SourceInput, type ValidSource, type Source } from '../playlist/source';
import type { Settings } from '../storage/settings';

export const BACKUP_FILE = 'orbita-backup.json';
export const BACKUP_MAX_BYTES = 1024 * 1024;
const MAX_SOURCES = 50;

/** Ajustes que vão no backup, com os valores aceitos (string livre = null). */
const SETTING_RULES: { [K in keyof Settings]?: Array<string | boolean> | null } = {
  language: ['pt-BR', 'en', 'es'],
  livePreview: [true, false],
  askSourceOnStart: [true, false],
  aspect: ['auto', 'fill', '16:9', '4:3'],
  buffer: ['normal', 'large'],
  liveFormat: ['ts', 'm3u8'],
  audioLang: null,
  subLang: null,
  theme: ['black', 'cinema', 'navy'],
};

export interface BackupData {
  sources: ValidSource[];
  settings: Partial<Settings>;
}

export type BackupError = 'tooBig' | 'notJson' | 'notBackup' | 'newerVersion' | 'empty';

export function buildBackup(sources: Source[], s: Readonly<Settings>, now = Date.now()): string {
  const settingsOut: Record<string, unknown> = {};
  for (const k of Object.keys(SETTING_RULES) as Array<keyof Settings>) settingsOut[k] = s[k];
  return JSON.stringify(
    {
      app: 'orbita',
      type: 'backup',
      version: 1,
      createdAt: new Date(now).toISOString(),
      settings: settingsOut,
      sources: sources.map((x) => ({
        kind: x.kind,
        name: x.name,
        url: x.url,
        server: x.server,
        username: x.username,
        password: x.password,
        epgUrl: x.epgUrl,
        refreshHours: x.refreshHours,
      })),
    },
    null,
    1,
  );
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function parseBackup(text: string): { ok: true; value: BackupData; skipped: number } | { ok: false; error: BackupError } {
  if (typeof text !== 'string' || text.length > BACKUP_MAX_BYTES) return { ok: false, error: 'tooBig' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'notJson' };
  }
  const o = raw as Record<string, unknown>;
  if (!o || typeof o !== 'object' || o.app !== 'orbita' || o.type !== 'backup' || typeof o.version !== 'number') return { ok: false, error: 'notBackup' };
  if (o.version > 1) return { ok: false, error: 'newerVersion' };

  const sources: ValidSource[] = [];
  let skipped = 0;
  const list = Array.isArray(o.sources) ? o.sources.slice(0, MAX_SOURCES) : [];
  for (const item of list) {
    const r = (item || {}) as Record<string, unknown>;
    const kind = r.kind === 'xtream' ? 'xtream' : r.kind === 'm3u' ? 'm3u' : null;
    const hours = typeof r.refreshHours === 'number' && REFRESH_OPTIONS.indexOf(r.refreshHours) >= 0 ? r.refreshHours : 24;
    if (!kind) {
      skipped++;
      continue;
    }
    const input: SourceInput = {
      kind,
      name: str(r.name),
      url: str(r.url),
      server: str(r.server),
      username: str(r.username),
      password: str(r.password),
      epgUrl: str(r.epgUrl),
      refreshHours: hours,
    };
    const v = validateSource(input);
    if (v.ok) sources.push(v.value);
    else skipped++;
  }

  const settingsIn: Record<string, unknown> = {};
  const so = (o.settings && typeof o.settings === 'object' ? o.settings : {}) as Record<string, unknown>;
  for (const k of Object.keys(SETTING_RULES) as Array<keyof Settings>) {
    const rule = SETTING_RULES[k];
    const v = so[k];
    if (rule === null) {
      if (typeof v === 'string' && v.length <= 12 && /^[A-Za-z-]*$/.test(v)) settingsIn[k] = v;
    } else if (rule && rule.indexOf(v as string | boolean) >= 0) settingsIn[k] = v;
  }
  if (!sources.length && !Object.keys(settingsIn).length) return { ok: false, error: 'empty' };
  return { ok: true, value: { sources, settings: settingsIn as Partial<Settings> }, skipped };
}

// ── arquivo na TV (tizen.filesystem) ──

interface TizenFileHandle {
  writeString(s: string): number;
  readString(count?: number): string;
  close(): void;
}

interface TizenFs {
  openFile(path: string, mode: 'r' | 'w'): TizenFileHandle;
  pathExists(path: string): boolean;
  listStorages(ok: (s: Array<{ label: string; type: string; state: string }>) => void, err?: (e: Error) => void): void;
}

function fs(): TizenFs | null {
  const tz = window.tizen as unknown as { filesystem?: TizenFs } | undefined;
  return tz && tz.filesystem ? tz.filesystem : null;
}

/** Pendrives montados primeiro, depois a pasta Downloads da TV. */
export async function backupLocations(): Promise<string[]> {
  const f = fs();
  if (!f) return [];
  const usb = await new Promise<string[]>((resolve) => {
    try {
      f.listStorages(
        (list) => resolve(list.filter((s) => s.type === 'EXTERNAL' && s.state === 'MOUNTED').map((s) => s.label)),
        () => resolve([]),
      );
    } catch {
      resolve([]);
    }
  });
  return usb.concat('downloads');
}

export async function writeBackup(text: string): Promise<string> {
  const f = fs();
  if (!f) throw new Error('unavailable');
  const root = (await backupLocations())[0];
  const path = root + '/' + BACKUP_FILE;
  const h = f.openFile(path, 'w');
  try {
    h.writeString(text);
  } finally {
    h.close();
  }
  return path;
}

/** Primeiro backup encontrado (pendrive antes da TV), ou null. */
export async function findBackup(): Promise<{ path: string; text: string } | null> {
  const f = fs();
  if (!f) throw new Error('unavailable');
  for (const root of await backupLocations()) {
    const path = root + '/' + BACKUP_FILE;
    let exists = false;
    try {
      exists = f.pathExists(path);
    } catch {
      exists = false;
    }
    if (!exists) continue;
    const h = f.openFile(path, 'r');
    try {
      return { path, text: h.readString(BACKUP_MAX_BYTES + 1) };
    } finally {
      h.close();
    }
  }
  return null;
}
