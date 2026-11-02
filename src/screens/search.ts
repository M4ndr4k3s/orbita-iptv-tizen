// Busca global: um termo procura em canais, filmes, séries e na programação do
// guia ao mesmo tempo. Cada seção mostra no máximo SECTION_MAX resultados.

import { el, clear } from '../utils/dom';
import type { Screen } from '../app/screen';
import type { AppContext } from '../app/context';
import { focus, FOCUS_EVENT } from '../navigation/focus';
import { button } from '../components/button';
import { icon, type IconName } from '../components/icons';
import { openKeyboard } from '../components/keyboard';
import { toast } from '../components/toast';
import { idList } from '../services/channelLists';
import { parental } from '../services/parental';
import { t, type I18nKey } from '../services/i18n';
import type { Channel } from '../playlist/model';
import type { Source } from '../playlist/source';
import type { EpgHit } from '../storage/epgStore';
import { PlayerScreen } from './player';
import { openVodItem } from './vod';

declare const __DEV__: boolean;

const SECTION_MAX = 20;

interface Results {
  term: string;
  live: string[];
  movie: string[];
  series: string[];
  epg: EpgHit[];
}

const pad2 = (n: number) => (n < 10 ? '0' : '') + n;
const hhmm = (ms: number) => {
  const d = new Date(ms);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
};

export class SearchScreen implements Screen {
  readonly root: HTMLElement;
  private body: HTMLElement;
  private status: HTMLElement;
  private seq = 0;
  private asked = false;

  constructor(private ctx: AppContext) {
    this.status = el('p', { class: 'screen-sub', text: t('search.subtitle') });
    this.body = el('div', { class: 'search-body', attrs: { 'data-focus-group': '' } });
    this.root = el('div', { class: 'screen search' }, [
      el('div', { class: 'screen-head' }, [
        el('div', {}, [el('h1', { class: 'screen-title', text: t('nav.search') }), this.status]),
        el('div', { class: 'live-head-actions' }, [button(t('search.new'), { icon: 'search', autofocus: true, onClick: () => void this.ask() })]),
      ]),
      this.body,
    ]);
    // mantém o item focado visível (a lista rola dentro da tela)
    this.body.addEventListener(FOCUS_EVENT, (e) => {
      const it = e.target as HTMLElement;
      // .search-body é position: relative, então offsetTop já é relativo a ela
      const top = it.offsetTop;
      if (top < this.body.scrollTop + 60) this.body.scrollTop = Math.max(0, top - 60);
      else if (top + it.offsetHeight > this.body.scrollTop + this.body.clientHeight) this.body.scrollTop = top + it.offsetHeight - this.body.clientHeight;
    });
  }

  show(): void {
    // abre o teclado direto na primeira vez
    if (!this.asked) {
      this.asked = true;
      // monta os índices no worker enquanto a pessoa digita
      const src = this.ctx.sources.active();
      if (src && src.import) void this.ctx.data.call('search.warm', src.import.gk, src.epg ? src.epg.ek : null).catch(() => {});
      setTimeout(() => void this.ask(), 0);
    }
  }

  private async ask(): Promise<void> {
    const term = await openKeyboard({ title: t('search.prompt'), value: '', maxLength: 60 });
    if (term == null || !term.trim()) return;
    await this.run(term.trim());
  }

  private async run(term: string): Promise<void> {
    const src = this.ctx.sources.active();
    if (!src || !src.import) return toast(t('search.noList'), 'error');
    const gk = src.import.gk;
    const seq = ++this.seq;
    this.status.textContent = t('search.searching', { q: term });
    clear(this.body);
    const t0 = Date.now();
    const d = this.ctx.data;
    // só em builds de teste: tempo de cada parte (canais, filmes, séries, guia)
    const parts: Record<string, number> = {};
    const timed = <T>(name: string, p: Promise<T>) => p.then((v) => ((parts[name] = Date.now() - t0), v));
    const [live, movie, series, epg] = await Promise.all([
      timed('live', d.call('channels.search', gk, term, parental.hiddenGroups('live'))),
      timed('movie', d.call('vod.search', gk, 'movie', term, parental.hiddenGroups('movie'))),
      timed('series', d.call('vod.search', gk, 'series', term, parental.hiddenGroups('series'))),
      timed('epg', src.epg ? d.call('epg.search', src.epg.ek, gk, term, parental.hiddenGroups('live')) : Promise.resolve([] as EpgHit[])),
    ]).catch(() => [[], [], [], []] as [string[], string[], string[], EpgHit[]]);
    if (__DEV__) (window as unknown as Record<string, unknown>).__orbitaSearchParts = parts;
    if (seq !== this.seq) return;
    // só em builds de teste: tempo da busca (roteiro do marco 11)
    if (__DEV__) (window as unknown as Record<string, unknown>).__orbitaSearchMs = Date.now() - t0;
    await this.render(src, { term, live, movie, series, epg });
  }

  private async render(src: Source, r: Results): Promise<void> {
    const d = this.ctx.data;
    // busca os itens só do que vai aparecer
    const [live, movie, series, epgCh] = await Promise.all([
      d.call('channels.getMany', r.live.slice(0, SECTION_MAX)),
      d.call('channels.getMany', r.movie.slice(0, SECTION_MAX)),
      d.call('channels.getMany', r.series.slice(0, SECTION_MAX)),
      d.call('channels.getMany', r.epg.slice(0, SECTION_MAX).map((h) => h.channelId)),
    ]);
    clear(this.body);
    let first: HTMLElement | null = null;
    const section = (key: I18nKey, n: number, rows: HTMLElement[]) => {
      if (!rows.length) return;
      this.body.appendChild(el('h2', { class: 'search-sec', text: t(key, { n }) }));
      for (const row of rows) this.body.appendChild(row);
      if (!first) first = rows[0];
    };
    const row = (ic: IconName, name: string, sub: string, run: () => void): HTMLElement => {
      const e = el('div', { class: 'search-row', attrs: { 'data-focusable': '', role: 'button' } }, [
        icon(ic, 'icon search-ic'),
        el('div', { class: 'search-txt' }, [el('div', { class: 'search-name', text: name }), el('div', { class: 'search-meta', text: sub })]),
      ]);
      e.addEventListener('click', run);
      return e;
    };
    const ok = (x: Channel | null): x is Channel => !!x;

    section('search.sec.live', r.live.length, live.filter(ok).map((c) =>
      row('live', c.num + '  ' + c.name, c.group, () => this.playLive(src, c, r.live))));
    section('search.sec.epg', r.epg.length, r.epg.slice(0, SECTION_MAX).map((h, i) => {
      const c = epgCh[i];
      if (!c) return null;
      const now = Date.now();
      const when = h.start <= now ? t('search.onAir') : hhmm(h.start);
      return row('guide', h.title, when + ' · ' + c.num + '  ' + c.name, () => this.playLive(src, c, r.epg.map((x) => x.channelId)));
    }).filter((x): x is HTMLElement => !!x));
    section('search.sec.movie', r.movie.length, movie.filter(ok).map((c) => row('movies', c.name, c.group, () => openVodItem(this.ctx, src, c))));
    section('search.sec.series', r.series.length, series.filter(ok).map((c) => row('series', c.name, c.group, () => openVodItem(this.ctx, src, c))));
    const total = r.live.length + r.movie.length + r.series.length + r.epg.length;
    this.status.textContent = total ? t('search.found', { q: r.term, n: total }) : t('search.none', { q: r.term });
    this.body.scrollTop = 0;
    if (first) focus.focus(first);
  }

  private playLive(src: Source, ch: Channel, ids: string[]): void {
    // CH± percorre os resultados (sem repetir canal)
    const uniq = ids.filter((id, i) => ids.indexOf(id) === i);
    this.ctx.push(new PlayerScreen(this.ctx, src, ch, idList(this.ctx.data, uniq), Math.max(0, uniq.indexOf(ch.id))));
  }
}
