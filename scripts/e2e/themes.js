// Temas: a linha Tema em Configurações oferece Preto/Cinema/Azul noite, aplica na hora,
// salva e volta ao Preto no fim.
window.__E2E__ = (async () => {
  const { sleep, activate, until, dialog } = T;
  const q=(s)=>document.querySelector(s);
  const out=[]; const check=(step,c,got)=>out.push({ok:!!c,step,got});
  await activate('Configurações');
  await until(() => q('.set-row[data-id="theme"]'), 5000);
  check('linha Tema mostra Preto', /Preto/.test(q('.set-row[data-id="theme"] .set-value').textContent), q('.set-row[data-id="theme"] .set-value').textContent);
  q('.set-row[data-id="theme"]').click();
  await until(() => /Tema/.test(dialog() || ''), 3000);
  const btns=[...document.querySelectorAll('.dlg-box .btn')].map(b=>b.textContent);
  check('oferece os 3 temas', btns.length>=3 && btns.some(b=>/Cinema/.test(b)) && btns.some(b=>/Azul noite/.test(b)), btns);
  [...document.querySelectorAll('.dlg-box .btn')].find(b=>/Cinema/.test(b.textContent)).click();
  await sleep(500);
  check('aplica na hora', document.documentElement.getAttribute('data-theme')==='cinema' && getComputedStyle(q('#backdrop')).backgroundColor==='rgb(20, 20, 20)', document.documentElement.getAttribute('data-theme'));
  check('fica salvo', JSON.parse(localStorage.getItem('orbita.settings.v1')).theme==='cinema', null);
  check('linha mostra Cinema', /Cinema/.test(q('.set-row[data-id="theme"] .set-value').textContent), null);
  q('.set-row[data-id="theme"]').click();
  await until(() => /Tema/.test(dialog() || ''), 3000);
  [...document.querySelectorAll('.dlg-box .btn')].find(b=>/^Preto/.test(b.textContent)).click();
  await sleep(500);
  check('volta ao Preto', !document.documentElement.getAttribute('data-theme'), null);
  return out;
})();
