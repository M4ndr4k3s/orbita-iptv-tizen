// Seção ainda não implementada: diz isso claramente e em qual marco entra,
// em vez de exibir uma tela falsa.

import { el } from '../utils/dom';
import type { Screen } from '../app/screen';
import { button } from '../components/button';
import { icon, type IconName } from '../components/icons';
import { t } from '../services/i18n';

export class PendingScreen implements Screen {
  readonly root: HTMLElement;

  constructor(title: string, ic: IconName, milestone: number, back: () => void) {
    this.root = el('div', { class: 'screen pending' }, [
      el('div', { class: 'pending-box' }, [
        icon(ic, 'icon pending-icon'),
        el('h1', { class: 'screen-title', text: title }),
        el('p', { class: 'pending-tag', text: t('pending.title') }),
        el('p', { class: 'pending-text', text: t('pending.body', { m: milestone }) }),
        button(t('pending.back'), { icon: 'back', autofocus: true, onClick: back }),
      ]),
    ]);
  }
}
