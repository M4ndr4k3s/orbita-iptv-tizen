// Marco 3: cadastrar M3U e Xtream pelo controle, erros de validação e de conexão.
// Requer o mock rodando: node scripts/mock-iptv.mjs 8097 ; E2E_MOCK=http://<ip-do-pc>:8097
// Publica em window.__E2E__ uma Promise com a lista de verificações { ok, step, got }.
window.__E2E__ = (async () => {
  const MOCK = window.__MOCK__;
  const { press, sleep, focused, screen, dialog, type, activate, until } = T;
  const out = [];
  const check = (step, cond, got) => out.push({ ok: !!cond, step, got });
  // abre o campo (OK no campo), digita no teclado virtual e conclui com o botão verde
  const fill = async (label, text, clearFirst) => {
    const tf = [...document.querySelectorAll('.tf')].find((f) => f.querySelector('.tf-label').textContent === label);
    if (!tf) throw new Error('campo não encontrado: ' + label);
    tf.querySelector('.tf-box').click();
    await sleep(100);
    if (clearFirst) await activate('Limpar');
    type(text);
    press('green');
    await sleep(100);
    return tf;
  };
  const save = () => document.querySelector('.form-actions .btn-primary').click();

  await activate('Listas');
  check('abre Listas pelo menu', screen() === 'Listas', screen());

  // 1) salvar vazio -> erros de validação nos obrigatórios
  press('ok'); await sleep(150);
  check('OK em "Adicionar lista" abre o formulário', screen() === 'Nova lista', screen());
  press('down'); await sleep(50);
  check('seta para baixo vai do tipo para o primeiro campo', focused() === 'Ex.: Casa', focused());
  save(); await sleep(150);
  const errs = [...document.querySelectorAll('.tf-error')].map((e) => e.textContent).filter(Boolean);
  check('validação: nome e URL obrigatórios', errs.length === 2, errs);

  // 2) M3U válida pelo teclado virtual
  await fill('Nome', 'casa');
  check('nome digitado aparece no campo', document.querySelector('.tf-value').textContent === 'casa', document.querySelector('.tf-value').textContent);
  await fill('URL da lista', MOCK + '/lista.m3u');
  save();
  await until(() => screen() === 'Listas');
  check('M3U testada, salva e volta para Listas', screen() === 'Listas', screen() + ' / ' + dialog());
  const card1 = document.querySelector('.src-card');
  check('card mostra "Conexão verificada" e "Ativa"', card1 && /Conexão verificada/.test(card1.textContent) && /Ativa/.test(card1.textContent), card1 && card1.textContent);

  // 3) URL que responde HTML -> "verificação falhou" -> Corrigir
  await activate('Adicionar lista');
  await fill('Nome', 'html');
  await fill('URL da lista', MOCK + '/pagina.html');
  save();
  await until(() => dialog() && /verificação falhou/.test(dialog()));
  check('conteúdo não-M3U detectado', /não é uma lista M3U/.test(dialog() || ''), dialog());
  press('ok'); await sleep(120); // botão primário = Corrigir
  check('Corrigir mantém o formulário', screen() === 'Nova lista' && !dialog(), screen());

  // 4) Xtream: senha errada recusada; senha certa salva
  await activate('Xtream Codes');
  check('trocar para Xtream preserva o nome', document.querySelector('.tf-value').textContent === 'html', document.querySelector('.tf-value').textContent);
  await fill('Servidor', MOCK);
  check('aviso de servidor sem HTTPS', /sem HTTPS/.test(document.querySelector('.form-warning').textContent), document.querySelector('.form-warning').textContent);
  await fill('Usuário', 'teste');
  const pw = await fill('Senha', 'errada');
  check('senha mascarada no campo', /^•+$/.test(pw.querySelector('.tf-value').textContent), pw.querySelector('.tf-value').textContent);
  await activate('Testar conexão');
  await until(() => dialog() && /Falha na conexão|Conexão OK/.test(dialog()));
  check('credencial errada recusada', /recusados/.test(dialog() || ''), dialog());
  press('ok'); await sleep(120);
  await fill('Senha', 'teste123', true);
  save();
  await until(() => screen() === 'Listas');
  check('Xtream salva (2 listas)', document.querySelectorAll('.src-card').length === 2, document.querySelectorAll('.src-card').length);

  // 5) conta vencida
  await activate('Adicionar lista');
  await activate('Xtream Codes');
  await fill('Nome', 'vencida'); await fill('Servidor', MOCK); await fill('Usuário', 'vencido'); await fill('Senha', 'teste123');
  await activate('Testar conexão');
  await until(() => dialog() && /Falha na conexão|Conexão OK/.test(dialog()));
  check('conta vencida informada', /não está ativa.*Expired/.test(dialog() || ''), dialog());
  press('ok'); await sleep(120);

  // 6) duplicata da M3U
  await activate('Lista M3U');
  await fill('Nome', 'dup', true);
  await fill('URL da lista', MOCK + '/lista.m3u');
  save(); await sleep(200);
  check('duplicata detectada', /já cadastrada/i.test(dialog() || ''), dialog());
  press('ok'); await sleep(120); // Cancelar
  press('back'); await sleep(150);
  check('Back no formulário volta para Listas', screen() === 'Listas', screen());

  // 7) ações do card: usar a 2ª lista
  const cards = [...document.querySelectorAll('.src-card')];
  cards[1].click(); await sleep(150);
  check('menu de ações abre', /Usar esta lista/.test(dialog() || ''), dialog());
  press('ok'); await sleep(150);
  check('2ª lista virou ativa', /Ativa/.test(document.querySelectorAll('.src-card')[1].textContent), document.querySelectorAll('.src-card')[1].textContent);

  check('nunca mais de um foco', focused().indexOf('!!') < 0, focused());
  return out;
})();
