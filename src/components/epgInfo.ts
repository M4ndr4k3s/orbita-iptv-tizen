// Blocos de guia (EPG) reaproveitados na TV ao vivo e no OSD do player.
// Texto do guia vem de terceiros: sempre via textContent (el text), nunca HTML.

import { el, clear } from '../utils/dom';
import type { Programme } from '../epg/model';
import { fmtClock, progressOf } from '../services/guide';
import { t } from '../services/i18n';

/** "Agora" com barra de progresso e "A seguir". Lista vazia = aviso de sem guia. */
export function renderNowNext(box: HTMLElement, list: Programme[], now = Date.now(), noGuide = t('epg.none')): void {
  clear(box);
  const cur = list.length && list[0].start <= now ? list[0] : null;
  const next = cur ? list[1] : list[0];
  if (!cur && !next) {
    box.appendChild(el('div', { class: 'epg-none', text: noGuide }));
    return;
  }
  if (cur) {
    const bar = el('div', { class: 'epg-bar-fill' });
    bar.style.width = Math.round(progressOf(cur, now) * 100) + '%';
    box.appendChild(el('div', { class: 'epg-now' }, [
      el('div', { class: 'epg-row' }, [
        el('span', { class: 'epg-label', text: t('epg.now') }),
        el('span', { class: 'epg-time', text: fmtClock(cur.start) + '–' + fmtClock(cur.stop) }),
      ]),
      el('div', { class: 'epg-title', text: cur.title }),
      el('div', { class: 'epg-bar' }, [bar]),
    ]));
  }
  if (next) {
    box.appendChild(el('div', { class: 'epg-next' }, [
      el('span', { class: 'epg-label', text: t('epg.next') }),
      el('span', { class: 'epg-time', text: fmtClock(next.start) }),
      el('span', { class: 'epg-title', text: next.title }),
    ]));
  }
}

/** Grade do dia do canal (modo Guia): horário + título, o atual destacado. */
export function renderSchedule(box: HTMLElement, list: Programme[], now = Date.now()): void {
  clear(box);
  if (!list.length) {
    box.appendChild(el('div', { class: 'epg-none', text: t('epg.none') }));
    return;
  }
  for (const p of list) {
    const on = p.start <= now && p.stop > now;
    box.appendChild(el('div', { class: on ? 'epg-item on' : 'epg-item' }, [
      el('span', { class: 'epg-time', text: fmtClock(p.start) }),
      el('span', { class: 'epg-title', text: p.title }),
    ]));
  }
}
