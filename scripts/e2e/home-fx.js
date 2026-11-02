// Efeito de seleção nos carrosséis: zoom 1,12, anel animado e ≥ 50 fps na TV.
window.__E2E__ = (async () => {
  const { press, sleep, activate } = T;
  await activate('Início'); await sleep(3000);
  press('right'); await sleep(400); press('down'); await sleep(800);
  const f = document.querySelector('.prail-card.is-focused');
  const fr = f.querySelector('.prail-frame').getBoundingClientRect();
  const base = f.offsetWidth;
  const anim = getComputedStyle(f.querySelector('.prail-frame'), '::after').animationName;
  // quadros por segundo com o anel pulsando (3 s)
  let frames = 0, worst = 0, last = performance.now();
  const t0 = last;
  await new Promise((ok) => { const step = (t) => { frames++; worst = Math.max(worst, t - last); last = t; if (t - t0 < 3000) requestAnimationFrame(step); else ok(); }; requestAnimationFrame(step); });
  const fps = Math.round(frames / 3);
  return [
    { ok: Math.abs(fr.width / base - 1.12) < 0.03, step: 'zoom de 1,12 no cartão', got: +(fr.width / base).toFixed(3) },
    { ok: anim === 'prail-pulse', step: 'anel animado', got: anim },
    { ok: fps >= 50, step: 'animação sem pesar (≥ 50 fps)', got: { fps, piorQuadroMs: Math.round(worst) } },
  ];
})();
