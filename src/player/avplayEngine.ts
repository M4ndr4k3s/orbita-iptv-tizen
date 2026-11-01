// Motor AVPlay (webapis.avplay): decodificação por hardware da TV Samsung.
// O vídeo é desenhado numa camada atrás do HTML, no retângulo do <object>.

import type { EngineEvent, PlayerEngine, StreamInfo, VideoRect } from './engine';

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
  getTotalTrackInfo?(): AVPlayStreamInfo[];
  setSelectTrack?(type: string, index: number): void;
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
  private next: { url: string; seq: number } | 'stop' | null = null;
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
  open(url: string): void {
    this.openSeq++;
    if (this.preparing) {
      this.next = { url, seq: this.openSeq };
      return;
    }
    this.doOpen(url, this.openSeq);
  }

  stop(): void {
    this.openSeq++;
    if (this.preparing) {
      this.next = 'stop';
      return;
    }
    this.doStop();
  }

  private doOpen(url: string, seq: number): void {
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
        onsubtitlechange: () => undefined,
        ondrmevent: () => undefined,
      });
      this.applyRect();
      this.av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
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
          try {
            this.av.play();
          } catch (e) {
            emit({ type: 'error', code: errName(e) });
          }
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
    else if (n.seq === this.openSeq) this.doOpen(n.url, n.seq);
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

  private applyRect(): void {
    const r = this.rect;
    try {
      if (r) this.av.setDisplayRect(Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h));
      else this.av.setDisplayRect(0, 0, 1920, 1080);
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
    let list: AVPlayStreamInfo[];
    try {
      list = this.av.getTotalTrackInfo ? this.av.getTotalTrackInfo() : this.av.getCurrentStreamInfo();
    } catch {
      return null;
    }
    const out: StreamInfo = { audioTracks: [], subtitleTracks: [] };
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

function errName(e: unknown): string {
  return e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : 'PLAYER_ERROR';
}
