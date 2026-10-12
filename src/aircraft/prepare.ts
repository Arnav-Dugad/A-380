import { Mesh, type Material, type Object3D } from 'three';
import { ensureAOAttribute, withBakedAO } from './bakedAO';
import { getMaterials } from './materials';

const NO_SHADOW = new Set(['cabin_windows', 'cabin_window_frames', 'cockpit_windows', 'cockpit_window_frames']);

/** Swap GLB placeholder materials for the shared PBR library and configure shadows. */
export function prepareScene(root: Object3D, opts: { shadows?: boolean } = {}): void {
  const lib = getMaterials() as unknown as Record<string, Material>;
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    if (o.userData.baseMaterial) return; // already prepared (cached GLTF)
    const key = (o.material as Material).name;
    const replacement = o.name === 'fuselage_skin' ? lib.livery : lib[key];
    if (replacement) o.material = replacement;
    withBakedAO(o.material as Material);
    ensureAOAttribute(o);
    o.userData.baseMaterial = o.material;
    o.castShadow = (opts.shadows ?? true) && !NO_SHADOW.has(o.name);
    o.userData.baseCastShadow = o.castShadow;
    o.receiveShadow = true;
  });
}
