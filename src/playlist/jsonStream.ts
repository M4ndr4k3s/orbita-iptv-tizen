// Lê um array JSON de objetos ([{...},{...}]) em pedaços e devolve cada objeto
// assim que ele fecha. Evita JSON.parse de respostas de dezenas de MB
// (ex.: get_live_streams do Xtream com 100 mil itens) na memória da TV.

const MAX_OBJECT = 256 * 1024;

export class JsonArrayStream<T = unknown> {
  private buf = '';
  private depth = 0;
  private inString = false;
  private escape = false;
  private objStart = -1;
  private started = false;
  /** objetos descartados (grandes demais ou JSON inválido) */
  skipped = 0;
  /** a resposta não começou com '[' (ex.: objeto de erro, HTML) */
  notArray = false;

  push(chunk: string): T[] {
    const out: T[] = [];
    let s = this.buf + chunk;
    let i = this.buf.length;
    // começa a varrer de onde parou; objStart é relativo a s
    for (; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (!this.started) {
        if (c === 91 /* [ */) {
          this.started = true;
          this.depth = 1;
        } else if (c > 32 && c !== 0xfeff) {
          this.notArray = true;
          this.buf = '';
          return out;
        }
        continue;
      }
      if (this.inString) {
        if (this.escape) this.escape = false;
        else if (c === 92 /* \ */) this.escape = true;
        else if (c === 34 /* " */) this.inString = false;
        continue;
      }
      if (c === 34) this.inString = true;
      else if (c === 123 /* { */ || c === 91 /* [ */) {
        if (this.depth === 1 && c === 123) this.objStart = i;
        this.depth++;
      } else if (c === 125 /* } */ || c === 93 /* ] */) {
        this.depth--;
        if (this.depth === 1 && c === 125 && this.objStart >= 0) {
          const slice = s.slice(this.objStart, i + 1);
          try {
            out.push(JSON.parse(slice) as T);
          } catch {
            this.skipped++;
          }
          this.objStart = -1;
        }
      }
      if (this.objStart >= 0 && i - this.objStart > MAX_OBJECT) {
        // objeto gigante: abandona até o fim dele
        this.skipped++;
        this.objStart = -1;
      }
    }
    // guarda só o objeto em andamento (o resto já foi consumido)
    if (this.objStart >= 0) {
      s = s.slice(this.objStart);
      this.objStart = 0;
      this.buf = s;
    } else {
      this.buf = '';
    }
    return out;
  }
}
