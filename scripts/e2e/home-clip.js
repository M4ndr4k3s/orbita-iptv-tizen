// Cartão focado no canto esquerdo do carrossel não pode ser cortado (zoom + anel de foco).
window.__E2E__ = (async () => {
  const { press, sleep, activate } = T;
  await activate('Início'); await sleep(4000);
  press('right'); await sleep(400); // sai do menu lateral para o destaque
  press('down'); await sleep(800);
  const f = document.querySelector('.prail-card.is-focused');
  if (!f) return [{ ok: false, step: 'sem cartão focado', got: document.querySelector('.is-focused') && document.querySelector('.is-focused').className }];
  const vp = f.closest('.prail-viewport').getBoundingClientRect();
  const fr = f.querySelector('.prail-frame').getBoundingClientRect();
  const nm = f.querySelector('.prail-name').getBoundingClientRect();
  // anel de foco: 4 px em volta do cartaz
  const ok = fr.left - 4 >= vp.left && nm.left >= vp.left && fr.top - 4 >= vp.top;
  return [{ ok, step: 'cartão focado no canto esquerdo inteiro (cartaz, anel e título)', got: { vp: Math.round(vp.left), cartaz: Math.round(fr.left), titulo: Math.round(nm.left) } }];
})();
