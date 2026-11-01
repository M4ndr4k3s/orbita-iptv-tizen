// Contrato de armazenamento de registros por id. A implementação real é o
// IndexedDB (db.ts); os testes usam a versão em memória.

export interface Store<T extends { id: string }> {
  get(id: string): Promise<T | undefined>;
  getAll(): Promise<T[]>;
  put(value: T): Promise<void>;
  delete(id: string): Promise<void>;
}

export class MemoryStore<T extends { id: string }> implements Store<T> {
  private data = new Map<string, T>();

  async get(id: string): Promise<T | undefined> {
    const v = this.data.get(id);
    return v ? (JSON.parse(JSON.stringify(v)) as T) : undefined;
  }

  async getAll(): Promise<T[]> {
    return Array.from(this.data.values()).map((v) => JSON.parse(JSON.stringify(v)) as T);
  }

  async put(value: T): Promise<void> {
    this.data.set(value.id, JSON.parse(JSON.stringify(value)) as T);
  }

  async delete(id: string): Promise<void> {
    this.data.delete(id);
  }
}

/** id aleatório de 16 bytes em hex (crypto.getRandomValues existe no Chromium 76 e no Node). */
export function newId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let s = '';
  for (let i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
  return s;
}
