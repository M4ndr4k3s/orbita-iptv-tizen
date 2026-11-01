// Monta a URL de reprodução de um item. No Xtream a URL leva usuário e senha,
// por isso é montada só na hora de tocar e nunca é gravada nem logada.

import type { Channel } from '../playlist/model';
import type { Source } from '../playlist/source';
import { validStreamUrl } from '../playlist/model';

export type LiveFormat = 'ts' | 'm3u8';

export function streamUrl(ch: Channel, src: Source, liveFormat: LiveFormat = 'ts'): string | null {
  if (ch.url) return validStreamUrl(ch.url) ? ch.url : null;
  if (ch.xid == null || src.kind !== 'xtream' || !src.server || !src.username || !src.password) return null;
  const u = encodeURIComponent(src.username);
  const p = encodeURIComponent(src.password);
  if (ch.kind === 'live') return `${src.server}/live/${u}/${p}/${ch.xid}.${liveFormat}`;
  const ext = ch.ext || 'mp4';
  return `${src.server}/${ch.kind === 'movie' ? 'movie' : 'series'}/${u}/${p}/${ch.xid}.${ext}`;
}

/** Versão para log/tela: esconde credenciais do Xtream. */
export function redactUrl(url: string): string {
  return url.replace(/\/(live|movie|series)\/[^/]+\/[^/]+\//, '/$1/***/***/').replace(/([?&](password|pass|token)=)[^&]*/gi, '$1***');
}
