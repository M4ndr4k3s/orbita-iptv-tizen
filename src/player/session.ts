// Sessão de reprodução: abre o stream, acompanha o estado e se recupera de
// quedas (nova tentativa com espera crescente). Independe do motor e do relógio,
// então é testada no Node com um motor falso.

import type { EngineEvent, PlayerEngine } from './engine';

export type SessionStatus = 'idle' | 'connecting' | 'buffering' | 'playing' | 'paused' | 'retrying' | 'failed';

// quanto o tempo do vídeo precisa andar para contar como "aparecendo na tela"
const PROGRESS_MS = 300;

export interface SessionState {
  status: SessionStatus;
  /** tentativa atual (1..maxAttempts) */
  attempt: number;
  maxAttempts: number;
  /** % de buffer, quando informado */
  percent: number;
  /** código do último erro do motor (ou 'timeout' / 'stall') */
  error?: string;
  /** ms do open até o primeiro "playing" (só na primeira vez de cada stream) */
  firstFrameMs?: number;
  /** VOD: posição atual em ms */
  positionMs: number;
  /**
   * o tempo do vídeo já andou depois do "playing". Na TV o AVPlay às vezes diz
   * PLAYING e fica segundos sem desenhar quadro: a mini janela ficava preta.
   */
  progressing?: boolean;
}

export interface SessionOptions {
  maxAttempts?: number;
  /** sem começar a tocar em X ms = falha da tentativa */
  startTimeoutMs?: number;
  /** tocando e sem avanço de tempo por X ms = queda (stream congelado) */
  stallTimeoutMs?: number;
  backoffMs?: number[];
  /** ao vivo: fim do stream é queda, não fim */
  live?: boolean;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}

// erros em que repetir não adianta (formato/codec sem suporte, URL malformada)
const FATAL = /NOT_SUPPORTED|INVALID_URI|UNSUPPORTED|INVALID_PARAMETER/i;

// reabrir a mesma URL logo depois de fechar travava o AVPlay até o timeout (~20 s);
// com uma pausa curta (como na nova tentativa automática) abre em ~1,5 s
export const REOPEN_GAP_MS = 1000;

export class PlaybackSession {
  private st: SessionState;
  private url = '';
  private openedAt = 0;
  private hadFirstFrame = false;
  private startTimer: unknown = null;
  private stallTimer: unknown = null;
  /** tempo do vídeo no primeiro evento depois de abrir (-1 = ainda não veio) */
  private firstTimeMs = -1;
  private retryTimer: unknown = null;
  private listeners: Array<(s: SessionState) => void> = [];
  private subListeners: Array<(text: string, durationMs: number) => void> = [];
  private readonly o: Required<SessionOptions>;

  constructor(private engine: PlayerEngine, opts: SessionOptions = {}) {
    this.o = {
      maxAttempts: opts.maxAttempts || 3,
      startTimeoutMs: opts.startTimeoutMs || 20000,
      stallTimeoutMs: opts.stallTimeoutMs || 15000,
      backoffMs: opts.backoffMs || [1500, 3000, 6000],
      live: opts.live !== false,
      now: opts.now || (() => Date.now()),
      setTimer: opts.setTimer || ((fn, ms) => setTimeout(fn, ms)),
      clearTimer: opts.clearTimer || ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)),
    };
    this.st = { status: 'idle', attempt: 0, maxAttempts: this.o.maxAttempts, percent: 0, positionMs: 0 };
    engine.setListener((e) => this.onEngine(e));
  }

  get state(): SessionState {
    return this.st;
  }

  /** Legendas do motor (texto puro). */
  onSubtitle(fn: (text: string, durationMs: number) => void): () => void {
    this.subListeners.push(fn);
    return () => {
      this.subListeners = this.subListeners.filter((l) => l !== fn);
    };
  }

  /** URL em reprodução (vazia se parada). Não exibir/logar: pode ter credenciais. */
  get currentUrl(): string {
    return this.url;
  }

  /** Volta a escutar o motor (outra sessão pode ter assumido o listener). */
  attach(): void {
    this.engine.setListener((e) => this.onEngine(e));
  }

  onChange(fn: (s: SessionState) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  /** startMs: VOD, retomar desta posição. */
  play(url: string, startMs = 0): void {
    this.url = url;
    this.hadFirstFrame = false;
    this.st = { ...this.st, positionMs: this.o.live ? 0 : Math.max(0, startMs) };
    this.attemptOpen(1);
  }

  /** Reabre o stream (ajuste que só vale numa nova abertura): fecha, espera e abre. */
  restart(url: string, startMs = 0): void {
    this.clearAll();
    this.engine.stop();
    this.url = url;
    this.set({ status: 'connecting', attempt: 1, percent: 0, error: undefined });
    this.retryTimer = this.o.setTimer(() => this.play(url, startMs), REOPEN_GAP_MS);
  }

  /** VOD: pula para a posição; o vigia de travamento recomeça a contar. */
  seek(ms: number): void {
    if (this.o.live || !this.url) return;
    const st = this.st.status;
    if (st !== 'playing' && st !== 'paused' && st !== 'buffering') return;
    this.engine.seek(ms);
    this.set({ positionMs: Math.max(0, ms) });
    if (st !== 'paused') this.armStall();
  }

  /** Nova tentativa manual após falha ("Tentar novamente"). */
  retry(): void {
    if (this.url) this.play(this.url);
  }

  stop(): void {
    this.clearAll();
    this.url = '';
    this.engine.stop();
    this.set({ status: 'idle', attempt: 0, percent: 0, error: undefined });
  }

  togglePause(): void {
    if (this.st.status === 'playing') {
      this.engine.pause();
      this.clear('stall');
      this.set({ status: 'paused' });
    } else if (this.st.status === 'paused') {
      this.engine.resume();
      this.set({ status: 'playing' });
      this.armStall();
    }
  }

  private attemptOpen(attempt: number): void {
    this.clearAll();
    this.engine.stop();
    this.openedAt = this.o.now();
    this.firstTimeMs = -1;
    this.set({ status: 'connecting', attempt, percent: 0, error: undefined, progressing: false });
    this.startTimer = this.o.setTimer(() => this.fail('timeout'), this.o.startTimeoutMs);
    // VOD que caiu no meio volta de onde estava, não do começo
    this.engine.open(this.url, this.o.live ? 0 : this.st.positionMs);
  }

  private onEngine(e: EngineEvent): void {
    if (!this.url || this.st.status === 'failed' || this.st.status === 'retrying') return;
    switch (e.type) {
      case 'buffering':
        if (this.st.status !== 'paused') this.set({ status: this.st.status === 'connecting' ? 'connecting' : 'buffering', percent: e.percent });
        break;
      case 'playing': {
        this.clear('start');
        const patch: Partial<SessionState> = { status: 'playing', percent: 100, error: undefined };
        if (!this.hadFirstFrame) {
          this.hadFirstFrame = true;
          patch.firstFrameMs = this.o.now() - this.openedAt;
        }
        // tocou: uma queda futura volta a ter todas as tentativas
        patch.attempt = 1;
        this.set(patch);
        this.armStall();
        break;
      }
      case 'time':
        if (this.st.status === 'playing' || this.st.status === 'buffering') {
          if (this.st.status === 'buffering') this.set({ status: 'playing' });
          if (!this.o.live) this.st = { ...this.st, positionMs: e.ms };
          if (!this.st.progressing) {
            if (this.firstTimeMs < 0) this.firstTimeMs = e.ms;
            else if (e.ms - this.firstTimeMs >= PROGRESS_MS) this.set({ progressing: true });
          }
          this.armStall();
        }
        break;
      case 'ended':
        if (this.o.live) this.fail('ended');
        else {
          this.clearAll();
          this.set({ status: 'idle' });
        }
        break;
      case 'error':
        this.fail(e.code);
        break;
      case 'subtitle':
        for (const l of this.subListeners.slice()) l(e.text, e.durationMs);
        break;
    }
  }

  private fail(code: string): void {
    this.clearAll();
    this.engine.stop();
    const attempt = this.st.attempt || 1;
    if (FATAL.test(code) || attempt >= this.o.maxAttempts) {
      this.set({ status: 'failed', error: code });
      return;
    }
    const wait = this.o.backoffMs[Math.min(attempt - 1, this.o.backoffMs.length - 1)];
    this.set({ status: 'retrying', error: code });
    this.retryTimer = this.o.setTimer(() => this.attemptOpen(attempt + 1), wait);
  }

  private armStall(): void {
    this.clear('stall');
    this.stallTimer = this.o.setTimer(() => this.fail('stall'), this.o.stallTimeoutMs);
  }

  private clear(which: 'start' | 'stall' | 'retry'): void {
    const key = (which + 'Timer') as 'startTimer' | 'stallTimer' | 'retryTimer';
    if (this[key] != null) this.o.clearTimer(this[key]);
    this[key] = null;
  }

  private clearAll(): void {
    this.clear('start');
    this.clear('stall');
    this.clear('retry');
  }

  private set(patch: Partial<SessionState>): void {
    this.st = { ...this.st, ...patch };
    for (const l of this.listeners.slice()) l(this.st);
  }
}
