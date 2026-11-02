// Worker de dados: dono do IndexedDB. Importa listas (baixa, interpreta e grava)
// e atende consultas da interface. Nada de IndexedDB na thread principal: no
// Tizen isso travou a interface por segundos com o banco grande.

import { runImport, ImportError } from '../playlist/runImport';
import {
  idbSink, deleteGeneration, markGeneration, cleanupGenerations, getGroups, getGroupPage, firstOf, neighbor, byNumber,
  channelIds, getMany, searchIds, withoutGroups, liveRefs,
} from '../storage/channelStore';
import { epgSink, schedule, searchProgrammes, warmProgrammes } from '../storage/epgStore';
import { runEpg, EpgError } from '../epg/runEpg';
import { listEntries, toggleFavorite, addHistory, deleteLibrary, clearHistory } from '../storage/libraryStore';
import { searchKey, type SavedEntry } from '../playlist/model';
import { idbStore, openDb } from '../storage/db';
import type { Source } from '../playlist/source';
import type { ToWorker, FromWorker, RpcName } from './protocol';

// busca no guia: o que está no ar e o que começa nas próximas 24 h
const EPG_SEARCH_HORIZON_MS = 24 * 3600 * 1000;

const jobs = new Map<number, AbortController>();
const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m);
const sources = idbStore<Source>('sources');

// lista fechada de operações; argumentos vêm da própria interface do app
const RPC: Record<RpcName, (...args: any[]) => Promise<unknown>> = {
  ping: async () => {
    await openDb();
    return true;
  },
  'sources.getAll': () => sources.getAll(),
  'sources.put': (s: Source) => sources.put(s),
  // remover a fonte leva junto os favoritos e o histórico dela
  'sources.delete': async (id: string) => {
    await sources.delete(id);
    await deleteLibrary(id);
  },
  'gens.cleanup': (keep: string[], busy: string[]) => cleanupGenerations(new Set(keep), new Set(busy)),
  'groups.get': (gk: string) => getGroups(gk),
  'channels.page': (gk: string, group: string, offset: number, limit: number) =>
    getGroupPage(gk, group, Math.max(0, offset | 0), Math.min(500, Math.max(1, limit | 0))),
  'channels.first': (gk: string) => firstOf(gk),
  'channels.neighbor': (gk: string, order: number, dir: number) => neighbor(gk, order | 0, dir < 0 ? -1 : 1),
  'channels.byNumber': (gk: string, num: number) => byNumber(gk, num | 0),
  'channels.ids': async (gk: string, group: string | null, hide?: string[]) =>
    withoutGroups(String(gk), 'live', await channelIds(gk, typeof group === 'string' ? group : null), groupList(hide)),
  'channels.getMany': (ids: string[]) => getMany(Array.isArray(ids) ? ids.slice(0, 200).map(String) : []),
  'vod.ids': async (gk: string, kind: string, group: string | null, hide?: string[]) => {
    const k = kind === 'series' ? 'series' : 'movie';
    return withoutGroups(String(gk), k, await channelIds(String(gk), typeof group === 'string' ? group : null, k), groupList(hide));
  },
  'channels.search': async (gk: string, term: string, hide?: string[]) =>
    withoutGroups(String(gk), 'live', await searchIds(gk, searchKey(String(term).slice(0, 60))), groupList(hide)),
  'vod.search': async (gk: string, kind: string, term: string, hide?: string[]) => {
    const k = kind === 'series' ? 'series' : 'movie';
    return withoutGroups(String(gk), k, await searchIds(String(gk), searchKey(String(term).slice(0, 60)), 300, k), groupList(hide));
  },
  'epg.search': async (ek: string, gk: string, term: string, hide?: string[]) => {
    const hits = await searchProgrammes(String(ek), String(gk), String(term).slice(0, 60), () => liveRefs(String(gk)), Date.now(), EPG_SEARCH_HORIZON_MS, 60);
    const allowed = new Set(await withoutGroups(String(gk), 'live', hits.map((h) => h.channelId), groupList(hide)));
    return hits.filter((h) => allowed.has(h.channelId));
  },
  'search.warm': async (gk: string, ek: string | null) => {
    await searchIds(String(gk), 'a', 1, 'movie');
    await searchIds(String(gk), 'a', 1, 'series');
    if (typeof ek === 'string') await warmProgrammes(ek, String(gk), () => liveRefs(String(gk)), Date.now(), EPG_SEARCH_HORIZON_MS);
  },
  'library.list': (kind: string, sourceId: string) => listEntries(kind === 'history' ? 'history' : 'favorites', String(sourceId)),
  'library.toggleFavorite': (e: SavedEntry) => toggleFavorite(checkEntry(e)),
  'library.addHistory': (e: SavedEntry) => addHistory(checkEntry(e)),
  'library.clearHistory': () => clearHistory(),
  'epg.schedule': (ek: string, tvgId: string | null, name: string, from: number, limit: number) =>
    schedule(String(ek), typeof tvgId === 'string' ? tvgId : undefined, String(name || ''), Number(from) || Date.now(), Math.min(50, Math.max(1, limit | 0))),
};

/** Grupos bloqueados vindos da interface: só strings, quantidade limitada. */
function groupList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((g) => typeof g === 'string').slice(0, 500) : [];
}

/** Entrada vinda da interface: confere a forma antes de gravar. */
function checkEntry(e: SavedEntry): SavedEntry {
  if (!e || typeof e.sourceId !== 'string' || typeof e.key !== 'string' || !e.channel || typeof e.channel.name !== 'string') {
    throw new Error('entrada inválida');
  }
  return { id: e.sourceId + '|' + e.key, sourceId: e.sourceId, key: e.key, at: Date.now(), channel: e.channel };
}

async function handleRpc(id: number, method: RpcName, args: unknown[]): Promise<void> {
  const fn = Object.prototype.hasOwnProperty.call(RPC, method) ? RPC[method] : null;
  if (!fn) return post({ type: 'rpcResult', id, ok: false, error: 'método desconhecido' });
  try {
    post({ type: 'rpcResult', id, ok: true, result: await fn(...(Array.isArray(args) ? args : [])) });
  } catch (e) {
    post({ type: 'rpcResult', id, ok: false, error: e instanceof Error ? e.name : 'erro' });
  }
}

async function handleImport(msg: Extract<ToWorker, { type: 'start' }>): Promise<void> {
  const ctrl = new AbortController();
  jobs.set(msg.jobId, ctrl);
  let last = 0;
  try {
    await markGeneration(msg.gk, 'writing');
    const stats = await runImport(msg.source, msg.gk, idbSink(), {
      signal: ctrl.signal,
      // progresso no máximo a cada 300 ms para não inundar a interface
      onProgress: (progress) => {
        const now = Date.now();
        if (now - last < 300) return;
        last = now;
        post({ type: 'progress', jobId: msg.jobId, progress });
      },
    });
    await markGeneration(msg.gk, 'ready');
    post({ type: 'done', jobId: msg.jobId, stats });
  } catch (e) {
    const err = e instanceof ImportError ? e : new ImportError('storage');
    // avisa antes de limpar: apagar a geração parcial leva segundos
    post({ type: 'error', jobId: msg.jobId, code: ctrl.signal.aborted ? 'aborted' : err.code, status: err.status });
    // geração incompleta não pode ficar no banco (se falhar aqui, a limpeza da abertura remove)
    await deleteGeneration(msg.gk).catch(() => undefined);
  } finally {
    jobs.delete(msg.jobId);
  }
}

async function handleEpg(msg: Extract<ToWorker, { type: 'epgStart' }>): Promise<void> {
  const ctrl = new AbortController();
  jobs.set(msg.jobId, ctrl);
  try {
    await markGeneration(msg.ek, 'writing');
    const stats = await runEpg(msg.url, msg.ek, epgSink(), { signal: ctrl.signal });
    await markGeneration(msg.ek, 'ready');
    post({ type: 'epgDone', jobId: msg.jobId, stats });
  } catch (e) {
    const err = e instanceof EpgError ? e : new EpgError('storage');
    post({ type: 'epgError', jobId: msg.jobId, code: ctrl.signal.aborted ? 'aborted' : err.code, status: err.status });
    await deleteGeneration(msg.ek).catch(() => undefined);
  } finally {
    jobs.delete(msg.jobId);
  }
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'rpc') void handleRpc(msg.id, msg.method, msg.args);
  else if (msg.type === 'start') void handleImport(msg);
  else if (msg.type === 'epgStart') void handleEpg(msg);
  else if (msg.type === 'cancel') {
    const c = jobs.get(msg.jobId);
    if (c) c.abort();
  }
};
