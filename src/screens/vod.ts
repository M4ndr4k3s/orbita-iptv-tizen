// Filmes e Séries: categorias, lista virtualizada e painel com pôster e
// detalhes. Os detalhes (sinopse, elenco, duração) só são pedidos ao servidor
// quando a seleção para — rolar por 50 mil títulos não pode gerar 50 mil pedidos.

import { el, clear } from '../utils/dom';
import type { Screen } from '../app/screen';
import type { AppContext } from '../app/context';
import type { RemoteKey } from '../navigation/keys';
import { focus } from '../navigation/focus';
import { VirtualList } from '../components/virtualList';
import { button } from '../components/button';
import { toast } from '../components/toast';
import { icon } from '../components/icons';
import { idList, type ChannelList } from '../services/channelLists';
import type { Channel } from '../playlist/model';
import type { Source } from '../playlist/source';
import { streamUrl } from '../player/streamUrl';
import { resume, resumeKey } from '../storage/resume';
import { getVodInfo, fmtDuration, fmtTime, type VodDetails } from '../services/vodInfo';
import { VodPlayerScreen } from './vodPlayer';
import { SeriesScreen } from './series';
import { fmtInt } from '../services/format';
import { t } from '../services/i18n';
import { parental } from '../services/parental';
import { requirePin } from '../components/pinDialog';

export type VodKind = 'movie' | 'series';

interface Cat {
  id: string;
  label: string;
  count: number;
  group: string | null;
  locked?: boolean;
}

const CAT_DEBOUNCE_MS = 250;
const IDLE_MS = 400;

export class VodScreen implements Screen {
  readonly root: HTMLElement;
  private body: HTMLElement;
  private source: Source | undefined;
  private cats!: VirtualList<Cat>;
  private items!: VirtualList<Channel>;
  private catItems: Cat[] = [];
  private list: ChannelList | null = null;
  private listCatId = '';
  private loadSeq = 0;
  private infoSeq = 0;
  private scrolling = false;
  private catTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private details: VodDetails | null = null;
  private unsubParental: (() => void) | null = null;

  private poster!: HTMLImageElement;
  private pName!: HTMLElement;
  private pMeta!: HTMLElement;
  private pGenre!: HTMLElement;
  private pPlot!: HTMLElement;
  private pResume!: HTMLElement;

  constructor(private ctx: AppContext, private kind: VodKind) {
    this.body = el('div', { class: 'live-body' });
    this.root = el('div', { class: 'screen live vod' }, [this.body]);
  }

  mount(): void {
    this.source = this.ctx.sources.active();
    const imp = this.source && this.source.import;
    const n = imp ? (this.kind === 'movie' ? imp.movies : imp.series) : 0;
    if (!this.source || !imp || !n) {
      const failed = !!imp && !!imp.vodFailed && imp.vodFailed.indexOf(this.kind) >= 0;
      this.body.appendChild(el('div', { class: 'pending-box live-empty' }, [
        icon(this.kind === 'movie' ? 'movies' : 'series', 'icon pending-icon'),
        el('h1', { class: 'screen-title', text: t(this.kind === 'movie' ? 'nav.movies' : 'nav.series') }),
        el('p', { class: 'pending-text', text: !imp ? t('live.noList') : failed ? t('vod.failedImport') : t(this.kind === 'movie' ? 'vod.none.movie' : 'vod.none.series') }),
        button(t('home.manageLists'), { icon: 'lists', variant: 'primary', autofocus: true, onClick: () => this.ctx.go('lists') }),
      ]));
      return;
    }
    this.build(n);
    this.unsubParental = parental.onChange(() => {
      for (const c of this.catItems) c.locked = c.group != null && parental.isBlocked(this.kind, c.group);
      this.cats.setCount(this.catItems.length, this.cats.index);
      this.listCatId = '';
      this.applyCategoryNow();
    });
    void this.loadCategories(n);
  }

  /** OK numa categoria: bloqueada pede o PIN antes de abrir. */
  private async openCategory(): Promise<void> {
    const cat = this.catItems[this.cats.index];
    if (cat && cat.locked && !(await requirePin(t('parental.catBody', { name: cat.label })))) return;
    this.applyCategoryNow();
    focus.focus(this.items.root);
  }

  unmount(): void {
    if (this.unsubParental) this.unsubParental();
    for (const tm of [this.catTimer, this.idleTimer]) if (tm) clearTimeout(tm);
  }

  show(): void {
    // voltou do player: atualiza o "continuar de"
    if (this.items) this.paintPanel(this.items.item());
  }

  onKey(key: RemoteKey): boolean {
    if (!this.cats) return false;
    const cur = focus.current;
    if (cur === this.items.root) return this.items.handleKey(key.action);
    if (cur === this.cats.root) {
      if (key.action === 'ok') {
        void this.openCategory();
        return true;
      }
      return this.cats.handleKey(key.action);
    }
    return false;
  }

  private build(total: number): void {
    const src = this.source!;
    this.body.appendChild(el('div', { class: 'screen-head live-head' }, [
      el('div', {}, [
        el('h1', { class: 'screen-title', text: t(this.kind === 'movie' ? 'nav.movies' : 'nav.series') }),
        el('p', { class: 'screen-sub', text: src.name + ' · ' + t(this.kind === 'movie' ? 'vod.count.movie' : 'vod.count.series', { n: fmtInt(total) }) }),
      ]),
    ]));
    this.cats = new VirtualList<Cat>({
      rowHeight: 72,
      visibleRows: 11,
      className: 'vl-cats',
      render: (row, c) => {
        clear(row);
        if (!c) return;
        if (c.locked) row.appendChild(icon('lock', 'icon cat-icon'));
        row.appendChild(el('span', { class: 'cat-label', text: c.label }));
        row.appendChild(el('span', { class: 'cat-count', text: c.locked ? '' : fmtInt(c.count) }));
        row.classList.toggle('special', c.group == null);
      },
      load: async (s, n) => this.catItems.slice(s, s + n),
      onChange: () => this.scheduleCategory(),
      onSelect: () => void this.openCategory(),
    });
    this.items = new VirtualList<Channel>({
      rowHeight: 88,
      visibleRows: 9,
      className: 'vl-chans vl-vod',
      render: (row, it) => this.renderItem(row, it),
      load: (s, n) => (this.list ? this.list.load(s, n) : Promise.resolve([])),
      onChange: (_i, it) => this.onMove(it),
      onSelect: (_i, it) => {
        if (it) this.open(it);
      },
    });
    this.items.root.setAttribute('data-autofocus', '');
    const empty = this.items.root.querySelector('.vl-empty');
    if (empty) empty.textContent = t('vod.empty');

    this.poster = el('img', { class: 'vp-poster', attrs: { alt: '' } });
    this.poster.addEventListener('error', () => this.poster.classList.add('hidden'));
    this.poster.addEventListener('load', () => this.poster.classList.remove('hidden'));
    this.pName = el('div', { class: 'lp-name' });
    this.pMeta = el('div', { class: 'vp-meta' });
    this.pGenre = el('div', { class: 'lp-group' });
    this.pPlot = el('p', { class: 'vp-plot' });
    this.pResume = el('div', { class: 'vp-resume' });
    const panel = el('div', { class: 'live-panel vod-panel' }, [
      el('div', { class: 'vp-poster-box' }, [this.poster]),
      el('div', { class: 'vp-text' }, [this.pName, this.pMeta, this.pGenre, this.pResume, this.pPlot]),
      el('p', { class: 'lp-hint', text: t(this.kind === 'movie' ? 'vod.hint.movie' : 'vod.hint.series') }),
    ]);
    this.body.appendChild(el('div', { class: 'live-cols' }, [this.cats.root, this.items.root, panel]));
  }

  private async loadCategories(total: number): Promise<void> {
    const groups = await this.ctx.data.call('groups.get', this.source!.import!.gk);
    this.catItems = [{ id: 'all', label: t('vod.all'), count: total, group: null }];
    for (const g of groups) if (g.kind === this.kind) this.catItems.push({ id: 'g:' + g.name, label: g.name, count: g.count, group: g.name, locked: parental.isBlocked(this.kind, g.name) });
    this.cats.setCount(this.catItems.length, 0);
    this.applyCategoryNow();
    if (!focus.current || !this.root.contains(focus.current)) focus.focus(this.items.root);
  }

  private scheduleCategory(): void {
    if (this.catTimer) clearTimeout(this.catTimer);
    this.catTimer = setTimeout(() => this.applyCategoryNow(), CAT_DEBOUNCE_MS);
  }

  private applyCategoryNow(): void {
    if (this.catTimer) clearTimeout(this.catTimer);
    const cat = this.catItems[this.cats.index];
    if (!cat || cat.id === this.listCatId) return;
    const seq = ++this.loadSeq;
    const req = cat.locked
      ? Promise.resolve([] as string[])
      : this.ctx.data.call('vod.ids', this.source!.import!.gk, this.kind, cat.group, cat.group == null ? parental.hiddenGroups(this.kind) : []);
    void req.then((ids) => {
      if (seq !== this.loadSeq) return;
      this.list = idList(this.ctx.data, ids);
      this.listCatId = cat.id;
      this.items.setCount(ids.length, 0);
    });
  }

  private open(it: Channel): void {
    const src = this.source!;
    if (this.kind === 'series' && it.xid != null && src.kind === 'xtream') {
      this.ctx.push(new SeriesScreen(this.ctx, src, it));
      return;
    }
    const url = streamUrl(it, src);
    if (!url) return toast(t('player.fail.noUrl'), 'error');
    const d = this.details;
    this.ctx.push(
      new VodPlayerScreen(this.ctx, {
        title: it.name,
        subtitle: it.group,
        url,
        key: resumeKey(src, it.kind, it),
        durationMs: d && d.durationSec ? d.durationSec * 1000 : undefined,
      }),
    );
  }

  /** Rolando: só texto. Parou: pôster e detalhes do servidor. */
  private onMove(it: Channel | null): void {
    this.scrolling = true;
    this.details = null;
    this.infoSeq++;
    this.paintPanel(it, false);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.scrolling = false;
      this.items.refresh();
      const cur = this.items.item();
      this.paintPanel(cur, true);
      if (cur) void this.loadDetails(cur);
    }, IDLE_MS);
  }

  private async loadDetails(it: Channel): Promise<void> {
    const src = this.source!;
    // detalhes só existem no Xtream (filmes; a série carrega os seus na própria tela)
    if (src.kind !== 'xtream' || it.xid == null || this.kind !== 'movie') return;
    const seq = ++this.infoSeq;
    this.pPlot.textContent = t('vod.loading');
    try {
      const d = await getVodInfo({ server: src.server || '', username: src.username || '', password: src.password || '' }, it.xid);
      if (seq !== this.infoSeq) return;
      this.details = d;
      this.paintPanel(it, true);
    } catch {
      if (seq === this.infoSeq) this.pPlot.textContent = '';
    }
  }

  private renderItem(row: HTMLElement, it: Channel | null): void {
    let p = (row as unknown as { _p?: ItemParts })._p;
    if (!p) {
      p = { img: el('img', { class: 'vr-poster', attrs: { alt: '' } }), name: el('span', { class: 'cr-name' }), rating: el('span', { class: 'vr-rating' }) };
      const parts = p;
      parts.img.addEventListener('error', () => parts.img.classList.add('hidden'));
      parts.img.addEventListener('load', () => parts.img.classList.remove('hidden'));
      row.appendChild(p.img);
      row.appendChild(p.name);
      row.appendChild(p.rating);
      (row as unknown as { _p?: ItemParts })._p = p;
    }
    if (!it) {
      p.name.textContent = '';
      p.rating.textContent = '';
      p.img.classList.add('hidden');
      return;
    }
    p.name.textContent = it.name;
    p.rating.textContent = it.rating ? it.rating.toFixed(1) : '';
    const logo = it.logo || '';
    if (p.img.getAttribute('src') !== logo) {
      p.img.classList.add('hidden');
      if (!logo) p.img.removeAttribute('src');
      else if (!this.scrolling) p.img.setAttribute('src', logo);
    }
  }

  private paintPanel(it: Channel | null, full = true): void {
    if (!it) {
      for (const e of [this.pName, this.pMeta, this.pGenre, this.pPlot, this.pResume]) e.textContent = '';
      this.poster.classList.add('hidden');
      return;
    }
    const d = this.details;
    this.pName.textContent = it.name;
    const meta: string[] = [];
    if (d && d.year) meta.push(d.year);
    if (d && d.durationSec) meta.push(fmtDuration(d.durationSec));
    const r = (d && d.rating) || it.rating;
    if (r) meta.push(t('vod.rating', { r: r.toFixed(1) }));
    this.pMeta.textContent = meta.join(' · ');
    this.pGenre.textContent = (d && d.genre) || it.group;
    this.pPlot.textContent = d ? d.plot || '' : '';
    const at = this.kind === 'movie' ? resume.get(resumeKey(this.source!, it.kind, it)) : 0;
    this.pResume.textContent = at ? t('vod.continueAt', { t: fmtTime(at) }) : '';
    const img = (d && d.poster) || it.logo;
    if (full && img) {
      if (this.poster.getAttribute('src') !== img) {
        this.poster.classList.add('hidden');
        this.poster.src = img;
      }
    } else if (!full) this.poster.classList.add('hidden');
    else this.poster.classList.add('hidden');
  }
}

interface ItemParts {
  img: HTMLImageElement;
  name: HTMLElement;
  rating: HTMLElement;
}
