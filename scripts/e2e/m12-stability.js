// Marco 12: sessão longa de zapping com memória monitorada.
// E2E_ZAPS (padrão 200) trocas com CH+, E2E_DWELL_MS (padrão 3000) em cada canal.
// Usa a lista ativa; com o mock rode antes setup-mock-list (lista-epg.m3u).
window.__E2E__ = (async () => {
  const { press, sleep, activate, until, dialog } = T;
  const zaps = Number(window.__ZAPS__ || 200);
  const dwell = Number(window.__DWELL_MS__ || 3000);
  const out = [];
  const check = (step, cond, got) => out.push({ ok: !!cond, step, got });
  const q = (s) => document.querySelector(s);
  const P = () => (window.__orbitaPlayer ? window.__orbitaPlayer() : null);
  const mem = () => {
    const m = performance.memory || {};
    return { mb: +(m.usedJSHeapSize / 1048576).toFixed(1), dom: document.getElementsByTagName('*').length };
  };
  await until(() => q('.sb-item') && !dialog(), 20000);
  await activate('TV ao vivo');
  await until(() => q('.vl-cats .vl-row .cat-label'), 30000);
  // a TV ao vivo reabre na última categoria (pode ser o Histórico vazio): vai para "Todos"
  press('left'); await sleep(200);
  for (let i = 0; i < 20 && !/Todos os canais/.test(q('.vl-cats .vl-row.sel') ? q('.vl-cats .vl-row.sel').textContent : ''); i++) { press('down'); await sleep(80); }
  press('ok');
  await until(() => q('.vl-chans .vl-row.sel .cr-name') && q('.vl-chans .vl-row.sel .cr-name').textContent, 30000);
  await sleep(300);
  if (!q('.vl-chans.is-focused')) { press('right'); await sleep(200); }
  press('ok');
  await until(() => P() && ['playing', 'failed'].indexOf(P().session.status) >= 0, 30000);
  await sleep(2000);

  const samples = [Object.assign({ zap: 0 }, mem())];
  let playing = 0;
  let failed = 0;
  let stuck = 0;
  const t0 = Date.now();
  for (let i = 1; i <= zaps; i++) {
    press('chUp');
    await sleep(dwell);
    const st = P() ? P().session.status : 'fechado';
    if (st === 'playing') playing++;
    else if (st === 'failed') failed++;
    else stuck++;
    if (!P()) break;
    if (i % 20 === 0) samples.push(Object.assign({ zap: i, st }, mem()));
  }
  // dá tempo do último canal assentar e mede de novo
  await sleep(5000);
  const end = Object.assign({ zap: 'fim' }, mem());
  samples.push(end);
  const first = samples[1] || samples[0];
  const growth = +(end.mb - first.mb).toFixed(1);
  check('player continua aberto depois de ' + zaps + ' trocas', !!P(), P() && P().session.status);
  check('maioria dos canais tocou dentro do tempo', playing >= zaps * 0.7, { playing, failed, stuck });
  check('heap não cresce mais que 15 MB na sessão', growth < 15, growth);
  check('DOM estável (sem acúmulo de nós)', end.dom - first.dom < 200, [first.dom, end.dom]);
  // o 1º Voltar pode só esconder o OSD
  for (let i = 0; i < 3 && P(); i++) { press('back'); await sleep(1000); }
  check('sai do player normalmente', !P(), null);
  await activate('Início').catch(() => {});
  out.push({ ok: true, step: 'métricas', got: { duracaoMin: +((Date.now() - t0) / 60000).toFixed(1), playing, failed, stuck, crescimentoMB: growth, samples } });
  return out;
})();
