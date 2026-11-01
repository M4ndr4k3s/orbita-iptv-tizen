// Lado da interface do worker de dados. Toda leitura/gravação no IndexedDB
// passa por aqui (via mensagens), nunca direto na thread principal.

import type { Store } from './store';
import type { Source } from '../playlist/source';
import type { FromWorker, RpcMethods, RpcName, ToWorker } from '../workers/protocol';

type ImportListener = (m: Extract<FromWorker, { type: 'progress' | 'done' | 'error' }>) => void;
type EpgListener = (m: Extract<FromWorker, { type: 'epgDone' | 'epgError' }>) => void;

const RPC_TIMEOUT_MS = 60000;

export class DataClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private importListener: ImportListener | null = null;
  private epgListener: EpgListener | null = null;
  /** chamado se o worker morrer (ex.: falta de memória) */
  onCrash: (() => void) | null = null;

  constructor(url = 'worker.js') {
    this.worker = new Worker(url);
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.receive(ev.data);
    this.worker.onerror = () => {
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error('worker'));
      }
      this.pending.clear();
      if (this.onCrash) this.onCrash();
    };
  }

  call<M extends RpcName>(method: M, ...args: RpcMethods[M]['args']): Promise<RpcMethods[M]['result']> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('timeout ' + method));
      }, RPC_TIMEOUT_MS);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.send({ type: 'rpc', id, method, args });
    });
  }

  /** Mensagens de importação (progresso/fim) vão para um único ouvinte: o ImportService. */
  onImport(fn: ImportListener): void {
    this.importListener = fn;
  }

  onEpg(fn: EpgListener): void {
    this.epgListener = fn;
  }

  send(m: ToWorker): void {
    this.worker.postMessage(m);
  }

  /** Store de fontes persistido pelo worker (mesma interface do MemoryStore). */
  sourceStore(): Store<Source> {
    return {
      get: async (id) => (await this.call('sources.getAll')).find((s) => s.id === id),
      getAll: () => this.call('sources.getAll'),
      put: (s) => this.call('sources.put', s),
      delete: (id) => this.call('sources.delete', id),
    };
  }

  private receive(m: FromWorker): void {
    if (m.type === 'rpcResult') {
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.ok) p.resolve(m.result);
      else p.reject(new Error(m.error));
      return;
    }
    if (m.type === 'epgDone' || m.type === 'epgError') {
      if (this.epgListener) this.epgListener(m);
      return;
    }
    if (this.importListener) this.importListener(m);
  }
}
