// Acesso ao IndexedDB para itens importados. SÓ roda no worker de dados:
// no Tizen, operações de IndexedDB na thread principal travaram a interface
// por 1–4 s com o banco grande. A interface pede dados via DataClient.
// Ids começam com a geração (gk), então apagar uma geração inteira é um
// único delete por intervalo de chaves.

import { openDb } from './db';
import type { ImportSink } from '../playlist/importer';
import type { Channel, Group } from '../playlist/model';

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('abort'));
  });
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

const genRange = (gk: string) => IDBKeyRange.bound(gk + ':', gk + ':￿');

export function idbSink(): ImportSink {
  return {
    async putChannels(batch: Channel[]) {
      const db = await openDb();
      const tx = db.transaction('channels', 'readwrite');
      const st = tx.objectStore('channels');
      for (const c of batch) st.put(c);
      await txDone(tx);
    },
    async putGroups(groups: Group[]) {
      const db = await openDb();
      const tx = db.transaction('groups', 'readwrite');
      const st = tx.objectStore('groups');
      for (const g of groups) st.put(g);
      await txDone(tx);
    },
  };
}

export interface GenerationRecord {
  id: string;
  state: 'writing' | 'ready';
  startedAt: number;
}

/** Anota a geração ANTES de gravar canais: se o app cair no meio, a limpeza a encontra. */
export async function markGeneration(gk: string, state: GenerationRecord['state']): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('gens', 'readwrite');
  tx.objectStore('gens').put({ id: gk, state, startedAt: Date.now() } as GenerationRecord);
  await txDone(tx);
}

/**
 * Apaga uma geração com um único delete por intervalo. Medido na TV: ~4 s para
 * 100 mil itens; em fatias de 5 mil levou 200 s (o custo é por transação).
 * Só roda no worker, então não trava a interface. O registro em 'gens' some
 * na mesma transação dos dados.
 */
export async function deleteGeneration(gk: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['channels', 'groups', 'gens'], 'readwrite');
  tx.objectStore('channels').delete(genRange(gk));
  tx.objectStore('groups').delete(genRange(gk));
  tx.objectStore('gens').delete(gk);
  await txDone(tx);
}

/**
 * Apaga gerações que nenhuma fonte usa (fonte removida, importação interrompida).
 * `busy`: gerações sendo gravadas agora, que não podem ser apagadas.
 */
export async function cleanupGenerations(keep: Set<string>, busy: Set<string> = new Set()): Promise<string[]> {
  const db = await openDb();
  const all = await req(db.transaction('gens', 'readonly').objectStore('gens').getAll() as IDBRequest<GenerationRecord[]>);
  const removed = all.map((g) => g.id).filter((id) => !keep.has(id) && !busy.has(id));
  for (const g of removed) await deleteGeneration(g);
  return removed;
}

export async function getGroups(gk: string): Promise<Group[]> {
  const db = await openDb();
  const all = await req(db.transaction('groups', 'readonly').objectStore('groups').index('gk').getAll(gk) as IDBRequest<Group[]>);
  return all.sort((a, b) => a.order - b.order);
}

export async function countChannels(gk: string): Promise<number> {
  const db = await openDb();
  return req(db.transaction('channels', 'readonly').objectStore('channels').count(genRange(gk)));
}

/** Página de itens de um grupo, na ordem da lista. */
export async function getGroupPage(gk: string, group: string, offset: number, limit: number): Promise<Channel[]> {
  const db = await openDb();
  const idx = db.transaction('channels', 'readonly').objectStore('channels').index('gk_group');
  const out: Channel[] = [];
  await new Promise<void>((resolve, reject) => {
    let skipped = offset === 0;
    const cur = idx.openCursor(IDBKeyRange.only([gk, group]));
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) return resolve();
      if (!skipped) {
        skipped = true;
        c.advance(offset);
        return;
      }
      out.push(c.value as Channel);
      if (out.length >= limit) return resolve();
      c.continue();
    };
    cur.onerror = () => reject(cur.error);
  });
  return out;
}
