// Guia de programação (EPG). Cada importação do guia grava uma geração própria
// (ek = sourceId + ':e' + carimbo), apagada pela mesma limpeza das listas.

import { searchKey } from '../playlist/model';

/** Programa gravado no IndexedDB (campos curtos: são centenas de milhares). */
export interface EpgProgramme {
  /** ek:canal|início(13 dígitos) — ordena por canal e horário */
  id: string;
  s: number;
  e: number;
  t: string;
  d?: string;
}

/** Canais do guia de uma geração, para casar com os canais da lista. */
export interface EpgMeta {
  id: string;
  /** ids de canal do XMLTV (tvg-id) */
  ids: string[];
  /** nomes normalizados e o id correspondente (mesma posição) */
  nameKeys: string[];
  nameIds: string[];
}

export interface EpgStats {
  ek: string;
  importedAt: number;
  durationMs: number;
  bytes: number;
  programmes: number;
  /** canais do guia com pelo menos um programa na janela */
  channels: number;
  skipped: number;
}

/** O que a interface recebe: programa já decodificado. */
export interface Programme {
  start: number;
  stop: number;
  title: string;
  desc?: string;
}

// sufixos de qualidade que mudam entre lista e guia ("Globo HD" x "Globo")
const QUALITY = /\b(fhd|uhd|hd|sd|4k|h265|hevc|hdr|full ?hd)\b/g;

/** Nome normalizado para casar canal da lista com canal do guia. */
export function epgNameKey(name: string): string {
  return searchKey(name)
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(QUALITY, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

/** Programa no ar em `now` e os seguintes, a partir de uma lista ordenada por início. */
export function nowAndNext(list: Programme[], now: number): { now: Programme | null; next: Programme | null } {
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.stop <= now) continue;
    if (p.start <= now) return { now: p, next: list[i + 1] || null };
    return { now: null, next: p };
  }
  return { now: null, next: null };
}
