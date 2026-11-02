// Temas: a linha Tema em Configurações oferece Preto/Cinema/Azul noite, aplica na hora,
// salva e devolve o tema que estava antes.
window.__E2E__ = (async () => {
  const { sleep, activate, until, dialog } = T;
  const q=(s)=>document.querySelector(s);
  const out=[]; const check=(step,c,got)=>out.push({ok:!!c,step,got});
  await activate('Configurações');
  await until(() => q('.set-row[data-id="theme"]'), 5000);
  // respeita o tema de quem usa a TV: guarda e devolve no fim
  const original = JSON.parse(localStorage.getItem('orbita.settings.v1') || '{}').theme || 'black';
  const names = { black: /^Preto/, cinema: /Cinema/, navy: /Azul noite/ };
  check('linha Tema mostra o tema atual', names[original].test(q('.set-row[data-id="theme"] .set-value').textContent), q('.set-row[data-id="theme"] .set-value').textContent);
  q('.set-row[data-id="theme"]').click();
  await until(() => /Tema/.test(dialog() || ''), 3000);
  const btns=[...document.querySelectorAll('.dlg-box .btn')].map(b=>b.textContent);
  check('oferece os 3 temas', btns.length>=3 && btns.some(b=>/Cinema/.test(b)) && btns.some(b=>/Azul noite/.test(b)), btns);
  // troca para um tema diferente do atual
  const other = original === 'navy' ? 'cinema' : 'navy';
  const bg = { cinema: 'rgb(20, 20, 20)', navy: 'rgb(15, 23, 30)' };
  [...document.querySelectorAll('.dlg-box .btn')].find(b=>names[other].test(b.textContent)).click();
  await sleep(500);
  check('aplica na hora', document.documentElement.getAttribute('data-theme')===other && getComputedStyle(q('#backdrop')).backgroundColor===bg[other], document.documentElement.getAttribute('data-theme'));
  check('fica salvo', JSON.parse(localStorage.getItem('orbita.settings.v1')).theme===other, null);
  check('linha mostra o novo tema', names[other].test(q('.set-row[data-id="theme"] .set-value').textContent), null);
  q('.set-row[data-id="theme"]').click();
  await until(() => /Tema/.test(dialog() || ''), 3000);
  [...document.querySelectorAll('.dlg-box .btn')].find(b=>names[original].test(b.textContent)).click();
  await sleep(500);
  check('volta ao tema original', (document.documentElement.getAttribute('data-theme') || 'black') === original, document.documentElement.getAttribute('data-theme'));
  return out;
})();
