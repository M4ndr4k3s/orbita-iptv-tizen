// Marco 8: filmes e séries (Xtream). Cadastra a conta de teste do mock (se faltar),
// navega pelas telas, toca um filme com avançar/voltar e retomada, e um episódio.
// Requer E2E_MOCK=http://<ip-do-pc>:8097
window.__E2E__ = (async () => {
  const MOCK = window.__MOCK__;
  const { press, sleep, type, activate, until, afterImport, dialog } = T;
  const out = [];
  const metrics = {};
  const check = (step, cond, got) => out.push({ ok: !!cond, step, got });
  const q = (s) => document.querySelector(s);
  const txt = (s) => (q(s) ? q(s).textContent.trim() : '');
  const V = () => (window.__orbitaVod ? window.__orbitaVod() : null);
  const st = () => (V() ? V().session.status : '-');
  const pos = () => (V() ? V().session.positionMs : -1);
  const fill = async (label, text) => {
    const tf = [...document.querySelectorAll('.tf')].find((f) => f.querySelector('.tf-label').textContent === label);
    tf.querySelector('.tf-box').click(); await sleep(100); type(text); press('green'); await sleep(100);
  };
  const dlgBtn = (re) => [...document.querySelectorAll('.dlg-box .btn')].find((b) => re.test(b.textContent));
  await until(() => document.querySelector('.sb-item') && !dialog(), 20000);

  // ── conta Xtream de teste ──
  await activate('Listas');
  let card = [...document.querySelectorAll('.src-card')].find((c) => c.querySelector('.src-name').textContent === 'mock-xt');
  if (!card) {
    await activate('Adicionar lista');
    await activate('Xtream Codes');
    await fill('Nome', 'mock-xt'); await fill('Servidor', MOCK); await fill('Usuário', 'teste'); await fill('Senha', 'teste123');
    document.querySelector('.form-actions .btn-primary').click();
    const r = await afterImport(120000);
    check('importa canais, filmes e séries', /60 filmes/.test(r || '') && /12 séries/.test(r || ''), r);
    card = [...document.querySelectorAll('.src-card')].find((c) => c.querySelector('.src-name').textContent === 'mock-xt');
  }
  card.click(); await sleep(200);
  const use = dlgBtn(/Usar esta lista/);
  if (use) use.click(); else press('back');
  await sleep(500);

  // ── Filmes ──
  await activate('Filmes');
  await until(() => txt('.vl-chans .vl-row.sel .cr-name'), 15000);
  check('tela de filmes com contagem', /60 filmes/.test(txt('.screen-sub')), txt('.screen-sub'));
  check('categorias: Todos + 3', document.querySelectorAll('.vl-cats .vl-row:not(.hidden)').length === 4, document.querySelectorAll('.vl-cats .vl-row:not(.hidden)').length);
  await until(() => /Sinopse do filme/.test(txt('.vp-plot')), 15000);
  check('detalhes do servidor no painel (sinopse como texto)', /Sinopse do filme de teste 5000 <b>sem HTML<\/b>/.test(txt('.vp-plot')), txt('.vp-plot'));
  check('ano, duração e nota', /2024/.test(txt('.vp-meta')) && /10 min/.test(txt('.vp-meta')) && /Nota 7\.5/.test(txt('.vp-meta')), txt('.vp-meta'));
  // categoria filtra só filmes dela
  press('left'); await sleep(100); press('down'); await sleep(900);
  check('categoria 1 tem 20 filmes', /20/.test(txt('.vl-cats .vl-row.sel .cat-count')), txt('.vl-cats .vl-row.sel'));
  press('up'); await sleep(600); press('right'); await sleep(200);

  // ── tocar filme ──
  const t0 = Date.now();
  press('ok');
  // posição guardada de uma rodada interrompida: começa do início
  await until(() => (V() && st() !== 'idle') || /Continuar assistindo/.test(dialog() || ''), 10000);
  if (/Continuar assistindo/.test(dialog() || '')) { dlgBtn(/Começar do início/).click(); await sleep(300); }
  await until(() => V() && st() === 'playing', 40000);
  metrics.filmeAteTocarMs = Date.now() - t0;
  check('filme toca', st() === 'playing', V());
  await until(() => V().durationMs > 0, 10000);
  metrics.duracaoMs = V().durationMs;
  check('duração conhecida', V().durationMs > 0, V().durationMs);
  await sleep(2000);
  const p0 = pos();
  press('right'); await sleep(150); press('right'); await sleep(150); press('right');
  await sleep(3500);
  check('→ 3x avança ~30 s', pos() - p0 >= 25000, [p0, pos()]);
  const p1 = pos();
  press('ff'); await sleep(3500);
  check('Avançar pula ~1 min', pos() - p1 >= 55000, [p1, pos()]);
  const p2 = pos();
  press('left'); await sleep(3000);
  check('← volta ~10 s', p2 - pos() >= 5000 && p2 - pos() <= 15000, [p2, pos()]);
  press('playPause'); await sleep(800);
  check('pausa', st() === 'paused', st());
  const saved = pos();
  press('playPause'); await sleep(1500);
  check('retoma', st() === 'playing' || st() === 'buffering', st());
  press('back');
  await until(() => !V(), 5000);
  await sleep(600);
  check('painel mostra "Continuar de"', /Continuar de/.test(txt('.vp-resume')), txt('.vp-resume'));

  // ── retomar ──
  press('ok');
  await until(() => /Continuar assistindo/.test(dialog() || ''), 5000);
  check('pergunta se quer continuar', /Continuar assistindo/.test(dialog() || ''), dialog());
  const cont = dlgBtn(/Continuar de onde parei/);
  if (cont) cont.click();
  await until(() => V() && st() === 'playing', 40000);
  await sleep(1500);
  check('continua de onde parou', Math.abs(pos() - saved) < 15000, [saved, pos()]);
  press('back');
  await until(() => !V(), 5000);
  await sleep(400);

  // ── Séries ──
  await activate('Séries');
  await until(() => txt('.vl-chans .vl-row.sel .cr-name'), 15000);
  check('tela de séries', /12 séries/.test(txt('.screen-sub')), txt('.screen-sub'));
  await sleep(500);
  press('ok');
  await until(() => document.querySelectorAll('.series .vl-chans .vl-row:not(.hidden)').length > 0, 15000);
  check('série: 2 temporadas', document.querySelectorAll('.series .vl-cats .vl-row:not(.hidden)').length === 2, null);
  check('temporada 1: 4 episódios', document.querySelectorAll('.series .vl-chans .vl-row:not(.hidden)').length === 4, null);
  press('down'); await sleep(300);
  check('episódio 2 selecionado', /T1 E2/.test(txt('.series .vl-chans .vl-row.sel')), txt('.series .vl-chans .vl-row.sel'));
  const t1 = Date.now();
  press('ok');
  await until(() => V() && st() === 'playing', 40000);
  metrics.episodioAteTocarMs = Date.now() - t1;
  check('episódio toca', st() === 'playing', V());
  press('back');
  await until(() => !V(), 5000);
  press('back'); await sleep(400);
  await activate('Início');

  metrics.heapMB = +(performance.memory.usedJSHeapSize / 1048576).toFixed(1);
  out.push({ ok: true, step: 'métricas', got: metrics });
  return out;
})();
