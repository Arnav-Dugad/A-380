/**
 * Scene-graph helpers for the aircraft generator. Every mesh carries a `partId` (links to
 * the part catalogue) and a material key; articulated parts sit under a pivot group whose
 * origin is the hinge point and whose userData describes the allowed motion.
 */
import { Group, Mesh, MeshStandardMaterial, type BufferGeometry, type Object3D } from 'three';
import type { Vec3 } from './math';

export type MaterialKey =
  | 'livery' // fuselage skin and doors: the painted fuselage atlas
  | 'wingSkin' // every wing panel: the painted wing atlas
  | 'nacelle' // fan cowls and reverser sleeves: the nacelle atlas
  | 'tailSkin' // stabiliser, elevators, fin and rudder: the tail atlas
  | 'liner' // acoustic liner inside the engine inlet
  | 'spinner' // fan spinner with its painted spiral
  | 'lens' // clear light covers
  | 'paint' // other painted skin
  | 'paintBelly' // grey composite belly & wing lower surfaces
  | 'paintTail' // livery colour on the fin
  | 'composite' // fairings, control-surface composite
  | 'leadingEdge' // bare aluminium leading edges / inlet lips
  | 'metal' // brushed metal
  | 'darkMetal' // axles, actuators, brackets
  | 'gearPaint' // painted landing-gear structure (light grey)
  | 'inletLip' // polished aluminium engine inlet lip
  | 'chrome' // shock-absorber sliding tubes
  | 'tyre'
  | 'hub'
  | 'glass' // cockpit glazing
  | 'window' // cabin windows
  | 'seal' // door/window rubber seals and gaps
  | 'fan' // titanium fan blades
  | 'inlet' // nacelle inner duct
  | 'exhaust' // hot-section metal
  | 'lightRed'
  | 'lightGreen'
  | 'lightWhite'
  | 'lightAmber'
  | 'cabinWall'
  | 'cabinFloor'
  | 'carpet'
  | 'seatFabric'
  | 'seatFabricBiz'
  | 'seatFabricFirst'
  | 'leather'
  | 'ifeScreen' // seat-back entertainment screens
  | 'bezel' // window reveals and trim (moulded plastic)
  | 'plastic'
  | 'galley'
  | 'cockpitPanel'
  | 'cockpitTrim'
  | 'screen'
  | 'structure'
  | 'cargo'
  | 'emissiveCabin';

const cache = new Map<MaterialKey, MeshStandardMaterial>();
/** Placeholder material carrying only the key; runtime substitutes the full PBR library. */
export function mat(key: MaterialKey): MeshStandardMaterial {
  let m = cache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({ name: key });
    cache.set(key, m);
  }
  return m;
}

export interface Articulation {
  kind: 'hinge' | 'slide' | 'spin' | 'door';
  /** rotation axis in the parent frame (unit) */
  axis?: Vec3;
  /** translation direction at full travel (parent frame, metres) */
  travel?: Vec3;
  /** deflection limits in degrees */
  min?: number;
  max?: number;
}

export function mesh(name: string, geometry: BufferGeometry, material: MaterialKey, partId?: string): Mesh {
  const m = new Mesh(geometry, mat(material));
  m.name = name;
  if (partId) m.userData.partId = partId;
  return m;
}

export function group(name: string, children: Object3D[] = [], partId?: string): Group {
  const g = new Group();
  g.name = name;
  if (partId) g.userData.partId = partId;
  for (const c of children) g.add(c);
  return g;
}

/**
 * Wrap geometry in a pivot group positioned at `pivot`. The geometry is translated so it
 * stays in place; rotating the pivot then rotates the part about the hinge.
 */
export function pivoted(
  name: string,
  pivot: Vec3,
  children: Object3D[],
  articulation: Articulation,
  partId?: string,
): Group {
  const g = group(name, [], partId);
  g.position.set(pivot[0], pivot[1], pivot[2]);
  g.userData.articulation = articulation;
  for (const c of children) {
    if (c instanceof Mesh) {
      c.geometry.translate(-pivot[0], -pivot[1], -pivot[2]);
    } else {
      c.position.set(c.position.x - pivot[0], c.position.y - pivot[1], c.position.z - pivot[2]);
    }
    g.add(c);
  }
  return g;
}

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
