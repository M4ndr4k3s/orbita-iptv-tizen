import { describe, it, expect } from 'vitest';
import { M3uParser, parseExtinf, type M3uEntry } from '../src/playlist/m3uParser';
import { JsonArrayStream } from '../src/playlist/jsonStream';
import { classifyUrl, searchKey, safeImageUrl, validStreamUrl } from '../src/playlist/model';

// alimenta o parser em pedaços de tamanho fixo (testa cortes no meio de linhas)
function parseChunks(text: string, size: number): { entries: M3uEntry[]; p: M3uParser } {
  const p = new M3uParser();
  const entries: M3uEntry[] = [];
  for (let i = 0; i < text.length; i += size) entries.push(...p.push(text.slice(i, i + size)));
  entries.push(...p.end());
  return { entries, p };
}

const SAMPLE =
  '﻿#EXTM3U x-tvg-url="http://epg/x.xml"\r\n' +
  '#EXTINF:-1 tvg-id="g1" tvg-name="Globo" tvg-logo="http://l/g.png" group-title="Abertos, HD",Globo HD\r\n' +
  'http://s/live/1.ts\r\n' +
  '#EXTINF:-1,Sem atributos\n' +
  '#EXTVLCOPT:http-user-agent=X\n' +
  'http://s/live/2.ts\n' +
  '#EXTGRP:Notícias\n' +
  '#EXTINF:-1 tvg-chno="7",CNN\n' +
  'http://s/live/3.m3u8\n' +
  '#EXTINF:-1,Órfão sem URL\n' +
  '#EXTINF:-1,Último\n' +
  'http://s/movie/u/p/9.mp4';

describe('M3uParser', () => {
  it('extrai entradas, atributos, #EXTGRP e ignora diretivas', () => {
    const { entries, p } = parseChunks(SAMPLE, 100000);
    expect(p.isM3u).toBe(true);
    expect(entries.map((e) => e.name)).toEqual(['Globo HD', 'Sem atributos', 'CNN', 'Último']);
    expect(entries[0].attrs).toMatchObject({ 'tvg-id': 'g1', 'tvg-logo': 'http://l/g.png', 'group-title': 'Abertos, HD' });
    expect(entries[2].extGroup).toBe('Notícias');
    expect(entries[2].attrs['tvg-chno']).toBe('7');
    expect(p.skipped).toBe(1); // "Órfão sem URL"
  });

  it('dá o mesmo resultado com qualquer tamanho de pedaço', () => {
    const ref = parseChunks(SAMPLE, 100000).entries;
    for (const size of [1, 2, 3, 7, 13, 64]) expect(parseChunks(SAMPLE, size).entries).toEqual(ref);
  });

  it('detecta conteúdo que não é M3U', () => {
    expect(parseChunks('<html><body>erro</body></html>', 10).p.isM3u).toBe(false);
  });

  it('descarta linha gigante sem estourar memória', () => {
    const big = '#EXTM3U\n#EXTINF:-1,A\n' + 'x'.repeat(20000) + '\n#EXTINF:-1,B\nhttp://b\n';
    const { entries, p } = parseChunks(big, 1000);
    expect(entries.map((e) => e.name)).toEqual(['B']);
    expect(p.skipped).toBeGreaterThan(0);
  });

  it('título com vírgula depois dos atributos', () => {
    expect(parseExtinf('#EXTINF:-1 group-title="a,b",Canal, o melhor')).toEqual({ name: 'Canal, o melhor', attrs: { 'group-title': 'a,b' } });
  });
});

describe('JsonArrayStream', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ id: i, name: 'Canal "' + i + '" {x} [y]', esc: 'a\\"b' }));
  const json = JSON.stringify(items);

  it('devolve todos os objetos com qualquer corte', () => {
    for (const size of [1, 5, 17, 1000, 100000]) {
      const s = new JsonArrayStream();
      const out: unknown[] = [];
      for (let i = 0; i < json.length; i += size) out.push(...s.push(json.slice(i, i + size)));
      expect(out).toEqual(items);
    }
  });

  it('sinaliza resposta que não é array (erro do servidor)', () => {
    const s = new JsonArrayStream();
    expect(s.push('{"user_info":{"auth":0}}')).toEqual([]);
    expect(s.notArray).toBe(true);
  });

  it('pula objeto inválido e continua', () => {
    const s = new JsonArrayStream();
    const out = s.push('[{"a":1},{"b":tru},{"c":3}]');
    expect(out).toEqual([{ a: 1 }, { c: 3 }]);
    expect(s.skipped).toBe(1);
  });
});

describe('model', () => {
  it('classifica ao vivo, filme e série pela URL', () => {
    expect(classifyUrl('http://s/live/u/p/1.ts')).toBe('live');
    expect(classifyUrl('http://s/u/p/1')).toBe('live');
    expect(classifyUrl('http://s/movie/u/p/1.mkv')).toBe('movie');
    expect(classifyUrl('http://s/vod/filme.MP4?token=1')).toBe('movie');
    expect(classifyUrl('http://s/series/u/p/1.mp4')).toBe('series');
  });

  it('normaliza busca sem acentos', () => {
    expect(searchKey('  Ação  NOTÍCIAS ')).toBe('acao noticias');
  });

  it('aceita só URLs de imagem http(s) e streams com esquemas conhecidos', () => {
    expect(safeImageUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeImageUrl('data:image/png;base64,xx')).toBeUndefined();
    expect(safeImageUrl('http://a/b.png" onerror="x')).toBeUndefined();
    expect(safeImageUrl(' https://a/b.png ')).toBe('https://a/b.png');
    expect(validStreamUrl('rtmp://a/b')).toBe(true);
    expect(validStreamUrl('file:///etc/passwd')).toBe(false);
    expect(validStreamUrl('http://a/b c')).toBe(false);
  });
});
