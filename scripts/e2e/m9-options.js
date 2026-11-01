// Marco 9: opções de reprodução (botão verde). Antes rode setup-mock-list com
// E2E_MOCKPATH=/lista-epg.m3u E2E_MOCKNAME=mock-epg. O canal 1 usa o HLS de teste
// da Apple (várias faixas de áudio e legendas).
window.__E2E__ = (async () => {
  const { press, sleep, activate, until, dialog } = T;
  const out = [];
  const metrics = {};
  const check = (step, cond, got) => out.push({ ok: !!cond, step, got });
  const q = (s) => document.querySelector(s);
  const txt = (s) => (q(s) ? q(s).textContent.trim() : '');
  const P = () => (window.__orbitaPlayer ? window.__orbitaPlayer() : null);
  const st = () => (P() ? P().session.status : '-');
  const btn = (re) => [...document.querySelectorAll('.dlg-box .btn')].find((b) => re.test(b.textContent));
  const pick = async (re) => {
    const b = btn(re);
    if (!b) throw new Error('opção não encontrada: ' + re + ' em ' + (dialog() || ''));
    b.click();
    await sleep(500);
  };
  const settingsNow = () => JSON.parse(localStorage.getItem('orbita.settings.v1') || '{}');
  await until(() => q('.sb-item') && !dialog(), 20000);

  await activate('TV ao vivo');
  await until(() => txt('.vl-chans .vl-row.sel .cr-name'), 20000);
  press('left'); await sleep(150);
  for (let i = 0; i < 20 && !/Todos os canais/.test(txt('.vl-cats .vl-row.sel')); i++) { press('down'); await sleep(60); }
  press('ok'); await sleep(800);
  for (let i = 0; i < 40 && txt('.vl-chans .vl-row.sel .cr-name') !== 'Canal de Teste 1'; i++) { press('up'); await sleep(40); }
  press('ok');
  await until(() => P() && st() === 'playing', 40000);
  check('canal com várias faixas toca', st() === 'playing', st());
  await sleep(3000);
  const info = P().info || {};
  metrics.faixasAudio = (info.audioTracks || []).map((a) => a.language);
  metrics.faixasLegenda = (info.subtitleTracks || []).map((a) => a.language);

  // menu
  press('green');
  await until(() => /Opções de reprodução/.test(dialog() || ''), 3000);
  check('verde abre as opções', /Opções de reprodução/.test(dialog() || ''), dialog());
  check('mostra áudio, legendas, proporção, buffer', /Áudio/.test(dialog()) && /Legendas/.test(dialog()) && /Proporção/.test(dialog()) && /Buffer/.test(dialog()), dialog());

  // proporção 4:3 e volta ao automático
  await pick(/Proporção/);
  await pick(/^4:3$/);
  check('proporção 4:3 salva', settingsNow().aspect === '4:3', settingsNow().aspect);
  check('continua tocando após mudar proporção', st() === 'playing', st());
  await pick(/Proporção/);
  await pick(/Preencher/);
  check('proporção preencher salva', settingsNow().aspect === 'fill', settingsNow().aspect);

  // legendas
  if ((info.subtitleTracks || []).length) {
    await pick(/Legendas/);
    const opts = [...document.querySelectorAll('.dlg-box .btn')].map((b) => b.textContent);
    metrics.opcoesLegenda = opts;
    [...document.querySelectorAll('.dlg-box .btn')][1].click();
    await sleep(500);
    press('back'); await sleep(300);
    const t0 = Date.now();
    await until(() => q('.subs:not(.hidden)') && txt('.subs'), 30000);
    metrics.legendaApareceuMs = q('.subs:not(.hidden)') ? Date.now() - t0 : null;
    metrics.legendaTexto = txt('.subs').slice(0, 60);
    check('legenda aparece na tela', !!q('.subs:not(.hidden)'), metrics.legendaTexto);
    press('green'); await sleep(500);
  } else check('stream informou legendas', false, info);

  // áudio
  if ((info.audioTracks || []).length > 1) {
    await pick(/Áudio/);
    [...document.querySelectorAll('.dlg-box .btn')][1].click();
    await sleep(2500);
    check('trocar áudio não derruba o vídeo', st() === 'playing' || st() === 'buffering', st());
    metrics.audioDepois = (P().info || {}).currentAudio;
  }

  // buffer maior: reabre o stream
  if (!dialog()) { press('green'); await sleep(500); }
  await pick(/Buffer/);
  const tb = Date.now();
  await pick(/Maior/);
  await until(() => st() === 'playing', 40000);
  metrics.reabrirComBufferMaiorMs = Date.now() - tb;
  check('buffer maior salvo e stream reaberto', settingsNow().buffer === 'large' && st() === 'playing', [settingsNow().buffer, st()]);

  // desfaz as preferências pelo próprio menu (o app guarda os ajustes em memória)
  press('green'); await sleep(500);
  await pick(/Buffer/);
  const tn = Date.now();
  await pick(/^Normal$/);
  await until(() => st() === 'playing', 40000);
  metrics.reabrirComBufferNormalMs = Date.now() - tn;
  press('green'); await sleep(500);
  await pick(/Proporção/);
  await pick(/Automática/);
  if (btn(/Legendas/)) { await pick(/Legendas/); await pick(/Desligadas/); }
  press('back'); await sleep(300);
  check('opções voltaram ao padrão', settingsNow().aspect === 'auto' && settingsNow().buffer === 'normal' && !settingsNow().subLang, settingsNow());
  press('back'); await until(() => !P(), 5000);
  await activate('Início');
  out.push({ ok: true, step: 'métricas', got: metrics });
  return out;
})();
