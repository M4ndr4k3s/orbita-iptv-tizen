// Série (Xtream): temporadas à esquerda, episódios no meio, detalhes à direita.
// Ao terminar um episódio, o próximo começa sozinho.

import { el, clear } from '../utils/dom';
import type { Screen } from '../app/screen';
import type { AppContext } from '../app/context';
import type { RemoteKey } from '../navigation/keys';
import { focus } from '../navigation/focus';
import { VirtualList } from '../components/virtualList';
import { toast } from '../components/toast';
import type { Channel } from '../playlist/model';
import type { Source } from '../playlist/source';
import { streamUrl } from '../player/streamUrl';
import { resume, resumeKey } from '../storage/resume';
import { getSeriesInfo, fmtDuration, fmtTime, type Episode, type SeriesDetails } from '../services/vodInfo';
import { VodPlayerScreen } from './vodPlayer';
import { t } from '../services/i18n';

export class SeriesScreen implements Screen {
  readonly root: HTMLElement;
  private body: HTMLElement;
  private info: SeriesDetails | null = null;
  private seasons!: VirtualList<number>;
  private eps!: VirtualList<Episode>;
  private shown: Episode[] = [];
  private status: HTMLElement;
  private poster!: HTMLImageElement;
  private eTitle!: HTMLElement;
  private eMeta!: HTMLElement;
  private ePlot!: HTMLElement;

  constructor(private ctx: AppContext, private source: Source, private series: Channel) {
    this.status = el('p', { class: 'pending-text', text: t('series.loading') });
    this.body = el('div', { class: 'live-body' }, [
      el('div', { class: 'screen-head live-head' }, [
        el('div', {}, [el('h1', { class: 'screen-title', text: series.name }), el('p', { class: 'screen-sub', text: series.group })]),
      ]),
      this.status,
    ]);
    this.root = el('div', { class: 'screen live vod series' }, [this.body]);
  }

  mount(): void {
    void this.load();
  }

  show(): void {
    if (this.eps) {
      this.eps.refresh();
      this.paintEpisode(this.eps.item());
    }
  }

  onKey(key: RemoteKey): boolean {
    if (!this.eps) return false;
    const cur = focus.current;
    if (cur === this.eps.root) return this.eps.handleKey(key.action);
    if (cur === this.seasons.root) {
      if (key.action === 'ok') {
        focus.focus(this.eps.root);
        return true;
      }
      return this.seasons.handleKey(key.action);
    }
    return false;
  }

  private async load(): Promise<void> {
    const s = this.source;
    try {
      this.info = await getSeriesInfo({ server: s.server || '', username: s.username || '', password: s.password || '' }, this.series.xid!);
    } catch {
      this.status.textContent = t('series.fail');
      return;
    }
    if (!this.info.episodes.length) {
      this.status.textContent = t('series.empty');
      return;
    }
    this.status.remove();
    this.build();
  }

  private build(): void {
    const info = this.info!;
    this.seasons = new VirtualList<number>({
      rowHeight: 72,
      visibleRows: 11,
      className: 'vl-cats',
      render: (row, n) => {
        clear(row);
        if (n == null) return;
        const count = info.episodes.filter((e) => e.season === n).length;
        row.appendChild(el('span', { class: 'cat-label', text: t('series.season', { n }) }));
        row.appendChild(el('span', { class: 'cat-count', text: String(count) }));
      },
      load: async (st, n) => info.seasons.slice(st, st + n),
      onChange: (_i, n) => this.showSeason(n),
      onSelect: () => focus.focus(this.eps.root),
    });
    this.eps = new VirtualList<Episode>({
      rowHeight: 88,
      visibleRows: 9,
      className: 'vl-chans vl-vod',
      render: (row, e) => this.renderEpisode(row, e),
      load: async (st, n) => this.shown.slice(st, st + n),
      onChange: (_i, e) => this.paintEpisode(e),
      onSelect: (i, e) => {
        if (e) this.play(i);
      },
    });
    this.eps.root.setAttribute('data-autofocus', '');

    this.poster = el('img', { class: 'vp-poster', attrs: { alt: '' } });
    this.poster.addEventListener('error', () => this.poster.classList.add('hidden'));
    this.poster.addEventListener('load', () => this.poster.classList.remove('hidden'));
    this.eTitle = el('div', { class: 'lp-name' });
    this.eMeta = el('div', { class: 'vp-meta' });
    this.ePlot = el('p', { class: 'vp-plot' });
    const panel = el('div', { class: 'live-panel vod-panel' }, [
      el('div', { class: 'vp-poster-box' }, [this.poster]),
      el('div', { class: 'vp-text' }, [this.eTitle, this.eMeta, this.ePlot]),
      el('p', { class: 'lp-hint', text: t('series.hint') }),
    ]);
    this.body.appendChild(el('div', { class: 'live-cols' }, [this.seasons.root, this.eps.root, panel]));
    this.seasons.setCount(info.seasons.length, 0);
    focus.focus(this.eps.root);
  }

  private showSeason(n: number | null): void {
    const info = this.info!;
    this.shown = n == null ? [] : info.episodes.filter((e) => e.season === n);
    this.eps.setCount(this.shown.length, 0);
  }

  private renderEpisode(row: HTMLElement, e: Episode | null): void {
    clear(row);
    if (!e) return;
    row.appendChild(el('span', { class: 'cr-num', text: t('series.ep', { s: e.season, e: e.num }) }));
    row.appendChild(el('span', { class: 'cr-name', text: e.title }));
    const at = resume.get(this.key(e));
    if (at) row.appendChild(el('span', { class: 'vr-rating', text: fmtTime(at) }));
  }

  private paintEpisode(e: Episode | null): void {
    if (!e) return;
    const info = this.info!;
    this.eTitle.textContent = e.title;
    const meta: string[] = [t('series.ep', { s: e.season, e: e.num })];
    if (e.durationSec) meta.push(fmtDuration(e.durationSec));
    const at = resume.get(this.key(e));
    if (at) meta.push(t('vod.continueAt', { t: fmtTime(at) }));
    this.eMeta.textContent = meta.join(' · ');
    this.ePlot.textContent = e.plot || info.plot || '';
    const img = e.image || info.poster || this.series.logo;
    if (img && this.poster.getAttribute('src') !== img) {
      this.poster.classList.add('hidden');
      this.poster.src = img;
    }
  }

  private key(e: Episode): string {
    return resumeKey(this.source, 'episode', { xid: e.id });
  }

  private play(index: number): void {
    const e = this.shown[index];
    // episódio vira um "item de série" para montar a URL /series/usuário/senha/id.ext
    const url = streamUrl({ id: '', gk: '', order: 0, num: 0, kind: 'series', name: e.title, q: '', group: '', xid: e.id, ext: e.ext }, this.source);
    if (!url) return toast(t('player.fail.noUrl'), 'error');
    const next = index + 1 < this.shown.length ? index + 1 : -1;
    this.ctx.push(
      new VodPlayerScreen(
        this.ctx,
        {
          title: this.series.name,
          subtitle: t('series.ep', { s: e.season, e: e.num }) + ' · ' + e.title,
          url,
          key: this.key(e),
          durationMs: e.durationSec ? e.durationSec * 1000 : undefined,
          card: { s: this.source.id, k: 'episode', x: e.id, n: this.series.name, d: t('series.ep', { s: e.season, e: e.num }) + ' · ' + e.title, l: this.series.logo, e: e.ext, p: this.series.xid },
        },
        next >= 0
          ? () => {
              // fim do episódio: fecha este player e abre o próximo
              this.ctx.back();
              this.eps.select(next);
              this.play(next);
            }
          : undefined,
      ),
    );
  }
}
