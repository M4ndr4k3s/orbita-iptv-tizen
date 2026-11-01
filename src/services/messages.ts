// Converte erros técnicos em mensagens para o usuário (sem detalhes internos).

import { t, type I18nKey } from './i18n';
import type { ValidationError } from '../utils/validate';
import type { CheckResult } from './sourceCheck';

export function validationMessage(e: ValidationError): string {
  return t(('err.' + e) as I18nKey);
}

export function checkMessage(r: CheckResult): string {
  if (r.ok) {
    if (r.kind === 'm3u') return t('check.ok.m3u', { n: r.sample });
    const a = r.account;
    const exp = a.expiresAt ? t('check.exp.date', { d: new Date(a.expiresAt).toLocaleDateString() }) : t('check.exp.never');
    const cons = (a.activeConnections != null ? a.activeConnections : '?') + '/' + (a.maxConnections != null ? a.maxConnections : '?');
    return t('check.ok.xtream', { exp, cons });
  }
  return t(('check.err.' + r.error) as I18nKey, { s: r.httpStatus || r.detail || '' });
}
