import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { XmltvParser, parseXmltvTime } from '../src/epg/xmltv';
import { runEpg, EpgError, programmeId, type EpgSink } from '../src/epg/runEpg';
import { epgNameKey, nowAndNext, type EpgMeta, type EpgProgramme } from '../src/epg/model';
import { M3uParser } from '../src/playlist/m3uParser';
import { epgUrlFor, type Source } from '../src/playlist/source';

const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);
const fmt = (ms: number) => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000';

function guide(channels: number, perChannel: number, startMs = NOW - 3600000): string {
  let s = '<?xml version="1.0"?>\n<tv>\n';
  for (let c = 1; c <= channels; c++) s += `<channel id="c${c}"><display-name>Canal ${c} HD</display-name></channel>\n`;
  for (let c = 1; c <= channels; c++) {
    for (let k = 0; k < perChannel; k++) {
      const st = startMs + k * 1800000;
      s += `<programme start="${fmt(st)}" stop="${fmt(st + 1800000)}" channel="c${c}"><title>P${k} &amp; cia</title></programme>\n`;
    }
  }
  return s + '</tv>\n';
}

describe('parseXmltvTime', () => {
  it('converte com fuso', () => {
    expect(parseXmltvTime('20261101120000 +0000')).toBe(NOW);
    expect(parseXmltvTime('20261101090000 -0300')).toBe(NOW);
    expect(parseXmltvTime('20261101150000 +03:00')).toBe(NOW);
  });
  it('sem fuso = UTC; sem segundos aceita', () => {
    expect(parseXmltvTime('202611011200')).toBe(NOW);
  });
  it('inválido = NaN', () => {
    expect(parseXmltvTime('')).toBeNaN();
    expect(parseXmltvTime('ontem')).toBeNaN();
  });
});

describe('XmltvParser', () => {
  const sample =
    '<tv><channel id="a.br"><display-name lang="en">A</display-name><display-name lang="pt">Canal &#193;</display-name></channel>' +
    '<programme start="20261101120000 +0000" stop="20261101130000 +0000" channel="a.br">' +
    '<title lang="en">News</title><title lang="pt">Jornal &amp; Cia</title><desc><![CDATA[Texto <b>forte</b>]]></desc></programme>' +
    '<programme start="20261101130000 +0000" stop="20261101140000 +0000" channel="a.br"/>' +
    '<programme start="xx" stop="20261101140000 +0000" channel="a.br"><title>Sem início</title></programme></tv>';

  it('interpreta canais, títulos (prefere pt), entidades e CDATA', () => {
    const p = new XmltvParser();
    const r = p.push(sample);
    expect(p.isXmltv).toBe(true);
    expect(r.channels).toEqual([{ id: 'a.br', names: ['A', 'Canal Á'] }]);
    expect(r.programmes).toHaveLength(1);
    expect(r.programmes[0]).toMatchObject({ channel: 'a.br', start: NOW, title: 'Jornal & Cia', desc: 'Texto <b>forte</b>' });
    // sem título e horário inválido são ignorados, não quebram
    expect(p.skipped).toBe(2);
  });

  it('dá o mesmo resultado com qualquer ponto de corte', () => {
    const whole = new XmltvParser().push(sample);
    for (let cut = 1; cut < sample.length; cut += 7) {
      const p = new XmltvParser();
      const a = p.push(sample.slice(0, cut));
      const b = p.push(sample.slice(cut));
      expect(a.programmes.concat(b.programmes)).toEqual(whole.programmes);
      expect(a.channels.concat(b.channels)).toEqual(whole.channels);
    }
  });

  it('descarta elemento gigante sem perder os seguintes', () => {
    const p = new XmltvParser();
    const big = '<tv><programme start="20261101120000" stop="20261101130000" channel="x"><title>' + 'a'.repeat(70000) + '</title></programme>';
    const r1 = p.push(big);
    const r2 = p.push('<programme start="20261101120000" stop="20261101130000" channel="y"><title>ok</title></programme></tv>');
    expect(r1.programmes.length + r2.programmes.length).toBe(1);
    expect(r2.programmes[0].channel).toBe('y');
    expect(p.skipped).toBeGreaterThan(0);
  });

  it('recusa conteúdo que não é XMLTV', () => {
    const p = new XmltvParser();
    p.push('#EXTM3U\n' + 'x'.repeat(5000));
    expect(p.isXmltv).toBe(false);
  });
});

describe('epgNameKey / nowAndNext', () => {
  it('ignora acento, caixa e sufixo de qualidade', () => {
    expect(epgNameKey('Globo HD')).toBe(epgNameKey('globo'));
    expect(epgNameKey('ESPN [FHD]')).toBe('espn');
    expect(epgNameKey('Canal Á 4K')).toBe(epgNameKey('canal a'));
  });
  it('acha o programa no ar e o seguinte', () => {
    const l = [
      { start: NOW - 7200000, stop: NOW - 3600000, title: 'antes' },
      { start: NOW - 3600000, stop: NOW + 60000, title: 'agora' },
      { start: NOW + 60000, stop: NOW + 3600000, title: 'depois' },
    ];
    expect(nowAndNext(l, NOW)).toMatchObject({ now: { title: 'agora' }, next: { title: 'depois' } });
    expect(nowAndNext(l.slice(2), NOW)).toMatchObject({ now: null, next: { title: 'depois' } });
  });
});

class MemSink implements EpgSink {
  progs: EpgProgramme[] = [];
  meta: EpgMeta | null = null;
  async putProgrammes(b: EpgProgramme[]) { this.progs.push(...b); }
  async putMeta(m: EpgMeta) { this.meta = m; }
}

let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://x');
    if (u.pathname === '/g.xml') return res.end(guide(30, 400));
    if (u.pathname === '/g.xml.gz') return res.end(gzipSync(guide(30, 400)));
    if (u.pathname === '/broken.gz') return res.end(Buffer.from([0x1f, 0x8b, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    if (u.pathname === '/page.html') return res.end('<html>' + 'x'.repeat(6000) + '</html>');
    if (u.pathname === '/old.xml') return res.end(guide(3, 4, NOW - 30 * 86400000));
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});
afterAll(() => server.close());

describe('runEpg', () => {
  it('importa XML puro só na janela útil (−2 h a +4 dias)', async () => {
    const sink = new MemSink();
    const st = await runEpg(base + '/g.xml', 'src:e1', sink, { now: NOW });
    // 400 programas de 30 min a partir de −1 h = 200 h; janela de 4 dias = 96 h → 194 por canal
    expect(st.programmes).toBe(30 * 194);
    expect(st.channels).toBe(30);
    expect(sink.progs.every((p) => p.e > NOW - 7200000 && p.s < NOW + 4 * 86400000)).toBe(true);
    expect(sink.progs[0].id).toBe(programmeId('src:e1', 'c1', NOW - 3600000));
    expect(sink.progs[0].t).toBe('P0 & cia');
    expect(sink.meta!.ids).toHaveLength(30);
    expect(sink.meta!.nameKeys[0]).toBe(epgNameKey('Canal 1'));
  });

  it('descompacta .gz detectando pelos bytes', async () => {
    const plain = await runEpg(base + '/g.xml', 'a:e1', new MemSink(), { now: NOW });
    const gz = await runEpg(base + '/g.xml.gz', 'a:e1', new MemSink(), { now: NOW });
    expect(gz.programmes).toBe(plain.programmes);
    expect(gz.bytes).toBeLessThan(plain.bytes);
  });

  it('respeita o limite de programas', async () => {
    const st = await runEpg(base + '/g.xml', 'a:e1', new MemSink(), { now: NOW, maxProgrammes: 500 });
    expect(st.programmes).toBe(500);
  });

  it('erros: gzip corrompido, página HTML, 404, guia todo vencido', async () => {
    const code = (url: string) => runEpg(base + url, 'a:e1', new MemSink(), { now: NOW }).then(() => 'ok', (e: EpgError) => e.code);
    expect(await code('/broken.gz')).toBe('notXmltv');
    expect(await code('/page.html')).toBe('notXmltv');
    expect(await code('/nada.xml')).toBe('http');
    expect(await code('/old.xml')).toBe('empty');
  });

  it('cancelamento', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const r = await runEpg(base + '/g.xml', 'a:e1', new MemSink(), { signal: ctrl.signal }).catch((e: EpgError) => e.code);
    expect(r).toBe('aborted');
  });
});

describe('URL do guia', () => {
  const base0: Source = { id: 's', kind: 'm3u', name: 'x', url: 'http://h/l.m3u', refreshHours: 24, createdAt: 0, updatedAt: 0 };
  it('cabeçalho url-tvg da lista M3U', () => {
    const p = new M3uParser();
    p.push('#EXTM3U url-tvg="http://g/a.xml.gz,http://g/b.xml" x-tvg-url="http://outro"\n#EXTINF:-1,A\nhttp://s/1\n');
    expect(p.tvgUrl).toBe('http://g/a.xml.gz');
  });
  it('prioridade: informada > Xtream > cabeçalho', () => {
    const imp = { gk: 'g', importedAt: 0, durationMs: 0, bytes: 0, live: 1, movies: 0, series: 0, groups: 1, duplicates: 0, skipped: 0, tvgUrl: 'http://g/a.xml' };
    expect(epgUrlFor({ ...base0, import: imp })).toBe('http://g/a.xml');
    expect(epgUrlFor({ ...base0, epgUrl: 'http://meu/epg.xml', import: imp })).toBe('http://meu/epg.xml');
    expect(epgUrlFor({ ...base0, kind: 'xtream', url: undefined, server: 'http://srv', username: 'u s', password: 'p&w' })).toBe(
      'http://srv/xmltv.php?username=u%20s&password=p%26w',
    );
    expect(epgUrlFor(base0)).toBeNull();
  });
});
