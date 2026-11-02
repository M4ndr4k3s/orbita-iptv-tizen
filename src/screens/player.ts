// Tela de reprodução em tela cheia (ao vivo): OSD, troca de canal (CH±, setas,
// números), pausa, recuperação de quedas e erro claro quando não dá para tocar.

import { el, clear } from '../utils/dom';
import type { Screen } from '../app/screen';
import type { AppContext } from '../app/context';
import type { RemoteKey } from '../navigation/keys';
import { toast } from '../components/toast';
import { icon } from '../components/icons';
import { getEngine } from '../player/engineFactory';
import { PlaybackSession, type SessionState } from '../player/session';
import { streamUrl } from '../player/streamUrl';
import type { PlayerEngine } from '../player/engine';
import type { Channel } from '../playlist/model';
import type { Source } from '../playlist/source';
import { t } from '../services/i18n';
import { parental } from '../services/parental';
import { requirePin } from '../components/pinDialog';
import { wrapIndex, type ChannelList } from '../services/channelLists';
import { scheduleFor } from '../services/guide';
import { renderNowNext } from '../components/epgInfo';
import { openPlayerOptions, SubtitleView } from '../components/playerOptions';
import { OsdBar } from '../components/osdBar';
import { recorder } from '../services/recorder';
import { startJob } from '../components/recordActions';
import { channelKey } from '../playlist/model';
import { applyEnginePrefs, applyTrackPrefs, liveFormatPref } from '../player/preferences';

declare const __DEV__: boolean;

/** Integração com a mini janela da TV ao vivo. */
export interface PlayerHandoff {
  /** sessão já tocando o canal (não reabre o stream) */
  session?: PlaybackSession;
  /** ao sair, devolve a sessão em vez de parar */
  keepAlive?: (s: PlaybackSession, ch: Channel) => void;
}

const OSD_MS = 5000;
// pausa longa num canal ao vivo: o buffer do servidor já passou, então volta ao vivo reabrindo
const LIVE_RESUME_MAX_MS = 60000;
const ZAP_DEBOUNCE_MS = 350;
const DIGIT_WAIT_MS = 1500;

export class PlayerScreen implements Screen {
  readonly root: HTMLElement;
  private engine: PlayerEngine;
  private session: PlaybackSession;
  private current: Channel;
  /** canal mostrado no OSD durante a troca rápida (ainda não aberto) */
  private pending: Channel | null = null;
  private pendingIndex = -1;
  private historyDone = false;
  private zapTimer: ReturnType<typeof setTimeout> | null = null;
  private osdTimer: ReturnType<typeof setTimeout> | null = null;
  private digitTimer: ReturnType<typeof setTimeout> | null = null;
  private digits = '';
  private zapSeq = 0;
  private unsub: (() => void) | null = null;

  private osd: HTMLElement;
  private bar: OsdBar;
  /** botões armados: o OSD abre sozinho ao trocar de canal, então o 1º OK só destaca */
  private barArmed = false;
  private osdNum: HTMLElement;
  private osdName: HTMLElement;
  private osdGroup: HTMLElement;
  private osdEpg: HTMLElement;
  /** barra do programa atual (início · progresso · fim), só com guia */
  private progRow: HTMLElement;
  private progStart: HTMLElement;
  private progEnd: HTMLElement;
  private progFill: HTMLElement;
  private prog: { start: number; stop: number } | null = null;
  private pausedAt = 0;
  private subs = new SubtitleView();
  private unsubSubs: (() => void) | null = null;
  private unsubRec: (() => void) | null = null;
  private osdRec!: HTMLElement;
  private tracksDone = false;
  private epgSeq = 0;
  private osdFav: SVGSVGElement;
  private osdLogo: HTMLImageElement;
  private status: HTMLElement;
  private numberBox: HTMLElement;
  /** canal não abriu: aviso no OSD (sem janela de erro), ↑/↓ trocam e OK tenta de novo */
  private failed = false;
  private onVisibility = () => {
    if (document.hidden) this.engine.suspend();
    else this.engine.restore();
  };

  /**
   * list/index: a lista que o CH± percorre (categoria, favoritos, busca...).
   * onExit: avisa qual canal estava tocando ao sair (a lista de canais o destaca).
   */
  constructor(
    private ctx: AppContext,
    private source: Source,
    start: Channel,
    private list: ChannelList | null = null,
    private index = 0,
    private onExit?: (ch: Channel, index: number) => void,
    private handoff: PlayerHandoff = {},
  ) {
    this.current = start;
    this.engine = getEngine();
    // sessão da mini janela: continua o mesmo stream, sem reabrir
    this.session = handoff.session || new PlaybackSession(this.engine, { live: true });
    if (handoff.session) handoff.session.attach();

    this.osdNum = el('div', { class: 'osd-num' });
    this.osdName = el('div', { class: 'osd-name' });
    this.osdGroup = el('div', { class: 'osd-group' });
    this.osdEpg = el('div', { class: 'osd-epg' });
    this.progStart = el('div', { class: 'vod-time' });
    this.progEnd = el('div', { class: 'vod-time' });
    this.progFill = el('div', { class: 'vod-bar-fill' });
    this.progRow = el('div', { class: 'vod-progress hidden' }, [this.progStart, el('div', { class: 'vod-bar' }, [this.progFill]), this.progEnd]);
    this.osdFav = icon('favorites', 'icon osd-fav hidden');
    this.osdLogo = el('img', { class: 'osd-logo', attrs: { alt: '' } });
    this.osdLogo.addEventListener('error', () => this.osdLogo.classList.add('hidden'));
    this.status = el('div', { class: 'osd-status' });
    // botões na tela: o mesmo que as teclas coloridas, sem precisar delas
    this.bar = new OsdBar([
      { id: 'pause', label: t('osd.pause'), icon: 'pause', run: () => this.togglePause() },
      { id: 'rec', label: t('osd.record'), icon: 'record', run: () => void this.toggleRecord() },
      { id: 'options', label: t('osd.options'), icon: 'settings', run: () => void this.options() },
      { id: 'fav', label: t('osd.fav'), icon: 'favorites', run: () => void this.toggleFavorite() },
      { id: 'channels', label: t('osd.channels'), icon: 'lists', run: () => this.ctx.back() },
    ]);
    this.osd = el('div', { class: 'osd' }, [
      el('div', { class: 'osd-top' }, [
        this.osdLogo,
        el('div', { class: 'osd-text' }, [el('div', { class: 'osd-line' }, [this.osdNum, this.osdName, this.osdFav, (this.osdRec = el('span', { class: 'osd-rec hidden', text: t('rec.badge') }))]), this.osdGroup]),
        this.osdEpg,
      ]),
      el('div', { class: 'osd-bottom' }, [this.status, this.progRow, this.bar.root, el('div', { class: 'osd-hint', text: t('player.hint') })]),
    ]);
    this.numberBox = el('div', { class: 'osd-digits hidden' });
    this.root = el('div', { class: 'screen player' }, [this.subs.root, this.osd, this.numberBox]);
  }

  mount(): void {
    document.body.classList.add('playing');
    const shell = document.querySelector('.shell');
    if (shell) shell.classList.add('immersive');
    document.addEventListener('visibilitychange', this.onVisibility);
    this.unsub = this.session.onChange((s) => this.render(s));
    this.unsubSubs = this.session.onSubtitle((txt, d) => this.subs.show(txt, d));
    this.unsubRec = recorder.onChange(() => this.paintRec());
    applyEnginePrefs(this.engine);
    if (__DEV__) (window as unknown as Record<string, unknown>).__orbitaPlayer = () => this.debugState();
    this.engine.setRect(null);
    this.open(this.current);
  }

  unmount(): void {
    if (this.onExit) this.onExit(this.current, this.index);
    if (this.unsub) this.unsub();
    if (this.unsubSubs) this.unsubSubs();
    if (this.unsubRec) this.unsubRec();
    this.subs.clear();
    // a TV ao vivo pega o stream de volta para a mini janela; senão, para
    if (this.handoff.keepAlive) this.handoff.keepAlive(this.session, this.current);
    else this.session.stop();
    for (const tm of [this.zapTimer, this.osdTimer, this.digitTimer]) if (tm) clearTimeout(tm);
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.body.classList.remove('playing');
    const shell = document.querySelector('.shell');
    if (shell) shell.classList.remove('immersive');
    if (__DEV__) delete (window as unknown as Record<string, unknown>).__orbitaPlayer;
  }

  onKey(key: RemoteKey): boolean {
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
        // OK: mostra o OSD; com ele aberto, aciona o botão escolhido
        if (this.digits) this.commitDigits();
        else if (this.failed && !this.barArmed) this.open(this.current);
        else if (this.barArmed && this.osd.classList.contains('visible')) this.bar.activate();
        else this.armBar();
        return true;
      case 'info':
        if (this.digits) this.commitDigits();
        else this.toggleOsd();
        return true;
      case 'playPause':
      case 'play':
      case 'pause':
        this.togglePause();
        return true;
      case 'stop':
        this.ctx.back();
        return true;
      case 'yellow':
        void this.toggleFavorite();
        return true;
      case 'green':
        void this.options();
        return true;
      case 'left':
      case 'right':
        if (this.barArmed && this.osd.classList.contains('visible')) this.bar.move(key.action === 'left' ? -1 : 1);
        this.armBar();
        return true;
      default:
        return false;
    }
  }

  /** Grava o canal atual no pendrive (ou para a gravação dele). */
  private async toggleRecord(): Promise<void> {
    const key = channelKey(this.current);
    const job = recorder.running(key);
    if (job) recorder.stop(job.id);
    // TS mesmo assistindo em HLS: gravação precisa de stream contínuo
    else await startJob('record', key, this.current.name, streamUrl(this.current, this.source, 'ts'));
    this.paintRec();
    this.showOsd();
  }

  private paintRec(): void {
    const on = !!recorder.running(channelKey(this.current));
    this.osdRec.classList.toggle('hidden', !on);
    this.bar.setLabel('rec', t(on ? 'osd.stopRecord' : 'osd.record'));
  }

  private togglePause(): void {
    const st = this.session.state.status;
    if (st === 'paused' && Date.now() - this.pausedAt > LIVE_RESUME_MAX_MS) this.open(this.current, true);
    else {
      if (st === 'playing' || st === 'buffering') this.pausedAt = Date.now();
      this.session.togglePause();
    }
    this.showOsd();
  }

  /** Barra do programa no ar: posição de agora entre o início e o fim. */
  private paintProgress(): void {
    const p = this.prog;
    const now = Date.now();
    if (!p || now >= p.stop) {
      this.progRow.classList.add('hidden');
      return;
    }
    this.progStart.textContent = hhmm(p.start);
    this.progEnd.textContent = hhmm(p.stop);
    this.progFill.style.width = Math.max(0, Math.min(100, ((now - p.start) / (p.stop - p.start)) * 100)).toFixed(1) + '%';
    this.progRow.classList.remove('hidden');
  }

  private async options(): Promise<void> {
    await openPlayerOptions({
      engine: this.engine,
      reopen: () => this.open(this.current, true),
      setSubtitles: (on) => this.subs.setOn(on),
      subtitlesOn: () => this.subs.on,
      liveXtream: this.source.kind === 'xtream' && this.current.xid != null,
    });
    // o OSD some sozinho enquanto o diálogo está aberto: volta com os botões
    this.armBar();
  }

  private async toggleFavorite(): Promise<void> {
    const on = await this.ctx.library.toggleFavorite(this.source.id, this.current);
    this.bar.setLabel('fav', t(on ? 'osd.unfav' : 'osd.fav'));
    toast(on ? t('live.favAdded', { name: this.current.name }) : t('live.favRemoved', { name: this.current.name }));
    this.paintChannel(this.current);
    this.showOsd();
  }

  /** restart: reabre mesmo que seja o stream atual (buffer/formato mudaram). */
  private open(ch: Channel, restart = false): void {
    // canal de categoria bloqueada (número digitado, recentes da Início): pede o PIN
    if (parental.isBlocked('live', ch.group)) {
      this.session.stop();
      void requirePin(t('parental.catBody', { name: ch.group })).then((ok) => (ok ? this.open(ch, restart) : this.ctx.back()));
      return;
    }
    this.current = ch;
    this.pending = null;
    this.pendingIndex = -1;
    this.historyDone = false;
    this.tracksDone = false;
    this.subs.clear();
    this.hideError();
    this.paintChannel(ch);
    this.showOsd();
    const url = streamUrl(ch, this.source, liveFormatPref());
    if (!url) {
      this.session.stop();
      this.showError(t('player.fail.noUrl'));
      return;
    }
    // mesmo stream já aberto (veio da mini janela): só continua
    if (restart) {
      this.session.restart(url);
      return;
    }
    const st = this.session.state.status;
    if (url === this.session.currentUrl && st !== 'idle' && st !== 'failed') {
      this.render(this.session.state);
      return;
    }
    this.session.play(url);
  }

  /** CH±: atualiza o OSD na hora e só abre o stream quando o usuário para de apertar. */
  private zap(dir: 1 | -1): void {
    const seq = ++this.zapSeq;
    let lookup: Promise<Channel | null>;
    if (this.list && this.list.size > 1) {
      // percorre a lista de origem (categoria, favoritos, busca), com volta pelas pontas
      this.pendingIndex = wrapIndex(this.pendingIndex >= 0 ? this.pendingIndex : this.index, dir, this.list.size);
      lookup = this.list.load(this.pendingIndex, 1).then((l) => l[0] || null);
    } else {
      const gk = this.source.import && this.source.import.gk;
      if (!gk) return;
      const from = this.pending || this.current;
      // canal de favoritos/recentes é uma cópia sem posição (order 0): acha o da lista pelo número
      const base = from.order ? Promise.resolve<Channel | null>(from) : this.ctx.data.call('channels.byNumber', gk, from.num);
      lookup = base.then((b) => this.ctx.data.call('channels.neighbor', gk, b ? b.order : 0, dir));
    }
    void lookup.then((next) => {
      if (seq !== this.zapSeq || !next) return;
      this.pending = next;
      this.paintChannel(next);
      this.showOsd();
      if (this.zapTimer) clearTimeout(this.zapTimer);
      this.zapTimer = setTimeout(() => {
        if (!this.pending) return;
        if (this.pendingIndex >= 0) this.index = this.pendingIndex;
        this.open(this.pending);
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
      if (!ch) {
        toast(t('player.noChannel', { n }), 'error');
        return;
      }
      // número digitado vale para a lista inteira: sem lista, o CH± usa o vizinho no banco
      this.list = null;
      this.index = 0;
      this.open(ch);
    });
  }

  private paintChannel(ch: Channel): void {
    this.paintEpg(ch);
    this.osdNum.textContent = String(ch.num);
    this.osdName.textContent = ch.name;
    const fav = this.ctx.library.isFavorite(this.source.id, ch);
    this.osdFav.classList.toggle('hidden', !fav);
    this.bar.setLabel('fav', t(fav ? 'osd.unfav' : 'osd.fav'));
    this.osdGroup.textContent = ch.group;
    this.paintRec();
    if (ch.logo) {
      this.osdLogo.classList.remove('hidden');
      this.osdLogo.src = ch.logo;
    } else {
      this.osdLogo.classList.add('hidden');
      this.osdLogo.removeAttribute('src');
    }
  }

  private paintEpg(ch: Channel): void {
    const seq = ++this.epgSeq;
    const src = this.ctx.sources.get(this.source.id) || this.source;
    this.prog = null;
    this.paintProgress();
    if (!src.epg) {
      clear(this.osdEpg);
      return;
    }
    void scheduleFor(this.ctx.data, src, ch, 2)
      .then((list) => {
        if (seq !== this.epgSeq) return;
        renderNowNext(this.osdEpg, list);
        const now = Date.now();
        const cur = list.length && list[0].start <= now && list[0].stop > now ? list[0] : null;
        this.prog = cur ? { start: cur.start, stop: cur.stop } : null;
        this.paintProgress();
      })
      .catch(() => undefined);
  }

  private render(s: SessionState): void {
    // entra no histórico quando a imagem aparece (não ao só passar pelo canal)
    // faixas no idioma preferido assim que o stream começa
    if (s.status === 'playing' && !this.tracksDone) {
      this.tracksDone = true;
      this.subs.setOn(applyTrackPrefs(this.engine, this.engine.info()));
    }
    if (s.status === 'playing' && !this.historyDone) {
      this.historyDone = true;
      void this.ctx.library.addHistory(this.source.id, this.current).catch(() => undefined);
    }
    let text = '';
    if (s.status === 'connecting') text = t('player.connecting');
    else if (s.status === 'buffering') text = t('player.buffering', { p: s.percent });
    else if (s.status === 'paused') text = t('player.paused');
    // reconectando: as tentativas acontecem por trás, sem contador na tela
    else if (s.status === 'retrying') text = t('player.connecting');
    if (s.status === 'failed') return this.showError(failMessage(s.error || ''));
    this.status.textContent = text;
    this.status.classList.remove('warn');
    this.bar.setLabel('pause', t(s.status === 'paused' ? 'osd.play' : 'osd.pause'));
    // problemas mantêm o OSD visível; tocando normalmente ele some sozinho
    if (s.status === 'paused') this.showOsd(true);
  }

  /** Falha: aviso no OSD em vez de uma janela que prende o foco. */
  private showError(msg: string): void {
    this.failed = true;
    this.status.textContent = msg + ' · ' + t('player.failHint');
    this.status.classList.add('warn');
    this.showOsd(true);
  }

  private hideError(): void {
    if (!this.failed) return;
    this.failed = false;
    this.status.textContent = '';
    this.status.classList.remove('warn');
  }

  private showOsd(sticky = false): void {
    // OSD reaparecendo: atualiza a barra de progresso do programa
    if (!this.osd.classList.contains('visible') && !this.pending) this.paintEpg(this.current);
    else this.paintProgress();
    this.osd.classList.add('visible');
    if (this.osdTimer) clearTimeout(this.osdTimer);
    if (!sticky) this.osdTimer = setTimeout(() => this.hideOsd(), OSD_MS);
  }

  private armBar(): void {
    this.barArmed = true;
    this.osd.classList.add('bar-mode');
    this.showOsd();
  }

  private hideOsd(): void {
    this.osd.classList.remove('visible', 'bar-mode');
    this.barArmed = false;
  }

  private toggleOsd(): void {
    if (this.osd.classList.contains('visible')) this.hideOsd();
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
      error: this.failed ? this.status.textContent : null,
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

const pad2 = (n: number) => (n < 10 ? '0' : '') + n;
function hhmm(ms: number): string {
  const d = new Date(ms);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
