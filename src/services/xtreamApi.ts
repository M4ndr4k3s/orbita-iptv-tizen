// Cliente da API Xtream Codes (player_api.php). Neste marco só a autenticação;
// catálogo ao vivo/VOD entra nos marcos 4 e 8.

import { fetchJson } from '../utils/net';

export interface XtreamCreds {
  server: string;
  username: string;
  password: string;
}

export interface XtreamAccount {
  status: string;
  /** epoch em ms, ou null se não expira */
  expiresAt: number | null;
  maxConnections: number | null;
  activeConnections: number | null;
  isTrial: boolean;
}

export type XtreamAuthResult =
  | { ok: true; account: XtreamAccount }
  | { ok: false; reason: 'denied' | 'inactive' | 'badResponse'; status?: string };

/** Monta a URL da API com parâmetros codificados (usuário/senha podem ter qualquer caractere). */
export function apiUrl(c: XtreamCreds, params: Record<string, string> = {}): string {
  const q = ['username=' + encodeURIComponent(c.username), 'password=' + encodeURIComponent(c.password)];
  for (const k of Object.keys(params)) q.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
  return c.server + '/player_api.php?' + q.join('&');
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return isFinite(n) ? n : null;
};

/** Interpreta a resposta de autenticação. Servidores variam: números como string, campos ausentes. */
export function parseAuth(json: unknown): XtreamAuthResult {
  if (!json || typeof json !== 'object') return { ok: false, reason: 'badResponse' };
  const ui = (json as { user_info?: Record<string, unknown> }).user_info;
  if (!ui || typeof ui !== 'object') return { ok: false, reason: 'badResponse' };
  if (num(ui.auth) !== 1) return { ok: false, reason: 'denied' };
  const status = typeof ui.status === 'string' ? ui.status : '';
  if (status && status.toLowerCase() !== 'active') return { ok: false, reason: 'inactive', status };
  const exp = num(ui.exp_date);
  return {
    ok: true,
    account: {
      status: status || 'Active',
      expiresAt: exp && exp > 0 ? exp * 1000 : null,
      maxConnections: num(ui.max_connections),
      activeConnections: num(ui.active_cons),
      isTrial: num(ui.is_trial) === 1,
    },
  };
}

// a resposta de login é pequena; 1 MB já é muito
const AUTH_MAX_BYTES = 1024 * 1024;

export async function authenticate(c: XtreamCreds, signal?: AbortSignal): Promise<XtreamAuthResult> {
  const json = await fetchJson<unknown>(apiUrl(c), AUTH_MAX_BYTES, { timeoutMs: 15000, signal });
  return parseAuth(json);
}
