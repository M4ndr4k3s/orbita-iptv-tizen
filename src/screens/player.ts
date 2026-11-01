// Tela de reprodução em tela cheia (ao vivo): OSD, troca de canal (CH±, setas,
// números), pausa, recuperação de quedas e erro claro quando não dá para tocar.

import { el, clear } from '../utils/dom';
import type { Screen } from '../app/screen';
import type { AppContext } from '../app/context';
import type { RemoteKey } from '../navigation/keys';
import { focus } from '../navigation/focus';
import { button } from '../components/button';
import { toast } from '../components/toast';
import { getEngine } from '../player/engineFactory';
import { PlaybackSession, type SessionState } from '../player/session';
import { streamUrl } from '../player/streamUrl';
import type { PlayerEngine } from '../player/engine';
import type { Channel } from '../playlist/model';
import type { Source } from '../playlist/source';
import { t } from '../services/i18n';

declare const __DEV__: boolean;

const OSD_MS = 5000;
const ZAP_DEBOUNCE_MS = 350;
const DIGIT_WAIT_MS = 1500;

export class PlayerScreen implements Screen {
  readonly root: HTMLElement;
  private engine: PlayerEngine;
  private session: PlaybackSession;
  private current: Channel;
  /** canal mostrado no OSD durante a troca rápida (ainda não aberto) */
  private pending: Channel | null = null;
  private zapTimer: ReturnType<typeof setTimeout> | null = null;
  private osdTimer: ReturnType<typeof setTimeout> | null = null;
  private digitTimer: ReturnType<typeof setTimeout> | null = null;
  private digits = '';
  private zapSeq = 0;
  private unsub: (() => void) | null = null;

  private osd: HTMLElement;
  private osdNum: HTMLElement;
  private osdName: HTMLElement;
  private osdGroup: HTMLElement;
  private osdLogo: HTMLImageElement;
  private status: HTMLElement;
  private numberBox: HTMLElement;
  private errorBox: HTMLElement;
  private onVisibility = () => {
    if (document.hidden) this.engine.suspend();
    else this.engine.restore();
  };

  constructor(private ctx: AppContext, private source: Source, start: Channel) {
    this.current = start;
    this.engine = getEngine();
    this.session = new PlaybackSession(this.engine, { live: true });

    this.osdNum = el('div', { class: 'osd-num' });
    this.osdName = el('div', { class: 'osd-name' });
    this.osdGroup = el('div', { class: 'osd-group' });
    this.osdLogo = el('img', { class: 'osd-logo', attrs: { alt: '' } });
    this.osdLogo.addEventListener('error', () => this.osdLogo.classList.add('hidden'));
    this.status = el('div', { class: 'osd-status' });
    this.osd = el('div', { class: 'osd' }, [
      el('div', { class: 'osd-top' }, [
        this.osdLogo,
        el('div', { class: 'osd-text' }, [el('div', { class: 'osd-line' }, [this.osdNum, this.osdName]), this.osdGroup]),
      ]),
      el('div', { class: 'osd-bottom' }, [this.status, el('div', { class: 'osd-hint', text: t('player.hint') })]),
    ]);
    this.numberBox = el('div', { class: 'osd-digits hidden' });
    this.errorBox = el('div', { class: 'player-error hidden' });
    this.root = el('div', { class: 'screen player' }, [this.osd, this.numberBox, this.errorBox]);
  }

  mount(): void {
    document.body.classList.add('playing');
    const shell = document.querySelector('.shell');
    if (shell) shell.classList.add('immersive');
    document.addEventListener('visibilitychange', this.onVisibility);
    this.unsub = this.session.onChange((s) => this.render(s));
    if (__DEV__) (window as unknown as Record<string, unknown>).__orbitaPlayer = () => this.debugState();
    this.open(this.current);
  }

  unmount(): void {
    this.session.stop();
    if (this.unsub) this.unsub();
    for (const tm of [this.zapTimer, this.osdTimer, this.digitTimer]) if (tm) clearTimeout(tm);
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.body.classList.remove('playing');
    const shell = document.querySelector('.shell');
    if (shell) shell.classList.remove('immersive');
    if (__DEV__) delete (window as unknown as Record<string, unknown>).__orbitaPlayer;
  }

  onKey(key: RemoteKey): boolean {
    // com o painel de erro aberto, setas/OK navegam nos botões
    if (!this.errorBox.classList.contains('hidden')) {
      if (key.action === 'chUp' || key.action === 'chDown') {
        this.zap(key.action === 'chUp' ? 1 : -1);
        return true;
      }
      return false;
    }
    switch (key.action) {
      case 'chUp':
      case 'up':
        this.zap(1);
        return true;
      case 'chDown':
      case 'down':
        this.zap(-1);
        return true;
      case 'digit':
        this.typeDigit(key.digit || 0);
        return true;
      case 'ok':
      case 'info':
        if (this.digits) this.commitDigits();
        else this.toggleOsd();
        return true;
      case 'playPause':
      case 'play':
      case 'pause':
        this.session.togglePause();
        this.showOsd();
        return true;
      case 'stop':
        this.ctx.back();
        return true;
      case 'left':
      case 'right':
        this.showOsd();
        return true;
      default:
        return false;
    }
  }

  private open(ch: Channel): void {
    this.current = ch;
    this.pending = null;
    this.hideError();
    this.paintChannel(ch);
    this.showOsd();
    const url = streamUrl(ch, this.source);
    if (!url) {
      this.session.stop();
      this.showError(t('player.fail.noUrl'));
      return;
    }
    this.session.play(url);
  }

  /** CH±: atualiza o OSD na hora e só abre o stream quando o usuário para de apertar. */
  private zap(dir: 1 | -1): void {
    const gk = this.source.import && this.source.import.gk;
    if (!gk) return;
    const seq = ++this.zapSeq;
    const from = this.pending || this.current;
    void this.ctx.data.call('channels.neighbor', gk, from.order, dir).then((next) => {
      if (seq !== this.zapSeq || !next) return;
      this.pending = next;
      this.paintChannel(next);
      this.showOsd();
      if (this.zapTimer) clearTimeout(this.zapTimer);
      this.zapTimer = setTimeout(() => {
        if (this.pending) this.open(this.pending);
      }, ZAP_DEBOUNCE_MS);
    });
  }

  private typeDigit(d: number): void {
    if (this.digits.length >= 5) return;
    this.digits += String(d);
    this.numberBox.textContent = this.digits;
    this.numberBox.classList.remove('hidden');
    if (this.digitTimer) clearTimeout(this.digitTimer);
    this.digitTimer = setTimeout(() => this.commitDigits(), DIGIT_WAIT_MS);
  }

  private commitDigits(): void {
    if (this.digitTimer) clearTimeout(this.digitTimer);
    const n = Number(this.digits);
    this.digits = '';
    this.numberBox.classList.add('hidden');
    const gk = this.source.import && this.source.import.gk;
    if (!gk || !n) return;
    void this.ctx.data.call('channels.byNumber', gk, n).then((ch) => {
      if (ch) this.open(ch);
      else toast(t('player.noChannel', { n }), 'error');
    });
  }

  private paintChannel(ch: Channel): void {
    this.osdNum.textContent = String(ch.num);
    this.osdName.textContent = ch.name;
    this.osdGroup.textContent = ch.group;
    if (ch.logo) {
      this.osdLogo.classList.remove('hidden');
      this.osdLogo.src = ch.logo;
    } else {
      this.osdLogo.classList.add('hidden');
      this.osdLogo.removeAttribute('src');
    }
  }

  private render(s: SessionState): void {
    let text = '';
    if (s.status === 'connecting') text = t('player.connecting');
    else if (s.status === 'buffering') text = t('player.buffering', { p: s.percent });
    else if (s.status === 'paused') text = t('player.paused');
    else if (s.status === 'retrying') text = t('player.retrying', { a: s.attempt + 1, m: s.maxAttempts });
    this.status.textContent = text;
    this.status.classList.toggle('warn', s.status === 'retrying');
    // problemas mantêm o OSD visível; tocando normalmente ele some sozinho
    if (s.status === 'retrying' || s.status === 'paused') this.showOsd(true);
    if (s.status === 'failed') this.showError(failMessage(s.error || ''));
  }

  private showError(msg: string): void {
    clear(this.errorBox);
    const actions = el('div', { class: 'dlg-actions' }, [
      button(t('player.retry'), { icon: 'live', variant: 'primary', autofocus: true, onClick: () => this.open(this.current) }),
      button(t('player.next'), { onClick: () => this.zap(1) }),
      button(t('player.back'), { icon: 'back', onClick: () => this.ctx.back() }),
    ]);
    this.errorBox.appendChild(el('h2', { class: 'dlg-title', text: t('player.fail.title') }));
    this.errorBox.appendChild(el('p', { class: 'dlg-body', text: msg }));
    this.errorBox.appendChild(actions);
    this.errorBox.classList.remove('hidden');
    this.showOsd(true);
    focus.focus(actions.querySelector<HTMLElement>('[data-autofocus]'));
  }

  private hideError(): void {
    if (this.errorBox.classList.contains('hidden')) return;
    this.errorBox.classList.add('hidden');
    clear(this.errorBox);
  }

  private showOsd(sticky = false): void {
    this.osd.classList.add('visible');
    if (this.osdTimer) clearTimeout(this.osdTimer);
    if (!sticky) this.osdTimer = setTimeout(() => this.osd.classList.remove('visible'), OSD_MS);
  }

  private toggleOsd(): void {
    if (this.osd.classList.contains('visible')) this.osd.classList.remove('visible');
    else this.showOsd();
  }

  /** Só em builds de teste: estado para os roteiros e2e (sem URL nem credenciais). */
  private debugState(): Record<string, unknown> {
    return {
      engine: this.engine.name,
      engineState: this.engine.state(),
      session: this.session.state,
      channel: { num: this.current.num, name: this.current.name, order: this.current.order },
      osdVisible: this.osd.classList.contains('visible'),
      error: this.errorBox.classList.contains('hidden') ? null : this.errorBox.textContent,
      info: this.engine.info(),
    };
  }
}

function failMessage(code: string): string {
  if (/NOT_SUPPORTED|UNSUPPORTED|SRC_NOT_SUPPORTED/i.test(code)) return t('player.fail.unsupported');
  if (/INVALID_URI/i.test(code)) return t('player.fail.invalid');
  if (/CONNECTION|NETWORK|MEDIA_ERR_2/i.test(code)) return t('player.fail.connection');
  return t('player.fail.timeout');
}
