// Gerenciamento das fontes cadastradas.

import { el, clear } from '../utils/dom';
import type { Screen } from '../app/screen';
import type { AppContext } from '../app/context';
import { button } from '../components/button';
import { icon } from '../components/icons';
import { choose, alertBox } from '../components/dialog';
import { withBusy } from '../components/busy';
import { toast } from '../components/toast';
import { focus } from '../navigation/focus';
import { describeSource, type Source } from '../playlist/source';
import { checkSource } from '../services/sourceCheck';
import { checkMessage } from '../services/messages';
import { SourceEditScreen } from './sourceEdit';
import { t } from '../services/i18n';
import { importLine } from '../services/format';
import { importWithProgress } from './importFlow';

export class ListsScreen implements Screen {
  readonly root: HTMLElement;
  private grid: HTMLElement;
  private unsubscribe: (() => void) | null = null;

  constructor(private ctx: AppContext) {
    this.grid = el('div', { class: 'src-grid', attrs: { 'data-focus-group': '' } });
    this.root = el('div', { class: 'screen lists' }, [
      el('div', { class: 'screen-head' }, [
        el('div', {}, [el('h1', { class: 'screen-title', text: t('lists.title') }), el('p', { class: 'screen-sub', text: t('lists.subtitle') })]),
        button(t('lists.add'), { icon: 'plus', variant: 'primary', autofocus: true, onClick: () => ctx.push(new SourceEditScreen(ctx)) }),
      ]),
      this.grid,
    ]);
  }

  mount(): void {
    this.unsubscribe = this.ctx.sources.onChange(() => this.render());
    this.render();
  }

  unmount(): void {
    if (this.unsubscribe) this.unsubscribe();
  }

  private render(): void {
    // preserva o foco no mesmo card após re-render
    const cur = focus.current;
    const focusedId = cur && this.grid.contains(cur) ? cur.getAttribute('data-id') : null;
    clear(this.grid);
    const list = this.ctx.sources.list();
    if (!list.length) {
      this.grid.appendChild(el('p', { class: 'empty-text', text: t('lists.empty') }));
      return;
    }
    const activeId = this.ctx.sources.active() ? this.ctx.sources.active()!.id : null;
    let toFocus: HTMLElement | null = null;
    for (const s of list) {
      const card = this.card(s, s.id === activeId);
      if (s.id === focusedId) toFocus = card;
      this.grid.appendChild(card);
    }
    if (toFocus) focus.focus(toFocus);
    else if (cur && !document.body.contains(cur)) focus.focus(focus.firstIn(this.root));
  }

  private card(s: Source, active: boolean): HTMLElement {
    const status = s.lastStatus === 'ok' ? 'ok' : s.lastStatus === 'error' ? 'error' : 'none';
    const card = el('div', { class: 'src-card' + (active ? ' active' : ''), attrs: { 'data-focusable': '', 'data-id': s.id } }, [
      el('div', { class: 'src-top' }, [
        icon(s.kind === 'm3u' ? 'lists' : 'live', 'icon src-icon'),
        el('span', { class: 'badge', text: s.kind === 'm3u' ? 'M3U' : 'Xtream' }),
        active ? el('span', { class: 'badge badge-active', text: t('lists.active') }) : null,
      ]),
      el('div', { class: 'src-name', text: s.name }),
      el('div', { class: 'src-desc', text: describeSource(s) }),
      el('div', { class: 'src-stats', text: importLine(s) }),
      el('div', { class: 'src-status st-' + status, text: t(('lists.status.' + status) as 'lists.status.ok') }),
    ]);
    card.addEventListener('click', () => this.actions(s.id));
    return card;
  }

  private async actions(id: string): Promise<void> {
    const s = this.ctx.sources.get(id);
    if (!s) return;
    const isActive = this.ctx.sources.active() === s;
    type A = 'use' | 'refresh' | 'test' | 'edit' | 'remove' | 'cancel';
    const acts: Array<{ id: A; label: string; primary?: boolean; danger?: boolean }> = [];
    if (!isActive) acts.push({ id: 'use', label: t('lists.action.use'), primary: true });
    acts.push({ id: 'refresh', label: t('lists.action.refresh'), primary: isActive });
    acts.push({ id: 'test', label: t('lists.action.test') });
    acts.push({ id: 'edit', label: t('lists.action.edit') });
    acts.push({ id: 'remove', label: t('lists.action.remove'), danger: true });
    acts.push({ id: 'cancel', label: t('lists.action.cancel') });
    const a = await choose(s.name, describeSource(s), acts, true);

    if (a === 'use') {
      this.ctx.sources.setActive(s.id);
      toast(t('lists.activated', { name: s.name }));
      if (!s.import) await importWithProgress(this.ctx.imports, s);
    } else if (a === 'refresh') {
      await importWithProgress(this.ctx.imports, s);
    } else if (a === 'edit') {
      this.ctx.push(new SourceEditScreen(this.ctx, s));
    } else if (a === 'test') {
      const r = await withBusy(t('check.running'), (signal) => checkSource(s, signal));
      if (!r || (!r.ok && r.error === 'aborted')) return;
      await this.ctx.sources.setStatus(s.id, r.ok, r.ok ? undefined : r.error);
      await alertBox(r.ok ? t('check.ok.title') : t('check.fail.title'), checkMessage(r), t('common.ok'));
    } else if (a === 'remove') {
      const ok = await choose(t('lists.remove.title', { name: s.name }), t('lists.remove.body'), [
        { id: 'cancel', label: t('common.cancel'), primary: true },
        { id: 'remove', label: t('lists.action.remove'), danger: true },
      ]);
      if (ok === 'remove') {
        this.ctx.imports.cancel(s.id);
        await this.ctx.sources.remove(s.id);
        // apaga os canais da lista removida
        await this.ctx.imports.cleanup().catch(() => undefined);
        toast(t('lists.removed'));
      }
    }
  }
}
