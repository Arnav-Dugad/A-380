// Collects renderer statistics (draw calls, triangles, GPU resources, load time, transfer sizes)
// for each major view of the running app. Usage: node scripts/perf-report.mjs [url]
// Note: in headless Chromium the GPU is emulated (SwiftShader), so FPS figures are NOT
// representative of real hardware; draw calls, triangle counts and transfer sizes are.
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
let bytes = 0;
const files = {};
page.on('response', async (r) => {
  try {
    const len = Number(r.headers()['content-length'] ?? (await r.body()).length);
    bytes += len;
    const u = new URL(r.url());
    if (u.pathname.endsWith('.glb') || u.pathname.endsWith('.js')) files[u.pathname] = len;
  } catch {
    /* ignore */
  }
});
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => window.__a380?.ready(), null, { timeout: 180000 });
const tReady = Date.now() - t0;
const stats = async (name, setup, wait = 6000) => {
  if (setup) await page.evaluate(setup);
  await page.waitForTimeout(wait);
  // renderer.info is read one frame late: wait for a few complete frames in the new state
  const f0 = await page.evaluate(() => window.__a380.perf.frames);
  await page.waitForFunction((f) => window.__a380.perf.frames >= f + 3, f0, { timeout: 120000 });
  const p = await page.evaluate(() => ({ ...window.__a380.perf, samples: undefined }));
  return { view: name, calls: p.calls, triangles: p.triangles, geometries: p.geometries, textures: p.textures, programs: p.programs, swiftshaderFps: +p.fps.toFixed(1) };
};
const rows = [];
rows.push(await stats('Explore · studio · high', `window.__a380.ui.getState().set({introDone:true, env:'studio', quality:'high'})`, 9000));
rows.push(await stats('Explore · studio · performance', `window.__a380.ui.getState().set({quality:'performance'})`, 8000));
rows.push(await stats('Explore · studio · balanced', `window.__a380.ui.getState().set({quality:'balanced'})`, 8000));
rows.push(await stats('Explore · apron · high', `window.__a380.ui.getState().set({quality:'high', env:'apron'})`, 9000));
rows.push(await stats('Anatomy · X-ray', `window.__a380.ui.getState().set({section:'anatomy', xray:{enabled:true,skinOpacity:0.18,structure:true,cabin:true,cargo:true,clip:0,clipVertical:0}})`, 12000));
rows.push(await stats('Cockpit', `window.__a380.ui.getState().set({section:'cockpit', xray:{enabled:false,skinOpacity:0.18,structure:true,cabin:true,cargo:true,clip:0,clipVertical:0}})`, 12000));
rows.push(await stats('Cabin', `window.__a380.ui.getState().set({section:'cabin'})`, 12000));
rows.push(await stats('Flight · chase', `window.__a380.ui.getState().set({section:'flight', flightScenario:'ready'})`, 12000));
console.log(JSON.stringify({ url, readyMs: tReady, transferredBytes: bytes, files, rows }, null, 2));
await browser.close();
