/**
 * Nacelle atlas (see nacelleUV): u runs aft from the inlet lip over 6.7 m, v runs around from
 * the crown. Fan-cowl hinge and split lines, latch row along the keel, access doors with
 * stencils, the cowl/sleeve break and oil and soot streaks along the bottom.
 */
import { blotch, drawText, finish, grey, makeLayers, rng, streak, type AtlasBuffers } from './paint';

const LEN = 6.7;
const R = 1.85;
const STENCIL = '#2b3036';

export function paintNacelle(W: number, H: number): AtlasBuffers {
  const layers = makeLayers(W, H, { color: '#f1f2f3', rough: 0.26 });
  const { color: c, height: h, rough: r } = layers;
  const rnd = rng(31);
  const X = (x: number) => (x / LEN) * W; // x: metres aft of the lip
  const Y = (v: number) => H - v * H; // v: fraction around from the crown
  const kh = W / LEN;
  const kv = H / (2 * Math.PI * R);
  const ratio = kv / kh;
  const label = (str: string, x: number, v: number, hM: number, o: Parameters<typeof drawText>[5] = {}) =>
    // starboard half (v < 0.5): aft runs to screen-left and v runs downward, so turn the text
    // half a turn; port half reads directly
    drawText(c, str, X(x), Y(v), hM * kh, { weight: 700, spacing: 0.06, fill: STENCIL, ...o, sx: v < 0.5 ? -1 : 1, sy: (v < 0.5 ? -1 : 1) * ratio });

  // crown hinge line and keel split line along the fan cowl
  for (const v of [0, 0.5, 1]) {
    h.fillStyle = grey(100);
    h.fillRect(X(0.62), Y(v) - 1, X(4.4) - X(0.62), Math.max(2, 0.008 * kv));
  }
  // circumferential breaks: inlet/fan cowl, fan cowl/sleeve, sleeve aft section
  for (const x of [0.62, 4.4, 5.6]) {
    h.fillStyle = grey(100);
    h.fillRect(X(x) - 1, 0, Math.max(2, 0.008 * kh), H);
    // fastener row along the inlet attachment
    if (x === 0.62) {
      h.fillStyle = grey(156);
      for (let v = 0; v < 1; v += 0.006) h.fillRect(X(x + 0.035), Y(v), 2, 2);
    }
  }
  // hinge fittings on the crown
  for (const x of [1.2, 2.4, 3.6]) {
    h.fillStyle = grey(96);
    h.fillRect(X(x) - 0.08 * kh, Y(0.0) - 0.04 * kv, 0.16 * kh, 0.08 * kv);
  }
  // latch row on the keel: flush handles with outlines
  for (const x of [1.3, 2.05, 2.8, 3.55]) {
    for (const ctx of [h, c] as const) {
      ctx.strokeStyle = ctx === h ? grey(80) : 'rgba(40,45,50,0.6)';
      ctx.lineWidth = Math.max(1, 0.008 * kh);
      ctx.strokeRect(X(x) - 0.17 * kh, Y(0.5) - 0.035 * kv, 0.34 * kh, 0.07 * kv);
    }
    c.fillStyle = 'rgba(200,40,40,0.75)';
    c.fillRect(X(x) - 0.14 * kh, Y(0.5) - 0.012 * kv, 0.03 * kh, 0.024 * kv);
  }
  label('LATCH', 2.42, 0.47, 0.035);
  // access doors: oil filler (left lower), pressure relief (right)
  for (const [x, v, w, hh, txt] of [
    [2.6, 0.62, 0.32, 0.24, 'OIL'],
    [3.1, 0.36, 0.26, 0.2, 'PRESSURE RELIEF'],
    [1.8, 0.7, 0.2, 0.16, 'IDG'],
  ] as const) {
    h.strokeStyle = grey(74);
    h.lineWidth = Math.max(1, 0.008 * kh);
    h.strokeRect(X(x) - (w / 2) * kh, Y(v) - (hh / 2) * kv, w * kh, hh * kv);
    c.strokeStyle = 'rgba(43,48,54,0.5)';
    c.lineWidth = 1;
    c.strokeRect(X(x) - (w / 2) * kh, Y(v) - (hh / 2) * kv, w * kh, hh * kv);
    label(txt, x, v - (hh / 2 + 0.05) / (2 * Math.PI * R), 0.03);
  }
  // NO STEP on the upper cowl, and the danger arc ahead of the fan
  for (const v of [0.1, 0.9]) label('NO STEP', 2.6, v, 0.08);
  // oil and dirt streaks running aft along the keel, soot near the exhaust edge
  for (let k = 0; k < 26; k++) {
    const x = 1 + rnd() * 3.5;
    const v = 0.5 + (rnd() - 0.5) * 0.12;
    streak(c, X(x), Y(v), (1.2 + rnd() * 2.5) * kh, (0.02 + rnd() * 0.05) * kv, 0, 'rgba(86,76,60,ALPHA)', 0.12);
    streak(r, X(x), Y(v), (1.2 + rnd() * 2.5) * kh, (0.04 + rnd() * 0.05) * kv, 0, 'rgba(150,150,150,ALPHA)', 0.4);
  }
  for (let k = 0; k < 40; k++) blotch(c, X(6.1 + rnd() * 0.6), Y(rnd()), 0.35 * kh, 0.2 * kv, 'rgba(46,44,40,ALPHA)', 0.06);
  return finish(layers, 1.0);
}

/** Tyre sidewall: raised lettering and a moulded ring, as normal and roughness only. */
export function paintTyre(W: number, H: number, sidewall: [number, number][]): AtlasBuffers {
  const layers = makeLayers(W, H, { color: '#ffffff', rough: 0.82 });
  const { height: h, rough: r } = layers;
  const rnd = rng(43);
  for (const [u0, u1] of sidewall) {
    const x0 = u0 * W;
    const x1 = u1 * W;
    const band = x1 - x0;
    const xm = (x0 + x1) / 2;
    // moulded rings either side of the lettering
    h.fillStyle = grey(150);
    h.fillRect(x0 + band * 0.12, 0, Math.max(1, band * 0.04), H);
    h.fillRect(x1 - band * 0.16, 0, Math.max(1, band * 0.04), H);
    const words = ['RADIAL', 'TUBELESS', '1400×530R23', '40 PLY RATING', 'MAX SPEED 235 MPH', 'RETREAD'];
    let y = H * 0.02;
    for (let k = 0; y < H * 0.98; k++) {
      const wd = words[k % words.length]!;
      const size = band * 0.42;
      drawText(h, wd, xm, y, size, { fill: grey(176), weight: 800, rotate: Math.PI / 2, align: 'left', spacing: 0.05 });
      drawText(r, wd, xm, y, size, { fill: grey(0.6 * 255), weight: 800, rotate: Math.PI / 2, align: 'left', spacing: 0.05 });
      y += size * (wd.length * 0.68 + 3);
    }
  }
  // fine moulding texture and wear
  for (let k = 0; k < W * H * 0.004; k++) {
    h.fillStyle = grey(124 + rnd() * 8);
    h.fillRect(rnd() * W, rnd() * H, 1, 1);
  }
  return finish(layers, 3, undefined, false);
}
