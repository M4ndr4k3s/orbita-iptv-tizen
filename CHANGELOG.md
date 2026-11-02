# Changelog

Mudanças relevantes do Órbita. O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado
- Publicação no GitHub: licença GPL-3.0, CI (tipos, testes e auditoria de dependências), SECURITY.md, CONTRIBUTING.md e docs/tv-samsung.md.

## [1.1.2] - 2026-11-02

### Corrigido
- Navegação linear: ←/→ não sobe nem desce de linha. No fim de um carrossel ou da grade, o foco fica parado. A diagonal só vale para entrar e sair do menu lateral, e entre o cabeçalho e o conteúdo.

## [1.1.1] - 2026-11-02

### Adicionado
- Cartão focado nos carrosséis com zoom de 1,12 e anel animado na cor do tema.

### Alterado
- Início sem os carrosséis de canais (vistos e favoritos).
- A importação guarda os 40 títulos mais novos de cada tipo.

### Corrigido
- Títulos repetidos nos carrosséis: versões como "X [LEG]" e "X" viram um cartão só.
- Borda e título do cartão no canto esquerdo do carrossel eram cortados.
- O menu lateral ficava azul em qualquer tema.

## [1.1.0] - 2026-11-02

### Adicionado
- Início no estilo dos apps de streaming:
  - destaque que alterna entre os filmes novos;
  - carrosséis automáticos de Continuar assistindo (uma série por cartão, que abre as temporadas), Filmes adicionados e Séries adicionadas.
- Menu Downloads com Pausar, Continuar e Cancelar.

### Alterado
- Canal que não abre: a tela mostra "Conectando…" em vez do contador de tentativas. Na falha, aparece um aviso no rodapé, sem janela, e ▲▼ troca de canal direto.
- A tela inicial mostra o nome da lista, nunca o endereço.

### Corrigido
- Pausar durante o buffering e continuar reabria o canal.

## [1.0.1] - 2026-11-02

### Adicionado
- Tela de detalhes do filme (cartaz, nota, duração, sinopse, Assistir/Continuar e Baixar).
- Grade de filmes e séries com 6 cartazes por linha, sem o painel lateral.

### Corrigido
- ↑/↓ pulava na diagonal para o menu lateral ou para as categorias.
- Gravação e download não funcionavam com pendrive. A API de Download exige o caminho real do disco, e a TV não chama `oncanceled`.
- Mini janela com cantos retos, sem o logo do canal sob o cursor por cima.

## [1.0.0] - 2026-11-02

Primeira versão completa.

### Adicionado
- **Listas:** M3U/M3U8 e contas Xtream Codes, importadas em fluxo contínuo, com atualização automática e backup no pendrive.
- **TV ao vivo:** categorias, favoritos, histórico, número pelo controle e mini janela fixa no canal escolhido.
- **Guia (EPG):** XMLTV, inclusive `.gz`, com agora/próximo, grade e barra do programa no ar.
- **Filmes e séries (Xtream):** cartazes, temporadas, episódios e "continuar de".
- **Player (AVPlay):**
  - botões na tela: Pausar, Gravar, ±10 s e Opções;
  - áudio, legendas, proporção e buffer;
  - reconexão automática.
- **Busca global:** canais, filmes, séries e programas do guia.
- **Gravação e download no pendrive:** canais ao vivo em TS, filmes e episódios.
- **Configurações:**
  - temas Preto, Cinema e Azul noite;
  - idiomas pt-BR, en e es;
  - controle parental com PIN;
  - apagar o histórico.

[Não lançado]: https://github.com/M4ndr4k3s/orbita-iptv-tizen/compare/v1.1.2...HEAD
[1.1.2]: https://github.com/M4ndr4k3s/orbita-iptv-tizen/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/M4ndr4k3s/orbita-iptv-tizen/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/M4ndr4k3s/orbita-iptv-tizen/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/M4ndr4k3s/orbita-iptv-tizen/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/M4ndr4k3s/orbita-iptv-tizen/releases/tag/v1.0.0
