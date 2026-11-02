# Fase 2 — Arquitetura recomendada e plano

> Status: **proposta, aguardando aprovação** (stack, dependências e nome do produto).

## Decisões principais

| Tema | Decisão | Motivo |
|---|---|---|
| Tipo de app | Tizen Web Application (`.wgt`), perfil `tv-samsung`, `required_version="6.0"` | É o que a TV roda; perfil e certificado já existem |
| Linguagem | **TypeScript** compilado por **esbuild** com `target=chrome76` | Tipos nos parsers/serviços; esbuild gera ES2019 compatível com Chromium 76 |
| UI | Sem framework (componentes TS leves + DOM direto) | React/Vue custam CPU/RAM no ARMv7; navegação por foco é mais simples sem VDOM |
| Player | `webapis.avplay` como motor principal; `<video>` como fallback no navegador de dev | Hardware decode, faixas de áudio/legenda, 4K, HEVC |
| Persistência | IndexedDB (canais, VOD, EPG, histórico, progresso) + localStorage (config pequena) | Limite de ~5 MB do localStorage |
| Processamento pesado | Web Worker para parse M3U/XMLTV/Xtream | Não travar a UI |
| Listas grandes | Lista/grade **virtualizada** (só nós visíveis no DOM) | Memória e fluidez |
| Navegação | Gerenciador de foco espacial próprio (grupos, setas, memória de foco por tela) | Controle remoto em 100% da app |
| Estado | Store simples com assinaturas (pub/sub), um por domínio | Sem dependência; previsível |
| Testes | Unitários dos parsers/serviços no Node; testes reais na TV via SDB + Web Inspector | Parser e lógica são testáveis fora da TV |

## Dependências propostas (todas fixadas em lockfile)

| Pacote | Tipo | Para quê |
|---|---|---|
| `esbuild` | dev | build/transpilação para chrome76 |
| `typescript` | dev | checagem de tipos (`tsc --noEmit`) |
| `vitest` | dev | testes unitários |
| `fflate` | runtime (~8 KB) | descompactar XMLTV `.gz` em streaming (Chrome 76 não tem `DecompressionStream`) |

Nada mais. Fontes e ícones ficam embutidos (SVG próprio), sem CDN.

## Estrutura

```
src/
  app/          bootstrap, roteador de telas, ciclo de vida (visibilidade, Back/Exit)
  components/   card, lista virtual, grade virtual, modal, teclado virtual, toast, spinner, barra de progresso
  screens/      home, perfis, live, epg, favoritos, historico, filmes, series, detalhes,
                busca, listas, configuracoes, parental, sobre
  services/     playlistService, xtreamService, epgService, vodService, favoritesService,
                historyService, parentalService, backupService, i18n
  player/       PlayerEngine (interface), AvplayEngine, Html5Engine, recuperação/retry, faixas, proporção
  playlist/     parser M3U em stream, normalização, deduplicação, agrupamento
  epg/          parser XMLTV em stream, matching canal↔programa, janela de programação
  vod/          catálogo Xtream (filmes/séries/temporadas/episódios), retomada
  storage/      wrapper IndexedDB (lotes, índices), settings em localStorage, migrações de schema
  navigation/   FocusManager, keymap Samsung (registerKey), atalhos
  workers/      parse.worker.ts
  utils/        fetch com timeout/retry, escape HTML, datas, sanitização de URL
  styles/       tokens (cores/tipografia/espaçamento), componentes, telas
  assets/       logo, ícones SVG, fontes
tizen/          config.xml, ícones da loja
scripts/        build.mjs (bundle + package + install + run na TV)
tests/          unitários + fixtures (M3U/XMLTV sintéticos grandes)
docs/
```

Regras de dependência: `screens → services/components/navigation`; `services → storage/playlist/epg/vod/utils`; `player` não conhece telas; nada importa de `screens`.

## Importação de listas (implementado no marco 4)

```
UI (ImportService) ──postMessage──▶ Web Worker (import.worker.ts)
                                     ├─ streamText(): fetch em pedaços, timeout de inatividade, cancelável
                                     ├─ M3uParser / JsonArrayStream: parse incremental
                                     ├─ ChannelBuilder: valida, deduplica, agrupa, numera
                                     └─ IndexedDB: lotes de 2.000 itens por transação
```

- **Gerações**: cada importação grava em uma geração nova (`gk = fonte:carimbo`). A fonte só passa a apontar para ela quando termina, e só então a anterior é apagada. Se a importação falhar ou for cancelada no meio, os canais antigos continuam valendo.
- **Registro `gens`**: guarda o estado das gerações (`writing`/`ready`). A limpeza de órfãs lê só esse registro, porque no IndexedDB da TV varrer o índice de 100 mil canais leva ~9 s.
- **Ids** `gk:00000001`: ordem da lista preservada e apagar uma geração é um único `delete(IDBKeyRange)`.
- **Credenciais**: canais Xtream guardam só `stream_id`. A URL com usuário/senha é montada na hora de tocar.
- **Limites**: até 300 mil itens por fonte, linhas M3U de até 16 KB, objetos JSON de até 256 KB, campos truncados (nome 200, grupo 120, URL 2.048).
- **Higienização**: streams só `http(s)/rtsp/rtmp/udp/rtp`; logos só `http(s)` sem aspas ou `<>`; caracteres de controle removidos.

## Segurança (resumo do modelo de ameaça)

- **Ativos**: URLs de listas e credenciais Xtream do usuário, PIN parental, histórico.
- **Entrada não confiável**: todo conteúdo de M3U/XMLTV/API Xtream (nomes, logos, URLs). → nunca `innerHTML` com dado externo (só `textContent`/atributos validados); URLs de imagem/stream aceitas só com esquema `http`/`https`; limites de tamanho por campo e de itens por lista.
- **CSP** no `index.html`: scripts só locais, sem `eval`; `img-src`/`media-src`/`connect-src` liberados para `http:`/`https:` (necessário — servidores escolhidos pelo usuário).
- **PIN parental**: guardado como hash PBKDF2-SHA256 com salt (`crypto.subtle`, disponível no Chromium 76), com bloqueio progressivo após tentativas erradas. É proteção de conveniência (dados ficam na TV), não um cofre.
- **Credenciais Xtream**: ficam no IndexedDB da app (sandbox do Tizen); nunca vão para log. Backup exportado avisa que contém credenciais.
- Sem proxies de terceiros, sem telemetria.

## Plano de implementação (incremental, um commit por marco)

| # | Marco | Critério de aceite |
|---|---|---|
| 1 | Esqueleto + build + deploy | `npm run tv` empacota, instala e abre "hello" na TV; teclas registradas e logadas |
| 2 | Design system + navegação de foco | Tokens, componentes base, FocusManager; home navegável só com setas/OK/Back na TV |
| 3 | Storage + gerenciamento de listas | Cadastrar/editar/remover M3U por URL e Xtream; persistência sobrevive a reinício |
| 4 | Parser M3U em stream + Xtream live | Lista de 100k canais importa sem travar; tempo e memória medidos na TV |
| 5 | Player AVPlay | HLS/TS tocando; zapping CH+/−; OSD; retry em queda; erro claro em URL inválida |
| 6 | TV ao vivo completa | Categorias, numeração, busca, favoritos, histórico, canal atual destacado |
| 7 | EPG XMLTV | Import em stream (inclui `.gz`), matching por `tvg-id`/nome, agora/próximo, grade, sync periódico |
| 8 | VOD Xtream | Filmes, séries, temporadas/episódios, capas, sinopse, retomada, recentes |
| 9 | Faixas e ajustes | Áudio, legendas, proporção, configurações de reprodução |
| 10 | Parental + idioma + backup | PIN, bloqueio de categorias, pt-BR/en/es, export/import de configuração |
| 11 | Busca global + telas restantes | Busca em canais/VOD/EPG; Sobre; perfis | — busca e Sobre entregues; **perfis pendentes** (exigem separar favoritos/histórico/retomada por perfil: decisão de produto)
| 12 | Testes de estabilidade e release | Sessão longa de zapping, memória monitorada, `.wgt` final documentado |

Cada marco: testes unitários do que for lógica + validação real na TV, registrada em `docs/testes.md`.
