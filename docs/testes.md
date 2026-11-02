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

## Marco 6: TV ao vivo, favoritos, histórico e busca (2026-11-01)

| Teste | Onde | Resultado |
|---|---|---|
| Unitários | local | 76/76 (inclui rolagem da lista virtual, índice de busca gravado na importação, agendador de tarefas ociosas) |
| `m6-live.js`, lista real (2.822 canais) | **TV** | 20/20 |
| `m6-live.js`, mock com 88 mil canais | **TV** | 20/20 |
| `m6-persist.js` (reiniciar app + reimportar lista) | **TV** | 7/7 |
| `m6-idle-cleanup.js` (limpeza só com o usuário parado) | **TV** | 4/4 (apagou 84 s depois de parar, e não antes) |
| `m5-player.js` (regressão) | **TV** | 18/18 |

Medições na TV:

| Medida | Antes | Depois |
|---|---|---|
| Rolagem da lista (quadro médio, lista real) | ~1.150 ms | **17,9–20,9 ms** (p95 26–37 ms) |
| Rolagem com 88 mil canais | — | **16,4–16,8 ms** (p95 17–19 ms) |
| Custo do handler de cada seta | — | 2,2–2,9 ms |
| Abrir "Todos os canais" com 88 mil | 13 s | ~0,3 s |
| Primeira busca com 88 mil | 42 s | 0,3–0,6 s (seguintes: ~50 ms) |
| Nós no DOM na tela (qualquer tamanho de lista) | — | ~124–136 |
| Heap JS | — | 9,5–10,7 MB |

Experimento que achou a causa da rolagem lenta (`scripts/e2e/perf-scroll.js`): o mesmo roteiro com o fundo de gradientes radiais deu 37–95 ms de quadro médio e 4,7–10,9 s no total; sem o fundo, ou com fundo sólido, 17–18 ms e 2,2 s. Pôr o fundo numa camada própria da GPU não resolveu (35 ms).

Ainda não testado: guia rápido de programação no OSD, que depende do EPG (marco 7); controle físico; visual na tela da TV.
Limitação conhecida: categoria ao vivo e categoria VOD com o mesmo nome compartilham o índice `gk_group`, então itens VOD podem aparecer nessa categoria ao vivo. É raro; a correção é incluir o tipo no índice.

## Marco 7: guia de programação (EPG) e mini janela (2026-11-01)

| Teste | Onde | Resultado |
|---|---|---|
| Unitários | local | 96/96 (parser XMLTV com qualquer ponto de corte, entidades, CDATA, elemento gigante; .gz; janela de 4 dias; limites; erros; URL do guia; fila do AVPlay) |
| `m7-epg.js`, mock com guia .gz no cabeçalho da lista | **TV** | 17/17 |
| `m5-player.js` (regressão) | **TV** | 18/18 |
| `m6-live.js` (regressão) | **TV** | 20/20 |
| Guia da lista real (Xtream `xmltv.php`) | **TV** | 19.600 programas de 297 canais, 10 MB, 20,7 s em segundo plano |
| Estresse: 35 trocas com a mini janela em intervalos de 0,3–4 s, lista real | **TV** | sem queda do app; heap +0 MB |

Medições na TV:

| Medida | Valor |
|---|---|
| Rolagem da lista com vídeo na mini janela | p50 17 ms, p95 24–34 ms por quadro |
| Parar num canal até o vídeo aparecer na janela | 3,6–6,5 s (0,8 s de espera + abertura do stream) |
| Janela → tela cheia | sem reconectar (stream continua) |
| Heap JS | ~10 MB |

Não testado: guia muito grande (centenas de MB); visual na tela física; controle físico. Na lista real, só 297 dos canais têm guia — os 40 primeiros de "Todos os canais" não tinham programação no XMLTV do provedor.

## Marco 8: filmes e séries (Xtream) (2026-11-01)

| Teste | Onde | Resultado |
|---|---|---|
| Unitários | local | 108/108 (detalhes de filme/série com dados estranhos, retomada, importação VOD com falha parcial, URL de filme/episódio) |
| `m8-vod.js`, conta Xtream do mock (60 filmes, 12 séries) | **TV** | 22/22 |
| Regressões `m5-player`, `m6-live`, `m7-epg` | **TV** | 18/18, 20/20, 17/17 |
| Lista real atualizada com VOD | **TV** | 2.822 canais, 36.867 filmes e 9.993 séries em ~100 s; quadro p50 17 ms / p95 27–30 ms durante a importação |
| Filme e episódio reais | **TV** | tocaram (8,2 s e 5,6 s até a imagem; duração lida do stream) |

Medições na TV (lista real):

| Medida | Antes | Depois |
|---|---|---|
| Abrir Filmes → "Todos" (36.867) | ~11,5 s | **0,6 s** |
| Trocar de categoria de filmes (480–610 itens) | — | ~0,5 s (inclui 250 ms de espera da seleção) |
| Filme do mock até tocar / episódio | — | 2,7 s / 1,5 s |
| Heap JS | — | ~10 MB |

Não testado: legendas e faixas de áudio (marco 9); filmes de listas M3U (tocam pelo mesmo player, sem detalhes); retomada depois de reiniciar o app (usa o mesmo localStorage dos ajustes, testado só na unidade).
Limitação: na primeira abertura depois de atualizar o app, a migração do banco (novo índice por tipo+categoria) deixa a tela vazia por alguns segundos.

## Marco 9: opções de reprodução (áudio, legendas, proporção, buffer) (2026-11-01)

| Teste | Onde | Resultado |
|---|---|---|
| Unitários | local | 119/119 (proporção → retângulo, texto de legenda sem marcação, idiomas, preferências inválidas, `restart` da sessão) |
| `m9-options.js` (botão verde, mock com HLS de teste) | **TV** | 10/10 |
| Regressões `m5-player`, `m7-epg`, `m8-vod` | **TV** | 20/20, 17/17, 22/22 |

Medições na TV:

| Medida | Antes | Depois |
|---|---|---|
| Reabrir o stream ao mudar buffer/formato | ~24 s | **3,4–6,2 s** |
| Legenda aparece depois de ligada | — | imediata (próxima fala) |

Não testado: troca entre várias faixas de áudio (o stream de teste só tem uma faixa de áudio e uma de legenda, em inglês); formato HLS do Xtream ao vivo em conta real.

## Marco 10: configurações, controle parental, idioma e backup (2026-11-01)

| Teste | Onde | Resultado |
|---|---|---|
| Unitários | local | 134/134 (PIN só como hash com salt, bloqueio crescente, storage adulterado, PBKDF2 real, backup inválido/malicioso, traduções completas com os mesmos marcadores) |
| `m10-settings.js` (PIN, categoria bloqueada, PIN errado, backup exportar/importar, desativar) | **TV** | 21/21 |
| `ux-feedback.js` (mini janela 628×352 tocando o canal, botões na tela dos players, grade de cartazes, apagar histórico) | **TV** | 21/21 — janela toca em ~5,1 s, troca em ~3,2 s |
| `m10-language.js` (pt-BR → English → pt-BR) | **TV** | menu e `lang` trocados após recarregar |

Medições na TV: PBKDF2 com 100 mil iterações ~750 ms; salvar PIN ~1,2 s e conferir ~1,6 s (com o aviso "Conferindo…").

Não testado: backup em pendrive (sem pendrive na TV; testado na pasta Downloads); bloqueio de categorias de filmes/séries na TV (mesma lógica do ao vivo, coberta na unidade).
