// Início no estilo streaming: sem atalhos, carrosséis que andam sozinhos (e param
// com foco), destaque que troca, imagens só perto da área visível.
window.__E2E__ = (async () => {
  const { press, sleep, activate, until } = T;
  const q=(s)=>document.querySelector(s); const all=(s)=>[...document.querySelectorAll(s)];
  const out=[]; const check=(step,c,got)=>out.push({ok:!!c,step,got});
  await activate('Início'); await sleep(4000);
  const titles = all('.prail .rail-title').map(e=>e.textContent);
  check('sem os atalhos de acesso rápido', !q('.tile') && !/Acesso rápido/.test(document.body.innerText), null);
  check('carrosséis com cartazes', titles.length >= 2, titles);
  check('destaque com filme novo e cartaz', q('.home-hero.featured') && q('.home-hero-poster'), q('.home-hero .hero-title') && q('.home-hero .hero-title').textContent);
  const tr = (r) => r.querySelector('.prail-track').style.transform;
  const rails = all('.prail');
  const before = rails.map(tr), feat1 = q('.home-hero .hero-title').textContent;
  await sleep(13000); // destaque espera 8 s sem tecla e troca a cada 8 s
  const after = rails.map(tr), feat2 = q('.home-hero .hero-title').textContent;
  check('carrosséis andam sozinhos', after.some((v,i)=>v!==before[i]), [before, after]);
  check('destaque troca sozinho', feat1 !== feat2, [feat1, feat2]);
  const imgs = all('.prail-img').filter(i=>i.getAttribute('src')).length, cards = all('.prail-card').length;
  check('só carrega imagens perto da área visível', imgs < cards, [imgs, cards]);
  // foco: desce para o 1º carrossel, anda, e a tela rola
  for (let i=0;i<2;i++){ press('down'); await sleep(400); }
  const f = q('.is-focused');
  check('↓ leva o foco para um cartaz', f && f.classList.contains('prail-card'), f && f.className);
  const r0 = f.closest('.prail'); const t0 = tr(r0);
  await sleep(9000);
  check('carrossel com foco não anda sozinho', tr(r0) === t0, [t0, tr(r0)]);
  return out.concat([{ok:true,step:'métricas',got:{titles, imgs, cards}}]);
})();
