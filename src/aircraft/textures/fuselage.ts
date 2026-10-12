/**
 * Fuselage atlas: u = station / length, v = (θ + π/2) / 2π, the mapping shared by the skin
 * and every door panel. Paint scheme (fictional), skin joints and rivet rows, door and service
 * stencils, keep-clear markings around the air-data sensors and weathering. Positions are
 * representative of the A380's layout, not taken from maintenance drawings.
 */
import { DOORS, L, MAIN_DECK_FLOOR, UPPER_DECK_FLOOR } from '../geometry/layout';
import { fuselagePoint, thetaAtHeight } from '../geometry/fuselage';
import { COCKPIT_PANES } from '../geometry/airframe';
import { blotch, drawText, finish, grey, makeLayers, rng, streak, type AtlasBuffers, type Ctx, type Layers } from './paint';

const TAU = Math.PI * 2;
const STENCIL = '#2b3036';
const RED = '#b3262b';

class FuselageAtlas {
  constructor(readonly L: Layers) {}
  get W() {
    return this.L.W;
  }
  get H() {
    return this.L.H;
  }
  px(s: number) {
    return (s / L) * this.W;
  }
  py(th: number) {
    return this.H - ((th + Math.PI / 2) / TAU) * this.H;
  }
  private cache = new Map<string, number>();
  th(s: number, y: number, side: 1 | -1) {
    const key = `${Math.round(s * 400)}|${Math.round(y * 1000)}|${side}`;
    let v = this.cache.get(key);
    if (v === undefined) {
      v = thetaAtHeight(Math.min(L - 0.01, Math.max(0.01, s)), y, side);
      this.cache.set(key, v);
    }
    return v;
  }
  /** pixels per metre along the girth at (s, θ) */
  kv(s: number, th: number) {
    const e = 1e-3;
    const a = fuselagePoint(s, th - e);
    const b = fuselagePoint(s, th + e);
    const dl = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / (2 * e);
    return this.H / TAU / Math.max(dl, 0.05);
  }
  get kh() {
    return this.W / L;
  }
  /** Fill a band between two heights on both sides, following the section. */
  band(c: Ctx, s0: number, s1: number, y0: (s: number) => number, y1: (s: number) => number, fill: string) {
    for (const side of [1, -1] as const) {
      c.beginPath();
      const steps = Math.max(8, Math.ceil((s1 - s0) / 0.25));
      for (let i = 0; i <= steps; i++) {
        const s = s0 + ((s1 - s0) * i) / steps;
        const p = [this.px(s), this.py(this.th(s, y0(s), side))] as const;
        if (i === 0) c.moveTo(...p);
        else c.lineTo(...p);
      }
      for (let i = steps; i >= 0; i--) {
        const s = s0 + ((s1 - s0) * i) / steps;
        c.lineTo(this.px(s), this.py(this.th(s, y1(s), side)));
      }
      c.closePath();
      c.fillStyle = fill;
      c.fill();
    }
  }
  /** Text of height `hM` metres at (s, y) on one side, readable from outside. */
  text(c: Ctx, str: string, s: number, y: number, side: 1 | -1, hM: number, o: Parameters<typeof drawText>[5] = {}) {
    const th = this.th(s, y, side);
    const ratio = this.kv(s, th) / this.kh;
    // starboard: s runs right-to-left on screen, so mirror horizontally; port: θ runs downward, mirror vertically
    drawText(c, str, this.px(s), this.py(th), hM * this.kh, { ...o, sx: side === 1 ? -1 : 1, sy: (side === 1 ? 1 : -1) * ratio });
  }
  /** Rectangle (metres) centred at (s, y) on one side, in the local surface frame. */
  rect(c: Ctx, s: number, y: number, side: 1 | -1, w: number, h: number, mode: 'fill' | 'stroke', style: string, lineM = 0.012, r = 0) {
    const th = this.th(s, y, side);
    const kv = this.kv(s, th);
    const x = this.px(s);
    const yy = this.py(th);
    const ww = w * this.kh;
    const hh = h * kv;
    c.save();
    c.beginPath();
    const rr = Math.min(r * this.kh, ww / 2, hh / 2);
    if ('roundRect' in c && rr > 0) (c as CanvasRenderingContext2D).roundRect(x - ww / 2, yy - hh / 2, ww, hh, rr);
    else c.rect(x - ww / 2, yy - hh / 2, ww, hh);
    if (mode === 'fill') {
      c.fillStyle = style;
      c.fill();
    } else {
      c.strokeStyle = style;
      c.lineWidth = Math.max(1, lineM * this.kh);
      c.stroke();
    }
    c.restore();
  }
  /** Line of rivet heads (domes) between two (s, y) points on one side. */
  rivets(s0: number, y0: number, s1: number, y1: number, side: 1 | -1, pitchM: number, v = 138) {
    const h = this.L.height;
    const len = Math.hypot(s1 - s0, y1 - y0);
    const n = Math.max(1, Math.round(len / pitchM));
    // exact θ at a few anchors, interpolated in between (θ varies smoothly along a row)
    const k = Math.max(1, Math.ceil(len / 0.6));
    const anchors: number[] = [];
    for (let i = 0; i <= k; i++) anchors.push(this.th(s0 + ((s1 - s0) * i) / k, y0 + ((y1 - y0) * i) / k, side));
    h.fillStyle = grey(v);
    const d = Math.max(1, 0.006 * this.kh);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const f = t * k;
      const a = Math.min(k - 1, Math.floor(f));
      const th = anchors[a]! + (anchors[a + 1]! - anchors[a]!) * (f - a);
      h.fillRect(this.px(s0 + (s1 - s0) * t) - d / 2, this.py(th) - d / 2, d, d);
    }
  }
}

export function paintFuselage(W: number, H: number): AtlasBuffers {
  const layers = makeLayers(W, H, { color: '#f3f4f5', rough: 0.24 });
  const A = new FuselageAtlas(layers);
  const { color: c, height: h, rough: r, metal: m } = layers;
  const rnd = rng(7);
  const sides = [1, -1] as const;

  // ---------------------------------------------------------------- paint scheme (fictional)
  const swoosh = (s: number) => 10.6 - Math.pow(Math.max(0, s - 48) / 24.7, 1.6) * 3.8;
  A.band(c, 0, L, () => 0, () => 3.15, '#c9ced3'); // light grey belly
  A.band(r, 0, L, () => 0, () => 3.15, grey(0.3 * 255));
  A.band(c, 48, L, swoosh, () => 12, '#1d2329'); // graphite tail swoosh
  A.band(c, 7.5, 60.5, (s) => MAIN_DECK_FLOOR + 0.62 + (s > 50 ? (s - 50) * 0.05 : 0), (s) => MAIN_DECK_FLOOR + 0.69 + (s > 50 ? (s - 50) * 0.05 : 0), '#6fd3ef');
  A.band(c, 52, L, (s) => swoosh(s) - 0.14, (s) => swoosh(s) - 0.08, '#6fd3ef');
  // paint edges stand a hair proud of the base coat
  A.band(h, 48, L, swoosh, () => 12, grey(131));

  // panel-to-panel tone variation, as on a real repainted airframe
  const joints = [2.3, 5.9, 11.8, 17.3, 22.8, 28.1, 33.5, 39.0, 44.4, 49.6, 54.8, 59.9, 64.6, 68.8];
  const panelRows: [number, number][] = [
    [0, 3.4],
    [3.4, MAIN_DECK_FLOOR + 1.8],
    [MAIN_DECK_FLOOR + 1.8, UPPER_DECK_FLOOR + 1.75],
    [UPPER_DECK_FLOOR + 1.75, 12],
  ];
  const all = [0, ...joints, L];
  for (let k = 0; k < all.length - 1; k++)
    for (const [y0, y1] of panelRows) {
      c.globalAlpha = 0.01 + rnd() * 0.02;
      A.band(c, all[k]!, all[k + 1]!, () => y0, () => y1, rnd() > 0.5 ? '#ffffff' : '#7d838a');
      r.globalAlpha = 0.25;
      A.band(r, all[k]!, all[k + 1]!, () => y0, () => y1, grey((0.2 + rnd() * 0.1) * 255));
    }
  c.globalAlpha = 1;
  r.globalAlpha = 1;

  // ---------------------------------------------------------------- cockpit window surrounds
  // A thin dark gasket line around each pane (references show distinct panes, no painted mask).
  for (const pane of COCKPIT_PANES)
    for (const mirror of [false, true]) {
      const cs = pane.reduce((a, q) => a + q[0], 0) / pane.length;
      const ct = pane.reduce((a, q) => a + q[1], 0) / pane.length;
      const grown = pane.map(([ps, pth]) => {
        const gs = ps + Math.sign(ps - cs) * 0.07;
        const gt = pth + Math.sign(pth - ct) * 0.022;
        return [gs, mirror ? Math.PI - gt : gt] as [number, number];
      });
      for (const [ctx, style, wM] of [
        [c, 'rgba(32,36,40,0.85)', 0.025],
        [h, grey(96), 0.012],
      ] as const) {
        ctx.beginPath();
        grown.forEach(([gs, gt], i) => (i ? ctx.lineTo(A.px(gs), A.py(gt)) : ctx.moveTo(A.px(gs), A.py(gt))));
        ctx.closePath();
        ctx.strokeStyle = style;
        ctx.lineWidth = Math.max(1, wM * A.kh);
        ctx.stroke();
      }
    }

  // ---------------------------------------------------------------- titles and registration
  for (const side of sides) {
    A.text(c, 'A380', 22.5, UPPER_DECK_FLOOR + 1.0, side, 0.62, { fill: '#1d2329', weight: 300, spacing: 0.28 });
    A.text(c, 'DIGITAL TWIN', 34.0, UPPER_DECK_FLOOR + 1.0, side, 0.42, { fill: '#1d2329', weight: 500, spacing: 0.5 });
    A.text(c, 'DT-A380', 60.8, MAIN_DECK_FLOOR + 1.15, side, 0.36, { fill: '#1d2329', weight: 500, spacing: 0.12 });
    A.text(h, 'A380', 22.5, UPPER_DECK_FLOOR + 1.0, side, 0.62, { fill: grey(131), weight: 300, spacing: 0.28 });
    A.text(h, 'DIGITAL TWIN', 34.0, UPPER_DECK_FLOOR + 1.0, side, 0.42, { fill: grey(131), weight: 500, spacing: 0.5 });
  }

  // ---------------------------------------------------------------- skin joints and rivets
  // circumferential butt joints: groove plus a strap of four fastener rows
  for (const s of joints) {
    const x = A.px(s);
    h.fillStyle = grey(104);
    h.fillRect(x - Math.max(1, 0.003 * A.kh), 0, Math.max(1, 0.006 * A.kh), H);
    for (const side of sides) for (const ds of [-0.045, -0.02, 0.02, 0.045]) A.rivets(s + ds, 2.05, s + ds, 10.35, side, 0.028);
  }
  // frames: a single fastener row every frame bay (0.533 m)
  for (let s = 2.4; s < 70; s += 0.533) {
    if (joints.some((j) => Math.abs(j - s) < 0.15)) continue;
    for (const side of sides) A.rivets(s, 2.1, s, 10.3, side, 0.035, 134);
  }
  // longitudinal lap joints: groove with double rows either side
  for (const y of [3.4, 4.6, MAIN_DECK_FLOOR + 1.8, UPPER_DECK_FLOOR + 0.25, UPPER_DECK_FLOOR + 1.75, 9.9]) {
    for (const side of sides) {
      h.strokeStyle = grey(110);
      h.lineWidth = Math.max(1, 0.004 * A.kh);
      h.beginPath();
      for (let s = 9; s <= 63; s += 0.4) {
        const p = [A.px(s), A.py(A.th(s, y, side))] as const;
        if (s === 9) h.moveTo(...p);
        else h.lineTo(...p);
      }
      h.stroke();
      for (const dy of [-0.035, 0.035]) A.rivets(9, y + dy, 63, y + dy, side, 0.03);
    }
  }
  // crown and keel centreline seams
  for (const th of [Math.PI / 2, -Math.PI / 2]) {
    h.fillStyle = grey(112);
    h.fillRect(A.px(9), A.py(th) - 1, A.px(63) - A.px(9), Math.max(1, 0.004 * A.kh));
  }

  // ---------------------------------------------------------------- passenger doors
  const doorSill = (deck: 'main' | 'upper') => (deck === 'main' ? MAIN_DECK_FLOOR + 0.02 : UPPER_DECK_FLOOR + 0.02);
  const doors = [...DOORS.main.map((d, i) => ({ ...d, deck: 'main' as const, label: `${i + 1}` })), ...DOORS.upper.map((d, i) => ({ ...d, deck: 'upper' as const, label: `U${i + 1}` }))];
  for (const d of doors) {
    for (const side of sides) {
      const sill = doorSill(d.deck);
      const tag = `${d.label}${side === 1 ? 'R' : 'L'}`;
      const aft = d.s + 0.27; // handle sits towards the aft edge
      // viewing window in the door
      A.rect(c, d.s, sill + 1.42, side, 0.17, 0.24, 'fill', '#0b1015', 0, 0.07);
      A.rect(r, d.s, sill + 1.42, side, 0.17, 0.24, 'fill', grey(10), 0, 0.07);
      A.rect(h, d.s, sill + 1.42, side, 0.2, 0.27, 'stroke', grey(112), 0.008, 0.08);
      // external handle flap: recessed, outlined, with instructions
      A.rect(h, aft, sill + 1.05, side, 0.34, 0.11, 'fill', grey(112), 0, 0.02);
      A.rect(c, aft, sill + 1.05, side, 0.34, 0.11, 'stroke', STENCIL, 0.01, 0.02);
      A.rect(c, aft, sill + 1.05, side, 0.3, 0.07, 'fill', '#d9dcdf', 0, 0.015);
      A.text(c, 'PUSH', aft, sill + 1.05, side, 0.035, { fill: STENCIL, weight: 700 });
      A.text(c, 'EMERGENCY EXIT', d.s, sill + 1.82, side, 0.05, { fill: RED, weight: 700, spacing: 0.08 });
      A.text(c, 'TO OPEN: PUSH FLAP · LIFT HANDLE', aft, sill + 0.9, side, 0.026, { fill: STENCIL, weight: 600 });
      A.text(c, tag, d.s - 0.33, sill + 1.75, side, 0.07, { fill: STENCIL, weight: 600 });
      // slide-armed indicator and door-mode placard
      A.rect(c, aft, sill + 1.28, side, 0.07, 0.04, 'fill', '#141719', 0, 0.01);
      A.rect(h, aft, sill + 1.28, side, 0.08, 0.05, 'fill', grey(110));
    }
  }

  // ---------------------------------------------------------------- cargo doors (starboard)
  for (const d of DOORS.cargo) {
    const side = 1 as const;
    const cy = 2.95 + d.h / 2 - (d.id === 'BULK' ? -0.35 : 0);
    const bottom = cy - d.h / 2;
    // latch row along the sill
    for (let k = 0; k < (d.w > 2 ? 6 : 2); k++) {
      const s = d.s - d.w / 2 + 0.25 + (k * (d.w - 0.5)) / Math.max(1, (d.w > 2 ? 6 : 2) - 1);
      A.rect(h, s, bottom + 0.09, side, 0.12, 0.05, 'fill', grey(92));
      A.rect(c, s, bottom + 0.09, side, 0.12, 0.05, 'stroke', 'rgba(43,48,54,0.7)', 0.006);
    }
    A.text(c, d.id === 'BULK' ? 'BULK CARGO DOOR' : 'CARGO DOOR', d.s, cy + d.h / 2 - 0.16, side, 0.06, { fill: STENCIL, weight: 700, spacing: 0.08 });
    // operating panel aft of the door
    const ps = d.s + d.w / 2 + 0.45;
    A.rect(h, ps, bottom + 0.35, side, 0.32, 0.26, 'fill', grey(100), 0, 0.02);
    A.rect(c, ps, bottom + 0.35, side, 0.32, 0.26, 'stroke', STENCIL, 0.008, 0.02);
    A.text(c, 'CARGO DOOR', ps, bottom + 0.42, side, 0.03, { fill: STENCIL, weight: 700 });
    A.text(c, 'OPERATION', ps, bottom + 0.37, side, 0.03, { fill: STENCIL, weight: 700 });
    A.text(c, 'DO NOT OPERATE IN WINDS', ps, bottom + 0.29, side, 0.018, { fill: STENCIL, weight: 600 });
    A.text(c, 'ABOVE 40 KT', ps, bottom + 0.26, side, 0.018, { fill: STENCIL, weight: 600 });
    // belt-loader scuffs under the sill
    for (let k = 0; k < 14; k++) {
      const s = d.s - d.w / 2 + rnd() * d.w;
      const th = A.th(s, bottom - 0.05 - rnd() * 0.25, side);
      streak(c, A.px(s), A.py(th), (0.25 + rnd() * 0.5) * A.kh, (0.02 + rnd() * 0.04) * A.kh, Math.PI / 2 + (rnd() - 0.5) * 0.4, 'rgba(70,72,74,ALPHA)', 0.12);
    }
  }

  // ---------------------------------------------------------------- service panels and sensors
  const panelAt = (s: number, y: number, side: 1 | -1, w: number, hgt: number, lines: string[], keepClear = false) => {
    A.rect(h, s, y, side, w, hgt, 'stroke', grey(74), 0.008, 0.03);
    A.rect(c, s, y, side, w, hgt, 'stroke', keepClear ? RED : 'rgba(43,48,54,0.55)', keepClear ? 0.02 : 0.005, 0.03);
    lines.forEach((t, i) => A.text(c, t, s, y + hgt / 2 + 0.05 + (lines.length - 1 - i) * 0.045, side, 0.034, { fill: keepClear ? RED : STENCIL, weight: 700, spacing: 0.06 }));
    // quarter-turn fasteners in the corners
    for (const [ds, dy] of [
      [-w / 2 + 0.03, -hgt / 2 + 0.03],
      [w / 2 - 0.03, -hgt / 2 + 0.03],
      [-w / 2 + 0.03, hgt / 2 - 0.03],
      [w / 2 - 0.03, hgt / 2 - 0.03],
    ] as const)
      A.rect(h, s + ds, y + dy, side, 0.018, 0.018, 'fill', grey(160), 0, 0.009);
  };
  panelAt(8.4, 3.05, 1, 0.55, 0.36, ['EXT PWR']);
  panelAt(10.6, 2.95, -1, 0.45, 0.32, ['OXYGEN', 'SERVICING']);
  panelAt(58.2, 3.7, -1, 0.42, 0.34, ['POTABLE WATER']);
  panelAt(60.8, 4.15, -1, 0.42, 0.3, ['WASTE', 'SERVICE']);
  panelAt(13.0, 2.7, 1, 0.5, 0.42, ['AVIONICS', 'ACCESS']);
  panelAt(65.5, 6.1, 1, 0.6, 0.5, ['APU', 'ACCESS']);
  for (const side of sides) {
    // static ports: bare-metal plates in red keep-clear boxes
    for (const dy of [0, -0.22]) {
      const s = 7.0;
      const y = 5.15 + dy;
      A.rect(c, s, y, side, 0.32, 0.17, 'stroke', RED, 0.015, 0.02);
      A.rect(m, s, y, side, 0.11, 0.11, 'fill', grey(255), 0, 0.055);
      A.rect(c, s, y, side, 0.11, 0.11, 'fill', '#b8bdc2', 0, 0.055);
      A.rect(r, s, y, side, 0.11, 0.11, 'fill', grey(70), 0, 0.055);
    }
    A.text(c, 'STATIC PORTS · KEEP CLEAN', 7.0, 5.42, side, 0.028, { fill: RED, weight: 700 });
    // pitot and angle-of-attack keep-clear areas
    A.rect(c, 5.1, 5.75, side, 0.42, 0.3, 'stroke', RED, 0.015, 0.04);
    A.rect(c, 6.4, 5.4, side, 0.3, 0.3, 'stroke', RED, 0.015, 0.15);
    A.text(c, 'NO STEP · PROBE HEATED', 5.6, 6.02, side, 0.024, { fill: RED, weight: 700 });
    // tow / jack point roundels near the nose gear
    A.rect(c, 6.2, 2.75, side, 0.12, 0.12, 'stroke', STENCIL, 0.01, 0.06);
  }

  // ---------------------------------------------------------------- weathering
  // keel grime and drain-mast streaks running aft
  for (const sMast of [21.5, 48.8]) {
    const x = A.px(sMast);
    for (let k = 0; k < 6; k++) {
      const th = -Math.PI / 2 + (rnd() - 0.5) * 0.35;
      streak(c, x, A.py(th), (3.5 + rnd() * 4) * A.kh, (0.15 + rnd() * 0.25) * A.kv(sMast, th), 0, 'rgba(84,80,72,ALPHA)', 0.09);
    }
  }
  // gear-bay grime spreading aft of the bays
  for (let k = 0; k < 40; k++) {
    const s = 32 + rnd() * 12;
    const th = -Math.PI / 2 + (rnd() - 0.5) * 0.9;
    streak(c, A.px(s), A.py(th), (2 + rnd() * 5) * A.kh, (0.1 + rnd() * 0.3) * A.kv(s, th), (rnd() - 0.5) * 0.05, 'rgba(70,68,64,ALPHA)', 0.05);
    streak(r, A.px(s), A.py(th), (2 + rnd() * 5) * A.kh, (0.1 + rnd() * 0.3) * A.kv(s, th), 0, 'rgba(150,150,150,ALPHA)', 0.25);
  }
  // general lower-fuselage dirt, heavier aft
  for (let i = 0; i < 5; i++) {
    c.globalAlpha = 0.016;
    A.band(c, 31 + i * 0.6, 52 - i * 0.4, () => 0, () => 2.2 + i * 0.25, '#4b4f55');
  }
  // outflow-valve stains on the aft lower fuselage
  for (const side of sides) {
    const s = 55.5;
    const th = A.th(s, 3.3, side);
    c.globalAlpha = 1;
    streak(c, A.px(s), A.py(th), 5 * A.kh, 0.35 * A.kv(s, th), 0, 'rgba(90,86,80,ALPHA)', 0.12);
  }
  // APU soot on the tail cone
  for (let i = 0; i < 9; i++) {
    c.globalAlpha = 0.035;
    A.band(c, 64 + i * 0.95, L, () => 0, () => 12, '#2b2a28');
  }
  c.globalAlpha = 1;
  for (let k = 0; k < 30; k++) {
    const s = 66 + rnd() * 6.5;
    const th = (rnd() - 0.5) * 2 * Math.PI;
    blotch(c, A.px(s), A.py(th), (0.4 + rnd()) * A.kh, (0.2 + rnd() * 0.4) * A.kv(s, th), 'rgba(30,29,27,ALPHA)', 0.08);
    blotch(r, A.px(s), A.py(th), (0.4 + rnd()) * A.kh, (0.2 + rnd() * 0.4) * A.kv(s, th), 'rgba(170,170,170,ALPHA)', 0.5);
  }
  // faint rain tracks below the window belts
  for (const yW of [MAIN_DECK_FLOOR + 1.08, UPPER_DECK_FLOOR + 1.0])
    for (let s = 9; s < 60; s += 0.533)
      if (rnd() < 0.35)
        for (const side of sides) {
          const th = A.th(s, yW - 0.25, side);
          streak(c, A.px(s), A.py(th), (0.4 + rnd() * 0.9) * A.kv(s, th), 0.03 * A.kh, side === 1 ? -Math.PI / 2 : Math.PI / 2, 'rgba(110,112,116,ALPHA)', 0.06);
        }
  // fine speckle: exhaust and runway grit on the lower half
  for (let k = 0; k < W * 2; k++) {
    const x = rnd() * W;
    const th = -Math.PI / 2 + (rnd() - 0.5) * 2.2;
    c.fillStyle = `rgba(60,60,58,${0.05 + rnd() * 0.08})`;
    c.fillRect(x, A.py(th), 1, 1);
  }

  // Oil-canning: shallow pillows between frames and stringers on the cylindrical barrel
  const framePx = 0.533 * A.kh;
  const stringerPx = H / 120;
  const s0 = A.px(12);
  const s1 = A.px(50);
  const extra = (x: number, y: number) => {
    if (x < s0 || x > s1) return 0;
    const fade = Math.min(1, (x - s0) / (framePx * 4), (s1 - x) / (framePx * 4));
    const a = Math.sin((Math.PI * x) / framePx);
    const b = Math.sin((Math.PI * y) / stringerPx);
    return -0.55 * fade * a * a * b * b;
  };
  return finish(layers, 0.9, extra);
}
