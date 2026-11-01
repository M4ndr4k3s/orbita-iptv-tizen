// Confere que gerações antigas são apagadas quando o usuário fica parado
// (60 s sem teclas + verificação a cada 15 s), e não antes.
window.__E2E__ = (async () => {
  const { sleep, press } = T;
  const out = [];
  const check = (step, cond, got) => out.push({ ok: !!cond, step, got });
  const count = () => new Promise((resolve) => {
    const q = indexedDB.open('orbita');
    q.onsuccess = () => {
      const db = q.result;
      const tx = db.transaction(['gens', 'sources'], 'readonly');
      const r = {};
      tx.objectStore('gens').getAll().onsuccess = (e) => { r.gens = e.target.result.map((g) => g.id); };
      tx.objectStore('sources').getAll().onsuccess = (e) => { r.inUse = e.target.result.filter((s) => s.import).map((s) => s.import.gk); };
      tx.oncomplete = () => { db.close(); resolve(r); };
    };
  });
  const orphans = (r) => r.gens.filter((g) => r.inUse.indexOf(g) < 0).length;
  const before = await count();
  check('há geração antiga esperando limpeza', orphans(before) > 0, before);
  press('down'); // marca atividade agora
  await sleep(30000);
  const mid = await count();
  check('com atividade recente (30 s) ainda não limpou', orphans(mid) === orphans(before), mid);
  const t0 = Date.now();
  let after = mid;
  for (let i = 0; i < 40 && orphans(after) > 0; i++) { await sleep(5000); after = await count(); }
  check('parado, a geração antiga é apagada', orphans(after) === 0, after);
  out.push({ ok: true, step: 'métricas limpeza', got: { segundosAteLimpar: Math.round((Date.now() - t0) / 1000) + 30 } });
  return out;
})();
