// Trilho horizontal de cards. Rola com transform (barato na GPU) para manter o
// card focado visível; é um grupo de foco, então ao voltar ele restaura o card.

import { el } from '../utils/dom';
import { FOCUS_EVENT } from '../navigation/focus';

const EDGE = 0; // posição do card focado em relação ao início do trilho

export class Rail {
  readonly root: HTMLElement;
  private track: HTMLElement;
  private offset = 0;

  constructor(title: string) {
    this.track = el('div', { class: 'rail-track' });
    this.root = el('section', { class: 'rail', attrs: { 'data-focus-group': '' } }, [
      el('h2', { class: 'rail-title', text: title }),
      el('div', { class: 'rail-viewport' }, [this.track]),
    ]);
    this.root.addEventListener(FOCUS_EVENT, (e) => this.reveal(e.target as HTMLElement));
  }

  add(card: HTMLElement): void {
    this.track.appendChild(card);
  }

  private reveal(card: HTMLElement): void {
    const viewport = this.track.parentElement as HTMLElement;
    const vw = viewport.clientWidth;
    const left = card.offsetLeft;
    const right = left + card.offsetWidth;
    let next = this.offset;
    if (left - next < EDGE) next = left - EDGE;
    else if (right - next > vw) next = right - vw;
    next = Math.max(0, Math.min(next, Math.max(0, this.track.scrollWidth - vw)));
    if (next !== this.offset) {
      this.offset = next;
      this.track.style.transform = 'translate3d(' + -next + 'px,0,0)';
    }
  }
}
