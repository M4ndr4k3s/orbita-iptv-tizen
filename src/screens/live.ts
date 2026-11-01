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
import { PlayerScreen } from './player';
import { fmtInt } from '../services/format';
import { t } from '../services/i18n';

export type LiveStart = 'all' | 'fav' | 'recent';

interface Cat {
  id: string;
  kind: 'fav' | 'recent' | 'all' | 'group' | 'search';
  label: string;
  count: number;
  group?: string;
  term?: string;
}

const CAT_DEBOUNCE_MS = 250;
const DIGIT_WAIT_MS = 1500;
const LOGO_IDLE_MS = 300;

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

  constructor(private ctx: AppContext, private start: LiveStart = 'all') {
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
    void this.loadCategories();
  }

  unmount(): void {
    for (const u of this.unsub) u();
    for (const tm of [this.catTimer, this.digitTimer, this.idleTimer]) if (tm) clearTimeout(tm);
  }

  /** Ao voltar do player: atualiza contagens de Recentes/Favoritos. */
  show(): void {
    if (this.cats) void this.refreshLibraryCounts();
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
        this.applyCategoryNow();
        focus.focus(this.chans.root);
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
      el('div', {}, [el('h1', { class: 'screen-title', text: t('live.title') }), this.subtitle]),
      button(t('live.search'), { icon: 'search', onClick: () => void this.search() }),
    ]);

    this.cats = new VirtualList<Cat>({
      rowHeight: 72,
      visibleRows: 11,
      className: 'vl-cats',
      render: (row, c) => renderCat(row, c),
      load: async (s, n) => this.catItems.slice(s, s + n),
      onChange: () => this.scheduleCategory(),
      onSelect: () => {
        this.applyCategoryNow();
        focus.focus(this.chans.root);
      },
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
    const panel = el('div', { class: 'live-panel' }, [
      el('div', { class: 'lp-logo-box' }, [this.panelLogo]),
      this.panelNum,
      this.panelName,
      this.panelGroup,
      this.panelState,
      el('p', { class: 'lp-hint', text: t('live.hint') }),
    ]);

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
    for (const g of groups) if (g.kind === 'live') this.catItems.push({ id: 'g:' + g.name, kind: 'group', label: g.name, count: g.count, group: g.name });
    // Favoritos/Histórico pelo menu abrem na categoria pedida; senão, a última usada,
    // exceto se ela estiver vazia (abrir numa lista vazia não ajuda ninguém)
    let wanted = this.start !== 'all' ? this.start : settings.get().lastLiveCat || 'all';
    const remembered = this.catItems.find((c) => c.id === wanted);
    if (this.start === 'all' && (!remembered || remembered.count === 0)) wanted = 'all';
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
    if (cat.kind === 'fav' || cat.kind === 'recent') {
      list = snapshotList(await this.ctx.library.list(cat.kind === 'fav' ? 'favorites' : 'history', src.id));
    } else if (cat.kind === 'search') {
      list = idList(this.ctx.data, await this.ctx.data.call('channels.search', gk, cat.term || ''));
    } else {
      list = idList(this.ctx.data, await this.ctx.data.call('channels.ids', gk, cat.kind === 'all' ? null : cat.group || ''));
    }
    if (seq !== this.loadSeq) return; // o usuário já mudou de categoria
    this.list = list;
    this.listCatId = cat.id;
    this.chans.root.setAttribute('data-empty', cat.kind);
    setEmptyText(this.chans.root, cat.kind === 'fav' ? t('live.empty.fav') : cat.kind === 'recent' ? t('live.empty.recent') : t('live.empty.group'));
    this.chans.setCount(list.size, keepIndex);
    if (cat.kind !== 'search') settings.set({ lastLiveCat: cat.id });
  }

  private play(ch: Channel, index: number): void {
    const src = this.source!;
    this.ctx.push(
      new PlayerScreen(this.ctx, src, ch, this.list, index, (last, lastIndex) => {
        this.playingKey = channelKey(last);
        // seleção acompanha o último canal assistido, se ainda for desta lista
        if (lastIndex >= 0 && lastIndex < this.chans.size) this.chans.select(lastIndex);
        this.chans.refresh();
      }),
    );
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
    const ids = await withBusy(t('live.searching'), () => this.ctx.data.call('channels.search', src.import!.gk, term.trim()));
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
      this.ctx.push(new PlayerScreen(this.ctx, this.source!, ch));
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
    this.idleTimer = setTimeout(() => {
      this.scrolling = false;
      this.chans.refresh();
      this.paintPanel(this.chans.item(), true);
    }, LOGO_IDLE_MS);
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
  if (ic) row.appendChild(icon(ic, 'icon cat-icon'));
  row.appendChild(el('span', { class: 'cat-label', text: c.label }));
  row.appendChild(el('span', { class: 'cat-count', text: fmtInt(c.count) }));
  row.classList.toggle('special', c.kind !== 'group');
}

function setEmptyText(listRoot: HTMLElement, text: string): void {
  const e = listRoot.querySelector('.vl-empty');
  if (e) e.textContent = text;
}
