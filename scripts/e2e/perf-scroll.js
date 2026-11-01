// Experimento de desempenho: mede a rolagem da lista de canais variando CSS.
// Precisa estar na tela TV ao vivo.
window.__E2E__ = (async () => {
  const { press, sleep, activate, until, dialog } = T;
  const P = () => (window.__orbitaPlayer ? window.__orbitaPlayer() : null);
  for (let i = 0; i < 3 && P(); i++) { press('back'); await sleep(800); }
  if (!document.querySelector('.vl-chans')) await activate('TV ao vivo');
  await until(() => document.querySelector('.vl-chans .vl-row.sel') && !dialog(), 20000);
  // garante foco na lista de canais
  for (let i = 0; i < 3 && !/vl-chans/.test((document.querySelector('.is-focused') || {}).className || ''); i++) { press('right'); await sleep(100); }

  const measure = async () => {
    const f = [];
    let last = performance.now();
    let run = true;
    const raf = (n) => { f.push(n - last); last = n; if (run) requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) { press(i < 10 ? 'down' : 'up'); await sleep(80); }
    await sleep(500);
    run = false;
    f.sort((a, b) => a - b);
    return { totalMs: Math.round(performance.now() - t0), quadros: f.length, medio: +(f.reduce((a, b) => a + b, 0) / f.length).toFixed(0), p95: +f[Math.floor(f.length * 0.95)].toFixed(0) };
  };
  const style = document.createElement('style');
  document.head.appendChild(style);
  const variants = (window.__VARIANTS__ ? JSON.parse(window.__VARIANTS__) : null) || [
    ['base', ''],
    ['sem backdrop', '#backdrop{display:none!important}'],
    ['backdrop em camada própria', '#backdrop{will-change:transform;transform:translateZ(0)}'],
    ['backdrop sólido', '#backdrop{background:#08091b!important}'],
    ['base de novo', ''],
  ];
  const out = [];
  for (const [name, css] of variants) {
    style.textContent = css;
    await sleep(500);
    out.push({ ok: true, step: name, got: await measure() });
  }
  style.remove();
  return out.map((o) => ({ ...o, step: 'métricas ' + o.step }));
})();
