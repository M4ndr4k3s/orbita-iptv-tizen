// Servidor IPTV de TESTE (desenvolvimento). Não é fonte de conteúdo real:
// responde formatos M3U/Xtream para exercitar o app na TV e no preview.
// Uso: node scripts/mock-iptv.mjs [porta]   (escuta na rede local para a TV alcançar)
//
// Credenciais fictícias de teste:  teste / teste123  (ativa)
//                                  vencido / teste123 (status Expired)
// Rotas: /lista.m3u  /pagina.html  /lento.m3u (responde após 40 s)  /player_api.php
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';

const PORT = Number(process.argv[2] || 8090);
const N_CHANNELS = Number(process.env.MOCK_CHANNELS || 30);

// streams públicos de teste de players (Mux / Apple) — livres para teste
const STREAMS = [
  'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
];

function m3u() {
  let s = '#EXTM3U\n';
  for (let i = 1; i <= N_CHANNELS; i++) {
    const g = i % 3 === 0 ? 'Teste Esportes' : i % 3 === 1 ? 'Teste Notícias' : 'Teste Filmes';
    s += `#EXTINF:-1 tvg-id="teste${i}" tvg-name="Canal de Teste ${i}" group-title="${g}",Canal de Teste ${i}\n${STREAMS[i % STREAMS.length]}\n`;
  }
  return s;
}

function auth(username, password) {
  if (password !== 'teste123' || (username !== 'teste' && username !== 'vencido')) return { user_info: { auth: 0 } };
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
  console.log(new Date().toLocaleTimeString(), req.method, u.pathname, u.searchParams.has('password') ? '(com credenciais)' : '');
  if (u.pathname === '/lista.m3u') return send(200, 'audio/x-mpegurl; charset=utf-8', m3u());
  if (u.pathname === '/pagina.html') return send(200, 'text/html; charset=utf-8', '<!DOCTYPE html><html><body>não é M3U</body></html>');
  if (u.pathname === '/lento.m3u') return setTimeout(() => send(200, 'audio/x-mpegurl', m3u()), 40000);
  if (u.pathname === '/player_api.php') {
    return send(200, 'application/json', JSON.stringify(auth(u.searchParams.get('username'), u.searchParams.get('password'))));
  }
  send(404, 'text/plain', 'not found');
}).listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`mock IPTV de teste na porta ${PORT}: ${ips.map((ip) => `http://${ip}:${PORT}`).join('  ')}`);
});
