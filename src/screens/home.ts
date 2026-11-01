// Tela inicial. Mostra a lista ativa (ou o estado vazio) e atalhos reais para
// as seções; os trilhos de conteúdo entram quando houver dados (marcos 4+).

import { el, clear } from '../utils/dom';
import type { Screen } from '../app/screen';
import type { AppContext } from '../app/context';
import { button } from '../components/button';
import { Rail } from '../components/rail';
import { icon, type IconName } from '../components/icons';
import type { SectionId } from '../components/sidebar';
import { describeSource } from '../playlist/source';
import { SourcePickerScreen } from './sourcePicker';
import { focus } from '../navigation/focus';
import { importLine } from '../services/format';
import { importWithProgress } from './importFlow';
import { t, type I18nKey } from '../services/i18n';

const SHORTCUTS: Array<[SectionId, IconName, I18nKey]> = [
  ['live', 'live', 'nav.live'],
  ['guide', 'guide', 'nav.guide'],
  ['movies', 'movies', 'nav.movies'],
  ['series', 'series', 'nav.series'],
  ['favorites', 'favorites', 'nav.favorites'],
  ['history', 'history', 'nav.history'],
  ['search', 'search', 'nav.search'],
  ['settings', 'settings', 'nav.settings'],
];

export class HomeScreen implements Screen {
  readonly root: HTMLElement;
  private hero: HTMLElement;

  constructor(private ctx: AppContext, private onBackAtRoot: () => void) {
    const rail = new Rail(t('home.shortcuts'));
    for (const [id, ic, label] of SHORTCUTS) {
      const tile = el('div', { class: 'tile', attrs: { 'data-focusable': '' } }, [icon(ic, 'icon tile-icon'), el('span', { class: 'tile-label', text: t(label) })]);
      tile.addEventListener('click', () => ctx.go(id));
      rail.add(tile);
    }
    this.hero = el('section', { class: 'hero' });
    this.root = el('div', { class: 'screen home' }, [this.hero, rail.root]);
    this.renderHero();
    // a home vive a sessão toda (raiz da pilha): não precisa cancelar a inscrição
    ctx.sources.onChange(() => this.renderHero());
  }

  onBack(): boolean {
    this.onBackAtRoot();
    return false;
  }

  private renderHero(): void {
    const hadFocus = this.hero.querySelector('.is-focused') !== null;
    clear(this.hero);
    const active = this.ctx.sources.active();
    if (!active) {
      this.hero.appendChild(el('h1', { class: 'hero-title', text: t('home.welcome') }));
      this.hero.appendChild(el('p', { class: 'hero-text', text: t('home.empty') }));
      this.hero.appendChild(el('div', { class: 'hero-actions' }, [
        button(t('home.addList'), { icon: 'plus', variant: 'primary', autofocus: true, onClick: () => this.ctx.go('lists') }),
        button(t('nav.about'), { icon: 'about', onClick: () => this.ctx.go('about') }),
      ]));
    } else {
      const actions = el('div', { class: 'hero-actions' });
      const loaded = !!active.import;
      actions.appendChild(button(loaded ? t('home.refresh') : t('home.loadNow'), {
        icon: 'lists', variant: 'primary', autofocus: true,
        onClick: () => void importWithProgress(this.ctx.imports, active),
      }));
      if (this.ctx.sources.list().length > 1) {
        actions.appendChild(button(t('home.switchList'), { icon: 'lists', onClick: () => this.ctx.push(new SourcePickerScreen(this.ctx)) }));
      }
      actions.appendChild(button(t('home.manageLists'), { icon: 'settings', onClick: () => this.ctx.go('lists') }));
      this.hero.appendChild(el('p', { class: 'hero-kicker', text: t('home.activeList') }));
      this.hero.appendChild(el('h1', { class: 'hero-title', text: active.name }));
      this.hero.appendChild(el('p', { class: 'hero-stats', text: importLine(active) }));
      this.hero.appendChild(el('p', { class: 'hero-text', text: describeSource(active) + (loaded ? ' · ' + t('home.contentNext') : '') }));
      this.hero.appendChild(actions);
    }
    // se o foco estava num botão recriado, devolve ao novo botão principal
    if (hadFocus) focus.focus(this.hero.querySelector<HTMLElement>('[data-autofocus]'));
  }
}
