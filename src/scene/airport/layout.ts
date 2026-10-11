/**
 * Fictional international airport ("Digital Twin International", code DTX).
 * World frame: +X east, +Y up, +Z south. Runway 09/27 lies on z = 0 from x = 0 to 4,000 m.
 */
export const RWY = { length: 4000, width: 60, x0: 0, heading: 90 };
export const TWY_Z = -190; // parallel taxiway
export const TWY_CONNECTORS = [150, 1100, 2000, 2900, 3850];
export const APRON = { x0: 1450, x1: 2650, z0: -330, z1: -690 };
export const TERMINAL = { x0: 1350, x1: 2750, z: -720, depth: 60, height: 26 };
export const TOWER = { x: 2900, z: -560 };
/** Contact stand for the A380 (nose-in, heading north). Position is the aircraft model origin. */
export const STAND = { x: 2000, z: -640, heading: 0 };
/** Holding point / runway 09 threshold start positions for the flight scenarios. */
export const START = {
  threshold09: { x: 180, z: 0, heading: 90 },
  hold09: { x: 150, z: -150, heading: 180 },
};
