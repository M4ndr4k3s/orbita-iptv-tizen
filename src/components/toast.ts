// Aviso curto no canto da tela, sem foco.

import { el } from '../utils/dom';

let host: HTMLElement | null = null;

export function toast(text: string, kind: 'info' | 'error' = 'info', ms = 3500): void {
  if (!host) {
    host = el('div', { class: 'toast-host', attrs: { 'aria-live': 'polite' } });
    document.body.appendChild(host);
  }
  const node = el('div', { class: 'toast toast-' + kind, text });
  host.appendChild(node);
  // força o estilo inicial antes de animar a entrada
  void node.offsetWidth;
  node.classList.add('show');
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => { if (node.parentNode) node.parentNode.removeChild(node); }, 300);
  }, ms);
}
