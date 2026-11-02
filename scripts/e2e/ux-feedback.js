// Ajustes pedidos depois do marco 10: mini janela maior, grade de cartazes,
// botões na tela do player e apagar histórico. Usa a lista ativa (a real).
window.__E2E__ = (async () => {
  const { press, sleep, activate, until, dialog } = T;
  const out = [];
  const metrics = {};
  const check = (step, cond, got) => out.push({ ok: !!cond, step, got });
  const q = (s) => document.querySelector(s);
  const txt = (s) => (q(s) ? q(s).textContent.trim() : '');
  const P = () => (window.__orbitaPlayer ? window.__orbitaPlayer() : null);
  const V = () => (window.__orbitaVod ? window.__orbitaVod() : null);
  await until(() => q('.sb-item') && !dialog(), 20000);

  // ── mini janela ──
  await activate('TV ao vivo');
  await until(() => q('.vl-cats .vl-row .cat-label'), 20000);
  // reabre na última categoria (pode ser o Histórico vazio): vai para "Todos"
  press('left'); await sleep(200);
  for (let i = 0; i < 20 && !/Todos os canais/.test(txt('.vl-cats .vl-row.sel')); i++) { press('down'); await sleep(80); }
  press('ok');
  await until(() => txt('.vl-chans .vl-row.sel .cr-name'), 20000);
  await sleep(300);
  if (!q('.vl-chans.is-focused')) { press('right'); await sleep(200); }
  const r = q('.lp-video').getBoundingClientRect();
  metrics.janela = Math.round(r.width) + 'x' + Math.round(r.height);
  check('mini janela ~16:9 e bem maior que 408x300', r.width >= 600 && Math.abs(r.width / r.height - 16 / 9) < 0.08, metrics.janela);
  const t0 = Date.now();
  await until(() => document.body.classList.contains('preview') && q('.lp-video.live'), 30000);
  metrics.janelaTocandoMs = Date.now() - t0;
  check('mini janela toca o canal selecionado', !!q('.lp-video.live'), txt('.lp-pv-status'));
  const before = txt('.vl-chans .vl-row.sel .cr-name');
  press('down');
  await sleep(200);
  const t1 = Date.now();
  await until(() => q('.lp-video.live') && txt('.vl-chans .vl-row.sel .cr-name') !== before, 30000);
  await until(() => q('.lp-video.live'), 30000);
  metrics.trocaJanelaMs = Date.now() - t1;

  // ── player: botões na tela ──
  press('ok');
  await until(() => P() && ['playing', 'failed'].indexOf(P().session.status) >= 0, 30000);
  await sleep(1500);
  press('ok'); await sleep(300); // 1º OK: mostra o OSD e arma os botões (não abre nada)
  check('OK mostra os botões na tela sem abrir nada', P().osdVisible && q('.osd.bar-mode') && !dialog() && document.querySelectorAll('.osd-btn').length === 4, [txt('.osd-bar'), dialog()]);
  check('primeiro botão selecionado: Pausar', /Pausar/.test(txt('.osd-btn.sel')), txt('.osd-btn.sel'));
  const liveSt = P().session.status;
  press('ok'); await sleep(800);
  check('ao vivo: Pausar pausa e o botão vira Continuar', liveSt !== 'playing' || (P().session.status === 'paused' && /Continuar/.test(txt('.osd-btn.sel'))), [liveSt, P().session.status, txt('.osd-btn.sel')]);
  press('ok'); await sleep(1500);
  check('ao vivo: Continuar volta a tocar', liveSt !== 'playing' || ['playing', 'buffering'].indexOf(P().session.status) >= 0, P().session.status);
  const prog = q('.player .vod-progress');
  metrics.barraPrograma = prog && !prog.classList.contains('hidden') ? txt('.player .vod-progress') : 'sem guia';
  press('right'); await sleep(200);
  check('→ vai para Opções', /Opções/.test(txt('.osd-btn.sel')), txt('.osd-btn.sel'));
  press('ok'); await sleep(400);
  check('OK no botão abre as opções de reprodução', /Opções de reprodução/.test(dialog() || ''), dialog());
  press('back'); await sleep(300);
  check('fechar as opções volta com os botões', P().osdVisible && !!q('.osd.bar-mode'), q('.osd').className);
  press('right'); await sleep(200);
  check('→ vai para Favoritar', /favorit/i.test(txt('.osd-btn.sel')), txt('.osd-btn.sel'));
  press('right'); await sleep(200);
  check('→ vai para Canais', /Canais/.test(txt('.osd-btn.sel')), txt('.osd-btn.sel'));
  press('ok');
  await until(() => !P(), 5000);
  check('Canais volta para a lista', !P() && !!q('.vl-chans'), null);

  // ── grade de cartazes ──
  await activate('Filmes');
  await until(() => q('.vl-grid .vl-cell .vg-name') && txt('.vl-grid .vl-cell.sel .vg-name'), 30000);
  const cells = [...document.querySelectorAll('.vl-grid .vl-cell')].filter((c) => !c.classList.contains('hidden'));
  check('Filmes em grade (4 por linha, 8 células, cartaz 2:3)', document.querySelectorAll('.vl-grid .vl-cell').length === 8 && Math.abs(q('.vl-grid .vg-frame').getBoundingClientRect().height / q('.vl-grid .vg-frame').getBoundingClientRect().width - 1.5) < 0.05 && cells.length > 4, cells.length);
  const first = txt('.vl-grid .vl-cell.sel .vg-name');
  press('right'); await sleep(250);
  const second = txt('.vl-grid .vl-cell.sel .vg-name');
  press('down'); await sleep(250);
  check('→ e ↓ andam na grade', second && second !== first && txt('.vl-grid .vl-cell.sel .vg-name') !== second, [first, second, txt('.vl-grid .vl-cell.sel .vg-name')]);
  press('up'); press('left'); await sleep(250);
  press('left'); await sleep(250);
  check('← na primeira coluna volta às categorias', document.activeElement === q('.vl-cats') || q('.vl-cats.is-focused'), null);
  press('right'); await sleep(200);
  for (let i = 0; i < 30; i++) press('down');
  await sleep(1500);
  const posters = [...document.querySelectorAll('.vl-grid .vg-poster')].filter((i) => i.complete && i.naturalWidth > 0).length;
  metrics.cartazesCarregados = posters;
  check('cartazes carregam depois de rolar', posters > 0, posters);

  // ── filme: botões na tela ──
  press('ok');
  await until(() => (V() && V().session.status === 'playing') || /Continuar assistindo/.test(dialog() || ''), 40000);
  if (/Continuar assistindo/.test(dialog() || '')) {
    [...document.querySelectorAll('.dlg-box .btn')].find((b) => /início/.test(b.textContent)).click();
    await until(() => V() && V().session.status === 'playing', 40000);
  }
  if (V() && V().session.status === 'playing') {
    press('ok'); await sleep(300);
    check('filme: OK ativa os botões', q('.osd.bar-mode') && /Pausar/.test(txt('.osd-btn.sel')), txt('.osd-btn.sel'));
    press('ok'); await sleep(800);
    check('filme: botão Pausar pausa', V().session.status === 'paused', V().session.status);
    check('filme: botão vira Continuar', /Continuar/.test(txt('.osd-btn.sel')), txt('.osd-btn.sel'));
    press('ok'); await sleep(800);
    press('back'); await sleep(300);
    check('filme: Back fecha só os botões', !q('.osd.bar-mode') && !!V(), null);
    press('back');
    await until(() => !V(), 5000);
  } else {
    check('filme toca', false, V() && V().session.status);
    for (let i = 0; i < 3 && (V() || dialog()); i++) { press('back'); await sleep(800); }
  }

  // ── apagar histórico ──
  await activate('Configurações');
  await until(() => q('.set-row[data-id="history"]'), 5000);
  q('.set-row[data-id="history"]').click();
  await until(() => /Apagar o histórico/.test(dialog() || ''), 3000);
  check('pede confirmação', /Apagar o histórico?/.test(dialog() || '') && !!document.querySelector('.dlg-box .btn-danger'), dialog());
  [...document.querySelectorAll('.dlg-box .btn')].find((b) => b.textContent === 'Apagar').click();
  await sleep(1000);
  await activate('Histórico');
  await until(() => q('.vl-chans'), 10000);
  await sleep(1200);
  check('Histórico vazio depois de apagar', window.__orbitaLiveSize && window.__orbitaLiveSize() === 0, window.__orbitaLiveSize && window.__orbitaLiveSize());
  check('botão Apagar histórico na tela de Histórico', [...document.querySelectorAll('.live-head-actions .btn')].some((b) => /Apagar histórico/.test(b.textContent)), null);
  await activate('Início');
  out.push({ ok: true, step: 'métricas', got: metrics });
  return out;
})();
