// Menu lateral: recolhido mostra só ícones; expande quando recebe foco.

import { el } from '../utils/dom';
import { icon, type IconName } from './icons';
import { focus, FOCUS_EVENT } from '../navigation/focus';
import { t, type I18nKey } from '../services/i18n';

export type SectionId =
  | 'home' | 'live' | 'guide' | 'movies' | 'series' | 'favorites'
  | 'history' | 'search' | 'lists' | 'settings' | 'about';

const ITEMS: Array<[SectionId, IconName, I18nKey]> = [
  ['search', 'search', 'nav.search'],
  ['home', 'home', 'nav.home'],
  ['live', 'live', 'nav.live'],
  ['guide', 'guide', 'nav.guide'],
  ['movies', 'movies', 'nav.movies'],
  ['series', 'series', 'nav.series'],
  ['favorites', 'favorites', 'nav.favorites'],
  ['history', 'history', 'nav.history'],
  ['lists', 'lists', 'nav.lists'],
  ['settings', 'settings', 'nav.settings'],
  ['about', 'about', 'nav.about'],
];

export class Sidebar {
  readonly root: HTMLElement;
  private items = new Map<SectionId, HTMLElement>();
  private active: SectionId = 'home';

  constructor(onSelect: (id: SectionId) => void) {
    const list = el('div', { class: 'sb-items' });
    for (const [id, ic, label] of ITEMS) {
      const item = el('div', { class: 'sb-item', attrs: { 'data-focusable': '', 'data-section': id } }, [
        icon(ic),
        el('span', { class: 'sb-label', text: t(label) }),
      ]);
      item.addEventListener('click', () => onSelect(id));
      this.items.set(id, item);
      list.appendChild(item);
    }
    this.root = el('nav', { class: 'sidebar', attrs: { 'data-focus-group': '' } }, [
      el('div', { class: 'sb-brand' }, [
        el('img', { attrs: { src: 'logo.png', alt: '' } }),
        el('span', { class: 'sb-label sb-name', text: t('app.name') }),
      ]),
      list,
    ]);
    // expande enquanto o foco estiver no menu
    document.addEventListener(FOCUS_EVENT, (e) => {
      this.root.classList.toggle('expanded', this.root.contains(e.target as Node));
    });
    this.setActive('home');
  }

  setActive(id: SectionId): void {
    const prev = this.items.get(this.active);
    if (prev) prev.classList.remove('active');
    this.active = id;
    const cur = this.items.get(id);
    if (cur) {
      cur.classList.add('active');
      // ao entrar no menu pela direita, o foco cai na seção ativa
      focus.remember(this.root, cur);
    }
  }
}
