// Carrossel de cartazes da tela inicial. Anda sozinho (tick) enquanto não tem
// foco; com foco, segue o cartão escolhido. Rola com transform (barato na TV) e
// só carrega as imagens perto da área visível: decodificar 20 cartazes de uma
// vez por carrossel pesou na rolagem da grade de filmes.

import { el } from '../utils/dom';
import { FOCUS_EVENT } from '../navigation/focus';

export interface RailCard {
  title: string;
  sub?: string;
  img?: string;
  /** 0–1: barra de progresso (continuar assistindo) */
  progress?: number;
  onClick: () => void;
}

export type RailShape = 'poster' | 'wide' | 'square';

// cartões carregados além dos visíveis (para o próximo passo automático já ter imagem)
const PRELOAD = 2;

export class PosterRail {
  readonly root: HTMLElement;
  private track: HTMLElement;
  private cards: HTMLElement[] = [];
  private imgs: HTMLImageElement[] = [];
  private offset = 0;
  private first = 0;
  private focused = false;

  constructor(title: string, private items: RailCard[], shape: RailShape) {
    this.track = el('div', { class: 'prail-track' });
    this.root = el('section', { class: 'prail prail-' + shape, attrs: { 'data-focus-group': '' } }, [
      el('h2', { class: 'rail-title', text: title }),
      el('div', { class: 'prail-viewport' }, [this.track]),
    ]);
    items.forEach((it, i) => {
      const img = el('img', { class: 'prail-img hidden', attrs: { alt: '' } });
      img.addEventListener('load', () => img.classList.remove('hidden'));
      img.addEventListener('error', () => img.classList.add('hidden'));
      const frame = el('div', { class: 'prail-frame' }, [el('span', { class: 'prail-ph', text: it.title.slice(0, 1) }), img]);
      if (it.progress != null) frame.appendChild(el('div', { class: 'prail-bar' }, [el('div', { class: 'prail-fill', attrs: { style: 'width:' + Math.round(Math.max(0, Math.min(1, it.progress)) * 100) + '%' } })]));
      const card = el('div', { class: 'prail-card', attrs: { 'data-focusable': '', role: 'button' } }, [
        frame,
        el('div', { class: 'prail-name', text: it.title }),
        el('div', { class: 'prail-sub', text: it.sub || '' }),
      ]);
      card.addEventListener('click', () => this.items[i].onClick());
      this.cards.push(card);
      this.imgs.push(img);
      this.track.appendChild(card);
    });
    this.root.addEventListener(FOCUS_EVENT, (e) => {
      this.focused = true;
      const i = this.cards.indexOf(e.target as HTMLElement);
      if (i >= 0) this.showFrom(Math.min(i, this.first), i);
    });
  }

  /** Chamar depois de entrar na tela (as medidas dependem do layout). */
  start(): void {
    this.loadVisible();
  }

  /** Foco saiu do carrossel: volta a andar sozinho. */
  blur(): void {
    this.focused = false;
  }

  /** Passo automático: um cartão para a frente, voltando ao início no fim. */
  tick(): void {
    if (this.focused || this.cards.length <= this.visible()) return;
    const last = this.cards.length - this.visible();
    this.showFrom(this.first >= last ? 0 : this.first + 1, -1);
  }

  private visible(): number {
    const vw = (this.track.parentElement as HTMLElement).clientWidth;
    const w = this.cards.length ? this.cards[0].offsetWidth + 24 : 1;
    return Math.max(1, Math.floor(vw / w));
  }

  /** Mostra a partir do cartão `from`; se `keep` >= 0, garante que ele fique visível. */
  private showFrom(from: number, keep: number): void {
    const vis = this.visible();
    let first = from;
    if (keep >= 0) {
      if (keep < this.first) first = keep;
      else if (keep >= this.first + vis) first = keep - vis + 1;
      else first = this.first;
    }
    first = Math.max(0, Math.min(first, Math.max(0, this.cards.length - vis)));
    this.first = first;
    const next = this.cards[first] ? this.cards[first].offsetLeft : 0;
    if (next !== this.offset) {
      this.offset = next;
      this.track.style.transform = 'translate3d(' + -next + 'px,0,0)';
    }
    this.loadVisible();
  }

  private loadVisible(): void {
    const end = Math.min(this.cards.length, this.first + this.visible() + PRELOAD);
    for (let i = this.first; i < end; i++) {
      const src = this.items[i].img;
      if (src && !this.imgs[i].getAttribute('src')) this.imgs[i].setAttribute('src', src);
    }
  }
}
