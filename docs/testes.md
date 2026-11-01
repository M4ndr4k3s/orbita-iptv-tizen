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

## Marco 4: importação em stream e listas grandes (2026-11-01)

| Teste | Onde | Resultado |
|---|---|---|
| Unitários | local | 54/54: parser M3U em qualquer corte de pedaço, linha gigante, JSON em stream, classificação ao vivo/filme/série, higienização de logo/URL, deduplicação, teto de itens, mapeamento Xtream, `runImport` contra servidor HTTP real (stream, não-M3U, Xtream, credencial recusada, cancelamento de download pendurado) |
| `m3-lists.js` (regressão) | preview | 22/22 |
| `m4-import.js` | preview | 12/12 |
| `m4-import.js` | **TV** | **12/12** (3ª rodada, depois das correções abaixo) |

Medições na TV (UN50AU7700, Tizen 6.0), com o mock na rede local:

| Medida | Valor |
|---|---|
| M3U 100 mil itens (22 MB): do Salvar até o fim | 116–120 s |
| Xtream 100 mil canais: do Salvar até o fim | 144 s |
| Heap JS da página durante a importação | 9,5 MB, estável (o worker tem heap próprio, que esta medida não enxerga) |
| Fluidez durante a importação M3U | quadro médio 17,9 ms, p95 28 ms, pior 120 ms |
| Fluidez durante a importação Xtream | quadro médio 18,2 ms, p95 26 ms, **3 travadas de 2,4–3,0 s no começo** |
| Fechar o progresso ao cancelar | < 1 s |
| Remover lista de 100 mil itens | 24,7 s (em segundo plano, interface livre) |
| Apagar a geração parcial após cancelar | 176 s (em segundo plano) |

Problemas que a TV revelou, todos corrigidos e remedidos:
1. IndexedDB na thread principal travava a interface por 1,4–3,8 s com o banco grande. **Todo acesso ao banco foi para o worker.**
2. A varredura do índice para achar gerações levava 9 s. Troquei pelo registro `gens`.
3. Apagar em fatias de 5 mil levou 200 s. Voltei ao `delete` único por intervalo (no worker).
4. O cancelamento esperava o worker. Agora fecha na hora.
5. O worker apagava a geração parcial antes de avisar. Agora avisa primeiro.

**Risco residual do marco 4 (pendente):** com o banco grande e logo depois de apagar muitos registros, ainda houve 3 travadas de 2–3 s no começo da importação Xtream, mesmo sem a interface tocar no IndexedDB. A suspeita é a compactação interna do armazenamento do Tizen depois da exclusão em massa. Como cada atualização apaga a geração anterior (~100 mil itens), isso pode aparecer em toda atualização. Estratégia a avaliar: atualizar no lugar (sobrescrever ids e apagar só a sobra) em vez de geração nova, pesando o custo em atomicidade.

## Marco 5: player AVPlay (2026-11-01)

| Teste | Onde | Resultado |
|---|---|---|
| Unitários | local | 66/66; sessão de reprodução: conectar, primeiro quadro, novas tentativas com espera crescente, erro fatal sem repetir, timeout de início, stream congelado, fim de stream ao vivo, eventos depois do stop, pausa sem vigia; URL Xtream com credenciais codificadas e mascaramento para log |
| `m5-player.js` | **TV** | 18/18 (lista real do usuário + mock) |
| `m5-pause.js` | **TV** | 5/5 |

Medições na TV com a lista real (Xtream, canal 1080p H.264):

| Medida | Valor |
|---|---|
| Do "Assistir TV" até a imagem | 6,0–6,1 s (primeiro quadro do AVPlay em 5,4–5,6 s) |
| Troca de canal (CH+) até tocar | 4,8–5,1 s |
| Canal quebrado: tentativas até mostrar o erro | 12,1 s (3 tentativas) |
| Heap antes e depois de 15 trocas seguidas | 9,5 → 9,5 MB |

Coberto: abrir em tela cheia (menu some), CH+/CH− (com volta ao início da lista), três trocas rápidas abrindo só o último canal, número pelo controle, Info, Play/Pause (estado `PAUSED` no AVPlay e sem reconexão indevida em 20 s pausado), Back parando o AVPlay, canal quebrado (reconexão → erro claro → "Próximo canal").

Não testado: queda de rede no meio do canal (só o vigia de stream congelado, no teste unitário); app em segundo plano e de volta (suspend/restore), que exige a tecla Home física; troca de canal mais rápida que ~5 s, que depende do servidor e do buffer inicial do AVPlay (ajustes de buffer ficam para o marco 9).
