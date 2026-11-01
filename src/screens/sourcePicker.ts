// Escolha da lista ativa (aberta na inicialização quando há mais de uma lista).

import { el } from '../utils/dom';
import type { Screen } from '../app/screen';
import type { AppContext } from '../app/context';
import { button } from '../components/button';
import { icon } from '../components/icons';
import { describeSource } from '../playlist/source';
import { t } from '../services/i18n';

export class SourcePickerScreen implements Screen {
  readonly root: HTMLElement;

  /** onClose: chamado quando a tela sai da pilha (escolheu ou voltou) */
  constructor(ctx: AppContext, private onClose?: () => void) {
    const activeId = ctx.sources.active() ? ctx.sources.active()!.id : null;
    const row = el('div', { class: 'picker-row' });
    for (const s of ctx.sources.list()) {
      const card = el('div', { class: 'picker-card' + (s.id === activeId ? ' active' : ''), attrs: { 'data-focusable': '' } }, [
        el('div', { class: 'picker-avatar' }, [icon(s.kind === 'm3u' ? 'lists' : 'live', 'icon')]),
        el('div', { class: 'picker-name', text: s.name }),
        el('div', { class: 'picker-desc', text: describeSource(s) }),
      ]);
      if (s.id === activeId) card.setAttribute('data-autofocus', '');
      card.addEventListener('click', () => {
        ctx.sources.setActive(s.id);
        ctx.back();
      });
      row.appendChild(card);
    }
    this.root = el('div', { class: 'screen picker' }, [
      el('h1', { class: 'picker-title', text: t('picker.title') }),
      row,
      el('div', { class: 'picker-actions' }, [button(t('picker.manage'), { icon: 'settings', onClick: () => ctx.go('lists') })]),
    ]);
  }

  unmount(): void {
    // adia para depois que o roteador terminar de trocar a tela
    if (this.onClose) setTimeout(this.onClose, 0);
  }
}
