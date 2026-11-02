// Marco 10: troca de idioma pelas Configurações. E2E_LANG = rótulo do idioma
// (ex.: English). O app recarrega sozinho; confira depois com tv.mjs eval.
window.__E2E__ = (async () => {
  const { sleep, activate, until, dialog } = T;
  const label = window.__LANG__ || 'English';
  await until(() => document.querySelector('.sb-item') && !dialog(), 20000);
  const item = [...document.querySelectorAll('.sb-item')].find((e) => /Configurações|Settings|Ajustes/.test(e.textContent));
  item.click(); await sleep(400);
  document.querySelector('.set-row[data-id="lang"]').click(); await sleep(400);
  const btn = [...document.querySelectorAll('.dlg-box .btn')].find((b) => b.textContent === label);
  const opts = [...document.querySelectorAll('.dlg-box .btn')].map((b) => b.textContent);
  // o clique recarrega a página: responde antes
  setTimeout(() => btn && btn.click(), 300);
  return [{ ok: !!btn, step: 'idioma ' + label + ' oferecido', got: opts }];
})();
