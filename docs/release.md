# Release

## Gerar o pacote

```bash
npm run check      # tsc + testes unitários
npm audit          # dependências
npm run release    # build/Orbita.wgt (minificado, sem lista de teste, sem hooks de teste)
```

O pacote é assinado com o perfil de certificado `TIZEN_PROFILE` (padrão `LiteLauncher`), o mesmo da instalação em modo desenvolvedor.

## O que muda entre teste e release

| | `npm run tv` / `--dev` | `npm run release` |
|---|---|---|
| `dev/lista-teste.json` | **embutida no pacote** (credenciais em texto) | não entra |
| `__DEV__` (hooks `window.__orbita*`) | ligado | desligado (removido do código) |
| sourcemap | inline (com `--dev`) | não |
| minificação | não (com `--dev`) | sim |

> **Nunca distribua um `.wgt` de teste**: ele carrega a lista de teste com usuário e senha.

## Checagens feitas no `.wgt` de release (marco 12)

- Os valores de `dev/lista-teste.json` (usuário, senha, host) foram procurados em todos os arquivos do pacote: **0 ocorrências**.
- Sem `sourceMappingURL` e sem `__orbitaPlayer` (hooks de teste removidos).
- Tamanho: ~140 KB (`app.js` 176 KB, `worker.js` 37 KB antes da compressão).
- `npm audit`: 0 vulnerabilidades.

## Instalar o release na TV

```bash
tizen install -n build/Orbita.wgt -t <TV>
```

A TV precisa estar em modo desenvolvedor, com o certificado do perfil usado na assinatura. O endereço da TV fica na memória do projeto e no `TIZEN_TARGET`.

## Versão

`package.json` e `tizen/config.xml` estão em `0.1.0`. Atualize os dois juntos antes de publicar uma nova versão.

## Pendências conhecidas

- Perfis (marco 11) não implementados.
- Lista importada antes da busca global: a primeira busca de filmes/séries é lenta (~16 s) até a próxima atualização da lista.
