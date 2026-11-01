// Marco 5: player. Parte A usa a lista ativa (a lista de teste real); parte B
// usa /player.m3u do mock (streams públicos + um canal quebrado).
// Requer build de teste (__orbitaPlayer) e o mock: E2E_MOCK=http://<ip-do-pc>:8097
window.__E2E__ = (async () => {
  const MOCK = window.__MOCK__;
  const { press, sleep, screen, dialog, type, activate, until, afterImport } = T;
  const out = [];
  const metrics = {};
  const check = (step, cond, got) => out.push({ ok: !!cond, step, got });
  const P = () => (window.__orbitaPlayer ? window.__orbitaPlayer() : null);
  const status = () => (P() ? P().session.status : 'sem player');
  // identidade do canal: itens dos recentes/favoritos não têm posição (order = 0)
  const chId = (c) => c.num + '|' + c.name;
  const heapMB = () => +(performance.memory.usedJSHeapSize / 1048576).toFixed(1);
  const waitSettled = (ms = 45000) => until(() => ['playing', 'failed'].indexOf(status()) >= 0, ms);
  // canais reais podem estar fora do ar: avança até achar um que toque
  const findPlaying = async (tries = 6) => {
    for (let i = 0; i < tries; i++) {
      await waitSettled();
      if (status() === 'playing') return true;
      press('chUp'); await sleep(600);
    }
    return status() === 'playing';
  };

  await until(() => document.querySelector('.sb-item') && !dialog(), 20000);

  // ── A) lista real ──
  await activate('Início');
  const t0 = Date.now();
  await activate('Assistir TV');
  check('abre o player', !!P() && document.body.classList.contains('playing'), P());
  check('menu lateral escondido em tela cheia', document.querySelector('.sidebar').offsetParent === null, null);
  const okA = await findPlaying();
  check('toca um canal da lista real (AVPlay)', okA && P().engine === 'avplay', P());
  metrics.primeiroQuadroMs = P().session.firstFrameMs;
  metrics.abrirAteTocarMs = Date.now() - t0;
  metrics.stream = P().info;

  // CH+ e medição da troca
  const before = P().channel;
  const tz = Date.now();
  press('chUp');
  await until(() => chId(P().channel) !== chId(before), 5000);
  check('CH+ troca de canal', chId(P().channel) !== chId(before), [before, P().channel]);
  await waitSettled();
  metrics.trocaCanalMs = Date.now() - tz;
  metrics.trocaStatus = status();

  // CH+ rápido 2x: só abre o último (debounce). 2 e não 3: nos recentes a lista pode ter 3 itens e dar a volta
  const b3 = chId(P().channel);
  press('chUp'); await sleep(120); press('chUp');
  await sleep(1500);
  check('3 trocas rápidas mudam o canal', chId(P().channel) !== b3, [b3, P().channel]);
  await waitSettled();

  // CH− volta
  const bm = chId(P().channel);
  press('chDown');
  await until(() => chId(P().channel) !== bm, 5000);
  check('CH− troca de canal', chId(P().channel) !== bm, P().channel);
  await waitSettled();

  // número pelo controle
  press(49); // dígito 1
  await sleep(200);
  check('dígito aparece na tela', !document.querySelector('.osd-digits').classList.contains('hidden'), document.querySelector('.osd-digits').textContent);
  await sleep(2000);
  check('número 1 leva ao canal 1', P().channel.num === 1, P().channel);
  await waitSettled();

  // OSD liga/desliga
  press('info'); await sleep(300);
  const v1 = P().osdVisible;
  press('info'); await sleep(300);
  check('Info alterna as informações', v1 !== P().osdVisible, [v1, P().osdVisible]);

  // pausa
  if (status() === 'playing') {
    press('playPause'); await sleep(800);
    check('Play/Pause pausa', status() === 'paused', status());
    press('playPause'); await sleep(2500);
    check('Play/Pause retoma', status() === 'playing' || status() === 'buffering', status());
  }

  // estabilidade: 15 trocas seguidas
  const h0 = heapMB();
  for (let i = 0; i < 15; i++) {
    press(i % 2 ? 'chDown' : 'chUp');
    await sleep(700);
    await waitSettled(30000);
  }
  metrics.heapAntes15Trocas = h0;
  metrics.heapDepois15Trocas = heapMB();
  check('15 trocas sem crescer heap mais que 5 MB', heapMB() - h0 < 5, [h0, heapMB()]);

  metrics.estadoAntesDoBack = [status(), P() && P().error];
  press('back'); await sleep(600);
  check('Back sai do player e volta à Início', !P() && !document.body.classList.contains('playing') && screen() !== '-', screen());

  // ── B) mock: canal quebrado ──
  await activate('Listas');
  await activate('Adicionar lista');
  const fld = (label) => [...document.querySelectorAll('.tf')].find((f) => f.querySelector('.tf-label').textContent === label);
  fld('Nome').querySelector('.tf-box').click(); await sleep(100); type('player'); press('green'); await sleep(100);
  fld('URL da lista').querySelector('.tf-box').click(); await sleep(100); type(MOCK + '/player.m3u'); press('green'); await sleep(100);
  document.querySelector('.form-actions .btn-primary').click();
  await until(() => screen() === 'Listas', 30000);
  await afterImport();
  const cards = [...document.querySelectorAll('.src-card')];
  cards.find((c) => /player/.test(c.textContent)).click(); await sleep(150);
  await activate('Usar esta lista');
  await activate('Início');
  await activate('Assistir TV');
  await waitSettled();
  check('stream público de teste toca', status() === 'playing', P());
  // vai para o 3 (quebrado)
  press(51); await sleep(2000);
  check('canal 3 selecionado', P().channel.num === 3, P().channel);
  const tf = Date.now();
  let sawRetry = false;
  await until(() => {
    if (status() === 'retrying') sawRetry = true;
    return status() === 'failed';
  }, 90000);
  metrics.ateErroMs = Date.now() - tf;
  check('tentou reconectar antes de desistir', sawRetry, null);
  check('mostra erro claro com ações', status() === 'failed' && /Não foi possível reproduzir/.test(P().error || ''), P().error);
  check('foco no botão Tentar novamente', /Tentar novamente/.test(document.querySelector('.is-focused').textContent), document.querySelector('.is-focused').textContent);
  await activate('Próximo canal');
  await until(() => P().channel.num === 4 && status() !== 'failed', 10000);
  await waitSettled();
  check('Próximo canal sai do erro e toca', status() === 'playing' && P().channel.num === 4, P());
  press('back'); await sleep(500);

  // volta a lista de teste real como ativa e remove a do mock
  await activate('Listas');
  const real = [...document.querySelectorAll('.src-card')].find((c) => !/player/.test(c.textContent));
  real.click(); await sleep(150); await activate('Usar esta lista');
  const mockCard = [...document.querySelectorAll('.src-card')].find((c) => /player/.test(c.textContent));
  mockCard.click(); await sleep(150); await activate('Remover'); await sleep(150);
  [...document.querySelectorAll('.dlg-box .btn')].find((b) => /Remover/.test(b.textContent)).click();
  await sleep(500);

  metrics.heapFinalMB = heapMB();
  out.push({ ok: true, step: 'métricas', got: metrics });
  return out;
})();
