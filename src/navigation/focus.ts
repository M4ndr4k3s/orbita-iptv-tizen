// Gerenciador de foco para controle remoto.
// - Elementos focáveis: atributo [data-focusable]. OK dispara click().
// - Grupos ([data-focus-group]) lembram o último item focado: ao entrar de novo
//   no grupo, o foco volta para ele (ex.: voltar para o mesmo card de um trilho).
// - Escopos empilháveis: um diálogo aberto restringe o foco ao seu conteúdo.
// O foco é visual (classe .is-focused); não usamos element.focus() para não
// disparar rolagem nativa nem teclado virtual.

import { pickNext, type Direction } from './spatial';

export const FOCUS_EVENT = 'tvfocus';
const FOCUSED = 'is-focused';

const groupMemory = new WeakMap<Element, HTMLElement>();

function isUsable(el: HTMLElement): boolean {
  return el.offsetParent !== null && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true';
}

function groupOf(el: Element): Element | null {
  return el.closest('[data-focus-group]');
}

interface Scope {
  root: HTMLElement;
  current: HTMLElement | null;
}

export class FocusManager {
  private scopes: Scope[] = [];

  get current(): HTMLElement | null {
    const s = this.top();
    return s ? s.current : null;
  }

  /** Troca o escopo base (tela atual). */
  setRoot(root: HTMLElement, initial?: HTMLElement | null): void {
    for (const s of this.scopes) if (s.current) s.current.classList.remove(FOCUSED);
    this.scopes = [{ root, current: null }];
    this.focus(initial && root.contains(initial) ? initial : this.firstIn(root));
  }

  /** Empilha um escopo (diálogo/modal). O foco de baixo some até o escopo fechar. */
  pushScope(root: HTMLElement, initial?: HTMLElement | null): void {
    const below = this.current;
    if (below) below.classList.remove(FOCUSED);
    this.scopes.push({ root, current: null });
    this.focus(initial || this.firstIn(root));
  }

  popScope(): void {
    if (this.scopes.length <= 1) return;
    const popped = this.scopes.pop();
    if (popped && popped.current) popped.current.classList.remove(FOCUSED);
    const s = this.top();
    if (s && s.current) this.focus(s.current);
  }

  focus(el: HTMLElement | null): void {
    const s = this.top();
    if (!s || !el) return;
    if (s.current && s.current !== el) s.current.classList.remove(FOCUSED);
    s.current = el;
    el.classList.add(FOCUSED);
    const g = groupOf(el);
    if (g) groupMemory.set(g, el);
    el.dispatchEvent(new CustomEvent(FOCUS_EVENT, { bubbles: true }));
  }

  /** Move o foco; retorna false se não havia para onde ir. */
  move(dir: Direction): boolean {
    const s = this.top();
    if (!s) return false;
    if (!s.current || !s.root.contains(s.current) || !isUsable(s.current)) {
      this.focus(this.firstIn(s.root));
      return true;
    }
    const from = s.current;
    const all = this.focusables(s.root).filter((e) => e !== from);
    const rects = all.map((e) => e.getBoundingClientRect());
    let idx = pickNext(from.getBoundingClientRect(), rects, dir);
    // botão no canto do cabeçalho <-> conteúdo da tela: aí a diagonal é o caminho
    // natural (nunca para o menu lateral, que está em outra coluna da tela)
    if (idx < 0 && (dir === 'up' || dir === 'down')) {
      const inHead = (e: Element) => !!e.closest('.screen-head');
      const fromHead = inHead(from);
      const pool = all.map((_e, i) => i).filter((i) => !all[i].closest('.sidebar') && (fromHead ? !inHead(all[i]) : inHead(all[i])));
      if (!from.closest('.sidebar') && pool.length) {
        const j = pickNext(from.getBoundingClientRect(), pool.map((i) => rects[i]), dir, true);
        if (j >= 0) idx = pool[j];
      }
    }
    // menu lateral <-> conteúdo: os ícones do menu não ficam na altura exata do
    // conteúdo, então ←/→ cruzando essa fronteira pode ir na diagonal
    if (idx < 0 && (dir === 'left' || dir === 'right')) {
      const inSide = !!from.closest('.sidebar');
      if ((dir === 'left' && !inSide) || (dir === 'right' && inSide)) {
        const pool = all.map((_e, i) => i).filter((i) => !!all[i].closest('.sidebar') !== inSide);
        const j = pool.length ? pickNext(from.getBoundingClientRect(), pool.map((i) => rects[i]), dir, true) : -1;
        if (j >= 0) idx = pool[j];
      }
    }
    if (idx < 0) return false;
    let target = all[idx];
    // entrando em outro grupo: prefere o item lembrado desse grupo
    const tg = groupOf(target);
    if (tg && tg !== groupOf(from)) {
      const remembered = groupMemory.get(tg);
      if (remembered && tg.contains(remembered) && isUsable(remembered)) target = remembered;
    }
    this.focus(target);
    return true;
  }

  activate(): void {
    const c = this.current;
    if (c) c.click();
  }

  /** Define qual item o grupo deve restaurar quando receber foco (ex.: seção ativa do menu). */
  remember(group: Element, el: HTMLElement): void {
    groupMemory.set(group, el);
  }

  private top(): Scope | undefined {
    return this.scopes[this.scopes.length - 1];
  }

  private focusables(root: HTMLElement): HTMLElement[] {
    const list = root.querySelectorAll<HTMLElement>('[data-focusable]');
    const out: HTMLElement[] = [];
    for (let i = 0; i < list.length; i++) if (isUsable(list[i])) out.push(list[i]);
    return out;
  }

  /** Primeiro focável do container, priorizando [data-autofocus]. */
  firstIn(root: HTMLElement): HTMLElement | null {
    const preferred = root.querySelector<HTMLElement>('[data-autofocus]');
    if (preferred && isUsable(preferred)) return preferred;
    return this.focusables(root)[0] || null;
  }
}

export const focus = new FocusManager();
