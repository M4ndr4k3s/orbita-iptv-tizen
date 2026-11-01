// Acesso ao IndexedDB para itens importados. SÓ roda no worker de dados:
// no Tizen, operações de IndexedDB na thread principal travaram a interface
// por 1–4 s com o banco grande. A interface pede dados via DataClient.
// Ids começam com a geração (gk), então apagar uma geração inteira é um
// único delete por intervalo de chaves.

import { openDb } from './db';
import type { ImportSink, SearchIndex } from '../playlist/importer';
import { pad8, type Channel, type Group } from '../playlist/model';

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
    async putSearchIndex(index: SearchIndex) {
      const db = await openDb();
      const tx = db.transaction('search', 'readwrite');
      tx.objectStore('search').put(index);
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
  const tx = db.transaction(['channels', 'groups', 'gens', 'search'], 'readwrite');
  tx.objectStore('channels').delete(genRange(gk));
  tx.objectStore('groups').delete(genRange(gk));
  tx.objectStore('gens').delete(gk);
  tx.objectStore('search').delete(gk);
  await txDone(tx);
  if (searchCache && searchCache.gk === gk) searchCache = null;
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

/** Primeiro item do tipo, a partir de uma posição, numa direção. Não dá a volta. */
function scan(db: IDBDatabase, range: IDBKeyRange, dir: IDBCursorDirection, kind: string): Promise<Channel | null> {
  return new Promise((resolve, reject) => {
    const cur = db.transaction('channels', 'readonly').objectStore('channels').openCursor(range, dir);
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) return resolve(null);
      const v = c.value as Channel;
      if (v.kind === kind) return resolve(v);
      c.continue();
    };
    cur.onerror = () => reject(cur.error);
  });
}

/** Canal seguinte/anterior (CH+/CH−) do mesmo tipo; no fim, volta ao começo. */
export async function neighbor(gk: string, order: number, dir: 1 | -1, kind = 'live'): Promise<Channel | null> {
  const db = await openDb();
  const here = gk + ':' + pad8(order);
  const first =
    dir > 0
      ? await scan(db, IDBKeyRange.bound(here, gk + ':￿', true), 'next', kind)
      : await scan(db, IDBKeyRange.bound(gk + ':', here, false, true), 'prev', kind);
  if (first) return first;
  // volta pela outra ponta
  return dir > 0 ? scan(db, IDBKeyRange.bound(gk + ':', here, false, true), 'next', kind) : scan(db, IDBKeyRange.bound(here, gk + ':￿', true), 'prev', kind);
}

export async function firstOf(gk: string, kind = 'live'): Promise<Channel | null> {
  return scan(await openDb(), genRange(gk), 'next', kind);
}

/** Canal pelo número exibido (o primeiro, se a lista repetir números). */
export async function byNumber(gk: string, num: number, kind = 'live'): Promise<Channel | null> {
  const db = await openDb();
  const idx = db.transaction('channels', 'readonly').objectStore('channels').index('gk_num');
  return new Promise((resolve, reject) => {
    const cur = idx.openCursor(IDBKeyRange.only([gk, num]));
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) return resolve(null);
      if ((c.value as Channel).kind === kind) return resolve(c.value as Channel);
      c.continue();
    };
    cur.onerror = () => reject(cur.error);
  });
}

/**
 * Ids (na ordem da lista) dos itens de um grupo, ou de todos os ao vivo se
 * group for null. Só as chaves: barato até para dezenas de milhares.
 */
export async function channelIds(gk: string, group: string | null, kind = 'live'): Promise<string[]> {
  // "Todos os canais": os ids já estão no registro de busca (≈0,3 s para 88 mil na TV;
  // getAllKeys no índice composto levou 13 s)
  if (group == null && kind === 'live') return (await loadSearchIndex(gk)).ids.slice();
  const db = await openDb();
  const st = db.transaction('channels', 'readonly').objectStore('channels');
  const keys =
    group == null
      ? await req(st.index('gk_kind').getAllKeys(IDBKeyRange.only([gk, kind])))
      : await req(st.index('gk_group').getAllKeys(IDBKeyRange.only([gk, group])));
  // o índice de grupo pode misturar tipos com o mesmo nome; o id já vem ordenado
  return (keys as string[]).sort();
}

export async function getMany(ids: string[]): Promise<Array<Channel | null>> {
  const db = await openDb();
  const st = db.transaction('channels', 'readonly').objectStore('channels');
  return Promise.all(ids.map((id) => req(st.get(id) as IDBRequest<Channel | undefined>).then((c) => c || null)));
}

// índice de busca em memória da última geração consultada (só ao vivo)
let searchCache: SearchIndex | null = null;

async function loadSearchIndex(gk: string): Promise<{ ids: string[]; q: string[] }> {
  if (searchCache && searchCache.gk === gk) return searchCache;
  const db = await openDb();
  // caminho rápido: índice gravado na importação (um único registro)
  const saved = await req(db.transaction('search', 'readonly').objectStore('search').get(gk) as IDBRequest<SearchIndex | undefined>);
  if (saved && Array.isArray(saved.ids) && Array.isArray(saved.q)) {
    searchCache = saved;
    return saved;
  }
  // gerações importadas antes da v7: monta lendo canal por canal (lento, só uma vez)
  const ids: string[] = [];
  const q: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const cur = db.transaction('channels', 'readonly').objectStore('channels').index('gk_kind').openCursor(IDBKeyRange.only([gk, 'live']));
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) return resolve();
      const v = c.value as Channel;
      ids.push(v.id);
      q.push(v.q + ' ' + v.num);
      c.continue();
    };
    cur.onerror = () => reject(cur.error);
  });
  searchCache = { gk, ids, q };
  return searchCache;
}

/** Busca por nome (sem acento/maiúsculas) ou número; devolve ids na ordem da lista. */
export async function searchIds(gk: string, term: string, limit = 300): Promise<string[]> {
  const words = term.split(' ').filter(Boolean);
  if (!words.length) return [];
  const idx = await loadSearchIndex(gk);
  const out: string[] = [];
  for (let i = 0; i < idx.q.length && out.length < limit; i++) {
    const text = idx.q[i];
    let ok = true;
    for (const w of words) if (text.indexOf(w) < 0) { ok = false; break; }
    if (ok) out.push(idx.ids[i]);
  }
  return out.sort();
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
