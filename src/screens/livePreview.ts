// Mini janela da TV ao vivo: toca o canal selecionado num retângulo do painel.
// O vídeo do AVPlay fica atrás do HTML, então o fundo (#backdrop) vira uma
// moldura com um furo do tamanho da janela (ver .preview em player.css).
// Só abre o stream depois que a seleção para: cada abertura custa rede e
// alguns servidores limitam conexões simultâneas.

import { getEngine } from '../player/engineFactory';
import { PlaybackSession, type SessionState } from '../player/session';
import type { VideoRect } from '../player/engine';

const START_DELAY_MS = 800;

export class LivePreview {
  private session: PlaybackSession | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsub: (() => void) | null = null;
  /** canal (channelKey) que a janela está tocando ou abrindo */
  key: string | null = null;

  constructor(private box: HTMLElement, private onState: (s: SessionState | null) => void) {}

  /** Agenda tocar `url` (o canal `key`) quando a seleção parar. */
  want(key: string, url: string | null): void {
    this.cancel();
    if (key === this.key && this.session && this.isActive()) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!url) return;
      this.key = key;
      this.ensure().play(url);
      this.layout();
    }, START_DELAY_MS);
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  state(): SessionState | null {
    return this.session ? this.session.state : null;
  }

  /** Está tocando (ou conectando) o canal `key`? */
  isShowing(key: string): boolean {
    return this.key === key && !!this.session && this.isActive();
  }

  /** Entrega a sessão para a tela cheia (sem reabrir o stream). */
  take(): PlaybackSession | null {
    this.cancel();
    const s = this.session;
    if (this.unsub) this.unsub();
    this.unsub = null;
    this.session = null;
    return s;
  }

  /** Recebe de volta a sessão da tela cheia e encolhe o vídeo para a janela. */
  adopt(session: PlaybackSession, key: string): void {
    this.cancel();
    if (this.session && this.session !== session) this.session.stop();
    this.session = session;
    this.key = key;
    session.attach();
    this.subscribe();
    this.layout();
    this.onState(session.state);
  }

  /** Reaplica o retângulo (ao voltar para a tela). */
  layout(): void {
    if (!this.session) return;
    const r = this.box.getBoundingClientRect();
    const rect: VideoRect = { x: r.left, y: r.top, w: r.width, h: r.height };
    const st = document.body.style;
    st.setProperty('--pv-x', rect.x + 'px');
    st.setProperty('--pv-y', rect.y + 'px');
    st.setProperty('--pv-w', rect.w + 'px');
    st.setProperty('--pv-h', rect.h + 'px');
    document.body.classList.add('preview');
    getEngine().setRect(rect);
  }

  stop(): void {
    this.cancel();
    if (this.unsub) this.unsub();
    this.unsub = null;
    if (this.session) this.session.stop();
    this.session = null;
    this.key = null;
    document.body.classList.remove('preview');
    this.onState(null);
  }

  private isActive(): boolean {
    const st = this.session ? this.session.state.status : 'idle';
    return st !== 'idle' && st !== 'failed';
  }

  private ensure(): PlaybackSession {
    if (!this.session) {
      // janela: uma tentativa a mais só; falhou, mostra "sem sinal" e segue
      this.session = new PlaybackSession(getEngine(), { live: true, maxAttempts: 2 });
      this.subscribe();
    } else this.session.attach();
    return this.session;
  }

  private subscribe(): void {
    if (this.unsub) this.unsub();
    const s = this.session!;
    this.unsub = s.onChange((st) => this.onState(st));
  }
}
