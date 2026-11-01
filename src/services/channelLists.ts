// Uma "lista de canais" é o que a tela mostra e o que o CH± percorre: uma
// categoria, todos os canais, os favoritos, os recentes ou um resultado de busca.

import type { DataClient } from '../storage/dataClient';
import { channelFromSnapshot, type Channel, type SavedEntry } from '../playlist/model';

export interface ChannelList {
  readonly size: number;
  load(start: number, count: number): Promise<Channel[]>;
}

/** Lista apoiada em ids do banco (busca os detalhes por páginas). */
export function idList(data: DataClient, ids: string[]): ChannelList & { ids: string[] } {
  return {
    ids,
    size: ids.length,
    async load(start, count) {
      const slice = ids.slice(start, start + count);
      if (!slice.length) return [];
      const got = await data.call('channels.getMany', slice);
      // item sumiu do banco (reimportação no meio): placeholder para não deslocar a lista
      return got.map((c, k) => c || placeholder(slice[k]));
    },
  };
}

/** Lista em memória (favoritos/recentes vêm como snapshots). */
export function snapshotList(entries: SavedEntry[]): ChannelList {
  const items = entries.map((e) => channelFromSnapshot(e.channel));
  return {
    size: items.length,
    async load(start, count) {
      return items.slice(start, start + count);
    },
  };
}

function placeholder(id: string): Channel {
  return { id, gk: '', order: 0, num: 0, kind: 'live', name: '—', q: '', group: '' };
}

/** Índice vizinho com volta pelas pontas (CH± no player). */
export function wrapIndex(i: number, dir: number, size: number): number {
  if (size <= 0) return -1;
  return (((i + dir) % size) + size) % size;
}
