# Erros e soluções

| Data | Erro | Causa | Solução |
|---|---|---|---|
| 2026-11-01 | `git commit`: *Author identity unknown* | Máquina sem `user.name`/`user.email` globais | Identidade configurada só no repositório (`git config` local) |
| 2026-11-01 | `tizen package`: *No argument is allowed: SAMSUNG\build* | Caminho do projeto tem espaço e o `.bat` roda via `cmd` | `build.mjs` põe aspas nos argumentos e chama `cmd /d /s /c` explicitamente |
| 2026-11-01 | `sdb shell 0 debug <app>` não retorna | O app já estava aberto | Encerrar antes com `sdb shell 0 was_kill <pacote>` (já incluído no `tv.mjs debug`) |
| 2026-11-01 | `Page.captureScreenshot` sem resposta | O inspector do Tizen 6.0 não implementa screenshot | Visual conferido no `npm run preview`; função conferida na TV via `eval`/`key` |
| 2026-11-01 | Dois elementos com foco visual ao trocar de tela/abrir diálogo | `setRoot`/`pushScope` não tiravam a classe do foco anterior | O FocusManager limpa a classe ao trocar e empilhar escopos |
| 2026-11-01 | Ao voltar de uma seção, o foco ia para o botão padrão, não para o item de origem | `popToRoot` reativava a raiz mesmo já estando nela, e o último foco no menu era descartado por estar fora da tela | `popToRoot` não faz nada na raiz; o roteador aceita último foco em qualquer ponto do shell |
| 2026-11-01 | Navegação a ~16 fps na TV | Sombra com desfoque de 36 px no foco, transição de `width` no menu (layout a cada quadro) e repaint de gradientes | Anel de foco sem desfoque, menu sem animação de largura, tiles com cor sólida → ~60 fps |
| 2026-11-01 | Teste de DOM do FocusManager | `offsetParent` não existe em DOM simulado e happy-dom seria dependência nova | Foco validado por roteiro no navegador e na TV via CDP |
| 2026-11-01 | `exemplo.com:8080` rejeitado como URL | A regex de esquema via `exemplo.com:` como esquema | Só conta como esquema se houver `://`; esquemas perigosos sem barras (`javascript:`, `data:`, ...) são rejeitados explicitamente |
| 2026-11-01 | Porta 8090 ocupada ao subir o mock | Outro processo da máquina já usava a porta | Mock aceita porta por argumento (usando 8097) |
| 2026-11-01 | `eval` dos roteiros no preview bloqueado | A CSP do app proíbe `unsafe-eval` (comportamento desejado) | Preview carrega os roteiros por `<script>` da mesma origem (`/e2e/`, só no servidor de dev); na TV via CDP |
| 2026-11-01 | Cancelar teste lento levava 2,6 s na TV | O `fetch` abortado do Tizen demora a rejeitar | `withBusy` fecha e devolve `null` na hora do Back, sem esperar a tarefa |
| 2026-11-01 | Parser M3U: o resto de uma linha gigante virava a URL do canal anterior | O descarte cortava só o pedaço atual | Estado `discarding` até a próxima quebra de linha |
| 2026-11-01 | Cancelamento não interrompia o download do corpo | `fetchWithTimeout` desligava o vínculo com o `signal` depois dos cabeçalhos | `streamText` corre a leitura contra o abort |
| 2026-11-01 | `tsc` falhava nos testes que usam `node:http` | Sem `@types/node`, que seria dependência nova | Typecheck cobre `src/`; os testes rodam no vitest |
| 2026-11-01 | Interface travava 1,4–3,8 s durante as importações na TV | IndexedDB na thread principal com o banco grande | Worker de dados exclusivo; a interface usa RPC (`DataClient`) |
| 2026-11-01 | Abertura do app e limpeza lentas (9 s+) | Varredura `nextunique` no índice de 100 mil canais | Registro `gens`; índice `gk` dos canais removido (v4), e a importação ficou 14% mais rápida |
| 2026-11-01 | Apagar 60 mil itens em fatias levou 200 s | No Tizen o custo do IndexedDB é por transação | `delete` único por intervalo, só no worker |
| 2026-11-01 | Inspector caiu (ECONNRESET) durante os testes longos | O app ficou preso na varredura do índice (item acima) | Resolvido pelas mudanças acima; o `tv.mjs` tem timeouts configuráveis |
| (anterior) | `tizen install`: `[target]: null` | TV não conectada no SDB | `build.mjs --install` roda `sdb connect` antes |
| 2026-11-01 | Roteiro do player: CH±, Info e Pausa sem efeito | `T.press` não conhecia `chUp`/`info`/`playPause` e mandava código 0 | Mapa de teclas completo no helper; tecla desconhecida agora gera erro no roteiro |
| 2026-11-01 | Lista de canais rolava a ~1 quadro/s na TV | Fundo com gradientes radiais em tela cheia repintado a cada mudança por cima; logos trocados a cada seta | Fundo sólido (medido por variações de CSS); logos só carregam com a lista parada 300 ms |
| 2026-11-01 | Teclado: Maiúsculas e voltar dos símbolos com o mesmo rótulo "abc"; atalhos viravam `HTTP://` | Rótulo da tecla de shift; caixa aplicada aos atalhos | Shift = "Aa"/"AA"; atalhos nunca mudam de caixa |
| 2026-11-01 | Primeira busca levou 42 s com 88 mil canais | Índice de busca montado lendo canal por canal (cursor) | Índice gravado na importação num único registro (`search`, v7) |
| 2026-11-01 | "Todos os canais" levava 13 s para abrir com 88 mil | `getAllKeys` no índice composto `[gk, kind]` | Ids vêm do registro de busca |
| 2026-11-01 | Lista vazia logo depois de atualizar uma lista grande | Leituras esperavam o delete da geração antiga (~25 s) | Limpeza só depois de 60 s sem tecla (`IdleTasks`) |
| 2026-11-01 | Número pelo controle demorava mais de 4 s com lista grande | Buscava os 88 mil ids antes de abrir o player | Abre na hora; o CH± usa o vizinho no banco |
| 2026-11-01 | TV ao vivo abria numa categoria vazia | Restaurava a última categoria mesmo vazia | Categoria lembrada vazia cai em "Todos os canais" |
| 2026-11-01 | App fechava sozinho ao trocar de canal rápido com a mini janela (lista real) | O AVPlay derruba o app se recebe stop/close/open ou setDisplayRect com um `prepareAsync` pendente | Operações do AVPlay em fila: durante o preparo só a última pedida fica guardada; vigia de 30 s se o preparo nunca responder (teste `avplay.test.ts`) |
| 2026-11-01 | CH± não saía do canal quando "Assistir TV" retomava recentes com 1 só canal | Cópia do canal nos recentes não tem posição (order 0); o vizinho da posição 0 era o próprio canal 1 | Sem posição, acha o canal na lista pelo número antes de pedir o vizinho |
| 2026-11-01 | Guia abria em "Favoritos" vazio | Categoria inicial "guide" não existe; caía na primeira da lista | Guia usa a mesma categoria lembrada da TV ao vivo |
| 2026-11-01 | Roteiro de teste: lista do mock não cadastrava (`tecla não encontrada: C`) | Git Bash converte `/lista-epg.m3u` em `C:/Program Files/Git/...` | `MSYS_NO_PATHCONV=1` ao passar caminhos em variáveis E2E_ |
| 2026-11-01 | Filmes → "Todos" levava ~11,5 s com 37 mil filmes | `getAllKeys` no índice `[gk, kind]` (mesmo caso dos canais) | Ids de filmes e séries gravados no registro de busca na importação |
| 2026-11-01 | Categoria de filmes com o mesmo nome de uma ao vivo misturava itens | Índice `[gk, group]` sem o tipo | Índice `[gk, kind, group]` (v9) substitui o antigo |
| 2026-11-01 | Guia baixado com a TV ao vivo aberta não aparecia | A tela usava a cópia da fonte de quando abriu | Lê a fonte atual e escuta mudanças da fonte |
| 2026-11-01 | Roteiro começou antes do app abrir depois de atualizar | Migração do banco na primeira abertura | Roteiros esperam a barra lateral; limitação registrada |
| 2026-11-01 | Buffer "grande" deixava a abertura em ~25 s e os saltos travavam | `PLAYER_BUFFER_FOR_PLAY` atrasa o início no AVPlay | Só o buffer de retomada (`FOR_RESUME`), 5 s |
| 2026-11-01 | Roteiros seguintes falhavam depois do m9 | O m9 deixava buffer grande salvo | O roteiro desfaz as opções pelo próprio menu |
| 2026-11-01 | Canal travava em "conectando" | Consulta de faixas (`info()`) durante o `prepareAsync` | `info()` só responde com o vídeo pronto |
| 2026-11-01 | Reabrir o stream (buffer/formato) levava ~24 s | Abrir a mesma URL logo depois de fechar trava o AVPlay até o timeout; a nova tentativa, 1,5 s depois, abria rápido | `PlaybackSession.restart`: fecha, espera 1 s e reabre |
| 2026-11-01 | Roteiro de filmes falhava com posição guardada | Rodada interrompida deixou retomada salva e o diálogo apareceu | Roteiro escolhe "Começar do início" se perguntar |
| 2026-11-01 | Roteiro: confirmação do PIN digitada na caixa anterior | A caixa do PIN fecha 150 ms depois do 4º dígito | Roteiro espera uma caixa de PIN vazia |
| 2026-11-01 | Roteiro: `dialog()` lia um diálogo de saída esquecido por baixo | Helper pegava o primeiro diálogo do DOM | Helper lê a camada de cima |

## Busca global lenta na primeira vez (marco 11)

- **Sintoma:** a primeira busca na lista real levava 17–21 s na TV, e a segunda ainda ~3,5 s.
- **Causa:** filmes e séries não tinham índice de busca gravado (varrer 47 mil itens com cursor levava ~16 s), o guia era varrido inteiro a cada busca (~4–12 s), e o cache de VOD expulsava o índice de séries quando o aquecimento e a busca montavam o mesmo índice ao mesmo tempo.
- **Solução:**
  - o texto normalizado de filmes e séries agora é gravado na importação, no mesmo registro do índice ao vivo;
  - os títulos do guia das próximas horas ficam em memória no worker (refeitos a cada 1 h);
  - os índices começam a ser montados quando a tela de busca abre;
  - montagens em andamento são compartilhadas por promessa.
- **Resultado medido:** 1ª busca ~7,7 s (só o guia; filmes e séries em 0,4 s), e as seguintes em ~80 ms. Listas importadas antes disso usam a varredura lenta até a próxima atualização.

## `performance.memory` não serve para medir vazamento na TV (marco 12)

- **Sintoma:** o heap ficou cravado em 9,5 MB durante 100 trocas de canal.
- **Causa:** no Chromium sem memória precisa habilitada, `performance.memory` é arredondado e só atualiza de tempos em tempos.
- **Solução:** `node scripts/tv.mjs mem` agora força a coleta de lixo (`HeapProfiler.collectGarbage`) e lê `Performance.getMetrics` pelo CDP (`JSHeapUsedSize`, `Nodes`, `JSEventListeners`). Medido assim, sem a coleta aparecem milhares de nós que ainda iam ser coletados; com a coleta, os números ficam estáveis.

## Mini janela preta na TV ao vivo

- **Sintoma:** a mini janela ficava preta, embora o app achasse que estava tocando.
- **Causa:** o AVPlay responde PLAYING e manda um primeiro tempo (ex.: 9 ms) e, em alguns canais, fica segundos sem desenhar quadro (o tempo não anda). A janela virava transparente no PLAYING e o furo mostrava o plano de vídeo vazio.
- **Solução:** a sessão marca `progressing` quando o tempo do vídeo anda ≥ 300 ms. A janela só fica transparente com isso; antes mostra "Conectando…". Se o tempo nunca andar, o vigia de travamento (15 s) reabre o stream.
- **Como diagnosticar:** `webapis.avplay.getCurrentTime()` duas vezes com intervalo, via `tv.mjs eval`. `Page.captureScreenshot` não responde na TV, então não há captura de tela.
- **Causa real (confirmada olhando a TV):** o modo `PLAYER_DISPLAY_MODE_LETTER_BOX` não desenha nada num retângulo menor que a tela na UN50AU7700. Num teste com o app escondido e janela de 960×540, `FULL_SCREEN` e `AUTO_ASPECT_RATIO` mostraram a imagem e `LETTER_BOX` não.
- **Solução definitiva:** com retângulo (mini janela), `displayBox` usa `AUTO_ASPECT_RATIO`; a tela cheia continua com `LETTER_BOX`, que lá funciona. A espera por `progressing` continua valendo para não mostrar o furo vazio enquanto conecta.

## Gravação e download no pendrive: escrever pelo JS é lento demais

- **Medido na TV:** `FileHandle.writeData` (também a versão não bloqueante) grava ~0,65 MB/s, e a bloqueante trava a interface por ~1,6 s a cada 1 MB. `writeBlob` falha (a TV tenta carregar o blob por XHR).
- **Solução:** API de Download nativa (`tizen.download`, privilégio `http://tizen.org/privilege/download`): 9,2 MB/s, fora da thread da interface. Para gravar canal ao vivo, o app "baixa" o stream TS sem fim, e parar = `cancel()`. Conferido na TV: o cancelamento mantém o arquivo parcial.
- **Limites:** só stream TS (canais Xtream gravam pela URL `.ts` mesmo se assistidos em HLS; M3U só com HLS não grava); até 3 trabalhos ao mesmo tempo; tudo para se o app fechar. Muitos provedores limitam conexões: gravar um canal e assistir outro usa 2.

## Gravar não funcionava com pendrive conectado

- **Causa 1:** a API de Download recusa a raiz virtual do pendrive (`removable_sda1` → `InvalidValuesError`). Só aceita o caminho real, obtido com `tizen.filesystem.resolve('removable_sda1')`, que na UN50AU7700 é `/opt/media/USBDriveA1`.
- **Causa 2:** depois de `tizen.download.cancel()` a TV não chama `oncanceled`, então o app ficava achando que ainda gravava. Agora o trabalho é marcado como parado logo após o cancel. O arquivo gravado fica no pendrive.
- `createDirectory` dá `IOError` quando a pasta já existe; é tratado como sucesso.

## ↑/↓ "apertava o ←" sozinho

- **Causa:** a navegação espacial aceitava alvos na diagonal. Na última linha de uma lista ou da grade, o ↓ ia para o menu lateral ou para as categorias.
- **Solução:** ↑/↓ só vai para alvos na mesma coluna. A única exceção é entre um botão do cabeçalho da tela e o conteúdo logo abaixo; nunca para o menu lateral.

## Pausar e continuar logo depois de pausar reabria o canal

- **Causa:** a pausa durante o buffering não registrava a hora da pausa (`pausedAt` = 0). Ao continuar, o app achava que a pausa tinha passado de 1 minuto e reabria o canal para voltar ao vivo.
- **Solução:** registrar a hora também quando a pausa acontece em buffering. Pego pelo m5.
