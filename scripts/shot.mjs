// Usage: node scripts/shot.mjs <outfile> '<json views>' [url] [width] [height]
// DEVICE='Pixel 7' (any Playwright device name) emulates a phone instead of a desktop viewport.
// views: [{name, pos:[x,y,z], target:[x,y,z], ui?:{...}}]
import { chromium, devices } from '@playwright/test';
const [, , outPrefix, viewsJson, url = 'http://localhost:5173/', w = '1600', h = '900'] = process.argv;
const views = JSON.parse(viewsJson);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const device = process.env.DEVICE ? devices[process.env.DEVICE] : null;
const page = await browser.newPage(device ? { ...device } : { viewport: { width: +w, height: +h } });
await page.addInitScript(() => {
  try {
    if (!localStorage.getItem('a380-prefs-v1')) localStorage.setItem('a380-prefs-v1', JSON.stringify({ state: { quality: 'balanced', env: 'studio', exposure: 1, audio: false, showStats: false }, version: 0 }));
  } catch {
    /* ignore */
  }
});
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => window.__a380?.ready(), null, { timeout: 120000 });
await page.waitForTimeout(1500);
for (const v of views) {
  await page.evaluate(async (v) => {
    if (v.ui) window.__a380.ui.getState().set(v.ui);
    if (v.eval) await (0, eval)(v.eval);
    if (v.pos) await window.__a380.camera(v.pos, v.target, false);
  }, v);
  await page.waitForTimeout(v.wait ?? 1200);
  await page.screenshot({ path: `${outPrefix}-${v.name}.png`, timeout: 300000 });
}
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
