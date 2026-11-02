// Prepara: cadastra (se faltar) e ativa uma lista do mock. E2E_MOCK e E2E_MOCKPATH
// (ex.: /grande.m3u?n=3000) definem a lista; E2E_MOCKNAME o nome.
window.__E2E__ = (async () => {
  const { press, sleep, type, activate, until, afterImport, dialog } = T;
  const name = window.__MOCKNAME__ || 'mock';
  await until(() => document.querySelector('.sb-item') && !dialog(), 20000);
  // sai do player, se um roteiro anterior deixou aberto
  for (let i = 0; i < 3 && window.__orbitaPlayer; i++) { press('back'); await sleep(800); }
  await activate('Listas');
  let card = [...document.querySelectorAll('.src-card')].find((c) => c.querySelector('.src-name').textContent === name);
  let imported = 'já existia';
  if (!card) {
    await activate('Adicionar lista');
    const fld = (l) => [...document.querySelectorAll('.tf')].find((f) => f.querySelector('.tf-label').textContent === l);
    fld('Nome').querySelector('.tf-box').click(); await sleep(100); type(name); press('green'); await sleep(100);
    fld('URL da lista').querySelector('.tf-box').click(); await sleep(100); type(window.__MOCK__ + window.__MOCKPATH__); press('green'); await sleep(100);
    document.querySelector('.form-actions .btn-primary').click();
    imported = await afterImport(600000);
    card = [...document.querySelectorAll('.src-card')].find((c) => c.querySelector('.src-name').textContent === name);
  }
  if (window.__REIMPORT__ && imported === 'já existia') {
    card.click(); await sleep(200);
    await activate('Atualizar agora');
    imported = await afterImport(600000);
  }
  card.click();
  // o diálogo do card pode levar mais que 200 ms para abrir na TV
  await until(() => document.querySelector('.dlg-box .btn'), 5000).catch(() => {});
  const use = [...document.querySelectorAll('.dlg-box .btn')].find((b) => /Usar esta lista/.test(b.textContent));
  if (use) use.click(); else press('back');
  await sleep(500);
  if (/Carregando/.test(dialog() || '')) await afterImport(600000);
  return [{ ok: !!card, step: 'lista do mock ativa: ' + name, got: imported }];
})();
