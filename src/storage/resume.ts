// Onde o usuário parou em cada filme/episódio. Pequeno (até MAX itens), então
// fica no localStorage; mais antigos saem primeiro.

import type { SettingsBackend } from './settings';

export interface ResumePoint {
  pos: number;
  dur: number;
  at: number;
}

const KEY = 'orbita.resume.v1';
const MAX = 300;
// perto do fim conta como assistido: não oferece "continuar"
const END_MARGIN_MS = 90000;
const MIN_MS = 60000;

export class ResumeStore {
  private map: Record<string, ResumePoint> = {};

  constructor(private backend: SettingsBackend | null) {
    try {
      const raw = backend ? backend.getItem(KEY) : null;
      const v = raw ? JSON.parse(raw) : null;
      if (v && typeof v === 'object') {
        for (const k of Object.keys(v)) {
          const p = v[k];
          if (p && typeof p.pos === 'number' && typeof p.dur === 'number' && typeof p.at === 'number') this.map[k] = p;
        }
      }
    } catch {
      this.map = {};
    }
  }

  /** Posição para retomar, ou 0 se não há (ou está no começo/fim). */
  get(key: string): number {
    const p = this.map[key];
    if (!p || p.pos < MIN_MS || (p.dur > 0 && p.pos > p.dur - END_MARGIN_MS)) return 0;
    return p.pos;
  }

  save(key: string, pos: number, dur: number, now = Date.now()): void {
    if (pos < MIN_MS || (dur > 0 && pos > dur - END_MARGIN_MS)) delete this.map[key];
    else this.map[key] = { pos: Math.floor(pos), dur: Math.floor(dur), at: now };
    const keys = Object.keys(this.map);
    if (keys.length > MAX) {
      keys.sort((a, b) => this.map[a].at - this.map[b].at);
      for (const k of keys.slice(0, keys.length - MAX)) delete this.map[k];
    }
    try {
      if (this.backend) this.backend.setItem(KEY, JSON.stringify(this.map));
    } catch {
      /* cota cheia: mantém em memória */
    }
  }
}

/** Chave de retomada de um filme/episódio (não muda entre importações). */
export function resumeKey(src: { id: string }, kind: string, item: { xid?: number; url?: string }): string {
  return src.id + '|' + kind + ':' + (item.xid != null ? item.xid : item.url || '');
}

function localBackend(): SettingsBackend | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const resume = typeof window !== 'undefined' ? new ResumeStore(localBackend()) : new ResumeStore(null);
