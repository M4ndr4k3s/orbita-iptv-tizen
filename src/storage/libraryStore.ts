// Favoritos e histórico (só no worker). Guardam um snapshot do item, então
// continuam funcionando depois que a lista é reimportada.

import { openDb } from './db';
import type { SavedEntry } from '../playlist/model';

export type LibraryKind = 'favorites' | 'history';

/** histórico guarda só os mais recentes por fonte */
export const HISTORY_MAX = 60;
/** teto de favoritos por fonte (proteção de armazenamento) */
export const FAVORITES_MAX = 2000;

function done<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('abort'));
  });
}

/** Mais recentes primeiro. */
export async function listEntries(kind: LibraryKind, sourceId: string): Promise<SavedEntry[]> {
  const db = await openDb();
  const all = await done(db.transaction(kind, 'readonly').objectStore(kind).index('sourceId').getAll(sourceId) as IDBRequest<SavedEntry[]>);
  return all.sort((a, b) => b.at - a.at);
}

/** Liga/desliga favorito. Retorna o novo estado (true = é favorito). */
export async function toggleFavorite(entry: SavedEntry): Promise<boolean> {
  const db = await openDb();
  const st = () => db.transaction('favorites', 'readwrite').objectStore('favorites');
  const existing = await done(st().get(entry.id) as IDBRequest<SavedEntry | undefined>);
  if (existing) {
    await done(st().delete(entry.id));
    return false;
  }
  const count = await done(db.transaction('favorites', 'readonly').objectStore('favorites').index('sourceId').count(entry.sourceId));
  if (count >= FAVORITES_MAX) throw new Error('limite');
  await done(st().put({ ...entry, at: Date.now() }));
  return true;
}

/** Registra no histórico (move para o topo) e corta o excesso. */
export async function addHistory(entry: SavedEntry): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('history', 'readwrite');
  const st = tx.objectStore('history');
  st.put({ ...entry, at: Date.now() });
  await txDone(tx);
  const all = await listEntries('history', entry.sourceId);
  if (all.length > HISTORY_MAX) {
    const tx2 = db.transaction('history', 'readwrite');
    for (const e of all.slice(HISTORY_MAX)) tx2.objectStore('history').delete(e.id);
    await txDone(tx2);
  }
}

/** Apaga favoritos e histórico de uma fonte removida. */
export async function deleteLibrary(sourceId: string): Promise<void> {
  const db = await openDb();
  for (const kind of ['favorites', 'history'] as LibraryKind[]) {
    const keys = await done(db.transaction(kind, 'readonly').objectStore(kind).index('sourceId').getAllKeys(sourceId));
    if (!keys.length) continue;
    const tx = db.transaction(kind, 'readwrite');
    for (const k of keys) tx.objectStore(kind).delete(k);
    await txDone(tx);
  }
}
