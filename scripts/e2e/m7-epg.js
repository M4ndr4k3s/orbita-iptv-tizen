// Marco 7: guia (EPG) e mini janela. Antes rode setup-mock-list com
// E2E_MOCKPATH=/lista-epg.m3u E2E_MOCKNAME=mock-epg (a lista indica o guia .gz no cabeçalho).
window.__E2E__ = (async () => {
  const { press, sleep, activate, until, dialog } = T;
  const out = [];
  const metrics = {};
  const check = (step, cond, got) => out.push({ ok: !!cond, step, got });
  const q = (s) => document.querySelector(s);
  const txt = (s) => (q(s) ? q(s).textContent.trim() : '');
  const sel = () => txt('.vl-chans .vl-row.sel .cr-name');
  const P = () => (window.__orbitaPlayer ? window.__orbitaPlayer() : null);
  await until(() => document.querySelector('.sb-item') && !dialog(), 20000);
  // fecha teclado/diálogo que tenha sobrado
  for (let i = 0; i < 2 && document.querySelector('.kb-key'); i++) { press('back'); await sleep(300); }

  await activate('TV ao vivo');
  await until(() => sel(), 20000);
  // vai para "Todos os canais", canal 1
  press('left'); await sleep(150);
  for (let i = 0; i < 20 && !/Todos os canais/.test(txt('.vl-cats .vl-row.sel')); i++) { press('down'); await sleep(60); }
  press('ok'); await sleep(800);
  for (let i = 0; i < 40 && sel() !== 'Canal de Teste 1'; i++) { press('up'); await sleep(40); }
  check('canal 1 selecionado', sel() === 'Canal de Teste 1', sel());

  // guia baixa em segundo plano depois da importação: mexe a seleção para reconsultar
  const t0 = Date.now();
  // (até 2 min; o until dos helpers não aceita função assíncrona)
  while (!q('.lp-epg .epg-now') && Date.now() - t0 < 120000) {
    press('down'); await sleep(400); press('up'); await sleep(900);
  }
  metrics.ateGuiaMs = Date.now() - t0;
  check('painel mostra "Agora" do guia', !!q('.lp-epg .epg-now'), txt('.lp-epg'));
  check('título decodificado (&amp; → &) e do canal certo', /& Cia \(canal 1\)/.test(txt('.lp-epg .epg-now .epg-title')), txt('.lp-epg .epg-now .epg-title'));
  check('mostra "A seguir"', !!q('.lp-epg .epg-next'), txt('.lp-epg .epg-next'));
  const w = q('.epg-bar-fill') ? parseFloat(q('.epg-bar-fill').style.width) : -1;
  check('barra de progresso entre 0 e 100%', w >= 0 && w <= 100, w);

  press('down'); await sleep(1200);
  check('canal 2 casa com o guia pelo nome ("… HD")', /\(canal 2\)/.test(txt('.lp-epg .epg-now .epg-title')), txt('.lp-epg'));
  press('up'); await sleep(400);

  // mini janela
  const tp = Date.now();
  await until(() => q('.lp-video.live'), 40000);
  metrics.miniJanelaMs = Date.now() - tp;
  check('mini janela toca o canal selecionado', !!q('.lp-video.live') && document.body.classList.contains('preview'), q('.lp-video').className);

  // rolagem com o vídeo na janela: tempo entre quadros
  const frames = [];
  let last = performance.now();
  let run = true;
  const tick = (ts) => { frames.push(ts - last); last = ts; if (run) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  for (let i = 0; i < 20; i++) { press('down'); await sleep(120); }
  run = false;
  frames.sort((a, b) => a - b);
  metrics.rolagemComPreviaP50Ms = Math.round(frames[Math.floor(frames.length / 2)]);
  metrics.rolagemComPreviaP95Ms = Math.round(frames[Math.floor(frames.length * 0.95)]);
  check('rolagem com prévia: p95 < 50 ms por quadro', metrics.rolagemComPreviaP95Ms < 50, metrics);
  check('rolando: janela não mostra o vídeo do canal antigo', !q('.lp-video.live'), q('.lp-video').className);
  for (let i = 0; i < 40 && sel() !== 'Canal de Teste 1'; i++) { press('up'); await sleep(60); }
  await until(() => q('.lp-video.live'), 40000);

  // OK: tela cheia sem reabrir o stream
  const seen = [];
  const tf = Date.now();
  press('ok');
  await until(() => P(), 5000);
  check('OK abre a tela cheia', !!P(), txt('.is-focused'));
  if (!P()) return out;
  for (let i = 0; i < 15; i++) { seen.push(P() ? P().session.status : '-'); await sleep(100); }
  metrics.telaCheiaMs = Date.now() - tf;
  check('tela cheia continua o stream da janela (sem reconectar)', seen.every((s) => s === 'playing'), seen.join(','));
  press('info'); await sleep(1200);
  check('OSD mostra o programa atual', /\(canal 1\)/.test(txt('.osd-epg')), txt('.osd-epg'));

  // Voltar: vídeo encolhe para a janela, sem reabrir
  press('back');
  await until(() => !P(), 5000);
  await sleep(500);
  check('ao voltar, a janela continua tocando', !!q('.lp-video.live') && document.body.classList.contains('preview'), q('.lp-video').className);

  // modo Guia
  press('back'); await sleep(300);
  await activate('Guia');
  await until(() => document.querySelectorAll('.lp-epg.guide .epg-item').length >= 5, 20000);
  check('Guia lista a programação do canal', document.querySelectorAll('.lp-epg.guide .epg-item').length >= 5, document.querySelectorAll('.lp-epg.guide .epg-item').length);
  check('Guia destaca o programa no ar', document.querySelectorAll('.lp-epg.guide .epg-item.on').length === 1, null);

  // sair da TV ao vivo para a janela
  await activate('Início');
  await sleep(500);
  check('fora da TV ao vivo, a janela para', !document.body.classList.contains('preview'), document.body.className);

  out.push({ ok: true, step: 'métricas', got: metrics });
  return out;
})();
