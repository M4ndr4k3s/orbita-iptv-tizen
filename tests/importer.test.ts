import { describe, it, expect } from 'vitest';
import { ChannelBuilder, type ImportSink } from '../src/playlist/importer';
import { M3uParser } from '../src/playlist/m3uParser';
import type { Channel, Group } from '../src/playlist/model';

class MemSink implements ImportSink {
  channels: Channel[] = [];
  groups: Group[] = [];
  batches = 0;
  async putChannels(b: Channel[]) { this.batches++; this.channels.push(...b); }
  async putGroups(g: Group[]) { this.groups.push(...g); }
}

async function importText(text: string, opts = {}) {
  const sink = new MemSink();
  const b = new ChannelBuilder('src1:g1', sink, opts);
  const p = new M3uParser();
  for (const e of [...p.push(text), ...p.end()]) await b.addM3u(e);
  const stats = await b.finish({ importedAt: Date.now(), bytes: text.length });
  return { sink, stats, b };
}

describe('ChannelBuilder (M3U)', () => {
  const list =
    '#EXTM3U\n' +
    '#EXTINF:-1 tvg-chno="10" tvg-logo="javascript:alert(1)" group-title="Abertos",Canal A\nhttp://s/live/a.ts\n' +
    '#EXTINF:-1 group-title="Abertos",Canal A (cópia)\nhttp://s/live/a.ts\n' +
    '#EXTINF:-1,Sem grupo\nhttp://s/live/b.ts\n' +
    '#EXTINF:-1 group-title="Filmes",Um Filme\nhttp://s/movie/u/p/1.mp4\n' +
    '#EXTINF:-1 group-title="Séries",Ep 1\nhttp://s/series/u/p/2.mkv\n' +
    '#EXTINF:-1,Ruim\nfile:///etc/passwd\n';

  it('deduplica por URL, ignora URL inválida e conta por tipo', async () => {
    const { sink, stats } = await importText(list);
    expect(sink.channels.map((c) => c.name)).toEqual(['Canal A', 'Sem grupo', 'Um Filme', 'Ep 1']);
    expect(stats).toMatchObject({ live: 2, movies: 1, series: 1, duplicates: 1, skipped: 1 });
  });

  it('numera ao vivo (tvg-chno ou sequência), ordena ids e descarta logo inseguro', async () => {
    const { sink } = await importText(list);
    const [a, b] = sink.channels;
    expect(a.num).toBe(10);
    expect(b.num).toBe(2);
    expect(a.logo).toBeUndefined();
    expect(a.id < b.id).toBe(true);
    expect(a.q).toBe('canal a');
  });

  it('agrupa por tipo + nome e cria "Sem categoria"', async () => {
    const { sink } = await importText(list);
    expect(sink.groups.map((g) => [g.kind, g.name, g.count])).toEqual([
      ['live', 'Abertos', 1],
      ['live', 'Sem categoria', 1],
      ['movie', 'Filmes', 1],
      ['series', 'Séries', 1],
    ]);
  });

  it('respeita o teto de itens e grava em lotes', async () => {
    let text = '#EXTM3U\n';
    for (let i = 0; i < 2500; i++) text += `#EXTINF:-1,C${i}\nhttp://s/live/${i}.ts\n`;
    const { sink, b } = await importText(text, { batchSize: 1000, maxItems: 2200 });
    expect(sink.channels.length).toBe(2200);
    expect(b.truncated).toBe(true);
    expect(sink.batches).toBe(3);
  });
});

describe('ChannelBuilder (Xtream)', () => {
  it('mapeia stream_id, categoria, EPG, catch-up e ignora ids inválidos/duplicados', async () => {
    const sink = new MemSink();
    const b = new ChannelBuilder('s:g', sink);
    b.declareGroup('live', 'Esportes');
    const cats = (id: string) => ({ '5': 'Esportes' } as Record<string, string>)[id];
    await b.addXtream('live', { num: '3', name: 'ESPN', stream_id: '101', category_id: '5', epg_channel_id: 'espn.br', tv_archive: 1, tv_archive_duration: '7', stream_icon: 'http://l/e.png' }, cats);
    await b.addXtream('live', { name: 'ESPN de novo', stream_id: 101, category_id: '5' }, cats);
    await b.addXtream('live', { name: 'Sem id' }, cats);
    const stats = await b.finish({ importedAt: 0, bytes: 0 });
    expect(sink.channels).toHaveLength(1);
    expect(sink.channels[0]).toMatchObject({ xid: 101, num: 3, group: 'Esportes', tvgId: 'espn.br', archiveDays: 7, logo: 'http://l/e.png' });
    expect(sink.channels[0].url).toBeUndefined();
    expect(stats).toMatchObject({ duplicates: 1, skipped: 1, groups: 1 });
  });
});
