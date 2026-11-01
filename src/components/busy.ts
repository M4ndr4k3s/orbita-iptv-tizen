// Indicador de carregamento modal com cancelamento (Back ou botão).

import { el } from '../utils/dom';
import { button } from './button';
import { openOverlay } from './overlay';
import { t } from '../services/i18n';

/**
 * Executa a tarefa mostrando o indicador. Back/Cancelar aborta o signal e
 * devolve null imediatamente: no Tizen o fetch abortado leva segundos para
 * rejeitar (medido: ~2,6 s), então não esperamos a tarefa terminar.
 */
export function withBusy<T>(text: string, task: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      close();
      fn();
    };
    const cancel = () => {
      ctrl.abort();
      finish(() => resolve(null));
    };
    const box = el('div', { class: 'dlg-box busy-box', attrs: { role: 'alertdialog', 'aria-busy': 'true' } }, [
      el('div', { class: 'spinner' }),
      el('p', { class: 'busy-text', text }),
      el('div', { class: 'dlg-actions' }, [button(t('common.cancel'), { autofocus: true, onClick: cancel })]),
    ]);
    const close = openOverlay(box, { onBack: cancel });
    task(ctrl.signal).then(
      (v) => finish(() => resolve(v)),
      (e) => finish(() => reject(e)),
    );
  });
}
