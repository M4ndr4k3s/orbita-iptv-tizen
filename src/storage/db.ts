// IndexedDB do app. Cada versão do schema tem um passo de migração;
// nunca alterar um passo já publicado, só acrescentar o próximo.

import type { Store } from './store';

const DB_NAME = 'orbita';

const MIGRATIONS: Array<(db: IDBDatabase, tx: IDBTransaction) => void> = [
  // v1: fontes (listas M3U / contas Xtream)
  (db) => {
    db.createObjectStore('sources', { keyPath: 'id' });
  },
  // v2: itens importados (canais/filmes/séries) e grupos, separados por geração (gk)
  (db) => {
    const ch = db.createObjectStore('channels', { keyPath: 'id' });
    ch.createIndex('gk', 'gk');
    ch.createIndex('gk_group', ['gk', 'group']);
    const gr = db.createObjectStore('groups', { keyPath: 'id' });
    gr.createIndex('gk', 'gk');
  },
  // v3: registro de gerações. Varrer o índice de canais para achar gerações
  // órfãs leva ~9 s com 100 mil itens na TV; este registro tem poucas linhas.
  (db) => {
    db.createObjectStore('gens', { keyPath: 'id' });
  },
  // v4: remove o índice 'gk' dos canais — redundante com 'gens' e com o prefixo do id;
  // cada índice a menos reduz o custo de gravar 100 mil itens na TV
  (_db, tx) => {
    tx.objectStore('channels').deleteIndex('gk');
  },
];

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, MIGRATIONS.length);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const tx = req.transaction as IDBTransaction;
      for (let v = ev.oldVersion; v < MIGRATIONS.length; v++) MIGRATIONS[v](db, tx);
    };
    req.onsuccess = () => {
      const db = req.result;
      // outra aba/instância pedindo upgrade: fecha para não bloquear
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error || new Error('indexedDB'));
    };
  });
  return dbPromise;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function idbStore<T extends { id: string }>(name: string): Store<T> {
  const tx = async (mode: IDBTransactionMode) => (await openDb()).transaction(name, mode).objectStore(name);
  return {
    async get(id) {
      return done((await tx('readonly')).get(id) as IDBRequest<T | undefined>);
    },
    async getAll() {
      return done((await tx('readonly')).getAll() as IDBRequest<T[]>);
    },
    async put(value) {
      await done((await tx('readwrite')).put(value));
    },
    async delete(id) {
      await done((await tx('readwrite')).delete(id));
    },
  };
}
