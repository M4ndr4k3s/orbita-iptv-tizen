// Diálogo modal de escolha. Enquanto aberto, o foco fica preso nele e o Back fecha.

import { el } from '../utils/dom';
import { focus } from '../navigation/focus';
import { button } from './button';

export interface DialogAction<T extends string> {
  id: T;
  label: string;
  primary?: boolean;
}

interface OpenDialog {
  close(result: string | null): void;
}

const openDialogs: OpenDialog[] = [];

export function isDialogOpen(): boolean {
  return openDialogs.length > 0;
}

/** Fecha o diálogo do topo como cancelado. Retorna false se não havia diálogo. */
export function closeTopDialog(): boolean {
  const d = openDialogs[openDialogs.length - 1];
  if (!d) return false;
  d.close(null);
  return true;
}

export function choose<T extends string>(title: string, body: string | null, actions: DialogAction<T>[]): Promise<T | null> {
  return new Promise((resolve) => {
    const buttons = el('div', { class: 'dlg-actions' });
    const box = el('div', { class: 'dlg-box', attrs: { role: 'dialog', 'aria-modal': 'true' } }, [
      el('h2', { class: 'dlg-title', text: title }),
      body ? el('p', { class: 'dlg-body', text: body }) : null,
      buttons,
    ]);
    const layer = el('div', { class: 'dlg-layer' }, [box]);

    const entry: OpenDialog = {
      close(result) {
        const i = openDialogs.indexOf(entry);
        if (i < 0) return;
        openDialogs.splice(i, 1);
        if (layer.parentNode) layer.parentNode.removeChild(layer);
        focus.popScope();
        resolve(result as T | null);
      },
    };
    for (const a of actions) {
      buttons.appendChild(button(a.label, { variant: a.primary ? 'primary' : 'ghost', autofocus: a.primary, onClick: () => entry.close(a.id) }));
    }
    document.body.appendChild(layer);
    openDialogs.push(entry);
    focus.pushScope(box);
  });
}
