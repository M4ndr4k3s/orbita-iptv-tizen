# TV alvo e particularidades da plataforma

Tudo aqui foi medido ou conferido numa TV real. Os detalhes de cada problema estão em [erros-e-solucoes.md](erros-e-solucoes.md).

## Aparelho de referência

| Item | Valor |
|---|---|
| Modelo | Samsung **UN50AU7700GXZD** (Crystal UHD AU7700, linha 2021, 4K) |
| Sistema | **Tizen 6.0** (`platform_version: 6.0`) |
| CPU | ARMv7, 32 bits |
| Motor web | **Chromium 76** (o build compila para `chrome76`) |
| Resolução da interface | 1920 × 1080 (`devicePixelRatio` 1) |
| Heap JS disponível | ~368 MB (`jsHeapSizeLimit`) |
| Pendrive | montado como `removable_sda1` → caminho real `/opt/media/USBDriveA1` |
| Instalação | Developer Mode + certificado Samsung (perfil de autor e distribuidor) |

Outras TVs Samsung com **Tizen 6.0 ou mais novo** (linhas 2021+) devem funcionar: o `config.xml` exige `required_version="6.0"`. Só a UN50AU7700 foi testada.

## Privilégios (`tizen/config.xml`)

| Privilégio | Para quê |
|---|---|
| `internet` | listas, guia, streams |
| `tv.inputdevice` | teclas do controle (números, CH±, cores, mídia) |
| `avplay` (Samsung) | player de vídeo nativo |
| `filesystem.read` / `.write` | backup e pasta Orbita no pendrive |
| `download` | gravação e download no pendrive (API de Download nativa) |

## Particularidades encontradas

### Vídeo (AVPlay)

- O vídeo fica numa camada **atrás** do HTML. Para a mini janela, o fundo da página vira uma moldura com um furo no lugar do vídeo.
- `PLAYER_DISPLAY_MODE_LETTER_BOX` **não desenha nada** num retângulo menor que a tela. A mini janela usa `AUTO_ASPECT_RATIO`.
- O AVPlay pode reportar `PLAYING` e ficar segundos sem desenhar quadro. O app só considera "tocando" quando o tempo do vídeo anda.
- Reabrir a mesma URL logo depois de fechá-la travava até o tempo limite. Agora há uma pausa de 1 s entre fechar e reabrir.
- `Page.captureScreenshot` (CDP) não responde, e o estado do player não prova que há imagem: a verificação visual é feita olhando a TV.

### Armazenamento

- **IndexedDB na thread principal** travou a interface por 1–4 s com listas grandes. Todo acesso ao banco fica num Web Worker.
- **Cursor do IndexedDB é lento:** varrer 47 mil itens levou ~16 s. Os índices de busca são gravados prontos na importação.
- **Escrever arquivo pelo JS** (`FileHandle.writeData`) fica em ~0,65 MB/s e trava a interface. A API de Download nativa grava a **9,2 MB/s**.
- A API de Download **recusa a raiz virtual** do pendrive (`removable_sda1`); é preciso o caminho real, obtido com `tizen.filesystem.resolve`.
- Depois de `tizen.download.cancel()`, o retorno `oncanceled` **não é chamado**, mas o arquivo parcial fica no disco. É isso que torna possível "gravar = baixar o stream TS e cancelar".

### Desempenho da interface

- Fundo com gradientes radiais custava 35–95 ms por quadro ao rolar; com cor sólida, 17 ms.
- Animar `width` ou `box-shadow` derruba os quadros. Animações usam só `transform` e `opacity` (≥ 50 fps medidos no efeito de seleção).
- Decodificar muitas imagens de uma vez derruba a rolagem. Cartazes e logos só carregam quando a lista para ou quando chegam perto da área visível.

### Rede local e ferramentas

- **Porta de debug:** se outro programa (por exemplo, `adb`) ocupar a porta local 9333, use `TV_DEBUG_PORT`.
- **Memória:** com a memória virtual do PC esgotada, o empacotador Java do Tizen falha ("Could not create the Java Virtual Machine"). `JAVA_TOOL_OPTIONS=-Xmx256m` resolve.
