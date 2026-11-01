# Registro de testes

## Marco 1: esqueleto, build e deploy (2026-11-01)

TV: UN50AU7700GXZD, Tizen 6.0, via `scripts/tv.mjs`.

| Teste | Resultado |
|---|---|
| `tsc --noEmit` | OK |
| `npm audit` | 0 vulnerabilidades |
| `npm run tv` (empacotar, assinar, instalar e abrir) | OK, instalação em ~15 s |
| App abre na TV | OK, tela de diagnóstico renderizada |
| Ambiente reportado | Tizen 6.0, viewport 1920x1080, AVPlay disponível |
| `registerKey` | 25/25 teclas registradas (mídia, CH±, cores, Info, Guide, ChannelList, 0–9) |
| Teclas simuladas via CDP (down, ok, playPause, chUp, red, back) | Todas recebidas e mapeadas corretamente |
| Memória em repouso | heap 9,5 MB de um limite de 368 MB; 54 nós no DOM |
| Preview no navegador (1920x1080) | OK |

Pendente: teclas apertadas no **controle físico**, que exigem alguém na frente da TV. Foram validadas só por simulação.

Observação: `webapis.productinfo` devolveu vazio (modelo/firmware "-"). O modelo veio do SDB. Ainda não investiguei se é questão de privilégio.

## Marco 2: design system, navegação por foco, tela inicial (2026-11-01)

| Teste | Onde | Resultado |
|---|---|---|
| `tsc --noEmit` / `vitest` | local | OK, 10 testes (navegação espacial e mapa de teclas) |
| Início → trilho → rolagem até o último atalho | preview e TV | OK; o trilho rola e o foco fica visível |
| Conteúdo → menu (←) cai na seção ativa; menu expande | preview e TV | OK |
| OK em item do menu/tile abre a seção; Back volta com foco no item de origem | preview e TV | OK (após correção, ver erros) |
| Back na raiz abre "Sair do Órbita?", Back fecha, foco preso no diálogo | preview e TV | OK |
| Nunca mais de 1 elemento com foco visual | preview e TV | OK (após correção) |
| 6 teclas a cada 120 ms via CDP | TV | 6/6 `keydown` recebidos, foco correto |
| Custo do handler de tecla | TV | 3,5 ms por tecla |
| FPS parado | TV | 17,7 ms/quadro (~57 fps) |
| FPS navegando no trilho, **antes** da otimização | TV | média 60 ms, p95 165 ms (~16 fps) ❌ |
| FPS navegando no trilho, **depois** | TV | média 15,8–17,1 ms, p95 27–37 ms ✅ |
| FPS navegando no menu, depois | TV | média 17 ms, p95 28 ms ✅ |
| Memória | TV | heap 9,5 MB; 112 nós no DOM |

Pendente: conferir o visual **na tela da TV** (o inspector não tira screenshot) e testar com o controle físico.

## Marco 3: gerenciamento de listas (2026-11-01)

Servidor de teste local: `node scripts/mock-iptv.mjs 8097` (M3U sintética, login Xtream fictício, HTML, rota lenta). Não usei nenhum servidor IPTV de terceiros.

| Teste | Onde | Resultado |
|---|---|---|
| Unitários (`vitest`) | local | 33/33: URL (esquemas perigosos, `host:porta`, limites), validação de fonte, serviço de listas (inclui recarga = reinício), settings corrompidas, parser de login Xtream, detecção de M3U |
| `scripts/e2e/m3-lists.js` | preview | 20/20 |
| `scripts/e2e/m3-lists.js` | **TV** | 20/20 (duas rodadas, a segunda depois da mudança no `withBusy`) |
| `scripts/e2e/m3-cancel.js` | **TV** | 4/4 depois da correção (antes: Back levava 2,6 s para fechar) |
| Persistência: encerrar o app e reabrir | **TV** | 2 listas, lista ativa e status preservados; tela "Qual lista você quer usar?" aparece |
| Reinstalar por cima (`npm run tv`) | **TV** | dados preservados |
| Memória com 2 listas | **TV** | heap 9,5 MB; 113 nós no DOM |

O que o roteiro e2e cobre: validação de obrigatórios; digitação pelo teclado virtual (teclas, dígitos do controle, vermelho = apagar, verde = concluir); M3U válida; conteúdo não-M3U; Xtream com senha errada, certa e conta vencida; aviso de HTTP sem TLS; senha mascarada; duplicata; menu de ações; troca de lista ativa; Back; foco único.

Não testado: servidor real com HTTPS e certificado inválido; listas com milhares de canais (vem no marco 4).
