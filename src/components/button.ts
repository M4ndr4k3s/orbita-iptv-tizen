import { el } from '../utils/dom';
import { icon, type IconName } from './icons';

export interface ButtonOptions {
  icon?: IconName;
  variant?: 'primary' | 'ghost';
  autofocus?: boolean;
  onClick: () => void;
}

/** Botão focável pelo controle. Não usa <button> para não brigar com o foco nativo. */
export function button(label: string, opts: ButtonOptions): HTMLElement {
  const b = el('div', { class: 'btn btn-' + (opts.variant || 'ghost'), attrs: { role: 'button', 'data-focusable': '' } }, [
    opts.icon ? icon(opts.icon) : null,
    el('span', { text: label }),
  ]);
  if (opts.autofocus) b.setAttribute('data-autofocus', '');
  b.addEventListener('click', opts.onClick);
  return b;
}
