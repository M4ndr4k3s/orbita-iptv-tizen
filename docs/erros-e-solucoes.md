# Erros e soluções

| Data | Erro | Causa | Solução |
|---|---|---|---|
| 2026-11-01 | `git commit`: *Author identity unknown* | Máquina sem `user.name`/`user.email` globais | Identidade configurada só no repositório (`git config` local) |
| 2026-11-01 | `tizen package`: *No argument is allowed: SAMSUNG\build* | Caminho do projeto tem espaço e o `.bat` roda via `cmd` | `build.mjs` põe aspas nos argumentos e chama `cmd /d /s /c` explicitamente |
| 2026-11-01 | `sdb shell 0 debug <app>` não retorna | O app já estava aberto | Encerrar antes com `sdb shell 0 was_kill <pacote>` (já incluído no `tv.mjs debug`) |
| 2026-11-01 | `Page.captureScreenshot` sem resposta | O inspector do Tizen 6.0 não implementa screenshot | Visual conferido no `npm run preview`; função conferida na TV via `eval`/`key` |
| (anterior) | `tizen install`: `[target]: null` | TV não conectada no SDB | `build.mjs --install` roda `sdb connect` antes |
