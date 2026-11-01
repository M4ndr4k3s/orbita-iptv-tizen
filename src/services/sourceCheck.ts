// "Testar conexão" de uma fonte antes de salvar.

import { fetchWithTimeout, readHead, NetError } from '../utils/net';
import { authenticate, type XtreamAccount } from './xtreamApi';
import type { ValidSource } from '../playlist/source';

export type CheckError =
  | 'timeout' | 'network' | 'http' | 'notM3u' | 'denied' | 'inactive' | 'badResponse' | 'tooLarge' | 'aborted';

export type CheckResult =
  | { ok: true; kind: 'm3u'; sample: number }
  | { ok: true; kind: 'xtream'; account: XtreamAccount }
  | { ok: false; error: CheckError; httpStatus?: number; detail?: string };

const HEAD_BYTES = 64 * 1024;

/** Confere se o começo do arquivo parece M3U. Retorna quantos #EXTINF apareceram na amostra. */
export function inspectM3uHead(head: string): { isM3u: boolean; sample: number } {
  const text = head.replace(/^﻿/, '').replace(/^\s+/, '');
  const isM3u = /^#EXTM3U/i.test(text) || /^#EXTINF/i.test(text);
  const m = text.match(/#EXTINF/gi);
  return { isM3u, sample: m ? m.length : 0 };
}

export async function checkSource(v: ValidSource, signal?: AbortSignal): Promise<CheckResult> {
  try {
    if (v.kind === 'm3u') {
      const res = await fetchWithTimeout(v.url || '', { timeoutMs: 20000, signal });
      const info = inspectM3uHead(await readHead(res, HEAD_BYTES));
      return info.isM3u ? { ok: true, kind: 'm3u', sample: info.sample } : { ok: false, error: 'notM3u' };
    }
    const r = await authenticate({ server: v.server || '', username: v.username || '', password: v.password || '' }, signal);
    if (r.ok) return { ok: true, kind: 'xtream', account: r.account };
    return { ok: false, error: r.reason, detail: r.status };
  } catch (e) {
    if (e instanceof NetError) {
      const code = e.code === 'badJson' ? 'badResponse' : e.code;
      return { ok: false, error: code, httpStatus: e.status || undefined };
    }
    return { ok: false, error: 'network' };
  }
}
