// Parser XMLTV incremental: recebe pedaços de texto em qualquer ponto de corte
// e devolve <channel> e <programme> completos. Não monta DOM (um guia de 100 MB
// não cabe na memória da TV) — só guarda o elemento incompleto do fim do pedaço.

export interface XmltvChannel {
  id: string;
  names: string[];
}

export interface XmltvProgramme {
  channel: string;
  start: number;
  stop: number;
  title: string;
  desc?: string;
}

// elementos maiores que isso são descartados (proteção de memória)
const MAX_ELEMENT = 64 * 1024;
export const EPG_FIELD_MAX = { id: 120, title: 200, desc: 400, names: 4 };

const ATTR_RE = /([A-Za-z_:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

export class XmltvParser {
  private buf = '';
  /** elementos ignorados (malformados, grandes demais ou com horário inválido) */
  skipped = 0;
  /** já viu a tag <tv>? (null = ainda não sabe) */
  isXmltv: boolean | null = null;

  push(chunk: string): { channels: XmltvChannel[]; programmes: XmltvProgramme[] } {
    const channels: XmltvChannel[] = [];
    const programmes: XmltvProgramme[] = [];
    let text = this.buf + chunk;
    if (this.isXmltv === null) {
      if (/<tv[\s>]/.test(text)) this.isXmltv = true;
      // 4 KB sem <tv>: não é XMLTV (página de erro, lista M3U...)
      else if (text.length > 4096) this.isXmltv = false;
    }
    let pos = 0;
    for (;;) {
      const c = text.indexOf('<channel', pos);
      const p = text.indexOf('<programme', pos);
      if (c < 0 && p < 0) {
        // nada começando: guarda só um rabo curto (pode ser o início de uma tag cortada)
        pos = Math.max(pos, text.length - 16);
        break;
      }
      const isProg = p >= 0 && (c < 0 || p < c);
      const start = isProg ? p : c;
      const closeTag = isProg ? '</programme>' : '</channel>';
      const gt = text.indexOf('>', start);
      if (gt < 0) {
        pos = start;
        break;
      }
      let end: number;
      let inner = '';
      if (text.charCodeAt(gt - 1) === 47 /* / */) {
        end = gt + 1; // <programme ... /> sem conteúdo
      } else {
        const close = text.indexOf(closeTag, gt);
        if (close < 0) {
          pos = start;
          break;
        }
        inner = text.slice(gt + 1, close);
        end = close + closeTag.length;
      }
      const head = text.slice(start, gt);
      if (end - start > MAX_ELEMENT) this.skipped++;
      else if (isProg) {
        const pr = parseProgramme(head, inner);
        if (pr) programmes.push(pr);
        else this.skipped++;
      } else {
        const ch = parseChannel(head, inner);
        if (ch) channels.push(ch);
        else this.skipped++;
      }
      pos = end;
    }
    this.buf = text.slice(pos);
    if (this.buf.length > MAX_ELEMENT) {
      // elemento sem fim gigantesco: descarta e procura o próximo
      this.buf = '';
      this.skipped++;
    }
    return { channels, programmes };
  }
}

function attrs(head: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(head))) out[m[1].toLowerCase()] = decode(m[3] != null ? m[3] : m[4] || '');
  return out;
}

function parseChannel(head: string, inner: string): XmltvChannel | null {
  const id = clip(attrs(head).id, EPG_FIELD_MAX.id);
  if (!id) return null;
  const names: string[] = [];
  const re = /<display-name[^>]*>([\s\S]*?)<\/display-name>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) && names.length < EPG_FIELD_MAX.names) {
    const n = clip(text(m[1]), EPG_FIELD_MAX.title);
    if (n) names.push(n);
  }
  return { id, names };
}

function parseProgramme(head: string, inner: string): XmltvProgramme | null {
  const a = attrs(head);
  const channel = clip(a.channel, EPG_FIELD_MAX.id);
  const start = parseXmltvTime(a.start || '');
  const stop = parseXmltvTime(a.stop || '');
  if (!channel || isNaN(start) || isNaN(stop) || stop <= start) return null;
  const title = clip(text(firstTag(inner, 'title')), EPG_FIELD_MAX.title);
  if (!title) return null;
  const pr: XmltvProgramme = { channel, start, stop, title };
  const desc = clip(text(firstTag(inner, 'desc')), EPG_FIELD_MAX.desc);
  if (desc) pr.desc = desc;
  return pr;
}

/** Conteúdo da primeira ocorrência de <tag>; prefere lang="pt" se houver mais de uma. */
function firstTag(inner: string, tag: string): string {
  const re = new RegExp('<' + tag + '(\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'g');
  let first: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner))) {
    if (first === null) first = m[2];
    if (m[1] && /lang\s*=\s*["']pt/i.test(m[1])) return m[2];
  }
  return first || '';
}

/** "20261101120000 +0300" → ms (UTC). Sem fuso = UTC. Inválido = NaN. */
export function parseXmltvTime(s: string): number {
  const m = /^\s*(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*(?:([+-])(\d{2}):?(\d{2}))?/.exec(s);
  if (!m) return NaN;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
  if (!m[7]) return utc;
  const off = (+m[8] * 60 + +m[9]) * 60000;
  return m[7] === '+' ? utc - off : utc + off;
}

function text(raw: string): string {
  let s = raw;
  const cd = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(s);
  if (cd) return cd[1].replace(/\s+/g, ' ').trim();
  // remove tags internas eventuais; o texto é exibido com textContent, nunca como HTML
  s = s.replace(/<[^>]*>/g, '');
  return decode(s).replace(/\s+/g, ' ').trim();
}

function decode(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    const code = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
  });
}

function clip(s: string | undefined, max: number): string {
  if (!s) return '';
  const t = s.trim();
  return t.length > max ? t.slice(0, max) : t;
}
