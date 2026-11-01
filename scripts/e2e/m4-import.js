// Marco 4: importação de listas grandes (100 mil itens) M3U e Xtream.
// Mede tempo total, heap JS e fluidez da interface DURANTE a importação.
// Requer o mock: node scripts/mock-iptv.mjs 8097 ; E2E_MOCK=http://<ip-do-pc>:8097
// Começa com o banco vazio (o roteiro apaga os dados do app).
window.__E2E__ = (async () => {
  const MOCK = window.__MOCK__;
  const { press, sleep, screen, dialog, type, activate, until } = T;
  const out = [];
  const metrics = {};
  const check = (step, cond, got) => out.push({ ok: !!cond, step, got });
  const heapMB = () => (performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : -1);

  const field = (label) => [...document.querySelectorAll('.tf')].find((f) => f.querySelector('.tf-label').textContent === label);
  const fill = async (label, text) => {
    field(label).querySelector('.tf-box').click(); await sleep(100);
    await activate('Limpar');
    type(text); press('green'); await sleep(100);
  };

  // mede quadros e heap enquanto a importação roda; navega na interface ao mesmo tempo
  // t0: instante do clique em Salvar (inclui teste de conexão + download + gravação)
  const watchImport = async (label, t0) => {
    const frames = [];
    let last = performance.now();
    let peak = heapMB();
    let running = true;
    const longos = [];
    const start = performance.now();
    const raf = (n) => {
      const d = n - last;
      frames.push(d);
      // quadros > 200 ms: instante (s desde o início) e o que o diálogo mostrava
      if (d > 200 && longos.length < 10) longos.push({ s: +((n - start) / 1000).toFixed(1), ms: Math.round(d), tela: (dialog() || '').slice(0, 40) });
      last = n;
      if (running) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
    const mem = setInterval(() => { peak = Math.max(peak, heapMB()); }, 500);
    await until(() => /Lista carregada|Não foi possível carregar/.test(dialog() || ''), 900000);
    running = false;
    clearInterval(mem);
    const total = Date.now() - t0;
    const text = dialog();
    frames.sort((a, b) => a - b);
    // sem quadros = página em segundo plano (navegador pausa o rAF); só a TV mede fluidez
    const fr = (q) => (frames.length ? +frames[Math.min(frames.length - 1, Math.floor(frames.length * q))].toFixed(1) : null);
    metrics[label] = {
      segundos: +(total / 1000).toFixed(1),
      heapPicoMB: peak,
      quadros: frames.length,
      quadroMedioMs: frames.length ? +(frames.reduce((a, b) => a + b, 0) / frames.length).toFixed(1) : null,
      quadroP95Ms: fr(0.95),
      quadroMaxMs: fr(1),
      quadrosLongos: longos,
    };
    press('ok'); await sleep(200);
    return text;
  };

  // contagem total + registro de gerações (varrer o índice de canais é lento demais na TV)
  const countDb = () => new Promise((resolve) => {
    const q = indexedDB.open('orbita');
    q.onsuccess = () => {
      const db = q.result;
      const tx = db.transaction(['channels', 'gens'], 'readonly');
      let channels = 0;
      let generations = 0;
      tx.objectStore('channels').count().onsuccess = (e) => { channels = e.target.result; };
      tx.objectStore('gens').count().onsuccess = (e) => { generations = e.target.result; };
      tx.oncomplete = () => { db.close(); resolve({ channels, generations }); };
    };
  });

  await until(() => document.querySelector('.sb-item') && !dialog(), 20000);
  metrics.heapInicialMB = heapMB();

  // 1) M3U com 100 mil itens
  await activate('Listas');
  await activate('Adicionar lista');
  await fill('Nome', 'grande');
  await fill('URL da lista', MOCK + '/grande.m3u');
  const t1 = Date.now();
  document.querySelector('.form-actions .btn-primary').click();
  await until(() => /Carregando/.test(dialog() || ''), 60000);
  check('progresso de carregamento aparece', /Carregando/.test(dialog() || ''), dialog());
  await until(() => /itens · [\d.]+ MB/.test(dialog() || '') || /Lista carregada/.test(dialog() || ''), 30000);
  const mid = dialog() || '';
  check('progresso mostra itens e MB', /itens · [\d.]+ MB|Lista carregada/.test(mid), mid);
  const r1 = await watchImport('m3u100k', t1);
  check('M3U 100k carregada', /Lista carregada/.test(r1 || ''), r1);
  // gerador do mock: série se i%25==0; filme se i%10==0 (e não série); resto ao vivo
  check('contagem M3U correta (canais/filmes/séries)', /88\.000 canais, 8\.000 filmes e 4\.000 séries/.test(r1 || ''), r1);
  metrics.depoisM3u = await countDb();
  check('100 mil itens gravados numa geração', metrics.depoisM3u.channels === 100000 && metrics.depoisM3u.generations === 1, metrics.depoisM3u);

  // 2) cancelar uma atualização no meio mantém os canais anteriores
  document.querySelector('.src-card').click(); await sleep(150);
  await activate('Atualizar agora');
  await until(() => /\d+ itens/.test(dialog() || ''), 30000);
  const tc = Date.now();
  press('back');
  await until(() => !/Carregando/.test(dialog() || ''), 3000);
  check('cancelamento fecha o progresso em menos de 1 s', !/Carregando/.test(dialog() || '') && Date.now() - tc < 1000, { dialog: dialog(), ms: Date.now() - tc });
  // a geração parcial é apagada em segundo plano depois do aviso: aguarda até 180 s e mede
  const tdel = Date.now();
  let afterCancel = await countDb();
  for (let i = 0; i < 90 && (afterCancel.generations !== 1 || afterCancel.channels !== 100000); i++) {
    await sleep(2000);
    afterCancel = await countDb();
  }
  metrics.limpezaAposCancelarSeg = +((Date.now() - tdel) / 1000).toFixed(1);
  check('após cancelar continuam 100 mil itens e 1 geração', afterCancel.channels === 100000 && afterCancel.generations === 1, afterCancel);

  // 3) Xtream com 100 mil canais ao vivo
  await activate('Adicionar lista');
  await activate('Xtream Codes');
  await fill('Nome', 'xtream grande');
  await fill('Servidor', MOCK);
  await fill('Usuário', 'teste100k');
  await fill('Senha', 'teste123');
  const t2 = Date.now();
  document.querySelector('.form-actions .btn-primary').click();
  const r2 = await watchImport('xtream100k', t2);
  check('Xtream 100k carregada', /Lista carregada/.test(r2 || ''), r2);
  metrics.depoisXtream = await countDb();
  check('200 mil itens, 2 gerações (uma por lista)', metrics.depoisXtream.channels === 200000 && metrics.depoisXtream.generations === 2, metrics.depoisXtream);

  // 4) remover a lista apaga os canais dela
  document.querySelectorAll('.src-card')[1].click(); await sleep(150);
  await activate('Remover'); await sleep(150);
  [...document.querySelectorAll('.dlg-box .btn')].find((b) => /Remover/.test(b.textContent)).click();
  const trm = Date.now();
  metrics.depoisRemover = await countDb();
  for (let i = 0; i < 60 && metrics.depoisRemover.channels !== 100000; i++) {
    await sleep(2000);
    metrics.depoisRemover = await countDb();
  }
  metrics.remocaoSeg = +((Date.now() - trm) / 1000).toFixed(1);
  check('remover lista apaga os 100 mil itens dela', metrics.depoisRemover.channels === 100000 && metrics.depoisRemover.generations === 1, metrics.depoisRemover);

  metrics.heapFinalMB = heapMB();
  metrics.domNodes = document.getElementsByTagName('*').length;
  out.push({ ok: true, step: 'métricas', got: metrics });
  check('tela continua em Listas', screen() === 'Listas', screen());
  return out;
})();
