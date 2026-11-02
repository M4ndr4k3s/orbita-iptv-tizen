// Tela inicial no estilo dos apps de streaming: um destaque grande no topo e
// carrosséis de cartazes (continuar assistindo e os adicionados recentemente) que andam sozinhos. Os atalhos para as seções
// saíram: o menu lateral já faz isso. Mostra o nome da lista, nunca o endereço.

import { el, clear } from '../utils/dom';
import type { Screen } from '../app/screen';
import type { AppContext } from '../app/context';
import { button } from '../components/button';
import { PosterRail, type RailCard, type RailShape } from '../components/posterRail';
import { SourcePickerScreen } from './sourcePicker';
import { focus, FOCUS_EVENT } from '../navigation/focus';
import { importLine } from '../services/format';
import { importWithProgress } from './importFlow';
import { PlayerScreen } from './player';
import { VodPlayerScreen } from './vodPlayer';
import { openVodItem } from './vod';
import { toast } from '../components/toast';
import { idList, snapshotList } from '../services/channelLists';
import { uniqueTitles, type Channel } from '../playlist/model';
import type { Source } from '../playlist/source';
import { streamUrl } from '../player/streamUrl';
import { resume, type ResumeCard } from '../storage/resume';
import { parental } from '../services/parental';
import { t } from '../services/i18n';

// passo automático dos carrosséis e troca do destaque (a cada 2 passos)
const TICK_MS = 4000;
const RAIL_MAX = 20;
const IDLE_KEY_MS = 8000;

export class HomeScreen implements Screen {
  readonly root: HTMLElement;
  private scroller: HTMLElement;
  private hero: HTMLElement;
  private railsBox: HTMLElement;
  private rails: PosterRail[] = [];
  private featured: Channel[] = [];
  private featIndex = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticks = 0;
  private seq = 0;
  private lastKeyAt = 0;
  private onKeyDown = () => {
    this.lastKeyAt = Date.now();
  };

  constructor(private ctx: AppContext, private onBackAtRoot: () => void) {
    this.hero = el('section', { class: 'hero home-hero', attrs: { 'data-focus-group': '' } });
    this.railsBox = el('div', { class: 'home-rails' });
    this.scroller = el('div', { class: 'home-scroll' }, [this.hero, this.railsBox]);
    this.root = el('div', { class: 'screen home' }, [this.scroller]);
    this.root.addEventListener(FOCUS_EVENT, (e) => this.onFocus(e.target as HTMLElement));
    this.renderHero();
    // a home vive a sessão toda (raiz da pilha): não precisa cancelar a inscrição
    ctx.sources.onChange(() => void this.refresh());
  }

  mount(): void {
    void this.refresh();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    document.addEventListener('keydown', this.onKeyDown, true);
  }

  unmount(): void {
    if (this.timer) clearInterval(this.timer);
    document.removeEventListener('keydown', this.onKeyDown, true);
  }

  /** Voltou de outra tela: o que foi assistido muda os carrosséis. */
  show(): void {
    void this.refresh();
  }

  onBack(): boolean {
    this.onBackAtRoot();
    return false;
  }

  private tick(): void {
    // escondida (outra tela por cima): não mexe em nada
    if (this.root.offsetParent === null) return;
    for (const r of this.rails) r.tick();
    // o destaque troca mesmo com foco nele, mas não logo depois de uma tecla (evita
    // trocar o filme no meio de um OK)
    if (++this.ticks % 2 === 0 && this.featured.length > 1 && Date.now() - this.lastKeyAt > IDLE_KEY_MS) {
      this.featIndex = (this.featIndex + 1) % this.featured.length;
      this.renderHero();
    }
  }

  /** Rola a tela para mostrar a seção focada; carrossel sem foco volta a andar. */
  private onFocus(target: HTMLElement): void {
    for (const r of this.rails) if (!r.root.contains(target)) r.blur();
    const sec = target.closest('.prail, .home-hero') as HTMLElement | null;
    const y = !sec || sec === this.hero ? 0 : Math.max(0, sec.offsetTop - 60);
    this.scroller.style.transform = 'translate3d(0,' + -y + 'px,0)';
  }

  private async refresh(): Promise<void> {
    const seq = ++this.seq;
    const src = this.ctx.sources.active();
    const sections: Array<[string, RailCard[], RailShape]> = [];
    let featured: Channel[] = [];
    if (src && src.import) {
      const gk = src.import.gk;
      const d = this.ctx.data;
      const [recentMovieIds, recentSeriesIds] = await Promise.all([
        d.call('vod.recent', gk, 'movie', parental.hiddenGroups('movie')).catch(() => [] as string[]),
        d.call('vod.recent', gk, 'series', parental.hiddenGroups('series')).catch(() => [] as string[]),
      ]);
      const [movies, series] = await Promise.all([
        // pega o dobro: sobra o suficiente depois de tirar os repetidos
        d.call('channels.getMany', recentMovieIds.slice(0, RAIL_MAX * 2)),
        d.call('channels.getMany', recentSeriesIds.slice(0, RAIL_MAX * 2)),
      ]);
      if (seq !== this.seq) return;
      const ok = (x: Channel | null): x is Channel => !!x;
      const watching = uniqueTitles(resume.watching(src.id, RAIL_MAX * 2), (w) => w.card.n).slice(0, RAIL_MAX);
      if (watching.length) sections.push([t('home.rail.watching'), watching.map((w) => this.watchCard(src, w)), 'poster']);
      // o mesmo título vem mais de uma vez ([LEG], DUB, outra categoria): um cartão só
      const uniq = (list: Array<Channel | null>) => uniqueTitles(list.filter(ok), (c) => c.name).slice(0, RAIL_MAX);
      const m = uniq(movies);
      if (m.length) sections.push([t('home.rail.newMovies'), m.map((c) => this.vodCard(src, c)), 'poster']);
      const s = uniq(series);
      if (s.length) sections.push([t('home.rail.newSeries'), s.map((c) => this.vodCard(src, c)), 'poster']);
      featured = m.filter((c) => !!c.logo).slice(0, 6);
    }
    if (seq !== this.seq) return;
    const hadFocus = !!focus.current && this.railsBox.contains(focus.current);
    clear(this.railsBox);
    this.rails = sections.map(([title, cards, shape]) => new PosterRail(title, cards, shape));
    for (const r of this.rails) this.railsBox.appendChild(r.root);
    for (const r of this.rails) r.start();
    this.featured = featured;
    if (this.featIndex >= featured.length) this.featIndex = 0;
    this.renderHero();
    if (hadFocus) focus.focus(this.hero.querySelector<HTMLElement>('[data-autofocus]'));
  }

  private watchCard(src: Source, w: { key: string; pos: number; dur: number; card: ResumeCard }): RailCard {
    return {
      title: w.card.n,
      sub: w.card.k === 'episode' && w.card.d ? w.card.d.split(' · ')[0] : w.card.d,
      img: w.card.l,
      progress: w.dur > 0 ? w.pos / w.dur : undefined,
      onClick: () => {
        const c = w.card;
        // episódio: abre a série (temporadas), não o episódio solto
        if (c.k === 'episode' && c.p != null) {
          openVodItem(this.ctx, src, { id: '', gk: '', order: 0, num: 0, q: '', group: '', kind: 'series', name: c.n, logo: c.l, xid: c.p });
          return;
        }
        // URL montada agora com a fonte (o cartão não guarda credenciais)
        const url = streamUrl({ id: '', gk: '', order: 0, num: 0, q: '', group: '', name: c.n, kind: c.k === 'movie' ? 'movie' : 'series', xid: c.x, ext: c.e }, src);
        if (!url) return toast(t('player.fail.noUrl'), 'error');
        this.ctx.push(new VodPlayerScreen(this.ctx, { title: c.n, subtitle: c.d, url, key: w.key, card: c }));
      },
    };
  }

  private vodCard(src: Source, c: Channel): RailCard {
    return { title: c.name, sub: c.rating ? '★ ' + c.rating.toFixed(1) : c.group, img: c.logo, onClick: () => openVodItem(this.ctx, src, c) };
  }

  /** Retoma o último canal assistido (CH± percorre os recentes) ou abre o primeiro da lista. */
  private async watch(): Promise<void> {
    const s = this.ctx.sources.active();
    if (!s || !s.import) return;
    await this.ctx.library.ensureFavorites(s.id);
    const recent = await this.ctx.library.list('history', s.id);
    if (recent.length) {
      const list = snapshotList(recent);
      const [ch] = await list.load(0, 1);
      this.ctx.push(new PlayerScreen(this.ctx, s, ch, list, 0));
      return;
    }
    const ch = await this.ctx.data.call('channels.first', s.import.gk);
    if (!ch) {
      toast(t('player.empty'), 'error');
      return;
    }
    const ids = await this.ctx.data.call('channels.ids', s.import.gk, null);
    this.ctx.push(new PlayerScreen(this.ctx, s, ch, idList(this.ctx.data, ids), 0));
  }

  private renderHero(): void {
    const hadFocus = this.hero.contains(focus.current);
    clear(this.hero);
    this.hero.classList.remove('featured');
    const active = this.ctx.sources.active();
    if (!active) {
      this.hero.appendChild(el('h1', { class: 'hero-title', text: t('home.welcome') }));
      this.hero.appendChild(el('p', { class: 'hero-text', text: t('home.empty') }));
      this.hero.appendChild(el('div', { class: 'hero-actions' }, [
        button(t('home.addList'), { icon: 'plus', variant: 'primary', autofocus: true, onClick: () => this.ctx.go('lists') }),
      ]));
    } else if (!active.import) {
      this.hero.appendChild(el('p', { class: 'hero-kicker', text: active.name }));
      this.hero.appendChild(el('h1', { class: 'hero-title', text: t('home.notLoaded') }));
      this.hero.appendChild(el('div', { class: 'hero-actions' }, [
        button(t('home.loadNow'), { icon: 'lists', variant: 'primary', autofocus: true, onClick: () => void importWithProgress(this.ctx.imports, active) }),
      ]));
    } else {
      const f = this.featured[this.featIndex];
      const actions = el('div', { class: 'hero-actions' });
      if (f) {
        this.hero.classList.add('featured');
        actions.appendChild(button(t('home.details'), { icon: 'movies', variant: 'primary', autofocus: true, onClick: () => openVodItem(this.ctx, active, f) }));
      }
      if (active.import.live > 0) actions.appendChild(button(t('home.watch'), { icon: 'live', variant: f ? 'ghost' : 'primary', autofocus: !f, onClick: () => void this.watch() }));
      if (this.ctx.sources.list().length > 1) actions.appendChild(button(t('home.switchList'), { icon: 'lists', onClick: () => this.ctx.push(new SourcePickerScreen(this.ctx)) }));
      const text = el('div', { class: 'home-hero-text' }, [
        el('p', { class: 'hero-kicker', text: f ? t('home.featured') : active.name }),
        el('h1', { class: 'hero-title', text: f ? f.name : active.name }),
        el('p', { class: 'hero-stats', text: f ? (f.rating ? '★ ' + f.rating.toFixed(1) + ' · ' : '') + f.group : importLine(active) }),
        actions,
        el('p', { class: 'home-list-name', text: t('home.listLabel', { name: active.name }) }),
      ]);
      this.hero.appendChild(text);
      if (f && f.logo) this.hero.appendChild(el('img', { class: 'home-hero-poster', attrs: { src: f.logo, alt: '' } }));
    }
    if (hadFocus) focus.focus(this.hero.querySelector<HTMLElement>('[data-autofocus]'));
  }
}
