// Favoritos persistem após reiniciar o app e após reimportar a lista.
// E2E_STAGE=1: marca favorito e reimporta. E2E_STAGE=2 (depois de reiniciar): confere e limpa.
window.__E2E__ = (async () => {
  const { press, sleep, activate, until, dialog, afterImport } = T;
  const out = [];
  const check = (step, cond, got) => out.push({ ok: !!cond, step, got });
  const sel = (s) => { const r = document.querySelector(s + ' .vl-row.sel'); return r ? r.textContent.trim() : ''; };
  const favCount = () => { const r = document.querySelector('.vl-cats .vl-row'); return r ? r.textContent : ''; };
  const goLive = async () => {
    await activate('TV ao vivo');
    await until(() => sel('.vl-chans') && !document.querySelector('.vl-chans .vl-row.sel.loading'), 20000);
  };
  await until(() => document.querySelector('.sb-item') && !dialog(), 20000);

  if (window.__STAGE__ === '1') {
    await goLive();
    press('down'); await sleep(500);
    const name = sel('.vl-chans');
    press('yellow'); await sleep(1000);
    check('favorito marcado', /Favoritos\s*1/.test(favCount()), favCount());
    localStorage.setItem('e2e.fav', name);
    // reimporta: ids mudam, a chave do favorito (stream_id / URL) não
    await activate('Início');
    await activate('Atualizar lista');
    const r = await afterImport(120000);
    check('lista reimportada', /Lista carregada/.test(r || ''), r);
    await goLive();
    check('favorito continua após reimportar (contagem)', /Favoritos\s*1/.test(favCount()), favCount());
    return out;
  }

  const name = localStorage.getItem('e2e.fav') || '';
  await goLive();
  check('após reiniciar, Favoritos conta 1', /Favoritos\s*1/.test(favCount()), favCount());
  press('left'); await sleep(100);
  for (let i = 0; i < 40 && !/Favoritos/.test(sel('.vl-cats')); i++) { press('up'); await sleep(40); }
  press('ok'); await sleep(1200);
  check('o favorito é o mesmo canal', sel('.vl-chans') === name, [sel('.vl-chans'), name]);
  check('linha mostra a estrela', !!document.querySelector('.vl-chans .vl-row.sel .cr-fav:not(.hidden)'), null);
  press('yellow'); await sleep(1200);
  check('favorito removido (limpeza do teste)', /Favoritos\s*0/.test(favCount()), favCount());
  localStorage.removeItem('e2e.fav');
  return out;
})();
