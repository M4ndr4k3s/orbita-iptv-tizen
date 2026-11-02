// Guia de programação no IndexedDB. SÓ roda no worker de dados (ver channelStore).

import { openDb } from './db';
import type { EpgSink } from '../epg/runEpg';
import { pad13 } from '../epg/runEpg';
import { searchKey } from '../playlist/model';
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

export interface EpgHit {
  channelId: string;
  start: number;
  stop: number;
  title: string;
}

// títulos das próximas horas em memória: varrer o guia inteiro levou ~4 s na TV
// a cada busca; com o índice a primeira paga isso e as seguintes são instantâneas
interface TitleIndex {
  key: string;
  builtAt: number;
  until: number;
  chan: string[];
  s: number[];
  e: number[];
  t: string[];
  q: string[];
}
let titleCache: TitleIndex | null = null;
// refaz depois disso: o "agora" anda e programas novos entram na janela
const TITLE_TTL_MS = 3600 * 1000;

// montagem em andamento (o aquecimento e a primeira busca podem chegar juntos)
let titleBuilding: { key: string; p: Promise<TitleIndex> } | null = null;

function titleIndex(
  ek: string,
  gk: string,
  refs: () => Promise<Array<{ id: string; tvgId?: string; name: string }>>,
  now: number,
  horizonMs: number,
): Promise<TitleIndex> {
  const key = gk + '|' + ek;
  if (titleCache && titleCache.key === key && now - titleCache.builtAt < TITLE_TTL_MS) return Promise.resolve(titleCache);
  if (titleBuilding && titleBuilding.key === key) return titleBuilding.p;
  const p = buildTitleIndex(ek, gk, refs, now, horizonMs);
  titleBuilding = { key, p };
  const done = () => {
    if (titleBuilding && titleBuilding.p === p) titleBuilding = null;
  };
  p.then(done, done);
  return p;
}

async function buildTitleIndex(
  ek: string,
  gk: string,
  refs: () => Promise<Array<{ id: string; tvgId?: string; name: string }>>,
  now: number,
  horizonMs: number,
): Promise<TitleIndex> {
  const key = gk + '|' + ek;
  // canal do guia -> canal da lista (o id do programa troca '|' por '_' no canal, ver schedule)
  const map = new Map<string, string>();
  for (const r of await refs()) {
    const cid = await resolveChannel(ek, r.tvgId, r.name);
    const k = cid && cid.replace(/\|/g, '_');
    if (k && !map.has(k)) map.set(k, r.id);
  }
  const idx: TitleIndex = { key, builtAt: now, until: now + horizonMs + TITLE_TTL_MS, chan: [], s: [], e: [], t: [], q: [] };
  titleCache = null;
  if (map.size) {
    const prefix = ek + ':';
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const cur = db.transaction('epg', 'readonly').objectStore('epg').openCursor(IDBKeyRange.bound(prefix, prefix + '￿'));
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return resolve();
        const p = c.value as EpgProgramme;
        if (p.e > now && p.s < idx.until) {
          const chId = map.get(p.id.slice(prefix.length, p.id.lastIndexOf('|')));
          if (chId) {
            idx.chan.push(chId);
            idx.s.push(p.s);
            idx.e.push(p.e);
            idx.t.push(p.t);
            idx.q.push(searchKey(p.t));
          }
        }
        c.continue();
      };
      cur.onerror = () => reject(cur.error);
    });
  }
  titleCache = idx;
  return idx;
}

/** Monta o índice de títulos antes da primeira busca (tela de busca aberta). */
export async function warmProgrammes(
  ek: string,
  gk: string,
  refs: () => Promise<Array<{ id: string; tvgId?: string; name: string }>>,
  now: number,
  horizonMs: number,
): Promise<void> {
  await titleIndex(ek, gk, refs, now, horizonMs);
}

/**
 * Programas cujo título tem todas as palavras, no ar ou começando nas próximas
 * `horizonMs`, só dos canais que existem na lista.
 */
export async function searchProgrammes(
  ek: string,
  gk: string,
  term: string,
  refs: () => Promise<Array<{ id: string; tvgId?: string; name: string }>>,
  now: number,
  horizonMs: number,
  limit: number,
): Promise<EpgHit[]> {
  const words = searchKey(term).split(' ').filter(Boolean);
  if (!words.length) return [];
  const idx = await titleIndex(ek, gk, refs, now, horizonMs);
  const until = now + horizonMs;
  const out: EpgHit[] = [];
  for (let i = 0; i < idx.q.length && out.length < limit; i++) {
    if (idx.e[i] <= now || idx.s[i] >= until) continue;
    const text = idx.q[i];
    let ok = true;
    for (const w of words) if (text.indexOf(w) < 0) { ok = false; break; }
    if (ok) out.push({ channelId: idx.chan[i], start: idx.s[i], stop: idx.e[i], title: idx.t[i] });
  }
  return out.sort((a, b) => a.start - b.start);
}
