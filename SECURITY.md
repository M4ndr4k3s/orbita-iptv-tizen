# Segurança

## Como reportar uma vulnerabilidade

**Não abra issue pública.** Use o [aviso privado de vulnerabilidade](https://github.com/M4ndr4k3s/orbita-iptv-tizen/security/advisories/new) do GitHub, com:

- o que acontece e o impacto;
- como reproduzir (versão do app, modelo da TV);
- se possível, uma sugestão de correção.

A resposta inicial deve sair em até 7 dias.

## O que o app protege

- **Credenciais Xtream e URLs de listas:** ficam só no IndexedDB do app, isolado pelo Tizen. Nunca aparecem em log, na tela nem em URL de parâmetro. Os pontos de retomada e a tela inicial guardam só id, nome e cartaz.
- **Controle parental:** PIN com PBKDF2-SHA256 (100 mil iterações, sal aleatório), comparação em tempo constante e bloqueio progressivo após 3 erros.
- **Dados importados:** listas, guias, backups e respostas do servidor são tratados como não confiáveis. Tamanho, esquema de URL e campos são validados, e o texto é renderizado sem `innerHTML`.
- **Arquivos no pendrive:** o nome do arquivo é sanitizado (só letras, números, espaço, `-` e `_`), sem como sair da pasta `Orbita`.
- **Build de release:** não inclui a lista de teste local, os ganchos de depuração nem sourcemap (conferido a cada versão; ver `docs/release.md`).

## Fora do escopo

- **Servidores IPTV sem HTTPS:** usuário e senha trafegam sem criptografia. É uma limitação do servidor, e a tela de cadastro avisa.
- **Conteúdo das listas:** o app não fornece conteúdo nenhum. A legalidade das listas usadas é responsabilidade de quem as cadastra.
