# Órbita

Player IPTV para Samsung Smart TV (Tizen 6.0+). Toca listas M3U/M3U8, contas Xtream Codes e guias XMLTV fornecidos pelo próprio usuário. O app não traz conteúdo nenhum.

**Versão 1.1.2.** Pacote: `npm run release` → `build/Orbita.wgt` (cópia em `dist/`, fora do Git). Instalação e checagens em [docs/release.md](docs/release.md).

## Funcionalidades

- **Listas:** várias listas M3U e Xtream, atualização automática e em segundo plano, backup e restauração pelo pendrive.
- **TV ao vivo:** categorias, favoritos, histórico, número pelo controle e mini janela. Na mini janela, OK põe o canal e OK de novo abre a tela cheia.
- **Guia (EPG):** XMLTV, inclusive `.gz`. Mostra agora e próximo, a grade e a barra do programa no ar.
- **Filmes e séries (Xtream):** grade de cartazes, sinopse, temporadas, episódios e "continuar de".
- **Player:**
  - botões na tela: Pausar, Gravar, ±10 s, Opções e Favoritar;
  - opções: áudio, legendas, proporção e buffer;
  - reconexão automática.
- **Busca global:** canais, filmes, séries e programas do guia.
- **Início:** destaque e carrosséis automáticos: continuar assistindo, filmes e séries adicionados recentemente (sem repetidos).
- **Gravação e download:** canal ao vivo (TS) e filmes ou episódios, para a pasta `Orbita` do pendrive. O menu Downloads tem Pausar, Continuar e Cancelar.
- **Configurações:**
  - temas Preto, Cinema e Azul noite;
  - idiomas pt-BR, en e es;
  - controle parental com PIN e categorias bloqueadas;
  - apagar o histórico.

## Requisitos

- Tizen Studio em `C:\tizen-studio` (ou `TIZEN_HOME`), com o perfil de certificado Samsung ativo
- Node.js 20 ou superior
- TV em Developer Mode, acessível pelo SDB

## Comandos

```bash
npm install          # dependências fixadas no package-lock.json
npm run check        # typecheck + testes unitários
npm run preview      # build de dev + servidor em http://localhost:5173 (visual no navegador)
npm run wgt          # build + pacote assinado build/Orbita.wgt
npm run tv           # build + pacote + instala e abre na TV
npm run release      # pacote de produção (sem a lista de teste)
```

**Lista de teste fixa:** se `dev/lista-teste.json` existir (pasta ignorada pelo Git; formato em `dev/README.md`), as builds de teste cadastram e ativam essa lista toda vez que o app abre. `npm run release` gera o pacote sem ela.

Variáveis de ambiente opcionais:

| Variável | Padrão |
|---|---|
| `TIZEN_TARGET` | `192.168.4.171:26101` |
| `TIZEN_PROFILE` | `LiteLauncher` |
| `TIZEN_HOME` | `C:\tizen-studio` |

## Testando na TV

```bash
node scripts/tv.mjs debug                  # relança em modo debug e faz port-forward
node scripts/tv.mjs key down down ok back  # simula o controle remoto
node scripts/tv.mjs eval "document.title"  # avalia JS na página
node scripts/tv.mjs logs 15                # console/erros por 15 s
node scripts/tv.mjs mem                    # heap JS exato (GC forçado) e nós do DOM
```

Roteiros de ponta a ponta (rodam na TV, simulando o controle):

```bash
node scripts/mock-iptv.mjs 8097            # servidor IPTV de TESTE na rede local
```

```bash
E2E_MOCK=http://<ip-do-pc>:8097 node scripts/tv.mjs run scripts/e2e/m3-lists.js
```

## Dados e privacidade

- Listas e contas ficam no IndexedDB do app, isolado pelo Tizen. A senha Xtream fica guardada no aparelho para reconectar e nunca é exibida nem registrada em log.
- Servidor Xtream sem `https://`: a tela de cadastro avisa que usuário e senha trafegam sem criptografia. É uma limitação do servidor.
- O app não usa proxy, telemetria nem serviço de terceiros.

## Documentação

- [Diagnóstico do ambiente](docs/01-diagnostico.md)
- [Arquitetura e plano](docs/02-arquitetura-e-plano.md)
- [Registro de testes](docs/testes.md)
- [Erros e soluções](docs/erros-e-solucoes.md)
- [Release](docs/release.md)
