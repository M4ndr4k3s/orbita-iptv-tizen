// Parser M3U/M3U8 (IPTV estendido) incremental: recebe pedaços de texto em
// qualquer ponto de corte e devolve as entradas completas. Não guarda o arquivo
// inteiro na memória — só a linha incompleta do fim do pedaço.

export interface M3uEntry {
  name: string;
  url: string;
  attrs: Record<string, string>;
  /** grupo vindo de #EXTGRP (usado se não houver group-title) */
  extGroup?: string;
}

// linhas absurdamente longas são descartadas (proteção de memória)
const MAX_LINE = 16 * 1024;
const ATTR_RE = /([A-Za-z0-9_-]+)\s*=\s*"([^"]*)"/g;

export class M3uParser {
  private rest = '';
  private pending: { name: string; attrs: Record<string, string>; extGroup?: string } | null = null;
  private pendingGroup: string | undefined;
  private first = true;
  private discarding = false;
  /** linhas ignoradas por tamanho ou formato */
  skipped = 0;
  /** o arquivo começou com #EXTM3U (ou #EXTINF)? só é conhecido após o primeiro pedaço */
  isM3u: boolean | null = null;

  push(chunk: string): M3uEntry[] {
    const out: M3uEntry[] = [];
    let text = this.rest + chunk;
    if (this.discarding) {
      // ainda dentro de uma linha gigante descartada: pula até a próxima quebra
      const nl = text.indexOf('\n');
      if (nl < 0) {
        this.rest = '';
        return out;
      }
      text = text.slice(nl + 1);
      this.discarding = false;
      if (this.pending) {
        // a linha descartada era a URL do #EXTINF pendente
        this.pending = null;
        this.pendingGroup = undefined;
      }
    }
    let start = 0;
    for (;;) {
      const nl = text.indexOf('\n', start);
      if (nl < 0) break;
      this.line(text.slice(start, nl), out);
      start = nl + 1;
    }
    this.rest = text.slice(start);
    if (this.rest.length > MAX_LINE) {
      // linha sem fim gigantesca: descarta até a próxima quebra
      this.rest = '';
      this.discarding = true;
      this.skipped++;
    }
    return out;
  }

  end(): M3uEntry[] {
    const out: M3uEntry[] = [];
    if (this.rest) this.line(this.rest, out);
    this.rest = '';
    return out;
  }

  private line(raw: string, out: M3uEntry[]): void {
    let line = raw.length > 0 && raw.charCodeAt(raw.length - 1) === 13 ? raw.slice(0, -1) : raw;
    if (this.first) {
      line = line.replace(/^﻿/, '');
      if (line.trim()) {
        this.first = false;
        this.isM3u = /^#EXTM3U/i.test(line.trim()) || /^#EXTINF/i.test(line.trim());
      }
    }
    line = line.trim();
    if (!line) return;
    if (line.length > MAX_LINE) {
      this.skipped++;
      return;
    }
    if (line.charCodeAt(0) === 35 /* # */) {
      if (/^#EXTINF:/i.test(line)) {
        if (this.pending) this.skipped++; // EXTINF sem URL
        this.pending = parseExtinf(line);
        if (this.pendingGroup) this.pending.extGroup = this.pendingGroup;
      } else if (/^#EXTGRP:/i.test(line)) {
        this.pendingGroup = line.slice(8).trim();
        if (this.pending) this.pending.extGroup = this.pendingGroup;
      }
      // #EXTM3U, #EXTVLCOPT, #KODIPROP etc.: ignorados por enquanto
      return;
    }
    // linha de URL
    if (this.pending) {
      out.push({ name: this.pending.name, url: line, attrs: this.pending.attrs, extGroup: this.pending.extGroup });
      this.pending = null;
      this.pendingGroup = undefined;
    } else {
      // URL solta sem #EXTINF: aceita com o próprio endereço como nome
      out.push({ name: '', url: line, attrs: {} });
    }
  }
}

/** #EXTINF:-1 tvg-id="x" group-title="A, B",Nome do canal */
export function parseExtinf(line: string): { name: string; attrs: Record<string, string> } {
  const body = line.slice(line.indexOf(':') + 1);
  // a vírgula do título é a primeira fora de aspas
  let inQuote = false;
  let comma = -1;
  for (let i = 0; i < body.length; i++) {
    const c = body.charCodeAt(i);
    if (c === 34) inQuote = !inQuote;
    else if (c === 44 && !inQuote) {
      comma = i;
      break;
    }
  }
  const head = comma >= 0 ? body.slice(0, comma) : body;
  const name = comma >= 0 ? body.slice(comma + 1).trim() : '';
  const attrs: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(head))) attrs[m[1].toLowerCase()] = m[2];
  return { name, attrs };
}
