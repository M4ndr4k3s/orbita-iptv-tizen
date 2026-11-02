// Continuar assistindo: episódio visto vira um cartão só da série no Início, e o
// clique abre as temporadas. Canais vistos em cartão quadrado.
window.__E2E__ = (async () => {
  const { press, sleep, activate, until, dialog } = T;
  const q=(s)=>document.querySelector(s); const txt=(s)=>(q(s)?q(s).textContent.trim():''); const all=(s)=>[...document.querySelectorAll(s)];
  const V = () => (window.__orbitaVod ? window.__orbitaVod() : null);
  const out=[]; const check=(step,c,got)=>out.push({ok:!!c,step,got});
  await activate('Séries');
  await until(() => txt('.vl-grid .vl-cell.sel .vg-name'), 30000);
  const serie = txt('.vl-grid .vl-cell.sel .vg-name');
  press('ok');
  await until(() => q('.series .vl-chans .vl-row'), 30000); await sleep(1500);
  press('right'); await sleep(300); press('ok');
  await until(() => (V() && V().session.status === 'playing') || /Continuar assistindo/.test(dialog() || ''), 40000);
  if (/Continuar assistindo/.test(dialog() || '')) { [...document.querySelectorAll('.dlg-box .btn')].find((b) => /início/.test(b.textContent)).click(); await until(() => V() && V().session.status === 'playing', 40000); }
  // pula para 1 min 10 s (o ponto só é guardado depois de 1 min)
  for (let i=0;i<7;i++){ press('right'); await sleep(300); }
  await sleep(4000);
  for (let i=0;i<3 && V();i++){ press('back'); await sleep(1000); }
  await activate('Início'); await sleep(4000);
  const rail = all('.prail').find(r=>/Continuar assistindo/.test(r.textContent));
  check('série aparece em Continuar assistindo', rail && rail.textContent.indexOf(serie) >= 0, rail && rail.textContent.slice(0,120));
  const cards = rail ? [...rail.querySelectorAll('.prail-card')].filter(c=>c.textContent.indexOf(serie)>=0) : [];
  check('uma vez só', cards.length === 1, cards.length);
  const sq = all('.prail-square .prail-frame')[0];
  check('canais em cartão quadrado', sq && Math.abs(sq.getBoundingClientRect().width - sq.getBoundingClientRect().height) < 2, sq && [sq.getBoundingClientRect().width, sq.getBoundingClientRect().height]);
  if (cards[0]) { cards[0].click(); await sleep(3000); }
  check('clique abre a série (temporadas)', !!q('.screen.series') && txt('.screen.series .screen-title') === serie && !V(), [txt('.screen.series .screen-title'), !!V()]);
  await activate('Início');
  return out;
})();
