// Controle parental: PIN de 4 dígitos e categorias bloqueadas.
// O PIN fica como hash PBKDF2-SHA256 com salt aleatório (nunca em texto). Erros
// seguidos bloqueiam novas tentativas por um tempo crescente. É proteção de
// conveniência: os dados ficam na própria TV.

export type ContentKind = 'live' | 'movie' | 'series';

export const PIN_LENGTH = 4;
export const PBKDF2_ITERATIONS = 100000; // ~750 ms na TV
/** erros seguidos antes do primeiro bloqueio */
export const FREE_ATTEMPTS = 3;
const LOCK_BASE_MS = 30000;
const LOCK_MAX_MS = 15 * 60000;
const MAX_LOCKED = 500;
const KEY = 'orbita.parental.v1';

interface Stored {
  salt: string;
  hash: string;
  iter: number;
  fails: number;
  lockUntil: number;
  locked: string[];
}

export interface ParentalBackend {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface ParentalDeps {
  backend: ParentalBackend | null;
  now?: () => number;
  random?: (n: number) => Uint8Array;
  derive?: (pin: string, salt: Uint8Array, iter: number) => Promise<Uint8Array>;
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'wrong'; left: number } | { ok: false; reason: 'locked'; waitMs: number };

export function isValidPin(pin: string): boolean {
  return typeof pin === 'string' && pin.length === PIN_LENGTH && /^[0-9]+$/.test(pin);
}

export function lockKey(kind: ContentKind, group: string): string {
  return kind + ':' + group;
}

/** Tempo de bloqueio depois do erro número `fails` (0 enquanto houver tentativas livres). */
export function lockDuration(fails: number): number {
  if (fails < FREE_ATTEMPTS) return 0;
  return Math.min(LOCK_MAX_MS, LOCK_BASE_MS * Math.pow(2, fails - FREE_ATTEMPTS));
}

const toHex = (b: Uint8Array) => Array.prototype.map.call(b, (x: number) => (x < 16 ? '0' : '') + x.toString(16)).join('');
const fromHex = (s: string) => new Uint8Array((s.match(/../g) || []).map((h) => parseInt(h, 16)));

async function pbkdf2(pin: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as Uint8Array<ArrayBuffer>, iterations: iter, hash: 'SHA-256' }, key, 256);
  return new Uint8Array(bits);
}

/** Comparação em tempo constante (o tamanho é fixo). */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export class ParentalService {
  private st: Stored | null = null;
  private unlocked = false;
  private listeners: Array<() => void> = [];
  private readonly now: () => number;
  private readonly random: (n: number) => Uint8Array;
  private readonly derive: (pin: string, salt: Uint8Array, iter: number) => Promise<Uint8Array>;

  constructor(private deps: ParentalDeps) {
    this.now = deps.now || (() => Date.now());
    this.random = deps.random || ((n) => crypto.getRandomValues(new Uint8Array(n)));
    this.derive = deps.derive || pbkdf2;
    this.st = this.load();
  }

  private load(): Stored | null {
    try {
      const raw = this.deps.backend ? this.deps.backend.getItem(KEY) : null;
      if (!raw) return null;
      const p = JSON.parse(raw) as Partial<Stored>;
      const hex = /^[0-9a-f]+$/;
      if (typeof p.salt !== 'string' || !hex.test(p.salt) || typeof p.hash !== 'string' || !hex.test(p.hash) || p.hash.length !== 64) return null;
      return {
        salt: p.salt,
        hash: p.hash,
        iter: typeof p.iter === 'number' && p.iter >= 10000 && p.iter <= 1000000 ? p.iter : PBKDF2_ITERATIONS,
        fails: typeof p.fails === 'number' && p.fails >= 0 ? Math.min(p.fails, 50) : 0,
        lockUntil: typeof p.lockUntil === 'number' ? p.lockUntil : 0,
        locked: Array.isArray(p.locked) ? p.locked.filter((k) => typeof k === 'string' && /^(live|movie|series):/.test(k)).slice(0, MAX_LOCKED) : [],
      };
    } catch {
      return null;
    }
  }

  private save(): void {
    try {
      if (!this.deps.backend) return;
      if (this.st) this.deps.backend.setItem(KEY, JSON.stringify(this.st));
      else this.deps.backend.removeItem(KEY);
    } catch {
      /* storage indisponível: vale só nesta sessão */
    }
    for (const l of this.listeners.slice()) l();
  }

  onChange(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  hasPin(): boolean {
    return !!this.st;
  }

  /** PIN digitado certo nesta sessão: conteúdo bloqueado liberado até fechar o app. */
  isUnlocked(): boolean {
    return !this.st || this.unlocked;
  }

  lockSession(): void {
    this.unlocked = false;
    for (const l of this.listeners.slice()) l();
  }

  async setPin(pin: string): Promise<void> {
    if (!isValidPin(pin)) throw new Error('PIN inválido');
    const salt = this.random(16);
    const hash = await this.derive(pin, salt, PBKDF2_ITERATIONS);
    this.st = { salt: toHex(salt), hash: toHex(hash), iter: PBKDF2_ITERATIONS, fails: 0, lockUntil: 0, locked: this.st ? this.st.locked : [] };
    this.unlocked = true;
    this.save();
  }

  /** Remove o PIN e todos os bloqueios. Exige ter verificado o PIN antes. */
  clear(): void {
    this.st = null;
    this.unlocked = false;
    this.save();
  }

  /** Espera restante do bloqueio por erros (0 = pode tentar). */
  waitMs(): number {
    return this.st ? Math.max(0, this.st.lockUntil - this.now()) : 0;
  }

  async verify(pin: string): Promise<VerifyResult> {
    const st = this.st;
    if (!st) return { ok: true };
    const wait = this.waitMs();
    if (wait > 0) return { ok: false, reason: 'locked', waitMs: wait };
    const got = isValidPin(pin) ? await this.derive(pin, fromHex(st.salt), st.iter) : new Uint8Array(0);
    if (sameBytes(got, fromHex(st.hash))) {
      st.fails = 0;
      st.lockUntil = 0;
      this.unlocked = true;
      this.save();
      return { ok: true };
    }
    st.fails++;
    const lock = lockDuration(st.fails);
    if (lock > 0) {
      st.lockUntil = this.now() + lock;
      this.save();
      return { ok: false, reason: 'locked', waitMs: lock };
    }
    this.save();
    return { ok: false, reason: 'wrong', left: FREE_ATTEMPTS - st.fails };
  }

  isGroupLocked(kind: ContentKind, group: string): boolean {
    return !!this.st && this.st.locked.indexOf(lockKey(kind, group)) >= 0;
  }

  /** Categoria bloqueada e sessão ainda não liberada pelo PIN. */
  isBlocked(kind: ContentKind, group: string | undefined): boolean {
    return !this.isUnlocked() && group != null && this.isGroupLocked(kind, group);
  }

  /** Grupos a esconder agora ("Todos", busca, CH±): vazio com a sessão liberada. */
  hiddenGroups(kind: ContentKind): string[] {
    if (this.isUnlocked() || !this.st) return [];
    const p = kind + ':';
    return this.st.locked.filter((k) => k.indexOf(p) === 0).map((k) => k.slice(p.length));
  }

  setGroupLocked(kind: ContentKind, group: string, locked: boolean): void {
    if (!this.st) return;
    const k = lockKey(kind, group);
    const i = this.st.locked.indexOf(k);
    if (locked && i < 0 && this.st.locked.length < MAX_LOCKED) this.st.locked.push(k);
    if (!locked && i >= 0) this.st.locked.splice(i, 1);
    this.save();
  }

  lockedCount(): number {
    return this.st ? this.st.locked.length : 0;
  }
}

function localBackend(): ParentalBackend | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const parental = typeof window !== 'undefined' ? new ParentalService({ backend: localBackend() }) : new ParentalService({ backend: null });
