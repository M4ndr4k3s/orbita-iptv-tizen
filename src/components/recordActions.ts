// Ações de gravação/download usadas pelos players, com os avisos na tela.

import { toast } from './toast';
import { recorder, type Job, type JobKind } from '../services/recorder';
import { t, type I18nKey } from '../services/i18n';

/** Começa a gravar/baixar; avisa o motivo se não der. */
export async function startJob(kind: JobKind, key: string, title: string, url: string | null): Promise<Job | null> {
  if (!url) {
    toast(t('rec.err.unsupported'), 'error');
    return null;
  }
  const r = await recorder.start(kind, key, title, url);
  if (!r.ok) {
    toast(t(('rec.err.' + r.error) as I18nKey), 'error');
    return null;
  }
  toast(t(kind === 'record' ? 'rec.started' : 'rec.downloadStarted', { name: r.job.fileName }));
  return r.job;
}

let watching = false;

/** Avisa quando um download termina, uma gravação é salva ou algo falha (uma vez por app). */
export function watchRecorder(): void {
  if (watching) return;
  watching = true;
  const seen = new Map<number, string>();
  recorder.onChange(() => {
    for (const j of recorder.list()) {
      if (seen.get(j.id) === j.state) continue;
      const before = seen.get(j.id);
      seen.set(j.id, j.state);
      if (!before || j.state === 'running') continue;
      if (j.state === 'done') toast(t('rec.done', { name: j.fileName }));
      else if (j.state === 'failed') toast(t('rec.failed', { name: j.fileName }), 'error');
      else if (j.state === 'stopped' && j.kind === 'record') toast(t('rec.stopped', { name: j.fileName }));
    }
  });
}
