// Pilha de camadas modais (diálogos, teclado virtual). Enquanto houver uma
// aberta, o foco fica preso nela e ela recebe as teclas primeiro.

import { el } from '../utils/dom';
import { focus } from '../navigation/focus';
import type { RemoteKey } from '../navigation/keys';

export interface Overlay {
  /** tecla antes do padrão (setas/OK); retornar true para consumir */
  onKey?(key: RemoteKey): boolean;
  /** Back: padrão é fechar como cancelado */
  onBack(): void;
}

interface Entry {
  overlay: Overlay;
  layer: HTMLElement;
}

const stack: Entry[] = [];

export function isOverlayOpen(): boolean {
  return stack.length > 0;
}

export function topOverlay(): Overlay | null {
  return stack.length ? stack[stack.length - 1].overlay : null;
}

/** Monta a camada e prende o foco em `box`. Retorna a função que fecha. */
export function openOverlay(box: HTMLElement, overlay: Overlay, cls = 'dlg-layer', initial?: HTMLElement | null): () => void {
  const layer = el('div', { class: cls }, [box]);
  document.body.appendChild(layer);
  const entry: Entry = { overlay, layer };
  stack.push(entry);
  focus.pushScope(box, initial);
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
    if (layer.parentNode) layer.parentNode.removeChild(layer);
    focus.popScope();
  };
}
