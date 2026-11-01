# Registro de testes

## Marco 1: esqueleto, build e deploy (2026-11-01)

TV: UN50AU7700GXZD, Tizen 6.0, via `scripts/tv.mjs`.

| Teste | Resultado |
|---|---|
| `tsc --noEmit` | OK |
| `npm audit` | 0 vulnerabilidades |
| `npm run tv` (empacotar, assinar, instalar e abrir) | OK, instalação em ~15 s |
| App abre na TV | OK, tela de diagnóstico renderizada |
| Ambiente reportado | Tizen 6.0, viewport 1920x1080, AVPlay disponível |
| `registerKey` | 25/25 teclas registradas (mídia, CH±, cores, Info, Guide, ChannelList, 0–9) |
| Teclas simuladas via CDP (down, ok, playPause, chUp, red, back) | Todas recebidas e mapeadas corretamente |
| Memória em repouso | heap 9,5 MB de um limite de 368 MB; 54 nós no DOM |
| Preview no navegador (1920x1080) | OK |

Pendente: teclas apertadas no **controle físico**, que exigem alguém na frente da TV. Foram validadas só por simulação.

Observação: `webapis.productinfo` devolveu vazio (modelo/firmware "-"). O modelo veio do SDB. Ainda não investiguei se é questão de privilégio.
