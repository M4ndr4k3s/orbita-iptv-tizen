// Teclado virtual próprio para digitar URLs, usuário e senha pelo controle.
// Atalhos: dígitos do controle digitam direto; vermelho apaga; verde conclui;
// amarelo alterna maiúsculas; Back cancela sem alterar o valor original.

import { el, clear } from '../utils/dom';
import { openOverlay } from './overlay';
import type { RemoteKey } from '../navigation/keys';
import { focus } from '../navigation/focus';
import { t } from '../services/i18n';

export interface KeyboardOptions {
  title: string;
  value: string;
  masked?: boolean;
  maxLength: number;
  /** atalhos de URL (http://, .com...) */
  url?: boolean;
}

type Special = 'shift' | 'page' | 'space' | 'del' | 'clear' | 'show' | 'done';
type Key = string | { special: Special; wide?: number };

const LETTERS: Key[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '@'],
  [{ special: 'shift' }, 'z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '-'],
];
const SYMBOLS: Key[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['!', '#', '$', '%', '&', '*', '(', ')', '=', '+'],
  ['/', '\\', ':', ';', '?', '_', '~', '|', '[', ']'],
  ['{', '}', '<', '>', '"', "'", ',', '^', '`', '.'],
];
const URL_SHORTCUTS = ['http://', 'https://', 'www.', '.com', '.m3u', ':', '/'];

export function openKeyboard(opts: KeyboardOptions): Promise<string | null> {
  return new Promise((resolve) => {
    let value = opts.value;
    let upper = false;
    let symbols = false;
    let reveal = !opts.masked;

    const preview = el('div', { class: 'kb-preview' });
    const counter = el('div', { class: 'kb-counter' });
    const grid = el('div', { class: 'kb-grid' });
    const box = el('div', { class: 'kb-box', attrs: { role: 'dialog', 'aria-modal': 'true' } }, [
      el('div', { class: 'kb-title', text: opts.title }),
      preview,
      counter,
      grid,
      el('div', { class: 'kb-legend' }, [
        el('span', { class: 'kb-dot red' }), el('span', { text: t('kb.del') }),
        el('span', { class: 'kb-dot green' }), el('span', { text: t('kb.done') }),
        el('span', { class: 'kb-dot yellow' }), el('span', { text: t('kb.shift') }),
      ]),
    ]);

    const renderPreview = () => {
      const shown = reveal ? value : value.replace(/./g, '•');
      preview.textContent = shown || ' ';
      preview.classList.toggle('empty', !value);
      preview.scrollLeft = preview.scrollWidth;
      counter.textContent = value.length + ' / ' + opts.maxLength;
    };

    const insert = (s: string) => {
      if (value.length + s.length > opts.maxLength) return;
      value += s;
      renderPreview();
    };

    const keyLabel = (k: Key): string => {
      if (typeof k === 'string') return upper && !symbols ? k.toUpperCase() : k;
      switch (k.special) {
        case 'shift': return upper ? 'ABC' : 'abc';
        case 'page': return symbols ? 'abc' : '#+=';
        case 'space': return t('kb.space');
        // texto em vez de ⌫: o glifo pode não existir na fonte da TV
        case 'del': return t('kb.del');
        case 'clear': return t('kb.clear');
        case 'show': return reveal ? t('kb.hide') : t('kb.show');
        default: return t('kb.done');
      }
    };

    const press = (k: Key) => {
      if (typeof k === 'string') return insert(upper && !symbols ? k.toUpperCase() : k);
      switch (k.special) {
        case 'shift': upper = !upper; return build();
        case 'page': symbols = !symbols; return build();
        case 'space': return insert(' ');
        case 'del': value = value.slice(0, -1); return renderPreview();
        case 'clear': value = ''; return renderPreview();
        case 'show': reveal = !reveal; renderPreview(); return build();
        default: return finish(value);
      }
    };

    // reconstrói as teclas mantendo o foco na mesma posição (linha/coluna)
    const build = () => {
      const cur = focus.current;
      const pos = cur && grid.contains(cur) ? cur.getAttribute('data-pos') : null;
      clear(grid);
      const rows: Key[][] = (symbols ? SYMBOLS : LETTERS).slice();
      if (opts.url) rows.push(URL_SHORTCUTS);
      const last: Key[] = [{ special: 'page' }, { special: 'space', wide: 3 }, { special: 'del', wide: 2 }, { special: 'clear', wide: 2 }];
      if (opts.masked) last.push({ special: 'show', wide: 2 });
      last.push({ special: 'done', wide: 2 });
      rows.push(last);
      let target: HTMLElement | null = null;
      rows.forEach((row, r) => {
        const line = el('div', { class: 'kb-row' });
        row.forEach((k, c) => {
          const special = typeof k !== 'string';
          const shortcut = typeof k === 'string' && k.length > 1;
          const cls = 'kb-key' + (special ? ' kb-special kb-' + (k as { special: Special }).special : '') + (shortcut ? ' kb-shortcut' : '');
          const key = el('div', { class: cls, text: keyLabel(k), attrs: { 'data-focusable': '', 'data-pos': r + ':' + c } });
          const wide = special ? (k as { wide?: number }).wide : shortcut ? 1.4 : undefined;
          if (wide) key.style.width = 76 * wide + 10 * (Math.ceil(wide) - 1) + 'px';
          key.addEventListener('click', () => press(k));
          if (pos === r + ':' + c) target = key;
          line.appendChild(key);
        });
        grid.appendChild(line);
      });
      if (target) focus.focus(target);
      return undefined;
    };

    const finish = (r: string | null) => {
      close();
      resolve(r);
    };

    build();
    renderPreview();
    const close = openOverlay(
      box,
      {
        onBack: () => finish(null),
        onKey: (key: RemoteKey) => {
          if (key.action === 'digit' && key.digit != null) { insert(String(key.digit)); return true; }
          if (key.action === 'red') { press({ special: 'del' }); return true; }
          if (key.action === 'green') { finish(value); return true; }
          if (key.action === 'yellow') { press({ special: 'shift' }); return true; }
          return false;
        },
      },
      'kb-layer',
      grid.querySelector<HTMLElement>('[data-pos="1:0"]'),
    );
  });
}
