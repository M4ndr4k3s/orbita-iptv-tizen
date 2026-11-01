import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { parseVodInfo, parseSeriesInfo, fmtTime, fmtDuration } from '../src/services/vodInfo';
import { ResumeStore, resumeKey } from '../src/storage/resume';
import { runImport } from '../src/playlist/runImport';
import type { ImportSink } from '../src/playlist/importer';
import type { Channel, Group } from '../src/playlist/model';
import { streamUrl } from '../src/player/streamUrl';
import type { Source } from '../src/playlist/source';

describe('parseVodInfo', () => {
  it('lê campos variados e normaliza', () => {
    const d = parseVodInfo({
      info: { plot: '  Um   filme\n bom ', genre: 'Ação', releasedate: '2021-03-04', duration: '01:32:10', rating: '7.25', movie_image: 'https://img/p.jpg' },
    });
    expect(d).toMatchObject({ plot: 'Um filme bom', genre: 'Ação', year: '2021', durationSec: 5530, rating: 7.3, poster: 'https://img/p.jpg' });
  });
  it('resposta estranha não quebra; imagem não-http é descartada', () => {
    expect(parseVodInfo(null)).toMatchObject({});
    expect(parseVodInfo({ info: [] })).toMatchObject({});
    const d = parseVodInfo({ info: { movie_image: 'javascript:alert(1)', rating: 99, duration: '95 min', plot: 'x'.repeat(5000) } });
    expect(d.poster).toBeUndefined();
    expect(d.rating).toBeUndefined();
    expect(d.durationSec).toBe(5700);
    expect(d.plot!.length).toBe(1200);
  });
});

describe('parseSeriesInfo', () => {
  it('agrupa e ordena episódios por temporada', () => {
    const s = parseSeriesInfo({
      info: { plot: 'P', cover: 'http://c/x.png' },
      episodes: {
        '2': [{ id: '21', episode_num: 1, season: 2, title: 'B1', container_extension: 'MKV' }],
        '1': [
          { id: '12', episode_num: '2', season: '1', title: 'A2', info: { duration_secs: 1200 } },
          { id: '11', episode_num: 1, season: 1, title: 'A1' },
          { id: 'x', title: 'sem id' },
        ],
      },
    });
    expect(s.seasons).toEqual([1, 2]);
    expect(s.episodes.map((e) => e.title)).toEqual(['A1', 'A2', 'B1']);
    expect(s.episodes[1].durationSec).toBe(1200);
    expect(s.episodes[2].ext).toBe('mkv');
    expect(s.poster).toBe('http://c/x.png');
  });
  it('extensão inválida é ignorada (vai para a URL)', () => {
    const s = parseSeriesInfo({ episodes: [[{ id: 1, season: 1, episode_num: 1, title: 'a', container_extension: '../x' }]] });
    expect(s.episodes[0].ext).toBeUndefined();
  });
});

describe('formatos de tempo', () => {
  it('fmtTime / fmtDuration', () => {
    expect(fmtTime(0)).toBe('0:00');
    expect(fmtTime(65000)).toBe('1:05');
    expect(fmtTime(3725000)).toBe('1:02:05');
    expect(fmtDuration(5530)).toBe('1 h 32 min');
    expect(fmtDuration(600)).toBe('10 min');
  });
});

describe('ResumeStore', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };
  it('guarda, ignora começo e fim, e persiste', () => {
    const b = mem();
    const r = new ResumeStore(b);
    r.save('a', 30000, 600000);
    expect(r.get('a')).toBe(0); // menos de 1 min
    r.save('a', 120000, 600000);
    expect(r.get('a')).toBe(120000);
    expect(new ResumeStore(b).get('a')).toBe(120000);
    r.save('a', 590000, 600000); // perto do fim = assistido
    expect(r.get('a')).toBe(0);
  });
  it('limita a 300 itens, saindo os mais antigos', () => {
    const r = new ResumeStore(mem());
    for (let i = 0; i < 310; i++) r.save('k' + i, 100000, 0, 1000 + i);
    expect(r.get('k0')).toBe(0);
    expect(r.get('k309')).toBe(100000);
  });
  it('dado corrompido no storage não quebra', () => {
    const b = mem();
    b.setItem('orbita.resume.v1', '{"a":{"pos":"x"}, "b": 5}');
    expect(new ResumeStore(b).get('a')).toBe(0);
    b.setItem('orbita.resume.v1', 'não é json');
    expect(new ResumeStore(b).get('a')).toBe(0);
  });
  it('chave por fonte e id (não muda entre importações)', () => {
    expect(resumeKey({ id: 's1' }, 'movie', { xid: 5 })).toBe('s1|movie:5');
    expect(resumeKey({ id: 's1' }, 'movie', { url: 'http://x/f.mp4' })).toBe('s1|movie:http://x/f.mp4');
  });
});

class MemSink implements ImportSink {
  channels: Channel[] = [];
  groups: Group[] = [];
  async putChannels(b: Channel[]) { this.channels.push(...b); }
  async putGroups(g: Group[]) { this.groups.push(...g); }
}

let server: Server;
let base = '';
let seriesFails = false;

beforeAll(async () => {
  server = createServer((req, res) => {
    const a = new URL(req.url || '/', 'http://x').searchParams.get('action');
    const json = (v: unknown) => res.end(JSON.stringify(v));
    if (a === 'get_live_categories') return json([{ category_id: '1', category_name: 'Ao vivo' }]);
    if (a === 'get_live_streams') return json([{ stream_id: 1, name: 'Canal', category_id: '1' }]);
    if (a === 'get_vod_categories') return json([{ category_id: '9', category_name: 'Ação' }]);
    if (a === 'get_vod_streams') return json([{ stream_id: 10, name: 'Filme', category_id: '9', container_extension: 'mkv', rating: '6.8' }, { stream_id: 11, name: 'Filme 2', category_id: '9' }]);
    if (a === 'get_series_categories') return json([{ category_id: '9', category_name: 'Ação' }]);
    if (a === 'get_series') {
      if (seriesFails) {
        res.statusCode = 500;
        return res.end();
      }
      return json([{ series_id: 77, name: 'Série', category_id: '9', cover: 'http://c/s.jpg' }]);
    }
    res.end('[]');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});
afterAll(() => server.close());

describe('importação Xtream com VOD', () => {
  const src = () => ({ kind: 'xtream' as const, server: base, username: 'u', password: 'p' });

  it('importa canais, filmes e séries com categorias separadas por tipo', async () => {
    seriesFails = false;
    const sink = new MemSink();
    const st = await runImport(src(), 'g:1', sink);
    expect([st.live, st.movies, st.series]).toEqual([1, 2, 1]);
    expect(st.vodFailed).toBeUndefined();
    // "Ação" de filmes e de séries são grupos diferentes
    expect(sink.groups.filter((g) => g.name === 'Ação').map((g) => g.kind).sort()).toEqual(['movie', 'series']);
    const movie = sink.channels.find((c) => c.kind === 'movie')!;
    expect(movie).toMatchObject({ xid: 10, ext: 'mkv', rating: 6.8 });
    expect(sink.channels.find((c) => c.kind === 'series')).toMatchObject({ xid: 77, logo: 'http://c/s.jpg' });
  });

  it('falha no catálogo de séries não perde canais nem filmes', async () => {
    seriesFails = true;
    const st = await runImport(src(), 'g:2', new MemSink());
    expect([st.live, st.movies, st.series]).toEqual([1, 2, 0]);
    expect(st.vodFailed).toEqual(['series']);
  });

  it('URL de filme e episódio leva a extensão do servidor (mp4 se faltar)', () => {
    const s = { id: 's', kind: 'xtream', name: 'x', server: 'http://h', username: 'a b', password: 'c', refreshHours: 0, createdAt: 0, updatedAt: 0 } as Source;
    const base0 = { id: '', gk: '', order: 0, num: 0, name: '', q: '', group: '' };
    expect(streamUrl({ ...base0, kind: 'movie', xid: 10, ext: 'mkv' }, s)).toBe('http://h/movie/a%20b/c/10.mkv');
    expect(streamUrl({ ...base0, kind: 'series', xid: 5 }, s)).toBe('http://h/series/a%20b/c/5.mp4');
  });
});
