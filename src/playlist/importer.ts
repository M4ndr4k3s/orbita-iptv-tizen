// Pipeline de importação: entradas (M3U ou Xtream) -> canais normalizados e
// deduplicados -> gravação em lotes no destino (IndexedDB na TV, memória nos testes).

import {
  FIELD_MAX, clip, classifyUrl, pad8, safeImageUrl, searchKey, validStreamUrl,
  type Channel, type Group, type ImportStats, type ItemKind,
} from './model';
import type { M3uEntry } from './m3uParser';

/** Índice de busca dos canais ao vivo: ids e texto normalizado ("nome número"). */
export interface SearchIndex {
  gk: string;
  ids: string[];
  q: string[];
  /** ids de filmes e séries na ordem da lista ("Todos" do VOD sem varrer índice) */
  movies?: string[];
  series?: string[];
  /** texto normalizado de filmes e séries (mesma posição de movies/series) para a busca global */
  movieQ?: string[];
  seriesQ?: string[];
  /** Xtream: ids dos títulos adicionados mais recentemente (tela inicial), do mais novo ao mais velho */
  recentMovies?: string[];
  recentSeries?: string[];
}

/** Quantos "adicionados recentemente" guardar por tipo. */
// 40: depois de tirar as versões repetidas ([LEG], DUB) ainda sobram ~20
export const RECENT_MAX = 40;

/** Mantém os RECENT_MAX maiores `added` (lista ordenada do mais novo ao mais velho). */
export function trackRecent(list: Array<{ id: string; added: number }>, id: string, added: number, max = RECENT_MAX): void {
  if (list.length >= max && added <= list[list.length - 1].added) return;
  let i = list.length;
  while (i > 0 && list[i - 1].added < added) i--;
  list.splice(i, 0, { id, added });
  if (list.length > max) list.pop();
}

export interface ImportSink {
  putChannels(batch: Channel[]): Promise<void>;
  putGroups(groups: Group[]): Promise<void>;
  putSearchIndex?(index: SearchIndex): Promise<void>;
}

export interface BuilderOptions {
  batchSize?: number;
  /** teto de itens por fonte (proteção de memória/armazenamento) */
  maxItems?: number;
  onProgress?: (items: number) => void;
}

export const DEFAULT_MAX_ITEMS = 300000;
const NO_GROUP = 'Sem categoria';

/** Item de stream da API Xtream (campos variam entre servidores). */
export interface XtreamStream {
  num?: number | string;
  name?: string;
  stream_id?: number | string;
  series_id?: number | string;
  stream_icon?: string;
  cover?: string;
  epg_channel_id?: string | null;
  category_id?: string | number | null;
  tv_archive?: number | string;
  tv_archive_duration?: number | string;
  container_extension?: string;
  rating?: number | string;
  /** filmes: data em que entrou no servidor (unix, segundos) */
  added?: number | string;
  /** séries: última atualização (unix, segundos) */
  last_modified?: number | string;
}

const toInt = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return isFinite(n) && Math.floor(n) === n ? n : null;
};

/** Nota 0–10 com uma casa; servidores mandam número, string ou "" */
function parseRating(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return isFinite(n) && n > 0 && n <= 10 ? Math.round(n * 10) / 10 : undefined;
}

export class ChannelBuilder {
  private batch: Channel[] = [];
  private groups = new Map<string, Group>();
  private seen = new Set<string>();
  private searchIds: string[] = [];
  private searchQ: string[] = [];
  private movieIds: string[] = [];
  private seriesIds: string[] = [];
  private movieQ: string[] = [];
  private recentMovies: Array<{ id: string; added: number }> = [];
  private recentSeries: Array<{ id: string; added: number }> = [];
  private seriesQ: string[] = [];
  private order = 0;
  private liveNum = 0;
  private stats = { live: 0, movies: 0, series: 0, duplicates: 0, skipped: 0 };
  private readonly batchSize: number;
  private readonly maxItems: number;
  /** atingiu o teto de itens; o resto da lista é ignorado */
  truncated = false;

  constructor(private gk: string, private sink: ImportSink, private opts: BuilderOptions = {}) {
    this.batchSize = opts.batchSize || 2000;
    this.maxItems = opts.maxItems || DEFAULT_MAX_ITEMS;
  }

  get count(): number {
    return this.order;
  }

  /** Registra grupos na ordem oficial (categorias do Xtream). */
  declareGroup(kind: ItemKind, name: string): void {
    this.group(kind, name);
  }

  async addM3u(e: M3uEntry): Promise<void> {
    const url = e.url.trim();
    if (!validStreamUrl(url)) {
      this.stats.skipped++;
      return;
    }
    if (this.seen.has(url)) {
      this.stats.duplicates++;
      return;
    }
    const kind = classifyUrl(url);
    const a = e.attrs;
    const chno = toInt(a['tvg-chno']);
    await this.push({
      kind,
      name: clip(e.name || a['tvg-name'] || url, FIELD_MAX.name),
      group: clip(a['group-title'] || e.extGroup, FIELD_MAX.group),
      logo: safeImageUrl(a['tvg-logo'] || a['logo']),
      tvgId: clip(a['tvg-id'], FIELD_MAX.tvgId) || undefined,
      url,
      num: kind === 'live' && chno && chno > 0 && chno < 100000 ? chno : 0,
      dedupeKey: url,
    });
  }

  async addXtream(kind: ItemKind, s: XtreamStream, categoryName: (id: string) => string | undefined): Promise<void> {
    const id = toInt(kind === 'series' ? s.series_id : s.stream_id);
    if (id == null || id < 0) {
      this.stats.skipped++;
      return;
    }
    const key = kind + ':' + id;
    if (this.seen.has(key)) {
      this.stats.duplicates++;
      return;
    }
    const num = toInt(s.num);
    const archive = toInt(s.tv_archive) === 1 ? toInt(s.tv_archive_duration) : null;
    const ext = typeof s.container_extension === 'string' && /^[a-z0-9]{1,5}$/i.test(s.container_extension) ? s.container_extension.toLowerCase() : undefined;
    await this.push({
      kind,
      name: clip(s.name || String(id), FIELD_MAX.name),
      group: clip(categoryName(s.category_id == null ? '' : String(s.category_id)), FIELD_MAX.group),
      logo: safeImageUrl(s.stream_icon || s.cover),
      tvgId: clip(s.epg_channel_id || undefined, FIELD_MAX.tvgId) || undefined,
      xid: id,
      ext,
      archiveDays: archive && archive > 0 ? archive : undefined,
      rating: parseRating(s.rating),
      num: kind === 'live' && num && num > 0 && num < 100000 ? num : 0,
      dedupeKey: key,
      added: kind === 'live' ? undefined : toInt(kind === 'movie' ? s.added : s.last_modified) || undefined,
    });
  }

  /** Grava o que sobrou e os grupos; devolve as estatísticas. */
  async finish(base: { importedAt: number; bytes: number }): Promise<ImportStats> {
    await this.flush();
    const groups = Array.from(this.groups.values()).filter((g) => g.count > 0);
    await this.sink.putGroups(groups);
    if (this.sink.putSearchIndex) {
      await this.sink.putSearchIndex({ gk: this.gk, ids: this.searchIds, q: this.searchQ, movies: this.movieIds, series: this.seriesIds, movieQ: this.movieQ, seriesQ: this.seriesQ, recentMovies: this.recentMovies.map((r) => r.id), recentSeries: this.recentSeries.map((r) => r.id) });
    }
    return {
      gk: this.gk,
      importedAt: base.importedAt,
      durationMs: Date.now() - base.importedAt,
      bytes: base.bytes,
      live: this.stats.live,
      movies: this.stats.movies,
      series: this.stats.series,
      groups: groups.length,
      duplicates: this.stats.duplicates,
      skipped: this.stats.skipped,
    };
  }

  private group(kind: ItemKind, name: string): Group {
    const n = name || NO_GROUP;
    const key = kind + '|' + n;
    let g = this.groups.get(key);
    if (!g) {
      const order = this.groups.size + 1;
      g = { id: this.gk + ':' + pad8(order), gk: this.gk, kind, name: n, count: 0, order };
      this.groups.set(key, g);
    }
    return g;
  }

  private async push(c: Omit<Channel, 'id' | 'gk' | 'order' | 'q'> & { dedupeKey: string; added?: number }): Promise<void> {
    if (this.order >= this.maxItems) {
      this.truncated = true;
      this.stats.skipped++;
      return;
    }
    this.seen.add(c.dedupeKey);
    this.order++;
    const g = this.group(c.kind, c.group);
    g.count++;
    if (c.kind === 'live') {
      this.liveNum++;
      this.stats.live++;
    } else if (c.kind === 'movie') this.stats.movies++;
    else this.stats.series++;
    const ch: Channel = {
      id: this.gk + ':' + pad8(this.order),
      gk: this.gk,
      order: this.order,
      num: c.num || (c.kind === 'live' ? this.liveNum : this.order),
      kind: c.kind,
      name: c.name,
      q: searchKey(c.name),
      group: g.name,
    };
    // só grava campos presentes (economiza espaço no IndexedDB)
    if (c.logo) ch.logo = c.logo;
    if (c.tvgId) ch.tvgId = c.tvgId;
    if (c.url) ch.url = c.url;
    if (c.xid != null) ch.xid = c.xid;
    if (c.ext) ch.ext = c.ext;
    if (c.archiveDays) ch.archiveDays = c.archiveDays;
    if (c.rating) ch.rating = c.rating;
    // a data não vai para o item (são dezenas de milhares): só os mais novos são lembrados
    if (c.added && ch.kind !== 'live') trackRecent(ch.kind === 'movie' ? this.recentMovies : this.recentSeries, ch.id, c.added);
    if (ch.kind === 'live') {
      this.searchIds.push(ch.id);
      this.searchQ.push(ch.q + ' ' + ch.num);
    } else if (ch.kind === 'movie') {
      this.movieIds.push(ch.id);
      this.movieQ.push(ch.q);
    } else {
      this.seriesIds.push(ch.id);
      this.seriesQ.push(ch.q);
    }
    this.batch.push(ch);
    if (this.batch.length >= this.batchSize) await this.flush();
    if (this.opts.onProgress && this.order % 1000 === 0) this.opts.onProgress(this.order);
  }

  private async flush(): Promise<void> {
    if (!this.batch.length) return;
    const b = this.batch;
    this.batch = [];
    await this.sink.putChannels(b);
  }
}
