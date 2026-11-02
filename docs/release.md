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

**1.0.1** em `package.json` e `tizen/config.xml` (tags `v1.0.0` e `v1.0.1`). Atualize os dois juntos na próxima versão.

### Pacote 1.0.1 (2026-11-02)

- `dist/Orbita-1.0.1.wgt`, SHA-256 `456fdc717cfed9f89c6e59089c444118365ac32e3660cc061174155e7d65e9eb`.
- **Correções:** ↑/↓ pulando para o lado, Gravar com pendrive. **Novidades:** detalhes do filme em tela própria, grade 6×2, mini janela com cantos retos.
- **Checagens no `.wgt`:** 0 credenciais, sem sourcemap, sem hooks de teste. 147 testes unitários.
- **Na TV:** ux-feedback 31/31 e usb-download 5/5, com gravação e download reais no pendrive.
- Instalado na UN50AU7700.

### Pacote 1.0.0 (2026-11-02)

- `dist/Orbita-1.0.0.wgt`, 144 KB, SHA-256 `82066f1329d8441b80e6da01c19dbae6644f8f00cf18508f3651c21fec803820`.
- **Checagens antes de gerar:**
  - `tsc` sem erros;
  - 146 testes unitários passando;
  - `npm audit` sem vulnerabilidades;
  - valores de `dev/lista-teste.json` procurados nos 158 arquivos versionados e em todo o histórico do Git: 0 ocorrências.
- **Checagens no `.wgt`:** 0 credenciais, sem sourcemap, sem hooks de teste, versão 1.0.0.
- **Instalado na UN50AU7700** por cima do build de teste. Listas, favoritos e tema foram mantidos, e a lista real abriu com 2.833 canais e 36.867 filmes.
- **Não testado:** gravação e download com pendrive de verdade; sem pendrive, só o aviso foi conferido.

## Pendências conhecidas

- Perfis (marco 11) não implementados.
- Lista importada antes da busca global: a primeira busca de filmes/séries é lenta (~16 s) até a próxima atualização da lista.

## Privilégio de download (gravação/download no pendrive)

O `config.xml` pede `http://tizen.org/privilege/download` (API de Download nativa). Instalação em modo desenvolvedor com o certificado LiteLauncher funcionou. Para publicar na loja, confira se o nível do certificado permite esse privilégio.
