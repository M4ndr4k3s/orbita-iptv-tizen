// Marco 6: TV ao vivo com a lista ativa. Navegação na lista virtual, categorias,
// favoritos (amarelo), busca, número, abrir/voltar do player, recentes, fluidez.
// Funciona com qualquer lista ativa que tenha canais ao vivo.
window.__E2E__ = (async () => {
  const { press, sleep, dialog, type, activate, until } = T;
  const out = [];
  const metrics = {};
  const check = (step, cond, got) => out.push({ ok: !!cond, step, got });
  const sel = (list) => {
    const r = document.querySelector(list + ' .vl-row.sel');
    return r ? r.textContent.trim() : '';
  };
  // elemento existe e não está escondido (seguro durante carregamentos)
  const visible = (s) => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden'); };
  const focusedClass = () => (document.querySelector('.is-focused') || {}).className || '';
  const P = () => (window.__orbitaPlayer ? window.__orbitaPlayer() : null);
  const frames = async (fn) => {
    const f = [];
    let last = performance.now();
    let run = true;
    const raf = (n) => { f.push(n - last); last = n; if (run) requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    await fn();
    run = false;
    f.sort((a, b) => a - b);
    return f.length ? { quadros: f.length, medioMs: +(f.reduce((a, b) => a + b, 0) / f.length).toFixed(1), p95Ms: +f[Math.floor(f.length * 0.95)].toFixed(1), maxMs: +f[f.length - 1].toFixed(1) } : null;
  };

  try {
  await until(() => document.querySelector('.sb-item') && !dialog(), 20000);
  for (let i = 0; i < 3 && P(); i++) { press('back'); await sleep(800); }
  await activate('TV ao vivo');
  await until(() => document.querySelector('.vl-chans .vl-row.sel') && !document.querySelector('.vl-chans .vl-row.sel.loading'), 20000);
  check('abre com foco na lista de canais', /vl-chans/.test(focusedClass()), focusedClass());

  // começa sempre em "Todos os canais"
  press('left'); await sleep(150);
  check('← vai para as categorias', /vl-cats/.test(focusedClass()), focusedClass());
  for (let i = 0; i < 5 && !/Todos os canais/.test(sel('.vl-cats')); i++) { press(/Favoritos|Assistidos/.test(sel('.vl-cats')) ? 'down' : 'up'); await sleep(80); }
  press('ok'); await sleep(800);
  check('OK na categoria volta o foco aos canais', /vl-chans/.test(focusedClass()), focusedClass());

  // rolagem rápida pela lista (mede fluidez)
  const first = sel('.vl-chans');
  const keyMs = [];
  metrics.rolagem30 = await frames(async () => {
    for (let i = 0; i < 30; i++) {
      const tk = performance.now();
      press('down');
      keyMs.push(performance.now() - tk);
      await sleep(60);
    }
    await sleep(800);
  });
  keyMs.sort((a, b) => a - b);
  metrics.handlerSetaMs = { medio: +(keyMs.reduce((a, b) => a + b, 0) / keyMs.length).toFixed(1), max: +keyMs[keyMs.length - 1].toFixed(1) };
  const after30 = sel('.vl-chans');
  check('↓ 30x avança 30 canais', first !== after30, [first, after30]);
  check('DOM fixo (só linhas visíveis)', document.querySelectorAll('.vl-chans .vl-row').length <= 9, document.querySelectorAll('.vl-chans .vl-row').length);
  press('chDown'); await sleep(500);
  check('CH▼ desce uma página', sel('.vl-chans') !== after30, sel('.vl-chans'));
  press('chUp'); press('chUp'); press('chUp'); press('chUp'); press('chUp'); await sleep(500);

  // favorito com amarelo
  press('down'); press('down'); await sleep(400);
  const favName = sel('.vl-chans');
  press('yellow'); await sleep(800);
  check('amarelo marca favorito (ícone na linha)', visible('.vl-chans .vl-row.sel .cr-fav'), favName);
  check('painel mostra "Favoritos"', /Favoritos/.test(document.querySelector('.lp-state').textContent), document.querySelector('.lp-state').textContent);

  // categoria Favoritos tem o canal
  press('left'); await sleep(100);
  for (let i = 0; i < 40 && !/Favoritos/.test(sel('.vl-cats')); i++) { press('up'); await sleep(40); }
  await sleep(900);
  check('categoria Favoritos conta 1', /Favoritos\s*1/.test(sel('.vl-cats')), sel('.vl-cats'));
  press('right'); await sleep(300);
  check('lista de favoritos tem o canal', sel('.vl-chans').indexOf(favName.replace(/\s+/g, ' ').slice(-15).trim()) >= 0 || sel('.vl-chans') === favName, [sel('.vl-chans'), favName]);

  // abre o player a partir dos favoritos e volta
  press('ok');
  await until(() => !!P(), 5000);
  check('OK abre o player', !!P(), null);
  await until(() => P() && ['playing', 'failed'].indexOf(P().session.status) >= 0, 45000);
  metrics.statusFavorito = P() && P().session.status;
  press('back'); await sleep(800);
  check('Back volta para TV ao vivo com foco nos canais', !P() && /vl-chans/.test(focusedClass()), focusedClass());
  if (metrics.statusFavorito === 'playing') {
    check('canal assistido aparece marcado como tocando', visible('.vl-chans .vl-row.sel .cr-playing'), sel('.vl-chans'));
    await sleep(800);
    check('Assistidos recentemente conta o canal', /Assistidos recentemente\s*[1-9]/.test(document.querySelectorAll('.vl-cats .vl-row')[1].textContent), document.querySelectorAll('.vl-cats .vl-row')[1].textContent);
  }

  // remove o favorito
  press('yellow'); await sleep(900);
  check('amarelo de novo remove o favorito', /Favoritos\s*0/.test(document.querySelector('.vl-cats .vl-row').textContent), document.querySelector('.vl-cats .vl-row').textContent);

  // busca
  const searchTerm = (favName.replace(/^\d+/, '').trim().split(' ')[0] || 'a').toLowerCase().slice(0, 4);
  await activate('Pesquisar canal');
  type(searchTerm); press('green');
  const ts = Date.now();
  await until(() => /Busca:/.test(document.querySelector('.vl-cats .vl-row').textContent) || /Nenhum canal/.test(document.body.textContent), 60000);
  metrics.buscaMs = Date.now() - ts;
  metrics.buscaTermo = searchTerm;
  await until(() => sel('.vl-chans') && !document.querySelector('.vl-chans .vl-row.sel.loading'), 15000);
  check('busca cria a categoria de resultados', /Busca:/.test(document.querySelector('.vl-cats .vl-row').textContent), document.querySelector('.vl-cats .vl-row').textContent);
  check('resultados contêm o termo', sel('.vl-chans').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').indexOf(searchTerm) >= 0, [searchTerm, sel('.vl-chans')]);

  // número pelo controle
  press(49); await sleep(200);
  check('dígito aparece', visible('.live .osd-digits'), null);
  await until(() => !!P(), 4000);
  check('número 1 abre o canal 1 no player', P() && P().channel.num === 1, P() && P().channel);
  press('back'); await sleep(800);

  metrics.heapMB = +(performance.memory.usedJSHeapSize / 1048576).toFixed(1);
  metrics.domNodes = document.getElementsByTagName('*').length;
  out.push({ ok: true, step: 'métricas', got: metrics });
  } catch (e) {
    out.push({ ok: false, step: 'exceção no roteiro', got: String(e && e.stack || e) + ' | tela: ' + T.screen() + ' | player: ' + !!P() });
  }
  return out;
})();
