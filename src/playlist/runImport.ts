// Executa a importação completa de uma fonte (roda dentro do Web Worker).

import { streamText, fetchJson, NetError, type NetErrorCode } from '../utils/net';
import { apiUrl } from '../services/xtreamApi';
import { M3uParser } from './m3uParser';
import { JsonArrayStream } from './jsonStream';
import { ChannelBuilder, type ImportSink, type XtreamStream } from './importer';
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
  phase: 'download' | 'categories' | 'live';
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

  let tvgUrl: string | undefined;
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
      const cats = await fetchJson<unknown>(apiUrl(creds, { action: 'get_live_categories' }), CATEGORIES_MAX, { timeoutMs: 30000, signal: opts.signal });
      const names = new Map<string, string>();
      if (Array.isArray(cats)) {
        for (const c of cats as Array<{ category_id?: unknown; category_name?: unknown }>) {
          if (c && c.category_id != null && typeof c.category_name === 'string') {
            names.set(String(c.category_id), c.category_name);
            builder.declareGroup('live', c.category_name.trim());
          }
        }
      }
      phase = 'live';
      const json = new JsonArrayStream<XtreamStream>();
      const catName = (id: string) => names.get(id);
      for await (const chunk of streamText(apiUrl(creds, { action: 'get_live_streams' }), { timeoutMs: 60000, idleMs: 45000, signal: opts.signal, onBytes })) {
        const items = json.push(chunk);
        if (json.notArray) throw new ImportError('badResponse');
        for (const s of items) await builder.addXtream('live', s, catName);
        if (builder.truncated) break;
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
  return { ...stats, truncated: builder.truncated };
}
