// Fonte de conteúdo cadastrada pelo usuário: lista M3U por URL ou conta Xtream Codes.

import { normalizeHttpUrl, cleanText, cleanCredential, LIMITS, type ValidationError } from '../utils/validate';
import type { ImportStats } from './model';
import type { EpgStats } from '../epg/model';

export type SourceKind = 'm3u' | 'xtream';

export interface Source {
  id: string;
  kind: SourceKind;
  name: string;
  /** m3u: URL da lista */
  url?: string;
  /** xtream: servidor sem barra final, usuário e senha */
  server?: string;
  username?: string;
  password?: string;
  /** XMLTV opcional (marco 7) */
  epgUrl?: string;
  /** horas entre atualizações automáticas; 0 = desligado */
  refreshHours: number;
  createdAt: number;
  updatedAt: number;
  lastCheckAt?: number;
  lastStatus?: 'ok' | 'error';
  lastError?: string;
  /** última importação concluída (aponta para a geração de canais em uso) */
  import?: ImportStats;
  /** código do erro da última tentativa de importação, se falhou */
  importError?: string;
  /** último guia (EPG) importado */
  epg?: EpgStats;
  /** código do erro da última tentativa de baixar o guia */
  epgError?: string;
  /** quando o guia foi tentado pela última vez (evita repetir falhas a cada 30 min) */
  epgTriedAt?: number;
}

/** Dados vindos do formulário, ainda não validados. */
export interface SourceInput {
  kind: SourceKind;
  name: string;
  url: string;
  server: string;
  username: string;
  password: string;
  epgUrl: string;
  refreshHours: number;
}

export type SourceField = 'name' | 'url' | 'server' | 'username' | 'password' | 'epgUrl' | 'refreshHours';
export type FieldErrors = Partial<Record<SourceField, ValidationError>>;

export const REFRESH_OPTIONS = [0, 6, 12, 24, 48];

export type ValidSource = Omit<Source, 'id' | 'createdAt' | 'updatedAt'>;

/** Valida o formulário. Retorna os campos limpos ou os erros por campo. */
export function validateSource(input: SourceInput): { ok: true; value: ValidSource } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const name = cleanText(input.name, LIMITS.name);
  if (!name.ok) errors.name = name.error;
  if (REFRESH_OPTIONS.indexOf(input.refreshHours) < 0) errors.refreshHours = 'invalidChars';

  let epgUrl: string | undefined;
  if (input.epgUrl.trim()) {
    const e = normalizeHttpUrl(input.epgUrl);
    if (e.ok) epgUrl = e.value;
    else errors.epgUrl = e.error;
  }

  const base = { kind: input.kind, name: name.ok ? name.value : '', epgUrl, refreshHours: input.refreshHours };

  if (input.kind === 'm3u') {
    const url = normalizeHttpUrl(input.url);
    if (!url.ok) errors.url = url.error;
    if (Object.keys(errors).length || !url.ok) return { ok: false, errors };
    return { ok: true, value: { ...base, url: url.value } };
  }

  const server = normalizeHttpUrl(input.server, { stripTrailingSlash: true });
  const username = cleanCredential(input.username.trim());
  const password = cleanCredential(input.password);
  if (!server.ok) errors.server = server.error;
  if (!username.ok) errors.username = username.error;
  if (!password.ok) errors.password = password.error;
  if (Object.keys(errors).length || !server.ok || !username.ok || !password.ok) return { ok: false, errors };
  return { ok: true, value: { ...base, server: server.value, username: username.value, password: password.value } };
}

/** Chave para detectar a mesma lista cadastrada duas vezes. */
export function sourceKey(s: Pick<Source, 'kind' | 'url' | 'server' | 'username'>): string {
  return s.kind === 'm3u'
    ? 'm3u|' + (s.url || '').toLowerCase()
    : 'xt|' + (s.server || '').toLowerCase() + '|' + (s.username || '');
}

/** Texto curto para exibir a origem sem revelar a senha. */
export function describeSource(s: Source): string {
  if (s.kind === 'm3u') {
    try {
      return new URL(s.url || '').host;
    } catch {
      return '';
    }
  }
  try {
    return (s.username || '') + ' @ ' + new URL(s.server || '').host;
  } catch {
    return s.username || '';
  }
}

export function emptyInput(kind: SourceKind = 'm3u'): SourceInput {
  return { kind, name: '', url: '', server: '', username: '', password: '', epgUrl: '', refreshHours: 24 };
}

export function inputFromSource(s: Source): SourceInput {
  return {
    kind: s.kind,
    name: s.name,
    url: s.url || '',
    server: s.server || '',
    username: s.username || '',
    password: s.password || '',
    epgUrl: s.epgUrl || '',
    refreshHours: s.refreshHours,
  };
}

/**
 * URL do guia: a informada pelo usuário; senão a do Xtream (xmltv.php); senão a
 * indicada no cabeçalho da lista M3U. A do Xtream leva a senha: nunca logar.
 */
export function epgUrlFor(s: Source): string | null {
  if (s.epgUrl) return s.epgUrl;
  if (s.kind === 'xtream' && s.server && s.username && s.password) {
    return s.server + '/xmltv.php?username=' + encodeURIComponent(s.username) + '&password=' + encodeURIComponent(s.password);
  }
  return (s.import && s.import.tvgUrl) || null;
}
