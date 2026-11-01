// Motor AVPlay (webapis.avplay): decodificação por hardware da TV Samsung.
// O vídeo é desenhado numa camada atrás do HTML, no retângulo do <object>.

import type { AspectMode, EngineEvent, PlayerEngine, StreamInfo, VideoRect } from './engine';

interface AVPlayListener {
  onbufferingstart?(): void;
  onbufferingprogress?(percent: number): void;
  onbufferingcomplete?(): void;
  oncurrentplaytime?(ms: number): void;
  onstreamcompleted?(): void;
  onevent?(type: string, data: string): void;
  onerror?(type: string): void;
  onsubtitlechange?(duration: number, text: string): void;
  ondrmevent?(type: string, data: unknown): void;
}

interface AVPlayStreamInfo {
  index: number;
  type: 'VIDEO' | 'AUDIO' | 'TEXT';
  extra_info: string;
}

export interface AVPlay {
  open(url: string): void;
  close(): void;
  prepareAsync(ok: () => void, err: (e: { name?: string; message?: string }) => void): void;
  play(): void;
  pause(): void;
  stop(): void;
  getState(): string;
  setListener(l: AVPlayListener): void;
  setDisplayRect(x: number, y: number, w: number, h: number): void;
  setDisplayMethod(m: string): void;
  setStreamingProperty?(name: string, value: string): void;
  setTimeoutForBuffering?(seconds: number): void;
  getCurrentStreamInfo(): AVPlayStreamInfo[];
  seekTo(ms: number, ok?: () => void, err?: () => void): void;
  getDuration(): number;
  getTotalTrackInfo?(): AVPlayStreamInfo[];
  setSelectTrack?(type: string, index: number): void;
  setBufferingParam?(option: string, unit: string, amount: number): void;
  suspend(): void;
  restore(): void;
}

const PREPARE_GUARD_MS = 30000;

export function getAvplay(): AVPlay | null {
  const w = window.webapis as { avplay?: AVPlay } | undefined;
  return w && w.avplay ? w.avplay : null;
}

function parseExtra(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export class AvplayEngine implements PlayerEngine {
  readonly name = 'avplay';
  private listener: (e: EngineEvent) => void = () => undefined;
  private started = false;
  private openSeq = 0;
  private rect: VideoRect | null = null;
  private preparing = false;
  private prepSeq = 0;
  private next: { url: string; seq: number; startMs: number } | 'stop' | null = null;
  private seeking = false;
  private aspect: AspectMode = 'auto';
  private bufferSec = 0;
  private seekTarget = -1;
  private prepTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private av: AVPlay) {
    // o AVPlay precisa de um <object type="application/avplayer"> no documento
    if (!document.getElementById('av-player')) {
      const obj = document.createElement('object');
      obj.id = 'av-player';
      obj.setAttribute('type', 'application/avplayer');
      document.body.insertBefore(obj, document.body.firstChild);
    }
  }

  setListener(fn: (e: EngineEvent) => void): void {
    this.listener = fn;
  }

  /**
   * O AVPlay da TV cai (o app inteiro fecha) se receber stop/close/open enquanto
   * um prepareAsync ainda não respondeu — acontecia ao trocar rápido de canal com
   * a mini janela. Então as operações são serializadas: durante o preparo, só a
   * última pedida fica guardada e roda quando o preparo responde.
   */
  open(url: string, startMs = 0): void {
    this.openSeq++;
    this.seeking = false;
    this.seekTarget = -1;
    if (this.preparing) {
      this.next = { url, seq: this.openSeq, startMs };
      return;
    }
    this.doOpen(url, this.openSeq, startMs);
  }

  /** seekTo também é assíncrono: um por vez, o último pedido vence. */
  seek(ms: number): void {
    const target = Math.max(0, Math.floor(ms));
    if (this.preparing || this.seeking) {
      this.seekTarget = target;
      return;
    }
    const st = this.state();
    if (st !== 'PLAYING' && st !== 'PAUSED' && st !== 'READY') return;
    this.seeking = true;
    const seq = this.openSeq;
    const done = () => {
      if (seq !== this.openSeq) return;
      this.seeking = false;
      if (this.seekTarget >= 0) {
        const t = this.seekTarget;
        this.seekTarget = -1;
        this.seek(t);
      }
    };
    try {
      this.av.seekTo(target, done, done);
    } catch {
      done();
    }
  }

  duration(): number {
    try {
      const d = this.av.getDuration();
      return d > 0 ? d : 0;
    } catch {
      return 0;
    }
  }

  stop(): void {
    this.openSeq++;
    if (this.preparing) {
      this.next = 'stop';
      return;
    }
    this.doStop();
  }

  private doOpen(url: string, seq: number, startMs = 0): void {
    this.doStop();
    this.started = false;
    // eventos de um stream antigo (troca rápida de canal) são descartados
    const emit = (e: EngineEvent) => {
      if (seq === this.openSeq) this.listener(e);
    };
    const pid = ++this.prepSeq;
    const prepared = () => {
      // resposta atrasada de um preparo já abandonado pelo vigia: ignora
      if (pid !== this.prepSeq) return true;
      if (this.prepTimer) clearTimeout(this.prepTimer);
      this.prepTimer = null;
      this.preparing = false;
      return this.runNext();
    };
    try {
      this.av.open(url);
      this.av.setListener({
        onbufferingstart: () => emit({ type: 'buffering', percent: 0 }),
        onbufferingprogress: (p) => emit({ type: 'buffering', percent: p }),
        onbufferingcomplete: () => undefined,
        oncurrentplaytime: (ms) => {
          // primeiro avanço de tempo = imagem na tela de verdade
          if (!this.started) {
            this.started = true;
            emit({ type: 'playing' });
          }
          emit({ type: 'time', ms });
        },
        onstreamcompleted: () => emit({ type: 'ended' }),
        onerror: (type) => emit({ type: 'error', code: String(type || 'PLAYER_ERROR') }),
        onevent: () => undefined,
        onsubtitlechange: (duration, text) => emit({ type: 'subtitle', text: plainText(text), durationMs: Number(duration) || 0 }),
        ondrmevent: () => undefined,
      });
      this.applyRect();
      // buffer só pode ser ajustado antes do preparo. Só o de retomada (depois de uma
      // travada): mexer no inicial (FOR_PLAY) deixou a abertura em ~25 s na TV
      if (this.bufferSec > 0 && this.av.setBufferingParam) {
        try {
          this.av.setBufferingParam('PLAYER_BUFFER_FOR_RESUME', 'PLAYER_BUFFER_SIZE_IN_SECOND', this.bufferSec);
        } catch {
          /* firmware sem suporte: segue com o padrão */
        }
      }
      this.preparing = true;
      // preparo que nunca responde: libera a fila (a sessão já terá desistido por timeout)
      this.prepTimer = setTimeout(() => {
        this.prepTimer = null;
        this.prepSeq++;
        this.preparing = false;
        if (!this.runNext()) this.doStop();
      }, PREPARE_GUARD_MS);
      this.av.prepareAsync(
        () => {
          if (prepared() || seq !== this.openSeq) return;
          // o retângulo pode ter mudado durante o preparo (mini janela ↔ tela cheia)
          this.applyRect();
          const play = () => {
            if (seq !== this.openSeq) return;
            try {
              this.av.play();
            } catch (e) {
              emit({ type: 'error', code: errName(e) });
            }
          };
          // retomar de onde parou: posiciona antes de tocar (se falhar, toca do início)
          if (startMs > 0) {
            try {
              this.av.seekTo(startMs, play, play);
            } catch {
              play();
            }
          } else play();
        },
        (e) => {
          if (prepared()) return;
          emit({ type: 'error', code: (e && e.name) || 'PLAYER_ERROR_PREPARE' });
        },
      );
    } catch (e) {
      this.preparing = false;
      emit({ type: 'error', code: errName(e) });
    }
  }

  /** Executa a operação guardada durante o preparo; true se havia uma. */
  private runNext(): boolean {
    const n = this.next;
    this.next = null;
    if (!n) return false;
    if (n === 'stop') this.doStop();
    else if (n.seq === this.openSeq) this.doOpen(n.url, n.seq, n.startMs);
    else this.doStop();
    return true;
  }

  setRect(r: VideoRect | null): void {
    this.rect = r;
    // durante o preparo não mexe (aplicado quando ele responder); sem stream, no próximo open()
    if (this.preparing) return;
    const st = this.state();
    if (st === 'READY' || st === 'PLAYING' || st === 'PAUSED') this.applyRect();
  }

  setAspect(mode: AspectMode): void {
    this.aspect = mode;
    if (this.preparing) return;
    const st = this.state();
    if (st === 'READY' || st === 'PLAYING' || st === 'PAUSED') this.applyRect();
  }

  setBuffer(seconds: number): void {
    this.bufferSec = Math.max(0, Math.min(30, Math.floor(seconds)));
  }

  selectTrack(kind: 'audio' | 'text', index: number): boolean {
    if (!this.av.setSelectTrack) return false;
    try {
      this.av.setSelectTrack(kind === 'audio' ? 'AUDIO' : 'TEXT', index);
      return true;
    } catch {
      return false;
    }
  }

  private applyRect(): void {
    const box = displayBox(this.rect, this.rect ? 'auto' : this.aspect);
    try {
      this.av.setDisplayMethod(box.method);
      this.av.setDisplayRect(box.x, box.y, box.w, box.h);
    } catch {
      /* estado sem vídeo */
    }
  }

  private doStop(): void {
    try {
      const s = this.av.getState();
      if (s !== 'NONE' && s !== 'IDLE') this.av.stop();
      if (s !== 'NONE') this.av.close();
    } catch {
      /* já parado */
    }
  }

  pause(): void {
    try {
      this.av.pause();
    } catch {
      /* estado inválido para pausar */
    }
  }

  resume(): void {
    try {
      this.av.play();
    } catch {
      /* estado inválido */
    }
  }

  state(): string {
    try {
      return this.av.getState();
    } catch {
      return 'UNKNOWN';
    }
  }

  info(): StreamInfo | null {
    // consultar faixas durante o preparo travava a abertura do stream na TV
    // (o preparo não respondia e caía no timeout): só com o vídeo pronto
    if (this.preparing) return null;
    const state = this.state();
    if (state !== 'READY' && state !== 'PLAYING' && state !== 'PAUSED') return null;
    let list: AVPlayStreamInfo[];
    try {
      list = this.av.getTotalTrackInfo ? this.av.getTotalTrackInfo() : this.av.getCurrentStreamInfo();
    } catch {
      return null;
    }
    const out: StreamInfo = { audioTracks: [], subtitleTracks: [] };
    try {
      for (const c of this.av.getCurrentStreamInfo() || []) {
        if (c.type === 'AUDIO') out.currentAudio = c.index;
        else if (c.type === 'TEXT') out.currentText = c.index;
      }
    } catch {
      /* sem stream */
    }
    for (const t of list || []) {
      const x = parseExtra(t.extra_info);
      if (t.type === 'VIDEO') {
        out.width = Number(x.Width) || undefined;
        out.height = Number(x.Height) || undefined;
        out.videoCodec = typeof x.fourCC === 'string' ? x.fourCC : undefined;
      } else if (t.type === 'AUDIO') {
        out.audioTracks.push({ index: t.index, language: String(x.language || ''), codec: typeof x.fourCC === 'string' ? x.fourCC : undefined });
      } else if (t.type === 'TEXT') {
        out.subtitleTracks.push({ index: t.index, language: String(x.track_lang || x.language || '') });
      }
    }
    return out;
  }

  suspend(): void {
    try {
      this.av.suspend();
    } catch {
      /* nada tocando */
    }
  }

  restore(): void {
    try {
      this.av.restore();
    } catch {
      /* nada a restaurar */
    }
  }
}

/**
 * Retângulo e modo do AVPlay para a proporção pedida. 16:9 e 4:3 = vídeo
 * esticado dentro de uma caixa centralizada dessa proporção.
 */
export function displayBox(rect: VideoRect | null, mode: AspectMode): { x: number; y: number; w: number; h: number; method: string } {
  const r = rect || { x: 0, y: 0, w: 1920, h: 1080 };
  const round = (b: { x: number; y: number; w: number; h: number }, method: string) => ({
    x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h), method,
  });
  if (mode === 'auto') return round(r, 'PLAYER_DISPLAY_MODE_LETTER_BOX');
  if (mode === 'fill') return round(r, 'PLAYER_DISPLAY_MODE_FULL_SCREEN');
  const ratio = mode === '4:3' ? 4 / 3 : 16 / 9;
  let w = r.w;
  let h = w / ratio;
  if (h > r.h) {
    h = r.h;
    w = h * ratio;
  }
  return round({ x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h }, 'PLAYER_DISPLAY_MODE_FULL_SCREEN');
}

/** Legenda do AVPlay pode vir com marcação (<i>, <font>): exibida só como texto. */
export function plainText(s: unknown): string {
  return String(s == null ? '' : s)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // o AVPlay manda o texto com um caractere nulo no fim (visto na TV)
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 500);
}

function errName(e: unknown): string {
  return e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : 'PLAYER_ERROR';
}
