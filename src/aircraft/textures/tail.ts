/**
 * Tail atlas (see htpUV / vtpUV). Stabiliser in the upper half, fin in the lower half: panel
 * splices, spar and rib fasteners, NO STEP stencils, the graphite fin with a fictional emblem,
 * the rudder split, and APU soot on the lower fin trailing edge.
 */
import { HTP, VTP } from '../geometry/layout';
import { blotch, drawText, finish, grey, makeLayers, rng, type AtlasBuffers, type Ctx } from './paint';

const STENCIL = '#2b3036';
const FIN = '#1d2329';
const ICE = '#6fd3ef';

export function paintTail(W: number, H: number): AtlasBuffers {
  const layers = makeLayers(W, H, { color: '#e9ebed', rough: 0.3 });
  const { color: c, height: h, rough: r } = layers;
  const rnd = rng(53);
  const vtpBase = VTP.rootY - 0.6;
  const finSpan = VTP.tipY - vtpBase;

  // ---------------------------------------------------------------- stabiliser (top half)
  const hX = (side: 1 | -1, z: number) => (0.5 + 0.5 * side * (z / HTP.tipZ)) * W;
  const hY = (xc: number, upper: boolean) => H - (0.75 + (upper ? 0.25 : -0.25) * xc) * H;
  const hChord = (z: number) => HTP.chordRoot + ((HTP.chordTip - HTP.chordRoot) * (z - HTP.rootZ)) / (HTP.tipZ - HTP.rootZ);
  const hkh = W / (2 * HTP.tipZ);
  c.fillStyle = '#d7dbdf';
  c.fillRect(0, H * 0.25, W, H * 0.25); // lower skins a shade darker (top half lower quarter in canvas)
  const dotsH = (side: 1 | -1, upper: boolean, z0: number, x0: number, z1: number, x1: number, pitch: number) => {
    const n = Math.max(1, Math.round((Math.abs(z1 - z0) + Math.abs(x1 - x0) * hChord((z0 + z1) / 2)) / pitch));
    h.fillStyle = grey(137);
    const d = Math.max(1, 0.006 * hkh);
    for (let i = 0; i <= n; i++) h.fillRect(hX(side, z0 + ((z1 - z0) * i) / n) - d / 2, hY(x0 + ((x1 - x0) * i) / n, upper) - d / 2, d, d);
  };
  for (const side of [1, -1] as const)
    for (const upper of [true, false]) {
      for (const xc of [0.14, 0.62]) dotsH(side, upper, HTP.rootZ, xc, HTP.tipZ - 0.2, xc, 0.035);
      for (let z = HTP.rootZ + 0.6; z < HTP.tipZ - 0.3; z += 0.7) dotsH(side, upper, z, 0.15, z, 0.6, 0.04);
      h.fillStyle = grey(110);
      h.fillRect(Math.min(hX(side, HTP.rootZ), hX(side, HTP.tipZ)), hY(0.38, upper), Math.abs(hX(side, HTP.tipZ) - hX(side, HTP.rootZ)), 2);
      if (upper)
        for (let z = 3; z < HTP.tipZ - 1.5; z += 4)
          drawText(c, 'NO STEP', hX(side, z), hY(0.82, true), 0.1 * hkh, { fill: STENCIL, weight: 700, spacing: 0.08, sy: -((H / 4) / hChord(z) / hkh) });
      // leading-edge erosion
      for (let k = 0; k < 500; k++) {
        const z = HTP.rootZ + rnd() * (HTP.tipZ - HTP.rootZ);
        c.fillStyle = `rgba(184,188,193,${0.3 + rnd() * 0.5})`;
        c.fillRect(hX(side, z), hY(Math.pow(rnd(), 2) * 0.03, upper), 1 + rnd() * 2, 1 + rnd());
      }
    }

  // ---------------------------------------------------------------- fin (bottom half)
  const fX = (hgt: number) => ((hgt - vtpBase) / finSpan) * W;
  const fY = (xc: number, starboard: boolean) => H - (0.25 + (starboard ? 0.25 : -0.25) * xc) * H;
  const fChord = (hgt: number) => VTP.chordRoot + ((VTP.chordTip - VTP.chordRoot) * (hgt - VTP.rootY)) / (VTP.tipY - VTP.rootY);
  const fkh = W / finSpan;
  c.fillStyle = FIN;
  c.fillRect(0, H * 0.5, W, H * 0.5);
  r.fillStyle = grey(0.26 * 255);
  r.fillRect(0, H * 0.5, W, H * 0.5);
  /** fin artwork: an abstract ice-blue twin sweep (fictional, no real brand) */
  const emblem = (ctx: Ctx, starboard: boolean, color: string) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    for (const [k, w] of [
      [0, 0.32],
      [1, 0.16],
    ] as const) {
      ctx.lineWidth = w * fkh;
      ctx.beginPath();
      const pts: [number, number][] = [];
      for (let t = 0; t <= 1.0001; t += 0.02) {
        const hgt = VTP.rootY + 2.2 + t * 10.5 + k * 0.9;
        const xc = 0.18 + 0.42 * t + k * 0.06 + 0.06 * Math.sin(t * Math.PI);
        pts.push([fX(hgt), fY(xc, starboard)]);
      }
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    ctx.restore();
  };
  for (const starboard of [true, false]) {
    emblem(c, starboard, ICE);
    emblem(h, starboard, grey(131));
    // fastener rows: front and rear spar, ribs
    for (const xc of [0.13, 0.64]) {
      h.fillStyle = grey(136);
      for (let hgt = vtpBase + 0.6; hgt < VTP.tipY - 0.2; hgt += 0.035) h.fillRect(fX(hgt), fY(xc, starboard), 1.5, 1.5);
    }
    for (let hgt = VTP.rootY + 0.5; hgt < VTP.tipY - 0.3; hgt += 0.65) {
      h.fillStyle = grey(134);
      for (let xc = 0.14; xc < 0.63; xc += 0.006) h.fillRect(fX(hgt), fY(xc, starboard), 1.2, 1.2);
    }
    // rudder split between the lower and upper rudders, and the hinge-line seal
    h.fillStyle = grey(100);
    h.fillRect(fX(16.6) - 1, fY(1, starboard), 2, fY(0.66, starboard) - fY(1, starboard));
    // registration on the fin root fairing, read from outside
    // the atlas runs up the fin along u, so text is turned a quarter: reading direction follows the chord
    drawText(c, 'DT-A380', fX(VTP.rootY + 1.2), fY(0.8, starboard), 0.3 * fkh, {
      fill: '#c9ced3',
      weight: 600,
      spacing: 0.1,
      rotate: Math.PI / 2,
      sx: H / 4 / fChord(VTP.rootY + 1.2) / fkh,
    });
    // APU and exhaust soot creeping up the lower trailing edge
    for (let k = 0; k < 14; k++) blotch(c, fX(VTP.rootY + rnd() * 2.5), fY(0.85 + rnd() * 0.15, starboard), 0.8 * fkh, 0.03 * H, 'rgba(10,10,10,ALPHA)', 0.12);
    // leading-edge erosion on the dark fin shows more
    for (let k = 0; k < 700; k++) {
      c.fillStyle = `rgba(150,156,162,${0.25 + rnd() * 0.45})`;
      c.fillRect(fX(vtpBase + rnd() * finSpan), fY(Math.pow(rnd(), 2) * 0.025, starboard), 1 + rnd() * 2, 1 + rnd());
    }
  }
  return finish(layers, 0.9);
}
