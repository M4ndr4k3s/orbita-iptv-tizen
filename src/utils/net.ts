// Rede com timeout e limite de tamanho. Servidores IPTV são lentos e às vezes
// respondem com páginas enormes ou nunca terminam: nada aqui espera para sempre.

export type NetErrorCode = 'timeout' | 'network' | 'http' | 'tooLarge' | 'badJson' | 'aborted';

export class NetError extends Error {
  constructor(readonly code: NetErrorCode, readonly status = 0) {
    super(code + (status ? ' ' + status : ''));
    this.name = 'NetError';
  }
}

export interface FetchOpts {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function fetchWithTimeout(url: string, opts: FetchOpts = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timeoutMs = opts.timeoutMs || 15000;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const outer = opts.signal;
  const onOuterAbort = () => ctrl.abort();
  if (outer) {
    if (outer.aborted) ctrl.abort();
    else outer.addEventListener('abort', onOuterAbort);
  }
  try {
    // sem credenciais/cookies: listas de terceiros não devem receber nada além da URL
    const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit', cache: 'no-store', redirect: 'follow' });
    if (!res.ok) throw new NetError('http', res.status);
    return res;
  } catch (e) {
    if (e instanceof NetError) throw e;
    if (timedOut) throw new NetError('timeout');
    if (outer && outer.aborted) throw new NetError('aborted');
    throw new NetError('network');
  } finally {
    clearTimeout(timer);
    if (outer) outer.removeEventListener('abort', onOuterAbort);
  }
}

/** Lê o corpo como texto até maxBytes; acima disso aborta com tooLarge. */
export async function readTextLimited(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) {
    const t = await res.text();
    if (t.length > maxBytes) throw new NetError('tooLarge');
    return t;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let total = 0;
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      reader.cancel().catch(() => undefined);
      throw new NetError('tooLarge');
    }
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

/** Lê só o começo do corpo (para identificar o formato) e cancela o resto. */
export async function readHead(res: Response, bytes: number): Promise<string> {
  if (!res.body) return (await res.text()).slice(0, bytes);
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let out = '';
  let total = 0;
  while (total < bytes) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    out += decoder.decode(value, { stream: true });
  }
  reader.cancel().catch(() => undefined);
  return out.slice(0, bytes);
}

/**
 * Lê o corpo em pedaços de bytes. Aborta se o servidor ficar `idleMs` sem
 * mandar dados (conexões IPTV às vezes "congelam" no meio do download).
 */
export async function* streamBytes(
  url: string,
  opts: FetchOpts & { idleMs?: number; onBytes?: (total: number) => void } = {},
): AsyncGenerator<Uint8Array> {
  const res = await fetchWithTimeout(url, opts);
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (opts.onBytes) opts.onBytes(buf.byteLength);
    yield buf;
    return;
  }
  const reader = res.body.getReader();
  const idleMs = opts.idleMs || 30000;
  let total = 0;
  // o fetch já devolveu os cabeçalhos: o cancelamento do corpo é tratado aqui
  const signal = opts.signal;
  let onAbort: (() => void) | null = null;
  const aborted = new Promise<never>((_, reject) => {
    if (!signal) return;
    onAbort = () => reject(new NetError('aborted'));
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort);
  });
  aborted.catch(() => undefined);
  try {
    for (;;) {
      let timer = 0 as unknown as ReturnType<typeof setTimeout>;
      const idle = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new NetError('timeout')), idleMs);
      });
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await Promise.race([reader.read(), idle, aborted]);
      } finally {
        clearTimeout(timer);
      }
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (opts.onBytes) opts.onBytes(total);
      yield chunk.value;
    }
  } finally {
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
    reader.cancel().catch(() => undefined);
  }
}

/** Mesmo que streamBytes, decodificado como UTF-8. */
export async function* streamText(
  url: string,
  opts: FetchOpts & { idleMs?: number; onBytes?: (total: number) => void } = {},
): AsyncGenerator<string> {
  const decoder = new TextDecoder('utf-8');
  for await (const b of streamBytes(url, opts)) yield decoder.decode(b, { stream: true });
  const tail = decoder.decode();
  if (tail) yield tail;
}

export async function fetchJson<T>(url: string, maxBytes: number, opts: FetchOpts = {}): Promise<T> {
  const res = await fetchWithTimeout(url, opts);
  const text = await readTextLimited(res, maxBytes);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new NetError('badJson');
  }
}
