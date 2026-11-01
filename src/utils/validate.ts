// Validação e normalização de entradas do usuário (URLs, nomes, credenciais).
// Puro, sem DOM: testado no Node.

export const LIMITS = {
  url: 2048,
  name: 60,
  credential: 128,
};

// caracteres de controle (inclui \n, \t, DEL) nunca são aceitos
const CONTROL = /[\u0000-\u001f\u007f]/;

export type Result<T> = { ok: true; value: T } | { ok: false; error: ValidationError };

export type ValidationError =
  | 'required'
  | 'tooLong'
  | 'invalidChars'
  | 'invalidUrl'
  | 'unsupportedScheme';

/**
 * Normaliza uma URL http/https: aceita sem esquema (assume http://), remove
 * espaços nas pontas. Rejeita outros esquemas (file:, javascript:, data:...).
 */
export function normalizeHttpUrl(input: string, opts: { stripTrailingSlash?: boolean } = {}): Result<string> {
  let s = (input || '').trim();
  if (!s) return { ok: false, error: 'required' };
  if (s.length > LIMITS.url) return { ok: false, error: 'tooLong' };
  if (CONTROL.test(s) || /\s/.test(s)) return { ok: false, error: 'invalidChars' };
  // "host:porta" não é esquema; só "algo://" ou esquemas sem barras conhecidos
  if (/^(javascript|data|file|vbscript|blob|about|mailto):/i.test(s)) return { ok: false, error: 'unsupportedScheme' };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'http://' + s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: 'invalidUrl' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'unsupportedScheme' };
  if (!u.hostname) return { ok: false, error: 'invalidUrl' };
  let out = u.toString();
  if (opts.stripTrailingSlash) out = out.replace(/\/+$/, '');
  return { ok: true, value: out };
}

/** Texto curto de uso geral (nome da lista etc.). */
export function cleanText(input: string, max: number, required = true): Result<string> {
  const s = (input || '').trim();
  if (!s) return required ? { ok: false, error: 'required' } : { ok: true, value: '' };
  if (s.length > max) return { ok: false, error: 'tooLong' };
  if (CONTROL.test(s)) return { ok: false, error: 'invalidChars' };
  return { ok: true, value: s };
}

/** Usuário/senha Xtream: sem espaços nas pontas removidos (senha pode ter espaço interno). */
export function cleanCredential(input: string): Result<string> {
  const s = input || '';
  if (!s) return { ok: false, error: 'required' };
  if (s.length > LIMITS.credential) return { ok: false, error: 'tooLong' };
  if (CONTROL.test(s)) return { ok: false, error: 'invalidChars' };
  return { ok: true, value: s };
}
