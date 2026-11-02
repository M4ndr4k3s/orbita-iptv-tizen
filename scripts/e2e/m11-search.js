// Marco 11: busca global (canais, filmes, séries e guia).
// Antes rode setup-mock-list com E2E_MOCKPATH=/lista-epg.m3u E2E_MOCKNAME=mock-epg
// (o guia dessa lista tem "Programa N & Cia (canal N)"). E2E_TERM troca o termo
// para medir com outra lista; aí só os checks genéricos valem.
window.__E2E__ = (async () => {
  const { press, sleep, type, activate, until, dialog, screen } = T;
  const term = window.__TERM__ || 'canal 12';
  const mock = !window.__TERM__;
  delete window.__TERM__; // a variável fica na página entre rodadas
  const out = [];
  const metrics = {};
  const check = (step, cond, got) => out.push({ ok: !!cond, step, got });
  const q = (s) => document.querySelector(s);
  const all = (s) => [...document.querySelectorAll(s)];
  const txt = (s) => (q(s) ? q(s).textContent.trim() : '');
  const P = () => (window.__orbitaPlayer ? window.__orbitaPlayer() : null);
  await until(() => q('.sb-item') && !dialog(), 20000);

  await activate('Pesquisar');
  await until(() => q('.kb-grid'), 5000);
  check('abre Pesquisar com o teclado aberto', screen() === 'Pesquisar' && !!q('.kb-grid'), screen());
  type(term); press('green');
  const t0 = Date.now();
  await until(() => /resultados|Nada encontrado/.test(txt('.search .screen-sub')) && txt('.search .screen-sub').indexOf(term) >= 0, 120000);
  metrics.buscaMs = window.__orbitaSearchMs;
  metrics.partes = window.__orbitaSearchParts;
  metrics.telaMs = Date.now() - t0;
  metrics.status = txt('.search .screen-sub');
  metrics.secoes = all('.search-sec').map((e) => e.textContent);
  check('mostra resultados agrupados por seção', all('.search-sec').length > 0 && all('.search-row').length > 0, metrics.secoes);
  check('foco no primeiro resultado', q('.search-row.is-focused') === q('.search-row'), null);
  if (mock) {
    check('acha o canal pelo nome', all('.search-row .search-name').some((e) => /Canal de Teste 12$/.test(e.textContent)), metrics.secoes);
    check('acha programas do guia do canal', /Na programação \((\d+)\)/.test(metrics.secoes.join()) && all('.search-row .search-meta').some((e) => /Canal de Teste 12/.test(e.textContent) && /No ar|\d\d:\d\d/.test(e.textContent)), metrics.secoes);
  }

  // ↓ anda e a lista rola junto
  for (let i = 0; i < 12; i++) { press('down'); await sleep(80); }
  const f = q('.search-row.is-focused');
  const body = q('.search-body').getBoundingClientRect();
  const fr = f ? f.getBoundingClientRect() : null;
  check('item focado continua visível ao rolar', fr && fr.top >= body.top - 1 && fr.bottom <= body.bottom + 1, fr && [Math.round(fr.top), Math.round(body.top), Math.round(fr.bottom), Math.round(body.bottom)]);

  // abre o primeiro canal e volta
  for (let i = 0; i < 20; i++) { press('up'); await sleep(50); }
  const firstLive = all('.search-row').find((r) => r.previousElementSibling && /Canais/.test(r.previousElementSibling.textContent));
  if (firstLive) {
    firstLive.click();
    await until(() => P() && ['playing', 'failed'].indexOf(P().session.status) >= 0, 30000);
    check('OK no canal abre o player', !!P(), P() && P().session.status);
    press('back');
    await until(() => !P(), 5000);
    check('Voltar retorna aos resultados', !P() && all('.search-row').length > 0 && screen() === 'Pesquisar', screen());
  } else check('tem canal nos resultados', !mock, null);

  // nova busca sem resultado
  q('.search .live-head-actions .btn').click();
  await until(() => q('.kb-grid'), 3000);
  type('zzqx'); press('green');
  await until(() => /Nada encontrado para "zzqx"/.test(txt('.search .screen-sub')), 60000);
  metrics.buscaMs2 = window.__orbitaSearchMs; // 2ª busca: índices já em memória
  metrics.partes2 = window.__orbitaSearchParts;
  check('busca sem resultado avisa', /Nada encontrado/.test(txt('.search .screen-sub')) && !q('.search-row'), txt('.search .screen-sub'));
  await activate('Início');
  out.push({ ok: true, step: 'métricas', got: metrics });
  return out;
})();
