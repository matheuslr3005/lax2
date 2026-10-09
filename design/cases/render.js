// Gera os cards de cases (1080x1350) a partir de cases.json.
//   npm i playwright @fontsource-variable/archivo @fontsource/jetbrains-mono
//   node render.js            -> escreve out/case-<slug>.png e ../../assets/img/cases/case-<slug>.webp (se houver ffmpeg)
// Variáveis opcionais: PLAYWRIGHT_MODULE (caminho do módulo), CHROME_PATH (executável do Chromium), FONTS_DIR (pasta com node_modules das fontes)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const here = __dirname;
const fontsDir = process.env.FONTS_DIR || path.join(here, 'node_modules');
const archivo = (style) => path.join(fontsDir, '@fontsource-variable/archivo/files', `archivo-latin-standard-${style}.woff2`);
const mono = path.join(fontsDir, '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2');
const fontCss = `
@font-face { font-family: "Archivo"; font-style: normal; font-weight: 100 900; font-stretch: 62% 125%; src: url("file://${archivo('normal')}") format("woff2"); }
@font-face { font-family: "Archivo"; font-style: italic; font-weight: 100 900; font-stretch: 62% 125%; src: url("file://${archivo('italic')}") format("woff2"); }
@font-face { font-family: "JetBrains Mono"; font-weight: 500; src: url("file://${mono}") format("woff2"); }`;

(async () => {
  const data = JSON.parse(fs.readFileSync(path.join(here, 'cases.json'), 'utf8'));
  fs.mkdirSync(path.join(here, 'out'), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--allow-file-access-from-files'] });
  for (const c of data.cases) {
    const page = await (await browser.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 })).newPage();
    // data and local fonts are in place before the card script runs, so fit() measures the real glyphs
    await page.addInitScript(({ value, css }) => {
      window.CASE = value;
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
      });
    }, { value: c, css: fontCss });
    await page.goto('file://' + path.join(here, 'card.html'));
    await page.waitForSelector('body[data-ready="1"]');
    const png = path.join(here, 'out', `case-${c.slug}.png`);
    await page.locator('#card').screenshot({ path: png });
    try {
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-c:v', 'libwebp', '-quality', '92', path.join(here, '../../assets/img/cases', `case-${c.slug}.webp`)]);
    } catch (e) { console.warn('ffmpeg não encontrado, só o PNG foi gerado.'); }
    console.log('ok', c.slug);
    await page.close();
  }
  await browser.close();
})();
