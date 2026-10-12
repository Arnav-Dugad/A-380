/**
 * Fuselage loft: a sequence of super-elliptic cross-sections along the station axis.
 * The upper lobe uses a fuller exponent than the lower lobe to reproduce the A380's
 * characteristic ovoid double-deck section.
 */
import { BufferAttribute as BufferAttributeCtor, BufferGeometry as BufferGeometryCtor, type BufferGeometry } from 'three';
import { FUS_BOTTOM, FUS_TOP, FUS_W, FUS_WIDEST_Y, L, sx } from './layout';
import { clamp, pchip, samples, smoothstep, withBreaks, type Vec3 } from './math';
import { flipGeometry, gridSurface } from './surface';

const HALF_W = FUS_W / 2;

// [A] Side-view and plan-view profiles, tuned against the Airbus three-view.
const topProfile = pchip([
  [0, 5.2],
  [0.2, 5.84],
  [0.6, 6.22],
  [1.2, 6.66],
  [2.0, 7.05],
  [3.0, 7.42],
  [4.0, 7.92],
  [5.0, 8.5],
  [6.2, 9.1],
  [7.6, 9.62],
  [9.4, 10.03],
  [11.5, 10.3],
  [14.0, FUS_TOP],
  [50.0, FUS_TOP],
  [53.5, 10.36],
  [57.0, 10.15],
  [60.5, 9.78],
  [64.0, 9.3],
  [67.5, 8.78],
  [70.5, 8.36],
  [L, 8.1],
]);

const bottomProfile = pchip([
  [0, 5.2],
  [0.2, 4.6],
  [0.6, 4.28],
  [1.2, 3.84],
  [2.0, 3.4],
  [3.0, 2.98],
  [4.2, 2.62],
  [5.6, 2.34],
  [7.2, 2.15],
  [9.0, 2.05],
  [11.0, FUS_BOTTOM],
  [46.5, FUS_BOTTOM],
  [49.0, 2.1],
  [52.0, 2.48],
  [55.5, 3.18],
  [59.0, 4.05],
  [62.5, 5.0],
  [66.0, 5.98],
  [69.0, 6.85],
  [71.2, 7.42],
  [L, 7.72],
]);

const halfWidthProfile = pchip([
  [0, 0.0],
  [0.03, 0.3],
  [0.2, 0.78],
  [0.6, 1.3],
  [1.2, 1.78],
  [2.0, 2.22],
  [3.0, 2.6],
  [4.2, 2.95],
  [5.6, 3.22],
  [7.2, 3.42],
  [9.0, 3.53],
  [11.0, HALF_W],
  [49.0, HALF_W],
  [52.5, 3.48],
  [56.0, 3.24],
  [59.5, 2.86],
  [63.0, 2.36],
  [66.5, 1.74],
  [69.5, 1.12],
  [71.5, 0.7],
  [L, 0.36],
]);

const widestProfile = pchip([
  [0, 5.2],
  [3, 5.42],
  [8, 5.95],
  [13.0, FUS_WIDEST_Y],
  [49.0, FUS_WIDEST_Y],
  [56, 6.6],
  [64, 7.35],
  [L, 7.9],
]);

export interface Section {
  cy: number; // height of maximum breadth
  a: number; // half breadth
  bTop: number;
  bBot: number;
  nTop: number; // super-ellipse exponents
  nBot: number;
}

export function section(s: number): Section {
  const sc = clamp(s, 0, L);
  const top = topProfile(sc);
  const bot = bottomProfile(sc);
  const cy = clamp(widestProfile(sc), bot + 0.02, top - 0.02);
  const blend = smoothstep(1.5, 13, sc) * (1 - smoothstep(52, 70, sc));
  return {
    cy,
    a: Math.max(halfWidthProfile(sc), 0.001),
    bTop: Math.max(top - cy, 0.001),
    bBot: Math.max(cy - bot, 0.001),
    nTop: 2.0 + 0.42 * blend,
    nBot: 2.0 + 0.16 * blend,
  };
}

const spow = (v: number, e: number): number => Math.sign(v) * Math.pow(Math.abs(v), e);

/** Point on the fuselage surface. θ = 0 is starboard beam, θ = π/2 is the crown. */
export function fuselagePoint(s: number, theta: number, inflate = 0): Vec3 {
  const sec = section(s);
  const c = Math.cos(theta);
  const sn = Math.sin(theta);
  const n = sn >= 0 ? sec.nTop : sec.nBot;
  const b = sn >= 0 ? sec.bTop : sec.bBot;
  const z = (sec.a + inflate) * spow(c, 2 / n);
  const y = sec.cy + (b + inflate) * spow(sn, 2 / n);
  return [sx(s), y, z];
}

/** Outward surface normal (numerical). */
export function fuselageNormal(s: number, theta: number): Vec3 {
  const e = 1e-3;
  const p0 = fuselagePoint(s - e, theta);
  const p1 = fuselagePoint(s + e, theta);
  const q0 = fuselagePoint(s, theta - e);
  const q1 = fuselagePoint(s, theta + e);
  const du: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const dv: Vec3 = [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]];
  // s increases toward −X; θ increases from starboard to crown. dv × du points outward.
  const n: Vec3 = [dv[1] * du[2] - dv[2] * du[1], dv[2] * du[0] - dv[0] * du[2], dv[0] * du[1] - dv[1] * du[0]];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

/**
 * Find θ on a given side (+1 starboard, −1 port) where the surface reaches height y.
 * Returns the clamped extreme if y is outside the section.
 */
export function thetaAtHeight(s: number, y: number, side: 1 | -1): number {
  let lo = -Math.PI / 2 + 1e-4;
  let hi = Math.PI / 2 - 1e-4;
  for (let k = 0; k < 48; k++) {
    const mid = (lo + hi) / 2;
    if (fuselagePoint(s, mid)[1] < y) lo = mid;
    else hi = mid;
  }
  const t = (lo + hi) / 2;
  return side === 1 ? t : Math.PI - t;
}

export interface FuselageDetail {
  rows: number;
  around: number;
}

/** Station samples, denser at nose and tail where curvature is high. */
function stations(rows: number): number[] {
  const nose = samples(0, 16, Math.round(rows * 0.34), 0).map((t) => 16 * Math.pow(t / 16, 1.9));
  const mid = samples(16, 49, Math.round(rows * 0.28));
  const tail = samples(49, L, Math.round(rows * 0.38));
  return withBreaks([...nose, ...mid, ...tail], []);
}

export function buildFuselageSkin(detail: FuselageDetail): BufferGeometry {
  const ss = stations(detail.rows);
  const nv = detail.around;
  // θ runs from −π/2 (keel) around the starboard side, over the crown and back down to port.
  return gridSurface(
    ss.length - 1,
    nv,
    (i, j) => fuselagePoint(ss[i]!, -Math.PI / 2 + (j / nv) * Math.PI * 2),
    {
      wrapV: true,
      flip: true,
      uv: (i, j) => [ss[i]! / L, j / nv],
    },
  );
}

/**
 * A patch that conforms to the fuselage between stations s0..s1 and heights given by
 * `yAt(u, v)`, offset outward along the local normal. Used for doors and panels.
 */
export function conformalPatch(
  side: 1 | -1,
  s0: number,
  s1: number,
  yAt: (u: number, v: number) => number,
  offset: number,
  nu = 6,
  nv = 8,
): BufferGeometry {
  return gridSurface(nu, nv, (i, j) => surfaceAt(side, s0 + ((s1 - s0) * i) / nu, yAt(i / nu, j / nv), offset));
}

/** Surface point at station s and height y on a side, pushed outward by `offset`. */
export function surfaceAt(side: 1 | -1, s: number, y: number, offset: number): Vec3 {
  const th = thetaAtHeight(s, y, side);
  const p = fuselagePoint(s, th);
  const n = fuselageNormal(s, th);
  return [p[0] + n[0] * offset, p[1] + n[1] * offset, p[2] + n[2] * offset];
}

/** Resample a closed polyline to n points evenly spaced by arc length. */
export function resample(outline: [number, number][], n: number): [number, number][] {
  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push(l);
    total += l;
  }
  const out: [number, number][] = [];
  let seg = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (acc + segs[seg]! < target && seg < segs.length - 1) acc += segs[seg++]!;
    const a = outline[seg]!;
    const b = outline[(seg + 1) % outline.length]!;
    const t = segs[seg]! > 0 ? (target - acc) / segs[seg]! : 0;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** Rounded-rectangle outline (centre-relative ds, dy) used for windows and door seals. */
export function roundedRect(w: number, h: number, r: number, perCorner = 5): [number, number][] {
  const out: [number, number][] = [];
  const cx = [w / 2 - r, -w / 2 + r, -w / 2 + r, w / 2 - r];
  const cy = [h / 2 - r, h / 2 - r, -h / 2 + r, -h / 2 + r];
  for (let c = 0; c < 4; c++) {
    for (let k = 0; k <= perCorner; k++) {
      const a = (c * Math.PI) / 2 + (k / perCorner) * (Math.PI / 2);
      out.push([cx[c]! + r * Math.cos(a), cy[c]! + r * Math.sin(a)]);
    }
  }
  return out;
}

/** Belly (wing-to-body) fairing: a smooth lower lobe enveloping the wing roots. */
const bfDepth = pchip([
  [19.5, FUS_BOTTOM + 0.02],
  [23, 1.86],
  [27.5, 1.74],
  [38, 1.7],
  [45, 1.78],
  [50.5, 2.05],
  [54.0, 2.5],
]);
const bfHalfW = pchip([
  [19.5, 3.0],
  [23, 3.5],
  [28, 3.84],
  [40, 3.9],
  [47.5, 3.72],
  [51.5, 3.3],
  [54.0, 2.7],
]);
const bfTopY = pchip([
  [19.5, 3.4],
  [26, 4.25],
  [34, 4.7],
  [44, 4.7],
  [50, 4.35],
  [54.0, 3.7],
]);

export const BELLY_FAIRING_RANGE: [number, number] = [19.5, 54.0];

export function bellyFairingPoint(s: number, t: number, side: 1 | -1): Vec3 {
  // t: 0 = attachment on fuselage side (top), 1 = keel centreline
  const yTop = bfTopY(s);
  const yBot = bfDepth(s);
  const hw = bfHalfW(s);
  const th = thetaAtHeight(s, yTop, 1);
  const zTop = Math.max(0.01, fuselagePoint(s, th)[2] - 0.02);
  // Quarter super-ellipse from (zTop, yTop) bulging out to hw, down to keel.
  const ang = t * Math.PI * 0.5;
  const ex = 2 / 2.6;
  const zc = 0;
  const yc = yTop;
  const z = zc + Math.max(zTop, hw) * Math.pow(Math.cos(ang), ex);
  const y = yc - (yTop - yBot) * Math.pow(Math.sin(ang), ex);
  // Blend the top edge into the fuselage line.
  const zBlend = t < 0.15 ? zTop + (z - zTop) * smoothstep(0, 0.15, t) : z;
  // Fade fairing in/out at the ends.
  const sFade = Math.min(smoothstep(19.5, 22.5, s), 1 - smoothstep(51.5, 54.0, s));
  const fusZ = fuselagePoint(s, thetaAtHeight(s, y, 1))[2];
  const fusY = y;
  const zz = fusZ + (zBlend - fusZ) * sFade;
  const yy = Math.max(fusY, bottomProfile(s)) + (y - Math.max(fusY, bottomProfile(s))) * sFade;
  return [sx(s), yy, side * Math.max(zz, 0)];
}

export function buildBellyFairing(side: 1 | -1, rows: number, cols: number): BufferGeometry {
  const ss = samples(BELLY_FAIRING_RANGE[0], BELLY_FAIRING_RANGE[1], rows);
  return gridSurface(rows, cols, (i, j) => bellyFairingPoint(ss[i]!, j / cols, side), {
    flip: side === -1,
    uv: (i, j) => [ss[i]! / L, j / cols],
  });
}

export { bottomProfile, topProfile, halfWidthProfile };

/**
 * Rounded shape conforming to the skin: concentric rings of the outline are projected onto
 * the surface so large panels (doors) follow curvature instead of cutting through it.
 */
export function conformalShape(
  side: 1 | -1,
  s: number,
  y: number,
  outline: [number, number][],
  offset: number,
  rings = 3,
  atlasUV = false,
): BufferGeometry {
  // side=+1: local horizontal axis runs forward (−s) when viewed from outside starboard.
  const pts: Vec3[] = [];
  const nrm: Vec3[] = [];
  const uvs: [number, number][] = [];
  const push = (ds: number, dy: number) => {
    const ss = s + ds;
    const th = thetaAtHeight(ss, y + dy, side);
    const p = fuselagePoint(ss, th);
    const n = fuselageNormal(ss, th);
    pts.push([p[0] + n[0] * offset, p[1] + n[1] * offset, p[2] + n[2] * offset]);
    nrm.push(n);
    // the same (station, angle) mapping as the fuselage skin, so paint runs across the panel
    uvs.push([ss / L, (th + Math.PI / 2) / (Math.PI * 2)]);
  };
  push(0, 0);
  for (let r = 1; r <= rings; r++) for (const [ds, dy] of outline) push((ds * r) / rings, (dy * r) / rings);
  const m = outline.length;
  const idx: number[] = [];
  for (let k = 0; k < m; k++) idx.push(0, 1 + k, 1 + ((k + 1) % m));
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * m;
    const b0 = 1 + r * m;
    for (let k = 0; k < m; k++) {
      const k1 = (k + 1) % m;
      idx.push(a0 + k, b0 + k, b0 + k1, a0 + k, b0 + k1, a0 + k1);
    }
  }
  return fromArrays(pts, nrm, idx, atlasUV ? uvs : undefined);
}

/** Bilinear patch in (s, θ) parameter space — used for the flight-deck glazing. */
export function patchSTheta(corners: [number, number][], offset: number, nu = 8, nv = 8): BufferGeometry {
  const [a, b, c, d] = corners as [[number, number], [number, number], [number, number], [number, number]];
  const g = gridSurface(nu, nv, (i, j) => {
    const u = i / nu;
    const v = j / nv;
    const s = (1 - u) * (1 - v) * a[0] + u * (1 - v) * b[0] + u * v * c[0] + (1 - u) * v * d[0];
    const th = (1 - u) * (1 - v) * a[1] + u * (1 - v) * b[1] + u * v * c[1] + (1 - u) * v * d[1];
    const p = fuselagePoint(s, th);
    const n = fuselageNormal(s, th);
    return [p[0] + n[0] * offset, p[1] + n[1] * offset, p[2] + n[2] * offset];
  });
  // Orient so the patch faces outward regardless of corner ordering.
  const cs = (a[0] + b[0] + c[0] + d[0]) / 4;
  const ct = (a[1] + b[1] + c[1] + d[1]) / 4;
  const out = fuselageNormal(cs, ct);
  const nrm = g.getAttribute('normal');
  const mid = Math.floor(nrm.count / 2);
  if (nrm.getX(mid) * out[0] + nrm.getY(mid) * out[1] + nrm.getZ(mid) * out[2] < 0) flipGeometry(g);
  return g;
}

function fromArrays(pts: Vec3[], nrm: Vec3[], idx: number[], uvs?: [number, number][]): BufferGeometry {
  const g = new BufferGeometryCtor();
  g.setAttribute('position', new BufferAttributeCtor(new Float32Array(pts.flat()), 3));
  g.setAttribute('normal', new BufferAttributeCtor(new Float32Array(nrm.flat()), 3));
  g.setAttribute('uv', new BufferAttributeCtor(uvs ? new Float32Array(uvs.flat()) : new Float32Array(pts.length * 2), 2));
  g.setIndex(idx);
  // Make the winding agree with the stored normals.
  const p0 = pts[idx[0]!]!, p1 = pts[idx[1]!]!, p2 = pts[idx[2]!]!;
  const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
  const cr = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
  const n0 = nrm[idx[0]!]!;
  if (cr[0]! * n0[0] + cr[1]! * n0[1] + cr[2]! * n0[2] < 0) {
    const arr = g.getIndex()!.array as Uint16Array | Uint32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i + 1]!;
      arr[i + 1] = arr[i + 2]!;
      arr[i + 2] = t;
    }
  }
  return g;
}
