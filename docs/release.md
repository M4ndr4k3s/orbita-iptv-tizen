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

**1.1.1** em `package.json` e `tizen/config.xml` (tags `v1.0.0`, `v1.0.1`, `v1.1.0` e `v1.1.1`). Atualize os dois juntos na próxima versão.

### Pacote 1.1.1 (2026-11-02)

- `dist/Orbita-1.1.1.wgt`, SHA-256 `5f72b5fcac3caad5ff779278681a65301ae92e24a3985b297d814164f34ed31c`.
- **Início:**
  - sem os carrosséis de canais (vistos e favoritos);
  - sem títulos repetidos em nenhum carrossel ("X [LEG]" e "X" viram um cartão, ficando a versão sem etiqueta);
  - cartão focado com zoom 1,12 e anel animado na cor do tema;
  - borda e título do cartão no canto esquerdo não são mais cortados.
- **Temas:** o menu lateral segue a cor do tema; antes era azul fixo.
- **Importação:** guarda os 40 títulos mais novos de cada tipo, para sobrarem 20 depois de tirar as repetições. Pede uma atualização da lista.
- **Checagens:** 0 credenciais no pacote e no repositório; 157 testes unitários; `npm audit` sem vulnerabilidades.
- **Na TV:** home 10/10, home-clip 1/1, home-series 4/4, home-fx 3/3 (≥ 50 fps com a animação).

### Pacote 1.1.0 (2026-11-02)

- `dist/Orbita-1.1.0.wgt`, SHA-256 `809f8134f0036b635dd2da73d1fa65384a7fc568b10de8b8b8558bb3d560369f`.
- **Novidades:**
  - Início no estilo streaming: destaque que alterna entre os filmes novos e carrosséis que andam sozinhos (Continuar assistindo com uma série por cartão, canais vistos e favoritos em cartões quadrados, filmes e séries adicionados recentemente);
  - menu Downloads com Pausar, Continuar e Cancelar.
- **Correções:** canal com falha vira um aviso no OSD sem contador de tentativas, e ▲/▼ troca de canal direto; pausa durante o buffering.
- **Requer atualizar a lista uma vez:** os "adicionados recentemente" saem da data informada pelo Xtream, guardada só a partir desta versão.
- **Checagens:** 0 credenciais no pacote e no repositório; sem sourcemap e sem hooks de teste; 155 testes unitários; `npm audit` sem vulnerabilidades.
- **Na TV:** home 9/9, home-series 4/4, ux-feedback 31/31, usb-download 7/7, m5 20/20.

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
