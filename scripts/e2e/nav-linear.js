// Navegação linear: ←/→ não sobe nem desce (fim de carrossel e da grade), e o menu
// lateral continua acessível pelos dois lados.
window.__E2E__ = (async () => {
  const { press, sleep, activate } = T;
  const q=(s)=>document.querySelector(s);
  const cur = () => q('.is-focused');
  const where = () => { const c = cur(); if (!c) return '-'; const r = c.closest('.prail, .sidebar, .home-hero, .vl'); return (r ? (r.querySelector('.rail-title') ? r.querySelector('.rail-title').textContent : r.className.split(' ')[0]) : '?') + ' @' + Math.round(c.getBoundingClientRect().top); };
  const out=[]; const check=(step,c,got)=>out.push({ok:!!c,step,got});
  // Início: último cartão do carrossel de filmes, → não pode sair da linha
  await activate('Início'); await sleep(3000);
  press('right'); await sleep(300); press('down'); await sleep(300); press('down'); await sleep(300);
  const rail = where();
  for (let i=0;i<25;i++){ press('right'); await sleep(120); }
  check('→ no fim do carrossel fica na mesma linha', where().split(' @')[0] === rail.split(' @')[0], [rail, where()]);
  // ← volta até o menu lateral
  for (let i=0;i<30 && !cur().closest('.sidebar');i++){ press('left'); await sleep(100); }
  check('← chega ao menu lateral', !!cur().closest('.sidebar'), where());
  // do menu, → entra no conteúdo
  press('right'); await sleep(300);
  check('→ sai do menu para o conteúdo', !cur().closest('.sidebar'), where());
  // grade de filmes: última coluna, → não desce
  await activate('Filmes'); await sleep(2500);
  press('right'); await sleep(300);
  const gtop = cur().getBoundingClientRect().top;
  for (let i=0;i<8;i++){ press('right'); await sleep(150); }
  check('→ na última coluna da grade fica na linha', Math.abs(cur().getBoundingClientRect().top - gtop) < 5 && !!cur().closest('.vl-grid'), [Math.round(gtop), Math.round(cur().getBoundingClientRect().top)]);
  // menu: item baixo (Sobre) → entra no conteúdo
  await activate('Sobre'); await sleep(1500);
  const side = cur() && cur().closest('.sidebar');
  press('right'); await sleep(300);
  check('→ do item Sobre (embaixo no menu) entra na tela', !side || !cur().closest('.sidebar'), where());
  await activate('Início');
  return out;
})();
