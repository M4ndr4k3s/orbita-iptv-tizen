// Gravações e downloads desta sessão: progresso e opção de parar.

import { el, clear } from '../utils/dom';
import type { Screen } from '../app/screen';
import { focus } from '../navigation/focus';
import { choose } from '../components/dialog';
import { toast } from '../components/toast';
import { icon } from '../components/icons';
import { recorder, type Job } from '../services/recorder';
import { t, type I18nKey } from '../services/i18n';

const mb = (n: number) => (n / 1048576).toFixed(n >= 104857600 ? 0 : 1) + ' MB';

function minutes(ms: number): string {
  const m = Math.floor(ms / 60000);
  return m + ' min';
}

export class RecordingsScreen implements Screen {
  readonly root: HTMLElement;
  private rows: HTMLElement;
  private unsub: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.rows = el('div', { class: 'set-rows', attrs: { 'data-focus-group': '' } });
    this.root = el('div', { class: 'screen settings recordings' }, [
      el('div', { class: 'screen-head' }, [el('div', {}, [el('h1', { class: 'screen-title', text: t('rec.title') }), el('p', { class: 'screen-sub', text: t('rec.subtitle') })])]),
      this.rows,
      el('p', { class: 'screen-sub rec-note', text: t('rec.note') }),
    ]);
  }

  mount(): void {
    this.unsub = recorder.onChange(() => this.render());
    // gravação ao vivo não tem total: o tempo corre mesmo sem evento novo
    this.timer = setInterval(() => this.render(), 5000);
    this.render();
  }

  unmount(): void {
    if (this.unsub) this.unsub();
    if (this.timer) clearInterval(this.timer);
  }

  private render(): void {
    const cur = focus.current;
    const focusedId = cur && this.rows.contains(cur) ? cur.getAttribute('data-id') : null;
    clear(this.rows);
    const jobs = recorder.list();
    if (!jobs.length) {
      this.rows.appendChild(el('p', { class: 'screen-sub', text: t('rec.empty') }));
      return;
    }
    let toFocus: HTMLElement | null = null;
    for (const j of jobs) {
      const row = el('div', { class: 'set-row rec-row', attrs: { 'data-focusable': '', 'data-id': String(j.id), role: 'button' } }, [
        icon(j.kind === 'record' ? 'record' : 'download', 'icon rec-ic' + (j.state === 'running' && j.kind === 'record' ? ' live' : '')),
        el('div', { class: 'rec-txt' }, [el('div', { class: 'set-label', text: j.fileName }), el('div', { class: 'set-value rec-dir', text: j.dir })]),
        el('span', { class: 'set-value', text: this.detail(j) }),
      ]);
      row.addEventListener('click', () => void this.ask(j));
      if (String(j.id) === focusedId || !toFocus) toFocus = row;
      this.rows.appendChild(row);
    }
    if (toFocus && (!cur || !document.body.contains(cur) || focusedId || !this.root.contains(cur))) focus.focus(toFocus);
  }

  private detail(j: Job): string {
    const st = t(('rec.st.' + j.state) as I18nKey);
    if (j.kind === 'download' && j.total > 0 && (j.state === 'running' || j.state === 'paused')) return st + ' · ' + Math.floor((j.received / j.total) * 100) + '% de ' + mb(j.total);
    const time = j.kind === 'record' && j.state === 'running' ? ' · ' + minutes(Date.now() - j.startedAt) : '';
    return st + ' · ' + mb(j.received) + time + (j.error ? ' · ' + j.error : '');
  }

  /** OK num item: ações conforme o estado (download pausa/continua; gravação só para). */
  private async ask(j: Job): Promise<void> {
    type A = 'pause' | 'resume' | 'stop' | 'no';
    const opts: Array<{ id: A; label: string; primary?: boolean; danger?: boolean }> = [];
    if (j.kind === 'download') {
      if (j.state === 'running') opts.push({ id: 'pause', label: t('rec.pause'), primary: true });
      if (j.state === 'paused' || j.state === 'failed') opts.push({ id: 'resume', label: t('rec.resume'), primary: true });
      if (j.state === 'running' || j.state === 'paused' || j.state === 'failed') opts.push({ id: 'stop', label: t('rec.cancel'), danger: true });
    } else if (j.state === 'running') opts.push({ id: 'stop', label: t('rec.stop'), danger: true });
    if (!opts.length) return;
    opts.push({ id: 'no', label: t('rec.close') });
    const r = await choose<A>(j.fileName, j.kind === 'download' && opts.some((o) => o.id === 'stop') ? t('rec.cancelNote') : null, opts, true);
    if (r === 'pause') recorder.pause(j.id);
    else if (r === 'resume' && !recorder.resume(j.id)) toast(t('rec.err.resume'), 'error');
    else if (r === 'stop') recorder.stop(j.id);
  }
}
