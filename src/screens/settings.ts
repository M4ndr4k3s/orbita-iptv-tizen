// Configurações: idioma, TV ao vivo, controle parental e backup.

import { el, clear } from '../utils/dom';
import type { Screen } from '../app/screen';
import type { AppContext } from '../app/context';
import { focus } from '../navigation/focus';
import { choose, alertBox } from '../components/dialog';
import { withBusy } from '../components/busy';
import { toast } from '../components/toast';
import { requirePin, definePin } from '../components/pinDialog';
import { settings, applyTheme, THEMES, type Settings } from '../storage/settings';
import { parental } from '../services/parental';
import { buildBackup, parseBackup, writeBackup, findBackup } from '../services/backup';
import { t, LANGUAGES, type I18nKey } from '../services/i18n';
import { ParentalCategoriesScreen } from './parentalCategories';
import { confirmClearHistory } from '../components/dialog';
import { RecordingsScreen } from './recordings';

interface Row {
  id: string;
  label: string;
  value: string;
  run: () => Promise<void>;
}

export class SettingsScreen implements Screen {
  readonly root: HTMLElement;
  private rowsBox: HTMLElement;
  private unsub: (() => void) | null = null;

  constructor(private ctx: AppContext) {
    this.rowsBox = el('div', { class: 'set-rows', attrs: { 'data-focus-group': '' } });
    this.root = el('div', { class: 'screen settings' }, [
      el('div', { class: 'screen-head' }, [el('div', {}, [el('h1', { class: 'screen-title', text: t('set.title') }), el('p', { class: 'screen-sub', text: t('set.subtitle') })])]),
      this.rowsBox,
    ]);
  }

  mount(): void {
    this.unsub = parental.onChange(() => this.render());
    this.render();
  }

  unmount(): void {
    if (this.unsub) this.unsub();
  }

  show(): void {
    this.render();
  }

  private rows(): Row[] {
    const s = settings.get();
    const onOff = (v: boolean) => t(v ? 'set.on' : 'set.off');
    const lang = LANGUAGES.find((l) => l.id === s.language) || LANGUAGES[0];
    return [
      { id: 'lang', label: t('set.language'), value: lang.label, run: () => this.language() },
      { id: 'theme', label: t('set.theme'), value: t(('theme.' + (THEMES.indexOf(s.theme as never) >= 0 ? s.theme : 'black')) as I18nKey), run: () => this.theme() },
      { id: 'preview', label: t('set.preview'), value: onOff(s.livePreview), run: () => this.toggle('livePreview') },
      { id: 'ask', label: t('set.askSource'), value: onOff(s.askSourceOnStart), run: () => this.toggle('askSourceOnStart') },
      {
        id: 'parental',
        label: t('set.parental'),
        value: !parental.hasPin() ? t('set.parental.off') : t('set.parental.on', { n: parental.lockedCount() }),
        run: () => this.parentalMenu(),
      },
      { id: 'recordings', label: t('set.recordings'), value: t('set.recordings.hint'), run: async () => this.ctx.push(new RecordingsScreen()) },
      { id: 'history', label: t('set.history'), value: t('set.history.hint'), run: () => this.clearHistory() },
      { id: 'export', label: t('set.export'), value: t('set.export.hint'), run: () => this.exportBackup() },
      { id: 'import', label: t('set.import'), value: t('set.import.hint'), run: () => this.importBackup() },
    ];
  }

  private render(): void {
    const cur = focus.current;
    const focusedId = cur && this.rowsBox.contains(cur) ? cur.getAttribute('data-id') : null;
    clear(this.rowsBox);
    let toFocus: HTMLElement | null = null;
    for (const r of this.rows()) {
      const row = el('div', { class: 'set-row', attrs: { 'data-focusable': '', 'data-id': r.id, role: 'button' } }, [
        el('span', { class: 'set-label', text: r.label }),
        el('span', { class: 'set-value', text: r.value }),
      ]);
      row.addEventListener('click', () => void r.run().then(() => this.render()));
      if (r.id === focusedId || (!focusedId && !toFocus)) toFocus = row;
      this.rowsBox.appendChild(row);
    }
    if (toFocus && (focusedId || !cur || !document.body.contains(cur) || !this.root.contains(cur))) focus.focus(toFocus);
  }

  private async language(): Promise<void> {
    const cur = settings.get().language;
    const r = await choose(
      t('set.language'),
      null,
      LANGUAGES.map((l) => ({ id: l.id, label: l.label, primary: l.id === cur })),
      true,
    );
    if (!r || r === cur) return;
    settings.set({ language: r });
    // todos os textos são montados na abertura das telas: recarregar é o jeito simples
    window.location.reload();
  }

  private async theme(): Promise<void> {
    const cur = settings.get().theme;
    const r = await choose(
      t('set.theme'),
      null,
      THEMES.map((id) => ({ id, label: t(('theme.' + id) as I18nKey), primary: id === cur })),
      true,
    );
    if (!r) return;
    settings.set({ theme: r });
    applyTheme(r);
  }

  private async toggle(k: 'livePreview' | 'askSourceOnStart'): Promise<void> {
    const patch: Partial<Settings> = {};
    patch[k] = !settings.get()[k];
    settings.set(patch);
  }

  private async parentalMenu(): Promise<void> {
    if (!parental.hasPin()) {
      if (await definePin()) toast(t('parental.pinSet'));
      return;
    }
    if (!(await requirePin())) return;
    type A = 'cats' | 'change' | 'lock' | 'remove';
    const r = await choose<A>(
      t('set.parental'),
      t('parental.menuBody', { n: parental.lockedCount() }),
      [
        { id: 'cats', label: t('parental.cats'), primary: true },
        { id: 'change', label: t('parental.change') },
        { id: 'lock', label: t('parental.lockNow') },
        { id: 'remove', label: t('parental.remove'), danger: true },
      ],
      true,
    );
    if (r === 'cats') this.ctx.push(new ParentalCategoriesScreen(this.ctx));
    else if (r === 'change') {
      if (await definePin()) toast(t('parental.pinSet'));
    } else if (r === 'lock') {
      parental.lockSession();
      toast(t('parental.locked'));
    } else if (r === 'remove') {
      const ok = await choose(t('parental.remove'), t('parental.removeBody'), [
        { id: 'yes', label: t('parental.remove'), danger: true },
        { id: 'no', label: t('common.cancel'), primary: true },
      ]);
      if (ok === 'yes') {
        parental.clear();
        toast(t('parental.removed'));
      }
    }
  }

  private async clearHistory(): Promise<void> {
    if (await confirmClearHistory()) {
      await this.ctx.library.clearHistory();
      toast(t('history.cleared'));
    }
  }

  private async exportBackup(): Promise<void> {
    const n = this.ctx.sources.list().length;
    const ok = await choose(t('set.export'), t('backup.exportBody', { n }), [
      { id: 'yes', label: t('backup.exportGo'), primary: true },
      { id: 'no', label: t('common.cancel') },
    ]);
    if (ok !== 'yes') return;
    try {
      const path = await writeBackup(buildBackup(this.ctx.sources.list(), settings.get()));
      await alertBox(t('backup.done'), t('backup.savedAt', { path }), t('common.ok'));
    } catch {
      await alertBox(t('backup.failTitle'), t('backup.writeFail'), t('common.ok'));
    }
  }

  private async importBackup(): Promise<void> {
    let found: { path: string; text: string } | null;
    try {
      found = await findBackup();
    } catch {
      await alertBox(t('backup.failTitle'), t('backup.readFail'), t('common.ok'));
      return;
    }
    if (!found) {
      await alertBox(t('backup.failTitle'), t('backup.notFound'), t('common.ok'));
      return;
    }
    const parsed = parseBackup(found.text);
    if (!parsed.ok) {
      await alertBox(t('backup.failTitle'), t(('backup.err.' + parsed.error) as I18nKey), t('common.ok'));
      return;
    }
    const { sources, settings: patch } = parsed.value;
    const dupes = sources.filter((v) => this.ctx.sources.findDuplicate(v)).length;
    const go = await choose(t('set.import'), t('backup.importBody', { path: found.path, n: sources.length - dupes, d: dupes }), [
      { id: 'yes', label: t('backup.importGo'), primary: true },
      { id: 'no', label: t('common.cancel') },
    ]);
    if (go !== 'yes') return;
    const added = await withBusy(t('backup.importing'), async () => {
      let n = 0;
      for (const v of sources) {
        if (this.ctx.sources.findDuplicate(v)) continue;
        await this.ctx.sources.add(v);
        n++;
      }
      return n;
    });
    if (added == null) return;
    const langChanged = patch.language && patch.language !== settings.get().language;
    settings.set(patch);
    toast(t('backup.imported', { n: added }));
    if (langChanged) window.location.reload();
  }
}
