// Barra de botões do OSD dos players (opções, favorito...): alternativa às teclas
// coloridas. Não usa o sistema de foco: o player repassa ←/→/OK enquanto o OSD
// está visível, então ↑/↓ continuam livres para trocar de canal.

import { el } from '../utils/dom';
import { icon, type IconName } from './icons';

export interface OsdAction {
  id: string;
  label: string;
  icon: IconName;
  run: () => void;
}

export class OsdBar {
  readonly root: HTMLElement;
  private sel = 0;
  private btns: HTMLElement[] = [];

  constructor(private actions: OsdAction[]) {
    this.root = el('div', { class: 'osd-bar' });
    for (const a of actions) {
      const b = el('div', { class: 'osd-btn', attrs: { role: 'button', 'data-id': a.id } }, [icon(a.icon), el('span', { text: a.label })]);
      b.addEventListener('click', () => a.run());
      this.btns.push(b);
      this.root.appendChild(b);
    }
    this.paint();
  }

  /** ←/→: retorna false na ponta (nada a fazer). */
  move(delta: number): boolean {
    const next = Math.max(0, Math.min(this.actions.length - 1, this.sel + delta));
    if (next === this.sel) return false;
    this.sel = next;
    this.paint();
    return true;
  }

  activate(): void {
    const a = this.actions[this.sel];
    if (a) a.run();
  }

  /** Troca o texto de um botão (ex.: "Favoritar" ↔ "Desfavoritar"). */
  setLabel(id: string, label: string): void {
    const i = this.actions.findIndex((a) => a.id === id);
    const span = i >= 0 ? this.btns[i].querySelector('span') : null;
    if (span) span.textContent = label;
  }

  reset(): void {
    this.sel = 0;
    this.paint();
  }

  get selectedId(): string {
    return this.actions[this.sel] ? this.actions[this.sel].id : '';
  }

  private paint(): void {
    this.btns.forEach((b, i) => b.classList.toggle('sel', i === this.sel));
  }
}
