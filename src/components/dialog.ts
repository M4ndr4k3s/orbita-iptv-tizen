// Diálogo modal de escolha. Back fecha como cancelado (null).

import { el } from '../utils/dom';
import { button } from './button';
import { openOverlay } from './overlay';
import { t } from '../services/i18n';

export interface DialogAction<T extends string> {
  id: T;
  label: string;
  primary?: boolean;
  danger?: boolean;
}

export function choose<T extends string>(title: string, body: string | null, actions: DialogAction<T>[], vertical = false): Promise<T | null> {
  return new Promise((resolve) => {
    const buttons = el('div', { class: 'dlg-actions' + (vertical ? ' vertical' : '') });
    const box = el('div', { class: 'dlg-box', attrs: { role: 'dialog', 'aria-modal': 'true' } }, [
      el('h2', { class: 'dlg-title', text: title }),
      body ? el('p', { class: 'dlg-body', text: body }) : null,
      buttons,
    ]);
    let close = () => undefined as void;
    const finish = (r: T | null) => {
      close();
      resolve(r);
    };
    for (const a of actions) {
      const b = button(a.label, { variant: a.primary ? 'primary' : 'ghost', autofocus: a.primary, onClick: () => finish(a.id) });
      if (a.danger) b.classList.add('btn-danger');
      buttons.appendChild(b);
    }
    close = openOverlay(box, { onBack: () => finish(null) });
  });
}

/** Confirmação de "apagar histórico" (Configurações e tela de Histórico). */
export async function confirmClearHistory(): Promise<boolean> {
  const r = await choose(t('history.clearTitle'), t('history.clearBody'), [
    { id: 'yes', label: t('history.clearGo'), danger: true },
    { id: 'no', label: t('common.cancel'), primary: true },
  ]);
  return r === 'yes';
}

/** Aviso simples com um botão. */
export async function alertBox(title: string, body: string, ok: string): Promise<void> {
  await choose(title, body, [{ id: 'ok', label: ok, primary: true }]);
}
