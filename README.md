# Órbita

Player IPTV para Samsung Smart TV (Tizen 6.0+). Toca listas M3U/M3U8, contas Xtream Codes e guias XMLTV fornecidos pelo próprio usuário. O app não traz conteúdo nenhum.

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
```

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
node scripts/tv.mjs mem                    # heap JS e nós do DOM
```

## Documentação

- [Diagnóstico do ambiente](docs/01-diagnostico.md)
- [Arquitetura e plano](docs/02-arquitetura-e-plano.md)
- [Registro de testes](docs/testes.md)
- [Erros e soluções](docs/erros-e-solucoes.md)
