// Lista virtualizada para o controle remoto. O contêiner é UM elemento
// focável; ↑/↓ movem a seleção interna e só as linhas visíveis existem no DOM
// (um conjunto fixo reaproveitado). Itens são buscados por páginas sob demanda,
// então 50 mil canais custam o mesmo que 50.

import { el } from '../utils/dom';

export interface VirtualListOptions<T> {
  rowHeight: number;
  visibleRows: number;
  className?: string;
  /** desenha o item na linha (item null = ainda carregando) */
  render(row: HTMLElement, item: T | null, index: number): void;
  /** busca itens [start, start+count) */
  load(start: number, count: number): Promise<T[]>;
  onSelect?(index: number, item: T | null): void;
  onChange?(index: number, item: T | null): void;
  /** texto quando a lista está vazia */
  emptyText?: string;
}

const PAGE = 40;

/** Primeira linha visível após selecionar `i`, mantendo uma linha de margem. */
export function scrollWindow(top: number, i: number, visible: number, count: number): number {
  if (i < top + 1) return Math.max(0, i - 1);
  if (i > top + visible - 2) return Math.min(Math.max(0, count - visible), i - visible + 2);
  return top;
}

export class VirtualList<T> {
  readonly root: HTMLElement;
  private viewport: HTMLElement;
  private rows: HTMLElement[] = [];
  private empty: HTMLElement;
  private items = new Map<number, T>();
  private loading = new Set<number>();
  private count = 0;
  private sel = 0;
  private top = 0;
  /** muda a cada setCount: respostas de cargas antigas são descartadas */
  private epoch = 0;

  constructor(private o: VirtualListOptions<T>) {
    this.viewport = el('div', { class: 'vl-viewport' });
    this.viewport.style.height = o.rowHeight * o.visibleRows + 'px';
    for (let i = 0; i < o.visibleRows; i++) {
      const r = el('div', { class: 'vl-row' });
      r.style.height = o.rowHeight + 'px';
      r.style.top = i * o.rowHeight + 'px';
      this.rows.push(r);
      this.viewport.appendChild(r);
    }
    this.empty = el('div', { class: 'vl-empty hidden', text: o.emptyText || '' });
    this.root = el('div', { class: 'vl ' + (o.className || ''), attrs: { 'data-focusable': '', role: 'listbox' } }, [this.viewport, this.empty]);
    this.root.addEventListener('click', () => {
      if (this.o.onSelect && this.count) this.o.onSelect(this.sel, this.items.get(this.sel) || null);
    });
  }

  get index(): number {
    return this.sel;
  }

  get size(): number {
    return this.count;
  }

  item(i = this.sel): T | null {
    return this.items.get(i) || null;
  }

  /** Troca o conteúdo (nova categoria, nova busca). */
  setCount(count: number, selected = 0): void {
    this.epoch++;
    this.items.clear();
    this.loading.clear();
    this.count = count;
    this.sel = Math.max(0, Math.min(selected, count - 1));
    this.top = 0;
    this.empty.classList.toggle('hidden', count > 0);
    this.scrollTo(this.sel);
    this.paint();
    this.emitChange();
  }

  /** Atualiza um item já carregado (ex.: virou favorito) e redesenha. */
  refresh(): void {
    this.paint();
  }

  /** Move a seleção; retorna false se já estava na ponta. */
  move(delta: number): boolean {
    if (!this.count) return false;
    const next = Math.max(0, Math.min(this.count - 1, this.sel + delta));
    if (next === this.sel) return false;
    this.sel = next;
    this.scrollTo(next);
    this.paint();
    this.emitChange();
    return true;
  }

  select(i: number): void {
    this.move(i - this.sel);
  }

  /** ↑/↓ e CH± (página). Retorna true se consumiu a tecla. */
  handleKey(action: string): boolean {
    switch (action) {
      case 'up':
        return this.move(-1);
      case 'down':
        return this.move(1);
      case 'chUp':
        this.move(-this.o.visibleRows);
        return true;
      case 'chDown':
        this.move(this.o.visibleRows);
        return true;
      default:
        return false;
    }
  }

  private scrollTo(i: number): void {
    this.top = scrollWindow(this.top, i, this.o.visibleRows, this.count);
  }

  private paint(): void {
    const vis = this.o.visibleRows;
    for (let k = 0; k < vis; k++) {
      const i = this.top + k;
      const r = this.rows[k];
      if (i >= this.count) {
        r.classList.add('hidden');
        continue;
      }
      r.classList.remove('hidden');
      r.classList.toggle('sel', i === this.sel);
      const item = this.items.get(i);
      r.classList.toggle('loading', !item);
      this.o.render(r, item || null, i);
    }
    // garante as páginas visíveis e a próxima
    this.ensure(this.top);
    this.ensure(this.top + vis);
  }

  private ensure(i: number): void {
    if (i >= this.count) return;
    const page = Math.floor(i / PAGE);
    if (this.loading.has(page) || this.items.has(page * PAGE)) return;
    this.loading.add(page);
    const epoch = this.epoch;
    const start = page * PAGE;
    this.o
      .load(start, Math.min(PAGE, this.count - start))
      .then((list) => {
        if (epoch !== this.epoch) return;
        list.forEach((it, k) => this.items.set(start + k, it));
        this.loading.delete(page);
        this.paint();
        if (this.sel >= start && this.sel < start + list.length) this.emitChange();
      })
      .catch(() => {
        if (epoch === this.epoch) this.loading.delete(page);
      });
  }

  private emitChange(): void {
    if (this.o.onChange) this.o.onChange(this.sel, this.items.get(this.sel) || null);
  }
}
