// Fluxos de importação na interface: modal com progresso (ação do usuário) ou
// em segundo plano com aviso (atualização automática).

import { el } from '../utils/dom';
import { button } from '../components/button';
import { openOverlay } from '../components/overlay';
import { alertBox } from '../components/dialog';
import { toast } from '../components/toast';
import type { ImportService, ImportOutcome } from '../services/importService';
import type { Source } from '../playlist/source';
import { DEFAULT_MAX_ITEMS } from '../playlist/importer';
import { fmtInt } from '../services/format';
import { t, type I18nKey } from '../services/i18n';

export function importErrorMessage(o: Extract<ImportOutcome, { ok: false }>): string {
  return t(('import.err.' + o.code) as I18nKey, { s: o.status });
}

/** Importa mostrando progresso; Back/Cancelar interrompe (os canais anteriores são mantidos). */
export async function importWithProgress(imports: ImportService, source: Source): Promise<ImportOutcome> {
  const status = el('p', { class: 'busy-text', text: t('import.connecting') });
  const box = el('div', { class: 'dlg-box busy-box import-box', attrs: { role: 'alertdialog', 'aria-busy': 'true' } }, [
    el('h2', { class: 'dlg-title', text: t('import.title', { name: source.name }) }),
    el('div', { class: 'spinner' }),
    status,
    el('p', { class: 'import-hint', text: t('import.hint') }),
    el('div', { class: 'dlg-actions' }, [button(t('common.cancel'), { autofocus: true, onClick: () => cancel() })]),
  ]);
  const job = imports.run(source, (p) => {
    status.textContent = p.phase === 'categories' ? t('import.categories') : t('import.progress', { items: fmtInt(p.items), mb: (p.bytes / 1048576).toFixed(1) });
  });
  // cancelar fecha na hora; o worker termina de parar em segundo plano
  let onCancel: (o: ImportOutcome) => void = () => undefined;
  const cancelled = new Promise<ImportOutcome>((resolve) => {
    onCancel = resolve;
  });
  const cancel = () => {
    job.cancel();
    onCancel({ ok: false, code: 'aborted', status: 0 });
  };
  const close = openOverlay(box, { onBack: cancel });
  let outcome: ImportOutcome;
  try {
    outcome = await Promise.race([job.promise, cancelled]);
  } finally {
    close();
  }
  if (outcome.ok) {
    const s = outcome.stats;
    let body = t('import.done.body', {
      live: fmtInt(s.live), movies: fmtInt(s.movies), series: fmtInt(s.series), groups: fmtInt(s.groups), secs: (s.durationMs / 1000).toFixed(1),
    });
    if (s.duplicates) body += ' ' + t('import.done.dups', { n: fmtInt(s.duplicates) });
    if (s.skipped) body += ' ' + t('import.done.skipped', { n: fmtInt(s.skipped) });
    if (s.truncated) body += ' ' + t('import.done.truncated', { max: fmtInt(DEFAULT_MAX_ITEMS) });
    await alertBox(t('import.done.title'), body, t('common.ok'));
  } else if (outcome.code === 'aborted') {
    toast(t('import.err.aborted'));
  } else {
    await alertBox(t('import.fail.title'), importErrorMessage(outcome), t('common.ok'));
  }
  return outcome;
}

/** Atualização automática: não bloqueia a tela; avisa no fim. */
export function importInBackground(imports: ImportService, source: Source): void {
  if (imports.isRunning(source.id)) return;
  toast(t('import.background', { name: source.name }));
  void imports.run(source).promise.then((o) => {
    if (o.ok) toast(t('import.backgroundDone', { name: source.name, n: fmtInt(o.stats.live + o.stats.movies + o.stats.series) }));
    else if (o.code !== 'aborted') toast(t('import.backgroundFail', { name: source.name }), 'error', 6000);
  });
}
