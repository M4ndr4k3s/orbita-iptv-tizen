// Servidor IPTV de TESTE (desenvolvimento). Não é fonte de conteúdo real:
// responde formatos M3U/Xtream para exercitar o app na TV e no preview.
// Uso: node scripts/mock-iptv.mjs [porta]   (escuta na rede local para a TV alcançar)
//
// Credenciais fictícias de teste:  teste / teste123  (ativa)
//                                  vencido / teste123 (status Expired)
// Rotas:
//   /lista.m3u          lista pequena (MOCK_CHANNELS, padrão 30)
//   /grande.m3u?n=N     lista sintética grande (padrão 100000), enviada em pedaços
//   /pagina.html        não é M3U        /lento.m3u   responde após 40 s
//   /epg.xml?n=N  /epg.xml.gz?n=N   guia XMLTV sintético (programas de 30 min, -2 h a +24 h)
//   /xmltv.php          guia da conta Xtream (mesmas credenciais)
//   /lista-epg.m3u      lista pequena com url-tvg no cabeçalho apontando para /epg.xml.gz
//   VOD Xtream: get_vod_categories/streams/info, get_series_categories/series/info; /movie|series/u/p/id.ext → HLS público
//   /player_api.php     login + get_live_categories + get_live_streams (n= via usuário "teste100k" = 100 mil)
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { networkInterfaces } from 'node:os';

const PORT = Number(process.argv[2] || 8090);
const N_CHANNELS = Number(process.env.MOCK_CHANNELS || 30);
const BIG = 100000;

// streams públicos de teste de players (Mux / Apple) — livres para teste
const STREAMS = [
  'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
];
const GROUPS = ['Teste Notícias', 'Teste Esportes', 'Teste Filmes', 'Teste Infantil', 'Teste Documentários', 'Teste Música'];

function m3uLine(i) {
  const g = GROUPS[i % GROUPS.length] + ' ' + (Math.floor(i / 2000) + 1);
  // a cada 10 itens um "filme" e a cada 25 um "episódio", como listas reais misturam
  const kind = i % 25 === 0 ? 'series' : i % 10 === 0 ? 'movie' : 'live';
  const url = kind === 'live' ? `${STREAMS[i % 2]}?ch=${i}` : `http://mock.invalid/${kind}/u/p/${i}.mp4`;
  return `#EXTINF:-1 tvg-id="teste${i}" tvg-name="Canal de Teste ${i}" tvg-logo="http://mock.invalid/logo/${i % 50}.png" group-title="${g}",Canal de Teste ${i}\n${url}\n`;
}

function smallM3u() {
  let s = '#EXTM3U\n';
  for (let i = 1; i <= N_CHANNELS; i++) {
    const g = i % 3 === 0 ? 'Teste Esportes' : i % 3 === 1 ? 'Teste Notícias' : 'Teste Filmes';
    s += `#EXTINF:-1 tvg-id="teste${i}" tvg-name="Canal de Teste ${i}" group-title="${g}",Canal de Teste ${i}\n${STREAMS[i % STREAMS.length]}\n`;
  }
  return s;
}

// envia em blocos para simular download real (e não montar 20 MB de uma vez)
function streamBig(res, n, lineFn, head = '', tail = '') {
  res.write(head);
  let i = 1;
  const tick = () => {
    let s = '';
    for (let k = 0; k < 2000 && i <= n; k++, i++) s += lineFn(i, i === n);
    if (i <= n) {
      if (res.write(s)) setImmediate(tick);
      else res.once('drain', tick);
    } else res.end(s + tail);
  };
  tick();
}

// XMLTV de teste: canal 2 só casa pelo nome ("Canal de Teste 2 HD"), para testar o casamento por nome
function xmltv(n) {
  const pad = (x) => String(x).padStart(2, '0');
  const fmt = (ms) => {
    const d = new Date(ms);
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00 +0000';
  };
  const slot = 30 * 60000;
  const t0 = Math.floor(Date.now() / slot) * slot - 4 * slot;
  const parts = ['<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="mock">\n'];
  for (let i = 1; i <= n; i++) {
    const id = i === 2 ? 'outro-id-2' : 'teste' + i;
    parts.push(`<channel id="${id}"><display-name lang="pt">Canal de Teste ${i}${i === 2 ? ' HD' : ''}</display-name></channel>\n`);
  }
  for (let i = 1; i <= n; i++) {
    const id = i === 2 ? 'outro-id-2' : 'teste' + i;
    for (let k = 0; k < 52; k++) {
      const st = t0 + k * slot;
      parts.push(`<programme start="${fmt(st)}" stop="${fmt(st + slot)}" channel="${id}"><title lang="pt">Programa ${k + 1} &amp; Cia (canal ${i})</title><desc lang="pt"><![CDATA[Descrição do programa ${k + 1} <teste>]]></desc></programme>\n`);
    }
  }
  parts.push('</tv>\n');
  return parts.join('');
}

function auth(username, password) {
  if (password !== 'teste123' || !['teste', 'vencido', 'teste100k'].includes(username)) return { user_info: { auth: 0 } };
  return {
    user_info: {
      username, auth: 1, status: username === 'vencido' ? 'Expired' : 'Active',
      exp_date: String(Math.floor(Date.now() / 1000) + 30 * 86400), is_trial: '0', active_cons: '0', max_connections: '1',
    },
    server_info: { url: 'mock', port: String(PORT), server_protocol: 'http', timezone: 'America/Sao_Paulo' },
  };
}

createServer((req, res) => {
  const u = new URL(req.url || '/', 'http://x');
  // CORS liberado só porque o preview roda em outra origem (localhost:5173); é um mock de teste
  const send = (code, type, body) => {
    res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
    res.end(body);
  };
  const p = u.searchParams;
  console.log(new Date().toLocaleTimeString(), req.method, u.pathname, p.get('action') || '', p.has('password') ? '(com credenciais)' : '');
  if (u.pathname === '/lista.m3u') return send(200, 'audio/x-mpegurl; charset=utf-8', smallM3u());
  if (u.pathname === '/player.m3u') {
    // 1 e 2 tocam (streams públicos de teste); 3 é quebrado (404 neste mock); 4 toca
    const here = 'http://' + (req.headers.host || 'localhost:' + PORT);
    const body = '#EXTM3U\n' +
      `#EXTINF:-1 tvg-chno="1" group-title="Player",Teste Mux HLS\n${STREAMS[0]}\n` +
      `#EXTINF:-1 tvg-chno="2" group-title="Player",Teste Apple HLS\n${STREAMS[1]}\n` +
      `#EXTINF:-1 tvg-chno="3" group-title="Player",Canal quebrado\n${here}/naoexiste.ts\n` +
      `#EXTINF:-1 tvg-chno="4" group-title="Player",Teste Mux HLS 2\n${STREAMS[0]}?b=2\n`;
    return send(200, 'audio/x-mpegurl; charset=utf-8', body);
  }
  if (u.pathname === '/grande.m3u') {
    res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    return streamBig(res, Number(p.get('n') || BIG), m3uLine, '#EXTM3U\n');
  }
  if (u.pathname === '/pagina.html') return send(200, 'text/html; charset=utf-8', '<!DOCTYPE html><html><body>não é M3U</body></html>');
  if (u.pathname === '/lento.m3u') return setTimeout(() => send(200, 'audio/x-mpegurl', smallM3u()), 40000);
  if (u.pathname === '/epg.xml') return send(200, 'application/xml; charset=utf-8', xmltv(Number(p.get('n') || N_CHANNELS)));
  if (u.pathname === '/epg.xml.gz') {
    res.writeHead(200, { 'Content-Type': 'application/gzip', 'Access-Control-Allow-Origin': '*' });
    return res.end(gzipSync(xmltv(Number(p.get('n') || N_CHANNELS))));
  }
  if (u.pathname === '/xmltv.php') {
    const a = auth(p.get('username'), p.get('password'));
    if (a.user_info.auth !== 1) return send(401, 'text/plain', 'unauthorized');
    return send(200, 'application/xml; charset=utf-8', xmltv(p.get('username') === 'teste100k' ? 2000 : N_CHANNELS));
  }
  if (u.pathname === '/lista-epg.m3u') {
    // URLs distintas por canal (?ch=) para a deduplicação não juntar os canais; continuam tocáveis
    const n = Number(p.get('n') || N_CHANNELS);
    let body = `#EXTM3U url-tvg="http://${req.headers.host}/epg.xml.gz?n=${n}"
`;
    for (let i = 1; i <= n; i++) {
      body += `#EXTINF:-1 tvg-id="teste${i}" group-title="Teste EPG",Canal de Teste ${i}
${STREAMS[i % STREAMS.length]}?ch=${i}
`;
    }
    return send(200, 'audio/x-mpegurl; charset=utf-8', body);
  }
  if (u.pathname === '/player_api.php') {
    const a = auth(p.get('username'), p.get('password'));
    const action = p.get('action');
    if (!action || a.user_info.auth !== 1) return send(200, 'application/json', JSON.stringify(a));
    const n = p.get('username') === 'teste100k' ? BIG : N_CHANNELS;
    if (action === 'get_live_categories') {
      const cats = Array.from({ length: Math.ceil(n / 2000) }, (_, i) => ({ category_id: String(i + 1), category_name: 'Categoria de Teste ' + (i + 1), parent_id: 0 }));
      return send(200, 'application/json', JSON.stringify(cats));
    }
    if (action === 'get_live_streams') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      const item = (i, last) => JSON.stringify({
        num: i, name: 'Canal de Teste ' + i, stream_type: 'live', stream_id: i, stream_icon: 'http://mock.invalid/logo/' + (i % 50) + '.png',
        epg_channel_id: 'teste' + i, added: '1700000000', category_id: String(Math.floor((i - 1) / 2000) + 1), tv_archive: i % 7 === 0 ? 1 : 0, tv_archive_duration: i % 7 === 0 ? 3 : 0,
      }) + (last ? '' : ',');
      return streamBig(res, n, item, '[', ']');
    }
    // VOD de teste: 3 categorias, 60 filmes, 12 séries com 2 temporadas de 4 episódios
    const VOD = 60;
    const SERIES = 12;
    if (action === 'get_vod_categories' || action === 'get_series_categories') {
      const pre = action === 'get_vod_categories' ? 'Filmes de Teste ' : 'Séries de Teste ';
      return send(200, 'application/json', JSON.stringify([1, 2, 3].map((i) => ({ category_id: String(100 + i), category_name: pre + i }))));
    }
    if (action === 'get_vod_streams') {
      return send(200, 'application/json', JSON.stringify(Array.from({ length: VOD }, (_, k) => ({
        num: k + 1, name: 'Filme de Teste ' + (k + 1), stream_type: 'movie', stream_id: 5000 + k, stream_icon: '', rating: String((k % 9) + 1) + '.5',
        category_id: String(101 + (k % 3)), container_extension: 'm3u8',
      }))));
    }
    if (action === 'get_vod_info') {
      const id = Number(p.get('vod_id'));
      return send(200, 'application/json', JSON.stringify({
        info: { plot: 'Sinopse do filme de teste ' + id + ' <b>sem HTML</b>.', genre: 'Teste', cast: 'Elenco de Teste', releasedate: '2024-05-01', duration_secs: 634, rating: '7.5' },
        movie_data: { stream_id: id, container_extension: 'm3u8' },
      }));
    }
    if (action === 'get_series') {
      return send(200, 'application/json', JSON.stringify(Array.from({ length: SERIES }, (_, k) => ({
        num: k + 1, name: 'Série de Teste ' + (k + 1), series_id: 700 + k, cover: '', rating: '8', category_id: String(101 + (k % 3)), plot: 'Série de teste',
      }))));
    }
    if (action === 'get_series_info') {
      const sid = Number(p.get('series_id'));
      const episodes = {};
      for (const season of [1, 2]) {
        episodes[season] = [1, 2, 3, 4].map((e) => ({
          id: String(sid * 100 + season * 10 + e), episode_num: e, season, title: `Episódio ${e} da temporada ${season}`, container_extension: 'm3u8',
          info: { plot: 'Episódio de teste', duration_secs: 634 },
        }));
      }
      return send(200, 'application/json', JSON.stringify({ info: { name: 'Série ' + sid, plot: 'Sinopse da série de teste', genre: 'Teste', rating: '8' }, episodes, seasons: [] }));
    }
    return send(200, 'application/json', '[]');
  }
  // reprodução de VOD de teste: redireciona para um HLS público de teste (Mux)
  if (/^\/(movie|series)\/[^/]+\/[^/]+\/\d+\.\w+$/.test(u.pathname)) {
    res.writeHead(302, { Location: STREAMS[0] });
    return res.end();
  }
  send(404, 'text/plain', 'not found');
}).listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`mock IPTV de teste na porta ${PORT}: ${ips.map((ip) => `http://${ip}:${PORT}`).join('  ')}`);
});
