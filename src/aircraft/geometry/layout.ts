/**
 * Geometric layout of the A380-800 model, in metres.
 *
 * Conventions (three.js, Y-up):
 *   - Fuselage station `s` is measured aft from the nose tip (0 → 72.72 m).
 *   - Model X = X_REF − s, so +X points forward and the aircraft is centred lengthwise.
 *   - Y is height above the ground plane with the aircraft resting on its gear.
 *   - +Z is the starboard (right) side.
 *
 * Values marked [V] are published Airbus figures (see docs/RESEARCH.md).
 * Values marked [A] are engineering approximations derived from the Airbus three-view
 * drawings and photographs; they are tuned for visual proportion, not certified data.
 */
import { deg } from './math';

export const L = 72.72; // [V] overall length
export const SPAN = 79.75; // [V] wing span
export const HEIGHT = 24.09; // [V] overall height
export const FUS_W = 7.14; // [V] fuselage max external width
export const FUS_H = 8.41; // [V] fuselage max external height

export const X_REF = 36.0; // model X origin roughly at the aircraft's centre of length
export const sx = (s: number): number => X_REF - s;

/** Constant-section fuselage */
export const FUS_BOTTOM = 2.0; // [A] keel height above ground
export const FUS_TOP = FUS_BOTTOM + FUS_H;
export const FUS_WIDEST_Y = 6.15; // [A] height of maximum breadth (just above the main deck floor)

export const MAIN_DECK_FLOOR = 5.1; // [A] main deck floor height above ground
export const UPPER_DECK_FLOOR = 7.85; // [A] upper deck floor height above ground
export const COCKPIT_FLOOR = 6.35; // [A] flight deck sits between the decks

/** Wing planform (starboard). z is spanwise from aircraft centreline. */
export const WING = {
  rootZ: 2.6, // inside the belly fairing
  tipZ: SPAN / 2,
  kinkZ: 14.0, // [A] trailing-edge kink
  // [A] leading edge: station at root and tip
  leRoot: 27.2,
  leTip: 54.2,
  // [A] trailing edge at root, kink and tip
  teRoot: 45.0,
  teKink: 47.55,
  teTip: 58.0,
  dihedral: deg(6.0), // [A]
  rootY: 3.95, // [A] chord-plane height at the root
  incidenceRoot: deg(3.2), // [A] includes washout distribution
  incidenceTip: deg(-0.8),
  tcRoot: 0.135, // [A] thickness / chord
  tcKink: 0.105,
  tcTip: 0.082,
} as const;

/** Engines: spanwise position of the nacelle centreline [A, scaled from three-view]. */
export const ENGINES = [
  { id: 'eng1', index: 1, side: -1 as const, z: 25.7, reverser: false },
  { id: 'eng2', index: 2, side: -1 as const, z: 14.5, reverser: true },
  { id: 'eng3', index: 3, side: 1 as const, z: 14.5, reverser: true },
  { id: 'eng4', index: 4, side: 1 as const, z: 25.7, reverser: false },
] as const;

export const NACELLE = {
  length: 6.6, // [A] inlet lip to fan-cowl/thrust-reverser trailing edge
  maxRadius: 1.86, // [A]
  fanRadius: 1.473, // [V] Trent 900 fan diameter 2.95 m
  inletForward: 3.6, // [A] inlet lip ahead of local wing leading edge
  topGap: 0.22, // [A] clearance between nacelle crown and wing lower surface at the nacelle trailing edge
  fanBlades: 24, // [V] Trent 900 swept wide-chord fan
};

/** Horizontal tailplane (starboard half) */
export const HTP = {
  rootZ: 1.2,
  tipZ: 15.2, // [V-derived] span ≈ 30.4 m
  leRoot: 59.6,
  leTip: 68.6,
  chordRoot: 10.4,
  chordTip: 3.3,
  rootY: 7.45,
  dihedral: deg(5.5),
  tc: 0.1,
};

/** Vertical tailplane */
export const VTP = {
  rootY: 9.6,
  tipY: HEIGHT - 0.12,
  leRoot: 54.0,
  leTip: 66.4,
  chordRoot: 15.4,
  chordTip: 5.0,
  tc: 0.11,
};

/** Landing gear positions (stations are the axle/bogie centre). */
export const GEAR = {
  // [V] wheelbase 31.9 m (nose gear → main gear reference), wheel track 14.3 m (wing gears)
  nose: { s: 6.0, z: 0, wheelR: 0.635, tyreW: 0.36, track: 0.95 },
  wing: { s: 36.4, z: 7.15, wheelR: 0.715, tyreW: 0.42, axleSpan: 1.45, wheelTrack: 1.55 },
  body: { s: 39.6, z: 2.6, wheelR: 0.715, tyreW: 0.42, axleSpan: 1.6, wheelTrack: 1.55 },
};

/** Door stations (door centre) – see docs/ACCURACY.md for provenance. */
export const DOORS = {
  main: [
    { id: 'M1', s: 9.6 },
    { id: 'M2', s: 20.15 },
    { id: 'M3', s: 31.55 },
    { id: 'M4', s: 45.3 },
    { id: 'M5', s: 55.95 },
  ],
  upper: [
    { id: 'U1', s: 16.3 },
    { id: 'U2', s: 37.9 },
    { id: 'U3', s: 52.6 },
  ],
  passengerW: 1.07,
  passengerH: 1.93,
  cargo: [
    { id: 'FWD_CARGO', s: 16.6, w: 2.7, h: 1.7 },
    { id: 'AFT_CARGO', s: 51.0, w: 2.7, h: 1.7 },
    { id: 'BULK', s: 56.8, w: 0.95, h: 1.15 },
  ],
};
