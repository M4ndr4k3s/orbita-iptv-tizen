// Guia de programação no IndexedDB. SÓ roda no worker de dados (ver channelStore).

import { openDb } from './db';
import type { EpgSink } from '../epg/runEpg';
import { pad13 } from '../epg/runEpg';
import { epgNameKey, type EpgMeta, type EpgProgramme, type Programme } from '../epg/model';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function epgSink(): EpgSink {
  return {
    async putProgrammes(batch: EpgProgramme[]) {
      const db = await openDb();
      const tx = db.transaction('epg', 'readwrite');
      const st = tx.objectStore('epg');
      for (const p of batch) st.put(p);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('abort'));
      });
    },
    async putMeta(meta: EpgMeta) {
      const db = await openDb();
      await req(db.transaction('epgmeta', 'readwrite').objectStore('epgmeta').put(meta));
    },
  };
}

interface MetaIndex {
  ids: Set<string>;
  names: Map<string, string>;
}

// índice de canais do guia em memória (uma geração por fonte; poucas fontes)
const metaCache = new Map<string, MetaIndex>();

export function forgetEpgMeta(ek: string): void {
  metaCache.delete(ek);
}

async function meta(ek: string): Promise<MetaIndex | null> {
  const hit = metaCache.get(ek);
  if (hit) return hit;
  const db = await openDb();
  const m = await req(db.transaction('epgmeta', 'readonly').objectStore('epgmeta').get(ek) as IDBRequest<EpgMeta | undefined>);
  if (!m || !Array.isArray(m.ids)) return null;
  const names = new Map<string, string>();
  for (let i = 0; i < m.nameKeys.length; i++) names.set(m.nameKeys[i], m.nameIds[i]);
  const idx = { ids: new Set(m.ids), names };
  if (metaCache.size > 4) metaCache.clear();
  metaCache.set(ek, idx);
  return idx;
}

/** Canal do guia correspondente: pelo tvg-id; senão, pelo nome normalizado. */
export async function resolveChannel(ek: string, tvgId: string | undefined, name: string): Promise<string | null> {
  const m = await meta(ek);
  if (!m) return null;
  if (tvgId && m.ids.has(tvgId)) return tvgId;
  // tvg-id com caixa diferente ("globo.br" x "Globo.br") é comum
  if (tvgId) {
    const low = tvgId.toLowerCase();
    for (const id of m.ids) if (id.toLowerCase() === low) return id;
  }
  return m.names.get(epgNameKey(name)) || null;
}

// um programa raramente dura mais que 12 h: o que está no ar começou depois disso
const LOOKBACK_MS = 12 * 3600 * 1000;

/** Programas de um canal que terminam depois de `from`, em ordem, até `limit`. */
export async function schedule(ek: string, tvgId: string | undefined, name: string, from: number, limit: number): Promise<Programme[]> {
  const cid = await resolveChannel(ek, tvgId, name);
  if (!cid) return [];
  const base = ek + ':' + cid.replace(/\|/g, '_') + '|';
  const db = await openDb();
  const range = IDBKeyRange.bound(base + pad13(from - LOOKBACK_MS), base + '￿');
  const out: Programme[] = [];
  await new Promise<void>((resolve, reject) => {
    const cur = db.transaction('epg', 'readonly').objectStore('epg').openCursor(range);
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) return resolve();
      const p = c.value as EpgProgramme;
      if (p.e > from) {
        const pr: Programme = { start: p.s, stop: p.e, title: p.t };
        if (p.d) pr.desc = p.d;
        out.push(pr);
      }
      if (out.length >= limit) return resolve();
      c.continue();
    };
    cur.onerror = () => reject(cur.error);
  });
  return out;
}
