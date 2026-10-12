import { Matrix4, Vector3, type Group } from 'three';

/**
 * Shared render-frame bookkeeping. In explore modes the aircraft sits at the render origin
 * on its stand; in flight mode the render origin follows the aircraft horizontally
 * (floating origin) and the world group is shifted by −origin.
 */
export const worldFrame = {
  world: null as Group | null,
  aircraft: null as Group | null,
  /** absolute world X/Z of the render origin (flight mode) */
  origin: new Vector3(),
  /** aircraft CG in render coordinates (shadow camera centre, chase camera target) */
  aircraftRenderPos: new Vector3(0, 5, 0),
  /** aircraft pose relative to its stand during a pushback (identity when parked) */
  push: new Matrix4(),
};
