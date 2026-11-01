// Consulta do guia (EPG) pela interface, com cache curto em memória: a lista de
// canais e o OSD pedem o mesmo canal várias vezes seguidas.

import type { DataClient } from '../storage/dataClient';
import type { Channel } from '../playlist/model';
import type { Source } from '../playlist/source';
import { channelKey } from '../playlist/model';
import type { Programme } from '../epg/model';

const MAX_ENTRIES = 200;
const cache = new Map<string, { at: number; until: number; limit: number; list: Programme[] }>();

/** Programas do canal a partir de agora (o primeiro pode ser o que está no ar). */
export async function scheduleFor(data: DataClient, src: Source, ch: Channel, limit = 3, now = Date.now()): Promise<Programme[]> {
  if (!src.epg || ch.kind !== 'live') return [];
  const key = src.epg.ek + '|' + channelKey(ch);
  const hit = cache.get(key);
  // vale até o primeiro programa da lista acabar (ou 10 min, se não houver nenhum)
  if (hit && hit.limit >= limit && now < hit.until && now - hit.at < 10 * 60000) return hit.list.slice(0, limit);
  const list = await data.call('epg.schedule', src.epg.ek, ch.tvgId || null, ch.name, now, limit);
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(key, { at: now, until: list.length ? list[0].stop : now + 10 * 60000, limit, list });
  return list;
}

export function fmtClock(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

/** 0..1 do programa já exibido. */
export function progressOf(p: Programme, now = Date.now()): number {
  return Math.min(1, Math.max(0, (now - p.start) / (p.stop - p.start)));
}
