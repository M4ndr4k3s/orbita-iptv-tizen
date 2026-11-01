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
//   /player_api.php     login + get_live_categories + get_live_streams (n= via usuário "teste100k" = 100 mil)
import { createServer } from 'node:http';
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
  if (u.pathname === '/grande.m3u') {
    res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    return streamBig(res, Number(p.get('n') || BIG), m3uLine, '#EXTM3U\n');
  }
  if (u.pathname === '/pagina.html') return send(200, 'text/html; charset=utf-8', '<!DOCTYPE html><html><body>não é M3U</body></html>');
  if (u.pathname === '/lento.m3u') return setTimeout(() => send(200, 'audio/x-mpegurl', smallM3u()), 40000);
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
    return send(200, 'application/json', '[]');
  }
  send(404, 'text/plain', 'not found');
}).listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`mock IPTV de teste na porta ${PORT}: ${ips.map((ip) => `http://${ip}:${PORT}`).join('  ')}`);
});
