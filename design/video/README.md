# Vídeo de apresentação do site (Reels 1080x1920)

`lax-site-reels.mp4` (37 s, sem áudio, pronto pra postar) e `lax-site-reels-capa.jpg` (capa).

O vídeo é feito com o site de verdade: `capture.js` abre o site (no desktop 1280x720 e no celular 390x765) e faz o mesmo roteiro nos dois (rolagem, hover/toque, cliques, digitação). `comp/comp.html` junta as duas gravações nos mockups, com os textos animados, e `render.js` tira uma foto de cada quadro (30 fps).

O roteiro (em segundos depois do fim da abertura do site) fica em `beats.json`. Os textos de cada etapa estão em `comp/comp.html` (lista `CAPS`).

## Refazer

Precisa de Node, ffmpeg e Chromium do Playwright. Na pasta `design/video`:

```bash
npm i playwright
mkdir fonts && (cd fonts && npm init -y && npm i @fontsource-variable/archivo @fontsource/jetbrains-mono)
cp ../../assets/img/logo/lax-color.png logo.png
# o Chromium do Playwright não toca H.264, então o vídeo dos cases vai em webm só na gravação
ffmpeg -i ../../assets/video/case-video.mp4 -vf scale=540:960 -r 30 -c:v libvpx-vp9 -b:v 0 -crf 34 -an case-video.webm
# em outro terminal: servir o site em http://localhost:8123
npx http-server ../.. -p 8123 -c-1

node capture.js desktop && node capture.js mobile
node render.js all 3
ffmpeg -framerate 30 -i out/frames/f_%05d.jpg -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -level 4.2 -movflags +faststart lax-site-reels.mp4
```

`node render.js preview 5 12 20` gera só os momentos indicados (em segundos) em `out/preview/`, pra conferir antes de renderizar tudo.
