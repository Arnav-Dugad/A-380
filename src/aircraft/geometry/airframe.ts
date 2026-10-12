/**
 * Fuselage assembly: skin, belly fairing, cabin windows, passenger & cargo doors,
 * flight-deck glazing, tail cone / APU exhaust and external details (antennas, probes, lights).
 */
import { BufferAttribute, BufferGeometry as BufferGeometryCtor, type BufferGeometry, type Group } from 'three';
import { DOORS, L, MAIN_DECK_FLOOR, UPPER_DECK_FLOOR, sx } from './layout';
import {
  bellyFairingPoint,
  buildBellyFairing,
  buildFuselageSkin,
  conformalShape,
  fuselageNormal,
  fuselagePoint,
  patchSTheta,
  resample,
  roundedRect,
  surfaceAt,
  thetaAtHeight,
} from './fuselage';
import { deg, type Vec3 } from './math';
import { group, mesh, pivoted } from './parts';
import { lathe, merge, orientOutward } from './surface';
import { box, cylinder } from './gear';

const WIN_W = 0.27;
const WIN_H = 0.38;
const WIN_PITCH = 0.533; // one window per frame bay [A]
export const MAIN_WINDOW_Y = MAIN_DECK_FLOOR + 1.08;
export const UPPER_WINDOW_Y = UPPER_DECK_FLOOR + 1.0;

export interface DoorInfo {
  id: string;
  deck: 'main' | 'upper' | 'cargo';
  side: 1 | -1;
  s: number;
  y: number;
  w: number;
  h: number;
}

export function passengerDoors(): DoorInfo[] {
  const out: DoorInfo[] = [];
  for (const side of [1, -1] as const) {
    for (const d of DOORS.main)
      out.push({ id: `${d.id}${side === 1 ? 'R' : 'L'}`, deck: 'main', side, s: d.s, y: MAIN_DECK_FLOOR + DOORS.passengerH / 2 + 0.02, w: DOORS.passengerW, h: DOORS.passengerH });
    for (const d of DOORS.upper)
      out.push({ id: `${d.id}${side === 1 ? 'R' : 'L'}`, deck: 'upper', side, s: d.s, y: UPPER_DECK_FLOOR + DOORS.passengerH / 2 + 0.02, w: DOORS.passengerW, h: DOORS.passengerH });
  }
  return out;
}

export function cargoDoors(): DoorInfo[] {
  // Lower-deck cargo doors are on the starboard side.
  return DOORS.cargo.map((c) => ({ id: c.id, deck: 'cargo' as const, side: 1 as const, s: c.s, y: 2.95 + c.h / 2 - (c.id === 'BULK' ? -0.35 : 0), w: c.w, h: c.h }));
}

function windowStations(from: number, to: number, avoid: number[], clear: number): number[] {
  const out: number[] = [];
  for (let s = from; s <= to; s += WIN_PITCH) if (avoid.every((a) => Math.abs(a - s) > clear)) out.push(s);
  return out;
}

export function buildWindows(): { glass: BufferGeometry; frames: BufferGeometry } {
  const glass: BufferGeometry[] = [];
  const frames: BufferGeometry[] = [];
  const glassOutline = roundedRect(WIN_W, WIN_H, 0.1, 4);
  const frameOutline = roundedRect(WIN_W + 0.07, WIN_H + 0.07, 0.13, 4);
  const mainAvoid = DOORS.main.map((d) => d.s);
  const upperAvoid = DOORS.upper.map((d) => d.s);
  const decks: { y: number; list: number[] }[] = [
    { y: MAIN_WINDOW_Y, list: windowStations(8.3, 60.4, mainAvoid, 1.0) },
    { y: UPPER_WINDOW_Y, list: windowStations(12.9, 57.6, upperAvoid, 1.0) },
  ];
  for (const side of [1, -1] as const) {
    for (const deck of decks) {
      for (const s of deck.list) {
        glass.push(conformalShape(side, s, deck.y, glassOutline, 0.014, 1));
        frames.push(conformalShape(side, s, deck.y, frameOutline, 0.007, 1));
      }
    }
  }
  return { glass: merge(glass), frames: merge(frames) };
}

/** Flight-deck glazing: 2 windshields + 2 side windows per side (corners in s, θ). */
const COCKPIT_PANES: [number, number][][] = [
  [
    [3.12, deg(89.2)],
    [3.5, deg(58)],
    [4.38, deg(60)],
    [4.12, deg(89.2)],
  ],
  [
    [3.62, deg(55.5)],
    [4.55, deg(45.5)],
    [5.05, deg(54.5)],
    [4.45, deg(58.5)],
  ],
  [
    [4.68, deg(44.5)],
    [5.75, deg(40)],
    [6.02, deg(48.5)],
    [5.18, deg(53.2)],
  ],
];

function mirrorTheta(p: [number, number][]): [number, number][] {
  return p.map(([s, th]) => [s, Math.PI - th] as [number, number]);
}

function grow(p: [number, number][], ds: number, dth: number): [number, number][] {
  const cs = p.reduce((a, q) => a + q[0], 0) / p.length;
  const ct = p.reduce((a, q) => a + q[1], 0) / p.length;
  return p.map(([s, th]) => [s + Math.sign(s - cs) * ds, th + Math.sign(th - ct) * dth] as [number, number]);
}

export function buildCockpitGlazing(): { glass: BufferGeometry; frames: BufferGeometry } {
  const glass: BufferGeometry[] = [];
  const frames: BufferGeometry[] = [];
  for (const pane of COCKPIT_PANES) {
    for (const p of [pane, mirrorTheta(pane)]) {
      glass.push(patchSTheta(p, 0.02, 8, 8));
      frames.push(patchSTheta(grow(p, 0.06, deg(1.6)), 0.009, 8, 8));
    }
  }
  return { glass: merge(glass), frames: merge(frames) };
}

function doorNode(d: DoorInfo): Group {
  const n = Math.round(((d.w + d.h) * 2) / 0.06);
  const outline = resample(roundedRect(d.w, d.h, d.deck === 'cargo' ? 0.12 : 0.2, 5), n);
  const seal = resample(roundedRect(d.w + 0.06, d.h + 0.06, d.deck === 'cargo' ? 0.14 : 0.23, 5), n);
  const panel = conformalShape(d.side, d.s, d.y, outline, 0.022, 8);
  const sealGeo = conformalShape(d.side, d.s, d.y, seal, 0.008, 8);
  const centre = surfaceAt(d.side, d.s, d.y, 0);
  const partId = d.deck === 'cargo' ? 'cargoDoor' : 'passengerDoor';
  const g = group(`door_${d.id}`, [mesh(`door_${d.id}_opening`, sealGeo, 'seal', partId)], partId);
  if (d.deck === 'cargo') {
    // Upward-opening, hinged along the top edge.
    const hingePt = surfaceAt(d.side, d.s, d.y + d.h / 2, 0.022);
    g.add(pivoted(`door_${d.id}_panel`, hingePt, [mesh(`door_${d.id}_skin`, panel, 'paint', partId)], { kind: 'hinge', axis: [-d.side, 0, 0], min: 0, max: 95 }, partId));
  } else {
    // Plug door: lifts, moves outboard, then translates forward parallel to the fuselage.
    const n = fuselageNormal(d.s, thetaAtHeight(d.s, d.y, d.side));
    g.add(
      pivoted(`door_${d.id}_panel`, centre, [mesh(`door_${d.id}_skin`, panel, 'paint', partId)], {
        kind: 'door',
        travel: [1.32, 0.05, n[2] * 0.42],
      }, partId),
    );
  }
  g.userData.door = { id: d.id, deck: d.deck, side: d.side, s: d.s };
  return g;
}

/** APU exhaust nozzle at the tail cone tip. */
function apuExhaust(): BufferGeometry {
  const tip = fuselagePoint(L, 0);
  const cy = (fuselagePoint(L, Math.PI / 2)[1] + fuselagePoint(L, -Math.PI / 2)[1]) / 2;
  const prof: [number, number][] = [
    [-0.55, 0.3],
    [-0.55, 0.34],
    [0.05, 0.38],
    [0.05, 0.3],
  ];
  const g = orientOutward(lathe(prof, 32));
  g.translate(tip[0] + 0.5, cy, 0); // nozzle exit flush with the tail-cone tip
  return g;
}

/** Swept blade antenna (VHF/SATCOM style) standing on the crown or keel. */
function blade(s: number, top: boolean, h = 0.42, chord = 0.55): BufferGeometry {
  const y = top ? fuselagePoint(s, Math.PI / 2)[1] : fuselagePoint(s, -Math.PI / 2)[1];
  const sign = top ? 1 : -1;
  const outline: [number, number][] = [
    [0, -0.03],
    [chord, -0.03],
    [chord * 0.86, h],
    [chord * 0.5, h],
  ];
  const t = 0.035;
  const ring = (o: number): Vec3[] => outline.map(([ds, dy]) => [sx(s + ds), y + sign * dy, o]);
  const a = ring(t);
  const b2 = ring(-t);
  const quads: Vec3[][] = [a, [...b2].reverse()];
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    quads.push([a[k]!, b2[k]!, b2[k1]!, a[k1]!]);
  }
  const pos: number[] = [];
  const idx: number[] = [];
  for (const q of quads) {
    const o = pos.length / 3;
    for (const p of q) pos.push(...p);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const g = new BufferGeometryCtor();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  const n = flat.getAttribute('position').count;
  flat.setIndex(Array.from({ length: n }, (_, i) => i));
  return orientOutward(flat);
}

/** A point on the skin at (s, height y) on one side, pushed out along the normal by `off`. */
function skinAt(s: number, y: number, side: 1 | -1, off = 0): { p: Vec3; n: Vec3 } {
  const th = thetaAtHeight(s, y, side);
  const p = fuselagePoint(s, th);
  const n = fuselageNormal(s, th);
  return { p: [p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off], n };
}

/**
 * Air-data probes on the nose: three L-shaped pitot tubes, three angle-of-attack vanes and
 * two total-air-temperature probes, mirrored left and right. Positions are approximate.
 */
function airDataProbes(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const side of [1, -1] as const) {
    for (const [s, y] of side === 1 ? [[5.1, 5.75], [5.55, 5.45]] : [[5.1, 5.75]]) {
      const { p, n } = skinAt(s!, y!, side);
      const stem: Vec3 = [p[0] + n[0] * 0.13, p[1] + n[1] * 0.13 - 0.03, p[2] + n[2] * 0.13];
      parts.push(cylinder(p, stem, 0.022, 10, 0.014));
      parts.push(cylinder([stem[0] - 0.05, stem[1], stem[2]], [stem[0] + 0.22, stem[1], stem[2]], 0.011, 10, 0.009));
      parts.push(cylinder(p, [p[0] - n[0] * 0.01, p[1], p[2] - n[2] * 0.01], 0.05, 14));
    }
    // angle-of-attack vane (thin swept plate on a round base)
    const a = skinAt(6.4, 5.4, side);
    parts.push(cylinder(a.p, [a.p[0] + a.n[0] * 0.012, a.p[1] + a.n[1] * 0.012, a.p[2] + a.n[2] * 0.012], 0.06, 16));
    parts.push(box([a.p[0] - 0.02, a.p[1] + a.n[1] * 0.07, a.p[2] + a.n[2] * 0.07], [0.12, 0.012, 0.1], 0, 0.3, Math.atan2(a.n[1], a.n[2])));
    // total-air-temperature probe (short strut with a scoop)
    const t = skinAt(7.6, 6.6, side);
    parts.push(box([t.p[0], t.p[1] + t.n[1] * 0.06, t.p[2] + t.n[2] * 0.06], [0.07, 0.03, 0.12], 0, 0, Math.atan2(t.n[1], t.n[2])));
  }
  return merge(parts);
}

/** SATCOM antenna fairing: a low elongated dome on the crown. */
function satcomRadome(quality: number): BufferGeometry {
  const len = 2.6;
  const h = 0.3;
  const prof: [number, number][] = [];
  const n = Math.max(10, Math.round(20 * quality));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    prof.push([t * len, Math.max(0.0005, h * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.7))]);
  }
  const g = orientOutward(lathe(prof, Math.max(16, Math.round(28 * quality))));
  g.scale(1, 1, 2.2);
  const top = fuselagePoint(44.5, Math.PI / 2);
  g.translate(sx(44.5 + len) , top[1] - 0.02, 0);
  return g;
}

/** Ram-air inlets and outlets of the air-conditioning packs on the belly fairing (recessed). */
function packInlets(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const side of [1, -1] as const) {
    for (const [s, t, w, l] of [
      [36.2, 0.55, 0.45, 1.1],
      [41.5, 0.62, 0.35, 0.8],
    ] as const) {
      const p = bellyFairingPoint(s, t, side);
      parts.push(box([sx(s), p[1] - 0.004, p[2]], [l, 0.01, w]));
    }
  }
  return merge(parts);
}

export function buildAirframe(quality: number): Group {
  const root = group('airframe', [], 'fuselage');
  root.add(mesh('fuselage_skin', buildFuselageSkin({ rows: Math.round(240 * quality), around: Math.round(112 * quality) }), 'paint', 'fuselage'));
  root.add(mesh('belly_fairing_R', buildBellyFairing(1, Math.round(60 * quality), Math.round(28 * quality)), 'paintBelly', 'bellyFairing'));
  root.add(mesh('belly_fairing_L', buildBellyFairing(-1, Math.round(60 * quality), Math.round(28 * quality)), 'paintBelly', 'bellyFairing'));

  const win = buildWindows();
  root.add(mesh('cabin_window_frames', win.frames, 'seal', 'cabinWindows'));
  root.add(mesh('cabin_windows', win.glass, 'window', 'cabinWindows'));
  const ck = buildCockpitGlazing();
  root.add(mesh('cockpit_window_frames', ck.frames, 'seal', 'cockpitWindows'));
  root.add(mesh('cockpit_windows', ck.glass, 'glass', 'cockpitWindows'));

  const doors = group('doors');
  for (const d of [...passengerDoors(), ...cargoDoors()]) doors.add(doorNode(d));
  root.add(doors);

  root.add(mesh('apu_exhaust', apuExhaust(), 'exhaust', 'apu'));
  const antennas = merge([blade(14.5, true), blade(27.0, true, 0.32, 0.45), blade(46.5, true, 0.36), blade(11.0, false), blade(33.0, false, 0.3, 0.45)]);
  root.add(mesh('antennas', merge([antennas, satcomRadome(quality)]), 'composite', 'antennas'));
  root.add(mesh('air_data_probes', airDataProbes(), 'metal', 'antennas'));
  root.add(mesh('pack_inlets', packInlets(), 'seal', 'bellyFairing'));
  return root;
}
