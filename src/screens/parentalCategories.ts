// Escolha das categorias bloqueadas (TV ao vivo, filmes e séries da lista ativa).
// Só abre depois do PIN (tela de Configurações).

import { el, clear } from '../utils/dom';
import type { Screen } from '../app/screen';
import type { AppContext } from '../app/context';
import type { RemoteKey } from '../navigation/keys';
import { focus } from '../navigation/focus';
import { VirtualList } from '../components/virtualList';
import { icon } from '../components/icons';
import { parental, type ContentKind } from '../services/parental';
import { fmtInt } from '../services/format';
import { t } from '../services/i18n';

interface Item {
  kind: ContentKind;
  group: string;
  count: number;
}

const KIND_LABEL: Record<ContentKind, 'parental.kind.live' | 'parental.kind.movie' | 'parental.kind.series'> = {
  live: 'parental.kind.live',
  movie: 'parental.kind.movie',
  series: 'parental.kind.series',
};

export class ParentalCategoriesScreen implements Screen {
  readonly root: HTMLElement;
  private body: HTMLElement;
  private list: VirtualList<Item> | null = null;
  private items: Item[] = [];

  constructor(private ctx: AppContext) {
    this.body = el('div', { class: 'pc-body' });
    this.root = el('div', { class: 'screen parental-cats' }, [
      el('div', { class: 'screen-head' }, [el('div', {}, [el('h1', { class: 'screen-title', text: t('parental.cats') }), el('p', { class: 'screen-sub', text: t('parental.catsSub') })])]),
      this.body,
    ]);
  }

  mount(): void {
    const src = this.ctx.sources.active();
    if (!src || !src.import) {
      this.body.appendChild(el('p', { class: 'empty-text', text: t('live.noList') }));
      return;
    }
    void this.ctx.data.call('groups.get', src.import.gk).then((groups) => {
      const order: Record<string, number> = { live: 0, movie: 1, series: 2 };
      this.items = groups
        .filter((g) => g.kind === 'live' || g.kind === 'movie' || g.kind === 'series')
        .map((g) => ({ kind: g.kind as ContentKind, group: g.name, count: g.count }))
        .sort((a, b) => order[a.kind] - order[b.kind]);
      this.list = new VirtualList<Item>({
        rowHeight: 72,
        visibleRows: 11,
        className: 'vl-cats pc-list',
        render: (row, it) => {
          clear(row);
          if (!it) return;
          const on = parental.isGroupLocked(it.kind, it.group);
          row.classList.toggle('locked', on);
          row.appendChild(icon('lock', 'icon cat-icon' + (on ? '' : ' off')));
          row.appendChild(el('span', { class: 'cat-label', text: it.group }));
          row.appendChild(el('span', { class: 'cat-count', text: t(KIND_LABEL[it.kind]) + ' · ' + fmtInt(it.count) }));
        },
        load: async (s, n) => this.items.slice(s, s + n),
        onSelect: (_i, it) => {
          if (!it) return;
          parental.setGroupLocked(it.kind, it.group, !parental.isGroupLocked(it.kind, it.group));
          this.list!.refresh();
        },
      });
      this.list.root.setAttribute('data-autofocus', '');
      this.body.appendChild(this.list.root);
      this.list.setCount(this.items.length, 0);
      focus.focus(this.list.root);
    });
  }

  onKey(key: RemoteKey): boolean {
    if (this.list && focus.current === this.list.root) return this.list.handleKey(key.action);
    return false;
  }
}
