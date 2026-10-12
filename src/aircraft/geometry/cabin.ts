/**
 * Passenger cabin — a representative four-class, 469-seat layout whose class totals match
 * British Airways' published A380 configuration (14 First, 97 Club, 55 Premium Economy,
 * 303 Economy). Zoning per deck, seat pitch and monument positions are illustrative.
 *
 * Seats are exported once per class with EXT_mesh_gpu_instancing transforms, so ~470 seats
 * cost three draw calls.
 */
import { BufferAttribute, BufferGeometry, InstancedMesh, Matrix4, Quaternion, Vector3, type Group } from 'three';
import { DOORS, MAIN_DECK_FLOOR, UPPER_DECK_FLOOR, sx } from './layout';
import { fuselageNormal, fuselagePoint, resample, roundedRect, thetaAtHeight } from './fuselage';
import { box, cylinder, onTilted, quadAft, rbox, setRoundingDetail } from './gear';
import { lerp, type Vec3 } from './math';
import { group, mat, mesh, type MaterialKey } from './parts';
import { flipGeometry, gridSurface, merge } from './surface';
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

const Y_MAIN = [-2.75, -2.29, -1.83, -0.69, -0.23, 0.23, 0.69, 1.83, 2.29, 2.75]; // 3-4-3, aisles at z ≈ ±1.26
const yMain = Y_MAIN.map((z, i) => ({ z, l: 'ABCDEFGHJK'[i]! }));
const Y_UP = [-2.25, -1.79, -0.69, -0.23, 0.23, 0.69, 1.79, 2.25].map((z, i) => ({ z, l: 'ABDEFGJK'[i]! }));
const W_UP = [-2.15, -1.61, -0.54, 0, 0.54, 1.61, 2.15].map((z, i) => ({ z, l: 'ABDEFJK'[i]! }));
const J_UP = [-2.2, -1.6, -0.62, 0, 0.62, 1.6, 2.2].map((z, i) => ({ z, l: 'ABDEFJK'[i]! }));
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
// Each class has upholstery, a hard shell and an entertainment screen: three instanced draw
// calls per class. Local frame: +X is the direction the seat faces, Y up, floor at y = 0.
interface SeatTemplate {
  fabric: () => BufferGeometry;
  shell: () => BufferGeometry;
  screen: () => BufferGeometry;
  fabricMat: MaterialKey;
  shellMat: MaterialKey;
}

const recline = (deg: number) => (-deg * Math.PI) / 180;

/** Tubular seat frame: four legs, two cross beams and a foot rail. */
function frame(xF: number, xR: number, hw: number, top: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const x of [xF, xR]) {
    for (const z of [-hw, hw]) {
      parts.push(cylinder([x, 0.01, z], [x, top, z], 0.017, 10));
      parts.push(box([x, 0.008, z], [0.09, 0.016, 0.05]));
    }
    parts.push(cylinder([x, top - 0.03, -hw - 0.04], [x, top - 0.03, hw + 0.04], 0.022, 12));
  }
  parts.push(cylinder([xF, 0.09, -hw], [xF, 0.09, hw], 0.012, 8));
  return merge(parts);
}

function economySeat(width: number, backDeg: number, scale = 1): SeatTemplate {
  const r = recline(backDeg);
  const w = width;
  const back: Vec3 = [-0.205 * scale, 0.8 * scale, 0];
  const shellC: Vec3 = [-0.268 * scale, 0.85 * scale, 0];
  return {
    fabricMat: 'seatFabric',
    shellMat: 'plastic',
    fabric: () =>
      merge([
        rbox([0.04, 0.445, 0], [0.47 * scale, 0.105, w - 0.03], 0.045, -0.05),
        rbox(back, [0.1, 0.62 * scale, w - 0.05], 0.045, r, 0, 0, 0.45),
        rbox(onTilted(back, 0.045, -0.18 * scale, r), [0.05, 0.16, w - 0.09], 0.025, r),
        rbox(onTilted(back, -0.1, 0.385 * scale, r), [0.1, 0.19, w * 0.78], 0.05, r),
        rbox(onTilted(back, -0.095, 0.385 * scale, r, 0.19 * (w / 0.46)), [0.09, 0.17, 0.06], 0.025, r, 0.45),
        rbox(onTilted(back, -0.095, 0.385 * scale, r, -0.19 * (w / 0.46)), [0.09, 0.17, 0.06], 0.025, r, -0.45),
      ]),
    shell: () =>
      merge([
        rbox(shellC, [0.045, 0.88 * scale, w], 0.02, r, 0, 0, 0.45),
        rbox(onTilted(shellC, -0.032, -0.14 * scale, r), [0.014, 0.25, w * 0.78], 0.006, r), // tray table
        rbox(onTilted(shellC, -0.034, -0.02 * scale, r), [0.012, 0.03, 0.06], 0.005, r), // tray latch
        rbox(onTilted(shellC, -0.03, 0.17 * scale, r), [0.012, 0.17, 0.27], 0.01, r), // screen bezel
        rbox([0.0, 0.635, w / 2 + 0.01], [0.46 * scale, 0.05, 0.052], 0.022),
        rbox([0.0, 0.635, -w / 2 - 0.01], [0.46 * scale, 0.05, 0.052], 0.022),
        rbox([-0.17, 0.53, w / 2 + 0.01], [0.05, 0.2, 0.04], 0.015),
        rbox([-0.17, 0.53, -w / 2 - 0.01], [0.05, 0.2, 0.04], 0.015),
        rbox([0.03, 0.385, 0], [0.46 * scale, 0.035, w - 0.04], 0.012),
        frame(0.15, -0.18, w / 2 - 0.06, 0.37),
        rbox([0.02, 0.27, 0], [0.24, 0.06, w * 0.7], 0.02), // life-vest pouch
      ]),
    screen: () => quadAft(onTilted(shellC, -0.039, 0.17 * scale, r), 0.24, 0.145, r),
  };
}

const TEMPLATES: Record<CabinClass, SeatTemplate> = {
  economy: economySeat(0.46, 12),
  premium: (() => {
    const t = economySeat(0.52, 15, 1.08);
    const fabric = t.fabric;
    // calf rest under the cushion front
    t.fabric = () => merge([fabric(), rbox([0.36, 0.3, 0], [0.06, 0.24, 0.44], 0.025, 0.55)]);
    return t;
  })(),
  business: (() => {
    const r = recline(10);
    const back: Vec3 = [-0.56, 0.95, 0];
    return {
      fabricMat: 'seatFabricBiz',
      shellMat: 'bezel',
      fabric: () =>
        merge([
          rbox([0, 0.52, 0], [1.15, 0.12, 0.56], 0.05),
          rbox(back, [0.13, 0.78, 0.54], 0.055, r, 0, 0, 0.4),
          rbox(onTilted(back, -0.08, 0.46, r), [0.12, 0.2, 0.42], 0.06, r),
          rbox([0.74, 0.62, 0], [0.32, 0.08, 0.5], 0.035), // ottoman cushion
        ]),
      shell: () =>
        merge([
          rbox([0, 0.24, 0], [1.2, 0.44, 0.52], 0.04),
          rbox([0.05, 0.68, 0.36], [1.42, 0.74, 0.06], 0.03), // privacy wall
          rbox([0.1, 1.05, 0.36], [1.42, 0.02, 0.1], 0.008), // wall cap
          rbox(onTilted(back, -0.1, 0, r), [0.07, 0.94, 0.66], 0.035, r, 0, 0, 0.3),
          rbox([0.74, 0.4, 0], [0.34, 0.4, 0.56], 0.04), // ottoman
          rbox([0.1, 0.72, -0.35], [0.64, 0.06, 0.17], 0.02), // side console
          rbox([0.89, 1.02, 0], [0.04, 0.33, 0.5], 0.015), // screen surround
          cylinder([-0.2, 0.75, -0.39], [-0.2, 1.05, -0.39], 0.012, 10), // reading lamp
          rbox([-0.2, 1.07, -0.36], [0.07, 0.03, 0.09], 0.012),
        ]),
      screen: () => quadAft([0.866, 1.02, 0], 0.44, 0.27),
    } satisfies SeatTemplate;
  })(),
  first: (() => {
    const r = recline(8);
    const back: Vec3 = [-0.46, 1.0, 0];
    return {
      fabricMat: 'leather',
      shellMat: 'bezel',
      fabric: () =>
        merge([
          rbox([0, 0.52, 0], [0.92, 0.16, 0.68], 0.07),
          rbox(back, [0.15, 0.9, 0.7], 0.07, r, 0, 0, 0.35),
          rbox(onTilted(back, -0.08, 0.5, r), [0.13, 0.22, 0.48], 0.07, r),
          rbox([0.05, 0.66, 0.4], [0.7, 0.12, 0.12], 0.05), // armrests
          rbox([0.05, 0.66, -0.4], [0.7, 0.12, 0.12], 0.05),
        ]),
      shell: () =>
        merge([
          rbox([0, 0.24, 0], [0.9, 0.44, 0.6], 0.04),
          rbox([0.25, 0.68, 0.58], [1.8, 0.96, 0.07], 0.03), // suite walls
          rbox([0.25, 0.68, -0.58], [1.8, 0.96, 0.07], 0.03),
          rbox([0.25, 1.17, 0.58], [1.8, 0.025, 0.11], 0.01),
          rbox([0.25, 1.17, -0.58], [1.8, 0.025, 0.11], 0.01),
          rbox([0.88, 0.56, 0], [0.46, 0.52, 0.98], 0.04), // ottoman / desk
          rbox([1.03, 1.16, 0], [0.04, 0.46, 0.68], 0.015),
        ]),
      screen: () => quadAft([1.007, 1.16, 0], 0.6, 0.36),
    } satisfies SeatTemplate;
  })(),
};

function seatInstances(cls: CabinClass, seats: SeatRecord[], part: 'fabric' | 'shell' | 'screen'): InstancedMesh {
  const list = seats.filter((s) => s.cls === cls);
  const t = TEMPLATES[cls];
  const key: MaterialKey = part === 'fabric' ? t.fabricMat : part === 'shell' ? t.shellMat : 'ifeScreen';
  const im = new InstancedMesh(t[part](), mat(key), list.length);
  im.name = `seats_${cls}_${part}`;
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

/** Flip a geometry whose average normal points away from `dir`. */
function facing(g: BufferGeometry, dir: Vec3): BufferGeometry {
  const n = g.getAttribute('normal');
  let d = 0;
  for (let i = 0; i < n.count; i++) d += n.getX(i) * dir[0] + n.getY(i) * dir[1] + n.getZ(i) * dir[2];
  return d < 0 ? flipGeometry(g) : g;
}

/**
 * Overhead bin run: a lofted moulding with a convex door face, closed ends, door seams and
 * latch handles. `side` is +1 for starboard bins (door facing −Z, towards the aisle).
 */
function binRun(s0: number, s1: number, zOut: number, w: number, h: number, yTop: number, side: 1 | -1): { body: BufferGeometry; trim: BufferGeometry } {
  // profile in (inward distance from the outboard wall, height), outboard top → door → top
  const prof: [number, number][] = [
    [0, 0],
    [0, -h * 0.82],
    [0.07, -h],
    [w - 0.07, -h],
    [w - 0.01, -h + 0.06],
    [w + 0.025, -h * 0.55],
    [w + 0.015, -h * 0.18],
    [w - 0.05, 0],
  ];
  const n = Math.max(2, Math.ceil((s1 - s0) / 0.5));
  const P = (s: number, k: number): Vec3 => {
    const [dz, dy] = prof[Math.min(k, prof.length - 1)]!;
    return [sx(s), yTop + dy, side * (zOut - dz)];
  };
  const body = facing(
    gridSurface(n, prof.length - 1, (i, j) => P(lerp(s0, s1, i / n), j)),
    [0, -0.3, -side],
  );
  const cap = (s: number) => {
    const g = new BufferGeometry();
    const pts = prof.map((_, k) => P(s, k));
    const c = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length] as Vec3, [0, 0, 0] as Vec3);
    const pos = [...c, ...pts.flat()];
    const idx: number[] = [];
    for (let k = 0; k < pts.length - 1; k++) idx.push(0, k + 1, k + 2);
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return facing(g, [s === s0 ? 1 : -1, 0, 0]);
  };
  // door seams and latches along the door face
  const trim: BufferGeometry[] = [];
  const doorZ = side * (zOut - w - 0.026);
  for (let s = s0 + 1.55; s < s1 - 0.4; s += 1.55) trim.push(box([sx(s), yTop - h * 0.5, doorZ], [0.008, h * 0.86, 0.012]));
  for (let s = s0 + 0.78; s < s1 - 0.4; s += 1.55) trim.push(rbox([sx(s), yTop - h * 0.24, doorZ - side * 0.006], [0.16, 0.035, 0.02], 0.008));
  return { body: merge([body, cap(s0), cap(s1)]), trim: merge(trim) };
}

/**
 * Window reveals seen from the cabin: a moulded bezel standing slightly proud of the lining,
 * a recessed daylight pane, and a pull-down shade left at a different height in each window.
 */
function windowReveals(deck: keyof typeof DECKS): { bezel: BufferGeometry; pane: BufferGeometry; shade: BufferGeometry } {
  const d = DECKS[deck];
  const bezel: BufferGeometry[] = [];
  const pane: BufferGeometry[] = [];
  const shade: BufferGeometry[] = [];
  const avoid = (deck === 'main' ? DOORS.main : DOORS.upper).map((x) => x.s);
  const outer = resample(roundedRect(0.34, 0.5, 0.15, 6), 40);
  const inner = resample(roundedRect(0.27, 0.41, 0.12, 6), 40);
  const opening = resample(roundedRect(0.245, 0.375, 0.11, 6), 40);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let s = d.s0 + 0.4; s < d.s1 - 0.4; s += 0.533) {
    if (avoid.some((a) => Math.abs(a - s) < 1.0)) continue;
    for (const side of [1, -1] as const) {
      const th = thetaAtHeight(s, d.win, side);
      const o = fuselagePoint(s, th, -0.16);
      const nOut = fuselageNormal(s, th);
      const nIn: Vec3 = [-nOut[0], -nOut[1], -nOut[2]];
      // local frame: u along the fuselage axis, v up the wall (perpendicular to the normal), depth towards the aisle
      const vy = Math.abs(nOut[2]);
      const vz = -nOut[1] * Math.sign(nOut[2] || side);
      const vl = Math.hypot(vy, vz) || 1;
      const V: Vec3 = [0, vy / vl, vz / vl];
      const at = (u: number, v: number, depth: number): Vec3 => [o[0] + u, o[1] + V[1] * v + nIn[1] * depth, o[2] + V[2] * v + nIn[2] * depth];
      const loop = (a: [number, number][], da: number, b: [number, number][], db: number) =>
        facing(
          gridSurface(a.length - 1, 1, (i, j) => (j === 0 ? at(a[i]![0], a[i]![1], da) : at(b[i]![0], b[i]![1], db))),
          nIn,
        );
      bezel.push(loop(outer, 0.002, inner, 0.03), loop(inner, 0.03, opening, 0.011));
      const fan = new BufferGeometry();
      const pts = opening.map(([u, v]) => at(u, v, 0.011));
      const c = at(0, 0, 0.011);
      fan.setAttribute('position', new BufferAttribute(new Float32Array([...c, ...pts.flat()]), 3));
      fan.setAttribute('uv', new BufferAttribute(new Float32Array((pts.length + 1) * 2), 2));
      fan.setIndex(pts.slice(0, -1).flatMap((_, k) => [0, k + 1, k + 2]));
      fan.computeVertexNormals();
      pane.push(facing(fan, nIn));
      // shade: drawn down from the top of the opening to a random height
      const drop = rnd() < 0.55 ? 0.02 : 0.08 + rnd() * 0.3;
      const top = 0.19;
      const sh = new BufferGeometry();
      const q = [at(-0.125, top, 0.015), at(0.125, top, 0.015), at(0.125, top - drop, 0.015), at(-0.125, top - drop, 0.015)];
      sh.setAttribute('position', new BufferAttribute(new Float32Array(q.flat()), 3));
      sh.setAttribute('uv', new BufferAttribute(new Float32Array(8), 2));
      sh.setIndex([0, 1, 2, 0, 2, 3]);
      sh.computeVertexNormals();
      shade.push(facing(sh, nIn));
    }
  }
  return { bezel: merge(bezel), pane: merge(pane), shade: merge(shade) };
}

/** Passenger service units under the side bins: a continuous panel with reading lights. */
function serviceUnits(s0: number, s1: number, zIn: number, y: number, side: 1 | -1, pitch: number): { panel: BufferGeometry; lights: BufferGeometry } {
  const panel = rbox([sx((s0 + s1) / 2), y, side * (zIn + 0.12)], [s1 - s0, 0.025, 0.26], 0.01);
  const lights: BufferGeometry[] = [];
  for (let s = s0 + pitch / 2; s < s1; s += pitch) {
    for (const dz of [0.05, 0.13]) lights.push(cylinder([sx(s), y - 0.012, side * (zIn + dz)], [sx(s), y - 0.016, side * (zIn + dz)], 0.017, 10));
  }
  return { panel, lights: merge(lights) };
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

/** `quality` < 1 builds the lighter cabin used on phones (single-segment rounding). */
export function buildCabin(quality = 1): Group {
  setRoundingDetail(quality);
  const g = group('cabin', [], 'cabin');
  const seats = seatMap();
  for (const cls of ['first', 'business', 'premium', 'economy'] as CabinClass[]) {
    g.add(seatInstances(cls, seats, 'fabric'));
    g.add(seatInstances(cls, seats, 'shell'));
    g.add(seatInstances(cls, seats, 'screen'));
  }
  g.userData.seatMap = seats.map((s) => [s.id, s.deck, s.cls, s.row, s.letter, +s.s.toFixed(3), s.z, s.window ? 1 : 0, s.facing]);

  for (const deck of ['main', 'upper'] as const) {
    const d = DECKS[deck];
    g.add(mesh(`lining_${deck}`, lining(deck), 'cabinWall', 'cabinInterior'));
    g.add(mesh(`floor_${deck}`, floorPanel(deck), 'carpet', 'cabinInterior'));
    g.add(mesh(`endwalls_${deck}`, merge([endWall(deck, d.s0), endWall(deck, d.s1)]), 'cabinWall', 'cabinInterior'));
    const wr = windowReveals(deck);
    g.add(mesh(`window_bezels_${deck}`, wr.bezel, 'bezel', 'cabinInterior'));
    g.add(mesh(`windows_inner_${deck}`, wr.pane, 'emissiveCabin', 'cabinInterior'));
    g.add(mesh(`window_shades_${deck}`, wr.shade, 'plastic', 'cabinInterior'));
    g.add(mesh(`ceiling_lights_${deck}`, ceilingLights(deck), 'emissiveCabin', 'cabinInterior'));
  }
  // Overhead bins with service units underneath and concealed cove lighting above
  const binBody: BufferGeometry[] = [];
  const binTrim: BufferGeometry[] = [];
  const psu: BufferGeometry[] = [];
  const psuLights: BufferGeometry[] = [];
  const cove: BufferGeometry[] = [];
  for (const side of [1, -1] as const) {
    for (const [s0, s1, zOut, w, h, yTop, deck] of [
      [22, 59.5, 2.76, 0.62, 0.45, DECKS.main.ceil - 0.05, 'main'],
      [18, 50, 2.33, 0.55, 0.38, DECKS.upper.ceil - 0.15, 'upper'],
    ] as const) {
      const b = binRun(s0, s1, zOut, w, h, yTop, side);
      binBody.push(b.body);
      binTrim.push(b.trim);
      const u = serviceUnits(s0, s1, zOut - w - 0.3, yTop - h - 0.03, side, deck === 'main' ? 0.79 : 0.97);
      psu.push(u.panel);
      psuLights.push(u.lights);
      cove.push(box([sx((s0 + s1) / 2), yTop + 0.015, side * (zOut - w + 0.06)], [s1 - s0, 0.012, 0.05]));
    }
  }
  binBody.push(rbox([sx((32 + 59.5) / 2), DECKS.main.ceil - 0.23, 0], [59.5 - 32, 0.42, 1.4], 0.08));
  g.add(mesh('overhead_bins', merge(binBody), 'plastic', 'cabinInterior'));
  g.add(mesh('overhead_bin_trim', merge(binTrim), 'bezel', 'cabinInterior'));
  g.add(mesh('service_units', merge(psu), 'bezel', 'cabinInterior'));
  g.add(mesh('ceiling_lights_reading', merge(psuLights), 'emissiveCabin', 'cabinInterior'));
  g.add(mesh('ceiling_lights_cove', merge(cove), 'emissiveCabin', 'cabinInterior'));

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
  setRoundingDetail(1);
  return g;
}

export const CABIN_DECKS = DECKS;
