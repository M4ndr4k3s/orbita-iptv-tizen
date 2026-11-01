# Fase 1 — Diagnóstico do ambiente

Levantamento feito em 2026-11-01, sem instalar nem alterar nada.

## 1. Ferramentas identificadas (máquina de desenvolvimento)

| Ferramenta | Versão / caminho | Status |
|---|---|---|
| Tizen Studio | `C:\tizen-studio` — SDK 10.0 | OK |
| Tizen CLI | `C:\tizen-studio\tools\ide\bin\tizen.bat` — 2.5.25 | OK (fora do PATH) |
| SDB | `C:\tizen-studio\tools\sdb.exe` — 4.2.36 | OK (fora do PATH) |
| Plataformas TV | `tv-samsung` 2.4 → 10.0 (inclui **6.0**) | OK |
| TV Simulator / Emulator | `tools\sec-tv-simulator`, `tools\device-manager` | Instalados (não testados) |
| Certificate Manager | perfil ativo **`LiteLauncher`** (Samsung, autor + distribuidor) | OK |
| Node.js / npm | `C:\Program Files\nodejs` | OK |
| Git | `C:\Program Files\Git` | OK |
| Java | Temurin JDK 21 | OK (usado pela CLI) |
| Python | 3.12 | OK |
| TypeScript (`tsc`) | — | **Ausente** globalmente |
| esbuild | só em `C:\Projetos\ForgeTV-tizen\tizen\node_modules` | Ausente neste projeto |

Disco: `C:` com **~5,6 GB livres** (apertado, mas o build Tizen é pequeno); `F:` com ~270 GB.

## 2. Certificado de assinatura

- Perfil `LiteLauncher` em `C:\tizen-studio-data\profile\profiles.xml`.
- Arquivos em `%USERPROFILE%\SamsungCertificate\LiteLauncher\` (senhas em `.pwd` criptografado pela CLI — não lidas).
- Autor `CN=leandro` e distribuidor Samsung (`VD DEVELOPER Public CA`), validade **25/10/2026 → 25/10/2027**.
- Privilégio concedido: **Public** (não dá acesso a APIs Partner/Platform).
- DUID autorizado no `device-profile.xml`: **<DUID da TV>** — confere com o DUID da TV.

Conclusão: dá para assinar e instalar o `.wgt` nesta TV sem gerar certificado novo.

## 3. Televisão

Obtido via `sdb capability` / `getduid`:

| Item | Valor |
|---|---|
| Modelo | **UN50AU7700GXZD** (Crystal UHD AU7700, linha 2021, painel 4K) |
| Plataforma | **Tizen 6.0** (`platform_version:6.0`) |
| CPU | ARMv7 (32 bits) |
| Engine web | Chromium **M76** (Tizen 6.0) |
| IP / porta SDB | `192.168.4.171:26101` (Wi-Fi/LAN, Developer Mode ativo) |
| DUID | <DUID da TV> |
| Root | desabilitado (normal) |

Apps de teste anteriores instalados com sucesso nesta TV: `LtLnchr001.LiteLauncher`, `FrgTVmdk01.ForgeTV`, `AprZAARz4r.Jellyfin` — o fluxo de deploy está provado.

## 4. Comunicação e instalação

```
sdb connect 192.168.4.171:26101
tizen package -t wgt -s LiteLauncher -- <pasta_build>
tizen install -n <App>.wgt -s 192.168.4.171:26101 -- <pasta_build>
tizen run -p <pkg>.<App> -s 192.168.4.171:26101
```

Depuração: `sdb shell 0 debug <appid>` abre porta de Web Inspector (já usado antes — `C:\tizen-dl\dbg.txt`). Observação: no log da CLI há falhas antigas `[target]: null` quando a TV não estava conectada — sempre rodar `sdb connect` antes do install.

O IP da TV pode mudar (DHCP). Recomendo reservar `192.168.4.171` no roteador. O build vai ler o alvo de variável de ambiente.

## 5. Recursos de reprodução disponíveis

- **AVPlay** (`webapis.avplay`, privilégio `developer.samsung.com/privilege/avplay`, nível Public): decodificação por hardware, HLS, MPEG-TS via HTTP, MP4/MKV progressivo, DASH, H.264/HEVC até 4K, troca de faixa de áudio e legenda (`getTotalTrackInfo` / `setSelectTrack`), legendas externas (`setExternalSubtitlePath`), modo de exibição (`setDisplayMethod`), seek, buffering events. Renderiza numa camada de vídeo atrás do HTML (UI fica por cima, transparente).
- **`<video>` HTML5**: fallback para HLS/MP4 simples; pior com MPEG-TS cru e sem controle fino de faixas.
- **DRM**: AVPlay suporta PlayReady/Widevine *quando a fonte entrega licença*. Não haverá contorno de DRM.
- **Teclas**: `tizen.tvinputdevice.registerKey` (Play/Pause/Stop/FF/RW, CH+/CH−, teclas coloridas, números) — privilégio `tv.inputdevice`.

## 6. Limitações técnicas identificadas

1. **Chromium 76** → nada de `?.`, `??`, `Array.prototype.at`, `structuredClone`, `DecompressionStream`, CSS `inset`/`gap` em flex parcial (`gap` em flex só no Chrome 84). Solução: código transpilado com `esbuild --target=chrome76` e CSS conservador.
2. **Memória** — TV 2021 de entrada (~1,5 GB RAM total, app web tipicamente ~300–500 MB úteis). Listas M3U com 50–200 mil itens e XMLTV de 50–300 MB **não podem** ser carregadas inteiras em DOM/strings. Solução: parsing incremental em *stream* (`fetch().body.getReader()`), gravação em lotes no IndexedDB, listas virtualizadas na UI (só renderiza o que está visível).
3. **XMLTV `.gz`** — sem `DecompressionStream` no Chrome 76. Exige uma lib de inflate em JS (ex.: `pako`, ou `fflate` que é menor e tem modo streaming) → **dependência a aprovar**.
4. **localStorage ~5 MB** → usar só para configurações; catálogo/EPG/histórico vão para **IndexedDB**.
5. **Importar lista local**: não há seletor de arquivo usável por controle remoto. Alternativa viável: ler `.m3u` de **pendrive USB** via `tizen.filesystem` (privilégio `filesystem.read`, Public) — validar na TV. Plano B: digitar URL / código curto.
6. **CORS**: em app Tizen com `<access origin="*">` as requisições saem sem bloqueio de CORS (comprovado no ForgeTV). Servidores HTTP (sem TLS) são comuns em IPTV; isso é aceito pela TV, mas credenciais Xtream trafegam em claro quando o servidor do usuário é HTTP — limitação da fonte, será sinalizada na UI.
7. **UI em 1920×1080**: o viewport web é Full HD mesmo em painel 4K. Vídeo via AVPlay sai em 4K nativo; a interface é desenhada em 1080p e escala.
8. **Sem APIs Partner** (certificado Public): nada de TV tuner, `tvwindow` de canais da antena, nem controle de volume do sistema além de mute/volume via `tizen.tvaudiocontrol` (Public — a validar).
9. **Botão Exit** é tratado pelo sistema; o app só recebe `Back` e precisa confirmar saída na tela inicial (`tizen.application.getCurrentApplication().exit()`).
10. Processamento pesado (parse de lista/EPG) trava a UI se rodar na thread principal → **Web Worker** (suportado no Chromium 76).

## 7. Achados paralelos (fora deste projeto)

- `C:\Projetos\ForgeTV-tizen` e `F:\Projetos\ForgeTV` já são um player IPTV seu (Electron + porta Tizen). Servem de **referência de aprendizado** (pipeline esbuild → chrome76, `config.xml`, perfil de assinatura). Não vou copiar o monólito de 2.700 linhas: o projeto novo é modular desde o início.
- **Segurança**: `CLAUDE.md` do ForgeTV tem usuário/senha de um servidor Xtream de terceiros em texto puro. Recomendo remover do repositório. Este projeto **não** vai usar esse servidor; os testes de reprodução usarão streams de teste públicos e legítimos (Mux, Apple, Bitmovin) e a lista que você mesmo fornecer.
