/**
 * Wing generator. Each wing is split into its real functional panels:
 * fixed structure, 2 droop-nose devices + 6 slats, 3 flaps, 3 ailerons, 8 spoilers,
 * flap-track fairings and the wing-tip fence. Panel spans are approximations scaled
 * from the Airbus three-view; counts follow Airbus published descriptions.
 */
import type { Group } from 'three';
import { ENGINES, WING, sx } from './layout';
import { lerp, piecewise, type Vec3 } from './math';
import { panel, skinSlab, ordinate, type LiftingSurface } from './lifting';
import { add, group, mesh, norm, pivoted, scale, sub } from './parts';
import { gridSurface, merge, orientOutward } from './surface';
import { lensDome, quad, staticWick, tube } from './details';

const { rootZ, tipZ, kinkZ } = WING;

export const wingLE = (z: number): number => lerp(WING.leRoot, WING.leTip, (z - rootZ) / (tipZ - rootZ));
export const wingTE = (z: number): number =>
  z <= kinkZ
    ? lerp(WING.teRoot, WING.teKink, (z - rootZ) / (kinkZ - rootZ))
    : lerp(WING.teKink, WING.teTip, (z - kinkZ) / (tipZ - kinkZ));
export const wingChord = (z: number): number => wingTE(z) - wingLE(z);
export const wingPlaneY = (z: number): number => WING.rootY + (z - rootZ) * Math.tan(WING.dihedral);
const incidence = (z: number): number => lerp(WING.incidenceRoot, WING.incidenceTip, (z - rootZ) / (tipZ - rootZ));
const tc = piecewise([
  [rootZ, WING.tcRoot],
  [kinkZ, WING.tcKink],
  [tipZ, WING.tcTip],
]);

export function wingSurface(side: 1 | -1): LiftingSurface {
  return {
    cambered: true,
    chord: wingChord,
    tc,
    map(z, xc, yn) {
      const c = wingChord(z);
      const i = incidence(z);
      const dx = xc * c;
      const dy = yn * c;
      const s = wingLE(z) + dx * Math.cos(i) + dy * Math.sin(i);
      const y = wingPlaneY(z) + dy * Math.cos(i) - dx * Math.sin(i);
      return [sx(s), y, side * z];
    },
  };
}

/** Wing surface areas: published reference area is 845 m² (includes the body-carried portion). */
export function planformArea(): number {
  let a = 0;
  const n = 400;
  for (let k = 0; k < n; k++) {
    const z = lerp(0, tipZ, (k + 0.5) / n);
    a += wingChord(Math.max(z, rootZ)) * (tipZ / n);
  }
  return 2 * a;
}

interface Span {
  z0: number;
  z1: number;
}

export const DROOP_NOSE: Span[] = [
  { z0: 4.4, z1: 8.9 },
  { z0: 8.9, z1: 13.1 },
];
export const SLATS: Span[] = [
  { z0: 15.9, z1: 19.9 },
  { z0: 19.9, z1: 24.0 },
  { z0: 27.4, z1: 30.5 },
  { z0: 30.5, z1: 33.6 },
  { z0: 33.6, z1: 36.6 },
  { z0: 36.6, z1: 39.3 },
];
export const FLAPS: Span[] = [
  { z0: 3.95, z1: 13.4 },
  { z0: 13.4, z1: 21.2 },
  { z0: 21.2, z1: 29.3 },
];
export const AILERONS: Span[] = [
  { z0: 29.3, z1: 32.6 },
  { z0: 32.6, z1: 35.9 },
  { z0: 35.9, z1: 39.15 },
];
export const SPOILERS: Span[] = Array.from({ length: 8 }, (_, k) => {
  const a = 5.0;
  const b = 29.0;
  const w = (b - a) / 8;
  return { z0: a + k * w + 0.03, z1: a + (k + 1) * w - 0.03 };
});

export const LE_FRAC = 0.115; // slat chord fraction
export const FLAP_FRAC = 0.7; // flap leading edge chord fraction
export const AIL_FRAC = 0.765;
const SPOILER_C0 = 0.575;

/** Hinge line through two spanwise points at chord fraction `xc`, ordinate `yn`. */
function hinge(surf: LiftingSurface, s: Span, xc: number, upperOrd: 'mid' | 'upper' | 'lower', side: 1 | -1) {
  const ord = (z: number) => {
    const u = ordinate(surf, z, xc, true);
    const l = ordinate(surf, z, xc, false);
    return upperOrd === 'upper' ? u : upperOrd === 'lower' ? l : (u + l) / 2;
  };
  const p0 = surf.map(s.z0, xc, ord(s.z0));
  const p1 = surf.map(s.z1, xc, ord(s.z1));
  // Positive rotation = trailing edge down for both wings.
  const axis = norm(scale(sub(p1, p0), side));
  return { pivot: p0, axis };
}

/**
 * Wing atlas coordinates, shared by every wing panel so one painted texture (panel lines,
 * walkways, stencils, soot) runs continuously across slats, box, flaps and ailerons.
 * u: 0 = left tip, 0.5 = centreline, 1 = right tip. v: 0.5 = leading edge, 1 = upper trailing
 * edge, 0 = lower trailing edge.
 */
export function wingUV(side: 1 | -1): (span: number, xc: number, upper: boolean) => [number, number] {
  return (span, xc, upper) => [0.5 + 0.5 * side * (span / tipZ), upper ? 0.5 + 0.5 * xc : 0.5 - 0.5 * xc];
}

export function buildWing(side: 1 | -1, quality: number): Group {
  const S = side === 1 ? 'R' : 'L';
  const surf = wingSurface(side);
  const uvMap = wingUV(side);
  const nChord = Math.round(22 * quality);
  const g = group(`wing_${S}`, [], `wing`);

  // --- Fixed structure: leading-edge fixed segments, wing box, fixed trailing edges.
  const fixedLE: Span[] = [
    { z0: rootZ, z1: DROOP_NOSE[0]!.z0 },
    { z0: DROOP_NOSE[1]!.z1, z1: SLATS[0]!.z0 },
    { z0: SLATS[1]!.z1, z1: SLATS[2]!.z0 },
    { z0: SLATS[5]!.z1, z1: tipZ },
  ];
  const boxSegs: { z0: number; z1: number; c1: number }[] = [
    { z0: rootZ, z1: FLAPS[0]!.z0, c1: 1 },
    { z0: FLAPS[0]!.z0, z1: AILERONS[0]!.z0, c1: FLAP_FRAC },
    { z0: AILERONS[0]!.z0, z1: AILERONS[2]!.z1, c1: AIL_FRAC },
    { z0: AILERONS[2]!.z1, z1: tipZ, c1: 1 },
  ];
  // Split the box at the leading-edge breaks so slatted spans start at LE_FRAC.
  const leBreaks = [rootZ, ...fixedLE.flatMap((f) => [f.z0, f.z1]), tipZ].sort((a, b) => a - b);
  const isFixedLE = (z: number) => fixedLE.some((f) => z >= f.z0 - 1e-6 && z <= f.z1 + 1e-6);
  const boxParts = [];
  for (const seg of boxSegs) {
    const cuts = [seg.z0, ...leBreaks.filter((b) => b > seg.z0 && b < seg.z1), seg.z1];
    for (let k = 0; k < cuts.length - 1; k++) {
      const a = cuts[k]!;
      const b = cuts[k + 1]!;
      const c0 = isFixedLE((a + b) / 2) ? 0 : LE_FRAC;
      boxParts.push(panel(surf, a, b, c0, seg.c1, { nChord: c0 === 0 ? nChord + 8 : nChord, uvMap }));
    }
  }
  for (const [k, geo] of boxParts.entries()) g.add(mesh(`wing_${S}_box_${k}`, geo, 'wingSkin', 'wing'));

  // --- Leading-edge devices
  const leDevice = (s: Span, name: string, partId: string, droop: boolean) => {
    const geo = panel(surf, s.z0, s.z1, 0, LE_FRAC - 0.002, { nChord: Math.round(16 * quality), uvMap });
    const h = hinge(surf, s, droop ? LE_FRAC : LE_FRAC + 0.02, droop ? 'mid' : 'lower', side);
    const kids = [mesh(`${name}_mesh`, geo, 'wingSkin', partId)];
    if (!droop) {
      // two curved tracks per slat, hidden in the wing when stowed and bared when deployed
      const tracks = [0.25, 0.75].map((f) => {
        const z = s.z0 + (s.z1 - s.z0) * f;
        const mid = (xc: number) => (ordinate(surf, z, xc, true) * 0.35 + ordinate(surf, z, xc, false) * 0.65);
        const pts: Vec3[] = [];
        for (let k = 0; k <= 6; k++) {
          const xc = LE_FRAC - 0.03 + k * 0.03;
          pts.push(surf.map(z, xc, mid(xc) - 0.004 * k));
        }
        return tube(pts, 0.032, 8);
      });
      kids.push(mesh(`${name}_tracks`, merge(tracks), 'metal', partId));
    }
    // Positive = leading edge down.
    const node = pivoted(name, droop ? h.pivot : add(h.pivot, [0, -0.06 * wingChord(s.z0), 0]), kids, {
      kind: 'hinge',
      axis: scale(h.axis, -1),
      min: 0,
      max: droop ? 20 : 23,
    }, partId);
    if (!droop) node.userData.articulation.travel = [0.07 * wingChord(s.z0), -0.03 * wingChord(s.z0), 0];
    return node;
  };
  DROOP_NOSE.forEach((s, k) => g.add(leDevice(s, `droop_${S}${k + 1}`, 'droopNose', true)));
  SLATS.forEach((s, k) => g.add(leDevice(s, `slat_${S}${k + 1}`, 'slat', false)));
  for (const [k, s] of fixedLE.entries()) {
    g.add(mesh(`wing_${S}_le_${k}`, panel(surf, s.z0, s.z1, 0, LE_FRAC, { nChord: Math.round(16 * quality), uvMap }), 'wingSkin', 'wing'));
  }

  // --- Flaps (Fowler motion: aft translation + rotation)
  FLAPS.forEach((s, k) => {
    const name = `flap_${S}${k + 1}`;
    const geo = panel(surf, s.z0 + 0.03, s.z1 - 0.03, FLAP_FRAC + 0.004, 1, { nChord: Math.round(18 * quality), uvMap });
    const h = hinge(surf, s, FLAP_FRAC + 0.05, 'mid', side);
    const c = wingChord((s.z0 + s.z1) / 2);
    g.add(
      pivoted(name, h.pivot, [mesh(`${name}_mesh`, geo, 'wingSkin', 'flap')], {
        kind: 'hinge',
        axis: h.axis,
        min: 0,
        max: 33,
        travel: [-0.2 * c, -0.035 * c, 0],
      }, 'flap'),
    );
  });

  // --- Ailerons
  AILERONS.forEach((s, k) => {
    const name = `aileron_${S}${k + 1}`;
    const geo = panel(surf, s.z0 + 0.03, s.z1 - 0.03, AIL_FRAC + 0.004, 1, { nChord: Math.round(14 * quality), uvMap });
    const h = hinge(surf, s, AIL_FRAC + 0.01, 'mid', side);
    // static dischargers on the trailing edge
    const wicks = [0.2, 0.55, 0.85].map((f) => staticWick(surf.map(s.z0 + (s.z1 - s.z0) * f, 0.995, 0), [-1, -0.04, side * 0.1]));
    g.add(pivoted(name, h.pivot, [mesh(`${name}_mesh`, geo, 'wingSkin', 'aileron'), mesh(`${name}_wicks`, merge(wicks), 'darkMetal', 'aileron')], { kind: 'hinge', axis: h.axis, min: -25, max: 25 }, 'aileron'));
  });

  // --- Spoilers (upper surface panels hinged at their leading edge; positive = panel up)
  SPOILERS.forEach((s, k) => {
    const name = `spoiler_${S}${k + 1}`;
    const geo = skinSlab(surf, s.z0, s.z1, SPOILER_C0, FLAP_FRAC + 0.045, true, 0.035, 0.006, uvMap);
    const h = hinge(surf, s, SPOILER_C0, 'upper', side);
    g.add(pivoted(name, h.pivot, [mesh(`${name}_mesh`, geo, 'wingSkin', 'spoiler')], { kind: 'hinge', axis: scale(h.axis, -1), min: 0, max: 50 }, 'spoiler'));
  });

  // --- Flap-track fairings (fixed canoes under the trailing edge)
  for (const z of [7.2, 11.6, 17.4, 21.2, 25.6]) g.add(mesh(`fairing_${S}_${z}`, flapTrackFairing(surf, z), 'composite', 'flapTrackFairing'));

  // --- Wing-tip fence (upper & lower), its dischargers and the navigation-light lens
  g.add(mesh(`tipfence_${S}`, tipFence(side), 'paintTail', 'wingtipFence'));
  {
    const c = wingChord(tipZ);
    const fenceTE = (hh: number): Vec3 => {
      const up = hh >= 0;
      const le = up ? wingLE(tipZ) + lerp(0, c * 0.95, hh) : wingLE(tipZ) + lerp(0.15 * c, c * 0.9, -hh);
      const ch = up ? lerp(c * 0.98, 0.35, hh) : lerp(c * 0.85, 0.3, -hh);
      return [sx(le + ch * 0.98), wingPlaneY(tipZ) + (up ? hh * 1.45 : hh * 0.95), side * (tipZ - 0.02)];
    };
    const wicks = [0.25, 0.55, 0.85, -0.5].map((hh) => staticWick(fenceTE(hh), [-1, hh > 0 ? 0.25 : -0.1, 0]));
    g.add(mesh(`tipfence_${S}_wicks`, merge(wicks), 'darkMetal', 'wingtipFence'));
    g.add(mesh(`navlight_lens_${S}`, lensDome([sx(wingLE(tipZ) + 1.2), wingPlaneY(tipZ) + 0.05, side * (tipZ + 0.035)], [0, 0, side], [1, 0, 0], 0.22, 0.08, 0.075), 'lens', 'wingtipFence'));
    // NACA fuel-vent intake on the lower surface near the tip
    const zv = tipZ - 2.4;
    const lo = (z: number, xc: number): Vec3 => {
      const p = surf.map(z, xc, ordinate(surf, z, xc, false));
      return [p[0], p[1] - 0.004, p[2]];
    };
    let v = quad(lo(zv - 0.12, 0.4), lo(zv + 0.12, 0.4), lo(zv + 0.05, 0.46), lo(zv - 0.05, 0.46));
    if (v.getAttribute('normal').getY(0) > 0) v = quad(lo(zv - 0.05, 0.46), lo(zv + 0.05, 0.46), lo(zv + 0.12, 0.4), lo(zv - 0.12, 0.4));
    g.add(mesh(`fuel_vent_${S}`, v, 'seal', 'wing'));
  }

  g.userData.engines = ENGINES.filter((e) => e.side === side).map((e) => e.id);
  return g;
}

function flapTrackFairing(surf: LiftingSurface, z: number) {
  const c = wingChord(z);
  const x0 = 0.5;
  const x1 = 1.32;
  const nu = 24;
  const nv = 16;
  const depth = (t: number) => 0.62 * Math.sin(Math.PI * Math.pow(t, 0.7)) * Math.min(1, c / 9) + 0.05;
  const width = (t: number) => 0.3 * Math.sin(Math.PI * Math.pow(t, 0.55)) + 0.02;
  const geo = gridSurface(
    nu,
    nv,
    (i, j) => {
      const t = i / nu;
      const xc = lerp(x0, x1, t);
      const top = surf.map(z, Math.min(xc, 1), ordinate(surf, z, Math.min(xc, 1), false));
      const extra = xc > 1 ? (xc - 1) * c : 0;
      const a = (j / nv) * Math.PI * 2;
      const d = depth(t);
      const w = width(t);
      return [top[0] - extra, top[1] + 0.1 - d * (0.5 - 0.5 * Math.cos(a)) * 1.0, top[2] + w * Math.sin(a)];
    },
    { wrapV: true },
  );
  return orientOutward(geo);
}

function tipFence(side: 1 | -1) {
  const z = tipZ - 0.02;
  const baseLE = wingLE(tipZ);
  const c = wingChord(tipZ);
  const y0 = wingPlaneY(tipZ);
  // Spanwise parameter h: −1 (bottom tip) … +1 (top tip) of the delta-shaped fence.
  const fence: LiftingSurface = {
    cambered: false,
    chord: (h) => (h >= 0 ? lerp(c * 0.98, 0.35, h) : lerp(c * 0.85, 0.3, -h)),
    tc: () => 0.06,
    map(h, xc, yn) {
      const ch = h >= 0 ? lerp(c * 0.98, 0.35, h) : lerp(c * 0.85, 0.3, -h);
      const le = h >= 0 ? baseLE + lerp(0, c * 0.95, h) : baseLE + lerp(0.15 * c, c * 0.9, -h);
      const height = h >= 0 ? h * 1.45 : h * 0.95;
      return [sx(le + xc * ch), y0 + height, side * (z + yn * ch * 0.6)];
    },
  };
  const up = panel(fence, 0, 1, 0, 1, { nSpan: 6, nChord: 14 });
  const dn = panel(fence, -1, 0, 0, 1, { nSpan: 4, nChord: 14 });
  return merge([up, dn]);
}

/** Point on the lower wing surface — used to attach pylons and landing gear. */
export function wingLowerPoint(side: 1 | -1, z: number, xc: number): Vec3 {
  const surf = wingSurface(side);
  return surf.map(z, xc, ordinate(surf, z, xc, false));
}
export function wingUpperPoint(side: 1 | -1, z: number, xc: number): Vec3 {
  const surf = wingSurface(side);
  return surf.map(z, xc, ordinate(surf, z, xc, true));
}
