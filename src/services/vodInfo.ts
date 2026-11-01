// Detalhes de filmes e séries do Xtream (get_vod_info / get_series_info), pedidos
// só quando o usuário para num item. Resposta de terceiros: tudo é validado,
// cortado em tamanho e exibido como texto (nunca HTML).

import { fetchJson } from '../utils/net';
import { apiUrl, type XtreamCreds } from './xtreamApi';
import { clip, safeImageUrl } from '../playlist/model';

export interface VodDetails {
  plot?: string;
  genre?: string;
  cast?: string;
  director?: string;
  year?: string;
  /** duração em segundos */
  durationSec?: number;
  rating?: number;
  poster?: string;
}

export interface Episode {
  id: number;
  season: number;
  num: number;
  title: string;
  ext?: string;
  plot?: string;
  durationSec?: number;
  image?: string;
}

export interface SeriesDetails extends VodDetails {
  seasons: number[];
  episodes: Episode[];
}

const INFO_MAX = 2 * 1024 * 1024;
const SERIES_MAX = 8 * 1024 * 1024;
const MAX_EPISODES = 3000;
const TEXT = { plot: 1200, short: 200, title: 200 };

const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const s = clip(String(v).replace(/\s+/g, ' ').trim(), max);
  return s || undefined;
};
const int = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return isFinite(n) ? Math.floor(n) : null;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** "01:32:10", "92 min" ou segundos → segundos. */
function durationOf(info: Record<string, unknown>): number | undefined {
  const secs = int(info.duration_secs);
  if (secs && secs > 0) return secs;
  const d = typeof info.duration === 'string' ? info.duration : '';
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(d.trim());
  if (m) return m[3] ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2];
  const min = /(\d+)\s*min/i.exec(d);
  return min ? +min[1] * 60 : undefined;
}

function details(info: Record<string, unknown>): VodDetails {
  const r = typeof info.rating === 'number' ? info.rating : Number(info.rating);
  const date = str(info.releasedate || info.releaseDate || info.release_date || info.year, 20);
  const y = date ? /(\d{4})/.exec(date) : null;
  const poster = safeImageUrl(str(info.movie_image || info.cover_big || info.cover, 2048));
  const out: VodDetails = {
    plot: str(info.plot || info.description, TEXT.plot),
    genre: str(info.genre, TEXT.short),
    cast: str(info.cast || info.actors, TEXT.short),
    director: str(info.director, TEXT.short),
    year: y ? y[1] : undefined,
    durationSec: durationOf(info),
    rating: isFinite(r) && r > 0 && r <= 10 ? Math.round(r * 10) / 10 : undefined,
  };
  if (poster) out.poster = poster;
  return out;
}

export function parseVodInfo(json: unknown): VodDetails {
  return details(obj(obj(json).info));
}

export function parseSeriesInfo(json: unknown): SeriesDetails {
  const root = obj(json);
  const base = details(obj(root.info));
  const episodes: Episode[] = [];
  // episodes: { "1": [ ... ], "2": [ ... ] } (alguns servidores mandam lista)
  const raw = root.episodes;
  const groups: unknown[] = Array.isArray(raw) ? raw : Object.keys(obj(raw)).map((k) => obj(raw)[k]);
  for (const g of groups) {
    for (const e of Array.isArray(g) ? g : []) {
      if (episodes.length >= MAX_EPISODES) break;
      const o = obj(e);
      const id = int(o.id);
      if (id == null || id < 0) continue;
      const info = obj(o.info);
      const ext = typeof o.container_extension === 'string' && /^[a-z0-9]{1,5}$/i.test(o.container_extension) ? o.container_extension.toLowerCase() : undefined;
      const ep: Episode = {
        id,
        season: Math.max(0, int(o.season) || 0),
        num: Math.max(0, int(o.episode_num) || 0),
        title: str(o.title, TEXT.title) || String(id),
        ext,
        plot: str(info.plot, TEXT.plot),
        durationSec: durationOf(info),
      };
      const img = safeImageUrl(str(info.movie_image, 2048));
      if (img) ep.image = img;
      episodes.push(ep);
    }
  }
  episodes.sort((a, b) => a.season - b.season || a.num - b.num);
  const seasons = Array.from(new Set(episodes.map((e) => e.season)));
  return { ...base, seasons, episodes };
}

// cache curto: voltar para o mesmo item não baixa de novo
const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit) return hit as Promise<T>;
  if (cache.size > 100) cache.clear();
  const p = load();
  cache.set(key, p);
  // falha não fica no cache (tenta de novo da próxima vez)
  p.catch(() => cache.delete(key));
  return p;
}

export function getVodInfo(c: XtreamCreds, vodId: number): Promise<VodDetails> {
  return cached('v:' + c.server + ':' + vodId, async () =>
    parseVodInfo(await fetchJson<unknown>(apiUrl(c, { action: 'get_vod_info', vod_id: String(vodId) }), INFO_MAX, { timeoutMs: 15000 })),
  );
}

export function getSeriesInfo(c: XtreamCreds, seriesId: number): Promise<SeriesDetails> {
  return cached('s:' + c.server + ':' + seriesId, async () =>
    parseSeriesInfo(await fetchJson<unknown>(apiUrl(c, { action: 'get_series_info', series_id: String(seriesId) }), SERIES_MAX, { timeoutMs: 20000 })),
  );
}

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? h + ' h ' + (m < 10 ? '0' : '') + m + ' min' : m + ' min';
}

export function fmtTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = s % 60;
  const two = (n: number) => (n < 10 ? '0' : '') + n;
  return (h ? h + ':' + two(m) : String(m)) + ':' + two(x);
}
