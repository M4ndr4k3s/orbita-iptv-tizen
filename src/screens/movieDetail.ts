// Detalhes de um filme (OK no cartaz): cartaz, sinopse e ações. Como nos apps de
// streaming, os detalhes ficam numa tela própria em vez de um painel ao lado da
// grade, que roubava espaço dos cartazes.

import { el, clear } from '../utils/dom';
import type { Screen } from '../app/screen';
import type { AppContext } from '../app/context';
import { focus } from '../navigation/focus';
import { button } from '../components/button';
import { toast } from '../components/toast';
import { startJob } from '../components/recordActions';
import type { Channel } from '../playlist/model';
import type { Source } from '../playlist/source';
import { streamUrl } from '../player/streamUrl';
import { resume, resumeKey } from '../storage/resume';
import { getVodInfo, fmtDuration, fmtTime, type VodDetails } from '../services/vodInfo';
import { t } from '../services/i18n';
import { VodPlayerScreen } from './vodPlayer';

export class MovieDetailScreen implements Screen {
  readonly root: HTMLElement;
  private poster: HTMLImageElement;
  private meta: HTMLElement;
  private genre: HTMLElement;
  private plot: HTMLElement;
  private extra: HTMLElement;
  private actions: HTMLElement;
  private details: VodDetails | null = null;
  private alive = true;

  constructor(private ctx: AppContext, private src: Source, private item: Channel) {
    this.poster = el('img', { class: 'md-poster', attrs: { alt: '' } });
    this.poster.addEventListener('error', () => this.poster.classList.add('hidden'));
    if (item.logo) this.poster.src = item.logo;
    else this.poster.classList.add('hidden');
    this.meta = el('div', { class: 'vp-meta md-meta' });
    this.genre = el('div', { class: 'lp-group' });
    this.plot = el('p', { class: 'md-plot', text: src.kind === 'xtream' && item.xid != null ? t('vod.loading') : '' });
    this.extra = el('div', { class: 'md-extra' });
    this.actions = el('div', { class: 'md-actions', attrs: { 'data-focus-group': '' } });
    this.root = el('div', { class: 'screen movie-detail' }, [
      el('div', { class: 'md-poster-box' }, [this.poster]),
      el('div', { class: 'md-info' }, [
        el('h1', { class: 'screen-title md-title', text: item.name }),
        this.meta,
        this.genre,
        this.actions,
        this.plot,
        this.extra,
      ]),
    ]);
  }

  mount(): void {
    this.paint();
    void this.load();
  }

  unmount(): void {
    this.alive = false;
  }

  /** Voltou do player: atualiza o "continuar de". */
  show(): void {
    this.paintActions();
  }

  private async load(): Promise<void> {
    if (this.src.kind !== 'xtream' || this.item.xid == null) return;
    try {
      const d = await getVodInfo({ server: this.src.server || '', username: this.src.username || '', password: this.src.password || '' }, this.item.xid);
      if (!this.alive) return;
      this.details = d;
      if (d.poster && d.poster !== this.item.logo) {
        this.poster.classList.remove('hidden');
        this.poster.src = d.poster;
      }
      this.paint();
    } catch {
      if (this.alive) this.plot.textContent = '';
    }
  }

  private paint(): void {
    const d = this.details;
    const meta: string[] = [];
    if (d && d.year) meta.push(d.year);
    if (d && d.durationSec) meta.push(fmtDuration(d.durationSec));
    const r = (d && d.rating) || this.item.rating;
    if (r) meta.push(t('vod.rating', { r: r.toFixed(1) }));
    this.meta.textContent = meta.join(' · ');
    this.genre.textContent = (d && d.genre) || this.item.group;
    if (d) this.plot.textContent = d.plot || '';
    clear(this.extra);
    if (d && d.director) this.extra.appendChild(el('p', { text: t('vod.director', { v: d.director }) }));
    if (d && d.cast) this.extra.appendChild(el('p', { text: t('vod.cast', { v: d.cast }) }));
    this.paintActions();
  }

  private paintActions(): void {
    const at = resume.get(resumeKey(this.src, this.item.kind, this.item));
    clear(this.actions);
    const play = button(at ? t('vod.continueAt', { t: fmtTime(at) }) : t('vod.watch'), { icon: 'live', variant: 'primary', autofocus: true, onClick: () => this.play() });
    this.actions.appendChild(play);
    this.actions.appendChild(button(t('osd.download'), { icon: 'download', onClick: () => void this.download() }));
    focus.focus(play);
  }

  private play(): void {
    const url = streamUrl(this.item, this.src);
    if (!url) return toast(t('player.fail.noUrl'), 'error');
    const d = this.details;
    this.ctx.push(
      new VodPlayerScreen(this.ctx, {
        title: this.item.name,
        subtitle: this.item.group,
        url,
        key: resumeKey(this.src, this.item.kind, this.item),
        durationMs: d && d.durationSec ? d.durationSec * 1000 : undefined,
      }),
    );
  }

  private async download(): Promise<void> {
    await startJob('download', resumeKey(this.src, this.item.kind, this.item), this.item.name, streamUrl(this.item, this.src));
  }
}
