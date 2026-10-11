/**
 * Single authority for per-mesh material overrides. Combines, in order:
 *   isolation (ghost everything outside the chosen system layer)
 *   → X-ray (translucent outer skin)
 *   → hover / selection highlight.
 * Variants are cached per base material, so toggling modes never allocates per frame.
 */
import { Color, DoubleSide, Mesh, MeshStandardMaterial, type Material } from 'three';
import { PARTS } from '../data/parts';
import type { SystemLayer } from '../state/ui';
import type { AircraftRig } from './rig';

const ICE = new Color('#6fd3ef');
const cache = new Map<string, Material>();

/** Parts that form the outer skin and become translucent in X-ray mode. */
export const SKIN_PARTS = new Set(['fuselage', 'bellyFairing', 'wing', 'htp', 'vtp', 'fanCowl', 'engineInlet', 'thrustReverser', 'pylon', 'cabinWindows', 'cockpitWindows', 'passengerDoor', 'cargoDoor', 'gearDoor', 'slat', 'droopNose', 'flap', 'aileron', 'spoiler', 'elevator', 'rudder', 'flapTrackFairing', 'wingtipFence', 'antennas', 'apu', 'engineCore']);

function variant(base: Material, mode: string, make: (m: MeshStandardMaterial) => void): Material {
  const key = `${base.uuid}:${mode}`;
  let v = cache.get(key);
  if (!v) {
    v = base.clone();
    v.clippingPlanes = base.clippingPlanes; // keep sharing the live section planes
    if (v instanceof MeshStandardMaterial) make(v);
    cache.set(key, v);
  }
  return v;
}

const ghost = (base: Material) =>
  variant(base, 'ghost', (m) => {
    m.transparent = true;
    m.opacity = 0.07;
    m.depthWrite = false;
    m.color = new Color('#9fb3c4');
    m.map = null;
    m.emissive = new Color('#1b2833');
  });

const xray = (base: Material, opacity: number) =>
  variant(base, `xray:${opacity.toFixed(2)}`, (m) => {
    m.transparent = true;
    m.opacity = opacity;
    m.depthWrite = false;
    m.side = DoubleSide;
    m.color = new Color('#cfe9f5');
    m.map = null;
    m.emissive = new Color('#0f2a36');
    m.emissiveIntensity = 1;
  });

const highlight = (base: Material, mode: 'hover' | 'select') =>
  variant(base, mode, (m) => {
    m.emissive = ICE.clone();
    m.emissiveIntensity = (m.transparent ? 2 : 1) * (mode === 'select' ? 0.38 : 0.16);
  });

export interface MaterialModes {
  isolate: SystemLayer;
  xray: boolean;
  skinOpacity: number;
  hover: Set<Mesh>;
  selected: Set<Mesh>;
}

export function applyMaterialModes(rig: AircraftRig, modes: MaterialModes): void {
  for (const mesh of rig.meshes) {
    const base = mesh.userData.baseMaterial as Material | undefined;
    if (!base) continue;
    const partId = mesh.userData.partId as string | undefined;
    const layer = partId ? PARTS[partId]?.layer : undefined;
    let m: Material = base;
    let hidden = false;
    if (modes.isolate !== 'none' && layer !== modes.isolate) {
      m = ghost(base);
      hidden = true;
    } else if (modes.xray && partId && SKIN_PARTS.has(partId)) {
      m = xray(base, modes.skinOpacity);
    }
    if (modes.selected.has(mesh)) m = highlight(m, 'select');
    else if (modes.hover.has(mesh) && !hidden) m = highlight(m, 'hover');
    mesh.material = m;
    // translucent meshes should not cast hard shadows
    mesh.castShadow = !(m as MeshStandardMaterial).transparent && mesh.userData.baseCastShadow !== false;
    mesh.renderOrder = (m as MeshStandardMaterial).transparent ? 2 : 0;
  }
}
