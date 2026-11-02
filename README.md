# Órbita

[![CI](https://github.com/M4ndr4k3s/orbita-iptv-tizen/actions/workflows/ci.yml/badge.svg)](https://github.com/M4ndr4k3s/orbita-iptv-tizen/actions/workflows/ci.yml)
[![Licença: GPL v3](https://img.shields.io/badge/licen%C3%A7a-GPL--3.0-blue.svg)](LICENSE)
![Tizen 6.0+](https://img.shields.io/badge/Tizen-6.0%2B-1428a0.svg)

Player IPTV para **Samsung Smart TV (Tizen 6.0 ou mais novo)**. Toca listas M3U/M3U8, contas Xtream Codes e guias XMLTV que o próprio usuário cadastra. **O app não traz conteúdo nenhum.**

Versão atual: **1.1.2** — veja o [CHANGELOG](CHANGELOG.md) e as [releases](https://github.com/M4ndr4k3s/orbita-iptv-tizen/releases).

## Funcionalidades

- **Início no estilo streaming:** destaque com os filmes novos e carrosséis automáticos (continuar assistindo, filmes e séries adicionados recentemente), sem títulos repetidos.
- **Listas:** várias listas M3U e Xtream, importadas em fluxo contínuo (testado com dezenas de milhares de itens), atualização automática e backup no pendrive.
- **TV ao vivo:** categorias, favoritos, histórico, número pelo controle e mini janela fixa no canal escolhido.
- **Guia (EPG):** XMLTV, inclusive `.gz`, com agora/próximo, grade e barra do programa no ar.
- **Filmes e séries (Xtream):** grade de cartazes, tela de detalhes, temporadas, episódios e "continuar de".
- **Player (AVPlay):**
  - botões na tela: Pausar, Gravar, ±10 s, Opções e Favoritar;
  - áudio, legendas, proporção e buffer;
  - reconexão automática sem travar a troca de canal.
- **Busca global:** canais, filmes, séries e programas do guia.
- **Gravação e download no pendrive:** canais ao vivo (TS), filmes e episódios. O menu Downloads tem Pausar, Continuar e Cancelar.
- **Configurações:**
  - temas Preto, Cinema e Azul noite;
  - idiomas pt-BR, en e es;
  - controle parental com PIN e categorias bloqueadas;
  - backup;
  - apagar o histórico.

## TV compatível

| | |
|---|---|
| Testado em | Samsung **UN50AU7700** (Crystal UHD 2021) |
| Sistema | Tizen **6.0** ou mais novo |
| Motor web | Chromium 76 |
| Controle | controle remoto padrão da Samsung (setas, OK, Voltar, números, CH±, mídia) |
| Gravação | pendrive USB (FAT32/exFAT/NTFS montado pela TV) |

Particularidades da plataforma (AVPlay, IndexedDB, API de Download) estão em [docs/tv-samsung.md](docs/tv-samsung.md).

## Instalação na TV

O app não está na loja da Samsung: instala-se em **Developer Mode**.

1. Na TV, abra **Apps**, digite `12345` no controle, ligue o **Developer Mode** e informe o IP do PC.
2. No PC, instale o [Tizen Studio](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html) com a extensão TV e crie um **certificado Samsung** (Certificate Manager) incluindo o DUID da sua TV.
3. Gere o pacote assinado com o seu certificado (veja [Desenvolvimento](#desenvolvimento)) e instale:
   ```bash
   sdb connect <ip-da-tv>:26101
   ```
   ```bash
   tizen install -n Orbita.wgt -t <ip-da-tv>:26101
   ```

> Os `.wgt` anexados às [releases](https://github.com/M4ndr4k3s/orbita-iptv-tizen/releases) são assinados com o certificado de desenvolvedor do autor e **só instalam em TVs autorizadas nesse certificado**. Para a sua TV, gere o pacote pelo código. O SHA-256 de cada pacote está nas notas da release.

## Desenvolvimento

### Requisitos

- Node.js 20 ou mais novo
- Tizen Studio (padrão em `C:\tizen-studio`, ou `TIZEN_HOME`) com um perfil de certificado ativo
- TV em Developer Mode, acessível pelo SDB

### Comandos

```bash
npm install          # dependências fixadas no package-lock.json
npm run check        # typecheck + testes unitários
npm run preview      # build de dev + servidor em http://localhost:5173 (visual no navegador)
npm run tv           # build de teste + pacote + instala e abre na TV
npm run release      # pacote de produção: build/Orbita.wgt
```

| Variável | Padrão | Para quê |
|---|---|---|
| `TIZEN_TARGET` | `192.168.4.171:26101` | IP:porta da sua TV |
| `TIZEN_PROFILE` | `LiteLauncher` | perfil de certificado do Tizen Studio |
| `TIZEN_HOME` | `C:\tizen-studio` | pasta do Tizen Studio |
| `TV_DEBUG_PORT` | `9333` | porta local da depuração (troque se outro programa, ex.: `adb`, usar a 9333) |
| `JAVA_TOOL_OPTIONS` | — | use `-Xmx256m` se o empacotador falhar com "Could not create the Java Virtual Machine" |

### Lista de teste local

Se existir `dev/lista-teste.json` (a pasta `dev/` é ignorada pelo Git), as builds de **teste** cadastram e ativam essa lista sempre que o app abre. O `npm run release` **nunca** a inclui. Formato:

```json
{ "kind": "xtream", "name": "Minha lista", "server": "http://servidor:porta", "username": "...", "password": "..." }
```

```json
{ "kind": "m3u", "name": "Minha lista", "url": "http://servidor/lista.m3u" }
```

> **Nunca distribua um `.wgt` de teste**: ele leva essa lista, com usuário e senha.

### Testes

- **Unitários** (`tests/`, Vitest): parsers M3U/Xtream/XMLTV, sessão do player, navegação espacial, controle parental, backup, gravação/download e carrosséis. Rodam na CI a cada push.
- **Na TV** (`scripts/e2e/`): roteiros que simulam o controle remoto via DevTools Protocol, alguns com um servidor IPTV **de teste** local (`scripts/mock-iptv.mjs`). Resultados registrados em [docs/testes.md](docs/testes.md).

```bash
node scripts/tv.mjs debug                  # relança em modo debug e faz port-forward
```
```bash
node scripts/tv.mjs run scripts/e2e/home.js
```
```bash
node scripts/tv.mjs key down down ok back  # simula o controle remoto
```
```bash
node scripts/tv.mjs mem                    # heap JS exato (GC forçado) e nós do DOM
```

### Estrutura

```
src/
  app/          inicialização, roteador de telas, contexto
  components/   componentes de interface (lista virtual, carrossel, OSD, diálogos, teclado)
  navigation/   teclas do controle e navegação espacial por foco
  player/       AVPlay, sessão com reconexão, preferências de reprodução
  playlist/     parsers M3U/Xtream em fluxo, modelo e importação
  epg/          guia XMLTV (inclusive .gz)
  screens/      telas (Início, TV ao vivo, Filmes, Séries, Busca, Downloads, Configurações...)
  services/     regras de negócio (biblioteca, parental, gravação, idiomas, backup)
  storage/      IndexedDB (só no worker), configurações e retomada
  workers/      worker de dados: dono do IndexedDB e das importações
  styles/       CSS com tokens de tema
tizen/          config.xml (privilégios, versão)
scripts/        build, ferramentas da TV, servidor IPTV de teste e roteiros e2e
tests/          testes unitários
docs/           diagnóstico, arquitetura, TV, testes, erros e soluções, release
```

## Dados e privacidade

- Listas e contas ficam só no aparelho (IndexedDB do app, isolado pelo Tizen). A senha Xtream nunca é exibida nem registrada em log.
- Sem telemetria, proxy ou serviço de terceiros: o app só fala com os servidores que você cadastra.
- Servidor sem `https://`: a tela de cadastro avisa que usuário e senha trafegam sem criptografia.

Para reportar uma vulnerabilidade, veja [SECURITY.md](SECURITY.md).

## Documentação

- [TV alvo e particularidades da plataforma](docs/tv-samsung.md)
- [Diagnóstico do ambiente](docs/01-diagnostico.md)
- [Arquitetura e plano de marcos](docs/02-arquitetura-e-plano.md)
- [Registro de testes](docs/testes.md)
- [Erros e soluções](docs/erros-e-solucoes.md)
- [Release e checagens do pacote](docs/release.md)
- [Como contribuir](CONTRIBUTING.md)

## Licença

[GNU GPL v3.0 ou posterior](LICENSE). Você pode usar, estudar, alterar e redistribuir; versões alteradas que forem distribuídas também precisam ter o código aberto sob a mesma licença.

O Órbita é um **player**: não fornece, hospeda nem indica listas ou conteúdo. Use apenas listas que você tem direito de acessar.

Samsung, Tizen e Smart TV são marcas de seus respectivos donos; este projeto não tem vínculo com a Samsung.
