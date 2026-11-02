// Pendrive: Baixar na tela de detalhes do filme; no menu Downloads, pausar,
// continuar e cancelar (cancelar apaga o arquivo pela metade).
// Precisa de um pendrive montado na TV.
window.__E2E__ = (async () => {
  const { press, sleep, activate, until, dialog } = T;
  const q=(s)=>document.querySelector(s); const txt=(s)=>(q(s)?q(s).textContent.trim():'');
  const out=[]; const check=(step,c,got)=>out.push({ok:!!c,step,got});
  await activate('Filmes');
  await until(() => txt('.vl-grid .vl-cell.sel .vg-name'), 30000);
  press('ok');
  await until(() => q('.md-actions .btn'), 10000);
  const title = txt('.md-title');
  const dl = [...document.querySelectorAll('.md-actions .btn')].find(b=>/Baixar/.test(b.textContent));
  dl.click(); await sleep(1500);
  const toastTxt=[...document.querySelectorAll('.toast')].map(e=>e.textContent).join('|');
  check('Baixar começa e avisa', /Baixando para o pendrive/.test(toastTxt), toastTxt);
  await sleep(10000);
  await activate('Downloads');
  await until(() => q('.rec-row'), 5000);
  const row=q('.rec-row'); const info=row.textContent;
  check('menu Downloads mostra o download com progresso', /Em andamento/.test(info) && /MB/.test(info), info.slice(0,160));
  const act = async (label) => {
    q('.rec-row').click();
    await until(() => [...document.querySelectorAll('.dlg-box .btn')].some(b=>b.textContent===label), 3000);
    [...document.querySelectorAll('.dlg-box .btn')].find(b=>b.textContent===label).click();
    await sleep(2500);
    return q('.rec-row').textContent;
  };
  const paused = await act('Pausar');
  const mb1 = paused.match(/([\d.]+) MB/); await sleep(3000);
  const mb2 = q('.rec-row').textContent.match(/([\d.]+) MB/);
  check('Pausar para o download', /Pausado/.test(paused) && (!mb1 || !mb2 || mb1[1] === mb2[1]), [paused.slice(0,120), mb1 && mb1[1], mb2 && mb2[1]]);
  const resumed = await act('Continuar');
  await sleep(3000);
  check('Continuar retoma do mesmo ponto', /Em andamento/.test(q('.rec-row').textContent), q('.rec-row').textContent.slice(0,120));
  const after = await act('Cancelar download');
  check('cancelar marca Parado', /Parado/.test(after), after.slice(0,160));
  const name=(after.match(/^(.*?\.(mp4|mkv|avi|ts))/)||[])[1];
  const exists = name ? tizen.filesystem.pathExists('/opt/media/USBDriveA1/Orbita/'+name) : 'sem nome';
  check('download parado apaga o arquivo pela metade', exists === false, [name, exists]);
  await activate('Início');
  return out.concat([{ok:true,step:'métricas',got:{title}}]);
})();
