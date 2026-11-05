// Renders the composition frame by frame (deterministic: every property is a pure function of time).
//   node render.js preview 1 4.5 8 ...      -> out/preview/p_<t>.jpg   (check single moments)
//   node render.js all [workers]            -> out/frames/f_00000.jpg ... (30 fps)
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const ROOT = __dirname;
const FPS = 30;
const MODE = process.argv[2];
const BEATS = JSON.parse(fs.readFileSync(path.join(ROOT, 'beats.json'), 'utf8'));
const TD = 3.6;                                              // keep in sync with comp.html

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'max-age=3600' });
  fs.createReadStream(p).pipe(res);
});

function loadPass(mode) {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'cap', mode, 'frames.json'), 'utf8'));
  return { introDone: m.introDone, frames: m.frames, ts: m.frames.map((f) => f.t) };
}
function pick(pass, mode, t) {                                // last recorded frame at or before the matching moment
  const pt = Math.max(0.5, pass.introDone + (t - TD));          // the first ~0.4 s of a recording is an unstyled blank page
  let lo = 0, hi = pass.ts.length - 1, ans = 0;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (pass.ts[mid] <= pt) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return `/cap/${mode}/${pass.frames[ans].f}`;
}

(async () => {
  await new Promise((r) => server.listen(8124, r));
  const D = loadPass('desktop'), M = loadPass('mobile');
  const browser = await chromium.launch({ args: ['--no-sandbox', '--hide-scrollbars'] });
  const openPage = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    await page.addInitScript((b) => { window.BEATS = b; }, BEATS);
    await page.goto('http://localhost:8124/comp/comp.html'); await page.evaluate(() => document.fonts.ready); await page.evaluate(() => window.fitCaps());
    return page;
  };
  const shot = async (page, t, file) => {
    await page.evaluate(([t, d, m]) => window.renderAt(t, d, m), [t, pick(D, 'desktop', t), pick(M, 'mobile', t)]);
    await page.screenshot({ path: file, type: 'jpeg', quality: 94, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
  };

  if (MODE === 'preview') {
    const dir = path.join(ROOT, 'out/preview'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const page = await openPage();
    for (const t of process.argv.slice(3).map(Number)) await shot(page, t, path.join(dir, `p_${t.toFixed(2).padStart(6, '0')}.jpg`));
  } else if (MODE === 'all') {
    const W = Number(process.argv[3] || 3);
    const probe = await openPage(); const END = await probe.evaluate(() => window.compMeta.END); await probe.context().close();
    const total = Math.ceil(END * FPS);
    const dir = path.join(ROOT, 'out/frames'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    console.log('rendering', total, 'frames with', W, 'workers');
    let done = 0; const t0 = Date.now();
    await Promise.all(Array.from({ length: W }, async (_, w) => {
      const page = await openPage();
      for (let i = w; i < total; i += W) {
        await shot(page, i / FPS, path.join(dir, `f_${String(i).padStart(5, '0')}.jpg`));
        if (++done % 100 === 0) console.log(done, '/', total, ((Date.now() - t0) / 1000).toFixed(0) + 's');
      }
    }));
    console.log('done in', ((Date.now() - t0) / 1000).toFixed(0), 's');
  }
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
