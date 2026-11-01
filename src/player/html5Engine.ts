// Motor <video> para o navegador de desenvolvimento (preview). Na TV usa-se o
// AVPlay. Sem hls.js: aqui HLS só toca onde o navegador suporta nativamente.

import type { AspectMode, EngineEvent, PlayerEngine, StreamInfo, VideoRect } from './engine';

export class Html5Engine implements PlayerEngine {
  readonly name = 'html5';
  private video: HTMLVideoElement;
  private listener: (e: EngineEvent) => void = () => undefined;
  private started = false;

  constructor() {
    this.video = document.createElement('video');
    this.video.id = 'html5-player';
    this.video.setAttribute('playsinline', '');
    document.body.insertBefore(this.video, document.body.firstChild);
    const v = this.video;
    v.addEventListener('waiting', () => this.listener({ type: 'buffering', percent: 0 }));
    v.addEventListener('timeupdate', () => {
      if (!v.src) return;
      if (!this.started && v.currentTime > 0) {
        this.started = true;
        this.listener({ type: 'playing' });
      }
      this.listener({ type: 'time', ms: Math.round(v.currentTime * 1000) });
    });
    v.addEventListener('ended', () => this.listener({ type: 'ended' }));
    v.addEventListener('error', () => {
      if (!v.getAttribute('src')) return;
      const code = v.error ? v.error.code : 0;
      this.listener({ type: 'error', code: code === 4 ? 'MEDIA_ERR_SRC_NOT_SUPPORTED' : 'MEDIA_ERR_' + code });
    });
  }

  setListener(fn: (e: EngineEvent) => void): void {
    this.listener = fn;
  }

  open(url: string, startMs = 0): void {
    this.started = false;
    this.video.src = url;
    if (startMs > 0) {
      const v = this.video;
      const go = () => {
        v.removeEventListener('loadedmetadata', go);
        v.currentTime = startMs / 1000;
      };
      v.addEventListener('loadedmetadata', go);
    }
    this.video.play().catch(() => undefined);
  }

  seek(ms: number): void {
    if (this.video.getAttribute('src')) this.video.currentTime = Math.max(0, ms / 1000);
  }

  duration(): number {
    const d = this.video.duration;
    return isFinite(d) && d > 0 ? Math.round(d * 1000) : 0;
  }

  stop(): void {
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }

  pause(): void {
    this.video.pause();
  }

  resume(): void {
    this.video.play().catch(() => undefined);
  }

  state(): string {
    const v = this.video;
    if (!v.getAttribute('src')) return 'IDLE';
    return v.paused ? 'PAUSED' : 'PLAYING';
  }

  info(): StreamInfo | null {
    return { width: this.video.videoWidth || undefined, height: this.video.videoHeight || undefined, audioTracks: [], subtitleTracks: [] };
  }

  setRect(r: VideoRect | null): void {
    const st = this.video.style;
    st.left = r ? r.x + 'px' : '';
    st.top = r ? r.y + 'px' : '';
    st.width = r ? r.w + 'px' : '';
    st.height = r ? r.h + 'px' : '';
  }

  setAspect(mode: AspectMode): void {
    // no navegador de dev: só automático x esticar
    this.video.style.objectFit = mode === 'auto' ? 'contain' : 'fill';
  }

  selectTrack(): boolean {
    return false;
  }

  setBuffer(): void {
    /* sem controle de buffer no <video> */
  }

  suspend(): void {
    this.video.pause();
  }

  restore(): void {
    this.video.play().catch(() => undefined);
  }
}
