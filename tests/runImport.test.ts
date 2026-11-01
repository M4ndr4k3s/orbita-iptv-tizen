import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { runImport, ImportError } from '../src/playlist/runImport';
import type { ImportSink } from '../src/playlist/importer';
import type { Channel, Group } from '../src/playlist/model';

class MemSink implements ImportSink {
  channels: Channel[] = [];
  groups: Group[] = [];
  async putChannels(b: Channel[]) { this.channels.push(...b); }
  async putGroups(g: Group[]) { this.groups.push(...g); }
}

let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://x');
    if (u.pathname === '/big.m3u') {
      // envia em vários pedaços para exercitar o stream
      res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' });
      res.write('#EXTM3U\n');
      let i = 0;
      const tick = () => {
        let s = '';
        for (let k = 0; k < 1000 && i < 5000; k++, i++) s += `#EXTINF:-1 group-title="G${i % 7}",Canal ${i}\nhttp://s/live/${i}.ts\n`;
        if (i < 5000) { res.write(s); setImmediate(tick); } else res.end(s);
      };
      return tick();
    } else if (u.pathname === '/page.html') {
      return res.end('<html>login</html>');
    } else if (u.pathname === '/hang.m3u') {
      res.writeHead(200);
      return res.write('#EXTM3U\n'); // e nunca termina
    } else if (u.pathname === '/player_api.php') {
      const action = u.searchParams.get('action');
      if (u.searchParams.get('password') !== 'p w&') return res.end('{"user_info":{"auth":0}}');
      if (action === 'get_live_categories') return res.end(JSON.stringify([{ category_id: '1', category_name: 'Notícias' }, { category_id: '2', category_name: 'Esportes' }]));
      if (action === 'get_live_streams') {
        const items = Array.from({ length: 3000 }, (_, i) => ({ num: i + 1, name: 'C' + i, stream_id: i + 1, category_id: String((i % 2) + 1) }));
        return res.end(JSON.stringify(items));
      }
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe('runImport', () => {
  it('importa M3U grande em stream', async () => {
    const sink = new MemSink();
    const progress: number[] = [];
    const st = await runImport({ kind: 'm3u', url: base + '/big.m3u' }, 'a:1', sink, { onProgress: (p) => progress.push(p.items) });
    expect(st.live).toBe(5000);
    expect(st.groups).toBe(7);
    expect(sink.channels).toHaveLength(5000);
    expect(progress[progress.length - 1]).toBe(5000);
    expect(st.bytes).toBeGreaterThan(100000);
  });

  it('rejeita conteúdo que não é M3U', async () => {
    await expect(runImport({ kind: 'm3u', url: base + '/page.html' }, 'a:2', new MemSink())).rejects.toMatchObject({ code: 'notM3u' });
  });

  it('importa Xtream ao vivo com categorias na ordem do servidor (senha com espaço e &)', async () => {
    const sink = new MemSink();
    const st = await runImport({ kind: 'xtream', server: base, username: 'u', password: 'p w&' }, 'x:1', sink);
    expect(st.live).toBe(3000);
    expect(sink.groups.map((g) => g.name)).toEqual(['Notícias', 'Esportes']);
    expect(sink.channels[0]).toMatchObject({ xid: 1, group: 'Notícias' });
  });

  it('Xtream com credencial recusada vira badResponse', async () => {
    await expect(runImport({ kind: 'xtream', server: base, username: 'u', password: 'x' }, 'x:2', new MemSink())).rejects.toMatchObject({ code: 'badResponse' });
  });

  it('cancelamento interrompe download pendurado', async () => {
    const ctrl = new AbortController();
    const p = runImport({ kind: 'm3u', url: base + '/hang.m3u' }, 'a:3', new MemSink(), { signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 200);
    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect(['aborted', 'network']).toContain(err.code);
  });
});
