// CRUD das fontes + fonte ativa. Fonte de verdade: Store (IndexedDB na TV).

import type { Store } from '../storage/store';
import { newId } from '../storage/store';
import type { SettingsStore } from '../storage/settings';
import { sourceKey, type Source, type ValidSource } from '../playlist/source';

type Listener = () => void;

export class SourceService {
  private cache: Source[] = [];
  private listeners: Listener[] = [];

  constructor(private store: Store<Source>, private settings: SettingsStore) {}

  async load(): Promise<void> {
    this.cache = (await this.store.getAll()).sort((a, b) => a.createdAt - b.createdAt);
    const active = this.settings.get().activeSourceId;
    // fonte ativa removida/ausente: cai na primeira disponível
    if (!active || !this.cache.some((s) => s.id === active)) {
      this.settings.set({ activeSourceId: this.cache.length ? this.cache[0].id : null });
    }
  }

  onChange(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  list(): Source[] {
    return this.cache.slice();
  }

  get(id: string): Source | undefined {
    return this.cache.find((s) => s.id === id);
  }

  active(): Source | undefined {
    const id = this.settings.get().activeSourceId;
    return id ? this.get(id) : undefined;
  }

  /** Outra fonte com a mesma URL / servidor+usuário (ignora excludeId). */
  findDuplicate(v: Pick<Source, 'kind' | 'url' | 'server' | 'username'>, excludeId?: string): Source | undefined {
    const key = sourceKey(v);
    return this.cache.find((s) => s.id !== excludeId && sourceKey(s) === key);
  }

  async add(v: ValidSource): Promise<Source> {
    const now = Date.now();
    const s: Source = { ...v, id: newId(), createdAt: now, updatedAt: now };
    await this.store.put(s);
    this.cache.push(s);
    if (!this.settings.get().activeSourceId) this.settings.set({ activeSourceId: s.id });
    this.emit();
    return s;
  }

  async update(id: string, v: ValidSource): Promise<Source> {
    const cur = this.get(id);
    if (!cur) throw new Error('fonte inexistente');
    // credenciais/URL mudaram: o resultado da última verificação deixa de valer
    const changed = sourceKey(cur) !== sourceKey(v) || cur.password !== v.password;
    const s: Source = {
      ...cur,
      ...v,
      id,
      updatedAt: Date.now(),
      lastStatus: changed ? undefined : cur.lastStatus,
      lastError: changed ? undefined : cur.lastError,
      lastCheckAt: changed ? undefined : cur.lastCheckAt,
    };
    await this.store.put(s);
    this.cache = this.cache.map((x) => (x.id === id ? s : x));
    this.emit();
    return s;
  }

  async setStatus(id: string, ok: boolean, error?: string): Promise<void> {
    const cur = this.get(id);
    if (!cur) return;
    const s: Source = { ...cur, lastCheckAt: Date.now(), lastStatus: ok ? 'ok' : 'error', lastError: ok ? undefined : error };
    await this.store.put(s);
    this.cache = this.cache.map((x) => (x.id === id ? s : x));
    this.emit();
  }

  async remove(id: string): Promise<void> {
    await this.store.delete(id);
    this.cache = this.cache.filter((s) => s.id !== id);
    if (this.settings.get().activeSourceId === id) {
      this.settings.set({ activeSourceId: this.cache.length ? this.cache[0].id : null });
    }
    this.emit();
  }

  setActive(id: string): void {
    if (!this.get(id)) return;
    this.settings.set({ activeSourceId: id });
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners.slice()) l();
  }
}
