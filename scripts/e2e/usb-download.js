// Pendrive: Baixar na tela de detalhes do filme, progresso em Configurações →
// Gravações e downloads, parar pela tela (o arquivo pela metade é apagado).
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
  await activate('Configurações');
  await until(() => q('.set-row[data-id="recordings"]'), 5000);
  q('.set-row[data-id="recordings"]').click();
  await until(() => q('.rec-row'), 5000);
  const row=q('.rec-row'); const info=row.textContent;
  check('tela Gravações mostra o download com progresso', /Em andamento/.test(info) && /MB/.test(info), info.slice(0,160));
  row.click();
  await until(() => /Parar/.test(dialog() || ''), 3000);
  [...document.querySelectorAll('.dlg-box .btn')].find(b=>/^Parar$/.test(b.textContent)).click();
  await sleep(2000);
  const after=q('.rec-row').textContent;
  check('parar o download marca Parado', /Parado/.test(after), after.slice(0,160));
  const name=(after.match(/^(.*?\.(mp4|mkv|avi|ts))/)||[])[1];
  const exists = name ? tizen.filesystem.pathExists('/opt/media/USBDriveA1/Orbita/'+name) : 'sem nome';
  check('download parado apaga o arquivo pela metade', exists === false, [name, exists]);
  await activate('Início');
  return out.concat([{ok:true,step:'métricas',got:{title}}]);
})();
