// Marco 10: configurações, PIN parental, bloqueio de categorias e backup.
// Antes rode setup-mock-list com E2E_MOCKPATH=/lista-epg.m3u E2E_MOCKNAME=mock-epg.
// O roteiro desativa o controle parental no fim. Idioma: m10-language.js.
window.__E2E__ = (async () => {
  const { press, sleep, activate, until, dialog, screen } = T;
  const PIN = '1357';
  const out = [];
  const metrics = {};
  const check = (step, cond, got) => out.push({ ok: !!cond, step, got });
  const q = (s) => document.querySelector(s);
  const txt = (s) => (q(s) ? q(s).textContent.trim() : '');
  const rowValue = (id) => txt('.set-row[data-id="' + id + '"] .set-value');
  const dlgBtn = (re) => [...document.querySelectorAll('.dlg-box .btn')].find((b) => re.test(b.textContent));
  const pick = async (re) => {
    const b = dlgBtn(re);
    if (!b) throw new Error('botão não encontrado: ' + re + ' em ' + (dialog() || ''));
    b.click();
    await sleep(400);
  };
  // PIN pelos números do controle (códigos 48–57)
  const typePin = async (pin) => {
    await until(() => q('.pin-box') && !q('.pin-dot.on'), 5000);
    for (const d of pin) { press(48 + Number(d)); await sleep(80); }
    await sleep(400);
  };
  const busyGone = () => until(() => !/Conferindo|Salvando/.test(dialog() || ''), 10000);
  await until(() => q('.sb-item') && !dialog(), 20000);

  // ── tela ──
  await activate('Configurações');
  await until(() => q('.set-row'), 5000);
  check('abre Configurações', screen() === 'Configurações', screen());
  check('linhas: idioma, mini janela, parental, backup', ['lang', 'preview', 'ask', 'parental', 'export', 'import'].every((id) => q('.set-row[data-id="' + id + '"]')), null);
  check('parental começa desativado', /Desativado/.test(rowValue('parental')), rowValue('parental'));

  // mini janela liga/desliga e é respeitada pela TV ao vivo
  const pv0 = rowValue('preview');
  q('.set-row[data-id="preview"]').click(); await sleep(300);
  check('mini janela alterna', rowValue('preview') !== pv0, [pv0, rowValue('preview')]);
  q('.set-row[data-id="preview"]').click(); await sleep(300);
  check('mini janela volta', rowValue('preview') === pv0, rowValue('preview'));

  // ── cria PIN (com uma confirmação errada antes) ──
  q('.set-row[data-id="parental"]').click();
  await typePin(PIN);
  await typePin('2468');
  check('PINs diferentes pedem de novo', /não conferem/.test(dialog() || ''), dialog());
  await typePin(PIN);
  const ts = Date.now();
  await typePin(PIN);
  await busyGone();
  metrics.salvarPinMs = Date.now() - ts;
  await until(() => /Ativo/.test(rowValue('parental')), 5000);
  check('PIN salvo, parental ativo', /Ativo · 0/.test(rowValue('parental')), rowValue('parental'));
  check('PIN não fica em texto no storage', (localStorage.getItem('orbita.parental.v1') || '').indexOf(PIN) < 0, null);

  // ── bloqueia a primeira categoria ao vivo ──
  q('.set-row[data-id="parental"]').click(); // sessão já liberada: vai direto ao menu
  await until(() => dlgBtn(/Categorias bloqueadas/), 3000);
  await pick(/Categorias bloqueadas/);
  await until(() => q('.pc-list .vl-row .cat-label'), 10000);
  const group = txt('.pc-list .vl-row.sel .cat-label');
  press('ok'); await sleep(300);
  check('categoria marcada como bloqueada', q('.pc-list .vl-row.sel.locked'), group);
  press('back'); await sleep(300);
  check('contagem de bloqueios', /Ativo · 1/.test(rowValue('parental')), rowValue('parental'));
  q('.set-row[data-id="parental"]').click();
  await until(() => dlgBtn(/Bloquear agora/), 3000);
  await pick(/Bloquear agora/);

  // ── TV ao vivo com a categoria bloqueada ──
  await activate('TV ao vivo');
  await until(() => q('.vl-cats .vl-row .cat-label'), 15000);
  const catRows = () => [...document.querySelectorAll('.vl-cats .vl-row')];
  const lockedRow = () => catRows().find((r) => r.querySelector('.cat-label') && r.querySelector('.cat-label').textContent === group);
  check('categoria bloqueada mostra cadeado sem contagem', lockedRow() && lockedRow().querySelector('.cat-icon') && !lockedRow().querySelector('.cat-count').textContent, lockedRow() && lockedRow().textContent);
  // "Todos" sem os canais da categoria
  press('left'); await sleep(150);
  for (let i = 0; i < 20 && !/Todos os canais/.test(txt('.vl-cats .vl-row.sel')); i++) { press('down'); await sleep(60); }
  press('ok'); await sleep(1200);
  const allCount = Number(txt('.vl-cats .vl-row.sel .cat-count').replace(/\D/g, ''));
  const rowsAll = window.__orbitaLiveSize ? window.__orbitaLiveSize() : null;
  metrics.todosComBloqueio = rowsAll;
  // "Todos" mostra a contagem cheia, mas a lista vem sem os canais da categoria bloqueada
  check('"Todos" esconde os canais bloqueados', allCount > 0 && rowsAll < allCount, [rowsAll, allCount]);
  // abre a categoria: pede PIN; errado avisa
  press('left'); await sleep(150);
  for (let i = 0; i < 40 && txt('.vl-cats .vl-row.sel .cat-label') !== group; i++) { press('down'); await sleep(60); }
  press('ok');
  await typePin('0000');
  await busyGone();
  check('PIN errado avisa e pede de novo', /PIN incorreto/.test(dialog() || '') && q('.pin-box'), dialog());
  const tv = Date.now();
  await typePin(PIN);
  await busyGone();
  metrics.conferirPinMs = Date.now() - tv;
  await until(() => !dialog() && q('.vl-chans .vl-row .cr-name'), 8000);
  check('PIN certo abre a categoria', !dialog() && !!txt('.vl-chans .vl-row .cr-name'), txt('.vl-chans .vl-row.sel'));
  check('cadeado some com a sessão liberada', lockedRow() && !lockedRow().querySelector('.cat-icon'), lockedRow() && lockedRow().textContent);

  // ── backup ──
  await activate('Configurações');
  await until(() => q('.set-row'), 5000);
  q('.set-row[data-id="export"]').click();
  await until(() => /senhas/.test(dialog() || ''), 3000);
  check('exportar avisa sobre as senhas', /senhas das contas/.test(dialog() || ''), dialog());
  await pick(/^Exportar$/);
  await until(() => /Backup salvo|Backup/.test(dialog() || ''), 8000);
  metrics.exportar = dialog();
  check('backup gravado', /Backup salvo/.test(dialog() || '') && /orbita-backup\.json/.test(dialog() || ''), dialog());
  press('ok'); await sleep(300);
  q('.set-row[data-id="import"]').click();
  await until(() => /Arquivo:/.test(dialog() || '') || /Backup/.test(dialog() || ''), 8000);
  metrics.importar = dialog();
  check('importar acha o arquivo e ignora listas já cadastradas', /0 listas novas/.test(dialog() || ''), dialog());
  await pick(/^Importar$/);
  await sleep(800);
  check('importação termina sem duplicar', !dialog(), dialog());

  // ── desativa ──
  q('.set-row[data-id="parental"]').click();
  await until(() => dlgBtn(/Desativar/), 3000);
  await pick(/Desativar/);
  await pick(/Desativar/);
  check('parental desativado', /Desativado/.test(rowValue('parental')) && !localStorage.getItem('orbita.parental.v1'), rowValue('parental'));
  await activate('Início');
  out.push({ ok: true, step: 'métricas', got: metrics });
  return out;
})();
