// Favoritos e histórico na interface. Mantém em memória as chaves dos favoritos
// da fonte ativa para desenhar a estrela em cada linha sem consultar o banco.

import type { DataClient } from '../storage/dataClient';
import { channelKey, snapshotOf, type Channel, type SavedEntry } from '../playlist/model';

export class LibraryService {
  private favKeys = new Map<string, Set<string>>();
  private listeners: Array<() => void> = [];

  constructor(private data: DataClient) {}

  onChange(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  async ensureFavorites(sourceId: string): Promise<Set<string>> {
    let set = this.favKeys.get(sourceId);
    if (!set) {
      const list = await this.data.call('library.list', 'favorites', sourceId);
      set = new Set(list.map((e) => e.key));
      this.favKeys.set(sourceId, set);
    }
    return set;
  }

  isFavorite(sourceId: string, ch: Channel): boolean {
    const set = this.favKeys.get(sourceId);
    return !!set && set.has(channelKey(ch));
  }

  async toggleFavorite(sourceId: string, ch: Channel): Promise<boolean> {
    const set = await this.ensureFavorites(sourceId);
    const now = await this.data.call('library.toggleFavorite', entry(sourceId, ch));
    const key = channelKey(ch);
    if (now) set.add(key);
    else set.delete(key);
    this.emit();
    return now;
  }

  async addHistory(sourceId: string, ch: Channel): Promise<void> {
    await this.data.call('library.addHistory', entry(sourceId, ch));
    this.emit();
  }

  list(kind: 'favorites' | 'history', sourceId: string): Promise<SavedEntry[]> {
    return this.data.call('library.list', kind, sourceId);
  }

  private emit(): void {
    for (const l of this.listeners.slice()) l();
  }
}

function entry(sourceId: string, ch: Channel): SavedEntry {
  const key = channelKey(ch);
  return { id: sourceId + '|' + key, sourceId, key, at: Date.now(), channel: snapshotOf(ch) };
}
