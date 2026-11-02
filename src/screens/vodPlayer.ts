// Reprodução de filme ou episódio: barra de progresso, avançar/voltar (←/→ 10 s,
// ⏪/⏩ 1 min), pausa e retomada de onde parou.

import { el, clear } from '../utils/dom';
import type { Screen } from '../app/screen';
import type { AppContext } from '../app/context';
import type { RemoteKey } from '../navigation/keys';
import { focus } from '../navigation/focus';
import { button } from '../components/button';
import { choose } from '../components/dialog';
import { getEngine } from '../player/engineFactory';
import { PlaybackSession, type SessionState } from '../player/session';
import type { PlayerEngine } from '../player/engine';
import { resume } from '../storage/resume';
import { fmtTime } from '../services/vodInfo';
import { t } from '../services/i18n';
import { openPlayerOptions, SubtitleView } from '../components/playerOptions';
import { OsdBar } from '../components/osdBar';
import { applyEnginePrefs, applyTrackPrefs } from '../player/preferences';

declare const __DEV__: boolean;

export interface VodItem {
  title: string;
  subtitle?: string;
  /** URL montada na hora (pode ter credenciais: nunca exibir/logar) */
  url: string;
  /** chave de retomada (fonte + tipo + id) */
  key: string;
  /** duração informada pelo catálogo, até o player saber a real */
  durationMs?: number;
}

const OSD_MS = 5000;
const SEEK_COMMIT_MS = 700;
const SAVE_EVERY_MS = 15000;

export class VodPlayerScreen implements Screen {
  readonly root: HTMLElement;
  private engine: PlayerEngine;
  private session: PlaybackSession;
  private unsub: (() => void) | null = null;
  private osd: HTMLElement;
  private buttons: OsdBar;
  /** OK abriu os botões: ←/→ andam neles em vez de avançar/voltar o vídeo */
  private barMode = false;
  private status: HTMLElement;
  private bar: HTMLElement;
  private pos: HTMLElement;
  private dur: HTMLElement;
  private errorBox: HTMLElement;
  private osdTimer: ReturnType<typeof setTimeout> | null = null;
  private seekTimer: ReturnType<typeof setTimeout> | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private seekTarget = -1;
  private lastSave = 0;
  private started = false;
  private subs = new SubtitleView();
  private unsubSubs: (() => void) | null = null;
  private tracksDone = false;
  private onVisibility = () => {
    if (document.hidden) {
      this.save();
      this.engine.suspend();
    } else this.engine.restore();
  };

  /** onEnded: chamado quando o vídeo termina (ex.: próximo episódio); sem ele, volta. */
  constructor(private ctx: AppContext, private item: VodItem, private onEnded?: () => void) {
    this.engine = getEngine();
    this.session = new PlaybackSession(this.engine, { live: false, stallTimeoutMs: 20000 });
    this.status = el('div', { class: 'osd-status' });
    this.bar = el('div', { class: 'vod-bar-fill' });
    this.pos = el('span', { class: 'vod-time' });
    this.dur = el('span', { class: 'vod-time' });
    this.buttons = new OsdBar([
      { id: 'pause', label: t('osd.pause'), icon: 'pause', run: () => this.togglePause() },
      { id: 'back10', label: t('osd.back10'), icon: 'rewind', run: () => this.nudge(-10000) },
      { id: 'fwd10', label: t('osd.fwd10'), icon: 'forward', run: () => this.nudge(10000) },
      { id: 'options', label: t('osd.options'), icon: 'settings', run: () => this.options() },
    ]);
    this.osd = el('div', { class: 'osd vod-osd visible' }, [
      el('div', { class: 'osd-top' }, [
        el('div', { class: 'osd-text' }, [
          el('div', { class: 'osd-line' }, [el('div', { class: 'osd-name', text: item.title })]),
          el('div', { class: 'osd-group', text: item.subtitle || '' }),
        ]),
      ]),
      el('div', { class: 'osd-bottom vod-bottom' }, [
        el('div', { class: 'vod-progress' }, [this.pos, el('div', { class: 'vod-bar' }, [this.bar]), this.dur]),
        el('div', { class: 'vod-row' }, [this.status, el('div', { class: 'osd-hint', text: t('vod.hint') })]),
        this.buttons.root,
      ]),
    ]);
    this.errorBox = el('div', { class: 'player-error hidden' });
    this.root = el('div', { class: 'screen player' }, [this.subs.root, this.osd, this.errorBox]);
  }

  mount(): void {
    document.body.classList.add('playing');
    const shell = document.querySelector('.shell');
    if (shell) shell.classList.add('immersive');
    document.addEventListener('visibilitychange', this.onVisibility);
    this.unsub = this.session.onChange((s) => this.render(s));
    this.unsubSubs = this.session.onSubtitle((txt, d) => this.subs.show(txt, d));
    applyEnginePrefs(this.engine);
    this.engine.setRect(null);
    this.tick = setInterval(() => this.onTick(), 500);
    if (__DEV__) (window as unknown as Record<string, unknown>).__orbitaVod = () => this.debugState();
    void this.start();
  }

  unmount(): void {
    this.save();
    this.session.stop();
    if (this.unsub) this.unsub();
    if (this.unsubSubs) this.unsubSubs();
    this.subs.clear();
    for (const tm of [this.osdTimer, this.seekTimer]) if (tm) clearTimeout(tm);
    if (this.tick) clearInterval(this.tick);
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.body.classList.remove('playing');
    const shell = document.querySelector('.shell');
    if (shell) shell.classList.remove('immersive');
    if (__DEV__) delete (window as unknown as Record<string, unknown>).__orbitaVod;
  }

  /** Back com os botões abertos só fecha os botões. */
  onBack(): boolean {
    if (this.barMode) {
      this.setBarMode(false);
      return false;
    }
    return true;
  }

  private setBarMode(on: boolean): void {
    this.barMode = on;
    this.osd.classList.toggle('bar-mode', on);
    if (on) this.showOsd();
  }

  private togglePause(): void {
    this.session.togglePause();
    this.showOsd();
  }

  private options(): void {
    void openPlayerOptions({
      engine: this.engine,
      reopen: () => this.session.restart(this.item.url, this.session.state.positionMs),
      setSubtitles: (on) => this.subs.setOn(on),
      subtitlesOn: () => this.subs.on,
      liveXtream: false,
    }).then(() => this.showOsd());
  }

  onKey(key: RemoteKey): boolean {
    if (!this.errorBox.classList.contains('hidden')) return false;
    if (!this.started) return false;
    if (this.barMode) {
      if (key.action === 'left' || key.action === 'right') {
        this.buttons.move(key.action === 'left' ? -1 : 1);
        this.showOsd();
        return true;
      }
      if (key.action === 'ok') {
        this.buttons.activate();
        this.showOsd();
        return true;
      }
      if (key.action === 'up') {
        this.setBarMode(false);
        return true;
      }
    }
    switch (key.action) {
      case 'left':
        this.nudge(-10000);
        return true;
      case 'right':
        this.nudge(10000);
        return true;
      case 'rw':
        this.nudge(-60000);
        return true;
      case 'ff':
        this.nudge(60000);
        return true;
      case 'ok':
      case 'down':
        this.setBarMode(true);
        return true;
      case 'info':
        if (this.osd.classList.contains('visible')) this.osd.classList.remove('visible');
        else this.showOsd();
        return true;
      case 'up':
        this.showOsd();
        return true;
      case 'playPause':
      case 'play':
      case 'pause':
        if ((key.action === 'play' && this.session.state.status !== 'paused') || (key.action === 'pause' && this.session.state.status === 'paused')) return true;
        this.session.togglePause();
        this.showOsd();
        return true;
      case 'stop':
        this.ctx.back();
        return true;
      case 'green':
        this.options();
        return true;
      default:
        return false;
    }
  }

  private async start(): Promise<void> {
    const at = resume.get(this.item.key);
    let from = 0;
    if (at > 0) {
      const r = await choose(t('vod.resume.title'), t('vod.resume.body', { t: fmtTime(at) }), [
        { id: 'resume', label: t('vod.resume.continue'), primary: true },
        { id: 'start', label: t('vod.resume.start') },
      ]);
      // Voltar no diálogo: sai sem tocar
      if (r === null) return this.ctx.back();
      if (r === 'resume') from = at;
    }
    this.started = true;
    this.session.play(this.item.url, from);
    this.showOsd();
  }

  /** ←/→ acumulam o salto; o seek de verdade sai quando o usuário para de apertar. */
  private nudge(deltaMs: number): void {
    const st = this.session.state;
    if (st.status !== 'playing' && st.status !== 'paused' && st.status !== 'buffering') return;
    const dur = this.durationMs();
    const base = this.seekTarget >= 0 ? this.seekTarget : st.positionMs;
    this.seekTarget = Math.max(0, dur > 0 ? Math.min(dur - 3000, base + deltaMs) : base + deltaMs);
    this.paintProgress();
    this.showOsd(true);
    if (this.seekTimer) clearTimeout(this.seekTimer);
    this.seekTimer = setTimeout(() => {
      const target = this.seekTarget;
      this.seekTarget = -1;
      this.session.seek(target);
      this.showOsd();
    }, SEEK_COMMIT_MS);
  }

  private durationMs(): number {
    return this.engine.duration() || this.item.durationMs || 0;
  }

  private onTick(): void {
    if (this.osd.classList.contains('visible')) this.paintProgress();
    const now = Date.now();
    if (now - this.lastSave > SAVE_EVERY_MS && this.session.state.status === 'playing') this.save();
  }

  private paintProgress(): void {
    const dur = this.durationMs();
    const p = this.seekTarget >= 0 ? this.seekTarget : this.session.state.positionMs;
    this.pos.textContent = fmtTime(p);
    this.dur.textContent = dur ? fmtTime(dur) : '';
    this.bar.style.width = dur ? Math.min(100, (p / dur) * 100).toFixed(2) + '%' : '0%';
  }

  private save(): void {
    if (!this.started) return;
    this.lastSave = Date.now();
    const st = this.session.state;
    if (st.positionMs > 0) resume.save(this.item.key, st.positionMs, this.durationMs());
  }

  private render(s: SessionState): void {
    if (s.status === 'playing' && !this.tracksDone) {
      this.tracksDone = true;
      this.subs.setOn(applyTrackPrefs(this.engine, this.engine.info()));
    }
    let text = '';
    if (s.status === 'connecting') text = t('player.connecting');
    else if (s.status === 'buffering') text = t('player.buffering', { p: s.percent });
    else if (s.status === 'paused') text = t('player.paused');
    else if (s.status === 'retrying') text = t('player.retrying', { a: s.attempt + 1, m: s.maxAttempts });
    this.status.textContent = text;
    this.status.classList.toggle('warn', s.status === 'retrying');
    this.buttons.setLabel('pause', t(s.status === 'paused' ? 'osd.play' : 'osd.pause'));
    if (s.status === 'paused' || s.status === 'retrying') this.showOsd(true);
    if (s.status === 'failed') this.showError();
    // fim do vídeo (VOD: 'ended' vira idle na sessão)
    if (s.status === 'idle' && this.started && this.session.currentUrl) {
      resume.save(this.item.key, 0, this.durationMs());
      if (this.onEnded) this.onEnded();
      else this.ctx.back();
    }
  }

  private showError(): void {
    clear(this.errorBox);
    const actions = el('div', { class: 'dlg-actions' }, [
      button(t('player.retry'), { icon: 'live', variant: 'primary', autofocus: true, onClick: () => this.retry() }),
      button(t('player.back'), { icon: 'back', onClick: () => this.ctx.back() }),
    ]);
    this.errorBox.appendChild(el('h2', { class: 'dlg-title', text: t('player.fail.title') }));
    this.errorBox.appendChild(el('p', { class: 'dlg-body', text: t('vod.fail') }));
    this.errorBox.appendChild(actions);
    this.errorBox.classList.remove('hidden');
    this.showOsd(true);
    focus.focus(actions.querySelector<HTMLElement>('[data-autofocus]'));
  }

  private retry(): void {
    this.errorBox.classList.add('hidden');
    clear(this.errorBox);
    this.session.play(this.item.url, this.session.state.positionMs);
  }

  private showOsd(sticky = false): void {
    this.paintProgress();
    this.osd.classList.add('visible');
    if (this.osdTimer) clearTimeout(this.osdTimer);
    if (!sticky) {
      this.osdTimer = setTimeout(() => {
        this.osd.classList.remove('visible');
        this.setBarMode(false);
      }, OSD_MS);
    }
  }

  private debugState(): Record<string, unknown> {
    return {
      engine: this.engine.name,
      session: this.session.state,
      durationMs: this.durationMs(),
      started: this.started,
      osdVisible: this.osd.classList.contains('visible'),
      error: this.errorBox.classList.contains('hidden') ? null : this.errorBox.textContent,
    };
  }
}
