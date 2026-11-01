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
