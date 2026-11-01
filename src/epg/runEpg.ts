// Baixa e grava um guia XMLTV (roda dentro do Web Worker). Aceita .xml e .xml.gz
// (detectado pelos bytes, não pela extensão). Só guarda a janela útil: de 2 h
// atrás até 4 dias à frente — guias de 14 dias encheriam o banco da TV à toa.

import { Gunzip } from 'fflate';
import { streamBytes, NetError, type NetErrorCode } from '../utils/net';
import { XmltvParser, type XmltvProgramme } from './xmltv';
import { epgNameKey, type EpgMeta, type EpgProgramme, type EpgStats } from './model';

export type EpgErrorCode = NetErrorCode | 'notXmltv' | 'empty' | 'storage';

export class EpgError extends Error {
  constructor(readonly code: EpgErrorCode, readonly status = 0) {
    super(code);
    this.name = 'EpgError';
  }
}

export interface EpgSink {
  putProgrammes(batch: EpgProgramme[]): Promise<void>;
  putMeta(meta: EpgMeta): Promise<void>;
}

export interface EpgRunOptions {
  signal?: AbortSignal;
  onProgress?: (p: { programmes: number; bytes: number }) => void;
  now?: number;
  maxProgrammes?: number;
}

const PAST_MS = 2 * 3600 * 1000;
const AHEAD_MS = 4 * 24 * 3600 * 1000;
const MAX_PROGRAMMES = 400000;
// limites de tamanho: compactado e descompactado (proteção contra "bomba" gzip)
const MAX_DOWNLOAD = 120 * 1024 * 1024;
const MAX_XML = 800 * 1024 * 1024;
const BATCH = 2000;

export function pad13(n: number): string {
  const s = String(Math.max(0, Math.floor(n)));
  return s.length >= 13 ? s : '0000000000000'.slice(s.length) + s;
}

/** Id do programa: ek:canal|início. O '|' do id do canal vira '_' para não quebrar o intervalo. */
export function programmeId(ek: string, channel: string, start: number): string {
  return ek + ':' + channel.replace(/\|/g, '_') + '|' + pad13(start);
}

export async function runEpg(url: string, ek: string, sink: EpgSink, opts: EpgRunOptions = {}): Promise<EpgStats> {
  const importedAt = Date.now();
  const now = opts.now || importedAt;
  const from = now - PAST_MS;
  const to = now + AHEAD_MS;
  const max = opts.maxProgrammes || MAX_PROGRAMMES;
  const parser = new XmltvParser();
  const decoder = new TextDecoder('utf-8');
  const ids: string[] = [];
  const nameKeys: string[] = [];
  const nameIds: string[] = [];
  const seenName = new Set<string>();
  const withProgs = new Set<string>();
  let batch: EpgProgramme[] = [];
  let count = 0;
  let bytes = 0;
  let xmlBytes = 0;
  let gz: Gunzip | null = null;
  let first = true;
  let pendingText: string[] = [];

  const take = async (txt: string) => {
    const r = parser.push(txt);
    if (parser.isXmltv === false) throw new EpgError('notXmltv');
    for (const c of r.channels) {
      ids.push(c.id);
      for (const n of c.names) {
        const k = epgNameKey(n);
        if (k && !seenName.has(k)) {
          seenName.add(k);
          nameKeys.push(k);
          nameIds.push(c.id);
        }
      }
    }
    for (const p of r.programmes) {
      if (count >= max || p.stop <= from || p.start >= to) continue;
      batch.push(toRecord(ek, p));
      withProgs.add(p.channel);
      count++;
    }
    if (batch.length >= BATCH) {
      const b = batch;
      batch = [];
      await sink.putProgrammes(b);
      if (opts.onProgress) opts.onProgress({ programmes: count, bytes });
    }
  };

  try {
    for await (const chunk of streamBytes(url, { timeoutMs: 30000, idleMs: 45000, signal: opts.signal, onBytes: (n) => (bytes = n) })) {
      if (bytes > MAX_DOWNLOAD) throw new EpgError('tooLarge');
      if (first) {
        first = false;
        // 1f 8b = gzip
        if (chunk.length >= 2 && chunk[0] === 0x1f && chunk[1] === 0x8b) {
          gz = new Gunzip((data) => {
            xmlBytes += data.length;
            pendingText.push(decoder.decode(data, { stream: true }));
          });
        }
      }
      if (gz) gz.push(chunk);
      else {
        xmlBytes += chunk.length;
        pendingText.push(decoder.decode(chunk, { stream: true }));
      }
      if (xmlBytes > MAX_XML) throw new EpgError('tooLarge');
      const texts = pendingText;
      pendingText = [];
      for (const t of texts) await take(t);
    }
    if (gz) gz.push(new Uint8Array(0), true);
    pendingText.push(decoder.decode());
    for (const t of pendingText) await take(t);
    if (batch.length) await sink.putProgrammes(batch);
    if (parser.isXmltv !== true) throw new EpgError('notXmltv');
    if (!count) throw new EpgError('empty');
    await sink.putMeta({ id: ek, ids, nameKeys, nameIds });
  } catch (e) {
    if (e instanceof EpgError) throw e;
    if (e instanceof NetError) throw new EpgError(e.code, e.status);
    if (opts.signal && opts.signal.aborted) throw new EpgError('aborted');
    // gzip corrompido também cai aqui como "não é XMLTV"
    if (e instanceof Error && /invalid|unexpected|gzip|header/i.test(e.message)) throw new EpgError('notXmltv');
    throw new EpgError('storage');
  }
  return { ek, importedAt, durationMs: Date.now() - importedAt, bytes, programmes: count, channels: withProgs.size, skipped: parser.skipped };
}

function toRecord(ek: string, p: XmltvProgramme): EpgProgramme {
  const r: EpgProgramme = { id: programmeId(ek, p.channel, p.start), s: p.start, e: p.stop, t: p.title };
  if (p.desc) r.d = p.desc;
  return r;
}
