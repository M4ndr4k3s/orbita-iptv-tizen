// Marco 3: verificação lenta pode ser cancelada com Back sem travar a tela.
// Requer o mock (rota /lento.m3u responde só após 40 s). E2E_MOCK=http://<ip-do-pc>:8097
window.__E2E__ = (async () => {
  const MOCK = window.__MOCK__;
  const { press, sleep, screen, dialog, type, activate, until } = T;
  const out = [];
  const check = (step, cond, got) => out.push({ ok: !!cond, step, got });

  await activate('Listas');
  await activate('Adicionar lista');
  const field = (label) => [...document.querySelectorAll('.tf')].find((f) => f.querySelector('.tf-label').textContent === label);
  field('Nome').querySelector('.tf-box').click(); await sleep(100);
  type('lenta'); press('green'); await sleep(100);
  field('URL da lista').querySelector('.tf-box').click(); await sleep(100);
  type(MOCK + '/lento.m3u'); press('green'); await sleep(100);
  await activate('Testar conexão');
  await until(() => /Testando conexão/.test(dialog() || ''), 3000);
  check('indicador de carregamento aparece', /Testando conexão/.test(dialog() || ''), dialog());
  const t0 = Date.now();
  press('back');
  await until(() => !dialog(), 3000);
  check('Back cancela em menos de 1 s', !dialog() && Date.now() - t0 < 1000, { dialog: dialog(), ms: Date.now() - t0 });
  check('continua no formulário', screen() === 'Nova lista', screen());
  press('back'); await sleep(150);
  check('Back volta para Listas', screen() === 'Listas', screen());
  return out;
})();
