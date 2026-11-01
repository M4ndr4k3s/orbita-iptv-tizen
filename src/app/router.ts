// Pilha de telas. Telas anteriores ficam no DOM escondidas para voltar rápido
// e com o foco onde estava; a profundidade é limitada para não acumular memória.

import type { Screen } from './screen';
import { focus } from '../navigation/focus';

const MAX_DEPTH = 8;

interface Entry {
  screen: Screen;
  lastFocus: HTMLElement | null;
}

export class Router {
  private stack: Entry[] = [];

  /**
   * host: onde as telas são montadas.
   * scopeRoot: raiz do foco (inclui o menu lateral); telas escondidas ficam fora
   * da navegação porque display:none as torna não utilizáveis.
   */
  constructor(private host: HTMLElement, private scopeRoot: HTMLElement) {}

  get current(): Screen | null {
    const e = this.stack[this.stack.length - 1];
    return e ? e.screen : null;
  }

  get depth(): number {
    return this.stack.length;
  }

  push(screen: Screen): void {
    const prev = this.stack[this.stack.length - 1];
    if (prev) {
      prev.lastFocus = focus.current;
      prev.screen.root.classList.add('hidden');
    }
    // remove a tela mais antiga (abaixo da inicial) se a pilha crescer demais
    if (this.stack.length >= MAX_DEPTH) this.dispose(this.stack.splice(1, 1)[0]);
    this.stack.push({ screen, lastFocus: null });
    this.host.appendChild(screen.root);
    if (screen.mount) screen.mount();
    this.activate(this.stack[this.stack.length - 1]);
  }

  /** Substitui a tela do topo (ex.: trocar de seção pelo menu). */
  replace(screen: Screen): void {
    const top = this.stack.pop();
    if (top) this.dispose(top);
    this.stack.push({ screen, lastFocus: null });
    this.host.appendChild(screen.root);
    if (screen.mount) screen.mount();
    this.activate(this.stack[this.stack.length - 1]);
  }

  /** Volta uma tela. Retorna false se já está na raiz. */
  pop(): boolean {
    if (this.stack.length <= 1) return false;
    const top = this.stack.pop();
    if (top) this.dispose(top);
    this.activate(this.stack[this.stack.length - 1]);
    return true;
  }

  /** Volta até a raiz (tela inicial). */
  popToRoot(): void {
    // já na raiz: não reativa (perderia o foco atual, que a próxima push precisa lembrar)
    if (this.stack.length <= 1) return;
    while (this.stack.length > 1) {
      const top = this.stack.pop();
      if (top) this.dispose(top);
    }
    this.activate(this.stack[0]);
  }

  private activate(e: Entry): void {
    e.screen.root.classList.remove('hidden');
    if (e.screen.show) e.screen.show();
    // o último foco pode estar no menu lateral (fora da tela), por isso checa o escopo todo
    const initial = e.lastFocus && this.scopeRoot.contains(e.lastFocus) ? e.lastFocus : focus.firstIn(e.screen.root);
    focus.setRoot(this.scopeRoot, initial);
  }

  private dispose(e: Entry): void {
    if (e.screen.unmount) e.screen.unmount();
    if (e.screen.root.parentNode) e.screen.root.parentNode.removeChild(e.screen.root);
  }
}
