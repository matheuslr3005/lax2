// Records the real LAX site (desktop and mobile) with a scripted tour. Both passes follow the same beat sheet,
// timed from the moment the opening animation ends (T0), so the two screens stay in sync in the final video.
//   node capture.js desktop|mobile
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const MODE = process.argv[2];
if (!['desktop', 'mobile'].includes(MODE)) { console.error('usage: node capture.js desktop|mobile'); process.exit(1); }
const ROOT = __dirname;
const OUT = path.join(ROOT, 'cap', MODE);
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const SITE = 'http://localhost:8123/index.html';
const mobile = MODE === 'mobile';
const VIEW = mobile ? { width: 390, height: 765 } : { width: 1280, height: 720 };
const DSF = mobile ? 2 : 1;

// ---------- fonts (Google Fonts is blocked here, so serve the same files locally) ----------
const fdir = path.join(ROOT, 'fonts/node_modules');
const b64 = (p) => fs.readFileSync(path.join(fdir, p)).toString('base64');
const FONT_CSS = `
@font-face{font-family:"Archivo";font-style:normal;font-weight:100 900;font-stretch:62% 125%;font-display:block;src:url(data:font/woff2;base64,${b64('@fontsource-variable/archivo/files/archivo-latin-standard-normal.woff2')}) format("woff2")}
@font-face{font-family:"Archivo";font-style:italic;font-weight:100 900;font-stretch:62% 125%;font-display:block;src:url(data:font/woff2;base64,${b64('@fontsource-variable/archivo/files/archivo-latin-standard-italic.woff2')}) format("woff2")}
@font-face{font-family:"JetBrains Mono";font-weight:400 500;font-display:block;src:url(data:font/woff2;base64,${b64('@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2')}) format("woff2")}`;

// ---------- overlays drawn inside the page: pointer arrow + click ripple (desktop), touch dot (mobile) ----------
const OVERLAY = `
(() => {
  const css = document.createElement('style');
  css.textContent = \`
  html{scroll-behavior:auto !important}
  #__cur{position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483647;pointer-events:none;opacity:0;will-change:transform;filter:drop-shadow(0 3px 5px rgba(0,0,0,.35))}
  .__rip{position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:3px solid #C4272C;animation:__rip 520ms cubic-bezier(.16,1,.3,1) forwards}
  @keyframes __rip{from{transform:scale(.4);opacity:1}to{transform:scale(4.2);opacity:0}}
  .__tap{position:fixed;z-index:2147483646;pointer-events:none;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%;background:rgba(196,39,44,.28);border:2px solid rgba(196,39,44,.85);animation:__tap 640ms cubic-bezier(.16,1,.3,1) forwards}
  @keyframes __tap{0%{transform:scale(.55);opacity:0}25%{opacity:1}100%{transform:scale(1.5);opacity:0}}\`;
  document.addEventListener('DOMContentLoaded', () => {
    document.head.appendChild(css);
    if (!${mobile}) {
      const c = document.createElement('div'); c.id = '__cur';
      c.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2.5v17l4.6-4.1 3 6.9 2.9-1.3-3-6.8 6.3-.2z" fill="#fff" stroke="#121010" stroke-width="1.6" stroke-linejoin="round"/></svg>';
      document.body.appendChild(c);
      window.addEventListener('pointermove', (e) => { c.style.opacity = 1; c.style.transform = 'translate(' + (e.clientX - 5) + 'px,' + (e.clientY - 3) + 'px)'; }, true);
    }
  });
  window.addEventListener('pointerdown', (e) => {
    const d = document.createElement('div'); d.className = e.pointerType === 'touch' ? '__tap' : '__rip';
    d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 800);
  }, true);
  window.__scroll = (y, ms) => new Promise((res) => {
    const s = window.scrollY, d = Math.max(0, y) - s, t0 = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - t0) / ms), e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      window.scrollTo(0, s + d * e); p < 1 ? requestAnimationFrame(step) : res();
    })(t0);
  });
})();`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (p) => (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DSF, hasTouch: mobile, isMobile: mobile, colorScheme: 'light', reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: FONT_CSS }));
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
  await page.route('**/assets/video/case-video.mp4', (r) => r.fulfill({ status: 200, contentType: 'video/webm', body: fs.readFileSync(path.join(ROOT, 'case-video.webm')) }));
  await page.addInitScript(OVERLAY);

  // ---------- screencast ----------
  const cdp = await ctx.newCDPSession(page);
  const frames = []; let n = 0; const writes = [];
  cdp.on('Page.screencastFrame', (ev) => {
    cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
    const f = `f${String(n++).padStart(5, '0')}.jpg`;
    frames.push({ t: ev.metadata.timestamp, f });
    writes.push(fs.promises.writeFile(path.join(OUT, f), Buffer.from(ev.data, 'base64')));
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: VIEW.width * DSF, maxHeight: VIEW.height * DSF, everyNthFrame: 1 });

  // ---------- helpers ----------
  let mx = VIEW.width * .8, my = VIEW.height * .85;                 // current mouse position
  const box = async (sel, i = 0) => { const b = await page.locator(sel).nth(i).boundingBox(); if (!b) throw new Error('no box ' + sel); return b; };
  const center = (b) => [b.x + b.width / 2, b.y + b.height / 2];
  async function moveTo(x, y, ms) {
    const sx = mx, sy = my, t0 = Date.now();
    while (true) {
      const p = Math.min(1, (Date.now() - t0) / ms), e = ease(p);
      await page.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e);
      if (p >= 1) break; await sleep(6);
    }
    mx = x; my = y;
  }
  const scrollEl = (sel, offset, ms) => page.evaluate(({ sel, offset, ms }) => { const el = document.querySelector(sel); return window.__scroll(el.getBoundingClientRect().top + window.scrollY - offset, ms); }, { sel, offset, ms });
  const scrollBy = (dy, ms) => page.evaluate(({ dy, ms }) => window.__scroll(window.scrollY + dy, ms), { dy, ms });
  async function pointAt(sel, i = 0, ms = 500, dx = 0, dy = 0) { const [x, y] = center(await box(sel, i)); await moveTo(x + dx, y + dy, ms); return [x + dx, y + dy]; }
  async function press(sel, i = 0, ms = 520) {                         // desktop: glide there and click. mobile: tap
    const [x, y] = center(await box(sel, i));
    if (mobile) { await page.touchscreen.tap(x, y); return; }
    await moveTo(x, y, ms); await page.mouse.down(); await sleep(60); await page.mouse.up();
  }
  async function typeInto(sel, text, delay = 62) { await press(sel, 0, 420); await sleep(180); await page.keyboard.type(text, { delay }); }

  // ---------- go ----------
  const tGoto = Date.now() / 1000;
  await page.goto(SITE, { waitUntil: 'commit' });
  await page.waitForFunction(() => document.documentElement.classList.contains('intro-done'), null, { timeout: 20000, polling: 'raf' });
  const T0 = Date.now(); const introDone = T0 / 1000 - tGoto;
  console.log(MODE, 'intro done at', introDone.toFixed(2), 's');
  const at = async (sec, fn) => { const wait = T0 + sec * 1000 - Date.now(); if (wait > 0) await sleep(wait); return fn(); };
  const NAV = 68;

  const beats = [];
  const run = (sec, fn) => beats.push(at(sec, fn).catch((e) => console.error(MODE, 'beat', sec, 'failed:', e.message)));

  // Beat sheet (seconds after the opening ends). The same numbers drive the captions in the final composition.
  const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'beats.json'), 'utf8'));
  // hero: the red-dot spotlight follows the pointer
  if (!mobile) run(0.4, async () => { const k = VIEW.width / 1440; await moveTo(1020 * k, 440 * k, 450); await moveTo(1190 * k, 280 * k, 800); await moveTo(850 * k, 470 * k, 750); await moveTo(1010 * k, 300 * k, 700); });
  // Quem somos
  run(B.quem, () => scrollEl('#quem-somos .sec-head', NAV + 40, 1000));
  if (mobile) run(B.quem + 1.1, () => scrollEl('#quem-somos .toggles', 150, 900));
  run(B.quem + (mobile ? 2.3 : 1.4), async () => { await press('.tgl > button', 1); await sleep(700); await press('.tgl > button', 2); });
  // Serviços: panels expand (hover on desktop, tap on mobile)
  run(B.serv, () => scrollEl(mobile ? '#svc' : '#servicos .sec-head', mobile ? NAV + 12 : NAV + 40, 1000));
  run(B.serv + 1.2, async () => { for (const i of [1, 2, 3, 4]) { await press('.panel-tg', i, 380); await sleep(260); } });
  // Método: the example project moves through the stages
  run(B.metodo, () => scrollEl(mobile ? '#board' : '#metodo .sec-head', mobile ? NAV + 10 : NAV + 40, 1000));
  run(B.metodo + 1.2, async () => {
    for (const i of [1, 2, 3]) { await press('#board .col', i, 400); await sleep(mobile ? 380 : 450); if (mobile && i < 3) await scrollBy(250, 480); }
  });
  // Cases: tabs, video playing, lead-generation examples
  run(B.cases, () => scrollEl('#ctabs', NAV + 18, 1000));
  run(B.cases + 1.2, async () => { await press('#tab-video', 0, 450); await sleep(200); await page.evaluate(() => { const v = document.getElementById('caseVideo'); v.muted = true; v.currentTime = 0; return v.play(); }); });
  run(B.cases + 3.5, async () => { await press('#tab-leads', 0, 450); await sleep(250); await scrollBy(mobile ? 120 : 80, 650); });
  run(B.cases + 4.8, () => press('#tab-seg-eventos', 0, 420));
  run(B.cases + 5.9, () => press('#tab-seg-energia-solar', 0, 420));
  run(B.cases + 7.0, () => press('#tab-seg-estetica', 0, 420));
  // Formatos: hover shows a floating preview (desktop); tap opens the photo inline (mobile)
  run(B.formatos, () => scrollEl('#flist', NAV + 40, 1000));
  run(B.formatos + 1.2, async () => { for (const i of mobile ? [1, 4] : [1, 3, 5]) { await press('.frow > button', i, 380); await sleep(mobile ? 650 : 380); } });
  // Contato: the form fills itself in
  run(B.contato, () => scrollEl('#contato .sec-head', NAV + 30, 1000));
  run(B.contato + 1.2, async () => {
    if (mobile) await scrollBy(210, 550);
    await typeInto('#name', 'Ana Souza'); await typeInto('#email', 'ana@empresa.com'); await typeInto('#message', 'Oi, LAX!', 60);
  });

  await Promise.all(beats);
  await sleep(1200);
  await cdp.send('Page.stopScreencast'); await Promise.all(writes);
  const base = frames[0].t;
  fs.writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify({ mode: MODE, tGoto, introDone, view: VIEW, dsf: DSF, frames: frames.map((x) => ({ t: +(x.t - tGoto).toFixed(4), f: x.f })) }));
  console.log(MODE, 'frames:', frames.length, 'span:', (frames[frames.length - 1].t - base).toFixed(1), 's  first frame at', (base - tGoto).toFixed(2), 's after goto');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
