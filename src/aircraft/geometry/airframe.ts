/**
 * Fuselage assembly: skin, belly fairing, cabin windows, passenger & cargo doors,
 * flight-deck glazing, tail cone / APU exhaust and external details (antennas, probes, lights).
 */
import { BufferAttribute, BufferGeometry as BufferGeometryCtor, type BufferGeometry, type Group } from 'three';
import { DOORS, L, MAIN_DECK_FLOOR, UPPER_DECK_FLOOR, sx } from './layout';
import {
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
        glass.push(conformalShape(side, s, deck.y, glassOutline, 0.006, 1));
        frames.push(conformalShape(side, s, deck.y, frameOutline, 0.003, 1));
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
      glass.push(patchSTheta(p, 0.012, 8, 8));
      frames.push(patchSTheta(grow(p, 0.06, deg(1.6)), 0.006, 8, 8));
    }
  }
  return { glass: merge(glass), frames: merge(frames) };
}

function doorNode(d: DoorInfo): Group {
  const n = Math.round(((d.w + d.h) * 2) / 0.06);
  const outline = resample(roundedRect(d.w, d.h, d.deck === 'cargo' ? 0.12 : 0.2, 5), n);
  const seal = resample(roundedRect(d.w + 0.06, d.h + 0.06, d.deck === 'cargo' ? 0.14 : 0.23, 5), n);
  const panel = conformalShape(d.side, d.s, d.y, outline, 0.012, 8);
  const sealGeo = conformalShape(d.side, d.s, d.y, seal, 0.005, 8);
  const centre = surfaceAt(d.side, d.s, d.y, 0);
  const partId = d.deck === 'cargo' ? 'cargoDoor' : 'passengerDoor';
  const g = group(`door_${d.id}`, [mesh(`door_${d.id}_opening`, sealGeo, 'seal', partId)], partId);
  if (d.deck === 'cargo') {
    // Upward-opening, hinged along the top edge.
    const hingePt = surfaceAt(d.side, d.s, d.y + d.h / 2, 0.012);
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
  g.translate(tip[0] - 0.0, cy, 0);
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
  root.add(mesh('antennas', antennas, 'composite', 'antennas'));
  return root;
}
