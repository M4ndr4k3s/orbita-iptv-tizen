// Remove da TV as listas de teste do mock (nome começando com "mock" ou "player").
window.__E2E__ = (async () => {
  const { press, sleep, activate, until, dialog } = T;
  const out = [];
  await until(() => document.querySelector('.sb-item') && !dialog(), 20000);
  for (let i = 0; i < 3 && window.__orbitaPlayer; i++) { press('back'); await sleep(800); }
  await activate('Listas');
  for (let guard = 0; guard < 10; guard++) {
    const card = [...document.querySelectorAll('.src-card')].find((c) => /^(mock|player)/.test(c.querySelector('.src-name').textContent));
    if (!card) break;
    const name = card.querySelector('.src-name').textContent;
    card.click(); await sleep(200);
    await activate('Remover'); await sleep(200);
    [...document.querySelectorAll('.dlg-box .btn')].find((b) => /Remover/.test(b.textContent)).click();
    await sleep(800);
    out.push({ ok: true, step: 'removida: ' + name });
  }
  const left = [...document.querySelectorAll('.src-card .src-name')].map((e) => e.textContent);
  out.push({ ok: left.every((n) => !/^(mock|player)/.test(n)), step: 'listas restantes', got: left });
  return out;
})();
