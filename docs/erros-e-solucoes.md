# Erros e soluções

| Data | Erro | Causa | Solução |
|---|---|---|---|
| 2026-11-01 | `git commit`: *Author identity unknown* | Máquina sem `user.name`/`user.email` globais | Identidade configurada só no repositório (`git config` local) |
| 2026-11-01 | `tizen package`: *No argument is allowed: SAMSUNG\build* | Caminho do projeto tem espaço e o `.bat` roda via `cmd` | `build.mjs` põe aspas nos argumentos e chama `cmd /d /s /c` explicitamente |
| 2026-11-01 | `sdb shell 0 debug <app>` não retorna | O app já estava aberto | Encerrar antes com `sdb shell 0 was_kill <pacote>` (já incluído no `tv.mjs debug`) |
| 2026-11-01 | `Page.captureScreenshot` sem resposta | O inspector do Tizen 6.0 não implementa screenshot | Visual conferido no `npm run preview`; função conferida na TV via `eval`/`key` |
| 2026-11-01 | Dois elementos com foco visual ao trocar de tela/abrir diálogo | `setRoot`/`pushScope` não tiravam a classe do foco anterior | O FocusManager limpa a classe ao trocar e empilhar escopos |
| 2026-11-01 | Ao voltar de uma seção, o foco ia para o botão padrão, não para o item de origem | `popToRoot` reativava a raiz mesmo já estando nela, e o último foco no menu era descartado por estar fora da tela | `popToRoot` não faz nada na raiz; o roteador aceita último foco em qualquer ponto do shell |
| 2026-11-01 | Navegação a ~16 fps na TV | Sombra com desfoque de 36 px no foco, transição de `width` no menu (layout a cada quadro) e repaint de gradientes | Anel de foco sem desfoque, menu sem animação de largura, tiles com cor sólida → ~60 fps |
| 2026-11-01 | Teste de DOM do FocusManager | `offsetParent` não existe em DOM simulado e happy-dom seria dependência nova | Foco validado por roteiro no navegador e na TV via CDP |
| 2026-11-01 | `exemplo.com:8080` rejeitado como URL | A regex de esquema via `exemplo.com:` como esquema | Só conta como esquema se houver `://`; esquemas perigosos sem barras (`javascript:`, `data:`, ...) são rejeitados explicitamente |
| 2026-11-01 | Porta 8090 ocupada ao subir o mock | Outro processo da máquina já usava a porta | Mock aceita porta por argumento (usando 8097) |
| 2026-11-01 | `eval` dos roteiros no preview bloqueado | A CSP do app proíbe `unsafe-eval` (comportamento desejado) | Preview carrega os roteiros por `<script>` da mesma origem (`/e2e/`, só no servidor de dev); na TV via CDP |
| 2026-11-01 | Cancelar teste lento levava 2,6 s na TV | O `fetch` abortado do Tizen demora a rejeitar | `withBusy` fecha e devolve `null` na hora do Back, sem esperar a tarefa |
| (anterior) | `tizen install`: `[target]: null` | TV não conectada no SDB | `build.mjs --install` roda `sdb connect` antes |
