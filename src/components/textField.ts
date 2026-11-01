// Campo de formulário: mostra rótulo e valor; OK abre o teclado virtual.

import { el } from '../utils/dom';
import { openKeyboard } from './keyboard';

export interface TextFieldOptions {
  label: string;
  value: string;
  placeholder?: string;
  masked?: boolean;
  url?: boolean;
  maxLength: number;
  onChange?: (v: string) => void;
}

export class TextField {
  readonly root: HTMLElement;
  private valueEl: HTMLElement;
  private errorEl: HTMLElement;
  private value: string;

  constructor(private opts: TextFieldOptions) {
    this.value = opts.value;
    this.valueEl = el('div', { class: 'tf-value' });
    this.errorEl = el('div', { class: 'tf-error' });
    const box = el('div', { class: 'tf-box', attrs: { 'data-focusable': '', role: 'textbox' } }, [this.valueEl]);
    box.addEventListener('click', () => this.edit());
    this.root = el('div', { class: 'tf' }, [el('div', { class: 'tf-label', text: opts.label }), box, this.errorEl]);
    this.render();
  }

  get(): string {
    return this.value;
  }

  set(v: string): void {
    this.value = v;
    this.render();
  }

  setError(msg: string | null): void {
    this.errorEl.textContent = msg || '';
    this.root.classList.toggle('invalid', !!msg);
  }

  private async edit(): Promise<void> {
    const r = await openKeyboard({
      title: this.opts.label,
      value: this.value,
      masked: this.opts.masked,
      url: this.opts.url,
      maxLength: this.opts.maxLength,
    });
    if (r === null) return;
    this.value = r;
    this.setError(null);
    this.render();
    if (this.opts.onChange) this.opts.onChange(r);
  }

  private render(): void {
    if (this.value) {
      this.valueEl.textContent = this.opts.masked ? this.value.replace(/./g, '•') : this.value;
      this.valueEl.classList.remove('placeholder');
    } else {
      this.valueEl.textContent = this.opts.placeholder || '';
      this.valueEl.classList.add('placeholder');
    }
  }
}
