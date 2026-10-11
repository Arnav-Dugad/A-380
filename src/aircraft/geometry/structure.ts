/**
 * Representative primary structure for X-ray and cutaway views: fuselage frames and
 * stringers, deck floors and cross-beams, pressure bulkheads, wing spars and ribs, tail
 * spars and the lower-deck cargo holds with LD3 containers.
 *
 * This is an educational representation — frame pitch, spar positions and rib counts are
 * typical transport-aircraft values, not A380 drawings (see docs/ACCURACY.md).
 */
import type { BufferGeometry, Group } from 'three';
import { COCKPIT_FLOOR, MAIN_DECK_FLOOR, UPPER_DECK_FLOOR, WING, HTP, VTP, sx } from './layout';
import { fuselagePoint, thetaAtHeight, bottomProfile, topProfile } from './fuselage';
import { box } from './gear';
import { ordinate, type LiftingSurface } from './lifting';
import { lerp, type Vec3 } from './math';
import { group, mesh } from './parts';
import { gridSurface, merge } from './surface';
import { htpSurface, vtpSurface } from './tail';
import { wingSurface } from './wing';

const FRAME_PITCH = 1.6; // drawn frames (every third real frame bay, for legibility)

function frameRing(s: number, inset: number, width: number): BufferGeometry {
  const nv = 72;
  return gridSurface(1, nv, (i, j) => {
    const th = -Math.PI / 2 + (j / nv) * Math.PI * 2;
    const p = fuselagePoint(s + (i - 0.5) * width, th, -inset);
    return p;
  }, { wrapV: true });
}

function stringer(theta: number, s0: number, s1: number, inset: number): BufferGeometry {
  const n = Math.ceil((s1 - s0) / 1.2);
  return gridSurface(n, 1, (i, j) => {
    const s = lerp(s0, s1, i / n);
    return fuselagePoint(s, theta + (j - 0.5) * 0.012, -inset);
  });
}

/** Horizontal floor at height y spanning the section width between stations. */
function floor(y: number, s0: number, s1: number, inset = 0.12): BufferGeometry {
  const n = Math.ceil((s1 - s0) / 0.8);
  return gridSurface(n, 1, (i, j) => {
    const s = lerp(s0, s1, i / n);
    const th = thetaAtHeight(s, y, 1);
    const z = Math.max(0, fuselagePoint(s, th)[2] - inset);
    return [sx(s), y, (j * 2 - 1) * z];
  });
}

function bulkhead(s: number, inset: number, dome = 0): BufferGeometry {
  const nv = 48;
  const nr = 6;
  return gridSurface(nr, nv, (i, j) => {
    const th = -Math.PI / 2 + (j / nv) * Math.PI * 2;
    const r = i / nr;
    const rim = fuselagePoint(s, th, -inset);
    const cy = (topProfile(s) + bottomProfile(s)) / 2;
    const bulge = dome * (1 - r * r);
    return [rim[0] + bulge, cy + (rim[1] - cy) * r, rim[2] * r];
  }, { wrapV: true });
}

/** Thin vertical plate between lower and upper skin at chord fraction xc (spar web). */
function spar(surf: LiftingSurface, a: number, b: number, xc: number, n = 24): BufferGeometry {
  return gridSurface(n, 1, (i, j) => {
    const span = lerp(a, b, i / n);
    const yn = j === 0 ? ordinate(surf, span, xc, false) * 0.94 : ordinate(surf, span, xc, true) * 0.94;
    return surf.map(span, xc, yn);
  });
}

/** Rib at a spanwise station between two chord fractions. */
function rib(surf: LiftingSurface, span: number, x0: number, x1: number): BufferGeometry {
  const n = 10;
  return gridSurface(n, 1, (i, j) => {
    const xc = lerp(x0, x1, i / n);
    const yn = ordinate(surf, span, xc, j === 1) * 0.94;
    return surf.map(span, xc, yn);
  });
}

function wingStructure(side: 1 | -1): BufferGeometry {
  const surf = wingSurface(side);
  const parts = [spar(surf, WING.rootZ, WING.tipZ - 0.3, 0.15), spar(surf, WING.rootZ, WING.tipZ - 0.3, 0.64)];
  for (let z = WING.rootZ + 0.7; z < WING.tipZ - 0.4; z += 1.45) parts.push(rib(surf, z, 0.15, 0.64));
  return merge(parts);
}

function tailStructure(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const side of [1, -1] as const) {
    const s = htpSurface(side);
    parts.push(spar(s, HTP.rootZ, HTP.tipZ - 0.2, 0.15, 12), spar(s, HTP.rootZ, HTP.tipZ - 0.2, 0.65, 12));
    for (let z = HTP.rootZ + 0.6; z < HTP.tipZ - 0.3; z += 1.2) parts.push(rib(s, z, 0.15, 0.65));
  }
  parts.push(spar(vtpSurface, VTP.rootY, VTP.tipY - 0.2, 0.15, 12), spar(vtpSurface, VTP.rootY, VTP.tipY - 0.2, 0.62, 12));
  for (let h = VTP.rootY + 0.6; h < VTP.tipY - 0.3; h += 1.2) parts.push(rib(vtpSurface, h, 0.15, 0.62));
  return merge(parts);
}

/** Centre wing box carry-through between the wing roots. */
function centreBox(): BufferGeometry {
  const surf = wingSurface(1);
  const le = surf.map(WING.rootZ, 0.15, 0);
  const te = surf.map(WING.rootZ, 0.64, 0);
  const yL = surf.map(WING.rootZ, 0.4, ordinate(surf, WING.rootZ, 0.4, false))[1];
  const yU = surf.map(WING.rootZ, 0.4, ordinate(surf, WING.rootZ, 0.4, true))[1];
  const cx = (le[0] + te[0]) / 2;
  const len = le[0] - te[0];
  return merge([box([cx, yL + 0.05, 0], [len, 0.06, WING.rootZ * 2]), box([cx, yU - 0.05, 0], [len, 0.06, WING.rootZ * 2]), box([le[0], (yL + yU) / 2, 0], [0.06, yU - yL, WING.rootZ * 2]), box([te[0], (yL + yU) / 2, 0], [0.06, yU - yL, WING.rootZ * 2])]);
}

/** LD3 container: 1.56 m deep, 1.53 m wide base, 2.01 m top, 1.63 m high with a contoured corner. */
function ld3(c: Vec3, side: 1 | -1): BufferGeometry {
  const base = box([c[0], c[1] + 0.5, c[2]], [1.5, 1.0, 1.5]);
  const top = box([c[0], c[1] + 1.3, c[2] + side * 0.22], [1.5, 0.6, 1.95]);
  return merge([base, top]);
}

function cargo(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const yFloor = 2.65;
  for (const [s0, s1] of [
    [10.4, 26.2],
    [41.6, 54.0],
  ] as const) {
    for (let s = s0; s + 1.56 <= s1; s += 1.6) {
      for (const side of [1, -1] as const) parts.push(ld3([sx(s + 0.8), yFloor, side * 0.82], side));
    }
  }
  return merge(parts);
}

export function buildStructure(): Group {
  const g = group('structure', [], 'structure');
  const frames: BufferGeometry[] = [];
  for (let s = 2.2; s < 68; s += FRAME_PITCH) frames.push(frameRing(s, 0.07, 0.09));
  const stringers: BufferGeometry[] = [];
  for (const th of [-70, -40, -12, 15, 38, 58, 75, 105, 122, 142, 165, 192, 220, 250].map((d) => (d * Math.PI) / 180)) stringers.push(stringer(th, 3, 66, 0.05));
  g.add(mesh('fuselage_frames', merge([...frames, ...stringers]), 'structure', 'frames'));

  const floors = merge([
    floor(MAIN_DECK_FLOOR, 3.6, 63.5),
    floor(UPPER_DECK_FLOOR, 12.0, 60.0),
    floor(COCKPIT_FLOOR, 2.0, 7.0),
    floor(2.62, 8.6, 27.0),
    floor(2.62, 40.6, 56.5),
  ]);
  const beams: BufferGeometry[] = [];
  for (let s = 4; s < 63; s += 1.6) {
    const half = fuselagePoint(s, thetaAtHeight(s, MAIN_DECK_FLOOR, 1))[2] - 0.12;
    if (half > 0.5) beams.push(box([sx(s), MAIN_DECK_FLOOR - 0.18, 0], [0.08, 0.32, half * 2]));
    if (s > 12 && s < 60) {
      const hu = fuselagePoint(s, thetaAtHeight(s, UPPER_DECK_FLOOR, 1))[2] - 0.12;
      beams.push(box([sx(s), UPPER_DECK_FLOOR - 0.15, 0], [0.08, 0.26, hu * 2]));
    }
  }
  g.add(mesh('deck_floors', merge([floors, ...beams]), 'structure', 'floors'));
  g.add(mesh('pressure_bulkheads', merge([bulkhead(1.9, 0.05, 0.25), bulkhead(64.2, 0.05, -0.9)]), 'structure', 'frames'));
  g.add(mesh('wing_box', merge([wingStructure(1), wingStructure(-1), centreBox()]), 'structure', 'wingBox'));
  g.add(mesh('tail_structure', tailStructure(), 'structure', 'wingBox'));
  g.add(mesh('cargo_ulds', cargo(), 'cargo', 'cargoHold'));
  return g;
}
