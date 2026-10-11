/**
 * Generic lifting-surface generator (wings, tailplanes, fin). A surface is described by a
 * mapping from (spanwise position, chord fraction, airfoil ordinate / chord) to model space,
 * so the same panel builder produces the fixed structure, slats, flaps, ailerons, elevators
 * and rudder — each as a separate closed body that can be articulated.
 */
import type { BufferGeometry } from 'three';
import { capLoop, gridSurface, merge, orientOutward } from './surface';
import type { Vec3 } from './math';

export interface LiftingSurface {
  /** chord length at spanwise position */
  chord(span: number): number;
  /** thickness-to-chord ratio */
  tc(span: number): number;
  /** model-space point for chord fraction xc and normalised ordinate yn (y / chord) */
  map(span: number, xc: number, yn: number): Vec3;
  /** cambered (true) or symmetric (false) section */
  cambered: boolean;
}

/** NACA-style thickness distribution with closed trailing edge (half-thickness / t). */
export function thickness(x: number): number {
  const xx = Math.min(1, Math.max(0, x));
  return 5 * (0.2969 * Math.sqrt(xx) - 0.126 * xx - 0.3516 * xx * xx + 0.2843 * xx ** 3 - 0.1036 * xx ** 4);
}

/** Aft-loaded camber line, loosely inspired by supercritical transport sections. */
export function camber(x: number): number {
  const xx = Math.min(1, Math.max(0, x));
  return 0.0165 * 4 * xx * (1 - xx) * (0.5 + 0.95 * xx);
}

export function ordinate(surf: LiftingSurface, span: number, x: number, upper: boolean): number {
  const t = surf.tc(span) * thickness(x);
  const c = surf.cambered ? camber(x) : 0;
  return upper ? c + t : c - t;
}

export interface PanelOptions {
  /** spanwise subdivisions */
  nSpan?: number;
  /** points per chord side */
  nChord?: number;
  /** extra uniform thickness scale (e.g. a spoiler slab) */
  inset?: number;
}

/**
 * Closed loop around the section between chord fractions c0..c1. Corners where the loop
 * leaves the airfoil contour (spar faces) are duplicated so shading stays crisp.
 */
function sectionLoop(c0: number, c1: number, n: number): { x: number; upper: boolean }[] {
  const pts: { x: number; upper: boolean }[] = [];
  const xs: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // Cluster samples toward the leading edge (high curvature) when the panel includes it.
    const w = c0 === 0 ? 1 - Math.cos((Math.PI / 2) * t) : 0.5 - 0.5 * Math.cos(Math.PI * t);
    xs.push(c0 + (c1 - c0) * w);
  }
  // Ensure exact ends
  xs[0] = c0;
  xs[n] = c1;
  for (let i = n; i >= 0; i--) pts.push({ x: xs[i]!, upper: true });
  if (c0 > 0) pts.push({ x: xs[0]!, upper: false }); // duplicate corner (front spar)
  for (let i = c0 > 0 ? 0 : 1; i <= n; i++) pts.push({ x: xs[i]!, upper: false });
  if (c1 < 0.999) pts.push({ x: xs[n]!, upper: true }); // rear spar corner
  return pts;
}

export function panel(
  surf: LiftingSurface,
  span0: number,
  span1: number,
  c0: number,
  c1: number,
  opts: PanelOptions = {},
): BufferGeometry {
  const nSpan = opts.nSpan ?? Math.max(2, Math.ceil(Math.abs(span1 - span0) / 0.8));
  const nChord = opts.nChord ?? 24;
  const loop = sectionLoop(c0, c1, nChord);
  const nv = loop.length;
  const pt = (span: number, k: number): Vec3 => {
    const q = loop[k % nv]!;
    return surf.map(span, q.x, ordinate(surf, span, q.x, q.upper));
  };
  const body = gridSurface(
    nSpan,
    nv,
    (i, j) => pt(span0 + ((span1 - span0) * i) / nSpan, j),
    { wrapV: true, uv: (i, j) => [i / nSpan, j / nv] },
  );
  const capA: Vec3[] = [];
  const capB: Vec3[] = [];
  for (let k = 0; k < nv; k++) {
    capA.push(pt(span0, k));
    capB.push(pt(span1, k));
  }
  const dir = (a: Vec3[], b: Vec3[]): Vec3 => {
    const ca = a.reduce<Vec3>((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]);
    const cb = b.reduce<Vec3>((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]);
    const d: Vec3 = [ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]];
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    return [d[0] / l, d[1] / l, d[2] / l];
  };
  const g = merge([body, capLoop(capA, dir(capA, capB)), capLoop(capB, dir(capB, capA))]);
  return orientOutward(g);
}

/**
 * Thin slab following the upper (or lower) contour between c0..c1 – spoilers and
 * gear doors that are skins rather than full-depth bodies.
 */
export function skinSlab(
  surf: LiftingSurface,
  span0: number,
  span1: number,
  c0: number,
  c1: number,
  upper: boolean,
  thicknessM: number,
  lift = 0.004,
): BufferGeometry {
  const nSpan = Math.max(2, Math.ceil(Math.abs(span1 - span0) / 0.8));
  const nC = 6;
  const loop: { x: number; off: number }[] = [];
  for (let i = 0; i <= nC; i++) loop.push({ x: c0 + ((c1 - c0) * i) / nC, off: lift });
  loop.push({ x: c1, off: lift - thicknessM });
  for (let i = nC; i >= 0; i--) loop.push({ x: c0 + ((c1 - c0) * i) / nC, off: lift - thicknessM });
  loop.push({ x: c0, off: lift });
  const nv = loop.length;
  const sgn = upper ? 1 : -1;
  const pt = (span: number, k: number): Vec3 => {
    const q = loop[k % nv]!;
    const c = surf.chord(span);
    return surf.map(span, q.x, ordinate(surf, span, q.x, upper) + (sgn * q.off) / c);
  };
  const body = gridSurface(nSpan, nv - 1, (i, j) => pt(span0 + ((span1 - span0) * i) / nSpan, j), { wrapV: true });
  const capA: Vec3[] = [];
  const capB: Vec3[] = [];
  for (let k = 0; k < nv - 1; k++) {
    capA.push(pt(span0, k));
    capB.push(pt(span1, k));
  }
  const nA = surf.map(span0, 0.5, 0);
  const nB = surf.map(span1, 0.5, 0);
  const d: Vec3 = [nA[0] - nB[0], nA[1] - nB[1], nA[2] - nB[2]];
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  const dA: Vec3 = [d[0] / l, d[1] / l, d[2] / l];
  const dB: Vec3 = [-dA[0], -dA[1], -dA[2]];
  return orientOutward(merge([body, capLoop(capA, dA), capLoop(capB, dB)]));
}
