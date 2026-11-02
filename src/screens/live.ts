// TV ao vivo: categorias (com Favoritos, Recentes e Todos), lista de canais
// virtualizada e painel do canal selecionado. OK abre em tela cheia; o CH± do
// player percorre a categoria de onde o canal foi aberto.

import { el, clear } from '../utils/dom';
import type { Screen } from '../app/screen';
import type { AppContext } from '../app/context';
import type { RemoteKey } from '../navigation/keys';
import { focus } from '../navigation/focus';
import { VirtualList } from '../components/virtualList';
import { button } from '../components/button';
import { openKeyboard } from '../components/keyboard';
import { withBusy } from '../components/busy';
import { toast } from '../components/toast';
import { icon, type IconName } from '../components/icons';
import { idList, snapshotList, type ChannelList } from '../services/channelLists';
import { channelKey, type Channel } from '../playlist/model';
import type { Source } from '../playlist/source';
import { settings } from '../storage/settings';
import { PlayerScreen, type PlayerHandoff } from './player';
import { LivePreview } from './livePreview';
import { streamUrl } from '../player/streamUrl';
import { liveFormatPref } from '../player/preferences';
import type { PlaybackSession, SessionState } from '../player/session';
import { scheduleFor } from '../services/guide';
import { renderNowNext, renderSchedule } from '../components/epgInfo';
import { fmtInt } from '../services/format';
import { t } from '../services/i18n';
import { parental } from '../services/parental';
import { requirePin } from '../components/pinDialog';

export type LiveStart = 'all' | 'fav' | 'recent' | 'guide';

interface Cat {
  id: string;
  kind: 'fav' | 'recent' | 'all' | 'group' | 'search';
  label: string;
  count: number;
  group?: string;
  term?: string;
  /** categoria bloqueada pelo controle parental (sessão ainda não liberada) */
  locked?: boolean;
}

declare const __DEV__: boolean;

const CAT_DEBOUNCE_MS = 250;
const DIGIT_WAIT_MS = 1500;
const LOGO_IDLE_MS = 300;
// a grade do modo Guia mostra mais programas que o "Agora / A seguir"
const GUIDE_ITEMS = 7;

export class LiveScreen implements Screen {
  readonly root: HTMLElement;
  private body: HTMLElement;
  private source: Source | undefined;
  private cats!: VirtualList<Cat>;
  private chans!: VirtualList<Channel>;
  private catItems: Cat[] = [];
  private list: ChannelList | null = null;
  private listCatId = '';
  private catTimer: ReturnType<typeof setTimeout> | null = null;
  private digitTimer: ReturnType<typeof setTimeout> | null = null;
  private digits = '';
  private loadSeq = 0;
  private playingKey: string | null = null;
  private scrolling = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private unsub: Array<() => void> = [];

  private panelLogo!: HTMLImageElement;
  private panelNum!: HTMLElement;
  private panelName!: HTMLElement;
  private panelGroup!: HTMLElement;
  private panelState!: HTMLElement;
  private digitBox!: HTMLElement;
  private subtitle!: HTMLElement;
  private pvBox!: HTMLElement;
  private pvStatus!: HTMLElement;
  private epgBox!: HTMLElement;
  private epgSeq = 0;
  private preview: LivePreview | null = null;
  private readonly guideMode: boolean;

  constructor(private ctx: AppContext, private start: LiveStart = 'all') {
    this.guideMode = start === 'guide';
    this.body = el('div', { class: 'live-body' });
    this.root = el('div', { class: 'screen live' }, [this.body]);
  }

  mount(): void {
    this.source = this.ctx.sources.active();
    if (!this.source || !this.source.import || !this.source.import.live) {
      this.body.appendChild(el('div', { class: 'pending-box live-empty' }, [
        icon('live', 'icon pending-icon'),
        el('h1', { class: 'screen-title', text: t('live.title') }),
        el('p', { class: 'pending-text', text: t('live.noList') }),
        button(t('home.manageLists'), { icon: 'lists', variant: 'primary', autofocus: true, onClick: () => this.ctx.go('lists') }),
      ]));
      return;
    }
    this.build();
    this.unsub.push(this.ctx.library.onChange(() => this.onLibraryChange()));
    // guia terminou de baixar com a tela aberta: mostra sem precisar mexer na seleção
    const epgState = (x: Source | undefined) => (x ? (x.epg ? x.epg.ek : '') + '|' + (x.epgError || '') : '');
    let lastEpg = epgState(this.source);
    this.unsub.push(
      this.ctx.sources.onChange(() => {
        const now = epgState(this.ctx.sources.get(this.source!.id));
        if (now === lastEpg) return;
        lastEpg = now;
        if (!this.scrolling && this.chans) this.loadEpg(this.chans.item());
      }),
    );
    // PIN digitado (ou bloqueio alterado): refaz as categorias e a lista aberta
    this.unsub.push(parental.onChange(() => this.onParentalChange()));
    // só em builds de teste: tamanho da lista aberta (roteiro do controle parental)
    if (__DEV__) (window as unknown as Record<string, unknown>).__orbitaLiveSize = () => (this.chans ? this.chans.size : 0);
    void this.loadCategories();
  }

  private onParentalChange(): void {
    if (!this.cats) return;
    for (const c of this.catItems) c.locked = c.kind === 'group' && parental.isBlocked('live', c.group);
    this.cats.setCount(this.catItems.length, this.cats.index);
    const cat = this.catItems.find((c) => c.id === this.listCatId);
    this.listCatId = '';
    if (cat) void this.loadCategory(cat, this.chans.index);
  }

  /** OK numa categoria: bloqueada pede o PIN antes de abrir. */
  private async openCategory(): Promise<void> {
    const cat = this.catItems[this.cats.index];
    if (cat && cat.locked && !(await requirePin(t('parental.catBody', { name: cat.label })))) return;
    this.applyCategoryNow();
    focus.focus(this.chans.root);
  }

  unmount(): void {
    for (const u of this.unsub) u();
    for (const tm of [this.catTimer, this.digitTimer, this.idleTimer]) if (tm) clearTimeout(tm);
    if (this.preview) this.preview.stop();
  }

  /** Ao voltar do player: atualiza contagens de Recentes/Favoritos. */
  show(): void {
    if (this.cats) void this.refreshLibraryCounts();
    // voltou da tela cheia: o vídeo encolhe de novo para a janela
    if (this.preview) this.preview.layout();
  }

  onKey(key: RemoteKey): boolean {
    if (!this.cats) return false;
    const cur = focus.current;
    if (cur === this.chans.root) {
      if (key.action === 'digit') {
        this.typeDigit(key.digit || 0);
        return true;
      }
      if (key.action === 'ok' && this.digits) {
        this.commitDigits();
        return true;
      }
      if (key.action === 'yellow') {
        void this.toggleFavorite();
        return true;
      }
      return this.chans.handleKey(key.action);
    }
    if (cur === this.cats.root) {
      if (key.action === 'ok') {
        void this.openCategory();
        return true;
      }
      return this.cats.handleKey(key.action);
    }
    return false;
  }

  private build(): void {
    const src = this.source!;
    this.subtitle = el('p', { class: 'screen-sub' });
    const head = el('div', { class: 'screen-head live-head' }, [
      el('div', {}, [el('h1', { class: 'screen-title', text: this.guideMode ? t('guide.title') : t('live.title') }), this.subtitle]),
      button(t('live.search'), { icon: 'search', onClick: () => void this.search() }),
    ]);

    this.cats = new VirtualList<Cat>({
      rowHeight: 72,
      visibleRows: 11,
      className: 'vl-cats',
      render: (row, c) => renderCat(row, c),
      load: async (s, n) => this.catItems.slice(s, s + n),
      onChange: () => this.scheduleCategory(),
      onSelect: () => void this.openCategory(),
    });
    this.chans = new VirtualList<Channel>({
      rowHeight: 88,
      visibleRows: 9,
      className: 'vl-chans',
      render: (row, ch) => this.renderChannel(row, ch),
      load: (s, n) => (this.list ? this.list.load(s, n) : Promise.resolve([])),
      onChange: (_i, ch) => this.onChannelMove(ch),
      onSelect: (i, ch) => {
        if (ch) this.play(ch, i);
      },
    });
    this.chans.root.setAttribute('data-autofocus', '');

    this.panelLogo = el('img', { class: 'lp-logo', attrs: { alt: '' } });
    this.panelLogo.addEventListener('error', () => this.panelLogo.classList.add('hidden'));
    this.panelNum = el('div', { class: 'lp-num' });
    this.panelName = el('div', { class: 'lp-name' });
    this.panelGroup = el('div', { class: 'lp-group' });
    this.panelState = el('div', { class: 'lp-state' });
    this.digitBox = el('div', { class: 'osd-digits hidden' });
    this.pvStatus = el('div', { class: 'lp-pv-status' });
    this.pvBox = el('div', { class: 'lp-video' }, [this.panelLogo, this.pvStatus]);
    this.epgBox = el('div', { class: this.guideMode ? 'lp-epg guide' : 'lp-epg' });
    const panel = el('div', { class: 'live-panel' }, [
      this.pvBox,
      el('div', { class: 'lp-line' }, [this.panelNum, this.panelState]),
      this.panelName,
      this.panelGroup,
      this.epgBox,
      el('p', { class: 'lp-hint', text: this.guideMode ? t('live.hintGuide') : t('live.hint') }),
    ]);
    if (settings.get().livePreview) this.preview = new LivePreview(this.pvBox, (st) => this.paintPreview(st));

    this.body.appendChild(head);
    this.body.appendChild(el('div', { class: 'live-cols' }, [this.cats.root, this.chans.root, panel]));
    this.body.appendChild(this.digitBox);
    this.subtitle.textContent = src.name + ' · ' + t('live.channels', { n: fmtInt(src.import!.live) });
  }

  private async loadCategories(): Promise<void> {
    const src = this.source!;
    const gk = src.import!.gk;
    const [groups, favs, recents] = await Promise.all([
      this.ctx.data.call('groups.get', gk),
      this.ctx.library.list('favorites', src.id),
      this.ctx.library.list('history', src.id),
      this.ctx.library.ensureFavorites(src.id),
    ]);
    this.catItems = [
      { id: 'fav', kind: 'fav', label: t('live.cat.fav'), count: favs.length },
      { id: 'recent', kind: 'recent', label: t('live.cat.recent'), count: recents.length },
      { id: 'all', kind: 'all', label: t('live.cat.all'), count: src.import!.live },
    ];
    for (const g of groups) {
      if (g.kind === 'live') this.catItems.push({ id: 'g:' + g.name, kind: 'group', label: g.name, count: g.count, group: g.name, locked: parental.isBlocked('live', g.name) });
    }
    // Favoritos/Histórico pelo menu abrem na categoria pedida; senão, a última usada,
    // exceto se ela estiver vazia (abrir numa lista vazia não ajuda ninguém)
    // (o Guia abre como a TV ao vivo: na última categoria usada)
    const byMemory = this.start === 'all' || this.start === 'guide';
    let wanted = byMemory ? settings.get().lastLiveCat || 'all' : this.start;
    const remembered = this.catItems.find((c) => c.id === wanted);
    if (byMemory && (!remembered || remembered.count === 0 || remembered.locked)) wanted = 'all';
    const idx = Math.max(0, this.catItems.findIndex((c) => c.id === wanted));
    this.cats.setCount(this.catItems.length, idx);
    this.applyCategoryNow();
    // a tela pode ter sido montada antes das categorias: garante o foco na lista de canais
    if (!focus.current || !this.root.contains(focus.current)) focus.focus(this.chans.root);
  }

  private scheduleCategory(): void {
    if (this.catTimer) clearTimeout(this.catTimer);
    this.catTimer = setTimeout(() => this.applyCategoryNow(), CAT_DEBOUNCE_MS);
  }

  private applyCategoryNow(): void {
    if (this.catTimer) clearTimeout(this.catTimer);
    const cat = this.catItems[this.cats.index];
    if (!cat || cat.id === this.listCatId) return;
    void this.loadCategory(cat);
  }

  private async loadCategory(cat: Cat, keepIndex = 0): Promise<void> {
    const src = this.source!;
    const gk = src.import!.gk;
    const seq = ++this.loadSeq;
    let list: ChannelList;
    const hide = parental.hiddenGroups('live');
    if (cat.locked) {
      list = snapshotList([]);
    } else if (cat.kind === 'fav' || cat.kind === 'recent') {
      const saved = await this.ctx.library.list(cat.kind === 'fav' ? 'favorites' : 'history', src.id);
      list = snapshotList(hide.length ? saved.filter((e) => hide.indexOf(e.channel.group) < 0) : saved);
    } else if (cat.kind === 'search') {
      list = idList(this.ctx.data, await this.ctx.data.call('channels.search', gk, cat.term || '', hide));
    } else {
      list = idList(this.ctx.data, await this.ctx.data.call('channels.ids', gk, cat.kind === 'all' ? null : cat.group || '', cat.kind === 'all' ? hide : []));
    }
    if (seq !== this.loadSeq) return; // o usuário já mudou de categoria
    this.list = list;
    this.listCatId = cat.id;
    this.chans.root.setAttribute('data-empty', cat.kind);
    setEmptyText(
      this.chans.root,
      cat.locked ? t('parental.catLocked') : cat.kind === 'fav' ? t('live.empty.fav') : cat.kind === 'recent' ? t('live.empty.recent') : t('live.empty.group'),
    );
    this.chans.setCount(list.size, keepIndex);
    if (cat.kind !== 'search' && !cat.locked) settings.set({ lastLiveCat: cat.id });
  }

  private play(ch: Channel, index: number): void {
    const src = this.source!;
    this.ctx.push(
      new PlayerScreen(
        this.ctx,
        src,
        ch,
        this.list,
        index,
        (last, lastIndex) => {
          this.playingKey = channelKey(last);
          // seleção acompanha o último canal assistido, se ainda for desta lista
          if (lastIndex >= 0 && lastIndex < this.chans.size) this.chans.select(lastIndex);
          this.chans.refresh();
        },
        this.handoff(ch),
      ),
    );
  }

  /** Mini janela <-> tela cheia: passa o stream adiante e o recebe de volta, sem reabrir. */
  private handoff(ch: Channel): PlayerHandoff {
    const pv = this.preview;
    if (!pv) return {};
    let session: PlaybackSession | undefined;
    if (pv.isShowing(channelKey(ch))) session = pv.take() || undefined;
    else pv.stop();
    return { session, keepAlive: (s, last) => pv.adopt(s, channelKey(last)) };
  }

  private async toggleFavorite(): Promise<void> {
    const ch = this.chans.item();
    if (!ch || !ch.name || ch.name === '—') return;
    try {
      const on = await this.ctx.library.toggleFavorite(this.source!.id, ch);
      toast(on ? t('live.favAdded', { name: ch.name }) : t('live.favRemoved', { name: ch.name }));
    } catch {
      toast(t('live.favLimit'), 'error');
    }
  }

  private onLibraryChange(): void {
    this.chans.refresh();
    this.paintPanel(this.chans.item());
    void this.refreshLibraryCounts();
  }

  private async refreshLibraryCounts(): Promise<void> {
    const src = this.source!;
    const [favs, recents] = await Promise.all([this.ctx.library.list('favorites', src.id), this.ctx.library.list('history', src.id)]);
    const fav = this.catItems.find((c) => c.id === 'fav');
    const rec = this.catItems.find((c) => c.id === 'recent');
    if (fav) fav.count = favs.length;
    if (rec) rec.count = recents.length;
    this.cats.setCount(this.catItems.length, this.cats.index);
    // a lista aberta é de favoritos/recentes: recarrega mantendo a posição
    if (this.listCatId === 'fav' || this.listCatId === 'recent') {
      const cat = this.catItems.find((c) => c.id === this.listCatId)!;
      this.listCatId = '';
      await this.loadCategory(cat, this.chans.index);
    }
  }

  private async search(): Promise<void> {
    const term = await openKeyboard({ title: t('live.searchTitle'), value: '', maxLength: 60 });
    if (!term || !term.trim()) return;
    const src = this.source!;
    const ids = await withBusy(t('live.searching'), () => this.ctx.data.call('channels.search', src.import!.gk, term.trim(), parental.hiddenGroups('live')));
    if (ids == null) return;
    if (!ids.length) {
      toast(t('live.noResults', { q: term.trim() }), 'error');
      return;
    }
    // categoria "Busca" fica no topo até a próxima busca
    this.catItems = this.catItems.filter((c) => c.kind !== 'search');
    this.catItems.unshift({ id: 'search', kind: 'search', label: t('live.cat.search', { q: term.trim() }), count: ids.length, term: term.trim() });
    this.listCatId = '';
    this.cats.setCount(this.catItems.length, 0);
    this.applyCategoryNow();
    focus.focus(this.chans.root);
  }

  private typeDigit(d: number): void {
    if (this.digits.length >= 5) return;
    this.digits += String(d);
    this.digitBox.textContent = this.digits;
    this.digitBox.classList.remove('hidden');
    if (this.digitTimer) clearTimeout(this.digitTimer);
    this.digitTimer = setTimeout(() => this.commitDigits(), DIGIT_WAIT_MS);
  }

  private commitDigits(): void {
    if (this.digitTimer) clearTimeout(this.digitTimer);
    const n = Number(this.digits);
    this.digits = '';
    this.digitBox.classList.add('hidden');
    if (!n) return;
    const gk = this.source!.import!.gk;
    void this.ctx.data.call('channels.byNumber', gk, n).then((ch) => {
      if (!ch) return toast(t('player.noChannel', { n }), 'error');
      // número vale para a lista inteira: sem lista, o CH± do player usa o vizinho
      // direto no banco (buscar os 88 mil ids antes atrasava a abertura em segundos)
      this.ctx.push(new PlayerScreen(this.ctx, this.source!, ch, null, 0, undefined, this.handoff(ch)));
    });
  }

  /**
   * Enquanto o usuário rola, os logos não são trocados: na TV, baixar e
   * decodificar 9 imagens por seta derrubou a rolagem para ~1 quadro/s.
   * Os logos entram quando a lista para por LOGO_IDLE_MS.
   */
  private onChannelMove(ch: Channel | null): void {
    this.scrolling = true;
    this.paintPanel(ch, false);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.preview) this.preview.cancel();
    this.idleTimer = setTimeout(() => {
      this.scrolling = false;
      this.chans.refresh();
      const cur = this.chans.item();
      this.paintPanel(cur, true);
      this.loadEpg(cur);
      if (this.preview && cur && cur.name) this.preview.want(channelKey(cur), streamUrl(cur, this.source!, liveFormatPref()));
    }, LOGO_IDLE_MS);
  }

  /** Estado da mini janela: transparente só quando o vídeo do canal selecionado está na tela. */
  private paintPreview(st: SessionState | null): void {
    const cur = this.chans ? this.chans.item() : null;
    const mine = !!cur && !!this.preview && this.preview.key === channelKey(cur);
    const live = mine && !!st && st.status === 'playing';
    this.pvBox.classList.toggle('live', live);
    let text = '';
    if (mine && st) {
      if (st.status === 'connecting' || st.status === 'buffering' || st.status === 'retrying') text = t('player.connecting');
      else if (st.status === 'failed') text = t('live.previewFail');
    }
    this.pvStatus.textContent = text;
  }

  private loadEpg(ch: Channel | null): void {
    const seq = ++this.epgSeq;
    // versão atual da fonte: o guia pode ter terminado de baixar depois que a tela abriu
    const src = this.ctx.sources.get(this.source!.id) || this.source!;
    clear(this.epgBox);
    if (!ch) return;
    if (!src.epg) {
      // sem guia ainda: diz o motivo (baixando, falhou ou a lista não tem)
      const msg = this.ctx.imports.isEpgRunning(src.id) ? t('epg.loading') : src.epgError ? t('epg.failed') : t('epg.noSource');
      this.epgBox.appendChild(el('div', { class: 'epg-none', text: msg }));
      return;
    }
    void scheduleFor(this.ctx.data, src, ch, this.guideMode ? GUIDE_ITEMS : 2)
      .then((list) => {
        if (seq !== this.epgSeq) return;
        if (this.guideMode) renderSchedule(this.epgBox, list);
        else renderNowNext(this.epgBox, list);
      })
      .catch(() => undefined);
  }

  private renderChannel(row: HTMLElement, ch: Channel | null): void {
    let parts = (row as unknown as { _p?: ChannelRowParts })._p;
    if (!parts) {
      parts = {
        num: el('span', { class: 'cr-num' }),
        logo: el('img', { class: 'cr-logo', attrs: { alt: '' } }),
        name: el('span', { class: 'cr-name' }),
        playing: icon('live', 'icon cr-ic cr-playing'),
        fav: icon('favorites', 'icon cr-ic cr-fav'),
      };
      const p = parts;
      p.logo.addEventListener('error', () => p.logo.classList.add('hidden'));
      p.logo.addEventListener('load', () => p.logo.classList.remove('hidden'));
      row.appendChild(p.num);
      row.appendChild(p.logo);
      row.appendChild(p.name);
      row.appendChild(p.playing);
      row.appendChild(p.fav);
      (row as unknown as { _p?: ChannelRowParts })._p = p;
    }
    if (!ch) {
      parts.num.textContent = '';
      parts.name.textContent = '';
      parts.playing.classList.add('hidden');
      parts.fav.classList.add('hidden');
      parts.logo.classList.add('hidden');
      return;
    }
    parts.num.textContent = ch.num ? String(ch.num) : '';
    parts.name.textContent = ch.name;
    const fav = this.ctx.library.isFavorite(this.source!.id, ch);
    const playing = this.playingKey === channelKey(ch);
    parts.playing.classList.toggle('hidden', !playing);
    parts.fav.classList.toggle('hidden', !fav);
    row.classList.toggle('playing', playing);
    const logo = ch.logo || '';
    if (parts.logo.getAttribute('src') !== logo) {
      // rolando: esconde o logo antigo em vez de carregar o novo agora
      parts.logo.classList.add('hidden');
      if (!logo) parts.logo.removeAttribute('src');
      else if (!this.scrolling) parts.logo.setAttribute('src', logo);
    }
  }

  private paintPanel(ch: Channel | null, withLogo = true): void {
    if (this.preview) this.paintPreview(this.preview.state());
    // rolando: o guia do canal anterior sai na hora; o novo entra quando a lista para
    if (!withLogo) {
      this.epgSeq++;
      clear(this.epgBox);
    }
    if (!ch) {
      this.panelNum.textContent = '';
      this.panelName.textContent = '';
      this.panelGroup.textContent = '';
      this.panelState.textContent = '';
      this.panelLogo.classList.add('hidden');
      return;
    }
    this.panelNum.textContent = ch.num ? String(ch.num) : '';
    this.panelName.textContent = ch.name;
    this.panelGroup.textContent = ch.group;
    clear(this.panelState);
    if (this.playingKey === channelKey(ch)) {
      this.panelState.appendChild(el('span', { class: 'lp-tag' }, [icon('live', 'icon'), el('span', { text: t('live.playing') })]));
    }
    if (this.ctx.library.isFavorite(this.source!.id, ch)) {
      this.panelState.appendChild(el('span', { class: 'lp-tag fav' }, [icon('favorites', 'icon'), el('span', { text: t('live.cat.fav') })]));
    }
    if (ch.logo && withLogo) {
      this.panelLogo.classList.remove('hidden');
      if (this.panelLogo.getAttribute('src') !== ch.logo) this.panelLogo.src = ch.logo;
    } else this.panelLogo.classList.add('hidden');
  }
}

interface ChannelRowParts {
  num: HTMLElement;
  logo: HTMLImageElement;
  name: HTMLElement;
  playing: SVGSVGElement;
  fav: SVGSVGElement;
}

// ícones SVG em vez de símbolos Unicode: a fonte da TV pode não ter ★ ⟲ ⌕
const CAT_ICON: Partial<Record<Cat['kind'], IconName>> = { fav: 'favorites', recent: 'history', search: 'search', all: 'live' };

function renderCat(row: HTMLElement, c: Cat | null): void {
  clear(row);
  if (!c) return;
  const ic = CAT_ICON[c.kind];
  if (c.locked) row.appendChild(icon('lock', 'icon cat-icon'));
  else if (ic) row.appendChild(icon(ic, 'icon cat-icon'));
  row.appendChild(el('span', { class: 'cat-label', text: c.label }));
  row.appendChild(el('span', { class: 'cat-count', text: c.locked ? '' : fmtInt(c.count) }));
  row.classList.toggle('special', c.kind !== 'group');
}

function setEmptyText(listRoot: HTMLElement, text: string): void {
  const e = listRoot.querySelector('.vl-empty');
  if (e) e.textContent = text;
}
