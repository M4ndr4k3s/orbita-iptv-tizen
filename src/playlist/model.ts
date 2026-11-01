// Modelo dos itens importados de uma fonte. Cada importação grava uma nova
// "geração" (gk); a anterior só é apagada depois que a nova termina, então uma
// falha no meio nunca deixa o usuário sem canais.

export type ItemKind = 'live' | 'movie' | 'series';

export interface Channel {
  /** gk + ':' + número de ordem com 8 dígitos (mantém a ordem da lista no índice) */
  id: string;
  /** chave da geração: sourceId + ':' + carimbo da importação */
  gk: string;
  /** posição na lista (1..n) */
  order: number;
  /** número exibido (tvg-chno / num do Xtream / posição) */
  num: number;
  kind: ItemKind;
  name: string;
  /** nome normalizado para busca (minúsculo, sem acento) */
  q: string;
  group: string;
  logo?: string;
  tvgId?: string;
  /** M3U: URL do stream */
  url?: string;
  /** Xtream: stream_id (a URL é montada na hora de tocar, sem guardar a senha em cada canal) */
  xid?: number;
  /** Xtream: extensão do container (ts/m3u8/mp4...) */
  ext?: string;
  /** dias de arquivo (catch-up), se o servidor informar */
  archiveDays?: number;
}

export interface Group {
  /** gk + ':' + ordem do grupo */
  id: string;
  gk: string;
  kind: ItemKind;
  name: string;
  count: number;
  order: number;
}

export interface ImportStats {
  gk: string;
  importedAt: number;
  durationMs: number;
  bytes: number;
  live: number;
  movies: number;
  series: number;
  groups: number;
  duplicates: number;
  skipped: number;
}

export const FIELD_MAX = { name: 200, group: 120, url: 2048, tvgId: 120 };

const ACCENTS = /[̀-ͯ]/g;

/** Normaliza para busca: minúsculo, sem acentos, espaços simples. */
export function searchKey(s: string): string {
  return s.normalize('NFD').replace(ACCENTS, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// esquemas aceitos para stream; o AVPlay toca http(s)/rtsp/rtmp/udp
const STREAM_SCHEME = /^(https?|rtsp|rtmp|udp|rtp):\/\//i;

export function validStreamUrl(u: string): boolean {
  return u.length <= FIELD_MAX.url && STREAM_SCHEME.test(u) && !/[\s\u0000-\u001f]/.test(u);
}

/** Logos/capas: só http(s), para nunca virar javascript:/data: num <img>. */
export function safeImageUrl(u: string | undefined): string | undefined {
  if (!u) return undefined;
  const s = u.trim();
  return s.length <= FIELD_MAX.url && /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : undefined;
}

/** Classifica um item de M3U pela URL (listas costumam misturar ao vivo e VOD). */
export function classifyUrl(url: string): ItemKind {
  const path = url.split('?')[0].toLowerCase();
  if (path.indexOf('/series/') >= 0) return 'series';
  if (path.indexOf('/movie/') >= 0) return 'movie';
  if (/\.(mp4|mkv|avi|mov|wmv|m4v)$/.test(path)) return 'movie';
  return 'live';
}

export function clip(s: string | undefined, max: number): string {
  if (!s) return '';
  const t = s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return t.length > max ? t.slice(0, max) : t;
}

export function pad8(n: number): string {
  const s = String(n);
  return '00000000'.slice(s.length) + s;
}
