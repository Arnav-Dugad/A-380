/**
 * Cutaway section planes. Two shared planes (longitudinal and horizontal) are attached to
 * every aircraft material; a disabled plane is pushed far away instead of being removed,
 * so toggling sections never triggers shader recompilation.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { DoubleSide, FrontSide, Plane, Vector3, type Material } from 'three';
import { useUI } from '../state/ui';
import { L, HEIGHT, X_REF } from './geometry/layout';
import { getMaterials } from './materials';
import { getRig, onRig } from './rig';

const FAR = 1e5;
export const longitudinal = new Plane(new Vector3(-1, 0, 0), FAR);
export const horizontal = new Plane(new Vector3(0, -1, 0), FAR);
const PLANES = [longitudinal, horizontal];
const SKIN_KEYS = ['livery', 'paint', 'paintBelly', 'paintTail', 'composite', 'leadingEdge'];

function attach(m: Material | Material[]) {
  for (const mm of Array.isArray(m) ? m : [m]) if (mm.clippingPlanes !== PLANES) mm.clippingPlanes = PLANES;
}

function attachAll() {
  for (const m of Object.values(getMaterials())) attach(m);
  const rig = getRig();
  if (rig) for (const mesh of rig.meshes) attach(mesh.material);
}

let doubleSided = false;
export function SectionPlanes() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.localClippingEnabled = true;
    attachAll();
    return onRig(() => attachAll());
  }, [gl]);
  useFrame(() => {
    const { clip, clipVertical } = useUI.getState().xray;
    // clip: fraction of fuselage length from the nose that is cut away
    longitudinal.constant = clip > 0 ? X_REF - clip * L : FAR;
    horizontal.constant = clipVertical > 0 ? HEIGHT * (1 - clipVertical) : FAR;
    const want = clip > 0 || clipVertical > 0;
    if (want !== doubleSided) {
      doubleSided = want;
      const lib = getMaterials() as unknown as Record<string, Material>;
      for (const k of SKIN_KEYS) {
        const m = lib[k]!;
        m.side = want ? DoubleSide : FrontSide;
        m.needsUpdate = true;
      }
      attachAll();
    }
    // Variants created after attachment inherit planes from their base via clone().
  });
  return null;
}
