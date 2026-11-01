// Executa a importação completa de uma fonte (roda dentro do Web Worker).

import { streamText, fetchJson, NetError, type NetErrorCode } from '../utils/net';
import { apiUrl } from '../services/xtreamApi';
import { M3uParser } from './m3uParser';
import { JsonArrayStream } from './jsonStream';
import { ChannelBuilder, type ImportSink, type XtreamStream } from './importer';
import type { ItemKind } from './model';
import type { ImportStats } from './model';
import type { Source } from './source';
import { normalizeHttpUrl } from '../utils/validate';

export type ImportErrorCode = NetErrorCode | 'notM3u' | 'badResponse' | 'empty' | 'storage';

export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode, readonly status = 0) {
    super(code);
    this.name = 'ImportError';
  }
}

export interface ImportProgress {
  items: number;
  bytes: number;
  phase: 'download' | 'categories' | 'live' | 'movies' | 'series';
}

export interface RunOptions {
  signal?: AbortSignal;
  onProgress?: (p: ImportProgress) => void;
  maxItems?: number;
}

type ImportSource = Pick<Source, 'kind' | 'url' | 'server' | 'username' | 'password'>;

// categorias são pequenas; 5 MB é folga
const CATEGORIES_MAX = 5 * 1024 * 1024;

export async function runImport(src: ImportSource, gk: string, sink: ImportSink, opts: RunOptions = {}): Promise<ImportStats & { truncated: boolean }> {
  const importedAt = Date.now();
  let bytes = 0;
  let phase: ImportProgress['phase'] = 'download';
  const report = (items: number) => opts.onProgress && opts.onProgress({ items, bytes, phase });
  const builder = new ChannelBuilder(gk, sink, { maxItems: opts.maxItems, onProgress: report });
  const onBytes = (n: number) => {
    bytes = n;
  };
  // vários downloads seguidos (Xtream): cada um soma ao total, o progresso não volta a zero
  const addBytes = () => {
    const base = bytes;
    return (n: number) => {
      bytes = base + n;
    };
  };

  let tvgUrl: string | undefined;
  const vodFailed: Array<'movie' | 'series'> = [];
  try {
    if (src.kind === 'm3u') {
      const parser = new M3uParser();
      for await (const chunk of streamText(src.url || '', { timeoutMs: 30000, idleMs: 30000, signal: opts.signal, onBytes })) {
        const entries = parser.push(chunk);
        if (parser.isM3u === false) throw new ImportError('notM3u');
        for (const e of entries) await builder.addM3u(e);
        if (builder.truncated) break;
      }
      for (const e of parser.end()) await builder.addM3u(e);
      if (parser.isM3u !== true) throw new ImportError('notM3u');
      if (parser.tvgUrl) {
        const u = normalizeHttpUrl(parser.tvgUrl);
        if (u.ok) tvgUrl = u.value;
      }
    } else {
      const creds = { server: src.server || '', username: src.username || '', password: src.password || '' };
      phase = 'categories';
      const names = await xtreamCategories(creds, 'get_live_categories', 'live', builder, opts.signal);
      phase = 'live';
      await xtreamItems(creds, 'live', 'get_live_streams', names, builder, opts.signal, addBytes());
      // filmes e séries: falha aqui não perde os canais (servidores grandes às vezes
      // não respondem o catálogo VOD); o resumo da importação indica o que faltou
      for (const [kind, catAction, action] of VOD_STEPS) {
        if (builder.truncated) break;
        phase = kind === 'movie' ? 'movies' : 'series';
        report(builder.count);
        try {
          const vodNames = await xtreamCategories(creds, catAction, kind, builder, opts.signal);
          await xtreamItems(creds, kind, action, vodNames, builder, opts.signal, addBytes(), true);
        } catch (e) {
          // só falha de rede/servidor é tolerada; erro ao gravar continua sendo erro
          if ((opts.signal && opts.signal.aborted) || !(e instanceof NetError)) throw e;
          vodFailed.push(kind);
        }
      }
    }
  } catch (e) {
    if (e instanceof ImportError) throw e;
    if (e instanceof NetError) throw new ImportError(e.code, e.status);
    if (opts.signal && opts.signal.aborted) throw new ImportError('aborted');
    // falha ao gravar (cota do IndexedDB, transação abortada)
    throw new ImportError('storage');
  }
  if (!builder.count) throw new ImportError('empty');
  const stats = await builder.finish({ importedAt, bytes });
  if (tvgUrl) stats.tvgUrl = tvgUrl;
  if (vodFailed.length) stats.vodFailed = vodFailed;
  return { ...stats, truncated: builder.truncated };
}

const VOD_STEPS: Array<['movie' | 'series', string, string]> = [
  ['movie', 'get_vod_categories', 'get_vod_streams'],
  ['series', 'get_series_categories', 'get_series'],
];

type Creds = { server: string; username: string; password: string };

/** Categorias de um tipo: id → nome, declaradas no builder na ordem do servidor. */
async function xtreamCategories(creds: Creds, action: string, kind: ItemKind, builder: ChannelBuilder, signal?: AbortSignal): Promise<Map<string, string>> {
  const cats = await fetchJson<unknown>(apiUrl(creds, { action }), CATEGORIES_MAX, { timeoutMs: 30000, signal });
  const names = new Map<string, string>();
  if (Array.isArray(cats)) {
    for (const c of cats as Array<{ category_id?: unknown; category_name?: unknown }>) {
      if (c && c.category_id != null && typeof c.category_name === 'string') {
        names.set(String(c.category_id), c.category_name);
        builder.declareGroup(kind, c.category_name.trim());
      }
    }
  }
  return names;
}

/** Itens de um tipo em streaming (listas de 100 mil não cabem num JSON.parse). */
async function xtreamItems(
  creds: Creds,
  kind: ItemKind,
  action: string,
  names: Map<string, string>,
  builder: ChannelBuilder,
  signal: AbortSignal | undefined,
  onBytes: (n: number) => void,
  tolerant = false,
): Promise<void> {
  const json = new JsonArrayStream<XtreamStream>();
  const catName = (id: string) => names.get(id);
  for await (const chunk of streamText(apiUrl(creds, { action }), { timeoutMs: 60000, idleMs: 45000, signal, onBytes })) {
    const items = json.push(chunk);
    if (json.notArray) {
      // VOD vazio às vezes vem como {} ou "": não é erro
      if (tolerant) return;
      throw new ImportError('badResponse');
    }
    for (const s of items) await builder.addXtream(kind, s, catName);
    if (builder.truncated) break;
  }
}
