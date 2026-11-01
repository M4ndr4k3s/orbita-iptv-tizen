// Tela inicial. Sem listas cadastradas mostra o estado vazio e atalhos reais
// para as seções; os trilhos de conteúdo (continuar assistindo, favoritos)
// entram quando houver dados (marcos 6 e 8).

import { el } from '../utils/dom';
import type { Screen } from '../app/screen';
import { button } from '../components/button';
import { Rail } from '../components/rail';
import { icon, type IconName } from '../components/icons';
import type { SectionId } from '../components/sidebar';
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

  constructor(go: (id: SectionId) => void, onBackAtRoot: () => void) {
    const rail = new Rail(t('home.shortcuts'));
    for (const [id, ic, label] of SHORTCUTS) {
      const tile = el('div', { class: 'tile', attrs: { 'data-focusable': '' } }, [icon(ic, 'icon tile-icon'), el('span', { class: 'tile-label', text: t(label) })]);
      tile.addEventListener('click', () => go(id));
      rail.add(tile);
    }

    this.root = el('div', { class: 'screen home' }, [
      el('section', { class: 'hero' }, [
        el('h1', { class: 'hero-title', text: t('home.welcome') }),
        el('p', { class: 'hero-text', text: t('home.empty') }),
        el('div', { class: 'hero-actions' }, [
          button(t('home.addList'), { icon: 'plus', variant: 'primary', autofocus: true, onClick: () => go('lists') }),
          button(t('nav.about'), { icon: 'about', onClick: () => go('about') }),
        ]),
      ]),
      rail.root,
    ]);
    this.onBack = () => {
      onBackAtRoot();
      return false;
    };
  }

  onBack: () => boolean;
}
