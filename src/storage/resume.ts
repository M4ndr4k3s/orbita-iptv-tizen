// Onde o usuário parou em cada filme/episódio. Pequeno (até MAX itens), então
// fica no localStorage; mais antigos saem primeiro.

import type { SettingsBackend } from './settings';

/**
 * O mínimo para mostrar o item em "Continuar assistindo" e abrir de novo:
 * sem URL nem credenciais (a URL é montada com a fonte na hora de tocar).
 */
export interface ResumeCard {
  /** id da fonte */
  s: string;
  /** filme ou episódio de série */
  k: 'movie' | 'episode';
  /** stream_id (filme) ou id do episódio no Xtream */
  x: number;
  /** título (série: nome da série) */
  n: string;
  /** subtítulo (série: T1E2 · nome do episódio) */
  d?: string;
  /** cartaz */
  l?: string;
  /** extensão do arquivo */
  e?: string;
  /** episódio: id da série (Xtream) — o carrossel mostra a série uma vez só */
  p?: number;
}

export interface ResumePoint {
  pos: number;
  dur: number;
  at: number;
  c?: ResumeCard;
}

const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : undefined);

/** Valida um cartão lido do localStorage (dado do aparelho, mas pode estar corrompido). */
export function checkCard(v: unknown): ResumeCard | undefined {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return undefined;
  const s = str(o.s, 100);
  const n = str(o.n, 200);
  if (!s || !n || (o.k !== 'movie' && o.k !== 'episode') || typeof o.x !== 'number' || !isFinite(o.x)) return undefined;
  const c: ResumeCard = { s, k: o.k, x: Math.floor(o.x), n };
  const d = str(o.d, 200);
  if (d) c.d = d;
  const l = str(o.l, 1000);
  if (l && /^https?:\/\//i.test(l)) c.l = l;
  const e = str(o.e, 5);
  if (e && /^[a-z0-9]+$/i.test(e)) c.e = e;
  if (typeof o.p === 'number' && isFinite(o.p)) c.p = Math.floor(o.p);
  return c;
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
          if (p && typeof p.pos === 'number' && typeof p.dur === 'number' && typeof p.at === 'number') {
            const c = checkCard(p.c);
            this.map[k] = c ? { pos: p.pos, dur: p.dur, at: p.at, c } : { pos: p.pos, dur: p.dur, at: p.at };
          }
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

  save(key: string, pos: number, dur: number, now = Date.now(), card?: ResumeCard): void {
    if (pos < MIN_MS || (dur > 0 && pos > dur - END_MARGIN_MS)) delete this.map[key];
    else {
      const c = card || (this.map[key] && this.map[key].c);
      this.map[key] = c ? { pos: Math.floor(pos), dur: Math.floor(dur), at: now, c } : { pos: Math.floor(pos), dur: Math.floor(dur), at: now };
    }
    const keys = Object.keys(this.map);
    if (keys.length > MAX) {
      keys.sort((a, b) => this.map[a].at - this.map[b].at);
      for (const k of keys.slice(0, keys.length - MAX)) delete this.map[k];
    }
    this.persist();
  }

  /** "Continuar assistindo" de uma fonte: mais recentes primeiro. */
  watching(sourceId: string, limit = 20): Array<{ key: string; pos: number; dur: number; card: ResumeCard }> {
    const out: Array<{ key: string; pos: number; dur: number; at: number; card: ResumeCard }> = [];
    for (const k of Object.keys(this.map)) {
      const p = this.map[k];
      if (p.c && p.c.s === sourceId && this.get(k) > 0) out.push({ key: k, pos: p.pos, dur: p.dur, at: p.at, card: p.c });
    }
    out.sort((a, b) => b.at - a.at);
    // série: só o episódio visto por último (vários episódios = um cartão da série)
    const seen = new Set<string>();
    const uniq = out.filter((w) => {
      const id = w.card.k === 'episode' && w.card.p != null ? 's' + w.card.p : w.key;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return uniq.slice(0, limit).map(({ key, pos, dur, card }) => ({ key, pos, dur, card }));
  }

  /** Apaga todos os pontos de retomada ("apagar histórico"). */
  clear(): void {
    this.map = {};
    this.persist();
  }

  private persist(): void {
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
