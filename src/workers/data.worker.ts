// Worker de dados: dono do IndexedDB. Importa listas (baixa, interpreta e grava)
// e atende consultas da interface. Nada de IndexedDB na thread principal: no
// Tizen isso travou a interface por segundos com o banco grande.

import { runImport, ImportError } from '../playlist/runImport';
import {
  idbSink, deleteGeneration, markGeneration, cleanupGenerations, getGroups, getGroupPage, firstOf, neighbor, byNumber,
} from '../storage/channelStore';
import { idbStore, openDb } from '../storage/db';
import type { Source } from '../playlist/source';
import type { ToWorker, FromWorker, RpcName } from './protocol';

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
  'sources.delete': (id: string) => sources.delete(id),
  'gens.cleanup': (keep: string[], busy: string[]) => cleanupGenerations(new Set(keep), new Set(busy)),
  'groups.get': (gk: string) => getGroups(gk),
  'channels.page': (gk: string, group: string, offset: number, limit: number) =>
    getGroupPage(gk, group, Math.max(0, offset | 0), Math.min(500, Math.max(1, limit | 0))),
  'channels.first': (gk: string) => firstOf(gk),
  'channels.neighbor': (gk: string, order: number, dir: number) => neighbor(gk, order | 0, dir < 0 ? -1 : 1),
  'channels.byNumber': (gk: string, num: number) => byNumber(gk, num | 0),
};

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

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'rpc') void handleRpc(msg.id, msg.method, msg.args);
  else if (msg.type === 'start') void handleImport(msg);
  else if (msg.type === 'cancel') {
    const c = jobs.get(msg.jobId);
    if (c) c.abort();
  }
};
