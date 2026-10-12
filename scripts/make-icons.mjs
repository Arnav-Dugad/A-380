// Renders the PWA / home-screen icons from the plane glyph in public/favicon.svg.
// Usage: node scripts/make-icons.mjs   (writes public/icons/*.png)
import { chromium } from '@playwright/test';

const glyph = 'M32 8c2 0 3 2 3 5v14l19 11v5l-19-6v11l6 5v4l-9-3-9 3v-4l6-5V32l-19 6v-5l19-11V13c0-3 1-5 3-5z';
// `pad` is the fraction of the canvas kept clear around the glyph (maskable icons need ≥ 10 %).
const svg = (pad, rounded) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><radialGradient id="g" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="#1a2129"/><stop offset="1" stop-color="#0b0d10"/></radialGradient></defs>
  <rect width="64" height="64" rx="${rounded ? 14 : 0}" fill="url(#g)"/>
  <g transform="translate(${32 - 32 * (1 - 2 * pad)} ${32 - 32 * (1 - 2 * pad)}) scale(${1 - 2 * pad})"><path d="${glyph}" fill="#6fd3ef"/></g>
</svg>`;

const jobs = [
  ['apple-touch-icon.png', 180, 0.12, false],
  ['icon-192.png', 192, 0.1, true],
  ['icon-512.png', 512, 0.1, true],
  ['icon-maskable-512.png', 512, 0.2, false],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad, rounded] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(pad, rounded).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: true });
  console.log(name);
}
await browser.close();
