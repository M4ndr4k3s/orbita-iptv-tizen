# Como contribuir

## Ambiente

Veja os requisitos e comandos no [README](README.md). Para testar na TV é preciso ter Developer Mode ligado e um certificado Samsung (ver [docs/release.md](docs/release.md)).

## Fluxo

1. Crie um branch a partir de `main`: `feat/nome-curto`, `fix/nome-curto` ou `docs/...`.
2. Faça mudanças pequenas e focadas, com testes para a lógica nova (`tests/`) e, quando mexer em tela ou player, um roteiro em `scripts/e2e/`.
3. Antes de abrir o PR, rode:
   ```bash
   npm run check
   npm audit
   ```
4. Registre a mudança em `CHANGELOG.md`, na seção `[Não lançado]`.
5. Abra o pull request descrevendo o que mudou, por quê e o que foi testado na TV (modelo e versão do Tizen).

## Commits

[Conventional Commits](https://www.conventionalcommits.org/pt-br/), em português: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`. A primeira linha tem até ~72 caracteres e o corpo explica o porquê.

## Código

- **Nomes:** identificadores em inglês; comentários, mensagens e documentação em português.
- **Plataforma:** Chromium 76. Nada de APIs mais novas sem conferir o suporte; o build compila para `chrome76`.
- **IndexedDB:** só no worker de dados (`src/workers/`), nunca na thread da interface.
- **Animações:** só com `transform` e `opacity`. Meça na TV antes de adicionar efeitos.
- **Textos:** sempre via `t('chave')` nos três idiomas (`src/services/i18n*.ts`).
- **Segurança:** nunca faça log de credenciais nem de URLs de stream. Use `redactUrl` quando precisar mostrar uma URL.

## Versões

O versionamento segue o [SemVer](https://semver.org/lang/pt-BR/). Atualize `package.json` e `tizen/config.xml` juntos e crie a tag anotada `vX.Y.Z`.
