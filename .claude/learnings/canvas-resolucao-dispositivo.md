# Canvas em resolução de dispositivo (zoom out nítido)

- Antes o canvas tinha o tamanho lógico do jogo (~427x240) e o navegador o ampliava Z vezes por CSS.
  `camera.setZoom(< 1)` reduzia o mundo dentro desse canvas pequeno e depois ele era ampliado: pixels
  perdidos e blocos irregulares.
- Agora o canvas é `logical * renderScale` (`renderScale` = pixels de dispositivo por pixel de jogo,
  `scale.ts`/`renderScale.ts`). `scene.scale.width` é o tamanho do **canvas**; UI usa `logicalSizeOf`.
- Zoom efetivo da câmera = `userZoom * renderScale`; degraus e zoom salvo são arredondados para pixels
  inteiros por texel (`snapZoom`/`stepZoomCrisp`). Abaixo de 1 px por texel o filtro vira LINEAR.
- Custo: em renderização por software (Chromium headless) o FPS cai ~5x (32 -> 6 fps em 1280x720),
  então e2e que dependem de tempo ficam frágeis (testes 6 e 10 ganharam timeout maior; o 17 ainda
  falha por tempo). Em GPU real não foi medido.
- Testes e2e 12 e 14 já falhavam antes desta mudança.
