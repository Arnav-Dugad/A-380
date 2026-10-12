/**
 * Wing atlas (see wingUV): both wings side by side, upper surfaces in the top half and lower
 * surfaces in the bottom half, so markings read correctly on each side. Spar and rib fastener
 * lines, skin splices, the walkway and NO STEP stencils, fuel-tank access panels, leading-edge
 * erosion, exhaust soot behind the engines and grime around the flap-track fairings.
 */
import { ENGINES, WING } from '../geometry/layout';
import { wingChord } from '../geometry/wing';
import { blotch, drawText, finish, grey, makeLayers, rng, streak, type AtlasBuffers, type Ctx } from './paint';

const STENCIL = '#2b3036';

export function paintWing(W: number, H: number): AtlasBuffers {
  const layers = makeLayers(W, H, { color: '#d3d7db', rough: 0.36 });
  const { color: c, height: h, rough: r, metal: m } = layers;
  const rnd = rng(19);
  const tip = WING.tipZ;
  const X = (side: 1 | -1, z: number) => (0.5 + 0.5 * side * (z / tip)) * W;
  const Y = (xc: number, upper: boolean) => (upper ? H / 2 - xc * (H / 2) : H / 2 + xc * (H / 2));
  const kh = W / (2 * tip); // px per metre spanwise
  const kv = (z: number) => H / 2 / wingChord(Math.max(z, WING.rootZ)); // px per metre chordwise
  const sides = [1, -1] as const;

  // lower surfaces a shade darker
  c.fillStyle = '#c8ccd1';
  c.fillRect(0, H / 2, W, H / 2);

  /** spanwise line at constant chord fraction */
  const spanLine = (ctx: Ctx, side: 1 | -1, upper: boolean, xc: number, z0: number, z1: number, style: string, widthM: number) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = Math.max(1, widthM * kh);
    ctx.beginPath();
    ctx.moveTo(X(side, z0), Y(xc, upper));
    ctx.lineTo(X(side, z1), Y(xc, upper));
    ctx.stroke();
  };
  /** chordwise line at constant span */
  const chordLine = (ctx: Ctx, side: 1 | -1, upper: boolean, z: number, x0: number, x1: number, style: string, widthM: number) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = Math.max(1, widthM * kh);
    ctx.beginPath();
    ctx.moveTo(X(side, z), Y(x0, upper));
    ctx.lineTo(X(side, z), Y(x1, upper));
    ctx.stroke();
  };
  const dots = (side: 1 | -1, upper: boolean, z0: number, x0: number, z1: number, x1: number, pitchM: number, v = 137) => {
    const zm = (z0 + z1) / 2;
    const len = Math.hypot((z1 - z0) * kh, (x1 - x0) * wingChord(Math.max(zm, WING.rootZ)) * kv(zm)) / kh;
    const n = Math.max(1, Math.round(len / pitchM));
    h.fillStyle = grey(v);
    const d = Math.max(1, 0.006 * kh);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      h.fillRect(X(side, z0 + (z1 - z0) * t) - d / 2, Y(x0 + (x1 - x0) * t, upper) - d / 2, d, d);
    }
  };
  /** text of height hM metres at (z, xc); oriented for a viewer above (upper) or below (lower) */
  const label = (ctx: Ctx, str: string, side: 1 | -1, upper: boolean, z: number, xc: number, hM: number, o: Parameters<typeof drawText>[5] = {}) => {
    const ratio = (kv(z) * 1) / kh;
    drawText(ctx, str, X(side, z), Y(xc, upper), hM * kh, { weight: 700, spacing: 0.08, ...o, sx: upper ? 1 : -1, sy: (upper ? -1 : 1) * ratio });
  };

  for (const side of sides) {
    for (const upper of [true, false]) {
      // front and rear spar fastener lines, doubled
      for (const xc of [0.135, 0.66]) {
        spanLine(h, side, upper, xc, WING.rootZ, tip - 0.3, grey(114), 0.003);
        for (const dx of [-0.004, 0.004]) dots(side, upper, WING.rootZ, xc + dx, tip - 0.3, xc + dx, 0.035);
      }
      // ribs every ~0.75 m between the spars
      for (let z = WING.rootZ + 0.6; z < tip - 0.4; z += 0.75) dots(side, upper, z, 0.14, z, 0.65, 0.04, 134);
      // skin splices
      for (const xc of [0.3, 0.46]) spanLine(h, side, upper, xc, WING.rootZ, tip - 1, grey(110), 0.003);
      for (const z of [10.2, 19.8, 29.6]) chordLine(h, side, upper, z, 0.135, 0.66, grey(108), 0.004);
      // leading-edge erosion: chipped paint showing metal, rougher
      for (let k = 0; k < 2600; k++) {
        const z = WING.rootZ + rnd() * (tip - WING.rootZ);
        const xc = Math.pow(rnd(), 2.2) * 0.035;
        const x = X(side, z);
        const y = Y(xc, upper);
        const s = 1 + rnd() * 2.2;
        c.fillStyle = `rgba(186,190,195,${0.35 + rnd() * 0.5})`;
        c.fillRect(x, y, s, s * 0.7);
        m.fillStyle = grey(200 + rnd() * 55);
        m.fillRect(x, y, s, s * 0.7);
        r.fillStyle = grey(70 + rnd() * 50);
        r.fillRect(x, y, s, s * 0.7);
      }
    }

    // ---- upper surface: walkway and NO STEP markings
    const wz0 = 4.6;
    const wz1 = 12.6;
    const wx0 = 0.2;
    const wx1 = 0.56;
    c.fillStyle = 'rgba(150,154,160,0.55)';
    c.fillRect(Math.min(X(side, wz0), X(side, wz1)), Y(wx1, true), Math.abs(X(side, wz1) - X(side, wz0)), Y(wx0, true) - Y(wx1, true));
    r.fillStyle = grey(0.62 * 255);
    r.fillRect(Math.min(X(side, wz0), X(side, wz1)), Y(wx1, true), Math.abs(X(side, wz1) - X(side, wz0)), Y(wx0, true) - Y(wx1, true));
    for (const [a, b, x0, x1] of [
      [wz0, wz1, wx0, wx0],
      [wz0, wz1, wx1, wx1],
      [wz0, wz0, wx0, wx1],
      [wz1, wz1, wx0, wx1],
    ] as const) {
      c.strokeStyle = '#2a2e33';
      c.lineWidth = Math.max(1.5, 0.05 * kh);
      c.beginPath();
      c.moveTo(X(side, a), Y(x0, true));
      c.lineTo(X(side, b), Y(x1, true));
      c.stroke();
    }
    label(c, 'WALKWAY', side, true, (wz0 + wz1) / 2, (wx0 + wx1) / 2, 0.16, { fill: '#2a2e33', spacing: 0.4 });
    for (let z = 6; z < tip - 3; z += 6) {
      label(c, 'NO STEP', side, true, z, 0.07, 0.16, { fill: STENCIL });
      if (z > wz1 || z < wz0) label(c, 'NO STEP', side, true, z, 0.4, 0.16, { fill: STENCIL });
      label(c, 'NO STEP', side, true, z, 0.84, 0.16, { fill: STENCIL });
    }
    // fuel vent / overwing reference marks near the tip
    label(c, 'FUEL VENT', side, false, tip - 2.4, 0.42, 0.06, { fill: STENCIL });

    // ---- lower surface: tank access panels with fastener rings
    for (let z = 4.2; z < tip - 2; z += 1.5) {
      const xc = 0.38;
      const x = X(side, z);
      const y = Y(xc, false);
      const rx = 0.24 * kh;
      const ry = 0.16 * kv(z);
      h.strokeStyle = grey(76);
      h.lineWidth = Math.max(1, 0.008 * kh);
      h.beginPath();
      h.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      h.stroke();
      h.fillStyle = grey(156);
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2;
        h.fillRect(x + Math.cos(a) * rx * 0.86, y + Math.sin(a) * ry * 0.86, Math.max(1, 0.008 * kh), Math.max(1, 0.008 * kh));
      }
      c.strokeStyle = 'rgba(60,66,72,0.35)';
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      c.stroke();
    }
    // refuel coupling panel on the lower leading edge
    {
      const z = 17.5;
      const x = X(side, z);
      const y = Y(0.16, false);
      c.strokeStyle = STENCIL;
      c.lineWidth = Math.max(1, 0.01 * kh);
      c.strokeRect(x - 0.35 * kh, y - 0.2 * kv(z), 0.7 * kh, 0.4 * kv(z));
      h.strokeStyle = grey(74);
      h.strokeRect(x - 0.35 * kh, y - 0.2 * kv(z), 0.7 * kh, 0.4 * kv(z));
      label(c, 'REFUEL', side, false, z, 0.24, 0.06, { fill: STENCIL });
    }

    // ---- exhaust soot on the lower surface and flaps aft of each engine
    for (const e of ENGINES.filter((q) => q.side === side)) {
      for (let k = 0; k < 9; k++) {
        const z = e.z + (rnd() - 0.5) * 2.4;
        streak(c, X(side, z), Y(0.6 + rnd() * 0.08, false), 0.42 * (H / 2), (0.25 + rnd() * 0.5) * kh, Math.PI / 2, 'rgba(48,46,43,ALPHA)', 0.07);
        streak(r, X(side, z), Y(0.6, false), 0.42 * (H / 2), 0.6 * kh, Math.PI / 2, 'rgba(160,160,160,ALPHA)', 0.35);
      }
      // a faint soot fan on the upper flap surface too
      blotch(c, X(side, e.z), Y(0.93, true), 1.3 * kh, 0.06 * (H / 2), 'rgba(60,58,54,ALPHA)', 0.07);
    }
    // ---- hydraulic grime streaking aft of the flap-track fairings
    for (const z of [7.2, 11.6, 17.4, 21.2, 25.6]) {
      for (let k = 0; k < 4; k++) streak(c, X(side, z + (rnd() - 0.5) * 0.3), Y(0.62, false), 0.38 * (H / 2), (0.08 + rnd() * 0.12) * kh, Math.PI / 2, 'rgba(70,66,58,ALPHA)', 0.1);
    }
    // ---- registration under the left wing, read from the ground
    if (side === -1) {
      label(c, 'DT-A380', side, false, 20.5, 0.5, 1.5, { fill: '#2a2f35', weight: 600, spacing: 0.06, rotate: 0 });
    }
    // gear-bay grime on the inboard lower surface
    for (let k = 0; k < 18; k++) streak(c, X(side, WING.rootZ + rnd() * 6), Y(0.55 + rnd() * 0.15, false), 0.3 * (H / 2), (0.2 + rnd() * 0.5) * kh, Math.PI / 2, 'rgba(76,74,70,ALPHA)', 0.06);
  }
  return finish(layers, 0.9);
}
