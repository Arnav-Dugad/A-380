/**
 * Passenger cabin — a representative four-class, 469-seat layout whose class totals match
 * British Airways' published A380 configuration (14 First, 97 Club, 55 Premium Economy,
 * 303 Economy). Zoning per deck, seat pitch and monument positions are illustrative.
 *
 * Seats are exported once per class with EXT_mesh_gpu_instancing transforms, so ~470 seats
 * cost three draw calls.
 */
import { InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry, type Group } from 'three';
import { DOORS, MAIN_DECK_FLOOR, UPPER_DECK_FLOOR, sx } from './layout';
import { fuselagePoint, thetaAtHeight } from './fuselage';
import { box, cylinder } from './gear';
import { lerp, type Vec3 } from './math';
import { group, mat, mesh, type MaterialKey } from './parts';
import { gridSurface, merge } from './surface';
import { MAIN_WINDOW_Y, UPPER_WINDOW_Y } from './airframe';

export type CabinClass = 'first' | 'business' | 'premium' | 'economy';

export interface SeatRecord {
  id: string; // e.g. "M 32A"
  deck: 'main' | 'upper';
  cls: CabinClass;
  row: number;
  letter: string;
  s: number;
  z: number;
  window: boolean;
  facing: 1 | -1;
}

interface Zone {
  deck: 'main' | 'upper';
  cls: CabinClass;
  s0: number;
  rows: number;
  pitch: number;
  /** seat lateral offsets (m) and letters, left to right looking forward */
  seats: { z: number; l: string }[];
  firstRow: number;
  skip?: number; // seats removed from the last row(s) to hit published totals
  /** alternate forward/aft facing (herringbone-style business) */
  alternate?: boolean;
}

const Y_MAIN = [-2.75, -2.29, -1.83, -0.92, -0.46, 0.0, 0.46, 1.83, 2.29, 2.75]; // 3-4-3 (with centre 4 shifted)
const yMain = Y_MAIN.map((z, i) => ({ z: i >= 3 && i <= 6 ? z - 0.23 + 0.46 * 0 : z, l: 'ABCDEFGHJK'[i]! }));
const Y_UP = [-2.25, -1.79, -0.69, -0.23, 0.23, 0.69, 1.79, 2.25].map((z, i) => ({ z, l: 'ABDEFGJK'[i]! }));
const W_UP = [-2.15, -1.61, -0.54, 0, 0.54, 1.61, 2.15].map((z, i) => ({ z, l: 'ABDEFJK'[i]! }));
const J_UP = [-2.1, -1.45, -0.55, 0, 0.55, 1.45, 2.1].map((z, i) => ({ z, l: 'ABDEFJK'[i]! }));
const J_MAIN = [-2.55, -1.85, -0.9, -0.3, 0.3, 0.9, 1.85, 2.55].map((z, i) => ({ z, l: 'ABDEFGJK'[i]! }));
const F_MAIN = [-2.35, -0.55, 0.55, 2.35].map((z, i) => ({ z, l: 'AEFK'[i]! }));

export const ZONES: Zone[] = [
  { deck: 'main', cls: 'first', s0: 13.1, rows: 4, pitch: 1.75, seats: F_MAIN, firstRow: 1, skip: 2 },
  { deck: 'main', cls: 'business', s0: 21.6, rows: 6, pitch: 1.5, seats: J_MAIN, firstRow: 10, skip: 4, alternate: true },
  { deck: 'main', cls: 'economy', s0: 32.7, rows: 13, pitch: 0.79, seats: yMain, firstRow: 30 },
  { deck: 'main', cls: 'economy', s0: 46.7, rows: 7, pitch: 0.79, seats: yMain, firstRow: 43, skip: 1 },
  { deck: 'upper', cls: 'business', s0: 17.6, rows: 8, pitch: 1.5, seats: J_UP, firstRow: 50, skip: 3, alternate: true },
  { deck: 'upper', cls: 'premium', s0: 30.0, rows: 8, pitch: 0.97, seats: W_UP, firstRow: 60, skip: 1 },
  { deck: 'upper', cls: 'economy', s0: 39.0, rows: 13, pitch: 0.79, seats: Y_UP, firstRow: 70 },
];

export function seatMap(): SeatRecord[] {
  const out: SeatRecord[] = [];
  for (const z of ZONES) {
    const all: SeatRecord[] = [];
    for (let r = 0; r < z.rows; r++) {
      const s = z.s0 + r * z.pitch;
      z.seats.forEach((seat, k) => {
        const facing = z.alternate && (k + r) % 2 === 1 ? -1 : 1;
        all.push({
          id: `${z.deck === 'main' ? 'M' : 'U'} ${z.firstRow + r}${seat.l}`,
          deck: z.deck,
          cls: z.cls,
          row: z.firstRow + r,
          letter: seat.l,
          s,
          z: seat.z,
          window: k === 0 || k === z.seats.length - 1,
          facing: facing as 1 | -1,
        });
      });
    }
    // Remove seats from the middle of the last row to match the published class totals.
    let skip = z.skip ?? 0;
    while (skip-- > 0) {
      const lastRow = all[all.length - 1]!.row;
      const rowSeats = all.filter((x) => x.row === lastRow);
      const mid = rowSeats[Math.floor(rowSeats.length / 2)]!;
      all.splice(all.indexOf(mid), 1);
    }
    out.push(...all);
  }
  return out;
}

// ------------------------------------------------------------- seat templates
function economySeat(): BufferGeometry {
  return merge([
    box([0, 0.44, 0], [0.48, 0.1, 0.44]), // cushion
    box([-0.25, 0.8, 0], [0.12, 0.72, 0.44], 0, -0.18), // backrest (reclined)
    box([-0.33, 1.2, 0], [0.1, 0.16, 0.4], 0, -0.18), // headrest
    box([0.02, 0.6, 0.235], [0.42, 0.05, 0.04]), // armrest
    box([0.18, 0.2, 0.15], [0.05, 0.36, 0.05]),
    box([0.18, 0.2, -0.15], [0.05, 0.36, 0.05]),
    box([-0.18, 0.2, 0], [0.05, 0.36, 0.34]),
    box([-0.33, 0.95, 0], [0.02, 0.24, 0.3], 0, -0.18), // seat-back screen surround
  ]);
}
function premiumSeat(): BufferGeometry {
  return merge([
    box([0, 0.46, 0], [0.55, 0.12, 0.5]),
    box([-0.28, 0.85, 0], [0.13, 0.8, 0.5], 0, -0.22),
    box([-0.38, 1.28, 0], [0.12, 0.18, 0.44], 0, -0.22),
    box([0.02, 0.62, 0.28], [0.5, 0.07, 0.07]),
    box([0.02, 0.62, -0.28], [0.5, 0.07, 0.07]),
    box([0.42, 0.25, 0], [0.18, 0.08, 0.44], 0, 0.5), // leg rest
    box([0, 0.2, 0], [0.4, 0.36, 0.4]),
  ]);
}
function businessSeat(): BufferGeometry {
  return merge([
    box([0, 0.5, 0], [1.25, 0.14, 0.6]), // seat / bed surface
    box([-0.62, 0.95, 0], [0.12, 0.9, 0.62], 0, -0.12), // backrest
    box([0, 0.25, 0], [1.2, 0.4, 0.5]),
    box([0, 0.65, 0.36], [1.3, 0.62, 0.06]), // privacy shell side
    box([0.7, 0.55, 0], [0.3, 0.55, 0.62]), // ottoman / footwell
    box([0.86, 1.0, 0], [0.04, 0.3, 0.45]), // IFE screen
  ]);
}
function firstSuite(): BufferGeometry {
  return merge([
    box([0, 0.5, 0], [0.95, 0.16, 0.7]),
    box([-0.48, 1.0, 0], [0.14, 0.95, 0.72], 0, -0.1),
    box([0, 0.25, 0], [0.9, 0.4, 0.6]),
    box([0.2, 0.62, 0.55], [1.6, 0.9, 0.06]), // suite wall
    box([0.2, 0.62, -0.55], [1.6, 0.9, 0.06]),
    box([0.85, 0.55, 0], [0.45, 0.5, 0.95]), // ottoman / desk
    box([0.98, 1.15, 0], [0.04, 0.42, 0.62]),
  ]);
}

const TEMPLATES: Record<CabinClass, { geo: () => BufferGeometry; mat: MaterialKey }> = {
  economy: { geo: economySeat, mat: 'seatFabric' },
  premium: { geo: premiumSeat, mat: 'seatFabric' },
  business: { geo: businessSeat, mat: 'seatFabricBiz' },
  first: { geo: firstSuite, mat: 'seatFabricFirst' },
};

function seatInstances(cls: CabinClass, seats: SeatRecord[]): InstancedMesh {
  const list = seats.filter((s) => s.cls === cls);
  const im = new InstancedMesh(TEMPLATES[cls].geo(), mat(TEMPLATES[cls].mat), list.length);
  im.name = `seats_${cls}`;
  im.userData.partId = 'seats';
  const m = new Matrix4();
  const q = new Quaternion();
  list.forEach((s, i) => {
    const y = s.deck === 'main' ? MAIN_DECK_FLOOR : UPPER_DECK_FLOOR;
    q.setFromAxisAngle(new Vector3(0, 1, 0), s.facing === 1 ? 0 : Math.PI);
    m.compose(new Vector3(sx(s.s), y, s.z), q, new Vector3(1, 1, 1));
    im.setMatrixAt(i, m);
  });
  im.userData.seatIds = list.map((s) => s.id);
  return im;
}

// --------------------------------------------------------------- lining
const DECKS = {
  main: { floor: MAIN_DECK_FLOOR, ceil: MAIN_DECK_FLOOR + 2.55, s0: 8.6, s1: 60.5, win: MAIN_WINDOW_Y },
  upper: { floor: UPPER_DECK_FLOOR, ceil: UPPER_DECK_FLOOR + 2.32, s0: 12.8, s1: 58.2, win: UPPER_WINDOW_Y },
} as const;

/** Sidewall + ceiling lining for one deck: inset fuselage surface between floor and ceiling. */
function lining(deck: keyof typeof DECKS): BufferGeometry {
  const d = DECKS[deck];
  const n = Math.ceil((d.s1 - d.s0) / 0.6);
  const nv = 40;
  const inset = 0.16;
  // θ from starboard floor edge, over the ceiling, to port floor edge
  const g = gridSurface(n, nv, (i, j) => {
    const s = lerp(d.s0, d.s1, i / n);
    const tFloor = thetaAtHeight(s, d.floor, 1);
    const tCeil = thetaAtHeight(s, d.ceil, 1);
    const v = j / nv;
    if (v < 0.35) {
      const th = lerp(tFloor, tCeil, v / 0.35);
      return fuselagePoint(s, th, -inset);
    }
    if (v > 0.65) {
      const th = Math.PI - lerp(tFloor, tCeil, (1 - v) / 0.35);
      return fuselagePoint(s, th, -inset);
    }
    // flat-ish ceiling between the two shoulders
    const a = fuselagePoint(s, tCeil, -inset);
    const t = (v - 0.35) / 0.3;
    const zc = lerp(a[2], -a[2], t);
    return [sx(s), d.ceil + 0.08 * Math.sin(Math.PI * t), zc];
  });
  return g;
}

function floorPanel(deck: keyof typeof DECKS): BufferGeometry {
  const d = DECKS[deck];
  const n = Math.ceil((d.s1 - d.s0) / 0.8);
  return gridSurface(n, 1, (i, j) => {
    const s = lerp(d.s0, d.s1, i / n);
    const z = fuselagePoint(s, thetaAtHeight(s, d.floor, 1))[2] - 0.17;
    return [sx(s), d.floor + 0.01, (1 - j * 2) * z];
  });
}

function endWall(deck: keyof typeof DECKS, s: number): BufferGeometry {
  const d = DECKS[deck];
  const nv = 24;
  return gridSurface(1, nv, (i, j) => {
    const y = lerp(d.floor, d.ceil + 0.1, j / nv);
    const z = Math.max(0.05, fuselagePoint(s, thetaAtHeight(s, y, 1))[2] - 0.16);
    return [sx(s), y, (i * 2 - 1) * z];
  });
}

/** Overhead stowage bins: a rounded box section extruded along the cabin. */
function bins(s0: number, s1: number, zCentre: number, w: number, h: number, yTop: number): BufferGeometry {
  return box([sx((s0 + s1) / 2), yTop - h / 2, zCentre], [s1 - s0, h, w]);
}

/** Window reveals seen from inside: emissive daylight panes on the lining. */
function innerWindows(deck: keyof typeof DECKS): BufferGeometry {
  const d = DECKS[deck];
  const parts: BufferGeometry[] = [];
  const avoid = (deck === 'main' ? DOORS.main : DOORS.upper).map((x) => x.s);
  for (let s = d.s0 + 0.4; s < d.s1 - 0.4; s += 0.533) {
    if (avoid.some((a) => Math.abs(a - s) < 1.0)) continue;
    for (const side of [1, -1] as const) {
      const th = thetaAtHeight(s, d.win, side);
      const p = fuselagePoint(s, th, -0.165);
      const n = fuselagePoint(s, th, 0);
      const out: Vec3 = [n[0] - p[0], n[1] - p[1], n[2] - p[2]];
      const g = box([p[0], p[1], p[2] - side * 0.006], [0.25, 0.36, 0.01], 0, 0, Math.atan2(out[1], Math.abs(out[2])) * -side);
      parts.push(g);
    }
  }
  return merge(parts);
}

function monument(sFrom: number, sTo: number, deck: keyof typeof DECKS, zFrom: number, zTo: number, h = 2.0): BufferGeometry {
  const d = DECKS[deck];
  return box([sx((sFrom + sTo) / 2), d.floor + h / 2, (zFrom + zTo) / 2], [sTo - sFrom, h, zTo - zFrom]);
}

/** Staircase from main deck to upper deck (straight flight with a landing). */
function stairs(sBottom: number, dir: 1 | -1, zc: number): BufferGeometry {
  const steps = 15;
  const rise = (UPPER_DECK_FLOOR - MAIN_DECK_FLOOR) / steps;
  const run = 0.26;
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < steps; k++) {
    const s = sBottom + dir * k * run;
    parts.push(box([sx(s), MAIN_DECK_FLOOR + (k + 0.5) * rise, zc], [run + 0.02, rise, 1.05]));
  }
  // stringers / balustrades
  const len = steps * run;
  const a: [number, number, number] = [sx(sBottom), MAIN_DECK_FLOOR + 0.9, zc + 0.58];
  const b: [number, number, number] = [sx(sBottom + dir * len), UPPER_DECK_FLOOR + 0.9, zc + 0.58];
  parts.push(cylinder(a, b, 0.03, 8), cylinder([a[0], a[1], zc - 0.58], [b[0], b[1], zc - 0.58], 0.03, 8));
  return merge(parts);
}

function ceilingLights(deck: keyof typeof DECKS): BufferGeometry {
  const d = DECKS[deck];
  const parts: BufferGeometry[] = [];
  for (const z of [-1.0, 1.0]) parts.push(box([sx((d.s0 + d.s1) / 2), d.ceil + 0.02, z * (deck === 'main' ? 1.1 : 0.9)], [d.s1 - d.s0 - 1, 0.03, 0.08]));
  return merge(parts);
}

export function buildCabin(): Group {
  const g = group('cabin', [], 'cabin');
  const seats = seatMap();
  for (const cls of ['first', 'business', 'premium', 'economy'] as CabinClass[]) g.add(seatInstances(cls, seats));
  g.userData.seatMap = seats.map((s) => [s.id, s.deck, s.cls, s.row, s.letter, +s.s.toFixed(3), s.z, s.window ? 1 : 0, s.facing]);

  for (const deck of ['main', 'upper'] as const) {
    const d = DECKS[deck];
    g.add(mesh(`lining_${deck}`, lining(deck), 'cabinWall', 'cabinInterior'));
    g.add(mesh(`floor_${deck}`, floorPanel(deck), 'carpet', 'cabinInterior'));
    g.add(mesh(`endwalls_${deck}`, merge([endWall(deck, d.s0), endWall(deck, d.s1)]), 'cabinWall', 'cabinInterior'));
    g.add(mesh(`windows_inner_${deck}`, innerWindows(deck), 'emissiveCabin', 'cabinInterior'));
    g.add(mesh(`ceiling_lights_${deck}`, ceilingLights(deck), 'emissiveCabin', 'cabinInterior'));
  }
  // Overhead bins
  const binGeo: BufferGeometry[] = [];
  for (const sgn of [1, -1]) {
    binGeo.push(bins(22, 59.5, sgn * 2.45, 0.62, 0.45, DECKS.main.ceil - 0.05));
    binGeo.push(bins(18, 50, sgn * 2.05, 0.55, 0.38, DECKS.upper.ceil - 0.15));
  }
  binGeo.push(bins(32, 59.5, 0, 1.4, 0.42, DECKS.main.ceil - 0.02));
  g.add(mesh('overhead_bins', merge(binGeo), 'plastic', 'cabinInterior'));

  // Galleys and lavatories at door zones (illustrative)
  const galleys = merge([
    monument(10.6, 12.5, 'main', -2.4, -0.75),
    monument(10.6, 12.5, 'main', 0.75, 2.4),
    monument(19.0, 19.6, 'main', -1.2, 1.2),
    monument(43.9, 44.6, 'main', -1.4, 1.4),
    monument(57.3, 59.6, 'main', -2.2, -0.75),
    monument(57.3, 59.6, 'main', 0.75, 2.2),
    monument(13.0, 14.2, 'upper', -2.0, -0.7),
    monument(36.9, 37.3, 'upper', -1.2, 1.2),
    monument(55.8, 58.1, 'upper', -2.0, -0.75),
  ]);
  g.add(mesh('galleys', galleys, 'galley', 'galley'));
  const lavs = merge([
    monument(42.8, 43.9, 'main', -2.6, -1.4),
    monument(42.8, 43.9, 'main', 1.4, 2.6),
    monument(13.0, 14.2, 'upper', 0.7, 2.0),
    monument(50.0, 51.2, 'upper', -2.2, -1.2),
    monument(50.0, 51.2, 'upper', 1.2, 2.2),
    monument(55.8, 58.1, 'upper', 0.75, 2.0),
  ]);
  g.add(mesh('lavatories', lavs, 'plastic', 'lavatory'));
  // Class divider partitions
  const partitions = merge([
    monument(21.1, 21.2, 'main', -3.0, -0.8, 1.6),
    monument(21.1, 21.2, 'main', 0.8, 3.0, 1.6),
    monument(31.0, 31.1, 'main', -3.0, -0.9, 1.6),
    monument(31.0, 31.1, 'main', 0.9, 3.0, 1.6),
    monument(29.6, 29.7, 'upper', -2.5, -0.8, 1.5),
    monument(29.6, 29.7, 'upper', 0.8, 2.5, 1.5),
    monument(38.6, 38.7, 'upper', -2.5, -0.8, 1.5),
    monument(38.6, 38.7, 'upper', 0.8, 2.5, 1.5),
  ]);
  g.add(mesh('partitions', partitions, 'cabinWall', 'cabinInterior'));
  // Staircases: forward (between M1 and M2 zone) and aft
  g.add(mesh('stairs_forward', stairs(8.9, 1, 0), 'galley', 'stairs'));
  g.add(mesh('stairs_aft', stairs(59.9, -1, 0), 'galley', 'stairs'));
  return g;
}

export const CABIN_DECKS = DECKS;
