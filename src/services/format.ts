// Formatação de números, tempos e estatísticas para a interface.

import { t } from './i18n';
import type { ImportStats } from '../playlist/model';
import type { Source } from '../playlist/source';

export function fmtInt(n: number): string {
  // separador de milhar fixo (toLocaleString varia entre firmwares)
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function fmtAgo(ts: number, now = Date.now()): string {
  const min = Math.floor((now - ts) / 60000);
  if (min < 1) return t('time.justNow');
  if (min < 60) return t('time.minutes', { n: min });
  const h = Math.floor(min / 60);
  if (h < 48) return t('time.hours', { n: h });
  return t('time.days', { n: Math.floor(h / 24) });
}

export function statsSummary(s: ImportStats): string {
  return t('stats.summary', { live: fmtInt(s.live), movies: fmtInt(s.movies), series: fmtInt(s.series), groups: fmtInt(s.groups) });
}

/** Linha de estado da importação de uma fonte. */
export function importLine(s: Source): string {
  if (!s.import) return s.importError ? t('stats.failed') : t('stats.never');
  const base = statsSummary(s.import) + ' · ' + t('stats.updated', { when: fmtAgo(s.import.importedAt) });
  return s.importError ? base + ' · ' + t('stats.failed') : base;
}
